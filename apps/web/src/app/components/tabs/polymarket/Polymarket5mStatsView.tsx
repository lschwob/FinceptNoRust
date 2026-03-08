import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { polymarket5mDbService } from '@/services/polymarket/polymarket5mDbService';
import type { Polymarket5mAsset, Polymarket5mMarketRecord, Polymarket5mMarketStatsRow, Polymarket5mSnapshot, Polymarket5mStatsResponse } from '@/services/polymarket/polymarket5mTypes';
import { C, sectionHeader, statCell } from './tokens';

const HOURS_OPTIONS = [24, 48, 72, 168];

const formatPct = (value: number | null | undefined): string => value == null ? 'N/A' : `${(value * 100).toFixed(2)}%`;

const assetOptions: Array<Polymarket5mAsset | 'all'> = ['all', 'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX'];

const Polymarket5mStatsView: React.FC = () => {
  const [hours, setHours] = useState(48);
  const [asset, setAsset] = useState<Polymarket5mAsset | 'all'>('all');
  const [stats, setStats] = useState<Polymarket5mStatsResponse | null>(null);
  const [series, setSeries] = useState<{ market?: Polymarket5mMarketRecord; snapshots: Polymarket5mSnapshot[] }>({ snapshots: [] });
  const [selectedRow, setSelectedRow] = useState<Polymarket5mMarketStatsRow | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const response = await polymarket5mDbService.getStats({
        hours,
        asset: asset === 'all' ? undefined : asset,
      });
      setStats(response);
      const nextSelected = response.markets[0] ?? null;
      setSelectedRow(current => current && response.markets.some(row => row.marketId === current.marketId) ? current : nextSelected);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, [hours, asset]);

  useEffect(() => {
    if (!selectedRow) {
      setSeries({ snapshots: [] });
      return;
    }
    let cancelled = false;
    void polymarket5mDbService.getSeries({ market_id: selectedRow.marketId, hours }).then((payload) => {
      if (cancelled) return;
      setSeries({
        market: payload.markets[0],
        snapshots: payload.snapshots,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedRow?.marketId, hours]);

  const chartData = useMemo(() => series.snapshots.slice(-1200).map(snapshot => ({
    label: new Date(snapshot.capturedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    yes: snapshot.yesMid,
    no: snapshot.noMid,
  })), [series.snapshots]);

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', backgroundColor: C.bg }}>
      <div style={{ width: 360, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, backgroundColor: C.header, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={12} style={{ color: C.orange }} />
            <span style={{ fontSize: 10, fontWeight: 'bold', color: C.orange, fontFamily: C.font }}>5M STATS</span>
          </div>
          <button onClick={() => { void loadStats(); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', backgroundColor: C.bg, color: C.white, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 9, fontFamily: C.font }}>
            <RefreshCw size={10} /> REFRESH
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 10, borderBottom: `1px solid ${C.border}` }}>
          <select value={String(hours)} onChange={event => setHours(Number(event.target.value))} style={{ backgroundColor: C.bg, color: C.white, border: `1px solid ${C.border}`, fontSize: 9, padding: '4px 6px', fontFamily: C.font }}>
            {HOURS_OPTIONS.map(option => <option key={option} value={option}>{option}h</option>)}
          </select>
          <select value={asset} onChange={event => setAsset(event.target.value as Polymarket5mAsset | 'all')} style={{ backgroundColor: C.bg, color: C.white, border: `1px solid ${C.border}`, fontSize: 9, padding: '4px 6px', fontFamily: C.font }}>
            {assetOptions.map(option => <option key={option} value={option}>{option.toUpperCase()}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {stats?.markets.map(row => {
            const selected = selectedRow?.marketId === row.marketId;
            return (
              <div key={row.marketId} onClick={() => setSelectedRow(row)} style={{ padding: '8px 10px', borderBottom: `1px solid ${C.borderFaint}`, cursor: 'pointer', backgroundColor: selected ? '#1A1200' : 'transparent', borderLeft: `2px solid ${selected ? C.orange : 'transparent'}`, fontFamily: C.font }}>
                <div style={{ fontSize: 9, color: C.white, fontWeight: 'bold', lineHeight: 1.35 }}>{row.question}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 6, fontSize: 8 }}>
                  <span style={{ color: C.faint }}>{row.asset}</span>
                  <span style={{ color: C.green }}>{formatPct(row.maxYes)}</span>
                  <span style={{ color: C.red }}>{row.turnaroundCount} turns</span>
                </div>
              </div>
            );
          })}
          {!loading && (!stats || stats.markets.length === 0) && (
            <div style={{ padding: 16, color: C.faint, fontFamily: C.font, fontSize: 9 }}>No persisted 5m stats available yet.</div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, backgroundColor: C.border }}>
          {statCell('MARKETS', String(stats?.summary.marketCount ?? 0))}
          {statCell('SNAPSHOTS', String(stats?.summary.snapshotCount ?? 0))}
          {statCell('AVG TURNS', (stats?.summary.avgTurnarounds ?? 0).toFixed(2), C.orange)}
          {statCell('LOW YES', formatPct(stats?.summary.lowestYes), C.green)}
          {statCell('HIGH YES', formatPct(stats?.summary.highestYes), C.green)}
          {statCell('AVG SPREAD', formatPct(stats?.summary.avgSpread), C.cyan)}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {sectionHeader(selectedRow ? selectedRow.question : 'Market Drilldown')}
          <div style={{ height: 320, borderBottom: `1px solid ${C.border}` }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#161616" />
                <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 8, fontFamily: C.font }} tickLine={false} axisLine={{ stroke: '#222' }} interval={Math.max(1, Math.floor(chartData.length / 8))} />
                <YAxis domain={[0, 1]} tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} tick={{ fill: C.faint, fontSize: 8, fontFamily: C.font }} tickLine={false} axisLine={{ stroke: '#222' }} />
                <Tooltip contentStyle={{ backgroundColor: '#101010', border: `1px solid ${C.border}`, borderRadius: 2, fontFamily: C.font, fontSize: 9 }} />
                <ReferenceLine y={0.5} stroke={C.orange} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="yes" stroke={C.green} dot={false} strokeWidth={1.4} isAnimationActive={false} />
                <Line type="monotone" dataKey="no" stroke={C.red} dot={false} strokeWidth={1.4} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {selectedRow && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, backgroundColor: C.border, marginTop: 1 }}>
              {statCell('MIN YES', formatPct(selectedRow.minYes), C.green)}
              {statCell('MAX YES', formatPct(selectedRow.maxYes), C.green)}
              {statCell('MIN NO', formatPct(selectedRow.minNo), C.red)}
              {statCell('MAX NO', formatPct(selectedRow.maxNo), C.red)}
              {statCell('1ST TURN', selectedRow.firstTurnaroundMs != null ? `${Math.round(selectedRow.firstTurnaroundMs / 1000)}s` : 'N/A', C.orange)}
              {statCell('MAX SPREAD', formatPct(selectedRow.maxSpread), C.cyan)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Polymarket5mStatsView;
