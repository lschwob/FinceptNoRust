import EventEmitter from 'eventemitter3';
import type { WSMarketUpdate } from './polymarketApiService';
import polymarketApiService from './polymarketApiService';
import { polymarket5mDbService } from './polymarket5mDbService';
import { polymarket5mUniverseService } from './Polymarket5mUniverseService';
import {
  computeMidFromQuotes,
  computeSpread,
  normalizeOrderLevels,
  normalizeUnitPrice,
  snapshotToDbRow,
  toNumber,
} from './polymarket5mUtils';
import type {
  Polymarket5mMarketRecord,
  Polymarket5mMarketState,
  Polymarket5mSeriesPayload,
  Polymarket5mSideState,
  Polymarket5mSnapshot,
  Polymarket5mTickEvent,
} from './polymarket5mTypes';

interface StoreEvents {
  stateUpdated: (state: Polymarket5mMarketState) => void;
  snapshot: (snapshot: Polymarket5mSnapshot) => void;
  hydrated: (payload: Polymarket5mSeriesPayload) => void;
}

const SNAPSHOT_INTERVAL_MS = 500;
const REST_FALLBACK_INTERVAL_MS = 5_000;
const REST_STALE_AFTER_MS = 2_000;
const SNAPSHOT_BUFFER_PER_MARKET = 12_000;
const TICK_BUFFER_PER_MARKET = 2_000;
const BATCH_FLUSH_MS = 2_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const emptySideState = (): Polymarket5mSideState => ({
  bid: null,
  ask: null,
  mid: null,
  last: null,
  bookTimestamp: null,
  bids: [],
  asks: [],
});

