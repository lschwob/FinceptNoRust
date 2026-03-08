import { polymarket5mDbService } from './polymarket5mDbService';
import type {
  Polymarket5mAsset,
  Polymarket5mBacktestMarketResult,
  Polymarket5mBacktestRequest,
  Polymarket5mBacktestResult,
  Polymarket5mMarketSeries,
  Polymarket5mSnapshot,
  Polymarket5mStrategyDefinition,
  Polymarket5mTradeFill,
} from './polymarket5mTypes';

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const applyExecutionModel = (referenceMid: number, spread: number, slippage: number, action: 'BUY' | 'SELL'): number => {
  const adjustment = spread / 2 + slippage;
  return clamp(action === 'BUY' ? referenceMid + adjustment : referenceMid - adjustment);
};

export const createMomentumStrategy = (overrides?: Partial<Polymarket5mStrategyDefinition['params']>): Polymarket5mStrategyDefinition => ({
  id: 'polymarket-5m-momentum',
  name: 'Momentum 5m',
  type: 'momentum',
  params: {
    lookbackSnapshots: 20,
    entryThreshold: 0.025,
    exitThreshold: 0.005,
    maxHoldSnapshots: 120,
    notionalPerTrade: 25,
    spreadBps: 15,
    slippageBps: 5,
    feeBps: 0,
    ...overrides,
  },
});

class Polymarket5mBacktestService {
  async loadSeries(asset: Polymarket5mAsset | 'all', lookbackHours: number): Promise<Polymarket5mMarketSeries[]> {
    const payload = await polymarket5mDbService.getSeries({
      asset: asset === 'all' ? undefined : asset,
      hours: lookbackHours,
    });
    const snapshotsByMarket = new Map<string, Polymarket5mSnapshot[]>();
    for (const snapshot of payload.snapshots) {
      const list = snapshotsByMarket.get(snapshot.marketId) ?? [];
      list.push(snapshot);
      snapshotsByMarket.set(snapshot.marketId, list);
    }
    return payload.markets.map(market => ({
      market,
      snapshots: (snapshotsByMarket.get(market.marketId) ?? []).sort((left, right) => left.capturedAt - right.capturedAt),
    })).filter(series => series.snapshots.length >= 5);
  }

  async runBacktest(request: Polymarket5mBacktestRequest): Promise<Polymarket5mBacktestResult> {
    const strategy = request.strategy ?? createMomentumStrategy();
    const assetFilter = request.asset ?? 'all';
    const now = Date.now();
    const windowStart = now - request.lookbackHours * 60 * 60 * 1000;
    const seriesList = await this.loadSeries(assetFilter, request.lookbackHours);
    const results = seriesList.map(series => this.runMomentum(series, strategy));
    const tradeCount = results.reduce((sum, row) => sum + row.tradeCount, 0);
    const totalPnl = results.reduce((sum, row) => sum + row.pnl, 0);
    const averageReturnPct = results.length > 0
      ? results.reduce((sum, row) => sum + row.returnPct, 0) / results.length
      : 0;
    const totalWinningTrades = results.reduce((sum, row) => sum + Math.round(row.winRate * row.tradeCount), 0);
    const result: Polymarket5mBacktestResult = {
      id: `pm5m_bt_${now}`,
      strategyName: strategy.name,
      strategyType: strategy.type,
      assetFilter: assetFilter === 'all' ? 'all' : assetFilter,
      windowStart,
      windowEnd: now,
      marketCount: results.length,
      tradeCount,
      totalPnl,
      averageReturnPct,
      winRate: tradeCount > 0 ? totalWinningTrades / tradeCount : 0,
      markets: results.sort((left, right) => right.pnl - left.pnl),
      createdAt: new Date(now).toISOString(),
    };

    await polymarket5mDbService.saveRun(result, JSON.stringify(request));
    return result;
  }

  async listRuns(limit = 20): Promise<Polymarket5mBacktestResult[]> {
    return polymarket5mDbService.listRuns(limit);
  }

