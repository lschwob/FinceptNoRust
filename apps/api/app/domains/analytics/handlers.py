"""Analytics command handlers. Stubs return not_implemented until implemented."""
from __future__ import annotations

from typing import Any


def _stub(name: str):
    def _handler(args: dict[str, Any]) -> dict[str, Any]:
        return {"status": "not_implemented_yet", "command": name, "message": "Analytics domain not yet implemented."}
    return _handler


# Commands invoked by frontend for analytics (from inventory / grep).
# Do NOT include: get_market_quote, get_market_quotes, get_historical_data, get_stock_info, get_period_returns
# (those are implemented in market_data domain; analytics would shadow them)
ANALYTICS_COMMANDS = [
    "calculate_indicators_csv",
    "calculate_indicators_json",
    "scan_ma_filings",
    "parse_ma_filing",
    "create_ma_deal",
    "get_all_ma_deals",
    "search_ma_deals",
    "update_ma_deal",
    "calculate_precedent_transactions",
    "calculate_trading_comps",
    "calculate_ma_dcf",
    "calculate_dcf_sensitivity",
    "generate_football_field",
    "build_merger_model",
    "build_pro_forma",
    "analyze_premium_fairness",
    "analyze_contribution",
    "analyze_payment_structure",
    "analyze_payment_structures",
    "analyze_industry_deals",
    "analyze_lbo_debt_schedule",
    "analyze_collar_mechanism",
    "assess_process_quality",
    "benchmark_deal_premium",
    "build_lbo_model",
]


def get_analytics_handlers() -> dict[str, Any]:
    return {name: _stub(name) for name in ANALYTICS_COMMANDS}
