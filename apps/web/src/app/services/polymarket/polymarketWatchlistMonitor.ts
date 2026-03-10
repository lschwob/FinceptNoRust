/**
 * Polymarket Watchlist Monitor — polls live prices for watchlist entries,
 * computes multi-timeframe deltas, and triggers alerts on large moves.
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
const ALERT_THRESHOLD_BPS = 500; // 5% move triggers alert

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

  getLiveData(marketId: string): WatchlistLiveData | undefined {
    return this.liveData.get(marketId);
  }

  getAllLiveData(): Map<string, WatchlistLiveData> { return this.liveData; }

  getAlerts(): WatchlistAlert[] { return [...this.alerts]; }

  getUnreadCount(): number { return this.alerts.filter(a => !a.read).length; }

  markAlertRead(alertId: string) {
    const a = this.alerts.find(x => x.id === alertId);
    if (a) a.read = true;
  }

  markAllRead() { this.alerts.forEach(a => { a.read = true; }); }

  clearAlerts() { this.alerts = []; }

  private async poll() {
    try {
      const entries = await polymarketWatchlistService.getWatchlist();
      if (entries.length === 0) return;

      for (const entry of entries) {
        await this.fetchLiveForEntry(entry);
      }
    } catch (err) {
      console.warn('[WatchlistMonitor] poll error:', err);
    }
  }

  private async fetchLiveForEntry(entry: PolymarketWatchlistEntry) {
    const { marketId, clobTokenIds, question } = entry;
    const tokenIds = clobTokenIds ?? [];
    const yesId = tokenIds[0];
    if (!yesId) return;

    try {
      const market = await polymarketApiService.getMarkets({ limit: 1 }).catch(() => []);
      let yesPrice = 0, noPrice = 0, volume = 0;
      let delta1h: number | null = null, delta1d: number | null = null, delta1w: number | null = null;

      // Fetch current midpoint price
      try {
        const mid = await polymarketApiService.getMidpoint(yesId);
        yesPrice = parseFloat(mid.mid);
        noPrice = 1 - yesPrice;
      } catch {
        // Fallback: use stored prices
        const stored = entry.outcomePrices ?? [];
        yesPrice = parseFloat(stored[0] || '0');
        noPrice = parseFloat(stored[1] || '0');
        if (yesPrice <= 1 && yesPrice > 0) { /* already decimal */ }
      }

      // Fetch price history for deltas
      try {
        const hist1d = await polymarketApiService.getPriceHistory({ token_id: yesId, interval: '1d', fidelity: 60 });
        if (hist1d.prices.length >= 2) {
          const oldest = hist1d.prices[0].price;
          const latest = hist1d.prices[hist1d.prices.length - 1].price;
          delta1d = Math.round((latest - oldest) * 10000);
        }
        // 1h delta from last hour of 1d data
        const oneHourAgo = Date.now() / 1000 - 3600;
        const recentPrices = hist1d.prices.filter(p => p.timestamp >= oneHourAgo);
        if (recentPrices.length >= 2) {
          delta1h = Math.round((recentPrices[recentPrices.length - 1].price - recentPrices[0].price) * 10000);
        }
      } catch { /* non-fatal */ }

      try {
        const hist1w = await polymarketApiService.getPriceHistory({ token_id: yesId, interval: '1w', fidelity: 360 });
        if (hist1w.prices.length >= 2) {
          delta1w = Math.round((hist1w.prices[hist1w.prices.length - 1].price - hist1w.prices[0].price) * 10000);
        }
      } catch { /* non-fatal */ }

      // Fetch volume from Gamma
      try {
        const slug = entry.slug;
        if (slug) {
          const m = await polymarketApiService.getMarketBySlug(slug);
          volume = parseFloat(m.volume || '0');
          // Update prices from Gamma too (more reliable)
          const gPrices = (m as any).outcomePrices;
          if (Array.isArray(gPrices) && gPrices.length >= 2) {
            const gYes = parseFloat(gPrices[0]);
            const gNo = parseFloat(gPrices[1]);
            if (!isNaN(gYes) && gYes > 0) { yesPrice = gYes; noPrice = gNo; }
          }
        }
      } catch { /* non-fatal */ }

      const prev = this.previousPrices.get(marketId);
      const ld: WatchlistLiveData = {
        marketId, yesPrice, noPrice, volume,
        delta1h, delta1d, delta1w,
        lastUpdate: Date.now(),
      };
      this.liveData.set(marketId, ld);

      // Alert detection
      if (prev !== undefined && yesPrice > 0) {
        const deltaBps = Math.round((yesPrice - prev) * 10000);
        if (Math.abs(deltaBps) >= this._alertThresholdBps) {
          const alert: WatchlistAlert = {
            id: `${marketId}-${Date.now()}`,
            marketId,
            question: question || marketId,
            type: deltaBps > 0 ? 'spike_up' : 'spike_down',
            message: `${question}: ${deltaBps > 0 ? '↑' : '↓'} ${Math.abs(deltaBps / 100).toFixed(1)}%`,
            oldPrice: prev,
            newPrice: yesPrice,
            deltaBps,
            timestamp: Date.now(),
            read: false,
          };
          this.alerts.unshift(alert);
          if (this.alerts.length > 100) this.alerts = this.alerts.slice(0, 100);
          this.alertCallbacks.forEach(cb => cb(alert));
        }
      }
      this.previousPrices.set(marketId, yesPrice);

    } catch (err) {
      console.warn(`[WatchlistMonitor] error for ${marketId}:`, err);
    }
  }
}

export const watchlistMonitor = new WatchlistMonitor();
