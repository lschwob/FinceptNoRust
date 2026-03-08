"""
ECB Statistical Data Warehouse API client for EUR rates.
URL: https://data-api.ecb.europa.eu/service/data/{flowRef}/{key}?format=jsondata
No API key required.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx

BASE = "https://data-api.ecb.europa.eu/service/data"
TIMEOUT = 15.0
LOG = logging.getLogger(__name__)


def _get(url: str, params: dict[str, str] | None = None) -> dict[str, Any] | None:
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            r = client.get(url, params=params or {})
            r.raise_for_status()
            return r.json()
    except (httpx.HTTPError, ValueError) as e:
        LOG.warning("ECB SDW %s: %s", url[:80], e)
        return None


def _obs_series(data: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Extract observations from ECB JSON data message."""
    if not data or not isinstance(data, dict):
        return []
    ds = data.get("dataSets") or []
    if not ds:
        return []
    obs = ds[0].get("observations") or {}
    series = data.get("structure", {}).get("dimensions", {}).get("observation", [])
    # observations keyed by position e.g. "0": [idx_period, idx_value]
    result = []
    for pos, values in obs.items():
        if not values or not series:
            continue
        # First dimension is typically time period
        period = None
        value = None
        for i, dim in enumerate(series):
            if i < len(values):
                ref = dim.get("values") or []
                idx = values[i] if isinstance(values[i], int) else int(values[i]) if str(values[i]).isdigit() else 0
                if idx < len(ref):
                    id_ = ref[idx].get("id")
                    if id_ is not None:
                        if period is None and (str(id_).startswith("2") or "-" in str(id_)):
                            period = id_
                        else:
                            try:
                                value = float(id_)
                            except (TypeError, ValueError):
                                value = id_
        if period is not None and value is not None:
            result.append({"period": period, "value": value})
    result.sort(key=lambda x: (x["period"],))
    return result


def _last_value(obs: list[dict[str, Any]]) -> float | None:
    if not obs:
        return None
    return obs[-1].get("value")


def get_estr(last_n: int = 30) -> list[dict[str, Any]]:
    """€STR (Euro Short-Term Rate). Returns list of { period, value }."""
    # EST flow, key from ECB Data Portal: Volume-weighted trimmed mean rate = B.EU000A2X2A25.WT
    url = f"{BASE}/EST/B.EU000A2X2A25.WT"
    data = _get(url, {"lastNObservations": str(last_n), "format": "jsondata"})
    return _obs_series(data) if data else []


def get_euribor(tenor: str) -> list[dict[str, Any]]:
    """EURIBOR for tenor: 1W, 1M, 3M, 6M, 12M. Returns list of { period, value }."""
    # FM flow: monthly frequency M, key EURIBOR*D_.HSTA (D before underscore per ECB portal)
    tenor_map = {"1W": "1WD", "1M": "1MD", "3M": "3MD", "6M": "6MD", "12M": "12MD"}
    t = tenor_map.get(tenor.upper(), "3MD")
    url = f"{BASE}/FM/M.U2.EUR.RT.MM.EURIBOR{t}_.HSTA"
    data = _get(url, {"lastNObservations": "60", "format": "jsondata"})
    return _obs_series(data) if data else []


# ECB only publishes 1M, 3M, 6M reliably; 1W and 12M often 404
_EURIBOR_TENORS = ("1M", "3M", "6M")


def get_euribor_all() -> dict[str, float]:
    """EURIBOR tenors (1M, 3M, 6M). ECB 1W/12M keys often 404."""
    out: dict[str, float] = {}
    for tenor in _EURIBOR_TENORS:
        obs = get_euribor(tenor)
        v = _last_value(obs)
        if v is not None:
            out[tenor] = round(v, 4)
    return out


