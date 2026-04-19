"""Supplements — a fixed configurable daily stack. Mirrors habits: one
config file listing the stack, one event file per dose taken per day.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.parsing import _extract_frontmatter, _normalize_date, _slugify
from api.paths import SUPPL_CONFIG_PATH, SUPPL_DIR

router = APIRouter(prefix="/api/supplements", tags=["supplements"])


def _load_supplements_config() -> List[Dict[str, Any]]:
    """Return the full ordered list of supplements from supplements-config.yaml."""
    if not SUPPL_CONFIG_PATH.exists():
        return []
    try:
        raw = SUPPL_CONFIG_PATH.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("supplements-config.yaml failed to parse: %s", exc)
        return []

    supplements = data.get("supplements") or []
    out: List[Dict[str, Any]] = []
    for s in supplements:
        if not isinstance(s, dict):
            continue
        sid = str(s.get("id") or "").strip()
        name = str(s.get("name") or "").strip()
        emoji = str(s.get("emoji") or "").strip()
        if not sid or not name:
            continue
        out.append({"id": sid, "name": name, "emoji": emoji})
    return out


def _suppl_event_file(day: str, supplement_id: str) -> Path:
    return SUPPL_DIR / f"{day}--{supplement_id}--01.md"


def _load_suppl_events(day: str) -> List[Dict[str, Any]]:
    """Glob all supplement-taken events for a given day."""
    if not SUPPL_DIR.exists():
        return []
    out: List[Dict[str, Any]] = []
    for p in sorted(SUPPL_DIR.glob(f"{day}--*.md")):
        try:
            fm = _extract_frontmatter(p.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("supplement event %s failed to parse: %s", p.name, exc)
            continue
        if fm:
            out.append(fm)
    return out


def _write_suppl_event(
    day: str,
    supplement: Dict[str, Any],
    note: Optional[str],
    time: Optional[str] = None,
) -> None:
    SUPPL_DIR.mkdir(parents=True, exist_ok=True)
    sid = supplement["id"]
    event: Dict[str, Any] = {
        "date": date.fromisoformat(day),
    }
    if time:
        event["time"] = time
    event.update({
        "id": f"supplement-{day}-{sid}",
        "section": "supplements",
        "supplement_id": sid,
        "supplement_name": supplement["name"],
        "emoji": supplement.get("emoji") or None,
        "note": (note or None),
    })
    body = "---\n" + yaml.safe_dump(event, sort_keys=False, allow_unicode=True) + "---\n"
    _suppl_event_file(day, sid).write_text(body, encoding="utf-8")


def _delete_suppl_event(day: str, supplement_id: str) -> None:
    p = _suppl_event_file(day, supplement_id)
    if p.exists():
        p.unlink()


def _write_supplements_config(data: Dict[str, Any]) -> None:
    SUPPL_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    header = "# Setlist supplements config — fixed daily stack.\n"
    SUPPL_CONFIG_PATH.write_text(
        header + yaml.safe_dump(data, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


@router.get("/config")
def supplements_config() -> Dict[str, Any]:
    """Return the fixed supplement list from config."""
    supplements = _load_supplements_config()
    return {"supplements": supplements, "total": len(supplements)}


@router.get("/day/{day}")
def supplements_day(day: str) -> Dict[str, Any]:
    """Merge config + today's events. Each supplement carries `done: bool`."""
    supplements = _load_supplements_config()
    events_by_id = {str(e.get("supplement_id", "")): e for e in _load_suppl_events(day)}

    items = []
    done_count = 0
    for s in supplements:
        ev = events_by_id.get(s["id"])
        done = ev is not None
        if done:
            done_count += 1
        items.append({
            **s,
            "done": done,
            "note": (str(ev.get("note") or "") if ev else ""),
            "time": (str(ev.get("time") or "") if ev else "") or None,
        })

    total = len(supplements)
    return {
        "date": day,
        "items": items,
        "done_count": done_count,
        "total": total,
        "percent": round(100 * done_count / total) if total else 0,
    }


