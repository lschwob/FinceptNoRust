"""
Rates strategy backtester using ECB historical spot rates.
Signal-based: curve steepener/flattener/carry; P&L via DV01 approximation.
"""
from __future__ import annotations

import math
from typing import Any

from app.domains.rates_ird import ecb_sdw

# Instrument -> (short maturity, long maturity) for spread; or single "10Y_IRS"
_INSTRUMENT_MATURITIES: dict[str, tuple[str, str | None]] = {
    "2s10s": ("2Y", "10Y"),
    "2s30s": ("2Y", "30Y"),
    "5s30s": ("5Y", "30Y"),
    "10Y_IRS": ("10Y", None),
}


def _series_to_by_date(obs: list[dict[str, Any]]) -> dict[str, float]:
    out: dict[str, float] = {}
    for p in obs:
        period = p.get("period") or ""
        value = p.get("value")
        if period and value is not None:
            # Normalise to YYYY-MM-DD if possible
            d = period.replace(" ", "")[:10]
            if len(d) >= 7:
                if len(d) == 7:
                    d = d + "-01"
                out[d] = float(value)
    return out


def get_rates_history(args: dict[str, Any]) -> dict[str, Any]:
    """
    Historical ECB YC spot series for chart/backtest.
    Returns { "series": { "2Y": [{ "date", "value" }], "10Y": [...] }, "spread": [...] }.
    """
    start_date = args.get("start_date") or args.get("startDate", "")
    end_date = args.get("end_date") or args.get("endDate", "")
    instrument = (args.get("instrument") or "2s10s").strip()
    last_n = int(args.get("last_n", 0)) or 500
    if not start_date and not end_date:
        start_date = ""
        end_date = ""

    maturities = _INSTRUMENT_MATURITIES.get(instrument, ("2Y", "10Y"))
    short_mat, long_mat = maturities
    series_short = ecb_sdw.get_ecb_yield_curve_series(
        short_mat, "spot_rate", start_date or None, end_date or None, last_n=last_n if not start_date else None
    )
    by_date_short = _series_to_by_date(series_short)
    out_series: dict[str, list[dict[str, Any]]] = {}
    out_series[short_mat] = [{"date": d, "value": v} for d, v in sorted(by_date_short.items())]

    if long_mat:
        series_long = ecb_sdw.get_ecb_yield_curve_series(
            long_mat, "spot_rate", start_date or None, end_date or None, last_n=last_n if not start_date else None
        )
        by_date_long = _series_to_by_date(series_long)
        out_series[long_mat] = [{"date": d, "value": v} for d, v in sorted(by_date_long.items())]
        common_dates = sorted(set(by_date_short) & set(by_date_long))
        spread = [{"date": d, "value": round(by_date_long[d] - by_date_short[d], 4)} for d in common_dates]
    else:
        spread = []

    return {
        "success": True,
        "data": {
            "series": out_series,
            "spread": spread,
            "instrument": instrument,
        },
    }


