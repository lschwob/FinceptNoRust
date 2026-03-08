"""Market data command handlers."""
from __future__ import annotations

from typing import Any

from app.domains.market_data.yfinance_impl import (
    get_quote as yf_get_quote,
    get_batch_quotes as yf_get_batch_quotes,
    get_historical as yf_get_historical,
    get_info as yf_get_info,
    get_period_returns as yf_get_period_returns,
    run_command as yfinance_run_command,
)

try:
    import yfinance as _yf
    _YF_AVAILABLE = True
except ImportError:
    _YF_AVAILABLE = False


def _quote_to_frontend(raw: dict[str, Any]) -> dict[str, Any]:
    """Map yfinance quote dict to frontend QuoteData shape."""
    if "error" in raw:
        return raw
    return {
        "symbol": raw.get("symbol", ""),
        "price": raw.get("price", 0),
        "change": raw.get("change", 0),
        "change_percent": raw.get("change_percent", 0),
        "volume": raw.get("volume"),
        "high": raw.get("high"),
        "low": raw.get("low"),
        "open": raw.get("open"),
        "previous_close": raw.get("previous_close"),
        "timestamp": raw.get("timestamp", 0),
    }


def get_market_quote(args: dict[str, Any]) -> dict[str, Any]:
    """Single quote for dashboard/widgets. Returns { success, data? } or { success, error? }."""
    symbol = (args.get("symbol") or "").strip()
    if not symbol:
        return {"success": False, "error": "Missing symbol"}
    raw = yf_get_quote(symbol)
    if "error" in raw:
        return {"success": False, "error": raw["error"], "symbol": symbol}
    return {"success": True, "data": _quote_to_frontend(raw)}


def get_market_quotes(args: dict[str, Any]) -> dict[str, Any]:
    """Batch quotes for dashboard/widgets. Returns { success, data: [] }."""
    symbols = args.get("symbols")
    if isinstance(symbols, str):
        symbols = [s.strip() for s in symbols.split(",") if s.strip()]
    elif not isinstance(symbols, list):
        return {"success": True, "data": []}
    symbols = [str(s).strip() for s in symbols if str(s).strip()]
    if not symbols:
        return {"success": True, "data": []}
    raw_list = yf_get_batch_quotes(symbols)
    data = []
    for raw in raw_list:
        if isinstance(raw, dict) and "error" not in raw:
            data.append(_quote_to_frontend(raw))
    return {"success": True, "data": data}


def get_period_returns(args: dict[str, Any]) -> dict[str, Any]:
    """7D/30D returns for enhanced quotes."""
    symbol = (args.get("symbol") or "").strip()
    if not symbol:
        return {"success": False, "error": "Missing symbol"}
    data = yf_get_period_returns(symbol)
    return {"success": True, "data": data}


def get_historical_data(args: dict[str, Any]) -> Any:
    """OHLCV historical bars. Returns list of candles or { error }."""
    symbol = (args.get("symbol") or "").strip()
    start_date = (args.get("start_date") or args.get("start") or "").strip()
    end_date = (args.get("end_date") or args.get("end") or "").strip()
    interval = (args.get("interval") or "1d").strip() or "1d"
    if not symbol or not start_date or not end_date:
        return {"error": "Missing symbol, start_date, or end_date", "symbol": symbol}
    result = yf_get_historical(symbol, start_date, end_date, interval)
    if isinstance(result, dict) and "error" in result:
        return result
    return result


def get_stock_info(args: dict[str, Any]) -> dict[str, Any]:
    """Company info/fundamentals. Returns { success, data? } or { success, error? }."""
    symbol = (args.get("symbol") or "").strip()
    if not symbol:
        return {"success": False, "error": "Missing symbol"}
    result = yf_get_info(symbol)
    if isinstance(result, dict) and "error" in result:
        return {"success": False, "error": result["error"], "symbol": symbol}
    return {"success": True, "data": result}


def execute_yfinance_command(args: dict[str, Any]) -> Any:
    """Execute a yfinance sub-command (quote, batch_quotes, historical, info, etc.)."""
    command = args.get("command", "")
    arg_list = args.get("args", [])
    if isinstance(arg_list, str):
        arg_list = [arg_list]
    return yfinance_run_command(command, list(arg_list))


def calculate_indicators_yfinance(args: dict[str, Any]) -> dict[str, Any]:
    """Technical indicators from yfinance history. Stub: returns not_implemented until analytics layer is added."""
    return {
        "status": "not_implemented_yet",
        "command": "calculate_indicators_yfinance",
        "message": "Use execute_yfinance_command with historical data and compute indicators client-side or via analytics domain.",
    }


def check_market_data_health(args: dict[str, Any]) -> bool:
    """Health check for market data (yfinance available)."""
    return _YF_AVAILABLE


def get_market_data_handlers() -> dict[str, Any]:
    return {
        "get_market_quote": get_market_quote,
        "get_market_quotes": get_market_quotes,
        "get_period_returns": get_period_returns,
        "get_historical_data": get_historical_data,
        "get_stock_info": get_stock_info,
        "check_market_data_health": check_market_data_health,
        "execute_yfinance_command": execute_yfinance_command,
        "calculate_indicators_yfinance": calculate_indicators_yfinance,
    }
