"""
Swap and bond pricing — SwapsBook formulas (Ch 7 IRS, Ch 3 bonds).
Pure Python; discount factors from yield curve (continuous compounding).
"""
from __future__ import annotations

import datetime as dt
import math
from typing import Any

# Maturity label -> years
MATURITY_TO_YEARS: dict[str, float] = {
    "1M": 1 / 12, "3M": 0.25, "6M": 0.5, "1Y": 1, "2Y": 2, "3Y": 3, "4Y": 4,
    "5Y": 5, "6Y": 6, "7Y": 7, "8Y": 8, "9Y": 9, "10Y": 10, "15Y": 15, "20Y": 20, "30Y": 30,
}


def _maturity_to_years(m: str) -> float:
    if m in MATURITY_TO_YEARS:
        return MATURITY_TO_YEARS[m]
    m = m.upper().replace(" ", "")
    if m.endswith("Y") and m[:-1].replace(".", "").isdigit():
        return float(m[:-1])
    if m.endswith("M") and m[:-1].isdigit():
        return int(m[:-1]) / 12
    return 0.0


def build_discount_curve(yield_curve: list[dict[str, Any]]) -> list[tuple[float, float]]:
    """
    Build (t_years, discount_factor) from yield curve points.
    df = exp(-r * t) with r in decimal (e.g. 0.035 for 3.5%).
    """
    out: list[tuple[float, float]] = [(0.0, 1.0)]
    for p in yield_curve:
        mat = p.get("maturity") or p.get("tenor") or ""
        val = p.get("value") or p.get("rate") or 0.0
        t = _maturity_to_years(str(mat))
        if t <= 0:
            continue
        r = float(val) / 100.0 if abs(val) > 1 else float(val)
        df = math.exp(-r * t)
        out.append((t, round(df, 8)))
    out.sort(key=lambda x: x[0])
    return out


def _interp_discount(t: float, curve: list[tuple[float, float]]) -> float:
    if not curve or t <= 0:
        return 1.0
    if t >= curve[-1][0]:
        return curve[-1][1] ** (t / curve[-1][0]) if curve[-1][0] > 0 else curve[-1][1]
    for i in range(len(curve) - 1):
        t0, df0 = curve[i]
        t1, df1 = curve[i + 1]
        if t0 <= t <= t1:
            if t1 == t0:
                return df0
            u = (t - t0) / (t1 - t0)
            return df0 * (df1 / df0) ** u
    return curve[-1][1]


def price_irs(
    notional: float,
    fixed_rate: float,
    tenor_years: float,
    pay_freq: int,
    discount_curve: list[tuple[float, float]],
    position: str,
) -> dict[str, Any]:
    """
    IRS pricing (SwapsBook §7.2, §7.3).
    Annuity A = sum of discount factors at fixed payment dates.
    Float leg PV = notional * (1 - P(T)); Fixed leg PV = notional * fixed_rate/freq * A.
    Payer swap PV = Float - Fixed; Par rate S = (1 - P(T)) / A.
    """
    if pay_freq <= 0 or tenor_years <= 0:
        return {"pv": 0.0, "par_rate": 0.0, "fixed_pv": 0.0, "float_pv": 0.0, "dv01": 0.0, "pv01": 0.0, "annuity": 0.0}
    n = int(tenor_years * pay_freq)
    if n <= 0:
        n = 1
    annuity = 0.0
    for i in range(1, n + 1):
        t = i / pay_freq
        annuity += _interp_discount(t, discount_curve)
    annuity /= pay_freq
    p_T = _interp_discount(tenor_years, discount_curve)
    float_pv = notional * (1.0 - p_T)
    fixed_pv = notional * fixed_rate * annuity
    # Payer: pay fixed -> PV = Float - Fixed
    pv = float_pv - fixed_pv
    if (position or "").lower() == "receiver":
        pv = -pv
    par_rate = (1.0 - p_T) / annuity if annuity > 0 else 0.0
    dv01 = (notional * annuity / 10000.0) if annuity > 0 else 0.0
    pv01 = dv01
    return {
        "pv": round(pv, 2),
        "par_rate": round(par_rate * 100, 4),
        "fixed_pv": round(fixed_pv, 2),
        "float_pv": round(float_pv, 2),
        "dv01": round(dv01, 2),
        "pv01": round(pv01, 2),
        "annuity": round(annuity, 6),
    }


