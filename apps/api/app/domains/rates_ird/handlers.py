"""Rates & IRD command handlers for SWAP tab."""
from __future__ import annotations

from typing import Any

from app.domains.rates_ird import ecb_sdw, pricing, rates_backtest, risk_projection, strategies, swap_paper
from app.domains.rates_ird.dtcc_sdr import get_dtcc_static_fallback
from app.domains.rates_ird.swap_market_data_loader import (
    is_snapshot_empty,
    load_bundled_fallback,
    load_swap_market_data_overlay,
    merge_snapshot_with_overlay,
)


def _last_val(obs: list[dict[str, Any]]) -> float | None:
    return obs[-1].get("value") if obs else None


def _response(data: Any = None, error: str | None = None, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "success": error is None,
        "data": data,
        "error": error,
        "metadata": metadata or {},
    }


def get_estr_rate(args: dict[str, Any]) -> dict[str, Any]:
    """Latest €STR and optional 30d series."""
    last_n = int(args.get("last_n", 30))
    obs = ecb_sdw.get_estr(last_n=last_n)
    latest = _last_val(obs) if obs else None
    return _response(
        {
            "rate": round(latest, 4) if latest is not None else None,
            "series": obs[-90:] if obs else [],
        }
    )


def get_euribor_rates(args: dict[str, Any]) -> dict[str, Any]:
    """All EURIBOR tenors (1W, 1M, 3M, 6M, 12M) latest values."""
    data = ecb_sdw.get_euribor_all()
    return _response(data)


def get_ecb_yield_curve_spot(args: dict[str, Any]) -> dict[str, Any]:
    """AAA spot rate curve."""
    date_str = args.get("date") or args.get("date_str")
    curve = ecb_sdw.get_ecb_yield_curve("spot_rate", "A", date_str)
    return _response(curve)


def get_ecb_yield_curve_forward(args: dict[str, Any]) -> dict[str, Any]:
    """AAA instantaneous forward curve."""
    date_str = args.get("date") or args.get("date_str")
    curve = ecb_sdw.get_ecb_yield_curve("instantaneous_forward", "A", date_str)
    return _response(curve)


def get_ecb_yield_curve_par(args: dict[str, Any]) -> dict[str, Any]:
    """AAA par yield curve."""
    date_str = args.get("date") or args.get("date_str")
    curve = ecb_sdw.get_ecb_yield_curve("par_yield", "A", date_str)
    return _response(curve)


def get_eur_irs_rates(args: dict[str, Any]) -> dict[str, Any]:
    """EUR IRS benchmark swap rates (2Y–30Y)."""
    data = ecb_sdw.get_eur_irs_rates()
    return _response(data)


def get_eur_futures(args: dict[str, Any]) -> dict[str, Any]:
    """Bund, Bobl, Schatz futures (yfinance)."""
    data = ecb_sdw.get_eur_futures_via_yf()
    return _response(data)


