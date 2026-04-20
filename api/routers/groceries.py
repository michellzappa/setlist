"""Groceries — smart checklist with low-stock tracking.

Data lives in Groceries/groceries.yaml. A grocery item has:
  low:         true → running short, need to buy
  last_bought: ISO date stamped when low flips true → false
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Any, Dict

import yaml
from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from api import logger
from api.paths import GROCERIES_DIR, GROCERIES_PATH

router = APIRouter(prefix="/api/groceries", tags=["groceries"])

CATEGORIES = ["produce", "dairy", "grains", "meat", "frozen", "household", "other"]


def _load() -> Dict[str, Any]:
    if not GROCERIES_PATH.exists():
        return {"items": []}
    try:
        return yaml.safe_load(GROCERIES_PATH.read_text()) or {"items": []}
    except Exception as exc:  # noqa: BLE001
        logger.warning("groceries.yaml failed to parse: %s", exc)
        return {"items": []}


def _save(data: Dict[str, Any]) -> None:
    GROCERIES_DIR.mkdir(parents=True, exist_ok=True)
    body = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    GROCERIES_PATH.write_text(body, encoding="utf-8")


def _norm(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise field types after loading."""
    items = []
    for it in data.get("items", []):
        last_bought = it.get("last_bought")
        items.append({
            "id": str(it.get("id", "")),
            "name": str(it.get("name", "")),
            "category": str(it.get("category", "other")),
            "emoji": str(it.get("emoji", "📦")),
            "low": bool(it.get("low", False)),
            "last_bought": str(last_bought) if last_bought else None,
        })
    return {"items": items}


@router.get("")
def groceries_list() -> Dict[str, Any]:
    return _norm(_load())


@router.post("/item")
async def groceries_add(request: Request) -> Dict[str, Any]:
    """Body: {name, category?, emoji?}. Adds a new grocery item."""
    payload = await request.json()
    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    data = _load()
    new_item = {
        "id": str(uuid.uuid4())[:8],
        "name": name,
        "category": str(payload.get("category", "other")).strip() or "other",
        "emoji": str(payload.get("emoji", "📦")).strip() or "📦",
        "low": False,
        "last_bought": None,
    }
    data.setdefault("items", []).append(new_item)
    _save(data)
    return new_item


@router.patch("/item/{item_id}")
async def groceries_patch(item_id: str, request: Request) -> Dict[str, Any]:
    """Body: partial fields {low?, name?, category?, emoji?}. Updates one item.

    When `low` flips from true to false, stamps `last_bought` with today.
    """
    payload = await request.json()
    data = _load()
    for it in data.get("items", []):
        if it.get("id") == item_id:
            if "low" in payload:
                new_low = bool(payload["low"])
                if it.get("low") and not new_low:
                    it["last_bought"] = date.today().isoformat()
                it["low"] = new_low
            if "name" in payload:
                it["name"] = str(payload["name"]).strip()
            if "category" in payload:
                it["category"] = str(payload["category"]).strip() or "other"
            if "emoji" in payload:
                it["emoji"] = str(payload["emoji"]).strip() or "📦"
            _save(data)
            return it
    raise HTTPException(status_code=404, detail="item not found")


@router.delete("/item/{item_id}")
def groceries_delete(item_id: str) -> Dict[str, Any]:
    data = _load()
    before = len(data.get("items", []))
    data["items"] = [it for it in data.get("items", []) if it.get("id") != item_id]
    if len(data["items"]) == before:
        raise HTTPException(status_code=404, detail="item not found")
    _save(data)
    return {"ok": True}
