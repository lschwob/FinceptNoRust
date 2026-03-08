"""Risk projection: map DV01 from any tenor to liquid pillars (PCA, OLS, Ridge, linear interp)."""
from __future__ import annotations

from typing import Any

import numpy as np

# Optional: sklearn for Ridge, statsmodels for PCA
try:
    from sklearn.linear_model import Ridge
except ImportError:
    Ridge = None
try:
    from sklearn.decomposition import PCA as SklearnPCA
except ImportError:
    SklearnPCA = None


def _parse_curve_history(curve_history: list[dict[str, Any]]) -> tuple[list[str], list[str], np.ndarray]:
    """Parse curve_history to (dates, tenors, matrix). Matrix is (n_dates x n_tenors)."""
    if not curve_history:
        return [], [], np.array([]).reshape(0, 0)
    first = curve_history[0]
    if isinstance(first, dict):
        # Assume keys are tenors or 'date'; skip 'date'
        tenors = sorted([k for k in first if k != "date" and isinstance(first.get(k), (int, float))])
        dates = [row.get("date", str(i)) for i, row in enumerate(curve_history)]
        mat = np.array([[float(row.get(t, np.nan)) for t in tenors] for row in curve_history])
    else:
        return [], [], np.array([]).reshape(0, 0)
    return dates, tenors, mat


def _tenor_to_years(t: str) -> float:
    """'5Y' -> 5.0, '6M' -> 0.5."""
    t = str(t).strip().upper()
    if t.endswith("Y"):
        return float(t[:-1] or 0)
    if t.endswith("M"):
        return float(t[:-1] or 0) / 12.0
    return float(t) if t else 0.0


def _compute_changes(mat: np.ndarray) -> np.ndarray:
    """(n_dates x n_tenors) -> (n_dates-1 x n_tenors) rate changes."""
    if mat.shape[0] < 2:
        return np.array([]).reshape(0, mat.shape[1])
    return np.diff(mat, axis=0)


def _linear_interp_weights(tenor: str, pillars: list[str]) -> list[float]:
    """Weights to distribute 1 unit at tenor across pillars (linear interpolation in maturity)."""
    ty = _tenor_to_years(tenor)
    py = [_tenor_to_years(p) for p in pillars]
    if not py:
        return []
    if ty <= py[0]:
        w = [1.0] + [0.0] * (len(py) - 1)
        return w
    if ty >= py[-1]:
        w = [0.0] * (len(py) - 1) + [1.0]
        return w
    for i in range(len(py) - 1):
        if py[i] <= ty <= py[i + 1]:
            denom = py[i + 1] - py[i]
            if denom <= 0:
                w = [0.0] * len(py)
                w[i] = 1.0
                return w
            alpha = (ty - py[i]) / denom
            w = [0.0] * len(py)
            w[i] = 1.0 - alpha
            w[i + 1] = alpha
            return w
    return [0.0] * len(py)


