"""Misc command handlers: YouTube proxy, orderbook, monitoring, news, jupyter, geocoding, adb, sha256_hash."""
from __future__ import annotations

import hashlib
from typing import Any

from app.domains.misc.rss_news import (
    fetch_all_rss_articles_sync,
    get_default_sources,
    get_feed_count,
)


def _stub(name: str):
    def _handler(args: dict[str, Any]) -> dict[str, Any]:
        return {"status": "not_implemented_yet", "command": name}
    return _handler


def sha256_hash(args: dict[str, Any]) -> str:
    """Trivial replacement for lib.rs sha256_hash."""
    input_str = args.get("input", "")
    return hashlib.sha256(input_str.encode()).hexdigest()


MISC_STUB_COMMANDS = [
    "edgar_cache_store_tickers",
    "update_user_rss_feed",
    "delete_user_rss_feed",
    "toggle_user_rss_feed",
    "toggle_default_rss_feed",
    "delete_default_rss_feed",
    "restore_default_rss_feed",
    "restore_all_default_feeds",
    "update_news_monitor",
    "delete_news_monitor",
    "toggle_news_monitor",
    "db_admin_check_password",
    "db_admin_check_session",
    "db_admin_create_session",
    "db_admin_clear_session",
    "db_admin_set_password",
    "db_admin_verify_password",
    "db_admin_get_databases",
    "db_admin_get_tables",
    "db_admin_get_table_data",
    "db_admin_execute_query",
    "db_admin_update_row",
    "db_admin_insert_row",
    "db_admin_delete_row",
    "db_admin_rename_table",
    "portfolio_update_asset_symbol",
    "portfolio_delete",
    "portfolio_add_asset",
    "portfolio_sell_asset",
    "portfolio_update_transaction",
    "portfolio_delete_transaction",
    "custom_index_update",
    "custom_index_delete",
    "custom_index_hard_delete",
    "index_constituent_update",
    "index_constituent_remove",
    "pm5m_save_run",
    "pm_bot_upsert",
    "pm_decision_insert",
    "pm_position_upsert",
    "pm_bot_delete",
    "pm_decision_update_approval",
]


def portfolio_get_all(args: dict[str, Any]) -> list[dict[str, Any]]:
    """Return empty list so frontend portfolioService.getPortfolios() and .find() work."""
    return []


def fetch_all_rss_news(args: dict[str, Any]) -> list[dict[str, Any]]:
    """Fetch market news from configured RSS feeds."""
    return fetch_all_rss_articles_sync()


def get_rss_feed_count(args: dict[str, Any]) -> int:
    """Return number of configured RSS feeds."""
    return get_feed_count()


def get_active_news_sources(args: dict[str, Any]) -> list[Any]:
    """Return list of active RSS source names."""
    return get_default_sources()


def get_active_sources(args: dict[str, Any]) -> list[str]:
    """Return list of active source names; frontend invokes this as get_active_sources."""
    return get_default_sources()


def get_news_monitors(args: dict[str, Any]) -> list[dict[str, Any]]:
    """Return empty list until news monitors are implemented."""
    return []


def get_misc_handlers() -> dict[str, Any]:
    out = {name: _stub(name) for name in MISC_STUB_COMMANDS}
    out["sha256_hash"] = sha256_hash
    out["portfolio_get_all"] = portfolio_get_all
    out["fetch_all_rss_news"] = fetch_all_rss_news
    out["get_rss_feed_count"] = get_rss_feed_count
    out["get_active_news_sources"] = get_active_news_sources
    out["get_active_sources"] = get_active_sources
    out["get_news_monitors"] = get_news_monitors
    return out