export class Polymarket5mStoreService extends EventEmitter<StoreEvents> {
  private started = false;
  private hydrated = false;
  private ws: WebSocket | null = null;
  private wsReconnectTimer: number | null = null;
  private snapshotTimer: number | null = null;
  private fallbackTimer: number | null = null;
  private flushTimer: number | null = null;
  private cleanupTimer: number | null = null;
  private activeTokenKey = '';
  private markets = new Map<string, Polymarket5mMarketRecord>();
  private states = new Map<string, Polymarket5mMarketState>();
  private series = new Map<string, Polymarket5mSnapshot[]>();
  private ticks = new Map<string, Polymarket5mTickEvent[]>();
  private tokenToMarket = new Map<string, { marketId: string; side: 'YES' | 'NO' }>();
  private pendingSnapshots: Polymarket5mSnapshot[] = [];

  ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    polymarket5mUniverseService.ensureStarted();
    void this.hydrateRecentState();
    this.bindUniverse();
    this.startTimers();
  }

  getAllStates(): Polymarket5mMarketState[] {
    return Array.from(this.states.values()).sort((left, right) => left.market.endTs - right.market.endTs);
  }

  getState(marketId: string): Polymarket5mMarketState | null {
    return this.states.get(marketId) ?? null;
  }

  getSeries(marketId: string): Polymarket5mSnapshot[] {
    return this.series.get(marketId) ?? [];
  }

  private async hydrateRecentState(): Promise<void> {
    try {
      const payload = await polymarket5mDbService.getSeries({ hours: 48 });
      for (const market of payload.markets) {
        this.markets.set(market.marketId, market);
        if (!this.states.has(market.marketId)) {
          this.states.set(market.marketId, {
            market,
            live: market.active,
            yes: emptySideState(),
            no: emptySideState(),
            latestSnapshot: null,
            lastEventAt: null,
            lastPersistedAt: null,
            stale: false,
          });
        }
      }

      for (const snapshot of payload.snapshots) {
        const currentSeries = this.series.get(snapshot.marketId) ?? [];
        currentSeries.push(snapshot);
        this.series.set(snapshot.marketId, currentSeries.slice(-SNAPSHOT_BUFFER_PER_MARKET));
        const state = this.states.get(snapshot.marketId);
        if (state) {
          state.latestSnapshot = snapshot;
          state.lastPersistedAt = snapshot.capturedAt;
          state.yes = {
            ...state.yes,
            bid: snapshot.yesBid,
            ask: snapshot.yesAsk,
            mid: snapshot.yesMid,
            last: snapshot.yesLast,
          };
          state.no = {
            ...state.no,
            bid: snapshot.noBid,
            ask: snapshot.noAsk,
            mid: snapshot.noMid,
            last: snapshot.noLast,
          };
        }
      }

      this.hydrated = true;
      this.emit('hydrated', payload);
    } catch (error) {
      console.error('[Polymarket5mStoreService] hydration failed', error);
    }
  }

  private bindUniverse(): void {
    polymarket5mUniverseService.on('universeUpdated', (markets) => {
      for (const market of markets) {
        this.markets.set(market.marketId, market);
        this.tokenToMarket.set(market.yesTokenId, { marketId: market.marketId, side: 'YES' });
        if (market.noTokenId) this.tokenToMarket.set(market.noTokenId, { marketId: market.marketId, side: 'NO' });

        const state = this.states.get(market.marketId);
        if (state) {
          state.market = market;
          state.live = market.active;
        } else {
          this.states.set(market.marketId, {
            market,
            live: market.active,
            yes: emptySideState(),
            no: emptySideState(),
            latestSnapshot: null,
            lastEventAt: null,
            lastPersistedAt: null,
            stale: false,
          });
        }
      }

      this.syncWebSocket();
    });
  }

  private startTimers(): void {
    this.snapshotTimer = window.setInterval(() => {
      this.captureSnapshots();
    }, SNAPSHOT_INTERVAL_MS);

    this.fallbackTimer = window.setInterval(() => {
      void this.runRestFallback();
    }, REST_FALLBACK_INTERVAL_MS);

    this.flushTimer = window.setInterval(() => {
      void this.flushSnapshots();
    }, BATCH_FLUSH_MS);

    this.cleanupTimer = window.setInterval(() => {
      void polymarket5mDbService.cleanup().catch((error) => {
        console.error('[Polymarket5mStoreService] cleanup failed', error);
      });
    }, CLEANUP_INTERVAL_MS);
  }

  private syncWebSocket(): void {
    const tokenIds = polymarket5mUniverseService.getLiveMarkets()
      .flatMap(market => [market.yesTokenId, market.noTokenId].filter(Boolean) as string[])
      .sort();
    const nextKey = tokenIds.join('|');
    if (nextKey.length === 0 || nextKey === this.activeTokenKey) return;

    this.activeTokenKey = nextKey;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    try {
      this.ws = polymarketApiService.connectMarketWebSocket(tokenIds, (update) => {
        this.handleWsUpdate(update);
      }, () => {
        this.scheduleReconnect();
      });
      this.ws.onclose = () => {
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('[Polymarket5mStoreService] websocket connect failed', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.wsReconnectTimer != null) window.clearTimeout(this.wsReconnectTimer);
    this.wsReconnectTimer = window.setTimeout(() => {
      this.activeTokenKey = '';
      this.syncWebSocket();
    }, 1_000);
  }

  private handleWsUpdate(update: WSMarketUpdate): void {
    const tokenId = update.asset_id;
    if (!tokenId) return;
    const mapping = this.tokenToMarket.get(tokenId);
    if (!mapping) return;
    const state = this.states.get(mapping.marketId);
    if (!state) return;

    const timestamp = typeof update.timestamp === 'number'
      ? (update.timestamp > 1e12 ? update.timestamp : update.timestamp * 1000)
      : new Date(String(update.timestamp)).getTime();
    const sideState = mapping.side === 'YES' ? state.yes : state.no;

    if (update.event_type === 'book') {
      const bids = normalizeOrderLevels(update.bids);
      const asks = normalizeOrderLevels(update.asks);
      sideState.bids = bids.slice(0, 12);
      sideState.asks = asks.slice(0, 12);
      sideState.bid = normalizeUnitPrice(bids[0]?.price ?? null);
      sideState.ask = normalizeUnitPrice(asks[0]?.price ?? null);
      sideState.last = normalizeUnitPrice(update.last_trade_price ? toNumber(update.last_trade_price) : sideState.last);
      sideState.mid = computeMidFromQuotes(sideState.bid, sideState.ask, sideState.last);
      sideState.bookTimestamp = timestamp;
    } else if (update.event_type === 'best_bid_ask') {
      sideState.bid = normalizeUnitPrice(toNumber(update.best_bid));
      sideState.ask = normalizeUnitPrice(toNumber(update.best_ask));
      sideState.mid = computeMidFromQuotes(sideState.bid, sideState.ask, sideState.last);
      sideState.bookTimestamp = timestamp;
    } else if (update.event_type === 'last_trade_price' || update.event_type === 'price_change') {
      const nextLast = normalizeUnitPrice(toNumber(update.last_trade_price ?? update.price));
      if (nextLast != null) {
        sideState.last = nextLast;
        sideState.mid = computeMidFromQuotes(sideState.bid, sideState.ask, sideState.last);
      }
    }

    state.lastEventAt = Number.isFinite(timestamp) ? timestamp : Date.now();
    state.live = state.market.active;
    state.stale = false;

    const tickBuffer = this.ticks.get(mapping.marketId) ?? [];
    tickBuffer.push({
      marketId: mapping.marketId,
      tokenId,
      side: mapping.side,
      eventType: update.event_type,
      timestamp: state.lastEventAt,
      payload: update,
    });
    this.ticks.set(mapping.marketId, tickBuffer.slice(-TICK_BUFFER_PER_MARKET));
    this.emit('stateUpdated', { ...state, yes: { ...state.yes }, no: { ...state.no } });
  }

  private async runRestFallback(): Promise<void> {
    const liveMarkets = polymarket5mUniverseService.getLiveMarkets();
    if (liveMarkets.length === 0) return;

    const staleMarkets = liveMarkets.filter((market) => {
      const state = this.states.get(market.marketId);
      if (!state) return true;
      return !state.lastEventAt || (Date.now() - state.lastEventAt) > REST_STALE_AFTER_MS;
    });
    if (staleMarkets.length === 0) return;

    const tokenIds = staleMarkets.flatMap(market => [market.yesTokenId, market.noTokenId].filter(Boolean) as string[]);
    if (tokenIds.length === 0) return;

    try {
      const [books, prices] = await Promise.all([
        polymarketApiService.getOrderBooks(tokenIds).catch(() => []),
        polymarketApiService.getPrices(tokenIds).catch(() => ({ prices: [] })),
      ]);

      const bookByToken = new Map<string, Record<string, unknown>>();
      for (const book of books as Array<Record<string, unknown>>) {
        const assetId = String(book.asset_id ?? '');
        if (assetId) bookByToken.set(assetId, book);
      }
      const priceByToken = new Map<string, number>();
      for (const row of (prices.prices ?? []) as Array<{ token_id: string; price: string }>) {
        const price = normalizeUnitPrice(toNumber(row.price));
        if (price != null) priceByToken.set(row.token_id, price);
      }

      for (const market of staleMarkets) {
        const state = this.states.get(market.marketId);
        if (!state) continue;
        const applyToken = (tokenId: string | undefined, side: 'YES' | 'NO') => {
          if (!tokenId) return;
          const sideState = side === 'YES' ? state.yes : state.no;
          const book = bookByToken.get(tokenId);
          if (book) {
            const bids = normalizeOrderLevels(book.bids as Array<{ price: string; size: string }> | undefined);
            const asks = normalizeOrderLevels(book.asks as Array<{ price: string; size: string }> | undefined);
            sideState.bids = bids.slice(0, 12);
            sideState.asks = asks.slice(0, 12);
            sideState.bid = normalizeUnitPrice(bids[0]?.price ?? null);
            sideState.ask = normalizeUnitPrice(asks[0]?.price ?? null);
            sideState.last = normalizeUnitPrice(toNumber(book.last_trade_price));
            sideState.mid = computeMidFromQuotes(sideState.bid, sideState.ask, sideState.last);
            sideState.bookTimestamp = Date.now();
          }
          const directPrice = priceByToken.get(tokenId);
          if (directPrice != null) {
            sideState.last = directPrice;
            sideState.mid = computeMidFromQuotes(sideState.bid, sideState.ask, sideState.last);
          }
        };

        applyToken(market.yesTokenId, 'YES');
        applyToken(market.noTokenId, 'NO');
        state.stale = true;
        state.lastEventAt = state.lastEventAt ?? Date.now();
        this.emit('stateUpdated', { ...state, yes: { ...state.yes }, no: { ...state.no } });
      }
    } catch (error) {
      console.error('[Polymarket5mStoreService] rest fallback failed', error);
    }
  }

  private captureSnapshots(): void {
    const now = Date.now();
    for (const market of polymarket5mUniverseService.getLiveMarkets()) {
      const state = this.states.get(market.marketId);
      if (!state) continue;
      const latestSnapshot: Polymarket5mSnapshot = {
        marketId: market.marketId,
        asset: market.asset,
        capturedAt: now,
        yesBid: state.yes.bid,
        yesAsk: state.yes.ask,
        yesMid: state.yes.mid,
        yesLast: state.yes.last,
        noBid: state.no.bid,
        noAsk: state.no.ask,
        noMid: state.no.mid,
        noLast: state.no.last,
        spread: computeSpread(state.yes.bid, state.yes.ask, state.no.bid, state.no.ask),
        volume: toNumber(market.rawMarket.volumeNum ?? market.rawMarket.volume),
        liquidity: toNumber(market.rawMarket.liquidityNum ?? market.rawMarket.liquidity),
        priceToBeat: market.priceToBeat ?? null,
        chainlinkPrice: null,
      };

      if (latestSnapshot.yesMid == null && latestSnapshot.noMid == null) continue;

      const currentSeries = this.series.get(market.marketId) ?? [];
      currentSeries.push(latestSnapshot);
      this.series.set(market.marketId, currentSeries.slice(-SNAPSHOT_BUFFER_PER_MARKET));
      state.latestSnapshot = latestSnapshot;
      state.lastPersistedAt = latestSnapshot.capturedAt;
      this.pendingSnapshots.push(latestSnapshot);
      this.emit('snapshot', latestSnapshot);
    }
  }

  private async flushSnapshots(): Promise<void> {
    if (this.pendingSnapshots.length === 0) return;
    const batch = this.pendingSnapshots.splice(0, this.pendingSnapshots.length);
    try {
      await polymarket5mDbService.insertSnapshots(batch.map(snapshotToDbRow));
    } catch (error) {
      console.error('[Polymarket5mStoreService] snapshot flush failed', error);
      this.pendingSnapshots.unshift(...batch);
    }
  }
}

export const polymarket5mStoreService = new Polymarket5mStoreService();
