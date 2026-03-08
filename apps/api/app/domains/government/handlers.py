"""Government / economic data command handlers. Stubs return not_implemented until implemented."""
from __future__ import annotations

from typing import Any


def _govt_stub(name: str):
    def _handler(args: dict[str, Any]) -> dict[str, Any]:
        command = args.get("command", "")
        return {
            "success": False,
            "error": f"{name}/{command} not yet implemented",
            "data": [],
        }
    return _handler


# Commands invoked by frontend (from inventory)
GOV_COMMANDS = [
    "execute_government_us_command",
    "execute_canada_gov_command",
    "execute_french_gov_command",
    "execute_swiss_gov_command",
    "execute_spain_data_command",
    "execute_pxweb_command",
    "execute_openafrica_command",
    "execute_data_gov_hk_command",
    "execute_congress_gov_command",
    "execute_wto_command",
]


def get_government_handlers() -> dict[str, Any]:
    return {name: _govt_stub(name) for name in GOV_COMMANDS}
