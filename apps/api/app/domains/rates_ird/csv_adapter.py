"""
CSV Folder Adapter — reads spot rates from CSV files uploaded to a folder.

Expected CSV headers:
  SensiCurveCurrency, SensiCurve, Maturity,
  MarketDataBucketed.Move, MarketDataBucketed.Rate1, MarketDataBucketed.Rate2

The adapter:
  1. Finds the most recent CSV in the folder
  2. Filters by currency (default EUR) and groups by SensiCurve
  3. Extracts spot rates from MarketDataBucketed.Rate1
  4. Derives forward rates, par rates, discount factors from the spot curve
"""
from __future__ import annotations

import csv
import logging
import math
import os
import time
from pathlib import Path
from typing import Any

from app.domains.rates_ird.market_data_provider import MarketDataAdapter, RateSnapshot
from app.domains.rates_ird.pricing import MATURITY_TO_YEARS

LOG = logging.getLogger(__name__)

_MATURITY_ALIASES: dict[str, str] = {
    "O/N": "1D", "ON": "1D", "1D": "1D", "TN": "1D",
    "1W": "1W", "2W": "2W",
    "1M": "1M", "2M": "2M", "3M": "3M", "6M": "6M", "9M": "9M", "12M": "1Y",
}


def _normalize_maturity(raw: str) -> str:
    """Normalize maturity labels to standard form (e.g., '10Y', '6M')."""
    raw = raw.strip().upper().replace(" ", "")
    if raw in _MATURITY_ALIASES:
        return _MATURITY_ALIASES[raw]
    return raw


def _maturity_to_years(m: str) -> float:
    m = _normalize_maturity(m)
    if m in MATURITY_TO_YEARS:
        return MATURITY_TO_YEARS[m]
    if m == "1D":
        return 1 / 365
    if m == "1W":
        return 7 / 365
    if m == "2W":
        return 14 / 365
    if m.endswith("Y"):
        try:
            return float(m[:-1])
        except ValueError:
            pass
    if m.endswith("M"):
        try:
            return int(m[:-1]) / 12
        except ValueError:
            pass
    return 0.0


