"""Settings persistence and normalization."""
from __future__ import annotations

from typing import Any, Dict

from api import logger
import api.paths as paths
from api.storage.plain_yaml import PlainYamlDocument, read_yaml_document, write_yaml_document
from api.storage.schemas import deep_merge, filter_settings_patch, sanitize_settings

SECTION_KEY_ALIASES = {
    "exercise": "training",
}

ANIMATION_KEY_ALIASES = {
    "exercise_complete": "training_complete",
}

DEFAULT_SETTINGS: Dict[str, Any] = {
    "day_phases": [
        {
            "id": "morning", "label": "Morning", "emoji": "🌅",
            "start": "00:00", "cutoff": "11:00",
            "messages": [
                {"greeting": "Good morning", "subtitle": "Start your day strong — check habits and supplements"},
            ],
        },
        {
            "id": "afternoon", "label": "Afternoon", "emoji": "☀️",
            "start": "11:00", "cutoff": "17:00",
            "messages": [
                {"greeting": "Good afternoon", "subtitle": "Midday check-in — how's nutrition and training?"},
            ],
        },
        {
            "id": "evening", "label": "Evening", "emoji": "🌙",
            "start": "17:00", "cutoff": "22:00",
            "messages": [
                {"greeting": "Good evening", "subtitle": "Wind down — review the day and prep for tomorrow"},
            ],
        },
    ],
    "section_order": [
        "next", "training", "nutrition", "habits", "chores", "tasks", "groceries", "supplements",
        "cannabis", "caffeine", "gut", "health", "sleep", "body",
        "weather", "calendar", "air",
    ],
    "targets": {
        "protein_min_g": 130,
        "protein_max_g": 150,
        "fat_min_g": 55,
        "fat_max_g": 75,
        "weight_min_kg": 83,
        "weight_max_kg": 85,
        "fat_min_pct": 12,
        "fat_max_pct": 15,
        "carbs_min_g": 160,
        "carbs_max_g": 240,
        "fiber_min_g": 25,
        "fiber_max_g": 35,
        "kcal_min": 2000,
        "kcal_max": 2400,
        "z2_weekly_min": 150,
        "sleep_target_h": 8,
        "fasting_min_h": 14,
        "fasting_max_h": 16,
        "evening_hour_24h": 19,
        "post_meal_grace_min": 30,
    },
    "units": {
        "weight": "kg",
        "distance": "km",
    },
    "theme": "system",
    "icon_color": "#3b82f6",  # palette blue — matches --brand-accent
    "animations": {
        "training_complete": True,
        "first_meal": True,
        "histograms_raise": True,
    },
    "sections": {
        # Color values come from the curated Tailwind-500 palette in
        # `lib/palette.ts`; update both lists together if you add a swatch.
        "next":         {"label": "Next",         "emoji": "⏭️", "color": "#0891b2",  "tagline": "Timely actions for today", "show_in_nav": True, "show_on_dashboard": False},
        "training":     {"label": "Training",     "emoji": "🏋️", "color": "#f97316",  "tagline": "Sessions, progressions & PRs"},
        "nutrition":    {"label": "Nutrition",    "emoji": "🍱", "color": "#f59e0b",  "tagline": "Meals, macros & fasting"},
        "habits":       {"label": "Habits",       "emoji": "✅", "color": "#3b82f6",  "tagline": "Morning, afternoon & evening routines"},
        "chores":       {"label": "Chores",       "emoji": "🧹", "color": "#0ea5e9",  "tagline": "Recurring tasks, deferrable"},
        "tasks":        {"label": "Tasks",        "emoji": "✨", "color": "#8b5cf6",  "tagline": "Inbox, projects & today"},
        "groceries":    {"label": "Groceries",    "emoji": "🛒", "color": "#10b981",  "tagline": "Smart grocery checklist"},
        "supplements":  {"label": "Supplements",  "emoji": "💊", "color": "#ec4899",  "tagline": "Daily stack & streaks"},
        "cannabis":     {"label": "Cannabis",     "emoji": "🌿", "color": "#22c55e",  "tagline": "Log sessions, strains & usage"},
        "caffeine":     {"label": "Caffeine",     "emoji": "☕", "color": "#f43f5e",  "tagline": "V60s, matcha & time of day"},
        "gut":          {"label": "Gut",          "emoji": "🌀", "color": "#eab308",  "tagline": "Bristol, blood & discomfort"},
        "health":       {"label": "Health",       "emoji": "💓", "color": "#a855f7",  "tagline": "HRV, weight & vitals"},
        "sleep":        {"label": "Sleep",        "emoji": "🌙", "color": "#6366f1",  "tagline": "Score, stages & trends"},
        "body":         {"label": "Body",         "emoji": "⚖️", "color": "#14b8a6",  "tagline": "Weight, body fat & trends"},
        "weather":      {"label": "Weather",      "emoji": "☀️", "color": "#06b6d4",  "tagline": "Today's conditions & forecast", "show_in_nav": False, "show_on_dashboard": False},
        "calendar":     {"label": "Calendar",     "emoji": "📅", "color": "#8b5cf6",  "tagline": "Today's events at a glance",   "show_in_nav": False, "show_on_dashboard": False},
        "air":          {"label": "Air",          "emoji": "🌬️", "color": "#84cc16",  "tagline": "CO₂, temperature & humidity"},
        "correlations": {"label": "Insights",     "emoji": "🔗", "color": "#ef4444",  "tagline": "Cross-section patterns"},
    },
    "weather": {
        "location": "",
        "units": "celsius",
    },
    "calendar": {
        "show_all_day": True,
        "enabled_calendars": None,
    },
    "nutrition": {
        # Macro colors, picked from the curated palette in `lib/palette.ts`.
        # Independent of the Nutrition section accent so each macro reads as
        # its own thing on charts and stat tiles.
        "macro_colors": {
            "protein": "#ef4444",  # red
            "fat":     "#f59e0b",  # amber
            "carbs":   "#3b82f6",  # blue
            "fiber":   "#10b981",  # emerald
            "kcal":    "#eab308",  # yellow
            "fasting": "#8b5cf6",  # violet
        },
    },
}