def compute_projection_matrix(
    curve_history: list[dict[str, Any]],
    pillars: list[str],
    technique: str,
) -> dict[str, Any]:
    """
    Build projection matrix P: (n_tenors x n_pillars).
    technique: 'pca' | 'ols' | 'ridge' | 'linear_interp'
    Returns: projection_matrix (list of list), r2_scores, residuals, explained_variance (for PCA).
    """
    dates, tenors, mat = _parse_curve_history(curve_history)
    if mat.size == 0 or not tenors or not pillars:
        return {
            "success": False,
            "error": "curve_history or pillars empty",
            "projection_matrix": {},
            "r2_scores": {},
            "residuals": {},
            "explained_variance": [],
        }
    changes = _compute_changes(mat)
    if changes.shape[0] < 2:
        return {
            "success": False,
            "error": "Need at least 2 dates for changes",
            "projection_matrix": {},
            "r2_scores": {},
            "residuals": {},
        }
    pillar_indices = [tenors.index(p) for p in pillars if p in tenors]
    if len(pillar_indices) != len(pillars):
        return {
            "success": False,
            "error": "Not all pillars found in curve tenors",
            "tenors": tenors,
            "pillars": pillars,
        }
    X = changes[:, pillar_indices]
    n_tenors = len(tenors)
    n_pillars = len(pillars)
    P = np.zeros((n_tenors, n_pillars))
    r2_scores: dict[str, float] = {}
    residuals: dict[str, list[float]] = {}

    if technique == "linear_interp":
        for i, t in enumerate(tenors):
            w = _linear_interp_weights(t, pillars)
            if len(w) == n_pillars:
                P[i, :] = w
        for j, p in enumerate(pillars):
            idx = tenors.index(p) if p in tenors else None
            if idx is not None:
                P[idx, :] = 0.0
                P[idx, j] = 1.0
        return {
            "success": True,
            "projection_matrix": {tenors[i]: list(P[i, :]) for i in range(n_tenors)},
            "pillars": pillars,
            "tenors": tenors,
            "r2_scores": {},
            "residuals": {},
            "explained_variance": [],
        }

    if technique == "ols" or technique == "ridge":
        for i in range(n_tenors):
            if i in pillar_indices:
                j = pillar_indices.index(i)
                P[i, j] = 1.0
                continue
            y = changes[:, i]
            mask = ~(np.isnan(y) | np.isnan(X).any(axis=1))
            if mask.sum() < 3:
                P[i, :] = 0.0
                continue
            Xm, ym = X[mask], y[mask]
            if technique == "ridge" and Ridge is not None:
                model = Ridge(alpha=1.0, fit_intercept=True)
                model.fit(Xm, ym)
                coef = model.coef_
            else:
                # OLS: (X'X)^{-1} X' y
                try:
                    coef, _, _, _ = np.linalg.lstsq(Xm, ym, rcond=None)
                except Exception:
                    coef = np.zeros(n_pillars)
            P[i, :] = coef
            y_pred = Xm @ coef
            ss_res = np.sum((ym - y_pred) ** 2)
            ss_tot = np.sum((ym - np.mean(ym)) ** 2)
            r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
            r2_scores[tenors[i]] = float(r2)
            residuals[tenors[i]] = (ym - y_pred).tolist()
        return {
            "success": True,
            "projection_matrix": {tenors[i]: list(map(float, P[i, :])) for i in range(n_tenors)},
            "pillars": pillars,
            "tenors": tenors,
            "r2_scores": r2_scores,
            "residuals": {k: v[:100] for k, v in residuals.items()},
            "explained_variance": [],
        }

    if technique == "pca" and SklearnPCA is not None:
        n_comp = min(3, changes.shape[0], len(pillar_indices))
        X_clean = np.nan_to_num(X, nan=0.0)
        pca = SklearnPCA(n_components=n_comp)
        pca.fit(X_clean)
        loadings = pca.components_.T
        explained = list(map(float, pca.explained_variance_ratio_))
        X_pc = X_clean @ loadings
        for i in range(n_tenors):
            if i in pillar_indices:
                j = pillar_indices.index(i)
                P[i, j] = 1.0
                r2_scores[tenors[i]] = 1.0
                continue
            y = changes[:, i]
            mask = ~np.isnan(y)
            if mask.sum() < 2:
                continue
            try:
                coef, _, _, _ = np.linalg.lstsq(X_pc[mask], y[mask], rcond=None)
                pillar_coef = loadings @ np.asarray(coef).ravel()
                P[i, :] = pillar_coef
                y_pred = X_pc[mask] @ np.asarray(coef).ravel()
                ym = y[mask]
                ss_res = np.sum((ym - y_pred) ** 2)
                ss_tot = np.sum((ym - np.mean(ym)) ** 2)
                r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
                r2_scores[tenors[i]] = float(r2)
                residuals[tenors[i]] = (ym - y_pred).tolist()[:100]
            except Exception:
                continue
        return {
            "success": True,
            "projection_matrix": {tenors[i]: list(map(float, P[i, :])) for i in range(n_tenors)},
            "pillars": pillars,
            "tenors": tenors,
            "r2_scores": r2_scores,
            "residuals": {k: v[:100] for k, v in residuals.items()},
            "explained_variance": explained,
        }

    return {
        "success": False,
        "error": f"Unknown technique or missing dependency: {technique}",
        "projection_matrix": {},
        "r2_scores": {},
        "residuals": {},
    }