  private runMomentum(series: Polymarket5mMarketSeries, strategy: Polymarket5mStrategyDefinition): Polymarket5mBacktestMarketResult {
    const fills: Polymarket5mTradeFill[] = [];
    let openSide: 'YES' | 'NO' | null = null;
    let entryPrice = 0;
    let quantity = 0;
    let openIndex = -1;
    let realizedPnl = 0;
    let wins = 0;
    let losses = 0;

    const spreadAdjustment = strategy.params.spreadBps / 10_000;
    const slippageAdjustment = strategy.params.slippageBps / 10_000;
    const feeAdjustment = strategy.params.feeBps / 10_000;

    const openPosition = (side: 'YES' | 'NO', snapshot: Polymarket5mSnapshot, index: number) => {
      const referenceMid = side === 'YES' ? snapshot.yesMid : snapshot.noMid;
      if (referenceMid == null) return;
      const fillPrice = applyExecutionModel(referenceMid, snapshot.spread ?? spreadAdjustment, slippageAdjustment, 'BUY');
      if (fillPrice <= 0) return;
      quantity = strategy.params.notionalPerTrade / fillPrice;
      entryPrice = fillPrice;
      openSide = side;
      openIndex = index;
      fills.push({
        timestamp: snapshot.capturedAt,
        marketId: series.market.marketId,
        asset: series.market.asset,
        side,
        action: 'BUY',
        referenceMid,
        fillPrice,
        quantity,
        notional: strategy.params.notionalPerTrade,
        feePaid: strategy.params.notionalPerTrade * feeAdjustment,
        spreadApplied: snapshot.spread ?? spreadAdjustment,
        slippageApplied: slippageAdjustment,
      });
    };

    const closePosition = (snapshot: Polymarket5mSnapshot) => {
      if (!openSide || quantity <= 0) return;
      const referenceMid = openSide === 'YES' ? snapshot.yesMid : snapshot.noMid;
      if (referenceMid == null) return;
      const fillPrice = applyExecutionModel(referenceMid, snapshot.spread ?? spreadAdjustment, slippageAdjustment, 'SELL');
      const notional = quantity * fillPrice;
      const fees = notional * feeAdjustment;
      const pnl = quantity * (fillPrice - entryPrice) - fees;
      realizedPnl += pnl;
      if (pnl >= 0) wins += 1;
      else losses += 1;
      fills.push({
        timestamp: snapshot.capturedAt,
        marketId: series.market.marketId,
        asset: series.market.asset,
        side: openSide,
        action: 'SELL',
        referenceMid,
        fillPrice,
        quantity,
        notional,
        feePaid: fees,
        spreadApplied: snapshot.spread ?? spreadAdjustment,
        slippageApplied: slippageAdjustment,
      });
      openSide = null;
      entryPrice = 0;
      quantity = 0;
      openIndex = -1;
    };

    const yesSeries = series.snapshots.map(snapshot => snapshot.yesMid ?? 0.5);
    const noSeries = series.snapshots.map(snapshot => snapshot.noMid ?? 0.5);

    for (let index = strategy.params.lookbackSnapshots; index < series.snapshots.length; index += 1) {
      const snapshot = series.snapshots[index];
      const past = index - strategy.params.lookbackSnapshots;
      const yesMomentum = yesSeries[index] - yesSeries[past];
      const noMomentum = noSeries[index] - noSeries[past];
      const holdFor = openIndex >= 0 ? index - openIndex : 0;

      if (!openSide) {
        if (yesMomentum >= strategy.params.entryThreshold) {
          openPosition('YES', snapshot, index);
        } else if (noMomentum >= strategy.params.entryThreshold) {
          openPosition('NO', snapshot, index);
        }
        continue;
      }

      const currentMomentum = openSide === 'YES' ? yesMomentum : noMomentum;
      if (currentMomentum <= strategy.params.exitThreshold || holdFor >= strategy.params.maxHoldSnapshots) {
        closePosition(snapshot);
      }
    }

    const finalSnapshot = series.snapshots[series.snapshots.length - 1];
    if (openSide && finalSnapshot) {
      closePosition(finalSnapshot);
    }

    const tradeCount = fills.filter(fill => fill.action === 'SELL').length;
    const deployedCapital = tradeCount * strategy.params.notionalPerTrade;
    return {
      marketId: series.market.marketId,
      question: series.market.question,
      asset: series.market.asset,
      tradeCount,
      pnl: realizedPnl,
      returnPct: deployedCapital > 0 ? realizedPnl / deployedCapital : 0,
      winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
      fills,
    };
  }
}

export const polymarket5mBacktestService = new Polymarket5mBacktestService();
