"""
YFinance data logic (ported from fincept-terminal-desktop yfinance_data.py).
Used by execute_yfinance_command handler.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

# Optional: only used when yfinance/pandas installed
try:
    import pandas as pd
    import yfinance as yf
except ImportError:
    pd = None  # type: ignore
    yf = None  # type: ignore


def get_quote(symbol: str) -> dict[str, Any]:
    if yf is None:
        return {"error": "yfinance not installed", "symbol": symbol}
    try:
        import contextlib
        import io
        ticker = yf.Ticker(symbol)
        _buf = io.StringIO()
        with contextlib.redirect_stdout(_buf):
            info = ticker.info
            hist = ticker.history(period="1d")
        if hist.empty:
            return {"error": "No data available", "symbol": symbol}
        current_price = float(hist["Close"].iloc[-1])
        previous_close = info.get("previousClose") or current_price
        change = current_price - previous_close
        change_percent = (change / previous_close) * 100 if previous_close else 0
        return {
            "symbol": symbol,
            "price": round(current_price, 2),
            "change": round(change, 2),
            "change_percent": round(change_percent, 2),
            "volume": int(hist["Volume"].iloc[-1]) if not hist["Volume"].empty else None,
            "high": round(float(hist["High"].iloc[-1]), 2) if not hist["High"].empty else None,
            "low": round(float(hist["Low"].iloc[-1]), 2) if not hist["Low"].empty else None,
            "open": round(float(hist["Open"].iloc[-1]), 2) if not hist["Open"].empty else None,
            "previous_close": round(float(previous_close), 2),
            "timestamp": int(datetime.now().timestamp()),
            "exchange": info.get("exchange", ""),
        }
    except Exception as e:
        return {"error": str(e), "symbol": symbol}


def get_batch_quotes(symbols: list[str]) -> list[dict[str, Any]]:
    if yf is None or pd is None:
        return []
    try:
        import contextlib
        import io
        _buf = io.StringIO()
        with contextlib.redirect_stdout(_buf):
            data = yf.download(symbols, period="5d", group_by="ticker", progress=False, threads=True, auto_adjust=True)
        if data is None or data.empty:
            return []
        results = []
        for symbol in symbols:
            try:
                if len(symbols) == 1:
                    hist = data
                else:
                    if hasattr(data.columns, "get_level_values") and symbol in data.columns.get_level_values(1).unique().tolist():
                        hist = data.xs(symbol, axis=1, level=1)
                    elif len(symbols) == 1 or symbol in data.columns:
                        hist = data[symbol] if isinstance(data[symbol], type(data)) else data
                    else:
                        continue
                if hist.empty or hist.dropna(how="all").empty:
                    continue
                hist = hist.dropna(how="all")
                current_price = float(hist["Close"].iloc[-1])
                previous_close = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else current_price
                change = current_price - previous_close
                change_percent = (change / previous_close) * 100 if previous_close else 0
                results.append({
                    "symbol": symbol,
                    "price": round(current_price, 2),
                    "change": round(change, 2),
                    "change_percent": round(change_percent, 2),
                    "volume": int(hist["Volume"].iloc[-1]) if not pd.isna(hist["Volume"].iloc[-1]) else 0,
                    "high": round(float(hist["High"].iloc[-1]), 2) if not pd.isna(hist["High"].iloc[-1]) else None,
                    "low": round(float(hist["Low"].iloc[-1]), 2) if not pd.isna(hist["Low"].iloc[-1]) else None,
                    "open": round(float(hist["Open"].iloc[-1]), 2) if not pd.isna(hist["Open"].iloc[-1]) else None,
                    "previous_close": round(previous_close, 2),
                    "timestamp": int(datetime.now().timestamp()),
                    "exchange": "",
                })
            except Exception:
                continue
        return results
    except Exception:
        return [get_quote(s) for s in symbols if "error" not in get_quote(s)]


def get_historical(symbol: str, start_date: str, end_date: str, interval: str = "1d") -> Any:
    if yf is None:
        return {"error": "yfinance not installed", "symbol": symbol}
    try:
        import contextlib
        import io
        ticker = yf.Ticker(symbol)
        _buf = io.StringIO()
        with contextlib.redirect_stdout(_buf):
            hist = ticker.history(start=start_date, end=end_date, interval=interval)
        if hist.empty:
            return []
        return [
            {
                "symbol": symbol,
                "timestamp": int(idx.timestamp()),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
                "adj_close": round(float(row["Close"]), 2),
            }
            for idx, row in hist.iterrows()
        ]
    except Exception as e:
        return {"error": str(e), "symbol": symbol}


def get_period_returns(symbol: str) -> dict[str, Any]:
    """7-day and 30-day % returns from historical close. Returns symbol, seven_day, thirty_day."""
    if yf is None:
        return {"symbol": symbol, "seven_day": 0.0, "thirty_day": 0.0}
    try:
        import contextlib
        import io
        ticker = yf.Ticker(symbol)
        _buf = io.StringIO()
        with contextlib.redirect_stdout(_buf):
            hist = ticker.history(period="35d")
        if hist is None or hist.empty or "Close" not in hist.columns:
            return {"symbol": symbol, "seven_day": 0.0, "thirty_day": 0.0}
        close = hist["Close"].dropna()
        if len(close) < 2:
            return {"symbol": symbol, "seven_day": 0.0, "thirty_day": 0.0}
        p7 = ((close.iloc[-1] - close.iloc[-8]) / close.iloc[-8] * 100) if len(close) >= 8 else 0.0
        p30 = ((close.iloc[-1] - close.iloc[0]) / close.iloc[0] * 100)
        return {
            "symbol": symbol,
            "seven_day": round(float(p7), 4),
            "thirty_day": round(float(p30), 4),
        }
    except Exception:
        return {"symbol": symbol, "seven_day": 0.0, "thirty_day": 0.0}


def get_info(symbol: str) -> dict[str, Any]:
    if yf is None:
        return {"error": "yfinance not installed", "symbol": symbol}
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        return {
            "symbol": symbol,
            "company_name": info.get("longName", info.get("shortName", "N/A")),
            "sector": info.get("sector", "N/A"),
            "industry": info.get("industry", "N/A"),
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE"),
            "current_price": info.get("currentPrice"),
            "timestamp": int(datetime.now().timestamp()),
        }
    except Exception as e:
        return {"error": str(e), "symbol": symbol}


def run_command(command: str, args: list[str]) -> Any:
    """Dispatch to the same commands as yfinance_data.py main()."""
    if command == "quote":
        return get_quote(args[0]) if args else {"error": "Usage: quote <symbol>"}
    if command == "batch_quotes":
        return get_batch_quotes(args) if args else {"error": "Usage: batch_quotes <symbol1> ..."}
    if command == "historical":
        if len(args) < 3:
            return {"error": "Usage: historical <symbol> <start_date> <end_date> [interval]"}
        return get_historical(args[0], args[1], args[2], args[3] if len(args) > 3 else "1d")
    if command == "info":
        return get_info(args[0]) if args else {"error": "Usage: info <symbol>"}
    if command == "period_returns":
        return get_period_returns(args[0]) if args else {"error": "Usage: period_returns <symbol>"}
    return {"error": f"Unknown command: {command}"}
