import { invoke } from '@tauri-apps/api/core';
import type {
  Polymarket5mBacktestResult,
  Polymarket5mMarketRecord,
  Polymarket5mSeriesPayload,
  Polymarket5mSnapshot,
  Polymarket5mStatsResponse,
} from './polymarket5mTypes';

interface SeriesQueryWire {
  market_id?: string;
  asset?: string;
  hours?: number;
  live_only?: boolean;
  resolved_only?: boolean;
  limit_markets?: number;
}

interface StatsQueryWire {
  asset?: string;
  hours?: number;
  live_only?: boolean;
  resolved_only?: boolean;
}

const toMarketRecord = (row: Record<string, unknown>): Polymarket5mMarketRecord => ({
  marketId: String(row.market_id),
  slug: row.slug ? String(row.slug) : undefined,
  question: String(row.question),
  asset: String(row.asset) as Polymarket5mMarketRecord['asset'],
  timeframe: '5m',
  startTs: Number(row.start_ts),
  endTs: Number(row.end_ts),
  yesTokenId: String(row.yes_token_id),
  noTokenId: row.no_token_id ? String(row.no_token_id) : undefined,
  conditionId: row.condition_id ? String(row.condition_id) : undefined,
  priceToBeat: row.price_to_beat == null ? null : Number(row.price_to_beat),
  active: Boolean(row.active),
  closed: Boolean(row.closed),
  archived: Boolean(row.archived),
  acceptingOrders: Boolean(row.accepting_orders),
  resolutionSource: row.resolution_source ? String(row.resolution_source) : undefined,
  rawMarket: row.raw_json ? JSON.parse(String(row.raw_json)) : {
    id: String(row.market_id),
    question: String(row.question),
    active: Boolean(row.active),
    closed: Boolean(row.closed),
    archived: Boolean(row.archived),
    outcomes: [],
    outcomePrices: [],
    volume: '0',
  },
  createdAt: row.created_at ? String(row.created_at) : undefined,
  updatedAt: row.updated_at ? String(row.updated_at) : undefined,
});

const toSnapshot = (row: Record<string, unknown>): Polymarket5mSnapshot => ({
  marketId: String(row.market_id),
  asset: String(row.asset) as Polymarket5mSnapshot['asset'],
  capturedAt: Number(row.captured_at),
  yesBid: row.yes_bid == null ? null : Number(row.yes_bid),
  yesAsk: row.yes_ask == null ? null : Number(row.yes_ask),
  yesMid: row.yes_mid == null ? null : Number(row.yes_mid),
  yesLast: row.yes_last == null ? null : Number(row.yes_last),
  noBid: row.no_bid == null ? null : Number(row.no_bid),
  noAsk: row.no_ask == null ? null : Number(row.no_ask),
  noMid: row.no_mid == null ? null : Number(row.no_mid),
  noLast: row.no_last == null ? null : Number(row.no_last),
  spread: row.spread == null ? null : Number(row.spread),
  volume: row.volume == null ? null : Number(row.volume),
  liquidity: row.liquidity == null ? null : Number(row.liquidity),
  priceToBeat: row.price_to_beat == null ? null : Number(row.price_to_beat),
  chainlinkPrice: row.chainlink_price == null ? null : Number(row.chainlink_price),
});

