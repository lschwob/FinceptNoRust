# Plan d'amélioration — SWAP Tab

> Objectif : transformer la tab SWAP en un véritable desk de trading taux avec pricing automatique (curve, fly, ASW, basis), blotter temps réel, market data provider pluggable et visualisations de courbes.

---

## Table des matières

1. [État actuel](#1-état-actuel)
2. [Architecture cible](#2-architecture-cible)
3. [Phase 1 — Market Data Provider temps réel](#3-phase-1--market-data-provider-temps-réel)
4. [Phase 2 — Visualisation des courbes](#4-phase-2--visualisation-des-courbes)
5. [Phase 3 — Moteur de pricing étendu](#5-phase-3--moteur-de-pricing-étendu)
6. [Phase 4 — Blotter & P&L temps réel](#6-phase-4--blotter--pl-temps-réel)
7. [Découpage fichiers](#7-découpage-fichiers)
8. [Ordre d'implémentation](#8-ordre-dimplémentation)

---

## 1. État actuel

### Frontend (`apps/web/src/app/components/tabs/swap/`)

| Sous-tab | Fichier | État |
|----------|---------|------|
| Market Data | `SwapTab.tsx` (inline) | Tables statiques €STR, EURIBOR, ECB spot, IRS, futures, spread 2s10s/2s30s. Pas de graphes. Refresh manuel toutes les 10 min. |
| IRS Pricer | `panels/IRSPricerPanel.tsx` | Pricer simple : notional/rate/tenor → PV, par rate, DV01. Utilise ECB spot curve. |
| Bond Pricer | `panels/BondPricerPanel.tsx` | Prix clean/dirty, duration, DV01, convexité. |
| Paper Trading | `panels/SwapPaperTradingPanel.tsx` | Blotter basique : création livre, saisie IRS/OIS, MTM manuel. Pas de P&L temps réel. |
| Backtest | `panels/RatesBacktestPanel.tsx` | Steepener/flattener backtest avec equity curve (SVG `DataChart`). |
| Risk Projection | `panels/RiskProjectionPanel.tsx` | PCA/OLS/Ridge, projection P&L. Utilise `recharts` BarChart. |

### Backend (`apps/api/app/domains/rates_ird/`)

| Module | Rôle |
|--------|------|
| `ecb_sdw.py` | Client ECB : €STR, EURIBOR, yield curves (spot/forward/par), IRS rates |
| `pricing.py` | IRS (annuity, par rate, DV01), bond, OIS — pure Python |
| `swap_paper.py` | Paper trading in-memory (livres, trades, MTM via ECB) |
| `handlers.py` | 25 commandes invoke pour toute la tab |
| `rates_backtest.py` | Backtest steepener/flattener |
| `risk_projection.py` | Projection PCA/OLS/Ridge |

### Limites actuelles

- **Pas de pricing structuré** : pas de curve trade, fly, ASW, basis
- **Pas de temps réel** : données ECB fetchées à la demande, cache de 5–10 min
- **Blotter pauvre** : pas de P&L temps réel, pas de couleur, pas d'agrégation
- **Pas de graphes de courbes** : yield curve, forward, discount factor affichés en tables uniquement
- **Données hardcodées ECB** : pas de mécanisme pluggable pour brancher une autre source

---

## 2. Architecture cible

```
┌─────────────────────────────────────────────────────────────┐
│                      SWAP TAB (React)                        │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │ Courbes  │ │ Pricer   │ │ Blotter  │ │ Risk / Backtest  ││
│  │ (charts) │ │ étendu   │ │ RT P&L   │ │ (existant)       ││
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────────────┘│
│       │             │            │                            │
│  ┌────▼─────────────▼────────────▼──────────────────────────┐│
│  │           useMarketDataProvider (hook)                    ││
│  │   • Polling configurable (1s–60s)                        ││
│  │   • Expose: curves, rates, spreads, forwards, DF         ││
│  │   • Computed: fly, ASW, basis en temps réel              ││
│  └────┬─────────────────────────────────────────────────────┘│
│       │                                                      │
└───────┼──────────────────────────────────────────────────────┘
        │ HTTP POST /api/v1/bridge/invoke/{command}
        │
┌───────▼──────────────────────────────────────────────────────┐
│                   FastAPI Backend                              │
│                                                               │
│  ┌────────────────────────────────┐  ┌──────────────────────┐│
│  │ MarketDataProvider (Python)    │  │ Pricing Engine        ││
│  │                                │  │                       ││
│  │ get_live_snapshot():           │  │ price_curve_trade()   ││
│  │   → adapter.fetch_rates()     │  │ price_fly()           ││
│  │   → compute derived (fwd, df) │  │ price_asw()           ││
│  │                                │  │ price_basis_swap()    ││
│  │ Adapters:                      │  │ price_irs() (exist.)  ││
│  │   • ECBAdapter (défaut)        │  │ price_bond() (exist.) ││
│  │   • TemplateAdapter (pluggable)│  │ price_ois() (exist.)  ││
│  │   • FileAdapter (JSON overlay) │  │                       ││
│  └────────────────────────────────┘  └──────────────────────┘│
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Phase 1 — Market Data Provider temps réel

### 3.1 Objectif

Créer une abstraction `MarketDataProvider` côté backend avec un adaptateur **template** que l'utilisateur peut brancher sur n'importe quelle source de données (Bloomberg B-PIPE, Refinitiv, ICE, API interne, etc.).

### 3.2 Backend — `apps/api/app/domains/rates_ird/market_data_provider.py`

```python
"""
Market data provider — abstraction layer for live rates.
Default: ECB SDW. Users plug their own adapter for real-time data.
"""
from __future__ import annotations
import abc
import time
import math
from typing import Any


class RateSnapshot:
    """Immutable snapshot of the current rate environment."""
    def __init__(
        self,
        timestamp: float,
        estr: float | None,
        euribor: dict[str, float],           # {"1M": 3.12, "3M": 3.25, "6M": 3.40}
        spot_curve: list[dict[str, Any]],     # [{"maturity": "2Y", "value": 2.85}, ...]
        forward_curve: list[dict[str, Any]],
        par_curve: list[dict[str, Any]],
        irs_rates: list[dict[str, Any]],      # [{"tenor": "2Y", "rate": 2.85}, ...]
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

    # --- Computed properties ---

    @property
    def discount_factors(self) -> list[tuple[float, float]]:
        """Build discount factors from spot curve."""
        from app.domains.rates_ird.pricing import build_discount_curve
        return build_discount_curve(self.spot_curve)

    def swap_rate(self, tenor: str) -> float | None:
        """Get IRS par rate for a given tenor."""
        for r in self.irs_rates:
            if r.get("tenor") == tenor:
                return r.get("rate")
        return None

    def spot_rate(self, maturity: str) -> float | None:
        """Get spot rate for a given maturity."""
        for p in self.spot_curve:
            if p.get("maturity") == maturity:
                return p.get("value")
        return None

    def spread(self, short_tenor: str, long_tenor: str) -> float | None:
        """Curve spread in bp: long - short."""
        s = self.swap_rate(short_tenor) or self.spot_rate(short_tenor)
        l = self.swap_rate(long_tenor) or self.spot_rate(long_tenor)
        if s is not None and l is not None:
            return round((l - s) * 100, 2)  # bp
        return None

    def fly(self, wing1: str, body: str, wing2: str) -> float | None:
        """Butterfly: body - (wing1 + wing2) / 2, in bp."""
        w1 = self.swap_rate(wing1) or self.spot_rate(wing1)
        b = self.swap_rate(body) or self.spot_rate(body)
        w2 = self.swap_rate(wing2) or self.spot_rate(wing2)
        if w1 is not None and b is not None and w2 is not None:
            return round((b - (w1 + w2) / 2) * 100, 2)  # bp
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
    """
    Abstract adapter — implement fetch_snapshot() to return live rates.

    TO PLUG YOUR OWN API:
    1. Subclass MarketDataAdapter
    2. Implement fetch_snapshot() → RateSnapshot
    3. Register via set_active_adapter(YourAdapter())

    See TemplateAdapter below for the exact structure to fill.
    """

    @abc.abstractmethod
    def fetch_snapshot(self) -> RateSnapshot:
        """Fetch current market rates from your data source."""
        ...


class ECBAdapter(MarketDataAdapter):
    """Default adapter — fetches from ECB SDW (free, no API key, ~15s latency)."""

    def fetch_snapshot(self) -> RateSnapshot:
        from app.domains.rates_ird import ecb_sdw
        estr_obs = ecb_sdw.get_estr(last_n=1)
        estr_rate = estr_obs[-1].get("value") if estr_obs else None
        euribor = ecb_sdw.get_euribor_all()
        spot = ecb_sdw.get_ecb_yield_curve("spot_rate", "A", None)
        forward = ecb_sdw.get_ecb_yield_curve("instantaneous_forward", "A", None)
        par = ecb_sdw.get_ecb_yield_curve("par_yield", "A", None)
        irs = ecb_sdw.get_eur_irs_rates()
        futures = ecb_sdw.get_eur_futures_via_yf()
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

    This is the adapter you modify to connect your own data source.
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
        # For now, falls back to ECB data.
        return ECBAdapter().fetch_snapshot()


# ── Global adapter state ──

_active_adapter: MarketDataAdapter = ECBAdapter()
_cached_snapshot: RateSnapshot | None = None
_cache_ts: float = 0.0
_cache_ttl: float = 30.0  # seconds


def set_active_adapter(adapter: MarketDataAdapter) -> None:
    """Switch the live data source. Call once at startup or via settings."""
    global _active_adapter, _cached_snapshot, _cache_ts
    _active_adapter = adapter
    _cached_snapshot = None
    _cache_ts = 0.0


def set_cache_ttl(ttl_seconds: float) -> None:
    global _cache_ttl
    _cache_ttl = max(1.0, ttl_seconds)


def get_live_snapshot(force_refresh: bool = False) -> RateSnapshot:
    """Get current market snapshot (cached with TTL)."""
    global _cached_snapshot, _cache_ts
    now = time.time()
    if not force_refresh and _cached_snapshot and (now - _cache_ts) < _cache_ttl:
        return _cached_snapshot
    _cached_snapshot = _active_adapter.fetch_snapshot()
    _cache_ts = now
    return _cached_snapshot
```

### 3.3 Nouveau handler — `get_live_rates`

Ajouter dans `handlers.py` :

```python
def get_live_rates(args: dict[str, Any]) -> dict[str, Any]:
    """Real-time rates snapshot via pluggable adapter."""
    force = bool(args.get("force_refresh", False))
    snap = market_data_provider.get_live_snapshot(force_refresh=force)
    data = snap.to_dict()

    # Add computed spreads
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
```

### 3.4 Frontend — `useMarketData` hook

```typescript
// apps/web/src/app/hooks/useMarketData.ts
/**
 * Polling hook for real-time rate data from the market data provider.
 * Calls get_live_rates at a configurable interval.
 */

export interface LiveRatesSnapshot {
  timestamp: number;
  estr: number | null;
  euribor: Record<string, number>;
  spot_curve: Array<{ maturity: string; value: number }>;
  forward_curve: Array<{ maturity: string; value: number }>;
  par_curve: Array<{ maturity: string; value: number }>;
  irs_rates: Array<{ tenor: string; rate: number }>;
  futures: Array<{ symbol: string; name: string; price: number; change: number; change_percent: number }>;
  discount_factors: Array<[number, number]>;
  spreads: Record<string, number | null>;
  flies: Record<string, number | null>;
}

export function useMarketData(intervalMs: number = 30_000) {
  // Uses useCache or useEffect + setInterval to poll get_live_rates
  // Returns: { snapshot, isLoading, lastUpdate, refresh }
}
```

### 3.5 Commande de switch d'adapter

```python
def set_market_data_adapter(args: dict[str, Any]) -> dict[str, Any]:
    """Switch between 'ecb' (default) and 'template' adapter."""
    adapter_name = args.get("adapter", "ecb")
    ttl = float(args.get("cache_ttl", 30))
    if adapter_name == "template":
        market_data_provider.set_active_adapter(TemplateAdapter())
    else:
        market_data_provider.set_active_adapter(ECBAdapter())
    market_data_provider.set_cache_ttl(ttl)
    return {"success": True, "data": {"adapter": adapter_name, "cache_ttl": ttl}}
```

---

## 4. Phase 2 — Visualisation des courbes

### 4.1 Choix de librairie

**`recharts`** (déjà installé v2.15.4) — meilleur choix pour les courbes de taux :
- `LineChart` pour yield curve, forward curve, discount factors
- `AreaChart` pour spread historiques
- Tooltips interactifs, responsive, theme compatible terminal

**`lightweight-charts`** (déjà installé v5.0.9) — pour les séries temporelles historiques de taux.

### 4.2 Composants à créer

#### `apps/web/src/app/components/tabs/swap/charts/YieldCurveChart.tsx`

```
Props:
  - spotCurve: Array<{maturity, value}>
  - forwardCurve: Array<{maturity, value}>
  - parCurve: Array<{maturity, value}>
  - showSpot: boolean
  - showForward: boolean
  - showPar: boolean

Affichage:
  - Axe X: maturités (3M, 6M, 1Y, 2Y, ... 30Y) — échelle log ou linéaire
  - Axe Y: taux en %
  - 3 lignes superposées (spot orange, forward bleu, par vert)
  - Tooltip avec toutes les valeurs au survol
  - Legend toggle
```

#### `apps/web/src/app/components/tabs/swap/charts/DiscountFactorChart.tsx`

```
Props:
  - discountFactors: Array<[years, df]>

Affichage:
  - Axe X: années
  - Axe Y: discount factor (0 → 1)
  - Ligne décroissante de 1.0 vers 0
  - Zone colorée sous la courbe (AreaChart)
```

#### `apps/web/src/app/components/tabs/swap/charts/SpreadChart.tsx`

```
Props:
  - spreads: Record<string, number | null>
  - flies: Record<string, number | null>

Affichage:
  - BarChart horizontal : chaque spread/fly avec sa valeur en bp
  - Couleur verte si positif, rouge si négatif
```

#### `apps/web/src/app/components/tabs/swap/charts/RateTimeSeriesChart.tsx`

```
Props:
  - series: Array<{date, value}>
  - label: string (e.g. "EUR 2s10s")

Affichage:
  - lightweight-charts AreaSeries pour l'historique d'un spread
  - Crosshair avec valeur
```

### 4.3 Intégration dans la sub-tab Market Data

Restructurer le layout de `SwapTab.tsx` sub-tab `market` :

```
┌─────────────────────────────────────────────────────────────┐
│ YIELD CURVES (spot / forward / par)  [toggle checkboxes]    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │              LineChart (recharts)                        │ │
│ │  3.5% ─────────────────── ● ● ● ● ● ● ● ●             │ │
│ │  3.0% ─────── ● ● ● ●                                  │ │
│ │  2.5% ── ●                                              │ │
│ │       3M 6M 1Y 2Y 3Y 5Y 7Y 10Y 15Y 20Y 30Y            │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌───────────────┐ ┌───────────────┐ ┌─────────────────────┐│
│ │ Money Market   │ │ EUR IRS Rates │ │ Discount Factors    ││
│ │ €STR: 3.65%   │ │ 2Y: 2.85%    │ │ AreaChart (df → 0)  ││
│ │ EURIBOR table  │ │ 5Y: 2.90%    │ │                     ││
│ │                │ │ 10Y: 3.05%   │ │                     ││
│ │                │ │ 30Y: 3.25%   │ │                     ││
│ └───────────────┘ └───────────────┘ └─────────────────────┘│
│                                                             │
│ ┌───────────────────────────┐ ┌───────────────────────────┐│
│ │ SPREADS (bp)              │ │ BUTTERFLIES (bp)          ││
│ │ 2s10s: +20bp  ▓▓▓▓▓      │ │ 2s5s10s: -8bp  ▓▓        ││
│ │ 2s30s: +40bp  ▓▓▓▓▓▓▓▓   │ │ 5s10s30s: +3bp ▓         ││
│ │ 5s30s: +35bp  ▓▓▓▓▓▓▓    │ │                           ││
│ └───────────────────────────┘ └───────────────────────────┘│
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ EUR Futures  │  Curve Analysis (existant)                │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Phase 3 — Moteur de pricing étendu

### 5.1 Backend — `apps/api/app/domains/rates_ird/structured_pricing.py`

```python
"""
Extended pricing engine for structured rate products.
Curve trades, butterflies, asset swap spreads, basis swaps.
"""

def price_curve_trade(
    short_tenor: str,
    long_tenor: str,
    notional: float,
    position: str,         # "steepener" | "flattener"
    snapshot: RateSnapshot,
) -> dict:
    """
    Curve trade (e.g. 2s10s steepener):
    - Steepener: pay short, receive long → profits if curve steepens
    - Flattener: receive short, pay long → profits if curve flattens

    Pricing: PV = notional_short × (par_short - entry_short) × annuity_short
           + notional_long × (entry_long - par_long) × annuity_long
    DV01-neutral: notional_long = notional × annuity_short / annuity_long
    """
    ...

def price_fly(
    wing1: str,
    body: str,
    wing2: str,
    notional: float,
    position: str,  # "buy_body" | "sell_body"
    snapshot: RateSnapshot,
) -> dict:
    """
    Butterfly (e.g. 2s5s10s):
    - Buy body: pay 2Y+10Y, receive 2×5Y → profits if fly richens
    - Sell body: receive 2Y+10Y, pay 2×5Y → profits if fly cheapens

    Pricing: notionals DV01-weighted.
    Level = body_rate - (wing1_rate + wing2_rate) / 2
    """
    ...

def price_asw(
    bond_yield: float,
    swap_rate: float,
    tenor: str,
    notional: float,
    snapshot: RateSnapshot,
) -> dict:
    """
    Asset Swap Spread:
    ASW = bond_yield - swap_rate (même maturité)
    PV ≈ notional × ASW × annuity
    """
    ...

def price_basis_swap(
    tenor: str,
    index1: str,  # "3M"
    index2: str,  # "6M"
    spread_bps: float,
    notional: float,
    snapshot: RateSnapshot,
) -> dict:
    """
    Basis swap (e.g. 3M vs 6M EURIBOR):
    One leg pays index1, other pays index2 + spread.
    PV ≈ notional × (market_basis - trade_basis) × annuity
    """
    ...
```

### 5.2 Nouveaux handlers

| Commande | Description |
|----------|-------------|
| `price_curve_trade` | Pricing d'un curve trade (spread) avec DV01 |
| `price_fly` | Pricing butterfly |
| `price_asw` | Pricing asset swap spread |
| `price_basis_swap` | Pricing basis swap |

### 5.3 Frontend — Nouveau sous-tab « Pricer » unifié

Remplacer les sous-tabs `irs` et `bond` séparés par un **pricer unifié** :

```
┌─────────────────────────────────────────────────────────────┐
│  PRODUCT TYPE:  [IRS] [OIS] [Curve] [Fly] [ASW] [Basis]    │
│                                                             │
│  ┌── Paramètres (dynamiques selon le type) ───────────────┐│
│  │ IRS:   Notional | Fixed Rate | Tenor | Freq | Position ││
│  │ Curve: Notional | Short | Long | Steepener/Flattener   ││
│  │ Fly:   Notional | Wing1 | Body | Wing2 | Buy/Sell body ││
│  │ ASW:   Notional | Bond Yield | Swap Rate | Tenor       ││
│  │ Basis: Notional | Tenor | Index1 | Index2 | Spread     ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  [PRICE]                                                    │
│                                                             │
│  ┌── Résultats ───────────────────────────────────────────┐│
│  │ PV: +€125,000 | Par Rate: 2.87% | DV01: €8,500        ││
│  │ Level: +22bp (pour curve/fly)                           ││
│  │ Annuity: 8.52Y | Notional adj: €11.7M (DV01-neutral)   ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  [ADD TO BOOK →]  (envoie directement dans le blotter)      │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Phase 4 — Blotter & P&L temps réel

### 6.1 Améliorations du blotter

#### Modèle de trade étendu (backend)

```python
# Champs additionnels pour SwapTrade
{
    "product_type": "IRS" | "OIS" | "curve" | "fly" | "asw" | "basis",
    "legs": [                       # Pour curve/fly : plusieurs legs
        {"tenor": "2Y", "position": "payer", "notional": 10_000_000, "fixed_rate": 2.85},
        {"tenor": "10Y", "position": "receiver", "notional": 11_700_000, "fixed_rate": 3.07},
    ],
    "entry_level": 22.0,           # spread/fly level at entry (bp)
    "current_level": 24.5,         # current level (bp)
    "entry_pv": 0.0,               # PV at entry
    "current_pv": 125_000.0,       # current PV (MTM)
    "unrealized_pnl": 125_000.0,   # current_pv - entry_pv
    "realized_pnl": 0.0,           # from closed legs
    "total_dv01": 8_500.0,
    "last_mtm_timestamp": 1709913600,
}
```

#### Interface blotter (frontend)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ BOOK: [My EUR Book ▼]    Total PV: €+345,000    DV01: €52,300    Trades: 8     │
│                                                                                 │
│ ┌─ Unrealized P&L ──┐ ┌─ Realized P&L ──┐ ┌─ Total P&L ──┐ ┌─ Last MTM ─────┐│
│ │   +€345,000        │ │   +€12,500      │ │   +€357,500   │ │ 14:32:15 (2s)  ││
│ │   ▲ +2.3%          │ │                  │ │               │ │ ● LIVE          ││
│ └────────────────────┘ └─────────────────┘ └───────────────┘ └────────────────┘│
│                                                                                 │
│ ┌───────────────────────────────────────────────────────────────────────────────┐│
│ │ Type    │ Product   │ Notional    │ Entry    │ Current  │ PV        │ DV01    ││
│ │─────────┼───────────┼─────────────┼──────────┼──────────┼───────────┼─────────││
│ │ IRS     │ 10Y Pay   │ 100M       │ 3.50%    │ 3.47%    │ +€250K   │ €85K    ││
│ │ Curve   │ 2s10s Stp │ 10M/11.7M  │ +22bp    │ +24.5bp  │ +€125K   │ €8.5K   ││
│ │ Fly     │ 2s5s10s   │ 5M DV01-n  │ -8bp     │ -6bp     │ +€42K    │ €4.2K   ││
│ │ ASW     │ DBR 2.5 34│ 20M        │ +15bp    │ +18bp    │ +€56K    │ €17K    ││
│ │ OIS     │ 1Y €STR   │ 50M        │ 3.65%    │ 3.63%    │ +€10K    │ €5K     ││
│ │─────────┼───────────┼─────────────┼──────────┼──────────┼───────────┼─────────││
│ │                                    TOTAL     │          │ +€345K   │ €52.3K  ││
│ └───────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│ ┌─ DV01 par tenor (bar chart) ────────────────────────────────────────────────┐ │
│ │  2Y ▓▓▓▓▓▓▓▓  -€8,500                                                      │ │
│ │  5Y ▓▓▓▓  €4,200                                                           │ │
│ │ 10Y ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  €85,000                                         │ │
│ │ 30Y ▓▓▓▓▓▓▓▓▓▓  €17,000                                                   │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 P&L temps réel — mécanisme

```
Frontend (useMarketData, 30s polling)
  │
  │ Nouveau snapshot → recalcul MTM automatique
  ▼
Backend: mtm_book_live(book_id, snapshot)
  │
  │ Pour chaque trade actif :
  │   1. Récupère le snapshot courant
  │   2. Reprice chaque leg avec les taux actuels
  │   3. Calcule unrealized_pnl = current_pv - entry_pv
  │   4. Met à jour last_mtm_timestamp
  ▼
Frontend : reçoit trades mis à jour → affiche P&L coloré
```

### 6.3 Couleurs P&L

```typescript
function pnlColor(value: number): string {
  if (value > 0) return '#22c55e';   // vert
  if (value < 0) return '#ef4444';   // rouge
  return colors.textMuted;            // gris
}
```

---

## 7. Découpage fichiers

### Backend — Nouveaux fichiers

```
apps/api/app/domains/rates_ird/
├── market_data_provider.py       # Phase 1 — Provider abstraction + adapters
├── structured_pricing.py         # Phase 3 — Curve, fly, ASW, basis pricing
├── pricing.py                    # Existant — enrichir avec helpers
├── swap_paper.py                 # Existant — étendre modèle trade
├── handlers.py                   # Existant — ajouter nouveaux handlers
├── ecb_sdw.py                    # Existant — inchangé
└── ...
```

### Frontend — Nouveaux fichiers

```
apps/web/src/app/
├── hooks/
│   └── useMarketData.ts                         # Phase 1 — Polling hook
├── services/swap/
│   └── swapService.ts                           # Existant — ajouter nouvelles fonctions
├── components/tabs/swap/
│   ├── SwapTab.tsx                               # Existant — restructurer layout
│   ├── charts/
│   │   ├── YieldCurveChart.tsx                   # Phase 2
│   │   ├── DiscountFactorChart.tsx               # Phase 2
│   │   ├── SpreadChart.tsx                       # Phase 2
│   │   └── RateTimeSeriesChart.tsx               # Phase 2
│   ├── panels/
│   │   ├── UnifiedPricerPanel.tsx                # Phase 3 — Remplace IRS+Bond
│   │   ├── EnhancedBlotterPanel.tsx              # Phase 4 — Remplace SwapPaperTradingPanel
│   │   ├── IRSPricerPanel.tsx                    # Existant — à déprécier
│   │   ├── BondPricerPanel.tsx                   # Existant — à déprécier
│   │   ├── SwapPaperTradingPanel.tsx             # Existant — à déprécier
│   │   ├── RatesBacktestPanel.tsx                # Existant — inchangé
│   │   └── RiskProjectionPanel.tsx               # Existant — inchangé
│   └── index.ts
```

---

## 8. Ordre d'implémentation

### Phase 1 — Market Data Provider (fondation) ⏱️ ~2-3 sessions

1. **Backend** : Créer `market_data_provider.py` avec `RateSnapshot`, `ECBAdapter`, `TemplateAdapter`
2. **Backend** : Ajouter handlers `get_live_rates`, `set_market_data_adapter`
3. **Frontend** : Créer `useMarketData` hook avec polling
4. **Frontend** : Brancher le hook dans `SwapTab.tsx` (remplacer `useCache` par `useMarketData`)
5. **Test** : Vérifier que les données se rafraîchissent à l'intervalle configuré

### Phase 2 — Courbes (visuel) ⏱️ ~1-2 sessions

1. **Frontend** : `YieldCurveChart` (recharts `LineChart`, 3 courbes)
2. **Frontend** : `DiscountFactorChart` (recharts `AreaChart`)
3. **Frontend** : `SpreadChart` (recharts `BarChart` horizontal)
4. **Frontend** : Restructurer layout Market Data sub-tab avec les charts
5. **Test** : Vérifier rendu avec données ECB réelles

### Phase 3 — Pricing étendu ⏱️ ~2-3 sessions

1. **Backend** : Créer `structured_pricing.py` (curve, fly, ASW, basis)
2. **Backend** : Ajouter handlers dans `handlers.py`
3. **Frontend** : Créer `UnifiedPricerPanel` avec sélecteur de produit
4. **Frontend** : Ajouter bouton « Add to book » qui envoie vers le blotter
5. **Test** : Pricer chaque type de produit et vérifier les résultats

### Phase 4 — Blotter temps réel ⏱️ ~2-3 sessions

1. **Backend** : Étendre modèle trade dans `swap_paper.py` (legs, product_type, pnl fields)
2. **Backend** : Ajouter `mtm_book_live` qui utilise le snapshot courant
3. **Frontend** : Créer `EnhancedBlotterPanel` avec P&L coloré et agrégation
4. **Frontend** : Auto-MTM via `useMarketData` (recalcul à chaque nouveau snapshot)
5. **Frontend** : DV01 par tenor bar chart
6. **Test** : Entrer des trades de chaque type, vérifier P&L temps réel

### Résumé des dépendances

```
Phase 1 (Market Data Provider)
    │
    ├──→ Phase 2 (Courbes) — utilise le snapshot du provider
    │
    └──→ Phase 3 (Pricing) — utilise le snapshot pour les taux courants
              │
              └──→ Phase 4 (Blotter) — utilise pricing + snapshot pour MTM auto
```

Phase 1 est le prérequis de tout. Phases 2 et 3 sont indépendantes entre elles. Phase 4 nécessite Phase 3.

---

## Notes d'implémentation

### Compatibilité Tauri ↔ Web

Le service `swapService.ts` utilise actuellement `import { invoke } from '@tauri-apps/api/core'`, ce qui échoue en mode web. L'app dispose d'un bridge HTTP via `POST /api/v1/bridge/invoke/{command}` qui fait le même travail. Il faudra s'assurer que les appels passent par le bridge HTTP (ce qui est déjà le pattern en cours de migration).

### Pas de dépendances externes supplémentaires

Tout se fait avec les librairies déjà installées :
- `recharts` pour les charts de courbes
- `lightweight-charts` pour les séries temporelles
- Pure Python côté backend (pas de QuantLib nécessaire pour les formules utilisées)

### Persistance

Le paper trading est actuellement in-memory (`swap_paper.py`). À terme, migrer vers SQLite (table `swap_books`, `swap_trades`) pour la persistance. Cela peut être fait en parallèle ou après les 4 phases.
