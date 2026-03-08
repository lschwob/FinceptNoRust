"""Agents / AI / MCP command handlers. Stubs return not_implemented until implemented."""
from __future__ import annotations

from typing import Any


def _stub(name: str):
    def _handler(args: dict[str, Any]) -> dict[str, Any]:
        return {"status": "not_implemented_yet", "command": name, "message": "Agents domain not yet implemented."}
    return _handler


AGENT_COMMANDS = [
    "kill_mcp_server",
    "send_mcp_notification",
    "register_mcp_tool_result",
    "agno_get_leaderboard",
    "agno_get_recent_decisions",
    "create_alpha_competition",
    "run_alpha_cycle",
    "start_alpha_competition",
    "get_alpha_leaderboard",
    "get_alpha_model_decisions",
    "stop_alpha_competition",
]


def get_agents_handlers() -> dict[str, Any]:
    return {name: _stub(name) for name in AGENT_COMMANDS}
