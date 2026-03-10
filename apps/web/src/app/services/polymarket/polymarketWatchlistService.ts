/**
 * Polymarket Multi-Watchlist Service
 * Supports multiple named watchlists stored in localStorage.
 */
import type { PolymarketMarket } from './polymarketApiService';
import { bridgeInvoke } from '../../../shims/platform-bridge';

const STORAGE_KEY = 'polymarket_watchlists_v2';
const LEGACY_KEY = 'polymarket_watchlist';

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

export interface Watchlist {
  id: string;
  name: string;
  entries: PolymarketWatchlistEntry[];
  createdAt: string;
}

function normalizePriceArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x: unknown) => String(x ?? ''));
  if (typeof raw === 'string' && raw) {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map((x: unknown) => String(x ?? '')) : []; } catch { /* */ }
  }
  return [];
}

function marketToEntry(m: PolymarketMarket): PolymarketWatchlistEntry {
  const raw = (m as Record<string, unknown>).outcomePrices ?? (m as Record<string, unknown>).outcome_prices;
  const outcomePrices = normalizePriceArray(raw);
  let tokenIds = m.clobTokenIds ?? (m as unknown as { clob_token_ids?: string[] }).clob_token_ids;
  if (!Array.isArray(tokenIds)) tokenIds = undefined;
  return {
    marketId: m.id,
    question: m.question ?? '',
    outcomePrices: outcomePrices.length ? outcomePrices : undefined,
    volume: m.volume != null ? String(m.volume) : undefined,
    slug: m.slug,
    conditionId: m.conditionId ?? (m as unknown as { condition_id?: string }).condition_id,
    clobTokenIds: tokenIds,
    addedAt: new Date().toISOString(),
  };
}

function loadAll(): Watchlist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  // Migrate legacy single watchlist
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const entries: PolymarketWatchlistEntry[] = JSON.parse(legacy);
      if (Array.isArray(entries) && entries.length > 0) {
        const wl: Watchlist = { id: 'default', name: 'Default', entries, createdAt: new Date().toISOString() };
        saveAll([wl]);
        return [wl];
      }
    }
  } catch { /* */ }
  return [];
}

function saveAll(lists: Watchlist[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lists)); } catch { /* */ }
  // Also persist via backend settings for durability
  try { bridgeInvoke('db_save_setting', { key: STORAGE_KEY, value: JSON.stringify(lists), category: 'polymarket' }).catch(() => {}); } catch { /* */ }
}

export const polymarketWatchlistService = {
  /** Get all watchlists */
  getAll(): Watchlist[] {
    return loadAll();
  },

  /** Get a single watchlist by ID, or the first one */
  get(id?: string): Watchlist | null {
    const all = loadAll();
    if (id) return all.find(w => w.id === id) ?? null;
    return all[0] ?? null;
  },

  /** Create a new watchlist */
  create(name: string): Watchlist {
    const all = loadAll();
    const wl: Watchlist = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      entries: [],
      createdAt: new Date().toISOString(),
    };
    all.push(wl);
    saveAll(all);
    return wl;
  },

  /** Rename a watchlist */
  rename(id: string, name: string) {
    const all = loadAll();
    const wl = all.find(w => w.id === id);
    if (wl) { wl.name = name; saveAll(all); }
  },

  /** Delete a watchlist */
  delete(id: string) {
    const all = loadAll().filter(w => w.id !== id);
    saveAll(all);
  },

  /** Add market to a specific watchlist */
  addToWatchlist(market: PolymarketMarket, watchlistId: string) {
    const all = loadAll();
    const wl = all.find(w => w.id === watchlistId);
    if (!wl) return;
    const entry = marketToEntry(market);
    if (wl.entries.some(e => e.marketId === entry.marketId)) return;
    wl.entries.unshift(entry);
    saveAll(all);
  },

  /** Remove market from a watchlist */
  removeFromWatchlist(marketId: string, watchlistId: string) {
    const all = loadAll();
    const wl = all.find(w => w.id === watchlistId);
    if (!wl) return;
    wl.entries = wl.entries.filter(e => e.marketId !== marketId);
    saveAll(all);
  },

  /** Check if a market is in any watchlist */
  isInAnyWatchlist(marketId: string): boolean {
    return loadAll().some(wl => wl.entries.some(e => e.marketId === marketId));
  },

  /** Get all entries across all watchlists (deduplicated) */
  getAllEntries(): PolymarketWatchlistEntry[] {
    const seen = new Set<string>();
    const result: PolymarketWatchlistEntry[] = [];
    for (const wl of loadAll()) {
      for (const e of wl.entries) {
        if (!seen.has(e.marketId)) { seen.add(e.marketId); result.push(e); }
      }
    }
    return result;
  },

  // Legacy compat — returns all entries from first watchlist or all
  async getWatchlist(): Promise<PolymarketWatchlistEntry[]> {
    return this.getAllEntries();
  },

  async addToWatchlistLegacy(market: PolymarketMarket): Promise<void> {
    const all = loadAll();
    if (all.length === 0) { this.create('Default'); }
    this.addToWatchlist(market, loadAll()[0].id);
  },

  async removeFromWatchlistLegacy(marketId: string): Promise<void> {
    const all = loadAll();
    for (const wl of all) {
      wl.entries = wl.entries.filter(e => e.marketId !== marketId);
    }
    saveAll(all);
  },

  async isInWatchlist(marketId: string): Promise<boolean> {
    return this.isInAnyWatchlist(marketId);
  },
};
