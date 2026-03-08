"""Database and cache command handlers (replace Rust database/commands)."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any

from sqlmodel import select

from app.domains.database.engine import get_session
from app.domains.database.models import (
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


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _ts() -> int:
    return int(time.time())


# ----- Health & Settings -----


def _db_check_health(args: dict[str, Any]) -> bool:
    try:
        session = get_session()
        session.exec(select(SettingRow).limit(1)).first()
        session.close()
        return True
    except Exception:
        return False


def _db_save_setting(args: dict[str, Any]) -> dict[str, Any]:
    key = args["key"]
    value = args["value"]
    category = args.get("category")
    session = get_session()
    try:
        row = session.get(SettingRow, key)
        if row:
            row.setting_value = value
            row.category = category
            row.updated_at = _now()
        else:
            session.add(SettingRow(setting_key=key, setting_value=value, category=category, updated_at=_now()))
        session.commit()
        return {"success": True, "message": "Setting saved successfully"}
    finally:
        session.close()


def _db_get_setting(args: dict[str, Any]) -> str | None:
    key = args["key"]
    session = get_session()
    try:
        row = session.get(SettingRow, key)
        return row.setting_value if row else None
    finally:
        session.close()


def _db_get_all_settings(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(SettingRow)).all()
        return [
            {
                "setting_key": r.setting_key,
                "setting_value": r.setting_value,
                "category": r.category,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    finally:
        session.close()


# ----- Credentials -----


def _db_save_credential(args: dict[str, Any]) -> dict[str, Any]:
    cred = args["credential"]
    session = get_session()
    try:
        existing = session.exec(
            select(CredentialRow).where(CredentialRow.service_name == cred["service_name"])
        ).first()
        now = _now()
        if existing:
            existing.username = cred.get("username")
            existing.password = cred.get("password")
            existing.api_key = cred.get("api_key")
            existing.api_secret = cred.get("api_secret")
            existing.additional_data = json.dumps(cred.get("additional_data")) if cred.get("additional_data") else None
            existing.updated_at = now
        else:
            session.add(
                CredentialRow(
                    service_name=cred["service_name"],
                    username=cred.get("username"),
                    password=cred.get("password"),
                    api_key=cred.get("api_key"),
                    api_secret=cred.get("api_secret"),
                    additional_data=json.dumps(cred.get("additional_data")) if cred.get("additional_data") else None,
                    created_at=now,
                    updated_at=now,
                )
            )
        session.commit()
        return {"success": True, "message": f"Saved credential for {cred['service_name']}"}
    finally:
        session.close()


def _db_get_credentials(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(CredentialRow)).all()
        return [
            {
                "id": r.id,
                "service_name": r.service_name,
                "username": r.username,
                "password": r.password,
                "api_key": r.api_key,
                "api_secret": r.api_secret,
                "additional_data": r.additional_data,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_get_credential_by_service(args: dict[str, Any]) -> dict[str, Any] | None:
    name = args.get("serviceName") or args.get("service_name")
    session = get_session()
    try:
        row = session.exec(select(CredentialRow).where(CredentialRow.service_name == name)).first()
        if not row:
            return None
        return {
            "id": row.id,
            "service_name": row.service_name,
            "username": row.username,
            "password": row.password,
            "api_key": row.api_key,
            "api_secret": row.api_secret,
            "additional_data": row.additional_data,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
    finally:
        session.close()


def _db_delete_credential(args: dict[str, Any]) -> dict[str, Any]:
    id_ = args["id"]
    session = get_session()
    try:
        row = session.get(CredentialRow, id_)
        if row:
            session.delete(row)
            session.commit()
        return {"success": True, "message": "Deleted credential"}
    finally:
        session.close()


# ----- LLM -----


def _db_get_llm_configs(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(LLMConfigRow)).all()
        return [
            {
                "provider": r.provider,
                "api_key": r.api_key,
                "base_url": r.base_url,
                "model": r.model,
                "is_active": bool(r.is_active),
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_save_llm_config(args: dict[str, Any]) -> str:
    cfg = args["config"]
    session = get_session()
    try:
        row = session.get(LLMConfigRow, cfg["provider"])
        now = _now()
        if row:
            row.api_key = cfg.get("api_key")
            row.base_url = cfg.get("base_url")
            row.model = cfg.get("model", row.model)
            row.is_active = 1 if cfg.get("is_active") else 0
            row.updated_at = now
        else:
            session.add(
                LLMConfigRow(
                    provider=cfg["provider"],
                    api_key=cfg.get("api_key"),
                    base_url=cfg.get("base_url"),
                    model=cfg.get("model", ""),
                    is_active=1 if cfg.get("is_active") else 0,
                    created_at=now,
                    updated_at=now,
                )
            )
        session.commit()
        return "LLM config saved successfully"
    finally:
        session.close()


def _db_get_llm_global_settings(args: dict[str, Any]) -> dict[str, Any]:
    session = get_session()
    try:
        row = session.get(LLMGlobalSettingsRow, 1)
        if not row:
            return {"temperature": 0.7, "max_tokens": 2000, "system_prompt": ""}
        return {"temperature": row.temperature, "max_tokens": row.max_tokens, "system_prompt": row.system_prompt}
    finally:
        session.close()


def _db_save_llm_global_settings(args: dict[str, Any]) -> str:
    s = args["settings"]
    session = get_session()
    try:
        row = session.get(LLMGlobalSettingsRow, 1)
        if row:
            row.temperature = s.get("temperature", 0.7)
            row.max_tokens = s.get("max_tokens", 2000)
            row.system_prompt = s.get("system_prompt", "")
        else:
            session.add(
                LLMGlobalSettingsRow(
                    id=1,
                    temperature=s.get("temperature", 0.7),
                    max_tokens=s.get("max_tokens", 2000),
                    system_prompt=s.get("system_prompt", ""),
                )
            )
        session.commit()
        return "LLM global settings saved successfully"
    finally:
        session.close()


def _db_set_active_llm_provider(args: dict[str, Any]) -> str:
    provider = args["provider"]
    session = get_session()
    try:
        for row in session.exec(select(LLMConfigRow)).all():
            row.is_active = 1 if row.provider == provider else 0
        session.commit()
        return "Active LLM provider updated"
    finally:
        session.close()


def _db_get_llm_model_configs(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(LLMModelConfigRow)).all()
        return [
            {
                "id": r.id,
                "provider": r.provider,
                "model_id": r.model_id,
                "display_name": r.display_name,
                "api_key": r.api_key,
                "base_url": r.base_url,
                "is_enabled": bool(r.is_enabled),
                "is_default": bool(r.is_default),
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_save_llm_model_config(args: dict[str, Any]) -> dict[str, Any]:
    cfg = args["config"]
    session = get_session()
    try:
        row = session.get(LLMModelConfigRow, cfg["id"])
        now = _now()
        if row:
            row.model_id = cfg.get("model_id", row.model_id)
            row.display_name = cfg.get("display_name", row.display_name)
            row.api_key = cfg.get("api_key")
            row.base_url = cfg.get("base_url")
            row.is_enabled = 1 if cfg.get("is_enabled") else 0
            row.is_default = 1 if cfg.get("is_default") else 0
            row.updated_at = now
        else:
            session.add(
                LLMModelConfigRow(
                    id=cfg["id"],
                    provider=cfg["provider"],
                    model_id=cfg["model_id"],
                    display_name=cfg["display_name"],
                    api_key=cfg.get("api_key"),
                    base_url=cfg.get("base_url"),
                    is_enabled=1 if cfg.get("is_enabled", True) else 0,
                    is_default=1 if cfg.get("is_default") else 0,
                    created_at=now,
                    updated_at=now,
                )
            )
        session.commit()
        return {"success": True, "message": "Saved"}
    finally:
        session.close()


def _db_delete_llm_model_config(args: dict[str, Any]) -> dict[str, Any]:
    id_ = args["id"]
    session = get_session()
    try:
        row = session.get(LLMModelConfigRow, id_)
        if row:
            session.delete(row)
            session.commit()
        return {"success": True, "message": "Deleted"}
    finally:
        session.close()


def _db_toggle_llm_model_config_enabled(args: dict[str, Any]) -> dict[str, Any]:
    id_ = args["id"]
    session = get_session()
    try:
        row = session.get(LLMModelConfigRow, id_)
        if row:
            row.is_enabled = 0 if row.is_enabled else 1
            session.commit()
        return {"success": True, "message": "Toggled"}
    finally:
        session.close()


def _db_update_llm_model_id(args: dict[str, Any]) -> dict[str, Any]:
    id_ = args["id"]
    new_id = args["new_model_id"]
    session = get_session()
    try:
        row = session.get(LLMModelConfigRow, id_)
        if row:
            row.model_id = new_id
            session.commit()
        return {"success": True, "message": "Updated"}
    finally:
        session.close()


def _db_fix_google_model_ids(args: dict[str, Any]) -> dict[str, Any]:
    # No-op for now
    return {"success": True, "message": "Fixed"}


# ----- Chat -----


def _db_create_chat_session(args: dict[str, Any]) -> dict[str, Any]:
    title = args["title"]
    session_uuid = str(uuid.uuid4())
    now = _now()
    session = get_session()
    try:
        session.add(
            ChatSessionRow(session_uuid=session_uuid, title=title, message_count=0, created_at=now, updated_at=now)
        )
        session.commit()
        return {
            "session_uuid": session_uuid,
            "title": title,
            "message_count": 0,
            "created_at": now,
            "updated_at": now,
        }
    finally:
        session.close()


def _db_get_chat_sessions(args: dict[str, Any]) -> list[dict[str, Any]]:
    limit = args.get("limit")
    session = get_session()
    try:
        q = select(ChatSessionRow).order_by(ChatSessionRow.updated_at.desc())
        if limit is not None:
            q = q.limit(limit)
        rows = session.exec(q).all()
        return [
            {
                "session_uuid": r.session_uuid,
                "title": r.title,
                "message_count": r.message_count,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_add_chat_message(args: dict[str, Any]) -> dict[str, Any]:
    msg = args["message"]
    session = get_session()
    try:
        session.add(
            ChatMessageRow(
                id=msg["id"],
                session_uuid=msg["session_uuid"],
                role=msg["role"],
                content=msg["content"],
                timestamp=msg.get("timestamp", _now()),
                provider=msg.get("provider"),
                model=msg.get("model"),
                tokens_used=msg.get("tokens_used"),
            )
        )
        sess = session.get(ChatSessionRow, msg["session_uuid"])
        if sess:
            sess.message_count = (sess.message_count or 0) + 1
            sess.updated_at = _now()
        session.commit()
        return msg
    finally:
        session.close()


def _db_get_chat_messages(args: dict[str, Any]) -> list[dict[str, Any]]:
    session_uuid = args["session_uuid"]
    session = get_session()
    try:
        rows = session.exec(
            select(ChatMessageRow).where(ChatMessageRow.session_uuid == session_uuid).order_by(ChatMessageRow.timestamp)
        ).all()
        return [
            {
                "id": r.id,
                "session_uuid": r.session_uuid,
                "role": r.role,
                "content": r.content,
                "timestamp": r.timestamp,
                "provider": r.provider,
                "model": r.model,
                "tokens_used": r.tokens_used,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_delete_chat_session(args: dict[str, Any]) -> str:
    session_uuid = args["session_uuid"]
    session = get_session()
    try:
        sess = session.get(ChatSessionRow, session_uuid)
        if sess:
            session.delete(sess)
        for msg in session.exec(select(ChatMessageRow).where(ChatMessageRow.session_uuid == session_uuid)).all():
            session.delete(msg)
        session.commit()
        return "Chat session deleted successfully"
    finally:
        session.close()


# ----- Data sources -----


def _db_save_data_source(args: dict[str, Any]) -> dict[str, Any]:
    source = args["source"]
    session = get_session()
    try:
        row = session.get(DataSourceRow, source["id"])
        now = _now()
        if row:
            row.alias = source["alias"]
            row.display_name = source["display_name"]
            row.description = source.get("description")
            row.ds_type = source.get("type", source.get("ds_type", ""))
            row.provider = source["provider"]
            row.category = source.get("category")
            row.config = source["config"]
            row.enabled = 1 if source.get("enabled", True) else 0
            row.tags = json.dumps(source["tags"]) if isinstance(source.get("tags"), list) else source.get("tags")
            row.updated_at = now
        else:
            session.add(
                DataSourceRow(
                    id=source["id"],
                    alias=source["alias"],
                    display_name=source["display_name"],
                    description=source.get("description"),
                    ds_type=source.get("type", source.get("ds_type", "rest_api")),
                    provider=source["provider"],
                    category=source.get("category"),
                    config=source["config"],
                    enabled=1 if source.get("enabled", True) else 0,
                    tags=json.dumps(source["tags"]) if isinstance(source.get("tags"), list) else source.get("tags"),
                    created_at=now,
                    updated_at=now,
                )
            )
        session.commit()
        return {"success": True, "message": "Saved", "id": source["id"]}
    finally:
        session.close()


def _db_get_all_data_sources(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(DataSourceRow)).all()
        return [
            {
                "id": r.id,
                "alias": r.alias,
                "display_name": r.display_name,
                "description": r.description,
                "type": r.ds_type,
                "provider": r.provider,
                "category": r.category,
                "config": r.config,
                "enabled": bool(r.enabled),
                "tags": json.loads(r.tags) if r.tags and r.tags.startswith("[") else r.tags,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_delete_data_source(args: dict[str, Any]) -> dict[str, Any]:
    id_ = args["id"]
    session = get_session()
    try:
        row = session.get(DataSourceRow, id_)
        if row:
            session.delete(row)
            session.commit()
        return {"success": True, "message": "Deleted"}
    finally:
        session.close()


# ----- MCP -----


def _db_add_mcp_server(args: dict[str, Any]) -> str:
    server = args["server"]
    session = get_session()
    try:
        now = _now()
        session.add(
            MCPServerRow(
                id=server["id"],
                name=server["name"],
                description=server.get("description", ""),
                command=server["command"],
                args=server.get("args") or "",
                env=server.get("env"),
                category=server.get("category", ""),
                icon=server.get("icon", ""),
                enabled=1 if server.get("enabled", True) else 0,
                auto_start=1 if server.get("auto_start") else 0,
                status=server.get("status", "stopped"),
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()
        return "MCP server added successfully"
    finally:
        session.close()


def _db_get_mcp_servers(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(MCPServerRow)).all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "description": r.description,
                "command": r.command,
                "args": r.args,
                "env": r.env,
                "category": r.category,
                "icon": r.icon,
                "enabled": bool(r.enabled),
                "auto_start": bool(r.auto_start),
                "status": r.status,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_delete_mcp_server(args: dict[str, Any]) -> str:
    id_ = args["id"]
    session = get_session()
    try:
        row = session.get(MCPServerRow, id_)
        if row:
            session.delete(row)
            session.commit()
        return "MCP server deleted successfully"
    finally:
        session.close()


def _db_get_internal_tool_settings(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(InternalMCPToolSettingRow)).all()
        return [
            {"tool_name": r.tool_name, "category": r.category, "is_enabled": bool(r.is_enabled), "updated_at": r.updated_at}
            for r in rows
        ]
    finally:
        session.close()


def _db_set_internal_tool_enabled(args: dict[str, Any]) -> str:
    tool_name = args["tool_name"]
    category = args["category"]
    is_enabled = args["is_enabled"]
    session = get_session()
    try:
        row = session.get(InternalMCPToolSettingRow, tool_name)
        now = _now()
        if row:
            row.category = category
            row.is_enabled = 1 if is_enabled else 0
            row.updated_at = now
        else:
            session.add(
                InternalMCPToolSettingRow(tool_name=tool_name, category=category, is_enabled=1 if is_enabled else 0, updated_at=now)
            )
        session.commit()
        return "Internal tool setting updated"
    finally:
        session.close()


def _db_is_internal_tool_enabled(args: dict[str, Any]) -> bool:
    tool_name = args["tool_name"]
    session = get_session()
    try:
        row = session.get(InternalMCPToolSettingRow, tool_name)
        return bool(row and row.is_enabled) if row else True
    finally:
        session.close()


# ----- Backtesting -----


def _db_save_backtesting_provider(args: dict[str, Any]) -> dict[str, Any]:
    p = args["provider"]
    session = get_session()
    try:
        row = session.get(BacktestingProviderRow, p["id"])
        now = _now()
        if row:
            row.name = p["name"]
            row.adapter_type = p["adapter_type"]
            row.config = p["config"]
            row.enabled = 1 if p.get("enabled", True) else 0
            row.is_active = 1 if p.get("is_active") else 0
            row.updated_at = now
        else:
            session.add(
                BacktestingProviderRow(
                    id=p["id"],
                    name=p["name"],
                    adapter_type=p["adapter_type"],
                    config=p["config"],
                    enabled=1 if p.get("enabled", True) else 0,
                    is_active=1 if p.get("is_active") else 0,
                    created_at=now,
                    updated_at=now,
                )
            )
        session.commit()
        return {"success": True, "message": "Saved"}
    finally:
        session.close()


def _db_get_backtesting_providers(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(BacktestingProviderRow)).all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "adapter_type": r.adapter_type,
                "config": r.config,
                "enabled": bool(r.enabled),
                "is_active": bool(r.is_active),
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_save_backtesting_strategy(args: dict[str, Any]) -> dict[str, Any]:
    s = args["strategy"]
    session = get_session()
    try:
        row = session.get(BacktestingStrategyRow, s["id"])
        now = _now()
        if row:
            row.name = s["name"]
            row.description = s.get("description")
            row.version = s.get("version", "1.0.0")
            row.author = s.get("author")
            row.provider_type = s["provider_type"]
            row.strategy_type = s["strategy_type"]
            row.strategy_definition = s["strategy_definition"]
            row.tags = s.get("tags")
            row.updated_at = now
        else:
            session.add(
                BacktestingStrategyRow(
                    id=s["id"],
                    name=s["name"],
                    description=s.get("description"),
                    version=s.get("version", "1.0.0"),
                    author=s.get("author"),
                    provider_type=s["provider_type"],
                    strategy_type=s["strategy_type"],
                    strategy_definition=s["strategy_definition"],
                    tags=s.get("tags"),
                    created_at=now,
                    updated_at=now,
                )
            )
        session.commit()
        return {"success": True, "message": "Saved"}
    finally:
        session.close()


def _db_get_backtesting_strategies(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(BacktestingStrategyRow)).all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "description": r.description,
                "version": r.version,
                "author": r.author,
                "provider_type": r.provider_type,
                "strategy_type": r.strategy_type,
                "strategy_definition": r.strategy_definition,
                "tags": r.tags,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_save_backtest_run(args: dict[str, Any]) -> dict[str, Any]:
    r = args["run"]
    session = get_session()
    try:
        now = _now()
        row = session.get(BacktestRunRow, r["id"])
        if row:
            row.strategy_id = r.get("strategy_id")
            row.provider_name = r["provider_name"]
            row.config = r["config"]
            row.results = r.get("results")
            row.status = r["status"]
            row.performance_metrics = r.get("performance_metrics")
            row.error_message = r.get("error_message")
            row.completed_at = r.get("completed_at")
            row.duration_seconds = r.get("duration_seconds")
        else:
            session.add(
                BacktestRunRow(
                    id=r["id"],
                    strategy_id=r.get("strategy_id"),
                    provider_name=r["provider_name"],
                    config=r["config"],
                    results=r.get("results"),
                    status=r["status"],
                    performance_metrics=r.get("performance_metrics"),
                    error_message=r.get("error_message"),
                    created_at=now,
                    completed_at=r.get("completed_at"),
                    duration_seconds=r.get("duration_seconds"),
                )
            )
        session.commit()
        return {"success": True, "message": "Saved"}
    finally:
        session.close()


def _db_get_backtest_runs(args: dict[str, Any]) -> list[dict[str, Any]]:
    limit = args.get("limit")
    session = get_session()
    try:
        q = select(BacktestRunRow).order_by(BacktestRunRow.created_at.desc())
        if limit is not None:
            q = q.limit(limit)
        rows = session.exec(q).all()
        return [
            {
                "id": r.id,
                "strategy_id": r.strategy_id,
                "provider_name": r.provider_name,
                "config": r.config,
                "results": r.results,
                "status": r.status,
                "performance_metrics": r.performance_metrics,
                "error_message": r.error_message,
                "created_at": r.created_at,
                "completed_at": r.completed_at,
                "duration_seconds": r.duration_seconds,
            }
            for r in rows
        ]
    finally:
        session.close()


# ----- Recorded context -----


def _db_save_recorded_context(args: dict[str, Any]) -> str:
    ctx = args["context"]
    session = get_session()
    try:
        now = _now()
        row = session.get(RecordedContextRow, ctx["id"])
        if row:
            row.tab_name = ctx["tab_name"]
            row.data_type = ctx["data_type"]
            row.label = ctx.get("label")
            row.raw_data = ctx["raw_data"]
            row.context_metadata = ctx.get("metadata")
            row.data_size = ctx.get("data_size", 0)
            row.tags = ctx.get("tags")
        else:
            session.add(
                RecordedContextRow(
                    id=ctx["id"],
                    tab_name=ctx["tab_name"],
                    data_type=ctx["data_type"],
                    label=ctx.get("label"),
                    raw_data=ctx["raw_data"],
                    context_metadata=ctx.get("metadata"),
                    data_size=ctx.get("data_size", 0),
                    created_at=now,
                    tags=ctx.get("tags"),
                )
            )
        session.commit()
        return "Context recorded successfully"
    finally:
        session.close()


def _db_get_recorded_contexts(args: dict[str, Any]) -> list[dict[str, Any]]:
    tab_name = args.get("tab_name")
    limit = args.get("limit")
    session = get_session()
    try:
        q = select(RecordedContextRow)
        if tab_name:
            q = q.where(RecordedContextRow.tab_name == tab_name)
        q = q.order_by(RecordedContextRow.created_at.desc())
        if limit is not None:
            q = q.limit(limit)
        rows = session.exec(q).all()
        return [
            {
                "id": r.id,
                "tab_name": r.tab_name,
                "data_type": r.data_type,
                "label": r.label,
                "raw_data": r.raw_data,
                "metadata": r.context_metadata,
                "data_size": r.data_size,
                "created_at": r.created_at,
                "tags": r.tags,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_delete_recorded_context(args: dict[str, Any]) -> str:
    id_ = args["id"]
    session = get_session()
    try:
        row = session.get(RecordedContextRow, id_)
        if row:
            session.delete(row)
            session.commit()
        return "Context deleted successfully"
    finally:
        session.close()


# ----- Watchlist -----


def _db_create_watchlist(args: dict[str, Any]) -> dict[str, Any]:
    name = args["name"]
    description = args.get("description")
    color = args.get("color", "#FFA500")
    id_ = str(uuid.uuid4())
    now = _now()
    session = get_session()
    try:
        session.add(
            WatchlistRow(id=id_, name=name, description=description, color=color, created_at=now, updated_at=now)
        )
        session.commit()
        return {"id": id_, "name": name, "description": description, "color": color, "created_at": now, "updated_at": now}
    finally:
        session.close()


def _db_get_watchlists(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(WatchlistRow)).all()
        return [
            {"id": r.id, "name": r.name, "description": r.description, "color": r.color, "created_at": r.created_at, "updated_at": r.updated_at}
            for r in rows
        ]
    finally:
        session.close()


def _db_add_watchlist_stock(args: dict[str, Any]) -> dict[str, Any]:
    watchlist_id = args["watchlist_id"]
    symbol = args["symbol"]
    notes = args.get("notes")
    id_ = str(uuid.uuid4())
    now = _now()
    session = get_session()
    try:
        session.add(
            WatchlistStockRow(id=id_, watchlist_id=watchlist_id, symbol=symbol, added_at=now, notes=notes)
        )
        session.commit()
        return {"id": id_, "watchlist_id": watchlist_id, "symbol": symbol, "added_at": now, "notes": notes}
    finally:
        session.close()


def _db_get_watchlist_stocks(args: dict[str, Any]) -> list[dict[str, Any]]:
    watchlist_id = args["watchlist_id"]
    session = get_session()
    try:
        rows = session.exec(select(WatchlistStockRow).where(WatchlistStockRow.watchlist_id == watchlist_id)).all()
        return [
            {"id": r.id, "watchlist_id": r.watchlist_id, "symbol": r.symbol, "added_at": r.added_at, "notes": r.notes}
            for r in rows
        ]
    finally:
        session.close()


def _db_remove_watchlist_stock(args: dict[str, Any]) -> str:
    watchlist_id = args["watchlist_id"]
    symbol = args["symbol"]
    session = get_session()
    try:
        for row in session.exec(
            select(WatchlistStockRow).where(
                WatchlistStockRow.watchlist_id == watchlist_id,
                WatchlistStockRow.symbol == symbol,
            )
        ).all():
            session.delete(row)
        session.commit()
        return "Stock removed from watchlist successfully"
    finally:
        session.close()


def _db_delete_watchlist(args: dict[str, Any]) -> str:
    watchlist_id = args["watchlist_id"]
    session = get_session()
    try:
        wl = session.get(WatchlistRow, watchlist_id)
        if wl:
            session.delete(wl)
        for row in session.exec(select(WatchlistStockRow).where(WatchlistStockRow.watchlist_id == watchlist_id)).all():
            session.delete(row)
        session.commit()
        return "Watchlist deleted successfully"
    finally:
        session.close()


# ----- Agent config -----


def _db_save_agent_config(args: dict[str, Any]) -> dict[str, Any]:
    cfg = args["config"]
    session = get_session()
    try:
        now = _now()
        row = session.get(AgentConfigRow, cfg["id"])
        if row:
            row.name = cfg["name"]
            row.description = cfg.get("description")
            row.config_json = cfg["config_json"] if isinstance(cfg.get("config_json"), str) else json.dumps(cfg.get("config_json", {}))
            row.category = cfg.get("category", "general")
            row.is_default = 1 if cfg.get("is_default") else 0
            row.is_active = 1 if cfg.get("is_active") else 0
            row.updated_at = now
        else:
            session.add(
                AgentConfigRow(
                    id=cfg["id"],
                    name=cfg["name"],
                    description=cfg.get("description"),
                    config_json=cfg["config_json"] if isinstance(cfg.get("config_json"), str) else json.dumps(cfg.get("config_json", {})),
                    category=cfg.get("category", "general"),
                    is_default=1 if cfg.get("is_default") else 0,
                    is_active=1 if cfg.get("is_active") else 0,
                    created_at=now,
                    updated_at=now,
                )
            )
        session.commit()
        return {"success": True, "message": "Saved"}
    finally:
        session.close()


def _db_get_agent_configs(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(AgentConfigRow)).all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "description": r.description,
                "config_json": r.config_json,
                "category": r.category,
                "is_default": bool(r.is_default),
                "is_active": bool(r.is_active),
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_get_agent_config(args: dict[str, Any]) -> dict[str, Any] | None:
    id_ = args["id"]
    session = get_session()
    try:
        row = session.get(AgentConfigRow, id_)
        if not row:
            return None
        return {
            "id": row.id,
            "name": row.name,
            "description": row.description,
            "config_json": row.config_json,
            "category": row.category,
            "is_default": bool(row.is_default),
            "is_active": bool(row.is_active),
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
    finally:
        session.close()


def _db_get_agent_configs_by_category(args: dict[str, Any]) -> list[dict[str, Any]]:
    category = args["category"]
    session = get_session()
    try:
        rows = session.exec(select(AgentConfigRow).where(AgentConfigRow.category == category)).all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "description": r.description,
                "config_json": r.config_json,
                "category": r.category,
                "is_default": bool(r.is_default),
                "is_active": bool(r.is_active),
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in rows
        ]
    finally:
        session.close()


def _db_delete_agent_config(args: dict[str, Any]) -> dict[str, Any]:
    id_ = args["id"]
    session = get_session()
    try:
        row = session.get(AgentConfigRow, id_)
        if row:
            session.delete(row)
            session.commit()
        return {"success": True, "message": "Deleted"}
    finally:
        session.close()


def _db_set_active_agent_config(args: dict[str, Any]) -> dict[str, Any]:
    id_ = args["id"]
    session = get_session()
    try:
        for row in session.exec(select(AgentConfigRow)).all():
            row.is_active = 1 if row.id == id_ else 0
        session.commit()
        return {"success": True, "message": "Set active"}
    finally:
        session.close()


def _db_get_active_agent_config(args: dict[str, Any]) -> dict[str, Any] | None:
    session = get_session()
    try:
        row = session.exec(select(AgentConfigRow).where(AgentConfigRow.is_active == 1)).first()
        if not row:
            return None
        return {
            "id": row.id,
            "name": row.name,
            "description": row.description,
            "config_json": row.config_json,
            "category": row.category,
            "is_default": bool(row.is_default),
            "is_active": True,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
    finally:
        session.close()


# ----- Cache (unified_cache) -----


def _cache_get(args: dict[str, Any]) -> dict[str, Any] | None:
    key = args["key"]
    session = get_session()
    try:
        row = session.get(UnifiedCacheRow, key)
        if not row:
            return None
        now_ts = _ts()
        is_expired = now_ts >= row.expires_at
        return {
            "cache_key": row.cache_key,
            "category": row.category,
            "data": row.data,
            "ttl_seconds": row.ttl_seconds,
            "created_at": row.created_at,
            "expires_at": row.expires_at,
            "last_accessed_at": row.last_accessed_at,
            "hit_count": row.hit_count,
            "is_expired": is_expired,
        }
    finally:
        session.close()


def _cache_get_with_stale(args: dict[str, Any]) -> dict[str, Any] | None:
    return _cache_get(args)


def _cache_set(args: dict[str, Any]) -> None:
    key = args.get("key", "")
    data = args.get("data", "")
    category = args.get("category", "default")
    ttl_seconds = args.get("ttl_seconds") or args.get("ttlSeconds", 600)
    now = _ts()
    expires = now + ttl_seconds
    session = get_session()
    try:
        row = session.get(UnifiedCacheRow, key)
        if row:
            row.data = data
            row.category = category
            row.ttl_seconds = ttl_seconds
            row.expires_at = expires
            row.last_accessed_at = now
        else:
            session.add(
                UnifiedCacheRow(
                    cache_key=key,
                    category=category,
                    data=data,
                    ttl_seconds=ttl_seconds,
                    created_at=now,
                    expires_at=expires,
                    last_accessed_at=now,
                )
            )
        session.commit()
    finally:
        session.close()


def _cache_delete(args: dict[str, Any]) -> bool:
    key = args["key"]
    session = get_session()
    try:
        row = session.get(UnifiedCacheRow, key)
        if row:
            session.delete(row)
            session.commit()
            return True
        return False
    finally:
        session.close()


def _cache_get_many(args: dict[str, Any]) -> list[dict[str, Any]]:
    keys = args["keys"]
    out = []
    for k in keys:
        r = _cache_get({"key": k})
        if r:
            out.append(r)
    return out


def _cache_invalidate_category(args: dict[str, Any]) -> int:
    category = args["category"]
    session = get_session()
    try:
        rows = session.exec(select(UnifiedCacheRow).where(UnifiedCacheRow.category == category)).all()
        n = len(rows)
        for r in rows:
            session.delete(r)
        session.commit()
        return n
    finally:
        session.close()


def _cache_invalidate_pattern(args: dict[str, Any]) -> int:
    import fnmatch
    pattern = args["pattern"]
    session = get_session()
    try:
        rows = session.exec(select(UnifiedCacheRow)).all()
        n = 0
        for r in rows:
            if fnmatch.fnmatch(r.cache_key, pattern):
                session.delete(r)
                n += 1
        session.commit()
        return n
    finally:
        session.close()


def _cache_cleanup(args: dict[str, Any]) -> int:
    now = _ts()
    session = get_session()
    try:
        rows = session.exec(select(UnifiedCacheRow).where(UnifiedCacheRow.expires_at < now)).all()
        n = len(rows)
        for r in rows:
            session.delete(r)
        session.commit()
        return n
    finally:
        session.close()


def _cache_stats(args: dict[str, Any]) -> dict[str, Any]:
    session = get_session()
    try:
        rows = session.exec(select(UnifiedCacheRow)).all()
        now = _ts()
        total = len(rows)
        expired = sum(1 for r in rows if r.expires_at < now)
        total_size = sum(r.size_bytes for r in rows)
        return {
            "total_entries": total,
            "total_size_bytes": total_size,
            "expired_entries": expired,
            "categories": [],
        }
    except Exception:
        return {
            "total_entries": 0,
            "total_size_bytes": 0,
            "expired_entries": 0,
            "categories": [],
        }
    finally:
        session.close()


def _cache_clear_all(args: dict[str, Any]) -> int:
    session = get_session()
    try:
        rows = session.exec(select(UnifiedCacheRow)).all()
        n = len(rows)
        for r in rows:
            session.delete(r)
        session.commit()
        return n
    finally:
        session.close()


# ----- Tab session -----


def _tab_session_get(args: dict[str, Any]) -> dict[str, Any] | None:
    tab_id = args["tab_id"]
    session = get_session()
    try:
        row = session.get(TabSessionRow, tab_id)
        if not row:
            return None
        return {
            "tab_id": row.tab_id,
            "tab_name": row.tab_name,
            "state": row.state,
            "scroll_position": row.scroll_position,
            "active_filters": row.active_filters,
            "selected_items": row.selected_items,
            "updated_at": row.updated_at,
            "created_at": row.created_at,
        }
    finally:
        session.close()


def _tab_session_set(args: dict[str, Any]) -> None:
    tab_id = args["tab_id"]
    tab_name = args["tab_name"]
    state = args["state"]
    scroll_position = args.get("scroll_position")
    active_filters = args.get("active_filters")
    selected_items = args.get("selected_items")
    now = _ts()
    session = get_session()
    try:
        row = session.get(TabSessionRow, tab_id)
        if row:
            row.tab_name = tab_name
            row.state = state
            row.scroll_position = scroll_position
            row.active_filters = active_filters
            row.selected_items = selected_items
            row.updated_at = now
        else:
            session.add(
                TabSessionRow(
                    tab_id=tab_id,
                    tab_name=tab_name,
                    state=state,
                    scroll_position=scroll_position,
                    active_filters=active_filters,
                    selected_items=selected_items,
                    updated_at=now,
                    created_at=now,
                )
            )
        session.commit()
    finally:
        session.close()


def _tab_session_delete(args: dict[str, Any]) -> bool:
    tab_id = args["tab_id"]
    session = get_session()
    try:
        row = session.get(TabSessionRow, tab_id)
        if row:
            session.delete(row)
            session.commit()
            return True
        return False
    finally:
        session.close()


def _tab_session_get_all(args: dict[str, Any]) -> list[dict[str, Any]]:
    session = get_session()
    try:
        rows = session.exec(select(TabSessionRow)).all()
        return [
            {
                "tab_id": r.tab_id,
                "tab_name": r.tab_name,
                "state": r.state,
                "scroll_position": r.scroll_position,
                "active_filters": r.active_filters,
                "selected_items": r.selected_items,
                "updated_at": r.updated_at,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    finally:
        session.close()


def _tab_session_cleanup(args: dict[str, Any]) -> int:
    max_age_days = args.get("max_age_days", 30)
    cutoff = _ts() - max_age_days * 86400
    session = get_session()
    try:
        rows = session.exec(select(TabSessionRow).where(TabSessionRow.updated_at < cutoff)).all()
        n = len(rows)
        for r in rows:
            session.delete(r)
        session.commit()
        return n
    finally:
        session.close()


# ----- Market data cache -----


def _db_save_market_data_cache(args: dict[str, Any]) -> str:
    symbol = args["symbol"]
    category = args["category"]
    quote_data = args["quote_data"]
    session = get_session()
    try:
        # Composite key: use (symbol, category) - MarketDataCacheRow has symbol and category as PK
        row = session.exec(
            select(MarketDataCacheRow).where(
                MarketDataCacheRow.symbol == symbol,
                MarketDataCacheRow.category == category,
            )
        ).first()
        now = _now()
        if row:
            row.quote_data = quote_data
            row.updated_at = now
        else:
            session.add(MarketDataCacheRow(symbol=symbol, category=category, quote_data=quote_data, updated_at=now))
        session.commit()
        return "OK"
    finally:
        session.close()


def _db_get_cached_market_data(args: dict[str, Any]) -> str | None:
    symbol = args["symbol"]
    category = args["category"]
    session = get_session()
    try:
        row = session.exec(
            select(MarketDataCacheRow).where(
                MarketDataCacheRow.symbol == symbol,
                MarketDataCacheRow.category == category,
            )
        ).first()
        return row.quote_data if row else None
    finally:
        session.close()


def _db_clear_market_data_cache(args: dict[str, Any]) -> str:
    session = get_session()
    try:
        for row in session.exec(select(MarketDataCacheRow)).all():
            session.delete(row)
        session.commit()
        return "OK"
    finally:
        session.close()


def get_database_handlers() -> dict[str, Any]:
    """Return all database and cache handlers for registration."""
    return {
        "db_check_health": _db_check_health,
        "db_save_setting": _db_save_setting,
        "db_get_setting": _db_get_setting,
        "db_get_all_settings": _db_get_all_settings,
        "db_save_credential": _db_save_credential,
        "db_get_credentials": _db_get_credentials,
        "db_get_credential_by_service": _db_get_credential_by_service,
        "db_delete_credential": _db_delete_credential,
        "db_get_llm_configs": _db_get_llm_configs,
        "db_save_llm_config": _db_save_llm_config,
        "db_get_llm_global_settings": _db_get_llm_global_settings,
        "db_save_llm_global_settings": _db_save_llm_global_settings,
        "db_set_active_llm_provider": _db_set_active_llm_provider,
        "db_get_llm_model_configs": _db_get_llm_model_configs,
        "db_save_llm_model_config": _db_save_llm_model_config,
        "db_delete_llm_model_config": _db_delete_llm_model_config,
        "db_toggle_llm_model_config_enabled": _db_toggle_llm_model_config_enabled,
        "db_update_llm_model_id": _db_update_llm_model_id,
        "db_fix_google_model_ids": _db_fix_google_model_ids,
        "db_create_chat_session": _db_create_chat_session,
        "db_get_chat_sessions": _db_get_chat_sessions,
        "db_add_chat_message": _db_add_chat_message,
        "db_get_chat_messages": _db_get_chat_messages,
        "db_delete_chat_session": _db_delete_chat_session,
        "db_save_data_source": _db_save_data_source,
        "db_get_all_data_sources": _db_get_all_data_sources,
        "db_delete_data_source": _db_delete_data_source,
        "db_add_mcp_server": _db_add_mcp_server,
        "db_get_mcp_servers": _db_get_mcp_servers,
        "db_delete_mcp_server": _db_delete_mcp_server,
        "db_get_internal_tool_settings": _db_get_internal_tool_settings,
        "db_set_internal_tool_enabled": _db_set_internal_tool_enabled,
        "db_is_internal_tool_enabled": _db_is_internal_tool_enabled,
        "db_save_backtesting_provider": _db_save_backtesting_provider,
        "db_get_backtesting_providers": _db_get_backtesting_providers,
        "db_save_backtesting_strategy": _db_save_backtesting_strategy,
        "db_get_backtesting_strategies": _db_get_backtesting_strategies,
        "db_save_backtest_run": _db_save_backtest_run,
        "db_get_backtest_runs": _db_get_backtest_runs,
        "db_save_recorded_context": _db_save_recorded_context,
        "db_get_recorded_contexts": _db_get_recorded_contexts,
        "db_delete_recorded_context": _db_delete_recorded_context,
        "db_create_watchlist": _db_create_watchlist,
        "db_get_watchlists": _db_get_watchlists,
        "db_add_watchlist_stock": _db_add_watchlist_stock,
        "db_get_watchlist_stocks": _db_get_watchlist_stocks,
        "db_remove_watchlist_stock": _db_remove_watchlist_stock,
        "db_delete_watchlist": _db_delete_watchlist,
        "db_save_agent_config": _db_save_agent_config,
        "db_get_agent_configs": _db_get_agent_configs,
        "db_get_agent_config": _db_get_agent_config,
        "db_get_agent_configs_by_category": _db_get_agent_configs_by_category,
        "db_delete_agent_config": _db_delete_agent_config,
        "db_set_active_agent_config": _db_set_active_agent_config,
        "db_get_active_agent_config": _db_get_active_agent_config,
        "cache_get": _cache_get,
        "cache_get_with_stale": _cache_get_with_stale,
        "cache_set": _cache_set,
        "cache_delete": _cache_delete,
        "cache_get_many": _cache_get_many,
        "cache_invalidate_category": _cache_invalidate_category,
        "cache_invalidate_pattern": _cache_invalidate_pattern,
        "cache_cleanup": _cache_cleanup,
        "cache_stats": _cache_stats,
        "cache_clear_all": _cache_clear_all,
        "tab_session_get": _tab_session_get,
        "tab_session_set": _tab_session_set,
        "tab_session_delete": _tab_session_delete,
        "tab_session_get_all": _tab_session_get_all,
        "tab_session_cleanup": _tab_session_cleanup,
        "db_save_market_data_cache": _db_save_market_data_cache,
        "db_get_cached_market_data": _db_get_cached_market_data,
        "db_clear_market_data_cache": _db_clear_market_data_cache,
    }
