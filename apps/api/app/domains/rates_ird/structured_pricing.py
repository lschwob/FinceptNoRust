"""
Extended pricing engine for structured rate products.
Curve trades (spreads), butterflies, asset swap spreads, basis swaps.
All prices computed from the live RateSnapshot.
"""
from __future__ import annotations

import math
from typing import Any

from app.domains.rates_ird.pricing import (
    build_discount_curve,
    price_irs,
    _interp_discount,
    _maturity_to_years,
)
from app.domains.rates_ird.market_data_provider import RateSnapshot


def _annuity(tenor_years: float, pay_freq: int, discount_curve: list[tuple[float, float]]) -> float:
    n = max(1, int(tenor_years * pay_freq))
    a = 0.0
    for i in range(1, n + 1):
        a += _interp_discount(i / pay_freq, discount_curve)
    return a / pay_freq


def price_curve_trade(
    short_tenor: str,
    long_tenor: str,
    notional: float,
    position: str,
    snapshot: RateSnapshot,
    pay_freq: int = 2,
    entry_spread_bps: float | None = None,
) -> dict[str, Any]:
    """
    Curve trade (e.g. 2s10s steepener/flattener).
    DV01-neutral: notional_long = notional × annuity_short / annuity_long.
    """
    dc = snapshot.discount_factors
    t_short = _maturity_to_years(short_tenor)
    t_long = _maturity_to_years(long_tenor)
    if t_short <= 0 or t_long <= 0:
        return {"error": f"Invalid tenors: {short_tenor}/{long_tenor}"}

    ann_short = _annuity(t_short, pay_freq, dc)
    ann_long = _annuity(t_long, pay_freq, dc)
    notional_long = notional * ann_short / ann_long if ann_long > 0 else notional

    rate_short = snapshot._rate(short_tenor)
    rate_long = snapshot._rate(long_tenor)
    if rate_short is None or rate_long is None:
        return {"error": f"Missing rates for {short_tenor} or {long_tenor}"}

    current_spread_bps = round((rate_long - rate_short) * 100, 2)
    if entry_spread_bps is None:
        entry_spread_bps = current_spread_bps

    dv01_short = notional * ann_short / 10000
    dv01_long = notional_long * ann_long / 10000

    spread_move_bps = current_spread_bps - entry_spread_bps
    sign = 1.0 if position.lower() == "steepener" else -1.0
    pv = sign * spread_move_bps * dv01_short

    return {
        "product_type": "curve",
        "description": f"{short_tenor}/{long_tenor} {'steepener' if sign > 0 else 'flattener'}",
        "short_tenor": short_tenor,
        "long_tenor": long_tenor,
        "notional_short": round(notional, 0),
        "notional_long": round(notional_long, 0),
        "rate_short": round(rate_short, 4),
        "rate_long": round(rate_long, 4),
        "current_spread_bps": current_spread_bps,
        "entry_spread_bps": round(entry_spread_bps, 2),
        "pv": round(pv, 2),
        "dv01_short": round(dv01_short, 2),
        "dv01_long": round(dv01_long, 2),
        "net_dv01": round(dv01_short - dv01_long, 2),
        "annuity_short": round(ann_short, 4),
        "annuity_long": round(ann_long, 4),
    }


def price_fly(
    wing1: str,
    body: str,
    wing2: str,
    notional: float,
    position: str,
    snapshot: RateSnapshot,
    pay_freq: int = 2,
    entry_fly_bps: float | None = None,
) -> dict[str, Any]:
    """
    Butterfly (e.g. 2s5s10s): body - (wing1 + wing2) / 2.
    Buy body = pay wings, receive 2× body → profits if fly richens (body cheapens vs wings).
    Sell body = receive wings, pay 2× body → profits if fly cheapens.
    DV01-weighted notionals.
    """
    dc = snapshot.discount_factors
    t_w1 = _maturity_to_years(wing1)
    t_body = _maturity_to_years(body)
    t_w2 = _maturity_to_years(wing2)
    if t_w1 <= 0 or t_body <= 0 or t_w2 <= 0:
        return {"error": f"Invalid tenors: {wing1}/{body}/{wing2}"}

    ann_w1 = _annuity(t_w1, pay_freq, dc)
    ann_body = _annuity(t_body, pay_freq, dc)
    ann_w2 = _annuity(t_w2, pay_freq, dc)

    r_w1 = snapshot._rate(wing1)
    r_body = snapshot._rate(body)
    r_w2 = snapshot._rate(wing2)
    if r_w1 is None or r_body is None or r_w2 is None:
        return {"error": f"Missing rates for {wing1}/{body}/{wing2}"}

    current_fly_bps = round((r_body - (r_w1 + r_w2) / 2) * 100, 2)
    if entry_fly_bps is None:
        entry_fly_bps = current_fly_bps

    dv01_body = notional * ann_body / 10000
    notional_w1 = notional * ann_body / ann_w1 / 2 if ann_w1 > 0 else notional / 2
    notional_w2 = notional * ann_body / ann_w2 / 2 if ann_w2 > 0 else notional / 2

    fly_move_bps = current_fly_bps - entry_fly_bps
    sign = 1.0 if position.lower() == "sell_body" else -1.0
    pv = sign * fly_move_bps * dv01_body

    return {
        "product_type": "fly",
        "description": f"{wing1}/{body}/{wing2} {'sell body' if sign > 0 else 'buy body'}",
        "wing1": wing1,
        "body": body,
        "wing2": wing2,
        "notional_body": round(notional, 0),
        "notional_wing1": round(notional_w1, 0),
        "notional_wing2": round(notional_w2, 0),
        "rate_wing1": round(r_w1, 4),
        "rate_body": round(r_body, 4),
        "rate_wing2": round(r_w2, 4),
        "current_fly_bps": current_fly_bps,
        "entry_fly_bps": round(entry_fly_bps, 2),
        "pv": round(pv, 2),
        "dv01": round(dv01_body, 2),
    }


