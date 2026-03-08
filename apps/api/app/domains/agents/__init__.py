"""Agents domain: llm_models, agents, mcp, workflow, report_generator."""
from __future__ import annotations

from typing import Any, Callable

from app.domains.agents.handlers import get_agents_handlers

Handler = Callable[[dict[str, Any]], Any]


def register_handlers() -> dict[str, Handler]:
    """Register agents / AI command handlers."""
    return get_agents_handlers()
