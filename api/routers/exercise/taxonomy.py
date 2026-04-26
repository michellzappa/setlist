"""Training taxonomy — config loader, seed defaults, group classification.

Config at Bases/Training/training-config.yaml is authoritative. The settings
UI reads/writes it through routes defined here.
"""
from __future__ import annotations

from typing import Any, Dict, List

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.io import atomic_write_text
from api.parsing import _slugify
from api.paths import TRAINING_CONFIG_PATH

# Seed session types — used when training-config.yaml has no session_types key.
# Mirror of the four canonical day types with the exercises that belong to each.
_DEFAULT_SESSION_TYPES: List[Dict[str, Any]] = [
    {
        "id": "upper",
        "label": "Upper",
        "emoji": "💪",
        "exercises": [
            "elliptical", "rowing", "chest press", "diverging seated row",
            "lat pull", "shoulder press", "triceps extension", "biceps",
            "rear delt", "ab crunch",
        ],
    },
    {
        "id": "lower",
        "label": "Lower",
        "emoji": "🦵",
        "exercises": [
            "elliptical", "rowing", "leg press", "leg extension", "leg curl",
            "abduction", "adduction", "calf press", "squat", "ab crunch",
        ],
    },
    {
        "id": "cardio",
        "label": "Cardio",
        "emoji": "🫁",
        "exercises": ["elliptical", "rowing"],
    },
    {
        "id": "yoga",
        "label": "Yoga",
        "emoji": "🧘",
        "exercises": ["surya namaskar"],
    },
]

router = APIRouter(tags=["training"])

# Seed sets used when training-config.yaml is missing (fresh install).
_DEFAULT_CARDIO = {"rowing", "elliptical", "stairs"}
_DEFAULT_MOBILITY = {"surya namaskar", "pull up"}
_DEFAULT_CORE = {"ab crunch", "abdominal"}
_DEFAULT_LOWER = {
    "leg press", "single leg press", "leg extension", "leg curl",
    "calf press", "abduction", "adduction", "squat", "dead lift",
}
# Legacy aliases from the pre-2026-04 schema.
_DEFAULT_ALIASES: Dict[str, str] = {"row": "rowing", "curl": "leg curl"}

_DEFAULT_TYPES = [
    {"id": "strength", "label": "Strength",
     "fields": ["weight", "sets", "reps", "difficulty"], "shade": "strength"},
    {"id": "cardio", "label": "Cardio",
     "fields": ["duration_min", "distance_m", "level"], "shade": "cardio"},
    {"id": "mobility", "label": "Mobility",
     "fields": ["duration_min"], "shade": "mobility"},
    {"id": "core", "label": "Core",
     "fields": ["sets", "reps"], "shade": "strength", "is_finisher": True},
]


def _slug(name: str) -> str:
    return _slugify(name)


def _seed_exercises() -> List[Dict[str, Any]]:
    seed: List[Dict[str, Any]] = []
    for n in sorted(_DEFAULT_CARDIO):
        seed.append({"id": _slug(n), "name": n, "type": "cardio"})
    for n in sorted(_DEFAULT_MOBILITY):
        seed.append({"id": _slug(n), "name": n, "type": "mobility"})
    for n in sorted(_DEFAULT_CORE):
        seed.append({"id": _slug(n), "name": n, "type": "core"})
    for n in sorted(_DEFAULT_LOWER):
        seed.append({"id": _slug(n), "name": n, "type": "strength", "subgroup": "lower"})
    return seed


def _load_config() -> Dict[str, Any]:
    """Config is authoritative. Falls back to seed defaults if YAML missing."""
    if TRAINING_CONFIG_PATH.exists():
        try:
            raw = yaml.safe_load(TRAINING_CONFIG_PATH.read_text(encoding="utf-8")) or {}
            return {
                "types": raw.get("types") or _DEFAULT_TYPES,
                "exercises": raw.get("exercises") or [],
                "aliases": raw.get("aliases") or {},
                "session_types": raw.get("session_types") or _DEFAULT_SESSION_TYPES,
            }
        except Exception as exc:  # noqa: BLE001
            logger.warning("training-config.yaml failed to parse: %s", exc)
    return {
        "types": _DEFAULT_TYPES,
        "exercises": _seed_exercises(),
        "aliases": dict(_DEFAULT_ALIASES),
        "session_types": list(_DEFAULT_SESSION_TYPES),
    }