def project_trade_risk(
    dv01: float,
    tenor: str,
    projection_matrix: dict[str, list[float]],
    pillars: list[str],
) -> dict[str, float]:
    """Project a single trade DV01 onto pillars. Returns { '5Y': x, '7Y': y, ... }."""
    row = projection_matrix.get(str(tenor).strip().upper())
    if not row or len(row) != len(pillars):
        return {p: 0.0 for p in pillars}
    return {p: float(dv01 * row[j]) for j, p in enumerate(pillars)}


def project_book_pnl(
    by_tenor: dict[str, float],
    projection_matrix: dict[str, list[float]],
    pillars: list[str],
    rate_shocks_bps: dict[str, float],
) -> dict[str, Any]:
    """
    by_tenor: { '5Y': dv01_5, '8Y': dv01_8, ... } (from swap_pt_get_risk.by_tenor or similar).
    rate_shocks_bps: { '5Y': 10, '7Y': -5, '10Y': 0 } in bps.
    Returns projected P&L = sum over pillars of (projected_dv01[p] * rate_shock_bps[p] * 1e-4).
    """
    if not projection_matrix or not pillars:
        return {"success": False, "error": "projection_matrix and pillars required", "pnl": 0.0}
    projected_dv01: dict[str, float] = {p: 0.0 for p in pillars}
    for tenor, dv01 in (by_tenor or {}).items():
        row = projection_matrix.get(tenor)
        if row and len(row) == len(pillars):
            for j, p in enumerate(pillars):
                projected_dv01[p] = projected_dv01.get(p, 0) + float(dv01) * float(row[j])
    pnl = 0.0
    for p in pillars:
        shock = rate_shocks_bps.get(p, 0.0)
        pnl += projected_dv01[p] * shock * 1e-4
    return {
        "success": True,
        "projected_dv01_by_pillar": projected_dv01,
        "rate_shocks_bps": rate_shocks_bps,
        "pnl": round(pnl, 2),
    }


def compute_risk_projection_handler(args: dict[str, Any]) -> dict[str, Any]:
    """Invoke handler: curve_history, pillars, technique."""
    curve_history = args.get("curve_history") or args.get("curveHistory") or []
    pillars = args.get("pillars") or args.get("pillar_tenors") or ["5Y", "7Y", "10Y"]
    technique = args.get("technique") or "ols"
    if isinstance(pillars, str):
        pillars = [s.strip() for s in pillars.split(",")]
    return compute_projection_matrix(curve_history, list(pillars), technique)


def project_book_pnl_handler(args: dict[str, Any]) -> dict[str, Any]:
    """Invoke handler: by_tenor (or book_id to fetch), projection_matrix, pillars, rate_shocks_bps."""
    by_tenor = args.get("by_tenor") or args.get("byTenor")
    projection_matrix = args.get("projection_matrix") or args.get("projectionMatrix") or {}
    pillars = args.get("pillars") or args.get("pillar_tenors") or ["5Y", "7Y", "10Y"]
    rate_shocks_bps = args.get("rate_shocks_bps") or args.get("rateShocksBps") or {}
    if isinstance(pillars, str):
        pillars = [s.strip() for s in pillars.split(",")]
    if not by_tenor and args.get("book_id"):
        from app.domains.rates_ird import swap_paper
        risk = swap_paper.swap_pt_get_risk({"book_id": args["book_id"]})
        if risk.get("success") and risk.get("data"):
            by_tenor = risk["data"].get("by_tenor") or {}
        else:
            by_tenor = {}
    return project_book_pnl(by_tenor or {}, projection_matrix, list(pillars), rate_shocks_bps)