def backtest_rates_strategy(args: dict[str, Any]) -> dict[str, Any]:
    """
    Run signal-based backtest. Strategies: curve_steepener, curve_flattener, carry, custom.
    Enter when spread crosses entry_threshold, exit at exit_threshold.
    P&L: DV01 approximation ΔPV = -DV01 * Δspread (in bp); use notional to scale DV01.
    """
    strategy = (args.get("strategy") or "curve_steepener").strip()
    instrument = (args.get("instrument") or "2s10s").strip()
    start_date = args.get("start_date") or args.get("startDate", "")
    end_date = args.get("end_date") or args.get("endDate", "")
    entry_threshold = float(args.get("entry_threshold", 0))
    exit_threshold = float(args.get("exit_threshold", 0))
    notional = float(args.get("notional", 10_000_000))

    maturities = _INSTRUMENT_MATURITIES.get(instrument, ("2Y", "10Y"))
    short_mat, long_mat = maturities
    if not long_mat:
        return {"success": False, "error": "Instrument must be a spread (e.g. 2s10s)"}

    series_short = ecb_sdw.get_ecb_yield_curve_series(
        short_mat, "spot_rate", start_date or None, end_date or None, last_n=600
    )
    series_long = ecb_sdw.get_ecb_yield_curve_series(
        long_mat, "spot_rate", start_date or None, end_date or None, last_n=600
    )
    by_short = _series_to_by_date(series_short)
    by_long = _series_to_by_date(series_long)
    common_dates = sorted(set(by_short) & set(by_long))
    if not common_dates:
        return {
            "success": True,
            "data": {
                "trades": [],
                "equity_curve": [],
                "stats": {"total_trades": 0, "win_rate": 0, "total_pnl": 0, "max_drawdown": 0, "sharpe": 0},
            },
        }

    # Spread in % (e.g. 1.5 = 150 bp)
    spread_series = [(d, by_long[d] - by_short[d]) for d in common_dates]
    # DV01 scale: notional * annuity-like per 1bp; approximate 2s10s as ~8y
    dv01_per_bp = notional * 8.0 / 10000.0

    trades: list[dict[str, Any]] = []
    equity_curve: list[dict[str, Any]] = []
    cumulative = 0.0
    position: str | None = None
    entry_spread = 0.0
    entry_date = ""

    for i, (d, spread) in enumerate(spread_series):
        pnl_today = 0.0
        if position == "steepener":
            # We profit when spread increases (we're long spread)
            if (strategy == "curve_steepener" and spread >= exit_threshold) or (
                strategy == "curve_flattener" and spread <= exit_threshold
            ):
                pnl_today = dv01_per_bp * (spread - entry_spread) * 100  # spread in %, convert to bp
                cumulative += pnl_today
                trades.append({
                    "entry_date": entry_date, "exit_date": d, "position": position,
                    "entry_spread": round(entry_spread, 4), "exit_spread": round(spread, 4),
                    "pnl": round(pnl_today, 2),
                })
                position = None
        elif position == "flattener":
            if (strategy == "curve_flattener" and spread >= exit_threshold) or (
                strategy == "curve_steepener" and spread <= exit_threshold
            ):
                pnl_today = dv01_per_bp * (entry_spread - spread) * 100
                cumulative += pnl_today
                trades.append({
                    "entry_date": entry_date, "exit_date": d, "position": position,
                    "entry_spread": round(entry_spread, 4), "exit_spread": round(spread, 4),
                    "pnl": round(pnl_today, 2),
                })
                position = None

        if position is None:
            if strategy == "curve_steepener" and spread <= entry_threshold:
                position = "steepener"
                entry_spread = spread
                entry_date = d
            elif strategy == "curve_flattener" and spread >= entry_threshold:
                position = "flattener"
                entry_spread = spread
                entry_date = d

        equity_curve.append({"date": d, "pnl": round(pnl_today, 2), "cumulative": round(cumulative, 2)})

    total_pnl = cumulative
    total_trades = len(trades)
    wins = sum(1 for t in trades if t.get("pnl", 0) > 0)
    win_rate = wins / total_trades if total_trades else 0
    running = 0.0
    peak = 0.0
    max_drawdown = 0.0
    for pt in equity_curve:
        running = pt["cumulative"]
        peak = max(peak, running)
        max_drawdown = min(max_drawdown, running - peak)
    returns = [equity_curve[i]["cumulative"] - (equity_curve[i - 1]["cumulative"] if i else 0) for i in range(len(equity_curve))]
    mean_ret = sum(returns) / len(returns) if returns else 0
    std_ret = math.sqrt(sum((r - mean_ret) ** 2 for r in returns) / len(returns)) if len(returns) > 1 else 0
    sharpe = (mean_ret / std_ret * math.sqrt(252)) if std_ret else 0

    return {
        "success": True,
        "data": {
            "trades": trades,
            "equity_curve": equity_curve,
            "stats": {
                "total_trades": total_trades,
                "win_rate": round(win_rate, 2),
                "total_pnl": round(total_pnl, 2),
                "max_drawdown": round(max_drawdown, 2),
                "sharpe": round(sharpe, 2),
            },
        },
    }


def backtest_rates_strategy_handler(args: dict[str, Any]) -> dict[str, Any]:
    return backtest_rates_strategy(args)


def get_rates_history_handler(args: dict[str, Any]) -> dict[str, Any]:
    return get_rates_history(args)