def get_swap_tab_snapshot(args: dict[str, Any]) -> dict[str, Any]:
    """Single call returning all SWAP tab data: estr, euribor, curves, irs, futures, curve analysis.
    Each source is fetched with try/except so one 404 does not break the snapshot.
    User file swap_market_data.json (if present) overrides or fills missing data."""
    estr_obs: list[dict[str, Any]] = []
    estr_rate: float | None = None
    try:
        estr_obs = ecb_sdw.get_estr(last_n=30)
        estr_rate = _last_val(estr_obs) if estr_obs else None
    except Exception:
        pass
    euribor: dict[str, float] = {}
    try:
        euribor = ecb_sdw.get_euribor_all()
    except Exception:
        pass
    spot: list[dict[str, Any]] = []
    forward: list[dict[str, Any]] = []
    par: list[dict[str, Any]] = []
    try:
        spot = ecb_sdw.get_ecb_yield_curve("spot_rate", "A", None)
    except Exception:
        pass
    try:
        forward = ecb_sdw.get_ecb_yield_curve("instantaneous_forward", "A", None)
    except Exception:
        pass
    try:
        par = ecb_sdw.get_ecb_yield_curve("par_yield", "A", None)
    except Exception:
        pass
    irs: list[dict[str, Any]] = []
    try:
        irs = ecb_sdw.get_eur_irs_rates()
    except Exception:
        pass
    futures: list[dict[str, Any]] = []
    try:
        futures = ecb_sdw.get_eur_futures_via_yf()
    except Exception:
        pass
    curve_analysis: dict[str, Any] = {}
    spot_rates = {p["maturity"]: p["value"] for p in spot}
    if "2Y" in spot_rates and "10Y" in spot_rates:
        curve_analysis["spread_2s10s"] = round(spot_rates["10Y"] - spot_rates["2Y"], 4)
    if "2Y" in spot_rates and "30Y" in spot_rates:
        curve_analysis["spread_2s30s"] = round(spot_rates["30Y"] - spot_rates["2Y"], 4)
    curve_analysis["inverted_2s10s"] = curve_analysis.get("spread_2s10s", 0) < 0

    snapshot = {
        "estr": {"rate": round(estr_rate, 4) if estr_rate is not None else None, "series": (estr_obs[-30:] if estr_obs else [])},
        "euribor": euribor,
        "yield_curve_spot": spot,
        "yield_curve_forward": forward,
        "yield_curve_par": par,
        "eur_irs_rates": irs,
        "eur_futures": futures,
        "curve_analysis": curve_analysis,
    }
    overlay = load_swap_market_data_overlay()
    snapshot = merge_snapshot_with_overlay(snapshot, overlay)
    if is_snapshot_empty(snapshot):
        dtcc = get_dtcc_static_fallback()
        fill = {}
        for k, v in dtcc.items():
            if not v:
                continue
            cur = snapshot.get(k)
            if cur is None or (isinstance(cur, (list, dict)) and len(cur) == 0):
                fill[k] = v
        snapshot = merge_snapshot_with_overlay(snapshot, fill)
    if is_snapshot_empty(snapshot):
        bundled = load_bundled_fallback()
        if bundled:
            fill = {k: v for k, v in bundled.items() if not snapshot.get(k) or (isinstance(snapshot.get(k), (list, dict)) and len(snapshot.get(k)) == 0)}
            snapshot = merge_snapshot_with_overlay(snapshot, fill)
    if snapshot.get("yield_curve_spot"):
        if not isinstance(snapshot.get("curve_analysis"), dict):
            snapshot["curve_analysis"] = {}
        spot_rates = {p["maturity"]: p["value"] for p in snapshot["yield_curve_spot"] if isinstance(p, dict)}
        if "2Y" in spot_rates and "10Y" in spot_rates:
            snapshot["curve_analysis"]["spread_2s10s"] = round(spot_rates["10Y"] - spot_rates["2Y"], 4)
        if "2Y" in spot_rates and "30Y" in spot_rates:
            snapshot["curve_analysis"]["spread_2s30s"] = round(spot_rates["30Y"] - spot_rates["2Y"], 4)
        snapshot["curve_analysis"]["inverted_2s10s"] = (snapshot["curve_analysis"].get("spread_2s10s") or 0) < 0
    elif not snapshot.get("curve_analysis"):
        snapshot["curve_analysis"] = {}
    return _response(snapshot)


def _discount_curve_from_args(args: dict[str, Any]) -> list[tuple[float, float]]:
    if "discount_curve" in args:
        raw = args["discount_curve"]
        if isinstance(raw, list):
            return [(float(x[0]), float(x[1])) for x in raw if len(x) >= 2]
    if "yield_curve" in args:
        return pricing.build_discount_curve(args["yield_curve"])
    return []


def price_irs_handler(args: dict[str, Any]) -> dict[str, Any]:
    notional = float(args.get("notional", 0))
    fixed_rate = float(args.get("fixed_rate", 0))
    tenor_years = float(args.get("tenor_years", 10))
    pay_freq = int(args.get("pay_freq", 2))
    position = str(args.get("position", "payer")).lower()
    curve = _discount_curve_from_args(args)
    if not curve:
        curve = [(0.0, 1.0)]
    result = pricing.price_irs(notional, fixed_rate, tenor_years, pay_freq, curve, position)
    return _response(result)


def price_bond_handler(args: dict[str, Any]) -> dict[str, Any]:
    face = float(args.get("face", 100))
    coupon_rate = float(args.get("coupon_rate", 0))
    ytm = float(args.get("yield_to_maturity", 0) or args.get("ytm", 0))
    tenor_years = float(args.get("tenor_years", 10))
    pay_freq = int(args.get("pay_freq", 2))
    result = pricing.price_bond(face, coupon_rate, ytm, tenor_years, pay_freq)
    return _response(result)


def price_ois_handler(args: dict[str, Any]) -> dict[str, Any]:
    notional = float(args.get("notional", 0))
    fixed_rate = float(args.get("fixed_rate", 0))
    tenor_years = float(args.get("tenor_years", 1))
    ois_rate = float(args.get("ois_rate", 0))
    result = pricing.price_ois(notional, fixed_rate, tenor_years, ois_rate)
    return _response(result)


def build_discount_curve_handler(args: dict[str, Any]) -> dict[str, Any]:
    yield_curve = args.get("yield_curve") or args.get("curve") or []
    curve = pricing.build_discount_curve(yield_curve)
    return _response([list(p) for p in curve])


def _price_strategy_common(args: dict[str, Any], legs: list[dict[str, Any]], strategy_type: str) -> dict[str, Any]:
    curves = args.get("curves")
    if not curves:
        if args.get("discount_curve"):
            curves = {"discount": args.get("discount_curve")}
        elif args.get("yield_curve"):
            curves = {"discount": args.get("yield_curve")}
        else:
            curves = {"discount": []}
    valuation_date = args.get("valuation_date")
    result = pricing.price_strategy(legs=legs, curves=curves, valuation_date=valuation_date)
    return _response(result, metadata={"strategy_type": strategy_type, "legs_count": len(legs)})


