"""
Load user-defined swap market data from a JSON file.
When swap_market_data.json exists (filled by the user), it overrides or completes
ECB/fetch data so the SWAP tab works offline or with custom real-time inputs.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

LOG = logging.getLogger(__name__)

# Where to look for user data file (first existing wins)
_USER_FILE_NAMES = ["swap_market_data.json", "data/swap_market_data.json"]
_TEMPLATE_NAME = "swap_market_data_template.json"


def _search_paths() -> list[Path]:
    out: list[Path] = []
    env_path = os.environ.get("FINCEPT_SWAP_DATA")
    if env_path and os.path.isfile(env_path):
        out.append(Path(env_path))
    cwd = Path.cwd()
    for name in _USER_FILE_NAMES:
        p = cwd / name
        if p.is_file():
            out.append(p)
    # Next to api package (e.g. FinceptTerminal No Rust/apps/api)
    api_root = Path(__file__).resolve().parents[3]
    for name in _USER_FILE_NAMES:
        p = api_root / name
        if p.is_file():
            out.append(p)
    # Workspace root (parent of apps)
    if "apps" in api_root.parts:
        ws = api_root.parent
        for name in _USER_FILE_NAMES:
            p = ws / name
            if p.is_file():
                out.append(p)
    return out


def _template_path() -> Path | None:
    """Path to the shipped template (for copy reference)."""
    d = Path(__file__).resolve().parent
    p = d / _TEMPLATE_NAME
    return p if p.is_file() else None


def load_swap_market_data_overlay() -> dict[str, Any] | None:
    """
    Load user swap market data from swap_market_data.json if present.
    Returns a dict with same shape as get_swap_tab_snapshot["data"]; only
    non-empty keys are applied as overlay (override ECB/fetch data).
    """
    for path in _search_paths():
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                continue
            # Optional: skip if explicitly disabled
            if data.get("_disabled") is True:
                continue
            return data
        except (OSError, json.JSONDecodeError) as e:
            LOG.warning("Swap market data file %s: %s", path, e)
    return None


def is_snapshot_empty(snapshot: dict[str, Any]) -> bool:
    """True if snapshot has no meaningful curve or estr (needs fallback)."""
    estr = snapshot.get("estr") or {}
    rate = estr.get("rate") if isinstance(estr, dict) else None
    spot = snapshot.get("yield_curve_spot") or []
    irs = snapshot.get("eur_irs_rates") or []
    return (rate is None and not spot) or (not spot and not irs)


def load_bundled_fallback() -> dict[str, Any] | None:
    """Load the bundled template JSON as last-resort fallback (no _comment/_disabled)."""
    d = Path(__file__).resolve().parent
    path = d / _TEMPLATE_NAME
    if not path.is_file():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return None
        return {k: v for k, v in data.items() if not k.startswith("_")}
    except (OSError, json.JSONDecodeError):
        return None


def merge_snapshot_with_overlay(snapshot: dict[str, Any], overlay: dict[str, Any] | None) -> dict[str, Any]:
    """Merge overlay into snapshot. Overlay keys override when present and non-empty."""
    if not overlay:
        return snapshot
    result = dict(snapshot)
    for key in ("estr", "euribor", "yield_curve_spot", "yield_curve_forward", "yield_curve_par",
                "eur_irs_rates", "eur_futures", "curve_analysis"):
        if key not in overlay:
            continue
        val = overlay[key]
        if val is None:
            continue
        if key == "euribor" and isinstance(val, dict):
            result[key] = {**result.get(key, {}), **val}
        elif key == "curve_analysis" and isinstance(val, dict):
            result[key] = {**result.get(key, {}), **val}
        elif isinstance(val, list) and len(val) > 0:
            result[key] = val
        elif key == "estr" and isinstance(val, dict):
            result[key] = {**result.get(key, {}), **val}
        elif val is not None and val != "" and (not isinstance(val, (list, dict)) or val):
            result[key] = val
    return result
