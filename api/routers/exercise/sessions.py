"""Session write + per-session read routes: POST /api/training/sessions,
last/by-date lookups, /api/training/stats, /api/training/reload,
/api/training/next-workout.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List

import yaml
from fastapi import APIRouter, Depends, HTTPException
from starlette.requests import Request

from api.io import atomic_write_text
from api.parsing import _slugify
from api.paths import DATA_DIR

from .cache import _cache, fresh_cache, load_cache
from .taxonomy import _is_cardio_type, exercise_group, session_type_meta

router = APIRouter(tags=["training"])


@router.post("/api/training/sessions")
@router.post("/api/sessions")
async def post_sessions(request: Request) -> Dict[str, Any]:
    """Write one .md file per entry using the NEW schema.

    Each file has a minimal frontmatter: `date`, `exercise`, and either the
    strength fields (weight/sets/reps/difficulty) OR the cardio fields
    (duration_min/distance_m/level). No `session`, `source`, `tags`, or
    `pace_unit` — those were dropped in the 2026-04-10 migration.
    """
    payload = await request.json()
    date_str = payload.get("date", "")
    time_str = payload.get("time", "")
    session_type = payload.get("session_type", "")
    concluded_at = f"{date_str}T{time_str}:00" if time_str else f"{date_str}T00:00:00"
    written: List[str] = []

    for entry in payload.get("entries", []):
        if entry.get("skipped"):
            continue
        ex = entry.get("exercise", "unknown")
        is_cardio = _is_cardio_type(ex)
        replace_file = entry.get("replace_file")

        fm_fields: Dict[str, Any] = {
            "date": date_str,
            "exercise": ex,
            "concluded_at": concluded_at,
            # Per-entry timestamp at write time — since each set is POSTed
            # individually as the user logs it, this captures the real
            # chronological order within a session. The shared concluded_at
            # alone can't do that.
            "logged_at": datetime.now().isoformat(timespec="seconds"),
        }

        if is_cardio:
            if (v := entry.get("duration_min")) is not None:
                fm_fields["duration_min"] = float(v)
            if (v := entry.get("distance_m")) is not None:
                fm_fields["distance_m"] = int(v)
            if (v := entry.get("level")) is not None:
                fm_fields["level"] = int(v)
        else:
            if (v := entry.get("weight")) is not None:
                fm_fields["weight"] = float(v)
            if (v := entry.get("sets")) is not None:
                fm_fields["sets"] = int(v)
            if (v := entry.get("reps")) is not None and v != "":
                try:
                    fm_fields["reps"] = int(v)
                except (TypeError, ValueError):
                    fm_fields["reps"] = str(v)
            if (diff := entry.get("difficulty", "")):
                fm_fields["difficulty"] = diff

        slug = _slugify(ex)
        if replace_file and (DATA_DIR / replace_file).exists():
            file_name = replace_file
        else:
            seq = 1
            while (DATA_DIR / f"{date_str}--{slug}--{seq:02d}.md").exists():
                seq += 1
            file_name = f"{date_str}--{slug}--{seq:02d}.md"
        path = DATA_DIR / file_name

        fm_block = yaml.safe_dump(fm_fields, sort_keys=False, allow_unicode=True).strip()
        content = f"---\n{fm_block}\n---\n"
        if (note := entry.get("note", "")):
            content += f"\n{note}\n"
        atomic_write_text(path, content)
        written.append(file_name)

    load_cache()
    return {"written": written, "concluded_at": concluded_at, "session_type": session_type}


@router.put("/api/training/entries")
async def put_entry(request: Request) -> Dict[str, Any]:
    """Update a single training entry .md by filename. Re-reads existing
    frontmatter so the original concluded_at/logged_at and any unrelated
    fields survive; only the user-editable numeric/text fields are
    overwritten by the payload."""
    payload = await request.json()
    file_name = str(payload.get("file") or "").strip()
    if not file_name:
        raise HTTPException(status_code=400, detail="file is required")
    fpath = DATA_DIR / file_name
    if not fpath.exists():
        raise HTTPException(status_code=404, detail="Entry not found")

    raw = fpath.read_text(encoding="utf-8")
    fm: Dict[str, Any] = {}
    body_after = ""
    if raw.startswith("---\n"):
        end = raw.find("\n---", 4)
        if end != -1:
            try:
                fm = yaml.safe_load(raw[4:end]) or {}
            except yaml.YAMLError:
                fm = {}
            body_after = raw[end + 4 :].lstrip("\n")

    ex = fm.get("exercise", "")
    is_cardio = _is_cardio_type(ex)

    def _clear(*keys: str) -> None:
        for k in keys:
            if k in fm:
                del fm[k]

    if is_cardio:
        _clear("weight", "sets", "reps", "difficulty")
        if (v := payload.get("duration_min")) not in (None, ""):
            fm["duration_min"] = float(v)
        else:
            _clear("duration_min")
        if (v := payload.get("distance_m")) not in (None, ""):
            fm["distance_m"] = int(v)
        else:
            _clear("distance_m")
        if (v := payload.get("level")) not in (None, ""):
            fm["level"] = int(v)
        else:
            _clear("level")
    else:
        _clear("duration_min", "distance_m", "level")
        if (v := payload.get("weight")) not in (None, ""):
            fm["weight"] = float(v)
        else:
            _clear("weight")
        if (v := payload.get("sets")) not in (None, ""):
            fm["sets"] = int(v)
        else:
            _clear("sets")
        if (v := payload.get("reps")) not in (None, ""):
            try:
                fm["reps"] = int(v)
            except (TypeError, ValueError):
                fm["reps"] = str(v)
        else:
            _clear("reps")
        diff = payload.get("difficulty")
        if diff:
            fm["difficulty"] = diff
        else:
            _clear("difficulty")

    fm_block = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True).strip()
    note = payload.get("note")
    body_text = note if note is not None else body_after
    content = f"---\n{fm_block}\n---\n"
    if body_text:
        content += f"\n{body_text.rstrip()}\n"
    atomic_write_text(fpath, content)
    load_cache()
    return {"ok": True, "file": file_name}


@router.delete("/api/training/entries")
async def delete_entry(request: Request) -> Dict[str, Any]:
    """Delete a single training entry .md by filename."""
    payload = await request.json()
    file_name = str(payload.get("file") or "").strip()
    if not file_name:
        raise HTTPException(status_code=400, detail="file is required")
    fpath = DATA_DIR / file_name
    if not fpath.exists():
        raise HTTPException(status_code=404, detail="Entry not found")
    fpath.unlink()
    load_cache()
    return {"ok": True}


@router.get("/api/training/sessions/last", dependencies=[Depends(fresh_cache)])
@router.get("/api/sessions/last", dependencies=[Depends(fresh_cache)])
def get_last_session(type: str = "") -> Dict[str, Any]:
    entries_by_date = _cache.get("sessions_by_date", {})
    if not entries_by_date:
        return {"session_type": type, "date": "", "entries": []}
    sorted_dates = sorted(entries_by_date.keys(), reverse=True)
    for dt in sorted_dates:
        day_entries = entries_by_date[dt]
        matching = [e for e in day_entries if e.get("session", "") == type]
        if matching:
            return {"session_type": type, "date": dt, "entries": matching}
    return {"session_type": type, "date": sorted_dates[0], "entries": entries_by_date.get(sorted_dates[0], [])}


@router.get("/api/training/sessions/{session_date}", dependencies=[Depends(fresh_cache)])
@router.get("/api/sessions/{session_date}", dependencies=[Depends(fresh_cache)])
def get_sessions(session_date: str) -> Dict[str, Any]:
    return {"date": session_date, "data": _cache.get("sessions_by_date", {}).get(session_date, [])}


@router.get("/api/training/stats", dependencies=[Depends(fresh_cache)])
@router.get("/api/stats", dependencies=[Depends(fresh_cache)])
def get_stats() -> Dict[str, Any]:
    # `last_logged_at`: the max `concluded_at` across all parsed entries.
    # Falls back to file mtime only if every entry is legacy.
    last_logged_at: str | None = None
    entries = _cache.get("entries", [])
    stamps = [e.get("concluded_at") for e in entries if e.get("concluded_at")]
    if stamps:
        last_logged_at = max(stamps)
    elif DATA_DIR.exists():
        try:
            latest = max(
                (p.stat().st_mtime for p in DATA_DIR.glob("*.md")),
                default=None,
            )
            if latest is not None:
                last_logged_at = datetime.fromtimestamp(latest).isoformat(timespec="seconds")
        except OSError:
            pass
    return dict(
        _cache.get("stats", {}),
        last_loaded_at=_cache.get("last_loaded_at"),
        last_logged_at=last_logged_at,
    )


@router.get("/api/training/reload")
@router.get("/api/reload")
def reload_data() -> Dict[str, Any]:
    cache = load_cache()
    return {
        "ok": True,
        "message": "Cache reloaded",
        "stats": cache.get("stats", {}),
        "last_loaded_at": cache.get("last_loaded_at"),
    }


# SESSION_META used to live here as a hardcoded dict — now resolved per-call
# via taxonomy.session_type_meta() so users can edit labels/emoji from
# Settings → Training without touching code.


@router.get("/api/training/next-workout", dependencies=[Depends(fresh_cache)])
@router.get("/api/next-workout", dependencies=[Depends(fresh_cache)])
def get_next_workout() -> Dict[str, Any]:
    """Classify past days by the groups they contained, return days-since for
    each session type, and suggest the one that's been longest.

    A day counts as a real "upper day" only if it includes at least
    `MIN_STRENGTH_EXERCISES` upper-group exercises. A "cardio day" requires
    at least `MIN_CARDIO_MINUTES` of Z2 time AND no strength session — the
    30-min floor matches literature on Z2 mitochondrial biogenesis.
    """
    MIN_STRENGTH_EXERCISES = 3
    MIN_CARDIO_MINUTES = 30

    entries_by_date: Dict[str, List[Dict[str, Any]]] = _cache.get("sessions_by_date", {})
    today = date.today()
    today_str = today.isoformat()

    last_by_type: Dict[str, str | None] = {"upper": None, "lower": None, "cardio": None, "yoga": None}

    for date_str in sorted(entries_by_date.keys(), reverse=True):
        if date_str > today_str:
            continue
        day_entries = entries_by_date[date_str]
        if not day_entries:
            continue

        upper_count = 0
        lower_count = 0
        cardio_minutes = 0.0
        has_mobility = False
        for e in day_entries:
            ex = e.get("exercise") or ""
            grp = exercise_group(ex)
            if grp == "upper":
                upper_count += 1
            elif grp == "lower":
                lower_count += 1
            elif grp == "cardio":
                duration = e.get("duration_min")
                if isinstance(duration, (int, float)):
                    cardio_minutes += float(duration)
            elif grp == "mobility":
                has_mobility = True

        is_upper_day = upper_count >= MIN_STRENGTH_EXERCISES
        is_lower_day = lower_count >= MIN_STRENGTH_EXERCISES
        is_cardio_day = (
            cardio_minutes >= MIN_CARDIO_MINUTES
            and not is_upper_day
            and not is_lower_day
        )
        is_yoga_day = has_mobility and not is_upper_day and not is_lower_day

        if is_upper_day and last_by_type["upper"] is None:
            last_by_type["upper"] = date_str
        if is_lower_day and last_by_type["lower"] is None:
            last_by_type["lower"] = date_str
        if is_cardio_day and last_by_type["cardio"] is None:
            last_by_type["cardio"] = date_str
        if is_yoga_day and last_by_type["yoga"] is None:
            last_by_type["yoga"] = date_str

        if all(v is not None for v in last_by_type.values()):
            break

    def days_ago(d: str | None) -> int | None:
        return (today - date.fromisoformat(d)).days if d else None

    counts = {t: days_ago(last_by_type[t]) for t in ("upper", "lower", "cardio", "yoga")}

    MIN_REST = 2

    def available(t: str) -> bool:
        v = counts[t]
        return v is None or v >= MIN_REST

    def gap(t: str) -> float:
        v = counts[t]
        return float("inf") if v is None else float(v)

    if available("upper") and available("lower"):
        suggested_type = "upper" if gap("upper") >= gap("lower") else "lower"
    elif available("upper"):
        suggested_type = "upper"
    elif available("lower"):
        suggested_type = "lower"
    elif available("cardio"):
        suggested_type = "cardio"
    elif available("yoga"):
        suggested_type = "yoga"
    else:
        suggested_type = "yoga"

    meta = session_type_meta(suggested_type)

    return {
        "suggested": {
            "type": suggested_type,
            "emoji": meta["emoji"],
            "label": meta["label"],
        },
        "days_ago": {
            "upper": counts["upper"],
            "lower": counts["lower"],
            "cardio": counts["cardio"],
            "yoga": counts["yoga"],
        },
        "last_date": {
            "upper": last_by_type["upper"],
            "lower": last_by_type["lower"],
            "cardio": last_by_type["cardio"],
            "yoga": last_by_type["yoga"],
        },
    }
