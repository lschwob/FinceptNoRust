"""In-memory swap paper trading: books and trades (IRS, OIS, curve, fly, ASW, basis).
MTM via live market data provider snapshot."""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.domains.rates_ird import ecb_sdw, pricing
from app.domains.rates_ird import market_data_provider
from app.domains.rates_ird import structured_pricing

_books: dict[str, dict[str, Any]] = {}
_trades: list[dict[str, Any]] = []


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _add_years(d: str, years: float) -> str:
    try:
        dt = datetime.strptime(d[:10], "%Y-%m-%d")
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

    product_type = (args.get("product_type") or args.get("type") or "IRS").upper()
    valid_types = ("IRS", "OIS", "CURVE", "FLY", "ASW", "BASIS")
    if product_type not in valid_types:
        product_type = "IRS"

    trade_date = args.get("trade_date") or _now_iso()
    trade_id = str(uuid.uuid4())

    if product_type in ("IRS", "OIS"):
        return _enter_vanilla(trade_id, book_id, product_type, args, trade_date)
    elif product_type == "CURVE":
        return _enter_structured(trade_id, book_id, product_type, args, trade_date)
    elif product_type == "FLY":
        return _enter_structured(trade_id, book_id, product_type, args, trade_date)
    elif product_type == "ASW":
        return _enter_structured(trade_id, book_id, product_type, args, trade_date)
    elif product_type == "BASIS":
        return _enter_structured(trade_id, book_id, product_type, args, trade_date)
    return {"success": False, "error": f"Unknown product type: {product_type}"}


def _enter_vanilla(trade_id: str, book_id: str, product_type: str, args: dict[str, Any], trade_date: str) -> dict[str, Any]:
    position = (args.get("position") or "payer").lower()
    if position not in ("payer", "receiver"):
        position = "payer"
    notional = float(args.get("notional", 10_000_000))
    fixed_rate = float(args.get("fixed_rate", 0))
    tenor_years = float(args.get("tenor_years", 10))
    pay_freq = int(args.get("pay_freq", 2))
    maturity_date = _add_years(trade_date, tenor_years)

    entry_par_rate = float(args.get("entry_par_rate", 0))
    if entry_par_rate == 0 and product_type == "IRS":
        try:
            snap = market_data_provider.get_live_snapshot()
            dc = snap.discount_factors
            res = pricing.price_irs(notional, 0, tenor_years, pay_freq, dc, "payer")
            entry_par_rate = res.get("par_rate", 0)
        except Exception:
            pass

    trade = {
        "id": trade_id,
        "portfolio_id": book_id,
        "product_type": product_type,
        "type": product_type,
        "position": position,
        "notional": notional,
        "fixed_rate": fixed_rate,
        "tenor_years": tenor_years,
        "pay_freq": pay_freq,
        "trade_date": trade_date,
        "maturity_date": maturity_date,
        "entry_par_rate": entry_par_rate,
        "entry_level": round(fixed_rate * 100, 2) if fixed_rate else 0.0,
        "current_level": 0.0,
        "entry_pv": 0.0,
        "current_pv": 0.0,
        "unrealized_pnl": 0.0,
        "realized_pnl": 0.0,
        "dv01": 0.0,
        "last_mtm_timestamp": 0.0,
        "status": "active",
        "legs": [],
        "description": f"{product_type} {tenor_years:.0f}Y {position}",
    }
    _trades.append(trade)
    _mtm_one(trade)
    trade["entry_pv"] = trade["current_pv"]
    return {"success": True, "data": trade}


