import EventEmitter from 'eventemitter3';
import polymarketApiService from './polymarketApiService';
import { polymarket5mDbService } from './polymarket5mDbService';
import {
  buildPolymarket5mMarketRecord,
  extractPolymarket5mSlugStartTs,
  getPolymarket5mClosestCurrentMinuteDistance,
  getPolymarket5mEtNowState,
  isPolymarket5mQuestionTimeCurrent,
  isPolymarket5mEtWindowCurrent,
  isPolymarket5mLive,
  logicalMarketSlot,
  marketToDbRow,
  parsePolymarket5mQuestionEtWindow,
} from './polymarket5mUtils';
import type { Polymarket5mMarketRecord } from './polymarket5mTypes';

interface UniverseEvents {
  marketAdded: (market: Polymarket5mMarketRecord) => void;
  marketClosed: (market: Polymarket5mMarketRecord) => void;
  universeUpdated: (markets: Polymarket5mMarketRecord[]) => void;
}

const PAGE_SIZE = 200;
const MAX_RECENT_PAGES = 8;
const NORMAL_POLL_MS = 4_000;
const BURST_POLL_MS = 1_000;
const BURST_WINDOW_MS = 20_000;

const compareRank = (left: number[], right: number[]): number => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue === rightValue) continue;
    return leftValue - rightValue;
  }
  return 0;
};

export class Polymarket5mUniverseService extends EventEmitter<UniverseEvents> {
  private started = false;
  private inFlight = false;
  private timer: number | null = null;
  private marketsById = new Map<string, Polymarket5mMarketRecord>();
  private slotIndex = new Map<string, string>();

  ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    void this.refreshNow();
  }

  getMarkets(): Polymarket5mMarketRecord[] {
    return Array.from(this.marketsById.values()).sort((left, right) => left.endTs - right.endTs);
  }

  getLiveMarkets(): Polymarket5mMarketRecord[] {
    return this.getMarkets().filter(market => market.active && !market.closed && !market.archived);
  }

  async refreshNow(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;

    try {
      const discovered: Polymarket5mMarketRecord[] = [];
      for (let page = 0; page < MAX_RECENT_PAGES; page += 1) {
        const batch = await polymarketApiService.getMarkets({
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          order: 'id',
          ascending: false,
        });
        if (!Array.isArray(batch) || batch.length === 0) break;
        for (const market of batch) {
          const record = buildPolymarket5mMarketRecord(market);
          if (record) discovered.push(record);
        }
        if (batch.length < PAGE_SIZE) break;
      }

      const deduped = new Map<string, Polymarket5mMarketRecord>();
      for (const market of discovered) {
        const previous = deduped.get(market.marketId);
        deduped.set(market.marketId, previous ? { ...previous, ...market } : market);
      }

      const nextMarkets = Array.from(deduped.values()).map(market => ({
        ...market,
        active: isPolymarket5mLive(market.rawMarket),
      }));

      const canonicalLiveByAsset = new Map<string, string>();
      const now = new Date();
      const nowTs = now.getTime();
      const etNow = getPolymarket5mEtNowState(now);
      const marketRanks = new Map<string, number[]>();
      const currentlyTradable = nextMarkets
        .filter(market => market.active && !market.closed && !market.archived && market.acceptingOrders)
        .sort((left, right) => left.endTs - right.endTs);

      for (const market of currentlyTradable) {
        const slotStartTs = extractPolymarket5mSlugStartTs(market) ?? Math.max(market.startTs, market.endTs - 5 * 60_000);
        const slotWindow = parsePolymarket5mQuestionEtWindow(market.question);
        const matchesCurrentAbsoluteSlot = slotStartTs <= nowTs && nowTs < market.endTs;
        const matchesCurrentEtWindow = isPolymarket5mEtWindowCurrent(market, now);
        const matchesCurrentUsTimeWindow = isPolymarket5mQuestionTimeCurrent(market, now, 'America/New_York');
        const minuteDistance = getPolymarket5mClosestCurrentMinuteDistance(market, now);
        const dateDistance = slotWindow
          ? Math.abs((slotWindow.month - etNow.month) * 31 + (slotWindow.day - etNow.day))
          : Number.MAX_SAFE_INTEGER;
        const rank = [
          matchesCurrentAbsoluteSlot ? 0 : 1,
          matchesCurrentEtWindow || matchesCurrentUsTimeWindow ? 0 : 1,
          minuteDistance,
          dateDistance,
          slotStartTs >= nowTs ? 0 : 1,
          Math.abs(slotStartTs - nowTs),
          market.endTs,
        ];
        marketRanks.set(market.marketId, rank);
        const existingMarketId = canonicalLiveByAsset.get(market.asset);
        const existingRank = existingMarketId ? marketRanks.get(existingMarketId) ?? null : null;

        if (!existingMarketId || !existingRank || compareRank(rank, existingRank) < 0) {
          canonicalLiveByAsset.set(market.asset, market.marketId);
        }
      }

      for (const market of nextMarkets) {
        const canonicalMarketId = canonicalLiveByAsset.get(market.asset);
        if (canonicalMarketId) {
          market.active = market.marketId === canonicalMarketId;
        }
      }

      const nextById = new Map<string, Polymarket5mMarketRecord>();
      const nextSlots = new Map<string, string>();
      const added: Polymarket5mMarketRecord[] = [];
      const closed: Polymarket5mMarketRecord[] = [];

      for (const market of nextMarkets) {
        nextById.set(market.marketId, market);
        nextSlots.set(logicalMarketSlot(market), market.marketId);
        const previous = this.marketsById.get(market.marketId);
        if (!previous) {
          added.push(market);
        } else if (previous.active && !market.active) {
          closed.push(market);
        }
      }

      for (const existing of this.marketsById.values()) {
        if (!nextById.has(existing.marketId) && existing.active) {
          closed.push({ ...existing, active: false, closed: existing.closed || Date.now() >= existing.endTs });
        }
      }

      this.marketsById = nextById;
      this.slotIndex = nextSlots;

      if (nextMarkets.length > 0) {
        void polymarket5mDbService.upsertMarkets(nextMarkets.map(marketToDbRow)).catch((error) => {
          console.error('[Polymarket5mUniverseService] failed to persist markets', error);
        });
      }

      for (const market of added) this.emit('marketAdded', market);
      for (const market of closed) this.emit('marketClosed', market);
      this.emit('universeUpdated', this.getMarkets());
    } catch (error) {
      console.error('[Polymarket5mUniverseService] refresh failed', error);
    } finally {
      this.inFlight = false;
      this.scheduleNext();
    }
  }

  private scheduleNext(): void {
    if (this.timer != null) window.clearTimeout(this.timer);
    const now = Date.now();
    const distanceToBoundary = Math.min(now % (5 * 60_000), (5 * 60_000) - (now % (5 * 60_000)));
    const delay = distanceToBoundary <= BURST_WINDOW_MS ? BURST_POLL_MS : NORMAL_POLL_MS;
    this.timer = window.setTimeout(() => {
      void this.refreshNow();
    }, delay);
  }
}

export const polymarket5mUniverseService = new Polymarket5mUniverseService();
