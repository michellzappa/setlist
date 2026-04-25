"""Tasks — one-off intentional work, modelled on Things 3.

Source of truth on disk:
  Tasks/Areas.yaml                       — ordered list of evergreen areas
  Tasks/Projects/{project-id}.md         — one file per project (finite outcome)
  Tasks/Items/{YYYY}/{MM}/{task-id}.md   — one file per task

Tasks are mutable long-lived items, not events. Status, scheduled date, and the
`today` flag flip on the same file. Filename is set at creation and never
renamed — keeps git history readable and references stable.

Views are derived per request; no event replay. The "Today is a verb" rule
means scheduled-for-today tasks DO NOT auto-promote to Today — they appear in
a separate "scheduled earlier" review block, and the user accepts each one.
The lazy daily cleanup (see _cleanup_stale_today) demotes `today: true` from
prior calendar days on first list-load of a new day.
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.io import atomic_write_text
from api.parsing import FRONTMATTER_RE, _extract_frontmatter, _normalize_date, _slugify
from api.paths import TASKS_AREAS_PATH, TASKS_EVENTS_DIR, TASKS_ITEMS_DIR, TASKS_PROJECTS_DIR

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


# ── Areas ────────────────────────────────────────────────────────────────


def _load_areas() -> List[Dict[str, Any]]:
    if not TASKS_AREAS_PATH.exists():
        return []
    try:
        raw = yaml.safe_load(TASKS_AREAS_PATH.read_text(encoding="utf-8")) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Tasks/Areas.yaml failed to parse: %s", exc)
        return []
    items = raw.get("areas") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        aid = str(item.get("id") or "").strip().lower()
        title = str(item.get("title") or "").strip()
        if not aid or not title:
            continue
        emoji = str(item.get("emoji") or "").strip()
        out.append({"id": aid, "title": title, "emoji": emoji})
    return out


def _save_areas(areas: List[Dict[str, Any]]) -> None:
    TASKS_AREAS_PATH.parent.mkdir(parents=True, exist_ok=True)
    body = yaml.safe_dump({"areas": areas}, sort_keys=False, allow_unicode=True)
    atomic_write_text(TASKS_AREAS_PATH, body)


# ── Projects ─────────────────────────────────────────────────────────────


def _project_path(project_id: str) -> Path:
    return TASKS_PROJECTS_DIR / f"{project_id}.md"


def _parse_project(p: Path) -> Optional[Dict[str, Any]]:
    try:
        raw = p.read_text(encoding="utf-8")
        fm = _extract_frontmatter(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("project %s failed to parse: %s", p.name, exc)
        return None
    pid = str(fm.get("id") or "").strip().lower()
    title = str(fm.get("title") or "").strip()
    if not pid or not title:
        return None
    m = FRONTMATTER_RE.match(raw)
    body = raw[m.end():].strip() if m else ""
    return {
        "id": pid,
        "title": title,
        "status": str(fm.get("status") or "active"),
        "area": (str(fm.get("area")).strip().lower() if fm.get("area") else None) or None,
        "created": _normalize_date(fm.get("created")),
        "completed_at": _normalize_completed_at(fm.get("completed_at")),
        "notes": body or None,
    }


def _load_projects() -> List[Dict[str, Any]]:
    if not TASKS_PROJECTS_DIR.exists():
        return []
    out: List[Dict[str, Any]] = []
    for path in sorted(TASKS_PROJECTS_DIR.glob("*.md")):
        parsed = _parse_project(path)
        if parsed is not None:
            out.append(parsed)
    return out


def _write_project(project: Dict[str, Any]) -> Path:
    TASKS_PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    path = _project_path(project["id"])
    fm = {
        "id": project["id"],
        "title": project["title"],
        "status": project.get("status", "active"),
        "section": "tasks",
    }
    if project.get("area"):
        fm["area"] = project["area"]
    if project.get("created"):
        fm["created"] = date.fromisoformat(project["created"])
    if project.get("completed_at"):
        fm["completed_at"] = project["completed_at"]
    body = "---\n" + yaml.safe_dump(fm, sort_keys=False, allow_unicode=True) + "---\n"
    notes = (project.get("notes") or "").strip()
    if notes:
        body += "\n" + notes + "\n"
    atomic_write_text(path, body)
    return path


# ── Tasks ────────────────────────────────────────────────────────────────


def _task_dir_for_id(task_id: str) -> Path:
    """Tasks live under Items/{YYYY}/{MM}/ where YYYY-MM is parsed from the
    leading {YYYYMMDD} in the id. Falls back to Items/ flat if the id doesn't
    match (defensive — IDs created by /create always do)."""
    if len(task_id) >= 8 and task_id[:8].isdigit():
        return TASKS_ITEMS_DIR / task_id[:4] / task_id[4:6]
    return TASKS_ITEMS_DIR


def _task_path_for_id(task_id: str) -> Path:
    return _task_dir_for_id(task_id) / f"{task_id}.md"


def _find_task_path(task_id: str) -> Optional[Path]:
    """Look up a task file. Tries the sharded path first (cheap); falls back to
    a recursive scan in case the file lives elsewhere under Items/."""
    expected = _task_path_for_id(task_id)
    if expected.exists():
        return expected
    if not TASKS_ITEMS_DIR.exists():
        return None
    for path in TASKS_ITEMS_DIR.rglob(f"{task_id}.md"):
        return path
    return None


def _normalize_completed_at(value: Any) -> Optional[str]:
    """YAML deserialises ISO timestamps to datetime objects when they parse —
    coerce to a stable ISO-8601 string so downstream comparisons work."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _parse_task(p: Path) -> Optional[Dict[str, Any]]:
    try:
        raw = p.read_text(encoding="utf-8")
        fm = _extract_frontmatter(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("task %s failed to parse: %s", p.name, exc)
        return None
    tid = str(fm.get("id") or "").strip().lower()
    title = str(fm.get("title") or "").strip()
    if not tid or not title:
        return None
    m = FRONTMATTER_RE.match(raw)
    body = raw[m.end():].strip() if m else ""
    today_raw = fm.get("today")
    return {
        "id": tid,
        "title": title,
        "status": str(fm.get("status") or "open"),
        "created": _normalize_date(fm.get("created")),
        "scheduled": _normalize_date(fm.get("scheduled")),
        "today": bool(today_raw) if today_raw is not None else False,
        "today_set_on": _normalize_date(fm.get("today_set_on")),
        "completed_at": _normalize_completed_at(fm.get("completed_at")),
        "area": (str(fm.get("area")).strip().lower() if fm.get("area") else None) or None,
        "project": (str(fm.get("project")).strip().lower() if fm.get("project") else None) or None,
        "notes": body or None,
        "_path": str(p),
    }


def _load_tasks() -> List[Dict[str, Any]]:
    if not TASKS_ITEMS_DIR.exists():
        return []
    out: List[Dict[str, Any]] = []
    for path in TASKS_ITEMS_DIR.rglob("*.md"):
        parsed = _parse_task(path)
        if parsed is not None:
            out.append(parsed)
    return out


def _write_task(task: Dict[str, Any]) -> Path:
    """Write a task to disk. Existing files are preserved at their original
    location (never moved). New files use the sharded path."""
    existing = _find_task_path(task["id"])
    path = existing or _task_path_for_id(task["id"])
    path.parent.mkdir(parents=True, exist_ok=True)

    fm: Dict[str, Any] = {
        "id": task["id"],
        "title": task["title"],
        "status": task.get("status", "open"),
        "section": "tasks",
    }
    if task.get("created"):
        fm["created"] = date.fromisoformat(task["created"])
    if task.get("scheduled"):
        fm["scheduled"] = date.fromisoformat(task["scheduled"])
    if task.get("today"):
        fm["today"] = True
        if task.get("today_set_on"):
            fm["today_set_on"] = date.fromisoformat(task["today_set_on"])
    if task.get("completed_at"):
        fm["completed_at"] = task["completed_at"]
    if task.get("area"):
        fm["area"] = task["area"]
    if task.get("project"):
        fm["project"] = task["project"]

    body = "---\n" + yaml.safe_dump(fm, sort_keys=False, allow_unicode=True) + "---\n"
    notes = (task.get("notes") or "").strip()
    if notes:
        body += "\n" + notes + "\n"
    atomic_write_text(path, body)
    return path


def _cleanup_stale_today(tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Demote `today: true` on tasks where the flag was set on a prior calendar
    day and the task is still open. Idempotent — runs cheaply on every list
    load. After cleanup the task either re-surfaces in the scheduled-earlier
    review block (if it had a `scheduled` date in the past) or quietly returns
    to Anytime / Upcoming."""
    today_iso = date.today().isoformat()
    changed = False
    for t in tasks:
        if not t.get("today"):
            continue
        if t.get("status") != "open":
            continue
        set_on = t.get("today_set_on")
        if set_on and set_on >= today_iso:
            continue
        # Stale: flip it off in memory and on disk.
        t["today"] = False
        t["today_set_on"] = None
        try:
            _write_task(t)
            changed = True
        except Exception as exc:  # noqa: BLE001
            logger.warning("failed to clean stale today on %s: %s", t.get("id"), exc)
    if changed:
        logger.info("tasks: cleaned stale today flags on first load of %s", today_iso)
    return tasks


# ── View helpers ─────────────────────────────────────────────────────────


def _view_today(tasks: List[Dict[str, Any]], today_iso: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Return (accepted_today, scheduled_earlier_review).

    accepted_today: open tasks the user has explicitly pulled into Today.
    scheduled_earlier_review: open, undated-as-today tasks whose scheduled
    date is on or before today — surfaced for manual triage."""
    accepted: List[Dict[str, Any]] = []
    review: List[Dict[str, Any]] = []
    for t in tasks:
        if t.get("status") != "open":
            continue
        if t.get("today"):
            accepted.append(t)
            continue
        scheduled = t.get("scheduled")
        if scheduled and scheduled <= today_iso:
            review.append(t)
    accepted.sort(key=lambda t: (t.get("scheduled") or "", t.get("created") or ""))
    review.sort(key=lambda t: (t.get("scheduled") or "", t.get("created") or ""))
    return accepted, review


def _view_inbox(tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Inbox is implicit: open tasks with no area, no project, no scheduled
    date, and not flagged today. The capture pile."""
    out = [
        t for t in tasks
        if t.get("status") == "open"
        and not t.get("area")
        and not t.get("project")
        and not t.get("scheduled")
        and not t.get("today")
    ]
    out.sort(key=lambda t: t.get("created") or "", reverse=True)
    return out


def _view_upcoming(tasks: List[Dict[str, Any]], today_iso: str) -> List[Dict[str, Any]]:
    out = [
        t for t in tasks
        if t.get("status") == "open"
        and t.get("scheduled")
        and t["scheduled"] > today_iso
    ]
    out.sort(key=lambda t: (t["scheduled"], t.get("created") or ""))
    return out


def _view_anytime(tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Active work that has an area or project but no scheduled date — the
    "I'll get to it" pile that's still committed to a context."""
    out = [
        t for t in tasks
        if t.get("status") == "open"
        and not t.get("scheduled")
        and (t.get("area") or t.get("project"))
    ]
    out.sort(key=lambda t: (t.get("project") or "", t.get("area") or "", t.get("created") or ""))
    return out


def _view_someday(tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = [t for t in tasks if t.get("status") == "someday"]
    out.sort(key=lambda t: t.get("created") or "", reverse=True)
    return out


def _view_logbook(tasks: List[Dict[str, Any]], days: int) -> List[Dict[str, Any]]:
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    out = [
        t for t in tasks
        if t.get("status") in ("done", "cancelled")
        and (t.get("completed_at") or "")[:10] >= cutoff
    ]
    out.sort(key=lambda t: t.get("completed_at") or "", reverse=True)
    return out


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get("/list")
def tasks_list(view: str = "today", area: Optional[str] = None, project: Optional[str] = None, days: int = 90) -> Dict[str, Any]:
    """Derived view over all tasks.

    Always runs the lazy stale-today cleanup before deriving views, so the
    first load of a new calendar day silently demotes prior-day Today flags.
    """
    today_iso = date.today().isoformat()
    tasks = _cleanup_stale_today(_load_tasks())

    # Optional area/project filter applies to all views except logbook.
    def matches(t: Dict[str, Any]) -> bool:
        if area and t.get("area") != area.lower():
            return False
        if project and t.get("project") != project.lower():
            return False
        return True

    filtered = [t for t in tasks if matches(t)]

    if view == "today":
        accepted, review = _view_today(filtered, today_iso)
        items: List[Dict[str, Any]] = accepted
        return {
            "view": view,
            "today": today_iso,
            "items": [_strip_internal(t) for t in items],
            "review": [_strip_internal(t) for t in review],
        }
    if view == "inbox":
        items = _view_inbox(filtered)
    elif view == "upcoming":
        items = _view_upcoming(filtered, today_iso)
    elif view == "anytime":
        items = _view_anytime(filtered)
    elif view == "someday":
        items = _view_someday(filtered)
    elif view == "logbook":
        items = _view_logbook(filtered, days)
    elif view == "all":
        items = sorted(filtered, key=lambda t: t.get("created") or "", reverse=True)
    else:
        raise HTTPException(status_code=400, detail=f"unknown view: {view}")

    return {
        "view": view,
        "today": today_iso,
        "items": [_strip_internal(t) for t in items],
    }


def _strip_internal(t: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in t.items() if not k.startswith("_")}


# ── Events log ───────────────────────────────────────────────────────────
# Append-only audit log feeding the weekly reflection histogram. Each line
# is a JSON object: {ts, date, action, task_id, area?, project?}. Sharded by
# month so the file stays small and grep-friendly.
#
# Actions:
#   "made"       — task created (POST /create)
#   "done"       — task completed (POST /complete)
#   "cancelled"  — task cancelled (POST /cancel)
#   "deferred"   — task scheduled to a future date OR moved to Someday.
#                  This is the Things-y "I'm not doing this now" signal —
#                  worth tracking separately from "made" or "done".
#   "today"      — pulled into Today (the verb)


def _events_log_path(day_iso: str) -> Path:
    return TASKS_EVENTS_DIR / f"{day_iso[:7]}.jsonl"


def _log_event(action: str, task: Dict[str, Any], extra: Optional[Dict[str, Any]] = None) -> None:
    """Append one event line. Failures are logged but never raised — the
    audit log is best-effort and must not block a successful mutation."""
    try:
        TASKS_EVENTS_DIR.mkdir(parents=True, exist_ok=True)
        now = datetime.now()
        day_iso = now.strftime("%Y-%m-%d")
        record: Dict[str, Any] = {
            "ts": now.strftime("%Y-%m-%dT%H:%M:%S"),
            "date": day_iso,
            "action": action,
            "task_id": task.get("id"),
            "area": task.get("area"),
            "project": task.get("project"),
        }
        if extra:
            record.update(extra)
        with _events_log_path(day_iso).open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:  # noqa: BLE001
        logger.warning("failed to log task event %s for %s: %s", action, task.get("id"), exc)


def _load_events(since_day: str) -> List[Dict[str, Any]]:
    """Load events with date >= since_day. Reads only the months that could
    contain matching events, so a 30-day window touches 1–2 files at most."""
    if not TASKS_EVENTS_DIR.exists():
        return []
    out: List[Dict[str, Any]] = []
    today = date.today()
    try:
        cutoff = date.fromisoformat(since_day)
    except ValueError:
        cutoff = today
    cur = date(cutoff.year, cutoff.month, 1)
    while cur <= today:
        path = TASKS_EVENTS_DIR / f"{cur.year:04d}-{cur.month:02d}.jsonl"
        if path.exists():
            try:
                for line in path.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if rec.get("date") and rec["date"] >= since_day:
                        out.append(rec)
            except Exception as exc:  # noqa: BLE001
                logger.warning("events log %s failed to read: %s", path.name, exc)
        # next month
        if cur.month == 12:
            cur = date(cur.year + 1, 1, 1)
        else:
            cur = date(cur.year, cur.month + 1, 1)
    return out


@router.get("/counts")
def tasks_counts() -> Dict[str, Any]:
    """Summary counts for the sub-nav badges. Cheap single pass."""
    today_iso = date.today().isoformat()
    tasks = _cleanup_stale_today(_load_tasks())
    accepted, review = _view_today(tasks, today_iso)
    return {
        "today": today_iso,
        "today_count": len(accepted),
        "review_count": len(review),
        "inbox_count": len(_view_inbox(tasks)),
        "upcoming_count": len(_view_upcoming(tasks, today_iso)),
        "anytime_count": len(_view_anytime(tasks)),
        "someday_count": len(_view_someday(tasks)),
        "open_count": sum(1 for t in tasks if t.get("status") == "open"),
    }


@router.post("/create")
async def tasks_create(request: Request) -> Dict[str, Any]:
    """Create a new task.

    Body: {title (required), area?, project?, scheduled?, today?, notes?, status?}.
    The id is `{YYYYMMDD}-{slug(title)}` plus a numeric suffix on collision.
    """
    payload = await request.json()
    title = str(payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    today_iso = date.today().isoformat()
    base_id = f"{today_iso.replace('-', '')}-{_slugify(title.lower())}"
    base_id = re.sub(r"[^a-z0-9-]+", "-", base_id).strip("-")
    if not base_id:
        base_id = f"{today_iso.replace('-', '')}-task"

    # Collision-safe: if we already have an id today, append -2, -3, ...
    candidate = base_id
    n = 2
    while _find_task_path(candidate) is not None:
        candidate = f"{base_id}-{n}"
        n += 1
    task_id = candidate

    status = str(payload.get("status") or "open")
    if status not in ("open", "someday"):
        raise HTTPException(status_code=400, detail="status must be 'open' or 'someday'")

    today_flag = bool(payload.get("today"))

    task = {
        "id": task_id,
        "title": title,
        "status": status,
        "created": today_iso,
        "scheduled": _normalize_date(payload.get("scheduled")),
        "today": today_flag,
        "today_set_on": today_iso if today_flag else None,
        "area": _maybe_id(payload.get("area")),
        "project": _maybe_id(payload.get("project")),
        "notes": payload.get("notes") or None,
    }
    _write_task(task)
    _log_event("made", task)
    if status == "someday":
        _log_event("deferred", task, {"reason": "someday"})
    elif task["scheduled"] and task["scheduled"] > today_iso:
        _log_event("deferred", task, {"reason": "scheduled-future", "scheduled": task["scheduled"]})
    return {"ok": True, **_strip_internal(task)}


def _maybe_id(value: Any) -> Optional[str]:
    if not value:
        return None
    s = str(value).strip().lower()
    return s or None


@router.post("/update")
async def tasks_update(request: Request) -> Dict[str, Any]:
    """Patch any of: title, notes, scheduled (null-clears), area, project (null-clears)."""
    payload = await request.json()
    task_id = str(payload.get("id") or "").strip().lower()
    if not task_id:
        raise HTTPException(status_code=400, detail="id is required")
    path = _find_task_path(task_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"unknown task: {task_id}")

    task = _parse_task(path)
    if task is None:
        raise HTTPException(status_code=500, detail=f"task {task_id} failed to parse")

    if "title" in payload:
        title = str(payload.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="title cannot be empty")
        task["title"] = title
    if "notes" in payload:
        task["notes"] = (payload.get("notes") or None)
    if "scheduled" in payload:
        task["scheduled"] = _normalize_date(payload.get("scheduled"))
    if "area" in payload:
        task["area"] = _maybe_id(payload.get("area"))
    if "project" in payload:
        task["project"] = _maybe_id(payload.get("project"))

    _write_task(task)
    return {"ok": True, **_strip_internal(task)}


@router.post("/complete")
async def tasks_complete(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    task_id = str(payload.get("id") or "").strip().lower()
    if not task_id:
        raise HTTPException(status_code=400, detail="id is required")
    path = _find_task_path(task_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"unknown task: {task_id}")
    task = _parse_task(path) or {}
    task.update({
        "status": "done",
        "completed_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "today": False,
        "today_set_on": None,
    })
    _write_task(task)
    _log_event("done", task)
    return {"ok": True, **_strip_internal(task)}


@router.post("/uncomplete")
async def tasks_uncomplete(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    task_id = str(payload.get("id") or "").strip().lower()
    if not task_id:
        raise HTTPException(status_code=400, detail="id is required")
    path = _find_task_path(task_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"unknown task: {task_id}")
    task = _parse_task(path) or {}
    task.update({"status": "open", "completed_at": None})
    _write_task(task)
    return {"ok": True, **_strip_internal(task)}


@router.post("/cancel")
async def tasks_cancel(request: Request) -> Dict[str, Any]:
    """Cancel is a first-class peer of complete — preserves the moral
    distinction between 'done' and 'no longer doing'."""
    payload = await request.json()
    task_id = str(payload.get("id") or "").strip().lower()
    if not task_id:
        raise HTTPException(status_code=400, detail="id is required")
    path = _find_task_path(task_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"unknown task: {task_id}")
    task = _parse_task(path) or {}
    task.update({
        "status": "cancelled",
        "completed_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "today": False,
        "today_set_on": None,
    })
    _write_task(task)
    _log_event("cancelled", task)
    return {"ok": True, **_strip_internal(task)}


@router.post("/move-to-today")
async def tasks_move_to_today(request: Request) -> Dict[str, Any]:
    """Set or clear the `today` flag — the verb."""
    payload = await request.json()
    task_id = str(payload.get("id") or "").strip().lower()
    today_flag = bool(payload.get("today", True))
    if not task_id:
        raise HTTPException(status_code=400, detail="id is required")
    path = _find_task_path(task_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"unknown task: {task_id}")
    task = _parse_task(path) or {}
    today_iso = date.today().isoformat()
    task["today"] = today_flag
    task["today_set_on"] = today_iso if today_flag else None
    _write_task(task)
    if today_flag:
        _log_event("today", task)
    return {"ok": True, **_strip_internal(task)}


@router.post("/schedule")
async def tasks_schedule(request: Request) -> Dict[str, Any]:
    """Set or clear the `scheduled` date. Null/empty clears the schedule."""
    payload = await request.json()
    task_id = str(payload.get("id") or "").strip().lower()
    if not task_id:
        raise HTTPException(status_code=400, detail="id is required")
    path = _find_task_path(task_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"unknown task: {task_id}")
    task = _parse_task(path) or {}
    today_iso = date.today().isoformat()
    new_scheduled = _normalize_date(payload.get("scheduled"))
    prior_scheduled = task.get("scheduled")
    task["scheduled"] = new_scheduled
    _write_task(task)
    # Pushing into the future (or further out) counts as a deferral. Setting
    # a date for the first time on something already in the future is also
    # a deferral signal — the user's saying "not now."
    if new_scheduled and new_scheduled > today_iso:
        if not prior_scheduled or new_scheduled > prior_scheduled:
            _log_event("deferred", task, {"reason": "rescheduled", "scheduled": new_scheduled})
    return {"ok": True, **_strip_internal(task)}


@router.post("/someday")
async def tasks_someday(request: Request) -> Dict[str, Any]:
    """Move to Someday — open work that's deferred indefinitely."""
    payload = await request.json()
    task_id = str(payload.get("id") or "").strip().lower()
    if not task_id:
        raise HTTPException(status_code=400, detail="id is required")
    path = _find_task_path(task_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"unknown task: {task_id}")
    task = _parse_task(path) or {}
    task.update({"status": "someday", "today": False, "today_set_on": None, "scheduled": None})
    _write_task(task)
    _log_event("deferred", task, {"reason": "someday"})
    return {"ok": True, **_strip_internal(task)}


# ── Areas endpoints ──────────────────────────────────────────────────────


@router.get("/history")
def tasks_history(days: int = 30) -> Dict[str, Any]:
    """Per-day counts of tasks made / done / deferred across the window.

    Powers the weekly reflection histogram on the dashboard and the 7-day
    mini chart on the home overview. Same shape as `/api/chores/history` so
    the overview's MiniBarChart pattern just works.

    Also returns per-area weekly counts so the dashboard can show "balance"
    across Home/Work/Health — answering "which areas am I living this week?"
    """
    days = max(1, min(int(days or 30), 365))
    today = date.today()
    cutoff = (today - timedelta(days=days - 1)).isoformat()
    events = _load_events(cutoff)

    # Per-day counts
    by_day: Dict[str, Dict[str, int]] = {}
    for ev in events:
        d = ev.get("date")
        if not d:
            continue
        bucket = by_day.setdefault(d, {"made": 0, "done": 0, "deferred": 0, "cancelled": 0})
        action = ev.get("action")
        if action in bucket:
            bucket[action] += 1

    daily: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        b = by_day.get(d, {})
        daily.append({
            "date": d,
            "made": b.get("made", 0),
            "done": b.get("done", 0),
            "deferred": b.get("deferred", 0),
            "cancelled": b.get("cancelled", 0),
        })

    # Per-area weekly totals (last 7 days). Helps answer "am I balancing my
    # life areas this week?". `null` area collects uncategorised activity so
    # the user can spot Inbox-only weeks where nothing got organised.
    week_cutoff = (today - timedelta(days=6)).isoformat()
    areas_by_week: Dict[str, Dict[str, int]] = {}
    for ev in events:
        if (ev.get("date") or "") < week_cutoff:
            continue
        if ev.get("action") not in ("made", "done", "deferred"):
            continue
        a = ev.get("area") or "—"
        bucket = areas_by_week.setdefault(a, {"made": 0, "done": 0, "deferred": 0})
        bucket[ev["action"]] += 1
    by_area = [
        {"area": a, **counts} for a, counts in sorted(areas_by_week.items())
    ]

    return {
        "daily": daily,
        "by_area": by_area,
        "today": today.isoformat(),
        "window_days": days,
    }


@router.get("/areas")
def areas_list() -> Dict[str, Any]:
    return {"areas": _load_areas()}


@router.put("/areas")
async def areas_replace(request: Request) -> Dict[str, Any]:
    """Replace the entire Areas.yaml. Body: {areas: [{id, title, emoji?}]}."""
    payload = await request.json()
    items = payload.get("areas") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="body must be {areas: [...]}")
    cleaned: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        aid = str(item.get("id") or "").strip().lower()
        title = str(item.get("title") or "").strip()
        emoji = str(item.get("emoji") or "").strip()
        if not aid or not title:
            continue
        if not ID_RE.match(aid):
            raise HTTPException(status_code=400, detail=f"invalid area id: {aid}")
        if aid in seen:
            continue
        seen.add(aid)
        cleaned.append({"id": aid, "title": title, "emoji": emoji})
    _save_areas(cleaned)
    return {"ok": True, "areas": cleaned}


# ── Projects endpoints ───────────────────────────────────────────────────


@router.get("/projects")
def projects_list() -> Dict[str, Any]:
    return {"projects": _load_projects()}


@router.post("/projects")
async def projects_create(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    title = str(payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    raw_id = str(payload.get("id") or "").strip().lower() or _slugify(title.lower())
    pid = re.sub(r"[^a-z0-9-]+", "-", raw_id).strip("-")
    if not pid or not ID_RE.match(pid):
        raise HTTPException(status_code=400, detail="invalid project id")
    if _project_path(pid).exists():
        raise HTTPException(status_code=409, detail=f"project already exists: {pid}")

    project = {
        "id": pid,
        "title": title,
        "status": "active",
        "area": _maybe_id(payload.get("area")),
        "created": date.today().isoformat(),
        "completed_at": None,
        "notes": payload.get("notes") or None,
    }
    _write_project(project)
    return {"ok": True, **project}


@router.put("/projects/{project_id}")
async def projects_update(project_id: str, request: Request) -> Dict[str, Any]:
    payload = await request.json()
    pid = project_id.lower()
    path = _project_path(pid)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"unknown project: {pid}")
    project = _parse_project(path)
    if project is None:
        raise HTTPException(status_code=500, detail=f"project {pid} failed to parse")

    if "title" in payload:
        title = str(payload.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="title cannot be empty")
        project["title"] = title
    if "status" in payload:
        status = str(payload.get("status") or "active")
        if status not in ("active", "done", "cancelled"):
            raise HTTPException(status_code=400, detail="status must be active|done|cancelled")
        project["status"] = status
        if status in ("done", "cancelled") and not project.get("completed_at"):
            project["completed_at"] = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        if status == "active":
            project["completed_at"] = None
    if "area" in payload:
        project["area"] = _maybe_id(payload.get("area"))
    if "notes" in payload:
        project["notes"] = payload.get("notes") or None
    _write_project(project)
    return {"ok": True, **project}


@router.delete("/projects/{project_id}")
def projects_delete(project_id: str) -> Dict[str, Any]:
    pid = project_id.lower()
    path = _project_path(pid)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"unknown project: {pid}")
    path.unlink()
    return {"ok": True, "id": pid}


# Catch-all delete is registered last so DELETE /areas / DELETE /projects
# resolve to their dedicated handlers (404 here is a feature — no accidental
# matching of reserved subpaths).
RESERVED_TASK_IDS = {"areas", "projects", "list", "counts", "create", "update",
                     "complete", "uncomplete", "cancel", "move-to-today",
                     "schedule", "someday"}


@router.delete("/{task_id}")
def tasks_delete(task_id: str) -> Dict[str, Any]:
    tid = task_id.lower()
    if tid in RESERVED_TASK_IDS:
        raise HTTPException(status_code=404, detail=f"unknown task: {task_id}")
    path = _find_task_path(tid)
    if path is None:
        raise HTTPException(status_code=404, detail=f"unknown task: {task_id}")
    path.unlink()
    return {"ok": True, "id": tid}
