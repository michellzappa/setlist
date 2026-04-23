"""Progression + history routes: exercises list, per-exercise progression,
summary, last-entries prefill, entries, cardio-history.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from starlette.requests import Request

from api.routers.settings import load_targets

from .cache import _cache, fresh_cache
from .taxonomy import _load_config

router = APIRouter(tags=["training"])


@router.get("/api/training/exercises", dependencies=[Depends(fresh_cache)])
@router.get("/api/exercises", dependencies=[Depends(fresh_cache)])
def get_exercises() -> List[str]:
    """Distinct exercise names for the logger.

    Union of log-derived names and config-defined names, so a newly-added
    exercise from the settings UI is immediately selectable even before it
    has any log entries.
    """
    names = set(_cache.get("exercises", []))
    for ex in _load_config()["exercises"]:
        if ex.get("name"):
            names.add(ex["name"])
    return sorted(names)


@router.get("/api/training/progression/{exercise}", dependencies=[Depends(fresh_cache)])
@router.get("/api/progression/{exercise}", dependencies=[Depends(fresh_cache)])
def get_progression(exercise: str) -> Dict[str, Any]:
    data = _cache.get("progression", {}).get(exercise, [])
    return {"exercise": exercise, "data": data}


@router.get("/api/training/summary", dependencies=[Depends(fresh_cache)])
@router.get("/api/summary", dependencies=[Depends(fresh_cache)])
def get_summary(since: str = "") -> List[Dict[str, Any]]:
    """One row per exercise: latest weight, latest date, trend, count.

    Optional `since` query param restricts the window.
    """
    progression: Dict[str, List[Dict[str, Any]]] = _cache.get("progression", {})
    summary: List[Dict[str, Any]] = []
    for name, points in progression.items():
        window = [p for p in points if not since or (p.get("date") or "") >= since]
        if not window:
            continue
        weighted = [p for p in window if isinstance(p.get("weight"), (int, float))]
        latest = window[-1]
        trend = "→"
        if len(weighted) >= 2:
            a, b = weighted[-2]["weight"], weighted[-1]["weight"]
            trend = "↑" if b > a else "↓" if b < a else "→"
        summary.append(
            {
                "name": name,
                "latest_weight": latest.get("weight"),
                "latest_date": latest.get("date"),
                "trend": trend,
                "count": len(window),
            }
        )
    summary.sort(key=lambda item: item["name"])
    return summary


def _last_nonnull_values(points: List[Dict[str, Any]]) -> Dict[str, Any] | None:
    """Compose a virtual "last entry" used as a prefill default.

    Strategy per field:
    - weight/sets/reps/difficulty/duration_min/distance_m: most recent non-null
      value (walks history backwards).
    - `level`: mode of the last 5 non-null values (ties → most recent wins).
    - `avg_pace_m_per_min`: mean pace over the last 5 sessions with both
      distance and duration.
    """
    if not points:
        return None

    recency_fields = ["weight", "sets", "reps", "difficulty", "duration_min", "distance_m"]
    out: Dict[str, Any] = {f: None for f in recency_fields}
    out["level"] = None
    source_date: str | None = None
    for p in reversed(points):
        changed = False
        for f in recency_fields:
            v = p.get(f)
            if out[f] in (None, "") and v not in (None, ""):
                out[f] = v
                changed = True
        if changed and source_date is None:
            source_date = p.get("date")
        if all(out[f] not in (None, "") for f in recency_fields):
            break
    out["date"] = source_date or (points[-1].get("date") if points else None)

    recent_levels: List[Any] = []
    for p in reversed(points):
        lv = p.get("level")
        if lv is not None:
            recent_levels.append(lv)
            if len(recent_levels) >= 5:
                break
    if recent_levels:
        counts = Counter(recent_levels)
        top = counts.most_common()
        best_count = top[0][1]
        winners = [v for v, c in top if c == best_count]
        for lv in recent_levels:
            if lv in winners:
                out["level"] = lv
                break

    paces: List[float] = []
    for p in reversed(points):
        d = p.get("distance_m")
        t = p.get("duration_min")
        if isinstance(d, (int, float)) and isinstance(t, (int, float)) and t > 0:
            paces.append(float(d) / float(t))
            if len(paces) >= 5:
                break
    out["avg_pace_m_per_min"] = round(sum(paces) / len(paces), 1) if paces else None
    return out


@router.post("/api/training/last-entries", dependencies=[Depends(fresh_cache)])
@router.post("/api/last-entries", dependencies=[Depends(fresh_cache)])
async def post_last_entries(request: Request) -> Dict[str, Any]:
    """Return per-exercise composed "last known values" + last 5 entries as history."""
    payload = await request.json()
    names: List[str] = payload.get("exercises", [])
    limit = int(payload.get("history_limit", 5))
    progression = _cache.get("progression", {})
    out: Dict[str, Any] = {}
    for name in names:
        points = progression.get(name, [])
        composed = _last_nonnull_values(points)
        if composed is None:
            out[name] = None
            continue
        composed["history"] = list(reversed(points[-limit:])) if points else []
        out[name] = composed
    return out


@router.get("/api/training/entries", dependencies=[Depends(fresh_cache)])
@router.get("/api/entries", dependencies=[Depends(fresh_cache)])
def get_entries(since: Optional[str] = None) -> List[Dict[str, Any]]:
    entries = _cache.get("entries", [])
    if since:
        entries = [e for e in entries if (e.get("date") or "") >= since]
    return sorted(entries, key=lambda e: e.get("date") or "", reverse=True)


# Wider net than the strict taxonomy — accounts for future-log entries
# with names that aren't in the session-classifier set yet.
CARDIO_HISTORY_EXERCISES = {"elliptical", "rowing", "stairs", "cycling", "running", "walking", "swimming"}


@router.get("/api/training/cardio-history", dependencies=[Depends(fresh_cache)])
@router.get("/api/cardio-history", dependencies=[Depends(fresh_cache)])
def cardio_history(days: int = 30) -> Dict[str, Any]:
    """Daily cardio minutes + rolling 7-day totals."""
    entries = _cache.get("entries", [])
    today = date.today()
    start = today - timedelta(days=days - 1)

    daily: Dict[str, float] = defaultdict(float)
    for e in entries:
        d = e.get("date", "")
        dur = e.get("duration_min")
        ex = (e.get("exercise") or "").lower()
        if dur and d >= start.isoformat() and ex in CARDIO_HISTORY_EXERCISES:
            daily[d] += float(dur)

    result = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        mins = round(daily.get(d, 0), 1)
        rolling = 0.0
        for j in range(7):
            rd = (start + timedelta(days=i - j)).isoformat()
            rolling += daily.get(rd, 0)
        result.append({
            "date": d,
            "minutes": mins,
            "rolling_7d": round(rolling, 1),
        })

    return {
        "daily": result,
        "target_weekly_min": int(load_targets().get("z2_weekly_min", 150)),
    }
