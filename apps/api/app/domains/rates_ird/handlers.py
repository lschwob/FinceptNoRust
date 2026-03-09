"""Rates & IRD command handlers for SWAP tab."""
from __future__ import annotations

from typing import Any

from app.domains.rates_ird import ecb_sdw, pricing, rates_backtest, risk_projection, swap_paper
from app.domains.rates_ird import market_data_provider, structured_pricing
from app.domains.rates_ird.dtcc_sdr import get_dtcc_static_fallback
from app.domains.rates_ird.swap_market_data_loader import (
    is_snapshot_empty,
    load_bundled_fallback,
    load_swap_market_data_overlay,
    merge_snapshot_with_overlay,
)


def _last_val(obs: list[dict[str, Any]]) -> float | None:
    return obs[-1].get("value") if obs else None


def get_estr_rate(args: dict[str, Any]) -> dict[str, Any]:
    """Latest €STR and optional 30d series."""
    last_n = int(args.get("last_n", 30))
    obs = ecb_sdw.get_estr(last_n=last_n)
    latest = _last_val(obs) if obs else None
    return {
        "success": True,
        "data": {
            "rate": round(latest, 4) if latest is not None else None,
            "series": obs[-90:] if obs else [],
        },
    }


def get_euribor_rates(args: dict[str, Any]) -> dict[str, Any]:
    """All EURIBOR tenors (1W, 1M, 3M, 6M, 12M) latest values."""
    data = ecb_sdw.get_euribor_all()
    return {"success": True, "data": data}


def get_ecb_yield_curve_spot(args: dict[str, Any]) -> dict[str, Any]:
    """AAA spot rate curve."""
    date_str = args.get("date") or args.get("date_str")
    curve = ecb_sdw.get_ecb_yield_curve("spot_rate", "A", date_str)
    return {"success": True, "data": curve}


def get_ecb_yield_curve_forward(args: dict[str, Any]) -> dict[str, Any]:
    """AAA instantaneous forward curve."""
    date_str = args.get("date") or args.get("date_str")
    curve = ecb_sdw.get_ecb_yield_curve("instantaneous_forward", "A", date_str)
    return {"success": True, "data": curve}


def get_ecb_yield_curve_par(args: dict[str, Any]) -> dict[str, Any]:
    """AAA par yield curve."""
    date_str = args.get("date") or args.get("date_str")
    curve = ecb_sdw.get_ecb_yield_curve("par_yield", "A", date_str)
    return {"success": True, "data": curve}


def get_eur_irs_rates(args: dict[str, Any]) -> dict[str, Any]:
    """EUR IRS benchmark swap rates (2Y–30Y)."""
    data = ecb_sdw.get_eur_irs_rates()
    return {"success": True, "data": data}


def get_eur_futures(args: dict[str, Any]) -> dict[str, Any]:
    """Bund, Bobl, Schatz futures (yfinance)."""
    data = ecb_sdw.get_eur_futures_via_yf()
    return {"success": True, "data": data}


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
    return {"success": True, "data": snapshot}


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
    return {"success": True, "data": result}


def price_bond_handler(args: dict[str, Any]) -> dict[str, Any]:
    face = float(args.get("face", 100))
    coupon_rate = float(args.get("coupon_rate", 0))
    ytm = float(args.get("yield_to_maturity", 0) or args.get("ytm", 0))
    tenor_years = float(args.get("tenor_years", 10))
    pay_freq = int(args.get("pay_freq", 2))
    result = pricing.price_bond(face, coupon_rate, ytm, tenor_years, pay_freq)
    return {"success": True, "data": result}


def price_ois_handler(args: dict[str, Any]) -> dict[str, Any]:
    notional = float(args.get("notional", 0))
    fixed_rate = float(args.get("fixed_rate", 0))
    tenor_years = float(args.get("tenor_years", 1))
    ois_rate = float(args.get("ois_rate", 0))
    result = pricing.price_ois(notional, fixed_rate, tenor_years, ois_rate)
    return {"success": True, "data": result}


def build_discount_curve_handler(args: dict[str, Any]) -> dict[str, Any]:
    yield_curve = args.get("yield_curve") or args.get("curve") or []
    curve = pricing.build_discount_curve(yield_curve)
    return {"success": True, "data": [list(p) for p in curve]}