def price_bond(
    face: float,
    coupon_rate: float,
    yield_to_maturity: float,
    tenor_years: float,
    pay_freq: int,
) -> dict[str, Any]:
    """
    Bond pricing (SwapsBook §3.8–3.9). Clean price = sum(C/freq * df_t) + Face * df_T.
    df_t = (1 + y/freq)^(-t*freq). Macaulay duration, modified duration, DV01, convexity.
    """
    if pay_freq <= 0 or tenor_years <= 0:
        return {
            "clean_price": 0.0, "dirty_price": 0.0, "macaulay_duration": 0.0,
            "modified_duration": 0.0, "dv01": 0.0, "convexity": 0.0,
        }
    y = yield_to_maturity / 100.0 if abs(yield_to_maturity) > 1 else yield_to_maturity
    n = int(tenor_years * pay_freq)
    if n <= 0:
        n = 1
    c_per_period = face * (coupon_rate / 100.0 if coupon_rate > 1 else coupon_rate) / pay_freq
    price = 0.0
    pv_times_t = 0.0
    conv = 0.0
    for i in range(1, n + 1):
        df = (1.0 + y / pay_freq) ** (-i)
        t = i / pay_freq
        if i < n:
            pv = c_per_period * df
        else:
            pv = (c_per_period + face) * df
        price += pv
        pv_times_t += pv * t
        conv += pv * t * (t + 1 / pay_freq) / (1 + y / pay_freq) ** 2
    clean_price = price / face * 100 if face else 0
    macaulay = pv_times_t / price if price else 0
    modified = macaulay / (1 + y / pay_freq) if pay_freq else 0
    dv01 = -price * modified / 10000.0 if price else 0
    convexity = conv / price if price else 0
    return {
        "clean_price": round(clean_price, 4),
        "dirty_price": round(price, 2),
        "macaulay_duration": round(macaulay, 4),
        "modified_duration": round(modified, 4),
        "dv01": round(dv01, 2),
        "convexity": round(convexity, 4),
    }


def price_ois(
    notional: float,
    fixed_rate: float,
    tenor_years: float,
    ois_rate: float,
) -> dict[str, Any]:
    """
    OIS (€STR) linear approximation: PV = notional * (fixed_rate - ois_rate) * tenor.
    Rates in decimal (e.g. 0.035).
    """
    fix = fixed_rate / 100.0 if abs(fixed_rate) > 1 else fixed_rate
    ois = ois_rate / 100.0 if abs(ois_rate) > 1 else ois_rate
    pv = notional * (fix - ois) * tenor_years
    dv01 = notional * tenor_years / 10000.0
    return {
        "pv": round(pv, 2),
        "par_rate": round(ois * 100, 4),
        "dv01": round(dv01, 2),
    }


def _as_discount_curve(curve_like: Any) -> list[tuple[float, float]]:
    if isinstance(curve_like, list) and curve_like:
        first = curve_like[0]
        if isinstance(first, (list, tuple)) and len(first) >= 2:
            return [(float(x[0]), float(x[1])) for x in curve_like if len(x) >= 2]
        if isinstance(first, dict):
            return build_discount_curve(curve_like)
    return [(0.0, 1.0)]


def _resolve_curves(curves: dict[str, Any] | list[Any]) -> tuple[list[tuple[float, float]], dict[str, list[tuple[float, float]]]]:
    if isinstance(curves, list):
        return _as_discount_curve(curves), {}
    discount = _as_discount_curve(curves.get("discount") or curves.get("discount_curve") or curves.get("yield_curve") or [])
    fwd_input = curves.get("forwards") or curves.get("forward") or {}
    forwards: dict[str, list[tuple[float, float]]] = {}
    if isinstance(fwd_input, dict):
        for idx, c in fwd_input.items():
            forwards[str(idx)] = _as_discount_curve(c)
    return discount, forwards