@router.post("/toggle")
async def supplements_toggle(request: Request) -> Dict[str, Any]:
    """Body: {date, supplement_id, done}. Idempotent — creates or deletes a
    single per-supplement event file."""
    payload = await request.json()
    day = _normalize_date(payload.get("date")) or date.today().isoformat()
    supplement_id = str(payload.get("supplement_id") or "").strip()
    done = bool(payload.get("done"))
    if not supplement_id:
        raise HTTPException(status_code=400, detail="supplement_id is required")

    config_by_id = {s["id"]: s for s in _load_supplements_config()}
    if supplement_id not in config_by_id:
        raise HTTPException(status_code=404, detail=f"unknown supplement: {supplement_id}")

    if done:
        existing = _suppl_event_file(day, supplement_id)
        note = None
        prior_time = None
        if existing.exists():
            try:
                fm = _extract_frontmatter(existing.read_text(encoding="utf-8"))
                note = fm.get("note")
                prior_time = fm.get("time")
            except Exception:  # noqa: BLE001
                pass
        client_time = str(payload.get("time") or "").strip() or None
        today_iso = date.today().isoformat()
        if client_time:
            time_val = client_time
        elif prior_time:
            time_val = str(prior_time)
        elif day == today_iso:
            time_val = datetime.now().strftime("%H:%M")
        else:
            time_val = None
        _write_suppl_event(day, config_by_id[supplement_id], note, time=time_val)
    else:
        _delete_suppl_event(day, supplement_id)

    taken = [str(e.get("supplement_id", "")) for e in _load_suppl_events(day)]
    return {"ok": True, "date": day, "supplement_id": supplement_id, "done": done, "taken": taken}


@router.post("/new")
async def supplements_new(request: Request) -> Dict[str, Any]:
    """Body: {name, emoji?}. Appends a new supplement to supplements-config.yaml
    with an auto-generated kebab-case id. Idempotent: skips if an identical name
    already exists."""
    payload = await request.json()
    name = str(payload.get("name") or "").strip()
    emoji = str(payload.get("emoji") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    new_id = _slugify(name)
    if not new_id:
        raise HTTPException(status_code=400, detail="could not derive a valid id from name")

    data: Dict[str, Any] = {}
    if SUPPL_CONFIG_PATH.exists():
        try:
            raw = SUPPL_CONFIG_PATH.read_text(encoding="utf-8")
            data = yaml.safe_load(raw) or {}
        except Exception as exc:  # noqa: BLE001
            logger.warning("supplements-config.yaml failed to parse on write: %s", exc)
            data = {}

    supplements: List[Dict[str, Any]] = data.get("supplements") or []

    for s in supplements:
        if str(s.get("name", "")).strip() == name:
            return {"ok": True, "id": s["id"], "name": name, "emoji": s.get("emoji", ""), "skipped": True}

    supplements.append({"id": new_id, "name": name, "emoji": emoji})
    data["supplements"] = supplements
    _write_supplements_config(data)
    return {"ok": True, "id": new_id, "name": name, "emoji": emoji}


@router.put("/update")
async def supplements_update(request: Request) -> Dict[str, Any]:
    """Body: {id, name?, emoji?}. Updates the supplement with the given id.
    Only non-empty fields are applied (emoji can be cleared by sending "")."""
    payload = await request.json()
    supplement_id = str(payload.get("id") or "").strip()
    if not supplement_id:
        raise HTTPException(status_code=400, detail="id is required")

    if not SUPPL_CONFIG_PATH.exists():
        raise HTTPException(status_code=404, detail="supplements-config.yaml not found")

    try:
        raw = SUPPL_CONFIG_PATH.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("supplements-config.yaml failed to parse on update: %s", exc)
        raise HTTPException(status_code=500, detail="failed to parse config")

    supplements: List[Dict[str, Any]] = data.get("supplements") or []
    found = False
    for s in supplements:
        if str(s.get("id", "")) == supplement_id:
            found = True
            if "name" in payload:
                name = str(payload.get("name") or "").strip()
                if name:
                    s["name"] = name
            if "emoji" in payload:
                s["emoji"] = str(payload.get("emoji") or "").strip()
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"supplement not found: {supplement_id}")

    data["supplements"] = supplements
    _write_supplements_config(data)
    return {"ok": True, "id": supplement_id}


@router.delete("/delete/{supplement_id}")
def supplements_delete(supplement_id: str) -> Dict[str, Any]:
    """Remove a supplement from supplements-config.yaml. Historical per-day
    event files that reference the id are left intact."""
    if not SUPPL_CONFIG_PATH.exists():
        raise HTTPException(status_code=404, detail="supplements-config.yaml not found")
    try:
        raw = SUPPL_CONFIG_PATH.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("supplements-config.yaml failed to parse on delete: %s", exc)
        raise HTTPException(status_code=500, detail="failed to parse config")

    supplements: List[Dict[str, Any]] = data.get("supplements") or []
    before = len(supplements)
    supplements = [s for s in supplements if str(s.get("id", "")) != supplement_id]
    if len(supplements) == before:
        raise HTTPException(status_code=404, detail=f"supplement not found: {supplement_id}")

    data["supplements"] = supplements
    _write_supplements_config(data)
    return {"ok": True, "id": supplement_id}


@router.get("/history")
def supplements_history(days: int = 30) -> Dict[str, Any]:
    """Daily completion % for the last N days."""
    total = len(_load_supplements_config())
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        done = len(_load_suppl_events(d))
        pct = round(100 * done / total) if total else 0
        out.append({"date": d, "done": done, "total": total, "percent": pct})
    return {"daily": out, "total": total}