def _read_config_raw() -> Dict[str, Any]:
    """Raw YAML read that preserves unknown fields for round-trip writes."""
    if not TRAINING_CONFIG_PATH.exists():
        return {}
    try:
        raw = yaml.safe_load(TRAINING_CONFIG_PATH.read_text(encoding="utf-8")) or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("training-config.yaml failed to parse: %s", exc)
        return {}
    return raw if isinstance(raw, dict) else {}


def _save_config(data: Dict[str, Any]) -> None:
    TRAINING_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    body = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    atomic_write_text(TRAINING_CONFIG_PATH, body)


def load_session_types() -> List[Dict[str, Any]]:
    """Public accessor for session-type config. Always returns at least the
    seeded four if no override exists."""
    return list(_load_config().get("session_types") or _DEFAULT_SESSION_TYPES)


def session_type_meta(type_id: str) -> Dict[str, Any]:
    """Lookup label+emoji for a session type id. Falls back to the id itself
    so unknown types from old log files still render something."""
    for st in load_session_types():
        if st.get("id") == type_id:
            return {
                "id": type_id,
                "label": str(st.get("label") or type_id.title()),
                "emoji": str(st.get("emoji") or ""),
            }
    return {"id": type_id, "label": type_id.title() if type_id else "", "emoji": ""}


def _config_lookup() -> Dict[str, str]:
    """lowercased name → type id, merging aliases."""
    cfg = _load_config()
    out: Dict[str, str] = {}
    for ex in cfg["exercises"]:
        name = ex.get("name")
        t = ex.get("type")
        if name and t:
            out[name.lower()] = t
    for alias, target in cfg.get("aliases", {}).items():
        key = target.lower() if isinstance(target, str) else ""
        if key in out:
            out[alias.lower()] = out[key]
    return out


def _config_subgroup_lookup() -> Dict[str, str]:
    cfg = _load_config()
    out: Dict[str, str] = {}
    for ex in cfg["exercises"]:
        name, sub = ex.get("name"), ex.get("subgroup")
        if name and sub:
            out[name.lower()] = sub
    return out


def exercise_group(name: str) -> str:
    """Return the session-day bucket for an exercise name."""
    key = (name or "").lower()
    types = _config_lookup()
    t = types.get(key)
    if t == "cardio":
        return "cardio"
    if t == "mobility":
        return "mobility"
    if t == "core":
        return "core"
    if t == "strength":
        sub = _config_subgroup_lookup().get(key, "upper")
        return sub or "upper"
    return "upper"


def _is_cardio_type(name: str) -> bool:
    t = _config_lookup().get((name or "").lower())
    return t in ("cardio", "mobility")


def day_groups(entries_for_day: List[Dict[str, Any]]) -> set[str]:
    """Groups present on a given day, excluding `core` (finisher, not a type)."""
    return {
        exercise_group(e.get("exercise") or "")
        for e in entries_for_day
        if e.get("exercise")
    } - {"core"}


@router.get("/api/training/config")
@router.get("/api/exercise/config")
def exercise_config() -> Dict[str, Any]:
    return _load_config()


@router.post("/api/training/exercises")
@router.post("/api/exercise/exercises")
async def exercise_add(request: Request) -> Dict[str, Any]:
    """Body: {name, type, subgroup?}. Adds a new exercise to config."""
    payload = await request.json()
    name = str(payload.get("name", "")).strip()
    type_id = str(payload.get("type", "")).strip()
    if not name or not type_id:
        raise HTTPException(status_code=400, detail="name and type are required")
    cfg = _load_config()
    type_ids = {t["id"] for t in cfg["types"]}
    if type_id not in type_ids:
        raise HTTPException(status_code=400, detail=f"unknown type: {type_id}")
    ex_id = _slug(name)
    if any(e.get("id") == ex_id for e in cfg["exercises"]):
        raise HTTPException(status_code=409, detail="exercise already exists")
    new_ex: Dict[str, Any] = {"id": ex_id, "name": name, "type": type_id}
    sub = str(payload.get("subgroup") or "").strip()
    if sub:
        new_ex["subgroup"] = sub
    cfg["exercises"].append(new_ex)
    _save_config(cfg)
    return new_ex