const normalizeStats = (raw: Record<string, unknown>): Polymarket5mStatsResponse => ({
  summary: {
    marketCount: Number((raw.summary as Record<string, unknown>).market_count ?? 0),
    snapshotCount: Number((raw.summary as Record<string, unknown>).snapshot_count ?? 0),
    avgTurnarounds: Number((raw.summary as Record<string, unknown>).avg_turnarounds ?? 0),
    avgCrossDown: Number((raw.summary as Record<string, unknown>).avg_cross_down ?? 0),
    avgCrossUp: Number((raw.summary as Record<string, unknown>).avg_cross_up ?? 0),
    avgTimeToFirstTurnaroundMs: (raw.summary as Record<string, unknown>).avg_time_to_first_turnaround_ms == null ? null : Number((raw.summary as Record<string, unknown>).avg_time_to_first_turnaround_ms),
    lowestYes: (raw.summary as Record<string, unknown>).lowest_yes == null ? null : Number((raw.summary as Record<string, unknown>).lowest_yes),
    highestYes: (raw.summary as Record<string, unknown>).highest_yes == null ? null : Number((raw.summary as Record<string, unknown>).highest_yes),
    lowestNo: (raw.summary as Record<string, unknown>).lowest_no == null ? null : Number((raw.summary as Record<string, unknown>).lowest_no),
    highestNo: (raw.summary as Record<string, unknown>).highest_no == null ? null : Number((raw.summary as Record<string, unknown>).highest_no),
    avgUpExcursion: Number((raw.summary as Record<string, unknown>).avg_up_excursion ?? 0),
    avgDownExcursion: Number((raw.summary as Record<string, unknown>).avg_down_excursion ?? 0),
    avgAbsMove: Number((raw.summary as Record<string, unknown>).avg_abs_move ?? 0),
    avgSpread: Number((raw.summary as Record<string, unknown>).avg_spread ?? 0),
    maxSpread: Number((raw.summary as Record<string, unknown>).max_spread ?? 0),
  },
  markets: Array.isArray(raw.markets) ? raw.markets.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      marketId: String(item.market_id),
      question: String(item.question),
      asset: String(item.asset) as Polymarket5mMarketRecord['asset'],
      endTs: Number(item.end_ts),
      snapshotCount: Number(item.snapshot_count ?? 0),
      firstCapturedAt: Number(item.first_captured_at ?? 0),
      lastCapturedAt: Number(item.last_captured_at ?? 0),
      firstYes: item.first_yes == null ? null : Number(item.first_yes),
      lastYes: item.last_yes == null ? null : Number(item.last_yes),
      minYes: item.min_yes == null ? null : Number(item.min_yes),
      maxYes: item.max_yes == null ? null : Number(item.max_yes),
      minNo: item.min_no == null ? null : Number(item.min_no),
      maxNo: item.max_no == null ? null : Number(item.max_no),
      maxUpExcursion: Number(item.max_up_excursion ?? 0),
      maxDownExcursion: Number(item.max_down_excursion ?? 0),
      turnaroundCount: Number(item.turnaround_count ?? 0),
      crossDownCount: Number(item.cross_down_count ?? 0),
      crossUpCount: Number(item.cross_up_count ?? 0),
      firstTurnaroundMs: item.first_turnaround_ms == null ? null : Number(item.first_turnaround_ms),
      avgAbsMove: Number(item.avg_abs_move ?? 0),
      avgSpread: Number(item.avg_spread ?? 0),
      maxSpread: Number(item.max_spread ?? 0),
      priceToBeat: item.price_to_beat == null ? null : Number(item.price_to_beat),
    };
  }) : [],
});

class Polymarket5mDbService {
  async upsertMarkets(markets: Record<string, unknown>[]): Promise<number> {
    return invoke<number>('pm5m_upsert_markets', { markets });
  }

  async insertSnapshots(snapshots: Record<string, unknown>[]): Promise<number> {
    return invoke<number>('pm5m_insert_snapshots', { snapshots });
  }

  async getSeries(query: SeriesQueryWire): Promise<Polymarket5mSeriesPayload> {
    const raw = await invoke<{ markets: Record<string, unknown>[]; snapshots: Record<string, unknown>[] }>('pm5m_get_market_series', { query });
    return {
      markets: raw.markets.map(toMarketRecord),
      snapshots: raw.snapshots.map(toSnapshot),
    };
  }

  async getStats(query: StatsQueryWire): Promise<Polymarket5mStatsResponse> {
    const raw = await invoke<Record<string, unknown>>('pm5m_get_stats', { query });
    return normalizeStats(raw);
  }

  async saveRun(result: Polymarket5mBacktestResult, configJson: string): Promise<void> {
    await invoke('pm5m_save_run', {
      run: {
        id: result.id,
        strategy_name: result.strategyName,
        strategy_type: result.strategyType,
        asset_filter: result.assetFilter ?? null,
        window_start: result.windowStart,
        window_end: result.windowEnd,
        config_json: configJson,
        result_json: JSON.stringify(result),
        created_at: result.createdAt,
      },
    });
  }

  async listRuns(limit = 20): Promise<Polymarket5mBacktestResult[]> {
    const raw = await invoke<Array<Record<string, unknown>>>('pm5m_list_runs', { limit });
    return raw.map(row => JSON.parse(String(row.result_json)) as Polymarket5mBacktestResult);
  }

  async cleanup(retentionHours = 24 * 7): Promise<string> {
    return invoke<string>('pm5m_cleanup', { retentionHours });
  }
}

export const polymarket5mDbService = new Polymarket5mDbService();