def _find_latest_csv(folder: str | Path) -> Path | None:
    """Find the most recently modified .csv file in the folder."""
    folder = Path(folder)
    if not folder.is_dir():
        LOG.warning("CSV folder does not exist: %s", folder)
        return None
    csvs = sorted(folder.glob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
    return csvs[0] if csvs else None


def _parse_csv(path: Path, currency: str, curve_filter: str | None) -> list[dict[str, Any]]:
    """Parse CSV and return rows for the specified currency/curve."""
    rows: list[dict[str, Any]] = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ccy = (row.get("SensiCurveCurrency") or "").strip().upper()
            if ccy != currency.upper():
                continue
            curve_name = (row.get("SensiCurve") or "").strip()
            if curve_filter and curve_filter.upper() not in curve_name.upper():
                continue
            mat_raw = (row.get("Maturity") or "").strip()
            rate1_raw = row.get("MarketDataBucketed.Rate1", "")
            rate2_raw = row.get("MarketDataBucketed.Rate2", "")
            move_raw = row.get("MarketDataBucketed.Move", "")
            try:
                rate1 = float(rate1_raw) if rate1_raw else None
            except (ValueError, TypeError):
                rate1 = None
            try:
                rate2 = float(rate2_raw) if rate2_raw else None
            except (ValueError, TypeError):
                rate2 = None
            try:
                move = float(move_raw) if move_raw else None
            except (ValueError, TypeError):
                move = None
            rows.append({
                "curve": curve_name,
                "maturity_raw": mat_raw,
                "maturity": _normalize_maturity(mat_raw),
                "rate1": rate1,
                "rate2": rate2,
                "move": move,
                "years": _maturity_to_years(mat_raw),
            })
    rows.sort(key=lambda r: r["years"])
    return rows


def _compute_forward_curve(spot_curve: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Derive instantaneous forward rates from zero/spot rates.
    f(t1, t2) = (r2 * t2 - r1 * t1) / (t2 - t1)
    Rates in percent.
    """
    forwards: list[dict[str, Any]] = []
    sorted_pts = sorted(spot_curve, key=lambda p: _maturity_to_years(p["maturity"]))

    for i in range(len(sorted_pts)):
        t2 = _maturity_to_years(sorted_pts[i]["maturity"])
        r2 = sorted_pts[i]["value"]
        if t2 <= 0:
            continue
        if i == 0:
            forwards.append({"maturity": sorted_pts[i]["maturity"], "value": round(r2, 4)})
        else:
            t1 = _maturity_to_years(sorted_pts[i - 1]["maturity"])
            r1 = sorted_pts[i - 1]["value"]
            if t2 > t1 and t1 > 0:
                fwd = (r2 * t2 - r1 * t1) / (t2 - t1)
                forwards.append({"maturity": sorted_pts[i]["maturity"], "value": round(fwd, 4)})
            else:
                forwards.append({"maturity": sorted_pts[i]["maturity"], "value": round(r2, 4)})
    return forwards


def _compute_par_curve(spot_curve: list[dict[str, Any]], pay_freq: int = 1) -> list[dict[str, Any]]:
    """
    Derive par rates from zero/spot rates.
    Par rate C such that: C * sum(DF(ti)) + DF(T) = 1
    => C = (1 - DF(T)) / sum(DF(ti))
    """
    from app.domains.rates_ird.pricing import build_discount_curve, _interp_discount

    dc = build_discount_curve(spot_curve)
    par_rates: list[dict[str, Any]] = []

    for pt in sorted(spot_curve, key=lambda p: _maturity_to_years(p["maturity"])):
        T = _maturity_to_years(pt["maturity"])
        if T < 1.0:
            par_rates.append({"maturity": pt["maturity"], "value": round(pt["value"], 4)})
            continue
        n = max(1, int(T * pay_freq))
        annuity = 0.0
        for i in range(1, n + 1):
            annuity += _interp_discount(i / pay_freq, dc)
        annuity /= pay_freq
        df_T = _interp_discount(T, dc)
        if annuity > 0:
            par = (1.0 - df_T) / annuity * 100
            par_rates.append({"maturity": pt["maturity"], "value": round(par, 4)})
        else:
            par_rates.append({"maturity": pt["maturity"], "value": round(pt["value"], 4)})
    return par_rates


class CSVFolderAdapter(MarketDataAdapter):
    """
    Reads the latest CSV from a folder, extracts spot rates,
    and derives forward, par, and discount factor curves.

    Args:
        folder: Path to the folder containing CSV files
        currency: Currency filter (default "EUR")
        curve_filter: Optional substring to match SensiCurve column
        rate_field: Which rate column to use: "rate1" or "rate2" (default "rate1")
    """

    def __init__(
        self,
        folder: str | Path,
        currency: str = "EUR",
        curve_filter: str | None = None,
        rate_field: str = "rate1",
    ):
        self.folder = Path(folder)
        self.currency = currency
        self.curve_filter = curve_filter
        self.rate_field = rate_field
        self._last_file: Path | None = None
        self._last_mtime: float = 0.0

    def fetch_snapshot(self) -> RateSnapshot:
        csv_path = _find_latest_csv(self.folder)
        if csv_path is None:
            LOG.warning("No CSV files found in %s", self.folder)
            return RateSnapshot(
                timestamp=time.time(), estr=None, euribor={},
                spot_curve=[], forward_curve=[], par_curve=[],
                irs_rates=[], futures=[],
            )

        self._last_file = csv_path
        self._last_mtime = csv_path.stat().st_mtime
        LOG.info("Reading rates from %s (modified %s)", csv_path.name, time.ctime(self._last_mtime))

        rows = _parse_csv(csv_path, self.currency, self.curve_filter)
        if not rows:
            LOG.warning("No rows matching currency=%s curve=%s in %s", self.currency, self.curve_filter, csv_path.name)
            return RateSnapshot(
                timestamp=time.time(), estr=None, euribor={},
                spot_curve=[], forward_curve=[], par_curve=[],
                irs_rates=[], futures=[],
            )

        use_rate = self.rate_field
        spot_curve: list[dict[str, Any]] = []
        estr: float | None = None
        euribor: dict[str, float] = {}

        curves_seen: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            curve_name = row["curve"]
            if curve_name not in curves_seen:
                curves_seen[curve_name] = []
            curves_seen[curve_name].append(row)

        if len(curves_seen) > 1:
            LOG.info("Multiple curves found: %s", list(curves_seen.keys()))

        for row in rows:
            rate = row.get(use_rate)
            if rate is None:
                continue
            mat = row["maturity"]
            years = row["years"]

            if mat in ("O/N", "ON", "1D") or years <= 1 / 365:
                if estr is None:
                    estr = rate
                continue

            if mat in ("1M", "3M", "6M", "12M", "1Y"):
                if years <= 1.0:
                    euribor[mat] = round(rate, 4)

            spot_curve.append({"maturity": mat, "value": round(rate, 4)})

        seen_mats: set[str] = set()
        deduped: list[dict[str, Any]] = []
        for pt in spot_curve:
            if pt["maturity"] not in seen_mats:
                seen_mats.add(pt["maturity"])
                deduped.append(pt)
        spot_curve = deduped

        forward_curve = _compute_forward_curve(spot_curve) if spot_curve else []
        par_curve = _compute_par_curve(spot_curve) if spot_curve else []

        irs_rates = [
            {"tenor": pt["maturity"], "rate": pt["value"]}
            for pt in spot_curve
            if _maturity_to_years(pt["maturity"]) >= 2.0
        ]

        return RateSnapshot(
            timestamp=time.time(),
            estr=estr,
            euribor=euribor,
            spot_curve=spot_curve,
            forward_curve=forward_curve,
            par_curve=par_curve,
            irs_rates=irs_rates,
            futures=[],
        )

    @property
    def status(self) -> dict[str, Any]:
        return {
            "adapter": "csv_folder",
            "folder": str(self.folder),
            "currency": self.currency,
            "curve_filter": self.curve_filter,
            "rate_field": self.rate_field,
            "last_file": self._last_file.name if self._last_file else None,
            "last_mtime": time.ctime(self._last_mtime) if self._last_mtime else None,
        }


def list_csv_curves(folder: str | Path, currency: str = "EUR") -> dict[str, Any]:
    """Scan the latest CSV and return available curves per currency."""
    folder = Path(folder)
    csv_path = _find_latest_csv(folder)
    if csv_path is None:
        return {"file": None, "currencies": [], "curves": []}
    currencies: set[str] = set()
    curves: dict[str, set[str]] = {}
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ccy = (row.get("SensiCurveCurrency") or "").strip().upper()
            curve = (row.get("SensiCurve") or "").strip()
            if ccy:
                currencies.add(ccy)
            if ccy and curve:
                curves.setdefault(ccy, set()).add(curve)
    all_curves = sorted(curves.get(currency.upper(), set()))
    return {
        "file": csv_path.name,
        "currencies": sorted(currencies),
        "curves": all_curves,
    }
