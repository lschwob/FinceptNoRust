"""FinScript DSL domain: lexer, parser, interpreter, builtins (replaces Rust crate)."""
from __future__ import annotations

from typing import Any, Callable

from app.domains.finscript.handlers import get_finscript_handlers

Handler = Callable[[dict[str, Any]], Any]


def register_handlers() -> dict[str, Handler]:
    """Register FinScript command handlers."""
    return get_finscript_handlers()
