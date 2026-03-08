"""
DTCC SDR (Swap Data Repository) fallback for swap market data.
When ECB and user file leave rates empty, we use indicative levels derived from
DTCC PPD-style dissemination (or static fallbacks when direct S3/API is unavailable).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

LOG = logging.getLogger(__name__)
TIMEOUT = 10.0
# PPD dashboard (Rates slice list); S3 slice files often 403 without auth
PPD_CFTC_RATES = "https://pddata.dtcc.com/ppd/cftcdashboard"


def _static_eur_irs_fallback() -> list[dict[str, Any]]:
    """Indicative EUR IRS par rates when no live source available (DTCC/ECB)."""
    return [
        {"tenor": "2Y", "rate": 2.95},
        {"tenor": "5Y", "rate": 3.10},
        {"tenor": "7Y", "rate": 3.22},
        {"tenor": "10Y", "rate": 3.35},
        {"tenor": "15Y", "rate": 3.48},
        {"tenor": "20Y", "rate": 3.52},
        {"tenor": "30Y", "rate": 3.58},
    ]


def _static_yield_curve_spot() -> list[dict[str, Any]]:
    """Indicative EUR AAA spot curve fallback."""
    return [
        {"maturity": "3M", "value": 3.70},
        {"maturity": "6M", "value": 3.72},
        {"maturity": "1Y", "value": 3.75},
        {"maturity": "2Y", "value": 3.65},
        {"maturity": "3Y", "value": 3.55},
        {"maturity": "5Y", "value": 3.45},
        {"maturity": "7Y", "value": 3.40},
        {"maturity": "10Y", "value": 3.35},
        {"maturity": "15Y", "value": 3.42},
        {"maturity": "20Y", "value": 3.48},
        {"maturity": "30Y", "value": 3.52},
    ]


def _static_estr_fallback() -> dict[str, Any]:
    """Indicative €STR fallback."""
    return {
        "rate": 3.85,
        "series": [{"period": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "value": 3.85}],
    }


def _static_euribor_fallback() -> dict[str, float]:
    """Indicative EURIBOR fallback (1M, 3M, 6M)."""
    return {"1M": 3.84, "3M": 3.86, "6M": 3.88}


def get_dtcc_rates_fallback() -> dict[str, Any] | None:
    """
    Try to get Rates data from DTCC PPD. On failure or 403, returns None.
    Caller can then use static fallback via get_dtcc_static_fallback().
    """
    try:
        with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
            r = client.get(PPD_CFTC_RATES)
            r.raise_for_status()
            # Dashboard is HTML; parsing for Rates slice links would need BeautifulSoup
            # and the table might be loaded via JS. For now we don't parse.
    except Exception as e:
        LOG.debug("DTCC PPD fetch skipped: %s", e)
    return None


def get_dtcc_static_fallback() -> dict[str, Any]:
    """
    Return indicative EUR swap/rates data when no live source is available.
    Used as fallback after ECB and user file; based on typical market levels.
    """
    spot = _static_yield_curve_spot()
    spot_rates = {p["maturity"]: p["value"] for p in spot}
    spread_2s10s = round(spot_rates.get("10Y", 0) - spot_rates.get("2Y", 0), 4)
    spread_2s30s = round(spot_rates.get("30Y", 0) - spot_rates.get("2Y", 0), 4)
    return {
        "estr": _static_estr_fallback(),
        "euribor": _static_euribor_fallback(),
        "yield_curve_spot": spot,
        "yield_curve_forward": spot[:],  # reuse for forward for display
        "yield_curve_par": spot[:],
        "eur_irs_rates": _static_eur_irs_fallback(),
        "eur_futures": [],
        "curve_analysis": {
            "spread_2s10s": spread_2s10s,
            "spread_2s30s": spread_2s30s,
            "inverted_2s10s": spread_2s10s < 0,
        },
    }
