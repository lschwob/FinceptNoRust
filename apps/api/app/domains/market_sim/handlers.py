"""Market simulation command handlers. Stubs return not_implemented until implemented."""
from __future__ import annotations

from typing import Any


def _stub(name: str):
    def _handler(args: dict[str, Any]) -> dict[str, Any]:
        return {"status": "not_implemented_yet", "command": name, "message": "Market sim not yet ported."}
    return _handler


MARKET_SIM_COMMANDS = [
    "market_sim_start",
    "market_sim_stop",
    "market_sim_get_state",
]


def get_market_sim_handlers() -> dict[str, Any]:
    return {name: _stub(name) for name in MARKET_SIM_COMMANDS}
