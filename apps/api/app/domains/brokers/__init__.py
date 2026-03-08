"""Brokers domain: 15 brokers (auth, market_data, orders, portfolio, websocket) + crypto WS."""
from __future__ import annotations

from typing import Any, Callable

from app.domains.brokers.handlers import get_broker_handlers

Handler = Callable[[dict[str, Any]], Any]


def register_handlers() -> dict[str, Handler]:
    """Register broker command handlers."""
    return get_broker_handlers()
