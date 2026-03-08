"""Paper trading domain: order/position/P&L engine."""
from __future__ import annotations

from typing import Any, Callable

from app.domains.paper_trading.handlers import get_paper_trading_handlers

Handler = Callable[[dict[str, Any]], Any]


def register_handlers() -> dict[str, Handler]:
    """Register paper trading command handlers."""
    return get_paper_trading_handlers()
