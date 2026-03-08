"""Analytics domain: technical_analysis, portfolio, backtesting, quantstats, ai_quant_lab, etc."""
from __future__ import annotations

from typing import Any, Callable

from app.domains.analytics.handlers import get_analytics_handlers

Handler = Callable[[dict[str, Any]], Any]


def register_handlers() -> dict[str, Handler]:
    """Register analytics command handlers."""
    return get_analytics_handlers()