def _enter_structured(trade_id: str, book_id: str, product_type: str, args: dict[str, Any], trade_date: str) -> dict[str, Any]:
    notional = float(args.get("notional", 10_000_000))
    position = args.get("position", "steepener")
    pay_freq = int(args.get("pay_freq", 2))

    snap = market_data_provider.get_live_snapshot()

    entry_level: float = 0.0
    description = ""
    legs: list[dict[str, Any]] = []
    tenor_years: float = 10.0
    dv01: float = 0.0

    if product_type == "CURVE":
        short_tenor = args.get("short_tenor", "2Y")
        long_tenor = args.get("long_tenor", "10Y")
        result = structured_pricing.price_curve_trade(short_tenor, long_tenor, notional, position, snap, pay_freq)
        if "error" in result:
            return {"success": False, "error": result["error"]}
        entry_level = result["current_spread_bps"]
        description = result["description"]
        dv01 = abs(result.get("dv01_short", 0))
        tenor_years = max(pricing._maturity_to_years(short_tenor), pricing._maturity_to_years(long_tenor))
        legs = [
            {"tenor": short_tenor, "position": "payer" if position == "steepener" else "receiver",
             "notional": result["notional_short"], "rate": result["rate_short"]},
            {"tenor": long_tenor, "position": "receiver" if position == "steepener" else "payer",
             "notional": result["notional_long"], "rate": result["rate_long"]},
        ]

    elif product_type == "FLY":
        wing1 = args.get("wing1", "2Y")
        body = args.get("body", "5Y")
        wing2 = args.get("wing2", "10Y")
        result = structured_pricing.price_fly(wing1, body, wing2, notional, position, snap, pay_freq)
        if "error" in result:
            return {"success": False, "error": result["error"]}
        entry_level = result["current_fly_bps"]
        description = result["description"]
        dv01 = abs(result.get("dv01", 0))
        tenor_years = max(pricing._maturity_to_years(wing1), pricing._maturity_to_years(body), pricing._maturity_to_years(wing2))
        legs = [
            {"tenor": wing1, "position": "wing", "notional": result["notional_wing1"], "rate": result["rate_wing1"]},
            {"tenor": body, "position": "body", "notional": result["notional_body"], "rate": result["rate_body"]},
            {"tenor": wing2, "position": "wing", "notional": result["notional_wing2"], "rate": result["rate_wing2"]},
        ]

    elif product_type == "ASW":
        tenor = args.get("tenor", "10Y")
        bond_yield = float(args.get("bond_yield", 0))
        swap_rate = args.get("swap_rate")
        if swap_rate is not None:
            swap_rate = float(swap_rate)
        result = structured_pricing.price_asw(bond_yield, swap_rate, tenor, notional, snap, pay_freq)
        if "error" in result:
            return {"success": False, "error": result["error"]}
        entry_level = result["current_asw_bps"]
        description = result["description"]
        dv01 = abs(result.get("dv01", 0))
        tenor_years = pricing._maturity_to_years(tenor)
        legs = [{"tenor": tenor, "position": "asw", "notional": notional, "bond_yield": bond_yield, "swap_rate": result["swap_rate"]}]

    elif product_type == "BASIS":
        tenor = args.get("tenor", "5Y")
        index1 = args.get("index1", "3M")
        index2 = args.get("index2", "6M")
        spread_bps = float(args.get("spread_bps", 0))
        result = structured_pricing.price_basis_swap(tenor, index1, index2, spread_bps, notional, snap, pay_freq)
        if "error" in result:
            return {"success": False, "error": result["error"]}
        entry_level = result["current_basis_bps"]
        description = result["description"]
        dv01 = abs(result.get("dv01", 0))
        tenor_years = pricing._maturity_to_years(tenor)
        legs = [{"tenor": tenor, "index1": index1, "index2": index2, "spread_bps": spread_bps, "notional": notional}]

    maturity_date = _add_years(trade_date, tenor_years)

    trade = {
        "id": trade_id,
        "portfolio_id": book_id,
        "product_type": product_type,
        "type": product_type,
        "position": position,
        "notional": notional,
        "fixed_rate": 0.0,
        "tenor_years": tenor_years,
        "pay_freq": pay_freq,
        "trade_date": trade_date,
        "maturity_date": maturity_date,
        "entry_par_rate": 0.0,
        "entry_level": round(entry_level, 2),
        "current_level": round(entry_level, 2),
        "entry_pv": 0.0,
        "current_pv": 0.0,
        "unrealized_pnl": 0.0,
        "realized_pnl": 0.0,
        "dv01": round(dv01, 2),
        "last_mtm_timestamp": time.time(),
        "status": "active",
        "legs": legs,
        "description": description,
    }
    _trades.append(trade)
    return {"success": True, "data": trade}


