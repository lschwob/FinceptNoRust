"""Database engine and session for SQLite (replaces rusqlite)."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from sqlmodel import Session, SQLModel

from app.core.config import get_settings

# Import all table models so they register with SQLModel.metadata
from app.domains.database.models import (  # noqa: F401
    AgentConfigRow,
    BacktestRunRow,
    BacktestingProviderRow,
    BacktestingStrategyRow,
    ChatMessageRow,
    ChatSessionRow,
    CredentialRow,
    DataSourceRow,
    InternalMCPToolSettingRow,
    LLMConfigRow,
    LLMGlobalSettingsRow,
    LLMModelConfigRow,
    MCPServerRow,
    MarketDataCacheRow,
    RecordedContextRow,
    SettingRow,
    TabSessionRow,
    UnifiedCacheRow,
    WatchlistRow,
    WatchlistStockRow,
)


def _db_path() -> Path:
    root = get_settings().project_root / "apps" / "api" / "data"
    root.mkdir(parents=True, exist_ok=True)
    return root / "fincept.db"


_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        path = _db_path()
        _engine = create_engine(
            f"sqlite:///{path}",
            connect_args={"check_same_thread": False},
            echo=False,
        )
        SQLModel.metadata.create_all(_engine)
        # Seed default llm_global_settings if missing (mirror Rust schema)
        with _engine.connect() as conn:
            from sqlalchemy import text
            conn.execute(text(
                "INSERT OR IGNORE INTO llm_global_settings (id, temperature, max_tokens, system_prompt) "
                "VALUES (1, 0.7, 2000, 'You are a helpful AI assistant specialized in financial analysis and market data.')"
            ))
            conn.commit()
    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine(),
            class_=Session,
        )
    return _SessionLocal


def get_session() -> Session:
    return get_session_factory()()
