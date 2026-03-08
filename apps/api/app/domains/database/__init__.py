"""Database domain: aiosqlite + SQLModel (replaces rusqlite)."""
from __future__ import annotations

from typing import Any, Callable

from app.domains.database.handlers import get_database_handlers

Handler = Callable[[dict[str, Any]], Any]


def register_handlers() -> dict[str, Handler]:
    """Register database command handlers."""
    return get_database_handlers()
