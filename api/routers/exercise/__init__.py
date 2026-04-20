"""Exercise section — split across cache, taxonomy, sessions, progression.

Exports:
  - `router`: combined APIRouter mounted by api.app
  - `load_cache`: called at FastAPI startup to warm the in-memory cache
"""
from __future__ import annotations

from fastapi import APIRouter

from .cache import load_cache
from .progression import router as _progression_router
from .sessions import router as _sessions_router
from .taxonomy import router as _taxonomy_router

router = APIRouter()
router.include_router(_sessions_router)
router.include_router(_progression_router)
router.include_router(_taxonomy_router)

__all__ = ["router", "load_cache"]
