/**
 * Polymarket Watchlist Monitor — polls live prices for watchlist entries,
 * computes multi-timeframe deltas, and triggers alerts on large moves.
 *
 * Uses Gamma API (via slug) for live prices — more reliable than CLOB midpoint.
 * Uses CLOB prices-history only for delta calculation, with proper error handling.
 */
import polymarketApiService from './polymarketApiService';
import { polymarketWatchlistService, type PolymarketWatchlistEntry } from './polymarketWatchlistService';

export interface WatchlistLiveData {
  marketId: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  delta1h: number | null;
  delta1d: number | null;
  delta1w: number | null;
  lastUpdate: number;
}

export interface WatchlistAlert {
  id: string;
  marketId: string;
  question: string;
  type: 'spike_up' | 'spike_down' | 'large_move';
  message: string;
  oldPrice: number;
  newPrice: number;
  deltaBps: number;
  timestamp: number;
  read: boolean;
}

type AlertCallback = (alert: WatchlistAlert) => void;

const POLL_INTERVAL = 30_000;
const ALERT_THRESHOLD_BPS = 500;

class WatchlistMonitor {
  private liveData: Map<string, WatchlistLiveData> = new Map();
  private previousPrices: Map<string, number> = new Map();
  private alerts: WatchlistAlert[] = [];
  private alertCallbacks: Set<AlertCallback> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private _alertThresholdBps = ALERT_THRESHOLD_BPS;
  private _started = false;

  get alertThresholdBps() { return this._alertThresholdBps; }
  set alertThresholdBps(v: number) { this._alertThresholdBps = Math.max(50, v); }

  start() {
    if (this._started) return;
    this._started = true;
    this.poll();
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL);
  }

  stop() {
    this._started = false;
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  onAlert(cb: AlertCallback) { this.alertCallbacks.add(cb); return () => this.alertCallbacks.delete(cb); }
  getLiveData(marketId: string): WatchlistLiveData | undefined { return this.liveData.get(marketId); }
  getAllLiveData(): Map<string, WatchlistLiveData> { return this.liveData; }
  getAlerts(): WatchlistAlert[] { return [...this.alerts]; }
  getUnreadCount(): number { return this.alerts.filter(a => !a.read).length; }
  markAlertRead(alertId: string) { const a = this.alerts.find(x => x.id === alertId); if (a) a.read = true; }
  markAllRead() { this.alerts.forEach(a => { a.read = true; }); }
  clearAlerts() { this.alerts = []; }

  private async poll() {
    try {
      const entries = await polymarketWatchlistService.getWatchlist();
      if (entries.length === 0) return;
      // Process sequentially to avoid rate-limiting
      for (const entry of entries) {
        await this.fetchLiveForEntry(entry).catch(() => {});
      }
    } catch (err) {
      console.warn('[WatchlistMonitor] poll error:', err);
    }
  }

  private async fetchLiveForEntry(entry: PolymarketWatchlistEntry) {
    const { marketId, slug, clobTokenIds, question } = entry;
    let yesPrice = 0, noPrice = 0, volume = 0;
    let delta1h: number | null = null, delta1d: number | null = null, delta1w: number | null = null;

    // 1. Fetch live prices from Gamma (via slug) — most reliable, no CLOB needed
    if (slug) {
      try {
        const m = await polymarketApiService.getMarketBySlug(slug);
        const prices = (m as any).outcomePrices;
        if (Array.isArray(prices) && prices.length >= 2) {
          yesPrice = parseFloat(prices[0]) || 0;
          noPrice = parseFloat(prices[1]) || 0;
        }
        volume = parseFloat(m.volume || '0');
        // Use Gamma price change fields if available
        if (m.oneDayPriceChange != null) delta1d = Math.round(m.oneDayPriceChange * 10000);
        if (m.oneHourPriceChange != null) delta1h = Math.round(m.oneHourPriceChange * 10000);
        if (m.oneWeekPriceChange != null) delta1w = Math.round(m.oneWeekPriceChange * 10000);
      } catch { /* Gamma failed, try CLOB fallback */ }
    }

    // 2. If Gamma didn't return prices, try CLOB midpoint
    const tokenIds = clobTokenIds ?? [];
    const yesId = tokenIds[0];
    if (yesPrice === 0 && yesId) {
      try {
        const mid = await polymarketApiService.getMidpoint(yesId);
        yesPrice = parseFloat(mid.mid) || 0;
        noPrice = yesPrice > 0 ? 1 - yesPrice : 0;
      } catch { /* CLOB midpoint failed */ }
    }

    // 3. If still no prices, use stored ones
    if (yesPrice === 0) {
      const stored = entry.outcomePrices ?? [];
      yesPrice = parseFloat(stored[0] || '0');
      noPrice = parseFloat(stored[1] || '0');
    }

    // 4. If no delta from Gamma, try CLOB price history
    if (delta1d === null && yesId) {
      try {
        const hist = await polymarketApiService.getPriceHistory({ token_id: yesId, interval: '1d', fidelity: 60 });
        if (hist.prices.length >= 2) {
          delta1d = Math.round((hist.prices[hist.prices.length - 1].price - hist.prices[0].price) * 10000);
          const oneHourAgo = Date.now() / 1000 - 3600;
          const recent = hist.prices.filter(p => p.timestamp >= oneHourAgo);
          if (recent.length >= 2) delta1h = Math.round((recent[recent.length - 1].price - recent[0].price) * 10000);
        }
      } catch { /* non-fatal: CLOB history can 400 for some tokens */ }
    }

    if (delta1w === null && yesId) {
      try {
        const hist = await polymarketApiService.getPriceHistory({ token_id: yesId, interval: '1w', fidelity: 360 });
        if (hist.prices.length >= 2) {
          delta1w = Math.round((hist.prices[hist.prices.length - 1].price - hist.prices[0].price) * 10000);
        }
      } catch { /* non-fatal */ }
    }

    // Update live data
    const prev = this.previousPrices.get(marketId);
    this.liveData.set(marketId, { marketId, yesPrice, noPrice, volume, delta1h, delta1d, delta1w, lastUpdate: Date.now() });

    // Alert detection
    if (prev !== undefined && yesPrice > 0) {
      const deltaBps = Math.round((yesPrice - prev) * 10000);
      if (Math.abs(deltaBps) >= this._alertThresholdBps) {
        const alert: WatchlistAlert = {
          id: `${marketId}-${Date.now()}`,
          marketId, question: question || marketId,
          type: deltaBps > 0 ? 'spike_up' : 'spike_down',
          message: `${question}: ${deltaBps > 0 ? '↑' : '↓'} ${Math.abs(deltaBps / 100).toFixed(1)}%`,
          oldPrice: prev, newPrice: yesPrice, deltaBps,
          timestamp: Date.now(), read: false,
        };
        this.alerts.unshift(alert);
        if (this.alerts.length > 100) this.alerts = this.alerts.slice(0, 100);
        this.alertCallbacks.forEach(cb => cb(alert));
      }
    }
    this.previousPrices.set(marketId, yesPrice);
  }
}

export const watchlistMonitor = new WatchlistMonitor();
