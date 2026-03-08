"""Domain handlers for the invoke bridge. Each domain exposes register_handlers()."""
from __future__ import annotations

from typing import Any, Callable

Handler = Callable[[dict[str, Any]], Any]


def get_all_handlers() -> dict[str, Handler]:
    """Aggregate handlers from all domains."""
    from app.domains.market_data import register_handlers as market_data_handlers
    from app.domains.government import register_handlers as government_handlers
    from app.domains.analytics import register_handlers as analytics_handlers
    from app.domains.brokers import register_handlers as brokers_handlers
    from app.domains.agents import register_handlers as agents_handlers
    from app.domains.database import register_handlers as database_handlers
    from app.domains.finscript import register_handlers as finscript_handlers
    from app.domains.paper_trading import register_handlers as paper_trading_handlers
    from app.domains.market_sim import register_handlers as market_sim_handlers
    from app.domains.misc import register_handlers as misc_handlers
    from app.domains.rates_ird import register_handlers as rates_ird_handlers

    out: dict[str, Handler] = {}
    for reg in (
        market_data_handlers,
        government_handlers,
        analytics_handlers,
        brokers_handlers,
        agents_handlers,
        database_handlers,
        finscript_handlers,
        paper_trading_handlers,
        market_sim_handlers,
        misc_handlers,
        rates_ird_handlers,
    ):
        out.update(reg())
    return out
