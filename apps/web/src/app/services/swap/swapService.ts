/**
 * SWAP tab service — EUR rates & IRD (€STR, EURIBOR, yield curve, IRS, futures).
 * Calls backend get_swap_tab_snapshot and individual commands.
 */
import { invoke } from '@tauri-apps/api/core';

export interface SwapTabSnapshot {
  estr: { rate: number | null; series: Array<{ period: string; value: number }> };
  euribor: Record<string, number>;
  yield_curve_spot: Array<{ maturity: string; value: number }>;
  yield_curve_forward: Array<{ maturity: string; value: number }>;
  yield_curve_par: Array<{ maturity: string; value: number }>;
  eur_irs_rates: Array<{ tenor: string; rate: number }>;
  eur_futures: Array<{
    symbol: string;
    name: string;
    price: number;
    change: number;
    change_percent: number;
    timestamp: number;
  }>;
  curve_analysis: {
    spread_2s10s?: number;
    spread_2s30s?: number;
    inverted_2s10s?: boolean;
  };
}

export interface SwapTabSnapshotResponse {
  success: boolean;
  data?: SwapTabSnapshot;
  error?: string;
}

export async function getSwapTabSnapshot(): Promise<SwapTabSnapshot | null> {
  try {
    const result = await invoke<SwapTabSnapshotResponse>('get_swap_tab_snapshot', {});
    if (result?.success && result.data) {
      return result.data;
    }
    return null;
  } catch (err) {
    console.error('[swapService] get_swap_tab_snapshot failed:', err);
    return null;
  }
}

// ─── Pricing ─────────────────────────────────────────────────────────────
export interface PriceIRSResult {
  pv: number;
  par_rate: number;
  fixed_pv: number;
  float_pv: number;
  dv01: number;
  pv01: number;
  annuity: number;
}

export async function priceIRS(args: {
  notional: number;
  fixed_rate: number;
  tenor_years: number;
  pay_freq: number;
  position: string;
  yield_curve?: Array<{ maturity: string; value: number }>;
  discount_curve?: Array<[number, number]>;
}): Promise<PriceIRSResult | null> {
  try {
    const result = await invoke<{ success: boolean; data?: PriceIRSResult }>('price_irs', args);
    return result?.success && result.data ? result.data : null;
  } catch (err) {
    console.error('[swapService] price_irs failed:', err);
    return null;
  }
}

export interface PriceBondResult {
  clean_price: number;
  dirty_price: number;
  macaulay_duration: number;
  modified_duration: number;
  dv01: number;
  convexity: number;
}

export async function priceBond(args: {
  face: number;
  coupon_rate: number;
  yield_to_maturity: number;
  tenor_years: number;
  pay_freq: number;
}): Promise<PriceBondResult | null> {
  try {
    const result = await invoke<{ success: boolean; data?: PriceBondResult }>('price_bond', args);
    return result?.success && result.data ? result.data : null;
  } catch (err) {
    console.error('[swapService] price_bond failed:', err);
    return null;
  }
}

export async function buildDiscountCurve(yield_curve: Array<{ maturity: string; value: number }>): Promise<Array<[number, number]> | null> {
  try {
    const result = await invoke<{ success: boolean; data?: Array<[number, number]> }>('build_discount_curve', { yield_curve });
    return result?.success && result.data ? result.data : null;
  } catch (err) {
    console.error('[swapService] build_discount_curve failed:', err);
    return null;
  }
}

// ─── Swap paper trading ───────────────────────────────────────────────────
export interface SwapBook {
  id: string;
  name: string;
  currency: string;
  created_at: string;
}

export interface SwapTrade {
  id: string;
  portfolio_id: string;
  type: string;
  position: string;
  notional: number;
  fixed_rate: number;
  tenor_years: number;
  pay_freq: number;
  trade_date: string;
  maturity_date: string;
  entry_par_rate: number;
  current_pv: number;
  dv01: number;
  status: string;
}

export async function swapPtCreateBook(args: { name: string; currency?: string }): Promise<SwapBook | null> {
  try {
    const result = await invoke<{ success: boolean; data?: SwapBook }>('swap_pt_create_book', args);
    return result?.success && result.data ? result.data : null;
  } catch (err) {
    console.error('[swapService] swap_pt_create_book failed:', err);
    return null;
  }
}

export async function swapPtListBooks(): Promise<SwapBook[]> {
  try {
    const result = await invoke<{ success: boolean; data?: SwapBook[] }>('swap_pt_list_books', {});
    return result?.success && Array.isArray(result.data) ? result.data : [];
  } catch (err) {
    console.error('[swapService] swap_pt_list_books failed:', err);
    return [];
  }
}

export async function swapPtEnterTrade(args: {
  book_id: string;
  type?: string;
  position?: string;
  notional: number;
  fixed_rate: number;
  tenor_years: number;
  pay_freq: number;
}): Promise<SwapTrade | null> {
  try {
    const result = await invoke<{ success: boolean; data?: SwapTrade; error?: string }>('swap_pt_enter_trade', args);
    if (result?.success && result.data) return result.data;
    return null;
  } catch (err) {
    console.error('[swapService] swap_pt_enter_trade failed:', err);
    return null;
  }
}