def _canonicalize_section_order(value: Any) -> Any:
    if not isinstance(value, list):
        return value
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        key = SECTION_KEY_ALIASES.get(str(item), str(item))
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def _canonicalize_sections(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    out: Dict[str, Any] = {}
    for key, meta in value.items():
        canonical = SECTION_KEY_ALIASES.get(str(key), str(key))
        if canonical == "training" and isinstance(meta, dict):
            normalized_meta = dict(meta)
            label = str(normalized_meta.get("label") or "").strip().lower()
            if label == "exercise":
                normalized_meta["label"] = "Training"
            meta = normalized_meta
        if canonical in out and isinstance(out[canonical], dict) and isinstance(meta, dict):
            out[canonical] = deep_merge(out[canonical], meta)
        else:
            out[canonical] = meta
    return out


def _canonicalize_animations(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    out = dict(value)
    if "training_complete" not in out and "exercise_complete" in out:
        out["training_complete"] = out["exercise_complete"]
    out.pop("exercise_complete", None)
    return out


def _canonicalize_settings(data: Any) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return {}
    out = dict(data)
    if "section_order" in out:
        out["section_order"] = _canonicalize_section_order(out["section_order"])
    if "sections" in out:
        out["sections"] = _canonicalize_sections(out["sections"])
    if "animations" in out:
        out["animations"] = _canonicalize_animations(out["animations"])
    return out


def _read_raw_document() -> PlainYamlDocument:
    try:
        document = read_yaml_document(paths.SETTINGS_PATH, default={})
    except Exception as exc:  # noqa: BLE001
        logger.warning("settings.yaml failed to parse: %s", exc)
        return PlainYamlDocument(data={}, header="")
    if not isinstance(document.data, dict):
        return PlainYamlDocument(data={}, header=document.header)
    return document


def load_settings() -> Dict[str, Any]:
    raw = _canonicalize_settings(_read_raw_document().data)
    return sanitize_settings(raw, DEFAULT_SETTINGS)


def save_settings_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    document = _read_raw_document()
    raw = _canonicalize_settings(document.data if isinstance(document.data, dict) else {})
    filtered_patch = filter_settings_patch(_canonicalize_settings(patch))
    merged_raw = deep_merge(raw, filtered_patch)
    write_yaml_document(
        paths.SETTINGS_PATH,
        PlainYamlDocument(data=merged_raw, header=document.header),
    )
    return sanitize_settings(merged_raw, DEFAULT_SETTINGS)


def load_targets() -> Dict[str, Any]:
    merged = load_settings()
    targets = merged.get("targets")
    if not isinstance(targets, dict):
        return dict(DEFAULT_SETTINGS["targets"])
    return {**DEFAULT_SETTINGS["targets"], **targets}


def load_day_phases() -> list[Dict[str, Any]]:
    merged = load_settings()
    phases = merged.get("day_phases") or DEFAULT_SETTINGS["day_phases"]
    out: list[Dict[str, Any]] = []
    for phase in phases:
        if not isinstance(phase, dict):
            continue
        phase_id = str(phase.get("id") or "").strip().lower()
        if not phase_id:
            continue
        raw_messages = phase.get("messages") or []
        messages: list[Dict[str, str]] = []
        if isinstance(raw_messages, list):
            for message in raw_messages:
                if not isinstance(message, dict):
                    continue
                greeting = str(message.get("greeting") or "").strip()
                subtitle = str(message.get("subtitle") or "").strip()
                if greeting or subtitle:
                    messages.append({"greeting": greeting, "subtitle": subtitle})
        out.append({
            "id": phase_id,
            "label": str(phase.get("label") or phase_id.title()),
            "emoji": str(phase.get("emoji") or ""),
            "start": str(phase.get("start") or "00:00"),
            "cutoff": str(phase.get("cutoff") or "23:59"),
            "messages": messages,
        })
    if not out:
        return list(DEFAULT_SETTINGS["day_phases"])
    return out
