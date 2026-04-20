"""Calendar — today's + upcoming events.

Reads macOS Calendar via the bundled CalendarHelper.app (see
`tools/calendar_helper/`). That helper is a tiny Obj-C binary with an
embedded Info.plist declaring NSCalendarsFullAccessUsageDescription, so
macOS 14+ can show a proper Calendar-access prompt the first time it
runs and persist the grant in TCC. The helper writes its JSON output to
a temp file we pass via `SETLIST_CAL_OUT`.

If the helper is missing or access is denied we return an empty event
list with an `error` string — never fake data.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter

from api import logger
from api.routers.settings import _load_settings

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

HELPER_TIMEOUT = 10.0
REPO_ROOT = Path(__file__).resolve().parents[2]
HELPER_APP = REPO_ROOT / "tools/calendar_helper/CalendarHelper.app"


def _macos_events(days: int = 7) -> Tuple[List[Dict[str, Any]], List[Dict[str, str]], Optional[str]]:
    """Invoke CalendarHelper.app via `open -W` and read its JSON output.
    Returns (events, calendars, error). error is None on success."""
    if not HELPER_APP.exists():
        return [], [], f"CalendarHelper.app not built — run tools/calendar_helper/build.sh"

    with tempfile.NamedTemporaryFile(prefix="setlist-cal-", suffix=".json", delete=False) as tmp:
        out_path = tmp.name
    try:
        env_args = [
            "--env", f"SETLIST_CAL_OUT={out_path}",
            "--env", f"SETLIST_CAL_DAYS={days}",
        ]
        result = subprocess.run(
            ["/usr/bin/open", "-W", "-g", str(HELPER_APP), *env_args],
            capture_output=True,
            text=True,
            timeout=HELPER_TIMEOUT,
            check=False,
        )
        if result.returncode != 0:
            msg = f"helper exited {result.returncode}: {result.stderr.strip() or 'no stderr'}"
            logger.info("calendar: %s", msg)
            return [], [], msg
        if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
            return [], [], "Calendar access denied — grant access to CalendarHelper in System Settings › Privacy › Calendars"
        with open(out_path, "r", encoding="utf-8") as fh:
            payload = json.loads(fh.read() or "{}")
        # Back-compat: old helper returned a bare list of events.
        if isinstance(payload, list):
            return payload, [], None
        return payload.get("events") or [], payload.get("calendars") or [], None
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        logger.warning("calendar: helper unavailable or timed out: %s", exc)
        return [], [], f"helper unavailable: {exc}"
    except json.JSONDecodeError as exc:
        logger.warning("calendar: helper output unparseable: %s", exc)
        return [], [], f"helper output unparseable: {exc}"
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


def _normalize(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Trim past events, sort by start time, cap at 20."""
    now = datetime.now().astimezone()
    cleaned: List[Dict[str, Any]] = []
    for ev in events:
        try:
            start_str = str(ev.get("start") or "")
            end_str = str(ev.get("end") or "")
            # JXA's toISOString is UTC ("Z"); fromisoformat handles "+00:00".
            start_iso = start_str.replace("Z", "+00:00")
            end_iso = end_str.replace("Z", "+00:00")
            start_dt = datetime.fromisoformat(start_iso)
            end_dt = datetime.fromisoformat(end_iso) if end_iso else start_dt
            if start_dt.tzinfo is None:
                start_dt = start_dt.astimezone()
                end_dt = end_dt.astimezone()
        except Exception:  # noqa: BLE001
            continue
        if end_dt < now:
            continue
        cleaned.append({
            "title": str(ev.get("title") or "(no title)"),
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "calendar": str(ev.get("calendar") or ""),
            "all_day": bool(ev.get("all_day")),
            "location": str(ev.get("location") or ""),
        })
    cleaned.sort(key=lambda e: e["start"])
    return cleaned[:20]


@router.get("")
def calendar_today() -> Dict[str, Any]:
    settings = _load_settings()
    cfg = settings.get("calendar") or {}
    show_all_day = cfg.get("show_all_day", True)
    # None / missing = show all; list (even empty) = explicit allowlist.
    enabled = cfg.get("enabled_calendars")

    raw, calendars, error = _macos_events()
    events = _normalize(raw) if raw else []

    if isinstance(enabled, list):
        allow = set(enabled)
        events = [e for e in events if e.get("calendar") in allow]
    if not show_all_day:
        events = [e for e in events if not e.get("all_day")]

    today_local = datetime.now().astimezone().date()

    def _is_today(iso: str) -> bool:
        try:
            return datetime.fromisoformat(iso).astimezone().date() == today_local
        except ValueError:
            return False

    today_events = [e for e in events if _is_today(e["start"])]
    return {
        "today": today_local.isoformat(),
        "today_count": len(today_events),
        "events": events,
        "calendars": calendars,
        "error": error,
    }
