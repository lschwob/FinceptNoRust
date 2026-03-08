"""Rates & IRD domain: ECB yield curves, EURIBOR, €STR, EUR IRS, EUR futures."""
from __future__ import annotations

from typing import Any, Callable

Handler = Callable[[dict[str, Any]], Any]


def register_handlers() -> dict[str, Handler]:
    from app.domains.rates_ird.handlers import get_rates_ird_handlers
    return get_rates_ird_handlers()
