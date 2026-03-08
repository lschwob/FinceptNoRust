import type { PolymarketMarket } from './polymarketApiService';

export type Polymarket5mAsset = 'BTC' | 'ETH' | 'SOL' | 'XRP' | 'DOGE' | 'AVAX';
export type Polymarket5mTimeframe = '5m';

export interface Polymarket5mMarketRecord {
  marketId: string;
  slug?: string;
  question: string;
  asset: Polymarket5mAsset;
  timeframe: Polymarket5mTimeframe;
  startTs: number;
  endTs: number;
  yesTokenId: string;
  noTokenId?: string;
  conditionId?: string;
  priceToBeat?: number | null;
  active: boolean;
  closed: boolean;
  archived: boolean;
  acceptingOrders: boolean;
  resolutionSource?: string;
  rawMarket: PolymarketMarket;
  createdAt?: string;
  updatedAt?: string;
}

export interface Polymarket5mTickEvent {
  marketId: string;
  tokenId: string;
  side: 'YES' | 'NO';
  eventType: string;
  timestamp: number;
  payload: unknown;
}

export interface Polymarket5mOrderLevel {
  price: number;
  size: number;
}

export interface Polymarket5mSideState {
  bid: number | null;
  ask: number | null;
  mid: number | null;
  last: number | null;
  bookTimestamp: number | null;
  bids: Polymarket5mOrderLevel[];
  asks: Polymarket5mOrderLevel[];
}

export interface Polymarket5mSnapshot {
  marketId: string;
  asset: Polymarket5mAsset;
  capturedAt: number;
  yesBid: number | null;
  yesAsk: number | null;
  yesMid: number | null;
  yesLast: number | null;
  noBid: number | null;
  noAsk: number | null;
  noMid: number | null;
  noLast: number | null;
  spread: number | null;
  volume: number | null;
  liquidity: number | null;
  priceToBeat: number | null;
  chainlinkPrice: number | null;
}

export interface Polymarket5mMarketState {
  market: Polymarket5mMarketRecord;
  live: boolean;
  yes: Polymarket5mSideState;
  no: Polymarket5mSideState;
  latestSnapshot: Polymarket5mSnapshot | null;
  lastEventAt: number | null;
  lastPersistedAt: number | null;
  stale: boolean;
}

export interface Polymarket5mSeriesPayload {
  markets: Polymarket5mMarketRecord[];
  snapshots: Polymarket5mSnapshot[];
}

export interface Polymarket5mStatsSummary {
  marketCount: number;
  snapshotCount: number;
  avgTurnarounds: number;
  avgCrossDown: number;
  avgCrossUp: number;
  avgTimeToFirstTurnaroundMs: number | null;
  lowestYes: number | null;
  highestYes: number | null;
  lowestNo: number | null;
  highestNo: number | null;
  avgUpExcursion: number;
  avgDownExcursion: number;
  avgAbsMove: number;
  avgSpread: number;
  maxSpread: number;
}

export interface Polymarket5mMarketStatsRow {
  marketId: string;
  question: string;
  asset: Polymarket5mAsset;
  endTs: number;
  snapshotCount: number;
  firstCapturedAt: number;
  lastCapturedAt: number;
  firstYes: number | null;
  lastYes: number | null;
  minYes: number | null;
  maxYes: number | null;
  minNo: number | null;
  maxNo: number | null;
  maxUpExcursion: number;
  maxDownExcursion: number;
  turnaroundCount: number;
  crossDownCount: number;
  crossUpCount: number;
  firstTurnaroundMs: number | null;
  avgAbsMove: number;
  avgSpread: number;
  maxSpread: number;
  priceToBeat: number | null;
}

export interface Polymarket5mStatsResponse {
  summary: Polymarket5mStatsSummary;
  markets: Polymarket5mMarketStatsRow[];
}

export interface Polymarket5mTradeFill {
  timestamp: number;
  marketId: string;
  asset: Polymarket5mAsset;
  side: 'YES' | 'NO';
  action: 'BUY' | 'SELL';
  referenceMid: number;
  fillPrice: number;
  quantity: number;
  notional: number;
  feePaid: number;
  spreadApplied: number;
  slippageApplied: number;
}

export interface Polymarket5mMarketSeries {
  market: Polymarket5mMarketRecord;
  snapshots: Polymarket5mSnapshot[];
}

export interface Polymarket5mStrategyDefinition {
  id: string;
  name: string;
  type: 'momentum';
  params: {
    lookbackSnapshots: number;
    entryThreshold: number;
    exitThreshold: number;
    maxHoldSnapshots: number;
    notionalPerTrade: number;
    spreadBps: number;
    slippageBps: number;
    feeBps: number;
  };
}

export interface Polymarket5mBacktestRequest {
  asset?: Polymarket5mAsset | 'all';
  lookbackHours: number;
  strategy: Polymarket5mStrategyDefinition;
}

export interface Polymarket5mBacktestMarketResult {
  marketId: string;
  question: string;
  asset: Polymarket5mAsset;
  tradeCount: number;
  pnl: number;
  returnPct: number;
  winRate: number;
  fills: Polymarket5mTradeFill[];
}

export interface Polymarket5mBacktestResult {
  id: string;
  strategyName: string;
  strategyType: string;
  assetFilter?: string;
  windowStart: number;
  windowEnd: number;
  marketCount: number;
  tradeCount: number;
  totalPnl: number;
  averageReturnPct: number;
  winRate: number;
  markets: Polymarket5mBacktestMarketResult[];
  createdAt: string;
}