def price_asw(
    bond_yield: float,
    swap_rate: float | None,
    tenor: str,
    notional: float,
    snapshot: RateSnapshot,
    pay_freq: int = 2,
    entry_asw_bps: float | None = None,
) -> dict[str, Any]:
    """
    Asset Swap Spread: ASW = bond_yield - swap_rate (same maturity).
    PV ≈ notional × (current_asw - entry_asw) × annuity / 10000.
    """
    dc = snapshot.discount_factors
    t = _maturity_to_years(tenor)
    if t <= 0:
        return {"error": f"Invalid tenor: {tenor}"}

    if swap_rate is None:
        swap_rate = snapshot._rate(tenor)
    if swap_rate is None:
        return {"error": f"No swap rate available for {tenor}"}

    current_asw_bps = round((bond_yield - swap_rate) * 100, 2)
    if entry_asw_bps is None:
        entry_asw_bps = current_asw_bps

    ann = _annuity(t, pay_freq, dc)
    dv01 = notional * ann / 10000
    pv = (current_asw_bps - entry_asw_bps) * dv01

    return {
        "product_type": "asw",
        "description": f"ASW {tenor}",
        "tenor": tenor,
        "notional": round(notional, 0),
        "bond_yield": round(bond_yield, 4),
        "swap_rate": round(swap_rate, 4),
        "current_asw_bps": current_asw_bps,
        "entry_asw_bps": round(entry_asw_bps, 2),
        "pv": round(pv, 2),
        "dv01": round(dv01, 2),
        "annuity": round(ann, 4),
    }


def price_basis_swap(
    tenor: str,
    index1: str,
    index2: str,
    spread_bps: float,
    notional: float,
    snapshot: RateSnapshot,
    pay_freq: int = 4,
    entry_basis_bps: float | None = None,
) -> dict[str, Any]:
    """
    Basis swap (e.g. 3M vs 6M EURIBOR).
    One leg pays index1, other pays index2 + spread.
    PV ≈ notional × (market_basis - trade_basis) × annuity / 10000.
    """
    dc = snapshot.discount_factors
    t = _maturity_to_years(tenor)
    if t <= 0:
        return {"error": f"Invalid tenor: {tenor}"}

    rate1 = snapshot.euribor.get(index1)
    rate2 = snapshot.euribor.get(index2)
    if rate1 is None or rate2 is None:
        return {"error": f"Missing EURIBOR rates for {index1} or {index2}"}

    current_basis_bps = round((rate2 - rate1) * 100, 2)
    if entry_basis_bps is None:
        entry_basis_bps = current_basis_bps

    ann = _annuity(t, pay_freq, dc)
    dv01 = notional * ann / 10000
    pv = (current_basis_bps - entry_basis_bps - spread_bps) * dv01

    return {
        "product_type": "basis",
        "description": f"{index1}/{index2} basis {tenor}",
        "tenor": tenor,
        "index1": index1,
        "index2": index2,
        "notional": round(notional, 0),
        "rate_index1": round(rate1, 4),
        "rate_index2": round(rate2, 4),
        "current_basis_bps": current_basis_bps,
        "entry_basis_bps": round(entry_basis_bps, 2),
        "trade_spread_bps": round(spread_bps, 2),
        "pv": round(pv, 2),
        "dv01": round(dv01, 2),
        "annuity": round(ann, 4),
    }