export async function swapPtCloseTrade(trade_id: string): Promise<SwapTrade | null> {
  try {
    const result = await invoke<{ success: boolean; data?: SwapTrade; error?: string }>('swap_pt_close_trade', { trade_id });
    return result?.success && result.data ? result.data : null;
  } catch (err) {
    console.error('[swapService] swap_pt_close_trade failed:', err);
    return null;
  }
}

export async function swapPtGetTrades(book_id: string): Promise<SwapTrade[]> {
  try {
    const result = await invoke<{ success: boolean; data?: SwapTrade[] }>('swap_pt_get_trades', { book_id });
    return result?.success && Array.isArray(result.data) ? result.data : [];
  } catch (err) {
    console.error('[swapService] swap_pt_get_trades failed:', err);
    return [];
  }
}

export async function swapPtMtmBook(book_id: string): Promise<SwapTrade[]> {
  try {
    const result = await invoke<{ success: boolean; data?: SwapTrade[] }>('swap_pt_mtm_book', { book_id });
    return result?.success && Array.isArray(result.data) ? result.data : [];
  } catch (err) {
    console.error('[swapService] swap_pt_mtm_book failed:', err);
    return [];
  }
}

export async function swapPtGetRisk(book_id: string): Promise<{ total_dv01: number; total_pv01: number; by_tenor: Record<string, number>; trades_count: number } | null> {
  try {
    const result = await invoke<{ success: boolean; data?: { total_dv01: number; total_pv01: number; by_tenor: Record<string, number>; trades_count: number } }>('swap_pt_get_risk', { book_id });
    return result?.success && result.data ? result.data : null;
  } catch (err) {
    console.error('[swapService] swap_pt_get_risk failed:', err);
    return null;
  }
}

// ─── Rates backtest ──────────────────────────────────────────────────────
export interface RatesBacktestResult {
  trades: Array<{ entry_date: string; exit_date: string; position: string; entry_spread: number; exit_spread: number; pnl: number }>;
  equity_curve: Array<{ date: string; pnl: number; cumulative: number }>;
  stats: { total_trades: number; win_rate: number; total_pnl: number; max_drawdown: number; sharpe: number };
}

export async function backtestRatesStrategy(args: {
  strategy: string;
  instrument: string;
  start_date?: string;
  end_date?: string;
  entry_threshold: number;
  exit_threshold: number;
  notional: number;
}): Promise<RatesBacktestResult | null> {
  try {
    const result = await invoke<{ success: boolean; data?: RatesBacktestResult }>('backtest_rates_strategy', args);
    return result?.success && result.data ? result.data : null;
  } catch (err) {
    console.error('[swapService] backtest_rates_strategy failed:', err);
    return null;
  }
}

export interface RatesHistoryResult {
  series: Record<string, Array<{ date: string; value: number }>>;
  spread: Array<{ date: string; value: number }>;
  instrument: string;
}

export async function getRatesHistory(args: {
  instrument?: string;
  start_date?: string;
  end_date?: string;
  last_n?: number;
}): Promise<RatesHistoryResult | null> {
  try {
    const result = await invoke<{ success: boolean; data?: RatesHistoryResult }>('get_rates_history', args);
    return result?.success && result.data ? result.data : null;
  } catch (err) {
    console.error('[swapService] get_rates_history failed:', err);
    return null;
  }
}

// ─── Risk projection ─────────────────────────────────────────────────────
export interface ComputeRiskProjectionArgs {
  curve_history: Array<Record<string, string | number>>;
  pillars: string[];
  technique: 'pca' | 'ols' | 'ridge' | 'linear_interp';
}

export interface ComputeRiskProjectionResult {
  success: boolean;
  error?: string;
  projection_matrix?: Record<string, number[]>;
  pillars?: string[];
  tenors?: string[];
  r2_scores?: Record<string, number>;
  residuals?: Record<string, number[]>;
  explained_variance?: number[];
}

export async function computeRiskProjection(args: ComputeRiskProjectionArgs): Promise<ComputeRiskProjectionResult | null> {
  try {
    const result = await invoke<ComputeRiskProjectionResult>('compute_risk_projection', args);
    return result ?? null;
  } catch (err) {
    console.error('[swapService] compute_risk_projection failed:', err);
    return null;
  }
}

export interface ProjectBookPnlArgs {
  by_tenor?: Record<string, number>;
  book_id?: string;
  projection_matrix: Record<string, number[]>;
  pillars: string[];
  rate_shocks_bps: Record<string, number>;
}

export interface ProjectBookPnlResult {
  success: boolean;
  error?: string;
  projected_dv01_by_pillar?: Record<string, number>;
  rate_shocks_bps?: Record<string, number>;
  pnl?: number;
}

export async function projectBookPnl(args: ProjectBookPnlArgs): Promise<ProjectBookPnlResult | null> {
  try {
    const result = await invoke<ProjectBookPnlResult>('project_book_pnl', args);
    return result ?? null;
  } catch (err) {
    console.error('[swapService] project_book_pnl failed:', err);
    return null;
  }
}