@router.put("/api/training/exercises/{ex_id}")
@router.put("/api/exercise/exercises/{ex_id}")
async def exercise_update(ex_id: str, request: Request) -> Dict[str, Any]:
    """Body: partial {name?, type?, subgroup?}. Renaming does NOT rewrite log files."""
    payload = await request.json()
    cfg = _load_config()
    for ex in cfg["exercises"]:
        if ex.get("id") == ex_id:
            if "name" in payload:
                ex["name"] = str(payload["name"]).strip() or ex["name"]
            if "type" in payload:
                t = str(payload["type"]).strip()
                type_ids = {tt["id"] for tt in cfg["types"]}
                if t and t in type_ids:
                    ex["type"] = t
            if "subgroup" in payload:
                sub = str(payload.get("subgroup") or "").strip()
                if sub:
                    ex["subgroup"] = sub
                else:
                    ex.pop("subgroup", None)
            _save_config(cfg)
            return ex
    raise HTTPException(status_code=404, detail="exercise not found")


@router.delete("/api/training/exercises/{ex_id}")
@router.delete("/api/exercise/exercises/{ex_id}")
def exercise_delete(ex_id: str) -> Dict[str, Any]:
    """Remove an exercise from config. Historical log files are preserved."""
    cfg = _load_config()
    before = len(cfg["exercises"])
    cfg["exercises"] = [e for e in cfg["exercises"] if e.get("id") != ex_id]
    if len(cfg["exercises"]) == before:
        raise HTTPException(status_code=404, detail="exercise not found")
    _save_config(cfg)
    return {"ok": True}


# ── Session types CRUD ──────────────────────────────────────────────────────
# Session types = day types (Upper / Lower / Cardio / Yoga). Editable from
# Settings → Training. Mirror the cannabis-strains pattern: read raw YAML,
# mutate the `session_types` list, write back preserving other keys.

def _normalise_exercises(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if isinstance(value, str):
        return [s.strip() for s in value.split(",") if s.strip()]
    return []


@router.get("/api/training/session-types")
def session_types_list() -> Dict[str, Any]:
    return {"session_types": load_session_types()}


@router.post("/api/training/session-types")
async def session_types_add(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    label = str(payload.get("label") or "").strip()
    emoji = str(payload.get("emoji") or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="label is required")
    raw = _read_config_raw()
    items: List[Dict[str, Any]] = list(raw.get("session_types") or _DEFAULT_SESSION_TYPES)
    base_id = _slug(label) or "type"
    existing = {str(s.get("id")) for s in items if isinstance(s, dict)}
    new_id = base_id
    n = 2
    while new_id in existing:
        new_id = f"{base_id}-{n}"
        n += 1
    new_item = {
        "id": new_id,
        "label": label,
        "emoji": emoji,
        "exercises": _normalise_exercises(payload.get("exercises")),
    }
    items.append(new_item)
    raw["session_types"] = items
    # Ensure other required keys round-trip if file was empty.
    if "exercises" not in raw:
        raw["exercises"] = _load_config().get("exercises", [])
    _save_config(raw)
    return new_item


@router.put("/api/training/session-types/{type_id}")
async def session_types_update(type_id: str, request: Request) -> Dict[str, Any]:
    payload = await request.json()
    raw = _read_config_raw()
    items: List[Dict[str, Any]] = list(raw.get("session_types") or _DEFAULT_SESSION_TYPES)
    found = False
    for item in items:
        if isinstance(item, dict) and str(item.get("id", "")) == type_id:
            if "label" in payload:
                v = str(payload["label"] or "").strip()
                if v:
                    item["label"] = v
            if "emoji" in payload:
                item["emoji"] = str(payload["emoji"] or "").strip()
            if "exercises" in payload:
                item["exercises"] = _normalise_exercises(payload["exercises"])
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail=f"session type not found: {type_id}")
    raw["session_types"] = items
    if "exercises" not in raw:
        raw["exercises"] = _load_config().get("exercises", [])
    _save_config(raw)
    return next(i for i in items if i.get("id") == type_id)


@router.delete("/api/training/session-types/{type_id}")
def session_types_delete(type_id: str) -> Dict[str, Any]:
    raw = _read_config_raw()
    items: List[Dict[str, Any]] = list(raw.get("session_types") or _DEFAULT_SESSION_TYPES)
    before = len(items)
    items = [i for i in items if not (isinstance(i, dict) and str(i.get("id", "")) == type_id)]
    if len(items) == before:
        raise HTTPException(status_code=404, detail=f"session type not found: {type_id}")
    raw["session_types"] = items
    if "exercises" not in raw:
        raw["exercises"] = _load_config().get("exercises", [])
    _save_config(raw)
    return {"ok": True, "id": type_id}
