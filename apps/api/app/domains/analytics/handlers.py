"""Analytics command handlers. Stubs return not_implemented until implemented. Derivatives pricing calls legacy scripts."""
from __future__ import annotations

import json
from typing import Any

from app.core.errors import ApiError
from app.services.python_execution import PythonExecutionService

_python_execution = PythonExecutionService()


def _stub(name: str):
    def _handler(args: dict[str, Any]) -> dict[str, Any]:
        return {"status": "not_implemented_yet", "command": name, "message": "Analytics domain not yet implemented."}
    return _handler


def _run_financepy(command: str, args_list: list[str]) -> dict[str, Any]:
    """Run financepy_wrapper.py with command and positional args."""
    try:
        out = _python_execution.execute_json(
            script_path="financepy_wrapper.py",
            args=[command] + [str(x) for x in args_list],
        )
        return out if isinstance(out, dict) else {"result": out}
    except ApiError as e:
        stdout = (e.details or {}).get("stdout", "")
        if stdout and stdout.strip():
            try:
                return json.loads(stdout)
            except json.JSONDecodeError:
                pass
        return {"error": e.message or "Script failed"}
    except Exception as e:
        return {"error": str(e)}


def _run_vollib(operation: str, data: dict[str, Any]) -> dict[str, Any]:
    """Run py_vollib vollib_service with operation and JSON data."""
    try:
        out = _python_execution.execute_json(
            script_path="Analytics/py_vollib_wrapper/vollib_service.py",
            args=[operation, json.dumps(data)],
        )
        return out if isinstance(out, dict) else {"result": out}
    except ApiError as e:
        stdout = (e.details or {}).get("stdout", "")
        if stdout and stdout.strip():
            try:
                return json.loads(stdout)
            except json.JSONDecodeError:
                pass
        return {"error": e.message or "Script failed"}
    except Exception as e:
        return {"error": str(e)}


def _financepy_bond_price(args: dict[str, Any]) -> dict[str, Any]:
    a = args
    return _run_financepy("bond_price", [
        a.get("issueDate", ""),
        a.get("settlementDate", ""),
        a.get("maturityDate", ""),
        a.get("couponRate", ""),
        a.get("ytm", ""),
        a.get("freq", 2),
    ])


def _financepy_bond_ytm(args: dict[str, Any]) -> dict[str, Any]:
    a = args
    return _run_financepy("bond_ytm", [
        a.get("issueDate", ""),
        a.get("settlementDate", ""),
        a.get("maturityDate", ""),
        a.get("couponRate", ""),
        a.get("cleanPrice", ""),
        a.get("freq", 2),
    ])


def _financepy_equity_option_price(args: dict[str, Any]) -> dict[str, Any]:
    a = args
    return _run_financepy("equity_option_price", [
        a.get("valuationDate", ""),
        a.get("expiryDate", ""),
        a.get("strike", ""),
        a.get("spot", ""),
        a.get("volatility", ""),
        a.get("riskFreeRate", ""),
        a.get("dividendYield", ""),
        (a.get("optionType") or "call").lower(),
    ])


def _financepy_equity_option_implied_vol(args: dict[str, Any]) -> dict[str, Any]:
    a = args
    return _run_financepy("equity_option_implied_vol", [
        a.get("valuationDate", ""),
        a.get("expiryDate", ""),
        a.get("strike", ""),
        a.get("spot", ""),
        a.get("optionPrice", ""),
        a.get("riskFreeRate", ""),
        a.get("dividendYield", ""),
        (a.get("optionType") or "call").lower(),
    ])


def _financepy_fx_option_price(args: dict[str, Any]) -> dict[str, Any]:
    a = args
    return _run_financepy("fx_option_price", [
        a.get("valuationDate", ""),
        a.get("expiryDate", ""),
        a.get("strike", ""),
        a.get("spot", ""),
        a.get("volatility", ""),
        a.get("domesticRate", ""),
        a.get("foreignRate", ""),
        (a.get("optionType") or "call").lower(),
        a.get("notional", ""),
    ])


def _financepy_ibor_swap_price(args: dict[str, Any]) -> dict[str, Any]:
    a = args
    return _run_financepy("ibor_swap_price", [
        a.get("effectiveDate", ""),
        a.get("maturityDate", ""),
        a.get("fixedRate", ""),
        a.get("freq", 4),
        a.get("notional", ""),
        a.get("discountRate", ""),
    ])


def _financepy_cds_spread(args: dict[str, Any]) -> dict[str, Any]:
    a = args
    # Script expects: val_date, maturity, recovery, default_prob
    default_prob = a.get("defaultProb", 0.01)
    if "spreadBps" in a and a["spreadBps"] is not None:
        default_prob = float(a["spreadBps"]) / 10000.0
    return _run_financepy("cds_spread", [
        a.get("valuationDate", ""),
        a.get("maturityDate", ""),
        a.get("recoveryRate", ""),
        default_prob,
    ])


def _vollib_handler(operation: str):
    def _h(args: dict[str, Any]) -> dict[str, Any]:
        # Script expects S, K (capital); frontend may send s, k
        data = dict(args)
        if "s" in data and "S" not in data:
            data["S"] = data["s"]
        if "k" in data and "K" not in data:
            data["K"] = data["k"]
        return _run_vollib(operation, data)
    return _h


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

# Derivatives pricing: financepy_wrapper.py and py_vollib
DERIVATIVES_PRICING_COMMANDS = [
    "financepy_bond_price",
    "financepy_bond_ytm",
    "financepy_equity_option_price",
    "financepy_equity_option_implied_vol",
    "financepy_fx_option_price",
    "financepy_ibor_swap_price",
    "financepy_cds_spread",
    "vollib_black_price",
    "vollib_black_greeks",
    "vollib_black_iv",
    "vollib_bs_price",
    "vollib_bs_greeks",
    "vollib_bs_iv",
    "vollib_bsm_price",
    "vollib_bsm_greeks",
    "vollib_bsm_iv",
]

_DERIVATIVES_HANDLERS: dict[str, Any] = {
    "financepy_bond_price": _financepy_bond_price,
    "financepy_bond_ytm": _financepy_bond_ytm,
    "financepy_equity_option_price": _financepy_equity_option_price,
    "financepy_equity_option_implied_vol": _financepy_equity_option_implied_vol,
    "financepy_fx_option_price": _financepy_fx_option_price,
    "financepy_ibor_swap_price": _financepy_ibor_swap_price,
    "financepy_cds_spread": _financepy_cds_spread,
    "vollib_black_price": _vollib_handler("black_price"),
    "vollib_black_greeks": _vollib_handler("black_greeks"),
    "vollib_black_iv": _vollib_handler("black_iv"),
    "vollib_bs_price": _vollib_handler("bs_price"),
    "vollib_bs_greeks": _vollib_handler("bs_greeks"),
    "vollib_bs_iv": _vollib_handler("bs_iv"),
    "vollib_bsm_price": _vollib_handler("bsm_price"),
    "vollib_bsm_greeks": _vollib_handler("bsm_greeks"),
    "vollib_bsm_iv": _vollib_handler("bsm_iv"),
}


def get_analytics_handlers() -> dict[str, Any]:
    out = {name: _stub(name) for name in ANALYTICS_COMMANDS}
    out.update(_DERIVATIVES_HANDLERS)
    return out