def get_live_rates(args: dict[str, Any]) -> dict[str, Any]:
    """Real-time rates snapshot via pluggable adapter."""
    force = bool(args.get("force_refresh", False))
    snap = market_data_provider.get_live_snapshot(force_refresh=force)
    data = snap.to_dict()
    data["spreads"] = {
        "2s5s": snap.spread("2Y", "5Y"),
        "2s10s": snap.spread("2Y", "10Y"),
        "2s30s": snap.spread("2Y", "30Y"),
        "5s10s": snap.spread("5Y", "10Y"),
        "5s30s": snap.spread("5Y", "30Y"),
        "10s30s": snap.spread("10Y", "30Y"),
    }
    data["flies"] = {
        "2s5s10s": snap.fly("2Y", "5Y", "10Y"),
        "2s10s30s": snap.fly("2Y", "10Y", "30Y"),
        "5s10s30s": snap.fly("5Y", "10Y", "30Y"),
    }
    return {"success": True, "data": data}


def set_market_data_adapter_handler(args: dict[str, Any]) -> dict[str, Any]:
    """Switch between 'ecb' (default) and 'template' adapter."""
    adapter_name = args.get("adapter", "ecb")
    ttl = float(args.get("cache_ttl", 30))
    if adapter_name == "template":
        market_data_provider.set_active_adapter(market_data_provider.TemplateAdapter())
    else:
        market_data_provider.set_active_adapter(market_data_provider.ECBAdapter())
    market_data_provider.set_cache_ttl(ttl)
    return {"success": True, "data": {"adapter": adapter_name, "cache_ttl": ttl}}


def price_curve_trade_handler(args: dict[str, Any]) -> dict[str, Any]:
    snap = market_data_provider.get_live_snapshot()
    result = structured_pricing.price_curve_trade(
        short_tenor=args.get("short_tenor", "2Y"),
        long_tenor=args.get("long_tenor", "10Y"),
        notional=float(args.get("notional", 10_000_000)),
        position=args.get("position", "steepener"),
        snapshot=snap,
        pay_freq=int(args.get("pay_freq", 2)),
        entry_spread_bps=args.get("entry_spread_bps"),
    )
    return {"success": "error" not in result, "data": result}


def price_fly_handler(args: dict[str, Any]) -> dict[str, Any]:
    snap = market_data_provider.get_live_snapshot()
    result = structured_pricing.price_fly(
        wing1=args.get("wing1", "2Y"),
        body=args.get("body", "5Y"),
        wing2=args.get("wing2", "10Y"),
        notional=float(args.get("notional", 10_000_000)),
        position=args.get("position", "sell_body"),
        snapshot=snap,
        pay_freq=int(args.get("pay_freq", 2)),
        entry_fly_bps=args.get("entry_fly_bps"),
    )
    return {"success": "error" not in result, "data": result}


def price_asw_handler(args: dict[str, Any]) -> dict[str, Any]:
    snap = market_data_provider.get_live_snapshot()
    swap_rate = args.get("swap_rate")
    if swap_rate is not None:
        swap_rate = float(swap_rate)
    result = structured_pricing.price_asw(
        bond_yield=float(args.get("bond_yield", 0)),
        swap_rate=swap_rate,
        tenor=args.get("tenor", "10Y"),
        notional=float(args.get("notional", 10_000_000)),
        snapshot=snap,
        pay_freq=int(args.get("pay_freq", 2)),
        entry_asw_bps=args.get("entry_asw_bps"),
    )
    return {"success": "error" not in result, "data": result}


def price_basis_swap_handler(args: dict[str, Any]) -> dict[str, Any]:
    snap = market_data_provider.get_live_snapshot()
    result = structured_pricing.price_basis_swap(
        tenor=args.get("tenor", "5Y"),
        index1=args.get("index1", "3M"),
        index2=args.get("index2", "6M"),
        spread_bps=float(args.get("spread_bps", 0)),
        notional=float(args.get("notional", 10_000_000)),
        snapshot=snap,
        pay_freq=int(args.get("pay_freq", 4)),
        entry_basis_bps=args.get("entry_basis_bps"),
    )
    return {"success": "error" not in result, "data": result}


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
        "get_live_rates": get_live_rates,
        "set_market_data_adapter": set_market_data_adapter_handler,
        "price_irs": price_irs_handler,
        "price_bond": price_bond_handler,
        "price_ois": price_ois_handler,
        "price_curve_trade": price_curve_trade_handler,
        "price_fly": price_fly_handler,
        "price_asw": price_asw_handler,
        "price_basis_swap": price_basis_swap_handler,
        "build_discount_curve": build_discount_curve_handler,
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