def _mtm_one(trade: dict[str, Any], snapshot: Any = None) -> None:
    if trade.get("status") != "active":
        return

    product_type = (trade.get("product_type") or trade.get("type", "IRS")).upper()

    if snapshot is None:
        try:
            snapshot = market_data_provider.get_live_snapshot()
        except Exception:
            snapshot = None

    if product_type == "OIS":
        estr = snapshot.estr if snapshot else None
        if estr is None:
            try:
                estr_obs = ecb_sdw.get_estr(last_n=1)
                estr = estr_obs[-1].get("value") if estr_obs else 0.0
            except Exception:
                estr = 0.0
        res = pricing.price_ois(trade["notional"], trade["fixed_rate"], trade["tenor_years"], estr)
        trade["current_pv"] = res["pv"] if trade["position"] == "payer" else -res["pv"]
        trade["dv01"] = res.get("dv01", 0)

    elif product_type == "IRS":
        if snapshot:
            dc = snapshot.discount_factors
        else:
            spot = ecb_sdw.get_ecb_yield_curve("spot_rate", "A", None)
            dc = pricing.build_discount_curve([{"maturity": p["maturity"], "value": p["value"]} for p in spot])
        res = pricing.price_irs(
            trade["notional"], trade["fixed_rate"], trade["tenor_years"],
            trade["pay_freq"], dc, trade["position"],
        )
        trade["current_pv"] = res["pv"]
        trade["dv01"] = res.get("dv01", 0)

    elif product_type == "CURVE" and snapshot:
        legs = trade.get("legs", [])
        if len(legs) >= 2:
            short_tenor = legs[0].get("tenor", "2Y")
            long_tenor = legs[1].get("tenor", "10Y")
            result = structured_pricing.price_curve_trade(
                short_tenor, long_tenor, trade["notional"],
                trade["position"], snapshot, trade["pay_freq"],
                entry_spread_bps=trade.get("entry_level"),
            )
            if "error" not in result:
                trade["current_pv"] = result["pv"]
                trade["current_level"] = result["current_spread_bps"]
                trade["dv01"] = abs(result.get("dv01_short", 0))

    elif product_type == "FLY" and snapshot:
        legs = trade.get("legs", [])
        if len(legs) >= 3:
            result = structured_pricing.price_fly(
                legs[0].get("tenor", "2Y"), legs[1].get("tenor", "5Y"),
                legs[2].get("tenor", "10Y"), trade["notional"],
                trade["position"], snapshot, trade["pay_freq"],
                entry_fly_bps=trade.get("entry_level"),
            )
            if "error" not in result:
                trade["current_pv"] = result["pv"]
                trade["current_level"] = result["current_fly_bps"]
                trade["dv01"] = abs(result.get("dv01", 0))

    elif product_type == "ASW" and snapshot:
        legs = trade.get("legs", [])
        if legs:
            result = structured_pricing.price_asw(
                legs[0].get("bond_yield", 0), None,
                legs[0].get("tenor", "10Y"), trade["notional"],
                snapshot, trade["pay_freq"],
                entry_asw_bps=trade.get("entry_level"),
            )
            if "error" not in result:
                trade["current_pv"] = result["pv"]
                trade["current_level"] = result["current_asw_bps"]
                trade["dv01"] = abs(result.get("dv01", 0))

    elif product_type == "BASIS" and snapshot:
        legs = trade.get("legs", [])
        if legs:
            result = structured_pricing.price_basis_swap(
                legs[0].get("tenor", "5Y"), legs[0].get("index1", "3M"),
                legs[0].get("index2", "6M"), legs[0].get("spread_bps", 0),
                trade["notional"], snapshot, trade["pay_freq"],
                entry_basis_bps=trade.get("entry_level"),
            )
            if "error" not in result:
                trade["current_pv"] = result["pv"]
                trade["current_level"] = result["current_basis_bps"]
                trade["dv01"] = abs(result.get("dv01", 0))

    entry_pv = trade.get("entry_pv", 0.0)
    trade["unrealized_pnl"] = round(trade["current_pv"] - entry_pv, 2)
    trade["last_mtm_timestamp"] = time.time()


def swap_pt_close_trade(args: dict[str, Any]) -> dict[str, Any]:
    trade_id = args.get("trade_id", "")
    for t in _trades:
        if t.get("id") == trade_id:
            t["realized_pnl"] = t.get("unrealized_pnl", 0.0)
            t["unrealized_pnl"] = 0.0
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
    snapshot = None
    try:
        snapshot = market_data_provider.get_live_snapshot()
    except Exception:
        pass
    for t in _trades:
        if t.get("portfolio_id") == book_id:
            _mtm_one(t, snapshot)
    out = [t for t in _trades if t.get("portfolio_id") == book_id]
    total_pv = sum(t.get("current_pv", 0) for t in out if t.get("status") == "active")
    total_dv01 = sum(t.get("dv01", 0) for t in out if t.get("status") == "active")
    total_unrealized = sum(t.get("unrealized_pnl", 0) for t in out if t.get("status") == "active")
    total_realized = sum(t.get("realized_pnl", 0) for t in out)
    return {
        "success": True,
        "data": {
            "trades": out,
            "summary": {
                "total_pv": round(total_pv, 2),
                "total_dv01": round(total_dv01, 2),
                "total_unrealized_pnl": round(total_unrealized, 2),
                "total_realized_pnl": round(total_realized, 2),
                "total_pnl": round(total_unrealized + total_realized, 2),
                "active_trades": len([t for t in out if t.get("status") == "active"]),
                "last_mtm": time.time(),
            },
        },
    }


def swap_pt_get_risk(args: dict[str, Any]) -> dict[str, Any]:
    book_id = args.get("book_id", "")
    if book_id not in _books:
        return {"success": False, "error": "Book not found"}
    active = [t for t in _trades if t.get("portfolio_id") == book_id and t.get("status") == "active"]
    snapshot = None
    try:
        snapshot = market_data_provider.get_live_snapshot()
    except Exception:
        pass
    for t in active:
        _mtm_one(t, snapshot)
    total_dv01 = sum(t.get("dv01", 0) for t in active)
    total_pv01 = total_dv01
    by_tenor: dict[str, float] = {}
    for t in active:
        pt = (t.get("product_type") or "IRS").upper()
        if pt in ("CURVE", "FLY") and t.get("legs"):
            for leg in t["legs"]:
                tn = leg.get("tenor", "?")
                by_tenor[tn] = by_tenor.get(tn, 0) + t.get("dv01", 0) / len(t["legs"])
        else:
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
