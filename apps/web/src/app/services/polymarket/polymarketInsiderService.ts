/**
 * Polymarket Insider Detection Service
 *
 * Scans markets matching user-defined tags, finds large holders,
 * and flags potential insiders based on:
 *   - Position size > threshold (default €2000)
 *   - Account age < 3 months
 *   - Active on < 5 distinct markets
 */
import polymarketApiService from './polymarketApiService';
import type { PolymarketMarket, PolymarketHolder, UserPosition } from './polymarketApiTypes';
import { bridgeInvoke } from '../../../shims/platform-bridge';

export interface InsiderTag {
  id: string;
  label: string;
  keywords: string[];
  enabled: boolean;
  createdAt: string;
}

export interface FlaggedInsider {
  wallet: string;
  pseudonym: string;
  profileImage: string;
  totalPositionValue: number;
  distinctMarkets: number;
  accountAgeDays: number | null;
  flaggedMarkets: Array<{
    marketId: string;
    question: string;
    outcome: string;
    positionSize: number;
    price: number;
  }>;
  reasons: string[];
  detectedAt: number;
}

export interface InsiderScanResult {
  tag: InsiderTag;
  markets: PolymarketMarket[];
  insiders: FlaggedInsider[];
  scannedAt: number;
  error?: string;
}

const SETTINGS_KEY = 'polymarket_insider_tags';
const POSITION_THRESHOLD = 2000;
const ACCOUNT_AGE_DAYS = 90;
const MAX_DISTINCT_MARKETS = 5;
const SCAN_INTERVAL = 10 * 60 * 1000;

