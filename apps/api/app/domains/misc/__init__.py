"""Misc domain: YouTube proxy, orderbook, monitoring, news, jupyter, geocoding, adb, etc."""
from __future__ import annotations

from typing import Any, Callable

from app.domains.misc.handlers import get_misc_handlers

Handler = Callable[[dict[str, Any]], Any]


def register_handlers() -> dict[str, Handler]:
    """Register misc command handlers."""
    return get_misc_handlers()
