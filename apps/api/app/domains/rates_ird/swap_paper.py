"""In-memory swap paper trading: books and IRS/OIS trades. MTM via ECB spot curve."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.domains.rates_ird import ecb_sdw, pricing

_books: dict[str, dict[str, Any]] = {}
_trades: list[dict[str, Any]] = []


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _add_years(d: str, years: float) -> str:
    try:
        dt = datetime.strptime(d[:10], "%Y-%m-%d")
        # approximate: add 365.25 * years days
        delta = timedelta(days=int(365.25 * years))
        return (dt + delta).strftime("%Y-%m-%d")
    except Exception:
        return d


def swap_pt_create_book(args: dict[str, Any]) -> dict[str, Any]:
    name = args.get("name", "Swap Book 1")
    currency = args.get("currency", "EUR")
    book_id = str(uuid.uuid4())
    _books[book_id] = {"id": book_id, "name": name, "currency": currency, "created_at": _now_iso()}
    return {"success": True, "data": _books[book_id]}


def swap_pt_list_books(args: dict[str, Any]) -> dict[str, Any]:
    return {"success": True, "data": list(_books.values())}


def swap_pt_enter_trade(args: dict[str, Any]) -> dict[str, Any]:
    book_id = args.get("book_id", "")
    if book_id not in _books:
        return {"success": False, "error": "Book not found"}
    trade_type = (args.get("type") or "IRS").upper()
    if trade_type not in ("IRS", "OIS"):
        trade_type = "IRS"
    position = (args.get("position") or "payer").lower()
    if position not in ("payer", "receiver"):
        position = "payer"
    notional = float(args.get("notional", 10_000_000))
    fixed_rate = float(args.get("fixed_rate", 0))
    tenor_years = float(args.get("tenor_years", 10))
    pay_freq = int(args.get("pay_freq", 2))
    trade_date = args.get("trade_date") or _now_iso()
    maturity_date = _add_years(trade_date, tenor_years)
    entry_par_rate = float(args.get("entry_par_rate", 0))
    if entry_par_rate == 0 and trade_type == "IRS":
        spot = ecb_sdw.get_ecb_yield_curve("spot_rate", "A", None)
        curve = pricing.build_discount_curve([{"maturity": p["maturity"], "value": p["value"]} for p in spot])
        res = pricing.price_irs(notional, 0, tenor_years, pay_freq, curve, "payer")
        entry_par_rate = res.get("par_rate", 0)
    trade_id = str(uuid.uuid4())
    trade = {
        "id": trade_id,
        "portfolio_id": book_id,
        "type": trade_type,
        "position": position,
        "notional": notional,
        "fixed_rate": fixed_rate,
        "tenor_years": tenor_years,
        "pay_freq": pay_freq,
        "trade_date": trade_date,
        "maturity_date": maturity_date,
        "entry_par_rate": entry_par_rate,
        "current_pv": 0.0,
        "dv01": 0.0,
        "status": "active",
    }
    _trades.append(trade)
    _mtm_one(trade)
    return {"success": True, "data": trade}


def _mtm_one(trade: dict[str, Any]) -> None:
    if trade.get("status") != "active":
        return
    book_id = trade.get("portfolio_id", "")
    if trade.get("type") == "OIS":
        estr_obs = ecb_sdw.get_estr(last_n=1)
        ois_rate = estr_obs[-1].get("value") if estr_obs else 0.0
        res = pricing.price_ois(
            trade["notional"], trade["fixed_rate"], trade["tenor_years"], ois_rate
        )
        trade["current_pv"] = res["pv"] if trade["position"] == "payer" else -res["pv"]
        trade["dv01"] = res.get("dv01", 0)
        return
    spot = ecb_sdw.get_ecb_yield_curve("spot_rate", "A", None)
    curve = pricing.build_discount_curve([{"maturity": p["maturity"], "value": p["value"]} for p in spot])
    res = pricing.price_irs(
        trade["notional"], trade["fixed_rate"], trade["tenor_years"],
        trade["pay_freq"], curve, trade["position"],
    )
    trade["current_pv"] = res["pv"]
    trade["dv01"] = res.get("dv01", 0)


def swap_pt_close_trade(args: dict[str, Any]) -> dict[str, Any]:
    trade_id = args.get("trade_id", "")
    for t in _trades:
        if t.get("id") == trade_id:
            t["status"] = "closed"
            return {"success": True, "data": t}
    return {"success": False, "error": "Trade not found"}


def swap_pt_get_trades(args: dict[str, Any]) -> dict[str, Any]:
    book_id = args.get("book_id", "")
    out = [t for t in _trades if t.get("portfolio_id") == book_id]
    return {"success": True, "data": out}


def swap_pt_mtm_book(args: dict[str, Any]) -> dict[str, Any]:
    book_id = args.get("book_id", "")
    if book_id not in _books:
        return {"success": False, "error": "Book not found"}
    for t in _trades:
        if t.get("portfolio_id") == book_id:
            _mtm_one(t)
    out = [t for t in _trades if t.get("portfolio_id") == book_id]
    return {"success": True, "data": out}


def swap_pt_get_risk(args: dict[str, Any]) -> dict[str, Any]:
    book_id = args.get("book_id", "")
    if book_id not in _books:
        return {"success": False, "error": "Book not found"}
    active = [t for t in _trades if t.get("portfolio_id") == book_id and t.get("status") == "active"]
    for t in active:
        _mtm_one(t)
    total_dv01 = sum(t.get("dv01", 0) for t in active)
    total_pv01 = total_dv01
    by_tenor: dict[str, float] = {}
    for t in active:
        ty = str(int(t.get("tenor_years", 0))) + "Y"
        by_tenor[ty] = by_tenor.get(ty, 0) + t.get("dv01", 0)
    return {
        "success": True,
        "data": {
            "total_dv01": round(total_dv01, 2),
            "total_pv01": round(total_pv01, 2),
            "by_tenor": by_tenor,
            "trades_count": len(active),
        },
    }