def get_ecb_yield_curve(curve_type: str, rating: str = "A", date_str: str | None = None) -> list[dict[str, Any]]:
    """
    ECB yield curve. curve_type: spot_rate, instantaneous_forward, par_yield.
    rating: A (AAA). Returns list of { maturity, value } for given date.
    Keys per ECB Data Portal: SR_10Y, IF_1Y (instantaneous forward), PY_3Y5M (par yield).
    """
    type_suffix = {"spot_rate": "SR", "instantaneous_forward": "IF", "par_yield": "PY"}.get(curve_type, "SR")
    if type_suffix == "SR":
        maturities = ["3M", "6M", "1Y", "2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y", "9Y", "10Y", "15Y", "20Y", "30Y"]
    else:
        maturities = ["1Y", "2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y", "9Y", "10Y", "15Y", "20Y", "30Y"]
    rating_key = "A" if rating.upper() in ("AAA", "A") else "A"
    params: dict[str, str] = {"format": "jsondata"}
    if date_str:
        params["lastNObservations"] = "1"
    result: list[dict[str, Any]] = []
    for mat in maturities:
        key = f"B.U2.EUR.4F.G_N_{rating_key}.SV_C_YM.{type_suffix}_{mat}"
        url = f"{BASE}/YC/{key}"
        data = _get(url, params)
        obs = _obs_series(data) if data else []
        if obs:
            v = _last_value(obs)
            if v is not None:
                result.append({"maturity": mat, "value": round(v, 4)})
    return result


def get_ecb_yield_curve_series(
    maturity: str,
    curve_type: str = "spot_rate",
    start_date: str | None = None,
    end_date: str | None = None,
    last_n: int | None = None,
) -> list[dict[str, Any]]:
    """
    Historical series for one maturity. Returns list of { period, value }.
    Use startPeriod/endPeriod (YYYY-MM-DD or YYYY-MM) or lastNObservations.
    """
    type_suffix = {"spot_rate": "SR", "instantaneous_forward": "IF", "par_yield": "PY"}.get(curve_type, "SR")
    maturities_sr = ["3M", "6M", "1Y", "2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y", "9Y", "10Y", "15Y", "20Y", "30Y"]
    maturities_other = ["1Y", "2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y", "9Y", "10Y", "15Y", "20Y", "30Y"]
    allowed = maturities_sr if type_suffix == "SR" else maturities_other
    if maturity not in allowed:
        return []
    key = f"B.U2.EUR.4F.G_N_A.SV_C_YM.{type_suffix}_{maturity}"
    url = f"{BASE}/YC/{key}"
    params: dict[str, str] = {"format": "jsondata"}
    if last_n:
        params["lastNObservations"] = str(last_n)
    if start_date:
        params["startPeriod"] = start_date[:10]
    if end_date:
        params["endPeriod"] = end_date[:10]
    data = _get(url, params)
    return _obs_series(data) if data else []


def get_eur_irs_rates() -> list[dict[str, Any]]:
    """EUR IRS benchmark swap rates (2Y–30Y). Returns list of { tenor, rate }."""
    # FM flow - Swap rates. Keys vary; common: SV_EC_SWRC or similar for EUR swap curve
    tenors = ["2Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y"]
    result: list[dict[str, Any]] = []
    for tenor in tenors:
        # Try common ECB swap rate key pattern
        url = f"{BASE}/FM/B.U2.EUR.RT.SV_EC_SWRC.{tenor}.HSTA"
        data = _get(url, {"lastNObservations": "1", "format": "jsondata"})
        obs = _obs_series(data) if data else []
        v = _last_value(obs)
        if v is not None:
            result.append({"tenor": tenor, "rate": round(v, 4)})
    return result


def get_eur_futures_via_yf() -> list[dict[str, Any]]:
    """Bund, Bobl, Schatz futures via yfinance."""
    try:
        import yfinance as yf
    except ImportError:
        return []
    symbols = ["GBL=F", "GBM=F", "GBS=F"]
    names = {"GBL=F": "Bund", "GBM=F": "Bobl", "GBS=F": "Schatz"}
    out = []
    for sym in symbols:
        try:
            t = yf.Ticker(sym)
            hist = t.history(period="5d")
            if hist is None or hist.empty:
                continue
            row = hist.iloc[-1]
            prev = hist["Close"].iloc[-2] if len(hist) >= 2 else float(row["Close"])
            close = float(row["Close"])
            chg = close - prev
            chg_pct = (chg / prev * 100) if prev else 0
            out.append({
                "symbol": sym,
                "name": names.get(sym, sym),
                "price": round(close, 2),
                "change": round(chg, 2),
                "change_percent": round(chg_pct, 2),
                "timestamp": int(datetime.now(timezone.utc).timestamp()),
            })
        except Exception as e:
            LOG.warning("yfinance %s: %s", sym, e)
    return out
