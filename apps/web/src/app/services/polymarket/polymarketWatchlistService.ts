// Polymarket Watchlist — works in both Tauri (Rust DB) and no-Rust (localStorage)

import { invoke } from '@tauri-apps/api/core';
import type { PolymarketMarket } from './polymarketApiService';

const STORAGE_KEY = 'polymarket_watchlist';

export interface PolymarketWatchlistEntry {
  marketId: string;
  question: string;
  outcomePrices?: string[];
  volume?: string;
  slug?: string;
  conditionId?: string;
  clobTokenIds?: string[];
  addedAt: string;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

function normalizePriceArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x: unknown) => (typeof x === 'number' ? String(x) : String(x ?? '')));
  }
  if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map((x: unknown) => (typeof x === 'number' ? String(x) : String(x ?? ''))) : [];
    } catch { /* ignore */ }
  }
  return [];
}

function parseEntry(e: Record<string, unknown>): PolymarketWatchlistEntry {
  const rawPrices = e.outcomePrices ?? e.outcome_prices;
  const outcomePrices = normalizePriceArray(rawPrices);
  let clobTokenIds: string[] | undefined;
  if (Array.isArray(e.clobTokenIds)) clobTokenIds = e.clobTokenIds as string[];
  else if (Array.isArray(e.clob_token_ids)) clobTokenIds = e.clob_token_ids as string[];
  else if (typeof e.clobTokenIds === 'string' && e.clobTokenIds) {
    try { clobTokenIds = JSON.parse(e.clobTokenIds) as string[]; } catch { /* ignore */ }
  } else if (typeof e.clob_token_ids === 'string' && e.clob_token_ids) {
    try { clobTokenIds = JSON.parse(e.clob_token_ids) as string[]; } catch { /* ignore */ }
  }
  return {
    marketId: String(e.marketId ?? e.market_id ?? ''),
    question: String(e.question ?? ''),
    outcomePrices: outcomePrices.length ? outcomePrices : undefined,
    volume: e.volume != null ? String(e.volume) : undefined,
    slug: e.slug != null ? String(e.slug) : undefined,
    conditionId: e.conditionId != null ? String(e.conditionId) : (e.condition_id != null ? String(e.condition_id) : undefined),
    clobTokenIds,
    addedAt: String(e.addedAt ?? e.added_at ?? new Date().toISOString()),
  };
}

async function getFromRust(): Promise<PolymarketWatchlistEntry[]> {
  try {
    const raw = await invoke<unknown>('db_get_polymarket_watchlist');
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((e: Record<string, unknown>) => parseEntry(e));
  } catch {
    return [];
  }
}

async function addInRust(entry: PolymarketWatchlistEntry): Promise<void> {
  await invoke('db_add_polymarket_watchlist_entry', {
    market_id: entry.marketId,
    question: entry.question,
    outcome_prices: entry.outcomePrices?.length ? JSON.stringify(entry.outcomePrices) : null,
    volume: entry.volume ?? null,
    slug: entry.slug ?? null,
    condition_id: entry.conditionId ?? null,
    clob_token_ids: entry.clobTokenIds?.length ? JSON.stringify(entry.clobTokenIds) : null,
  });
}

async function removeInRust(marketId: string): Promise<void> {
  await invoke('db_remove_polymarket_watchlist_entry', { market_id: marketId });
}

function getFromStorage(): PolymarketWatchlistEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(entries: PolymarketWatchlistEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

function marketToEntry(m: PolymarketMarket): PolymarketWatchlistEntry {
  const raw = (m as Record<string, unknown>).outcomePrices
    ?? (m as Record<string, unknown>).outcome_prices;
  const outcomePrices = normalizePriceArray(raw);
  let tokenIds = m.clobTokenIds ?? (m as unknown as { clob_token_ids?: string[] }).clob_token_ids;
  if (!Array.isArray(tokenIds)) tokenIds = undefined;
  return {
    marketId: m.id,
    question: m.question ?? (m as unknown as { question?: string }).question ?? '',
    outcomePrices: outcomePrices.length ? outcomePrices : undefined,
    volume: m.volume != null ? String(m.volume) : (m as unknown as { volume?: string }).volume,
    slug: m.slug,
    conditionId: m.conditionId ?? (m as unknown as { condition_id?: string }).condition_id,
    clobTokenIds: tokenIds,
    addedAt: new Date().toISOString(),
  };
}

export const polymarketWatchlistService = {
  async getWatchlist(): Promise<PolymarketWatchlistEntry[]> {
    if (isTauri()) return getFromRust();
    return getFromStorage();
  },

  async addToWatchlist(market: PolymarketMarket): Promise<void> {
    const entry = marketToEntry(market);
    if (isTauri()) {
      await addInRust(entry);
      return;
    }
    const list = getFromStorage();
    if (list.some(e => e.marketId === entry.marketId)) return;
    list.unshift(entry);
    saveToStorage(list);
  },

  async removeFromWatchlist(marketId: string): Promise<void> {
    if (isTauri()) {
      await removeInRust(marketId);
      return;
    }
    const list = getFromStorage().filter(e => e.marketId !== marketId);
    saveToStorage(list);
  },

  async isInWatchlist(marketId: string): Promise<boolean> {
    const list = await this.getWatchlist();
    return list.some(e => e.marketId === marketId);
  },
};
