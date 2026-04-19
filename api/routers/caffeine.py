"""Caffeine — per-event logging without shared state. Each entry stands
alone; grams is optional and represents the user's share (e.g. half of a
20g shared v60).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.parsing import _extract_frontmatter, _normalize_date, _normalize_number
from api.paths import CAFFEINE_CONFIG_PATH, CAFFEINE_DIR

CAFFEINE_METHODS = {"v60", "matcha", "other"}

router = APIRouter(prefix="/api/caffeine", tags=["caffeine"])


def _load_caffeine_config() -> Dict[str, Any]:
    """Return the caffeine config: bean presets (optional, used when known)."""
    out: Dict[str, Any] = {"beans": []}
    if not CAFFEINE_CONFIG_PATH.exists():
        return out
    try:
        raw = CAFFEINE_CONFIG_PATH.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("caffeine-config.yaml failed to parse: %s", exc)
        return out
    beans = data.get("beans") or []
    out["beans"] = [
        {"id": str(b.get("id", "")), "name": str(b.get("name", ""))}
        for b in beans
        if b.get("id")
    ]
    return out


def _caffeine_event_file(day: str, method: str, nn: int) -> Path:
    return CAFFEINE_DIR / f"{day}--{method}--{nn:02d}.md"


def _load_caffeine_events(day: str) -> List[Dict[str, Any]]:
    if not CAFFEINE_DIR.exists():
        return []
    out: List[Dict[str, Any]] = []
    for p in sorted(CAFFEINE_DIR.glob(f"{day}--*.md")):
        try:
            fm = _extract_frontmatter(p.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("caffeine event %s failed to parse: %s", p.name, exc)
            continue
        if fm:
            out.append(fm)
    return out


def _next_caffeine_nn(day: str, method: str) -> int:
    nns: List[int] = []
    for p in CAFFEINE_DIR.glob(f"{day}--{method}--*.md"):
        parts = p.stem.split("--")
        if len(parts) == 3:
            try:
                nns.append(int(parts[2]))
            except ValueError:
                pass
    return max(nns) + 1 if nns else 1


def _write_caffeine_event(path: Path, event: Dict[str, Any]) -> None:
    CAFFEINE_DIR.mkdir(parents=True, exist_ok=True)
    if isinstance(event.get("date"), str):
        try:
            event["date"] = date.fromisoformat(event["date"])
        except ValueError:
            pass
    body = "---\n" + yaml.safe_dump(event, sort_keys=False, allow_unicode=True) + "---\n"
    path.write_text(body, encoding="utf-8")


def _delete_caffeine_event_by_id(entry_id: str, day: Optional[str] = None) -> bool:
    pattern = f"{day}--*.md" if day else "*.md"
    for p in CAFFEINE_DIR.glob(pattern):
        try:
            fm = _extract_frontmatter(p.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        if str(fm.get("id", "")) == entry_id:
            p.unlink()
            return True
    return False


@router.get("/config")
def caffeine_config() -> Dict[str, Any]:
    return _load_caffeine_config()


@router.get("/day/{day}")
def caffeine_day(day: str) -> Dict[str, Any]:
    """Return entries for the day + daily summary."""
    events = sorted(_load_caffeine_events(day), key=lambda e: str(e.get("time", "")))
    method_counts: Dict[str, int] = {m: 0 for m in CAFFEINE_METHODS}
    total_g = 0.0
    grams_count = 0
    for e in events:
        m = str(e.get("method", "v60"))
        if m in method_counts:
            method_counts[m] += 1
        g = _normalize_number(e.get("grams"))
        if g is not None and g > 0:
            total_g += g
            grams_count += 1
    return {
        "date": day,
        "entries": events,
        "session_count": len(events),
        "methods": method_counts,
        "total_g": round(total_g, 2) if grams_count else None,
    }


@router.post("/entry")
async def caffeine_add_entry(request: Request) -> Dict[str, Any]:
    """Body: {date, time, method, beans?, grams?, notes?}. No capsule/shared
    state — each entry stands alone. Grams is optional and represents the
    user's share (e.g. half of a 20g shared v60)."""
    payload = await request.json()
    day = _normalize_date(payload.get("date")) or date.today().isoformat()
    time_str = str(payload.get("time", "")).strip()
    method = str(payload.get("method", "v60")).strip() or "v60"
    if method not in CAFFEINE_METHODS:
        method = "other"
    beans_raw = str(payload.get("beans", "")).strip()
    beans = beans_raw if beans_raw and beans_raw.lower() != "none" else None
    grams = _normalize_number(payload.get("grams"))
    notes = str(payload.get("notes", "")).strip() or None

    if not time_str:
        raise HTTPException(status_code=400, detail="time is required")

    entry_id = str(uuid.uuid4())[:8]
    nn = _next_caffeine_nn(day, method)
    event = {
        "date": day,
        "time": time_str,
        "id": entry_id,
        "section": "caffeine",
        "method": method,
        "beans": beans,
        "grams": grams if grams is not None and grams > 0 else None,
        "note": notes,
        "created_at": datetime.now().isoformat(),
    }
    _write_caffeine_event(_caffeine_event_file(day, method, nn), event)
    return {"ok": True, "entry": event}


@router.delete("/entry/{entry_id}")
async def caffeine_delete_entry(request: Request, entry_id: str) -> Dict[str, Any]:
    """Delete entry from a specific day. Day defaults to today."""
    params = dict(request.query_params)
    day = _normalize_date(params.get("date")) or date.today().isoformat()
    _delete_caffeine_event_by_id(entry_id, day)
    return {"ok": True}


@router.get("/history")
def caffeine_history(days: int = 30) -> Dict[str, Any]:
    """Daily session counts and (when known) gram totals for the last N days."""
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        events = _load_caffeine_events(d)
        total_g = 0.0
        grams_count = 0
        for e in events:
            g = _normalize_number(e.get("grams"))
            if g is not None and g > 0:
                total_g += g
                grams_count += 1
        out.append({
            "date": d,
            "sessions": len(events),
            "total_g": round(total_g, 2) if grams_count else None,
        })
    return {"daily": out}


@router.get("/sessions")
def caffeine_sessions(days: int = 30) -> Dict[str, Any]:
    """Flat list of every entry from the last N days for time-of-day analysis.
    Sorted oldest-first across days and time-ascending within a day, so the
    last element is the most recent coffee — used to seed form defaults."""
    today = date.today()
    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        day_entries = sorted(_load_caffeine_events(d), key=lambda e: str(e.get("time", "")))
        for e in day_entries:
            time_str = str(e.get("time", "")).strip()
            if not time_str:
                continue
            parts = time_str.split(":")
            try:
                hh = int(parts[0])
                mm = int(parts[1]) if len(parts) > 1 else 0
            except (ValueError, IndexError):
                continue
            hour = hh + mm / 60.0
            out.append({
                "date": d,
                "time": time_str,
                "hour": round(hour, 3),
                "method": e.get("method", "v60"),
                "beans": e.get("beans"),
                "grams": e.get("grams"),
            })
    return {"sessions": out}
