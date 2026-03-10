/**
 * Polymarket Insider Detection Service
 *
 * Uses Gamma public-profile endpoint for account age (createdAt).
 * Uses Data API positions + closed-positions for total exposure and distinct market count.
 *
 * Flags as insider when 2+ criteria met:
 *   - Position size >= threshold (default $2000 currentValue USDC)
 *   - Account age < 3 months (from public-profile createdAt)
 *   - Active on < 5 distinct markets (open + closed combined)
 */
import polymarketApiService from './polymarketApiService';
import type { PolymarketMarket, PublicProfile } from './polymarketApiTypes';
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
  name: string;
  profileImage: string;
  xUsername: string;
  verifiedBadge: boolean;
  accountCreatedAt: string | null;
  accountAgeDays: number | null;
  totalPositionValue: number;
  distinctMarkets: number;
  openMarkets: number;
  closedMarkets: number;
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
  private profileCache: Map<string, PublicProfile> = new Map();

  get scanning() { return this._scanning; }

  onChange(cb: () => void) { this._callbacks.add(cb); return () => this._callbacks.delete(cb); }
  private notify() { this._callbacks.forEach(cb => cb()); }

  async loadTags(): Promise<InsiderTag[]> {
    if (this._loaded) return this.tags;
    try {
      const val = await bridgeInvoke<string | null>('db_get_setting', { key: SETTINGS_KEY });
      if (val && typeof val === 'string') this.tags = JSON.parse(val);
    } catch {
      try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) this.tags = JSON.parse(raw); } catch { /* */ }
    }
    this._loaded = true;
    return this.tags;
  }

  async saveTags() {
    try {
      await bridgeInvoke('db_save_setting', { key: SETTINGS_KEY, value: JSON.stringify(this.tags), category: 'polymarket' });
    } catch {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.tags)); } catch { /* */ }
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
    for (const tag of this.tags.filter(t => t.enabled)) {
      try {
        this.results.set(tag.id, await this.scanTag(tag));
      } catch (err) {
        this.results.set(tag.id, { tag, markets: [], insiders: [], scannedAt: Date.now(), error: String(err) });
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
        if (!seen.has(insider.wallet)) { seen.add(insider.wallet); this.allInsiders.push(insider); }
      }
    }
    this.allInsiders.sort((a, b) => b.totalPositionValue - a.totalPositionValue);
  }

  private async fetchProfile(wallet: string): Promise<PublicProfile | null> {
    const cached = this.profileCache.get(wallet);
    if (cached) return cached;
    try {
      const profile = await polymarketApiService.getPublicProfile(wallet);
      this.profileCache.set(wallet, profile);
      return profile;
    } catch {
      return null;
    }
  }

  private async scanTag(tag: InsiderTag): Promise<InsiderScanResult> {
    const markets: PolymarketMarket[] = [];
    for (const keyword of tag.keywords) {
      try {
        const sr = await polymarketApiService.search(keyword.trim());
        for (const m of sr.markets) {
          if (!markets.some(x => x.id === m.id)) markets.push(m);
        }
      } catch { /* skip */ }
    }
    if (markets.length === 0) return { tag, markets: [], insiders: [], scannedAt: Date.now() };

    const insiders: FlaggedInsider[] = [];
    const processedWallets = new Set<string>();

    for (const market of markets.slice(0, 10)) {
      const condId = market.conditionId;
      if (!condId) continue;

      let holdersData;
      try { holdersData = await polymarketApiService.getTopHolders(condId, 30); } catch { continue; }
      if (!holdersData?.holders) continue;

      for (const holder of holdersData.holders) {
        if (processedWallets.has(holder.proxyWallet)) continue;
        if (holder.amount < POSITION_THRESHOLD) continue;
        processedWallets.add(holder.proxyWallet);

        try {
          // Fetch open + closed positions to count distinct markets
          const [openPositions, closedPositions] = await Promise.all([
            polymarketApiService.getUserPositions(holder.proxyWallet, { limit: 200 }).catch(() => []),
            polymarketApiService.getClosedPositions(holder.proxyWallet, { limit: 200 }).catch(() => []),
          ]);

          // Distinct markets = union of conditionIds from open + closed
          const allConditionIds = new Set<string>();
          openPositions.forEach(p => allConditionIds.add(p.conditionId));
          closedPositions.forEach(p => allConditionIds.add(p.conditionId));
          const distinctMarkets = allConditionIds.size;
          const openMarkets = new Set(openPositions.map(p => p.conditionId)).size;
          const closedMarkets = new Set(closedPositions.map(p => p.conditionId)).size;

          // Total position value = sum of currentValue (USDC) on open positions
          const totalValue = openPositions.reduce((s, p) => s + (p.currentValue || 0), 0);

          // Account age from public-profile createdAt
          let accountAgeDays: number | null = null;
          let accountCreatedAt: string | null = null;
          let pseudonym = holder.pseudonym || holder.name || '';
          let profileImage = holder.profileImage || holder.profileImageOptimized || '';
          let xUsername = '';
          let verifiedBadge = false;
          let displayName = '';

          const profile = await this.fetchProfile(holder.proxyWallet);
          if (profile) {
            accountCreatedAt = profile.createdAt;
            if (profile.createdAt) {
              const created = new Date(profile.createdAt);
              accountAgeDays = Math.floor((Date.now() - created.getTime()) / (86400 * 1000));
            }
            pseudonym = profile.pseudonym || pseudonym;
            displayName = profile.name || '';
            profileImage = profile.profileImage || profileImage;
            xUsername = profile.xUsername || '';
            verifiedBadge = profile.verifiedBadge || false;
          }

          // Check insider criteria
          const reasons: string[] = [];
          if (totalValue >= POSITION_THRESHOLD) reasons.push(`Position ≥ $${POSITION_THRESHOLD.toLocaleString()}`);
          if (accountAgeDays !== null && accountAgeDays < ACCOUNT_AGE_DAYS) reasons.push(`Account ${accountAgeDays}d old (< ${ACCOUNT_AGE_DAYS}d)`);
          if (distinctMarkets <= MAX_DISTINCT_MARKETS) reasons.push(`${distinctMarkets} markets (≤ ${MAX_DISTINCT_MARKETS})`);

          const isInsider = reasons.length >= 2 && (
            (accountAgeDays !== null && accountAgeDays < ACCOUNT_AGE_DAYS) ||
            distinctMarkets <= MAX_DISTINCT_MARKETS
          );

          if (isInsider) {
            const flaggedMarkets = openPositions
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
              pseudonym,
              name: displayName,
              profileImage,
              xUsername,
              verifiedBadge,
              accountCreatedAt,
              accountAgeDays,
              totalPositionValue: totalValue,
              distinctMarkets,
              openMarkets,
              closedMarkets,
              flaggedMarkets,
              reasons,
              detectedAt: Date.now(),
            });
          }
        } catch { /* skip wallet */ }
      }
    }

    return { tag, markets, insiders, scannedAt: Date.now() };
  }
}

export const insiderService = new InsiderService();
