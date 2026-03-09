"""
Market data provider — abstraction layer for live rates.
Default: ECB SDW. Users plug their own adapter for real-time data.

TO PLUG YOUR OWN API:
  1. Edit TemplateAdapter.fetch_snapshot() below
  2. Call set_market_data_adapter(TemplateAdapter()) at startup
     or invoke the 'set_market_data_adapter' command with {"adapter": "template"}
"""
from __future__ import annotations

import abc
import math
import time
from typing import Any


class RateSnapshot:
    """Immutable snapshot of the current rate environment."""

    def __init__(
        self,
        timestamp: float,
        estr: float | None,
        euribor: dict[str, float],
        spot_curve: list[dict[str, Any]],
        forward_curve: list[dict[str, Any]],
        par_curve: list[dict[str, Any]],
        irs_rates: list[dict[str, Any]],
        futures: list[dict[str, Any]],
    ):
        self.timestamp = timestamp
        self.estr = estr
        self.euribor = euribor
        self.spot_curve = spot_curve
        self.forward_curve = forward_curve
        self.par_curve = par_curve
        self.irs_rates = irs_rates
        self.futures = futures
        self._df_cache: list[tuple[float, float]] | None = None

    @property
    def discount_factors(self) -> list[tuple[float, float]]:
        if self._df_cache is None:
            from app.domains.rates_ird.pricing import build_discount_curve
            self._df_cache = build_discount_curve(self.spot_curve)
        return self._df_cache

    def swap_rate(self, tenor: str) -> float | None:
        for r in self.irs_rates:
            if r.get("tenor") == tenor:
                return r.get("rate")
        return None

    def spot_rate(self, maturity: str) -> float | None:
        for p in self.spot_curve:
            if p.get("maturity") == maturity:
                return p.get("value")
        return None

    def _rate(self, tenor: str) -> float | None:
        return self.swap_rate(tenor) or self.spot_rate(tenor)

    def spread(self, short_tenor: str, long_tenor: str) -> float | None:
        s = self._rate(short_tenor)
        l = self._rate(long_tenor)
        if s is not None and l is not None:
            return round((l - s) * 100, 2)
        return None

    def fly(self, wing1: str, body: str, wing2: str) -> float | None:
        w1 = self._rate(wing1)
        b = self._rate(body)
        w2 = self._rate(wing2)
        if w1 is not None and b is not None and w2 is not None:
            return round((b - (w1 + w2) / 2) * 100, 2)
        return None

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "estr": self.estr,
            "euribor": self.euribor,
            "spot_curve": self.spot_curve,
            "forward_curve": self.forward_curve,
            "par_curve": self.par_curve,
            "irs_rates": self.irs_rates,
            "futures": self.futures,
            "discount_factors": [list(p) for p in self.discount_factors],
        }


class MarketDataAdapter(abc.ABC):
    """Abstract adapter — implement fetch_snapshot() to return live rates."""

    @abc.abstractmethod
    def fetch_snapshot(self) -> RateSnapshot: ...


class ECBAdapter(MarketDataAdapter):
    """Default adapter — fetches from ECB SDW (free, no API key, ~15s latency)."""

    def fetch_snapshot(self) -> RateSnapshot:
        from app.domains.rates_ird import ecb_sdw

        estr_rate: float | None = None
        try:
            estr_obs = ecb_sdw.get_estr(last_n=1)
            estr_rate = estr_obs[-1].get("value") if estr_obs else None
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

        return RateSnapshot(
            timestamp=time.time(),
            estr=estr_rate,
            euribor=euribor,
            spot_curve=spot,
            forward_curve=forward,
            par_curve=par,
            irs_rates=irs,
            futures=futures,
        )


class TemplateAdapter(MarketDataAdapter):
    """
    ═══════════════════════════════════════════════════════════════
    TEMPLATE ADAPTER — PLUG YOUR REAL-TIME API HERE
    ═══════════════════════════════════════════════════════════════

    Replace the body of fetch_snapshot() with calls to your API
    (Bloomberg B-PIPE, Refinitiv, ICE, internal feed, etc.).

    The function must return a RateSnapshot with:
      - estr: float (€STR overnight rate, e.g. 3.65)
      - euribor: {"1M": 3.12, "3M": 3.25, "6M": 3.40}
      - spot_curve: [{"maturity": "2Y", "value": 2.85}, ...]
      - forward_curve: [{"maturity": "2Y", "value": 2.90}, ...]
      - par_curve: [{"maturity": "2Y", "value": 2.84}, ...]
      - irs_rates: [{"tenor": "2Y", "rate": 2.85}, ...]
      - futures: [{"symbol": "GBL=F", "name": "Bund", "price": 131.50,
                   "change": -0.25, "change_percent": -0.19, "timestamp": ...}]

    Example with a hypothetical REST API:

        import httpx, time

        def fetch_snapshot(self) -> RateSnapshot:
            r = httpx.get("https://your-api.com/rates/eur", timeout=5)
            data = r.json()
            return RateSnapshot(
                timestamp=time.time(),
                estr=data["estr"],
                euribor=data["euribor"],
                spot_curve=data["spot_curve"],
                forward_curve=data["forward_curve"],
                par_curve=data["par_curve"],
                irs_rates=data["irs_rates"],
                futures=data.get("futures", []),
            )
    """

    def fetch_snapshot(self) -> RateSnapshot:
        # ── REPLACE THIS WITH YOUR API CALLS ──
        return ECBAdapter().fetch_snapshot()


# ── Global adapter state ──

_active_adapter: MarketDataAdapter = ECBAdapter()
_cached_snapshot: RateSnapshot | None = None
_cache_ts: float = 0.0
_cache_ttl: float = 30.0


def set_active_adapter(adapter: MarketDataAdapter) -> None:
    global _active_adapter, _cached_snapshot, _cache_ts
    _active_adapter = adapter
    _cached_snapshot = None
    _cache_ts = 0.0


def set_cache_ttl(ttl_seconds: float) -> None:
    global _cache_ttl
    _cache_ttl = max(1.0, ttl_seconds)


def get_live_snapshot(force_refresh: bool = False) -> RateSnapshot:
    global _cached_snapshot, _cache_ts
    now = time.time()
    if not force_refresh and _cached_snapshot and (now - _cache_ts) < _cache_ttl:
        return _cached_snapshot
    _cached_snapshot = _active_adapter.fetch_snapshot()
    _cache_ts = now
    return _cached_snapshot
