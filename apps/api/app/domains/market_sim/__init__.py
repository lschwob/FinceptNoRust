"""Market simulation domain: matching engine, orderbook, 8 market agents."""
from __future__ import annotations

from typing import Any, Callable

from app.domains.market_sim.handlers import get_market_sim_handlers

Handler = Callable[[dict[str, Any]], Any]


def register_handlers() -> dict[str, Handler]:
    """Register market simulation command handlers."""
    return get_market_sim_handlers()
