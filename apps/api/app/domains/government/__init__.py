"""Government / economic data: fred, worldbank, imf, ecb, bls, eia, cftc, sec, edgar, etc."""
from __future__ import annotations

from typing import Any, Callable

from app.domains.government.handlers import get_government_handlers

Handler = Callable[[dict[str, Any]], Any]


def register_handlers() -> dict[str, Handler]:
    """Register government data command handlers."""
    return get_government_handlers()