class InsiderService {
  private tags: InsiderTag[] = [];
  private results: Map<string, InsiderScanResult> = new Map();
  private allInsiders: FlaggedInsider[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private _scanning = false;
  private _callbacks: Set<() => void> = new Set();
  private _loaded = false;

  get scanning() { return this._scanning; }

  onChange(cb: () => void) { this._callbacks.add(cb); return () => this._callbacks.delete(cb); }
  private notify() { this._callbacks.forEach(cb => cb()); }

  async loadTags(): Promise<InsiderTag[]> {
    if (this._loaded) return this.tags;
    try {
      const val = await bridgeInvoke<string | null>('db_get_setting', { key: SETTINGS_KEY });
      if (val && typeof val === 'string') {
        this.tags = JSON.parse(val);
      }
    } catch {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) this.tags = JSON.parse(raw);
      } catch { /* ignore */ }
    }
    this._loaded = true;
    return this.tags;
  }

  async saveTags() {
    try {
      await bridgeInvoke('db_save_setting', { key: SETTINGS_KEY, value: JSON.stringify(this.tags), category: 'polymarket' });
    } catch {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.tags)); } catch { /* ignore */ }
    }
  }

  async addTag(label: string, keywords: string[]): Promise<InsiderTag> {
    const tag: InsiderTag = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      label,
      keywords: keywords.filter(k => k.trim()),
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    this.tags.push(tag);
    await this.saveTags();
    this.notify();
    return tag;
  }

  async removeTag(tagId: string) {
    this.tags = this.tags.filter(t => t.id !== tagId);
    this.results.delete(tagId);
    await this.saveTags();
    this.rebuildInsiders();
    this.notify();
  }

  async toggleTag(tagId: string) {
    const tag = this.tags.find(t => t.id === tagId);
    if (tag) { tag.enabled = !tag.enabled; await this.saveTags(); this.notify(); }
  }

  getTags(): InsiderTag[] { return [...this.tags]; }
  getResults(): Map<string, InsiderScanResult> { return this.results; }
  getAllInsiders(): FlaggedInsider[] { return [...this.allInsiders]; }

  startAutoScan() {
    if (this.intervalId) return;
    this.scan();
    this.intervalId = setInterval(() => this.scan(), SCAN_INTERVAL);
  }

  stopAutoScan() {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  async scan() {
    if (this._scanning) return;
    this._scanning = true;
    this.notify();

    await this.loadTags();
    const activeTags = this.tags.filter(t => t.enabled);

    for (const tag of activeTags) {
      try {
        const result = await this.scanTag(tag);
        this.results.set(tag.id, result);
      } catch (err) {
        this.results.set(tag.id, {
          tag, markets: [], insiders: [],
          scannedAt: Date.now(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.rebuildInsiders();
    this._scanning = false;
    this.notify();
  }

  private rebuildInsiders() {
    const seen = new Set<string>();
    this.allInsiders = [];
    for (const result of this.results.values()) {
      for (const insider of result.insiders) {
        if (!seen.has(insider.wallet)) {
          seen.add(insider.wallet);
          this.allInsiders.push(insider);
        }
      }
    }
    this.allInsiders.sort((a, b) => b.totalPositionValue - a.totalPositionValue);
  }

  private async scanTag(tag: InsiderTag): Promise<InsiderScanResult> {
    const markets: PolymarketMarket[] = [];

    for (const keyword of tag.keywords) {
      try {
        const searchResult = await polymarketApiService.search(keyword.trim());
        for (const m of searchResult.markets) {
          if (!markets.some(x => x.id === m.id)) markets.push(m);
        }
      } catch { /* skip keyword */ }
    }

    if (markets.length === 0) {
      return { tag, markets: [], insiders: [], scannedAt: Date.now() };
    }

    const insiders: FlaggedInsider[] = [];
    const processedWallets = new Set<string>();

    for (const market of markets.slice(0, 10)) {
      const condId = market.conditionId;
      if (!condId) continue;

      try {
        const holdersData = await polymarketApiService.getTopHolders(condId, 30);
        if (!holdersData?.holders) continue;

        for (const holder of holdersData.holders) {
          if (processedWallets.has(holder.proxyWallet)) continue;
          if (holder.amount < POSITION_THRESHOLD) continue;

          processedWallets.add(holder.proxyWallet);

          try {
            const positions = await polymarketApiService.getUserPositions(holder.proxyWallet, { limit: 50 });
            const distinctMarkets = new Set(positions.map(p => p.conditionId)).size;
            const totalValue = positions.reduce((s, p) => s + p.currentValue, 0);

            let accountAgeDays: number | null = null;
            try {
              const activity = await polymarketApiService.getUserActivity(holder.proxyWallet, { limit: 1, type: 'BUY' });
              if (activity.length > 0) {
                const firstTs = activity[activity.length - 1]?.timestamp || activity[0]?.timestamp;
                if (firstTs) accountAgeDays = Math.floor((Date.now() / 1000 - firstTs) / 86400);
              }
            } catch { /* skip */ }

            const reasons: string[] = [];
            if (holder.amount >= POSITION_THRESHOLD) reasons.push(`Position ≥ €${POSITION_THRESHOLD}`);
            if (accountAgeDays !== null && accountAgeDays < ACCOUNT_AGE_DAYS) reasons.push(`Account < ${ACCOUNT_AGE_DAYS}d (${accountAgeDays}d)`);
            if (distinctMarkets <= MAX_DISTINCT_MARKETS) reasons.push(`≤ ${MAX_DISTINCT_MARKETS} markets (${distinctMarkets})`);

            const isInsider = reasons.length >= 2 && (
              (accountAgeDays !== null && accountAgeDays < ACCOUNT_AGE_DAYS) ||
              distinctMarkets <= MAX_DISTINCT_MARKETS
            );

            if (isInsider) {
              const flaggedMarkets = positions
                .filter(p => p.currentValue >= POSITION_THRESHOLD)
                .map(p => ({
                  marketId: p.conditionId,
                  question: p.title,
                  outcome: p.outcome,
                  positionSize: p.currentValue,
                  price: p.curPrice,
                }));

              insiders.push({
                wallet: holder.proxyWallet,
                pseudonym: holder.pseudonym || holder.name || holder.proxyWallet.slice(0, 10) + '...',
                profileImage: holder.profileImage || holder.profileImageOptimized || '',
                totalPositionValue: totalValue,
                distinctMarkets,
                accountAgeDays,
                flaggedMarkets,
                reasons,
                detectedAt: Date.now(),
              });
            }
          } catch { /* skip wallet */ }
        }
      } catch { /* skip market */ }
    }

    return { tag, markets, insiders, scannedAt: Date.now() };
  }
}

export const insiderService = new InsiderService();
