"""SQLModel table definitions (mirror of Rust schema)."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel


class SettingRow(SQLModel, table=True):
    __tablename__ = "settings"
    setting_key: str = Field(primary_key=True)
    setting_value: str
    category: Optional[str] = None
    updated_at: Optional[str] = None


class CredentialRow(SQLModel, table=True):
    __tablename__ = "credentials"
    id: Optional[int] = Field(default=None, primary_key=True)
    service_name: str
    username: Optional[str] = None
    password: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    additional_data: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LLMConfigRow(SQLModel, table=True):
    __tablename__ = "llm_configs"
    provider: str = Field(primary_key=True)
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: str
    is_active: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LLMGlobalSettingsRow(SQLModel, table=True):
    __tablename__ = "llm_global_settings"
    id: Optional[int] = Field(default=1, primary_key=True)
    temperature: float = 0.7
    max_tokens: int = 2000
    system_prompt: str = ""


class LLMModelConfigRow(SQLModel, table=True):
    __tablename__ = "llm_model_configs"
    id: str = Field(primary_key=True)
    provider: str
    model_id: str
    display_name: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    is_enabled: int = 1
    is_default: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ChatSessionRow(SQLModel, table=True):
    __tablename__ = "chat_sessions"
    session_uuid: str = Field(primary_key=True)
    title: str
    message_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ChatMessageRow(SQLModel, table=True):
    __tablename__ = "chat_messages"
    id: str = Field(primary_key=True)
    session_uuid: str
    role: str
    content: str
    timestamp: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    tokens_used: Optional[int] = None


class DataSourceRow(SQLModel, table=True):
    __tablename__ = "data_sources"
    id: str = Field(primary_key=True)
    alias: str
    display_name: str
    description: Optional[str] = None
    ds_type: str = Field(sa_column=Column("type", String, nullable=False))
    provider: str
    category: Optional[str] = None
    config: str
    enabled: int = 1
    tags: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class MCPServerRow(SQLModel, table=True):
    __tablename__ = "mcp_servers"
    id: str = Field(primary_key=True)
    name: str
    description: str = ""
    command: str
    args: Optional[str] = None
    env: Optional[str] = None
    category: str = ""
    icon: str = ""
    enabled: int = 1
    auto_start: int = 0
    status: str = "stopped"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class InternalMCPToolSettingRow(SQLModel, table=True):
    __tablename__ = "internal_mcp_tool_settings"
    tool_name: str = Field(primary_key=True)
    category: str
    is_enabled: int = 1
    updated_at: Optional[str] = None


class BacktestingProviderRow(SQLModel, table=True):
    __tablename__ = "backtesting_providers"
    id: str = Field(primary_key=True)
    name: str
    adapter_type: str
    config: str
    enabled: int = 1
    is_active: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class BacktestingStrategyRow(SQLModel, table=True):
    __tablename__ = "backtesting_strategies"
    id: str = Field(primary_key=True)
    name: str
    description: Optional[str] = None
    version: str = "1.0.0"
    author: Optional[str] = None
    provider_type: str
    strategy_type: str
    strategy_definition: str
    tags: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class BacktestRunRow(SQLModel, table=True):
    __tablename__ = "backtest_runs"
    id: str = Field(primary_key=True)
    strategy_id: Optional[str] = None
    provider_name: str
    config: str
    results: Optional[str] = None
    status: str
    performance_metrics: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_seconds: Optional[int] = None


class RecordedContextRow(SQLModel, table=True):
    __tablename__ = "recorded_contexts"
    id: str = Field(primary_key=True)
    tab_name: str
    data_type: str
    label: Optional[str] = None
    raw_data: str
    context_metadata: Optional[str] = Field(default=None, sa_column=Column("metadata", String, nullable=True))
    data_size: int = 0
    created_at: Optional[str] = None
    tags: Optional[str] = None


class WatchlistRow(SQLModel, table=True):
    __tablename__ = "watchlists"
    id: str = Field(primary_key=True)
    name: str
    description: Optional[str] = None
    color: str = "#FFA500"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class WatchlistStockRow(SQLModel, table=True):
    __tablename__ = "watchlist_stocks"
    id: str = Field(primary_key=True)
    watchlist_id: str
    symbol: str
    added_at: Optional[str] = None
    notes: Optional[str] = None


class AgentConfigRow(SQLModel, table=True):
    __tablename__ = "agent_configs"
    id: str = Field(primary_key=True)
    name: str
    description: Optional[str] = None
    config_json: str
    category: str = "general"
    is_default: int = 0
    is_active: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class MarketDataCacheRow(SQLModel, table=True):
    __tablename__ = "market_data_cache"
    symbol: str = Field(primary_key=True)
    category: str = Field(primary_key=True)
    quote_data: str = ""
    updated_at: Optional[str] = None


class UnifiedCacheRow(SQLModel, table=True):
    __tablename__ = "unified_cache"
    cache_key: str = Field(primary_key=True)
    category: str
    data: str
    ttl_seconds: int
    created_at: int
    expires_at: int
    last_accessed_at: int
    hit_count: int = 0
    size_bytes: int = 0


class TabSessionRow(SQLModel, table=True):
    __tablename__ = "tab_sessions"
    tab_id: str = Field(primary_key=True)
    tab_name: str
    state: str
    scroll_position: Optional[str] = None
    active_filters: Optional[str] = None
    selected_items: Optional[str] = None
    updated_at: int = 0
    created_at: int = 0
