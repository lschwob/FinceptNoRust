"""Market data domain: yfinance, alphavantage, fmp, coingecko, databento, etc."""
from __future__ import annotations

from typing import Any, Callable

from app.domains.market_data.handlers import get_market_data_handlers

Handler = Callable[[dict[str, Any]], Any]


def register_handlers() -> dict[str, Handler]:
    """Register market data command handlers."""
    return get_market_data_handlers()
