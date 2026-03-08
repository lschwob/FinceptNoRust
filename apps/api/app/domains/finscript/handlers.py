"""FinScript DSL command handlers. Stubs return not_implemented until implemented."""
from __future__ import annotations

from typing import Any


def _stub(name: str):
    def _handler(args: dict[str, Any]) -> dict[str, Any]:
        return {"status": "not_implemented_yet", "command": name, "message": "FinScript DSL not yet ported to Python."}
    return _handler


FINSCRIPT_COMMANDS = [
    "finscript_compile",
    "finscript_execute",
    "finscript_validate",
]


def get_finscript_handlers() -> dict[str, Any]:
    return {name: _stub(name) for name in FINSCRIPT_COMMANDS}