def price_curve_trade_handler(args: dict[str, Any]) -> dict[str, Any]:
    legs = strategies.build_curve_trade(
        short_tenor=str(args.get("short_tenor", "2Y")),
        long_tenor=str(args.get("long_tenor", "10Y")),
        notional=float(args.get("notional", 1_000_000)),
        belly_notional=float(args["long_notional"]) if args.get("long_notional") is not None else None,
        index=str(args.get("index", "EURIBOR6M")),
        daycount=str(args.get("daycount", "30/360")),
        freq=int(args.get("freq", 2)),
        fixed_rate_short=float(args["fixed_rate_short"]) if args.get("fixed_rate_short") is not None else None,
        fixed_rate_long=float(args["fixed_rate_long"]) if args.get("fixed_rate_long") is not None else None,
    )
    return _price_strategy_common(args, legs, "curve")


def price_fly_trade_handler(args: dict[str, Any]) -> dict[str, Any]:
    legs = strategies.build_fly_trade(
        wing_short_tenor=str(args.get("wing_short_tenor", "2Y")),
        belly_tenor=str(args.get("belly_tenor", "5Y")),
        wing_long_tenor=str(args.get("wing_long_tenor", "10Y")),
        notional=float(args.get("notional", 1_000_000)),
        index=str(args.get("index", "EURIBOR6M")),
        daycount=str(args.get("daycount", "30/360")),
        freq=int(args.get("freq", 2)),
    )
    return _price_strategy_common(args, legs, "fly")


def price_asw_trade_handler(args: dict[str, Any]) -> dict[str, Any]:
    legs = strategies.build_asw_trade(
        bond_tenor=str(args.get("bond_tenor", "5Y")),
        swap_tenor=str(args.get("swap_tenor", "5Y")),
        notional=float(args.get("notional", 1_000_000)),
        bond_coupon=float(args.get("bond_coupon", 0.0)),
        bond_yield=float(args.get("bond_yield", args.get("bond_ytm", 0.0))),
        swap_fixed_rate=float(args.get("swap_fixed_rate", 0.0)),
        index=str(args.get("index", "EURIBOR6M")),
    )
    return _price_strategy_common(args, legs, "asw")


def price_basis_trade_handler(args: dict[str, Any]) -> dict[str, Any]:
    legs = strategies.build_basis_trade(
        tenor=str(args.get("tenor", "5Y")),
        notional=float(args.get("notional", 1_000_000)),
        pay_index=str(args.get("pay_index", "EURIBOR3M")),
        receive_index=str(args.get("receive_index", "EURIBOR6M")),
        pay_spread=float(args.get("pay_spread", 0.0)),
        receive_spread=float(args.get("receive_spread", 0.0)),
        pay_currency=str(args.get("pay_currency", "EUR")),
        receive_currency=str(args.get("receive_currency", "EUR")),
        freq=int(args.get("freq", 4)),
    )
    return _price_strategy_common(args, legs, "basis")


def get_rates_ird_handlers() -> dict[str, Any]:
    return {
        "get_estr_rate": get_estr_rate,
        "get_euribor_rates": get_euribor_rates,
        "get_ecb_yield_curve_spot": get_ecb_yield_curve_spot,
        "get_ecb_yield_curve_forward": get_ecb_yield_curve_forward,
        "get_ecb_yield_curve_par": get_ecb_yield_curve_par,
        "get_eur_irs_rates": get_eur_irs_rates,
        "get_eur_futures": get_eur_futures,
        "get_swap_tab_snapshot": get_swap_tab_snapshot,
        "price_irs": price_irs_handler,
        "price_bond": price_bond_handler,
        "price_ois": price_ois_handler,
        "build_discount_curve": build_discount_curve_handler,
        "price_curve_trade": price_curve_trade_handler,
        "price_fly_trade": price_fly_trade_handler,
        "price_asw_trade": price_asw_trade_handler,
        "price_basis_trade": price_basis_trade_handler,
        "swap_pt_create_book": swap_paper.swap_pt_create_book,
        "swap_pt_list_books": swap_paper.swap_pt_list_books,
        "swap_pt_enter_trade": swap_paper.swap_pt_enter_trade,
        "swap_pt_close_trade": swap_paper.swap_pt_close_trade,
        "swap_pt_get_trades": swap_paper.swap_pt_get_trades,
        "swap_pt_mtm_book": swap_paper.swap_pt_mtm_book,
        "swap_pt_get_risk": swap_paper.swap_pt_get_risk,
        "backtest_rates_strategy": rates_backtest.backtest_rates_strategy_handler,
        "get_rates_history": rates_backtest.get_rates_history_handler,
        "compute_risk_projection": risk_projection.compute_risk_projection_handler,
        "project_book_pnl": risk_projection.project_book_pnl_handler,
    }
