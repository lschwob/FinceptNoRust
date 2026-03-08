import React, { useEffect, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { createMomentumStrategy, polymarket5mBacktestService } from '@/services/polymarket/Polymarket5mBacktestService';
import type { Polymarket5mAsset, Polymarket5mBacktestResult } from '@/services/polymarket/polymarket5mTypes';
import { C, sectionHeader, statCell } from './tokens';

const assetOptions: Array<Polymarket5mAsset | 'all'> = ['all', 'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX'];

const Polymarket5mBacktestView: React.FC = () => {
  const [asset, setAsset] = useState<Polymarket5mAsset | 'all'>('all');
  const [lookbackHours, setLookbackHours] = useState(48);
  const [entryThreshold, setEntryThreshold] = useState(0.025);
  const [lookbackSnapshots, setLookbackSnapshots] = useState(20);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Polymarket5mBacktestResult | null>(null);
  const [runs, setRuns] = useState<Polymarket5mBacktestResult[]>([]);

  const loadRuns = async () => {
    setRuns(await polymarket5mBacktestService.listRuns(15));
  };

  useEffect(() => {
    void loadRuns();
  }, []);

  const runBacktest = async () => {
    setLoading(true);
    try {
      const strategy = createMomentumStrategy({
        entryThreshold,
        lookbackSnapshots,
      });
      const nextResult = await polymarket5mBacktestService.runBacktest({
        asset,
        lookbackHours,
        strategy,
      });
      setResult(nextResult);
      await loadRuns();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', backgroundColor: C.bg }}>
      <div style={{ width: 360, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, backgroundColor: C.header, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 'bold', color: C.orange, fontFamily: C.font }}>5M BACKTEST</span>
          <button onClick={() => { void loadRuns(); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', backgroundColor: C.bg, color: C.white, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 9, fontFamily: C.font }}>
            <RefreshCw size={10} /> RUNS
          </button>
        </div>
        <div style={{ padding: 10, borderBottom: `1px solid ${C.border}`, display: 'grid', gap: 8 }}>
          <select value={asset} onChange={event => setAsset(event.target.value as Polymarket5mAsset | 'all')} style={{ backgroundColor: C.bg, color: C.white, border: `1px solid ${C.border}`, fontSize: 9, padding: '4px 6px', fontFamily: C.font }}>
            {assetOptions.map(option => <option key={option} value={option}>{option.toUpperCase()}</option>)}
          </select>
          <label style={{ fontSize: 9, color: C.faint, fontFamily: C.font }}>
            Lookback hours
            <input type="number" min={6} max={168} value={lookbackHours} onChange={event => setLookbackHours(Number(event.target.value))} style={{ width: '100%', marginTop: 4, backgroundColor: C.bg, color: C.white, border: `1px solid ${C.border}`, fontSize: 9, padding: '4px 6px', fontFamily: C.font }} />
          </label>
          <label style={{ fontSize: 9, color: C.faint, fontFamily: C.font }}>
            Momentum lookback snapshots
            <input type="number" min={3} max={300} value={lookbackSnapshots} onChange={event => setLookbackSnapshots(Number(event.target.value))} style={{ width: '100%', marginTop: 4, backgroundColor: C.bg, color: C.white, border: `1px solid ${C.border}`, fontSize: 9, padding: '4px 6px', fontFamily: C.font }} />
          </label>
          <label style={{ fontSize: 9, color: C.faint, fontFamily: C.font }}>
            Entry threshold
            <input type="number" step="0.001" min={0.001} max={0.2} value={entryThreshold} onChange={event => setEntryThreshold(Number(event.target.value))} style={{ width: '100%', marginTop: 4, backgroundColor: C.bg, color: C.white, border: `1px solid ${C.border}`, fontSize: 9, padding: '4px 6px', fontFamily: C.font }} />
          </label>
          <button onClick={() => { void runBacktest(); }} disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 10px', backgroundColor: C.orange, color: '#000', border: 'none', fontSize: 10, fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: C.font }}>
            <Play size={12} />
            {loading ? 'RUNNING…' : 'RUN BACKTEST'}
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {runs.map(run => (
            <div key={run.id} onClick={() => setResult(run)} style={{ padding: '8px 10px', borderBottom: `1px solid ${C.borderFaint}`, cursor: 'pointer', fontFamily: C.font }}>
              <div style={{ fontSize: 9, color: C.white, fontWeight: 'bold' }}>{run.strategyName}</div>
              <div style={{ marginTop: 4, fontSize: 8, color: C.faint }}>
                {run.assetFilter ?? 'all'} • {run.marketCount} markets • pnl {run.totalPnl.toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, backgroundColor: C.border }}>
          {statCell('RUNS', String(runs.length))}
          {statCell('MARKETS', String(result?.marketCount ?? 0))}
          {statCell('TRADES', String(result?.tradeCount ?? 0))}
          {statCell('TOTAL PNL', result ? result.totalPnl.toFixed(4) : '0.0000', (result?.totalPnl ?? 0) >= 0 ? C.green : C.red)}
          {statCell('AVG RETURN', result ? `${(result.averageReturnPct * 100).toFixed(2)}%` : '0.00%', C.orange)}
          {statCell('WIN RATE', result ? `${(result.winRate * 100).toFixed(2)}%` : '0.00%', C.cyan)}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {sectionHeader(result ? `${result.strategyName} Results` : 'Backtest Results')}
          <div style={{ backgroundColor: C.bg }}>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 60px 60px 80px 80px', padding: '4px 10px', borderBottom: `1px solid ${C.border}`, backgroundColor: C.header, fontSize: 8, color: C.faint, fontFamily: C.font }}>
              <span>MARKET</span>
              <span>ASSET</span>
              <span>TRADES</span>
              <span>PNL</span>
              <span>RETURN</span>
            </div>
            {(result?.markets ?? []).map(market => (
              <div key={market.marketId} style={{ display: 'grid', gridTemplateColumns: '3fr 60px 60px 80px 80px', padding: '5px 10px', borderBottom: `1px solid ${C.borderFaint}`, fontSize: 9, fontFamily: C.font }}>
                <span style={{ color: C.white }}>{market.question}</span>
                <span style={{ color: C.faint }}>{market.asset}</span>
                <span style={{ color: C.white }}>{market.tradeCount}</span>
                <span style={{ color: market.pnl >= 0 ? C.green : C.red }}>{market.pnl.toFixed(4)}</span>
                <span style={{ color: C.orange }}>{(market.returnPct * 100).toFixed(2)}%</span>
              </div>
            ))}
            {!result && (
              <div style={{ padding: 16, color: C.faint, fontFamily: C.font, fontSize: 9 }}>
                Run a backtest on the persisted 5m market snapshots to populate this view.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Polymarket5mBacktestView;