def _bucket_key(t: float) -> str:
    if t < 1:
        return "<1Y"
    if t < 3:
        return "1-3Y"
    if t < 7:
        return "3-7Y"
    if t < 15:
        return "7-15Y"
    return "15Y+"


def price_strategy(
    legs: list[dict[str, Any]],
    curves: dict[str, Any] | list[Any],
    valuation_date: str | None = None,
) -> dict[str, Any]:
    """Aggregate strategy pricing for multi-leg rate structures."""
    discount_curve, forwards = _resolve_curves(curves if isinstance(curves, (list, dict)) else {})
    valuation_date = valuation_date or dt.date.today().isoformat()
    pv_total = 0.0
    dv01_total = 0.0
    carry_roll_total = 0.0
    leg_results: list[dict[str, Any]] = []
    buckets: dict[str, float] = {"<1Y": 0.0, "1-3Y": 0.0, "3-7Y": 0.0, "7-15Y": 0.0, "15Y+": 0.0}

    for leg in legs:
        instrument = str(leg.get("instrument", "irs")).lower()
        notional = float(leg.get("notional", 0.0))
        tenor_label = str(leg.get("tenor", "0Y"))
        tenor_years = _maturity_to_years(tenor_label)
        freq = int(leg.get("freq", 2) or 2)
        direction = str(leg.get("direction", "pay")).lower()
        index = str(leg.get("index", ""))
        leg_curve = forwards.get(index, discount_curve)
        sign = 1.0 if direction in {"receive", "receiver", "long"} else -1.0

        if instrument == "bond":
            coupon = float(leg.get("fixed_rate", 0.0) or 0.0)
            ytm = float(leg.get("yield", leg.get("ytm", coupon)) or 0.0)
            bond = price_bond(face=notional, coupon_rate=coupon, yield_to_maturity=ytm, tenor_years=tenor_years, pay_freq=freq)
            dirty = float(bond.get("dirty_price", 0.0))
            leg_pv = sign * dirty
            leg_dv01 = sign * abs(float(bond.get("dv01", 0.0)))
            par_rate = ytm
        else:
            fixed_rate = float(leg.get("fixed_rate", 0.0) or 0.0)
            spread = float(leg.get("spread", 0.0) or 0.0)
            fixed_plus_spread = fixed_rate + spread / 10000.0
            position = "receiver" if sign > 0 else "payer"
            irs = price_irs(
                notional=notional,
                fixed_rate=fixed_plus_spread,
                tenor_years=tenor_years,
                pay_freq=freq,
                discount_curve=leg_curve,
                position=position,
            )
            leg_pv = float(irs.get("pv", 0.0))
            leg_dv01 = sign * abs(float(irs.get("dv01", 0.0)))
            par_rate = float(irs.get("par_rate", 0.0))

        # Simplified carry/roll proxy: expected 1Y rolldown in bps scaled by DV01.
        end_r = 0.0 if tenor_years <= 0 else -math.log(max(_interp_discount(tenor_years, leg_curve), 1e-12)) / tenor_years
        prev_t = max(tenor_years - 1.0, 0.25)
        prev_r = -math.log(max(_interp_discount(prev_t, leg_curve), 1e-12)) / prev_t
        carry_roll = (prev_r - end_r) * 10000.0 * leg_dv01

        pv_total += leg_pv
        dv01_total += leg_dv01
        carry_roll_total += carry_roll
        buckets[_bucket_key(tenor_years)] += leg_dv01
        leg_results.append(
            {
                "instrument": instrument,
                "index": index,
                "tenor": tenor_label,
                "direction": direction,
                "pv": round(leg_pv, 2),
                "dv01": round(leg_dv01, 2),
                "par_rate": round(par_rate, 4),
                "carry_roll": round(carry_roll, 2),
            }
        )

    return {
        "valuation_date": valuation_date,
        "pv_total": round(pv_total, 2),
        "dv01_total": round(dv01_total, 2),
        "carry_roll_total": round(carry_roll_total, 2),
        "bucket_dv01": {k: round(v, 2) for k, v in buckets.items()},
        "legs": leg_results,
    }
