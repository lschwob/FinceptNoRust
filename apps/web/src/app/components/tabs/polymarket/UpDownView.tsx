import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, RefreshCw } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { polymarket5mUniverseService } from '@/services/polymarket/Polymarket5mUniverseService';
import { polymarket5mStoreService } from '@/services/polymarket/Polymarket5mStoreService';
import type { Polymarket5mMarketRecord, Polymarket5mMarketState } from '@/services/polymarket/polymarket5mTypes';
import { C, fmtVol, sectionHeader, statCell } from './tokens';

interface UpDownViewProps {
  refreshSignal?: number;
}

const formatPct = (value: number | null | undefined): string => value == null ? 'N/A' : `${(value * 100).toFixed(2)}%`;

const UpDownView: React.FC<UpDownViewProps> = ({ refreshSignal = 0 }) => {
  const [markets, setMarkets] = useState<Polymarket5mMarketRecord[]>(polymarket5mUniverseService.getMarkets());
  const [states, setStates] = useState<Polymarket5mMarketState[]>(polymarket5mStoreService.getAllStates());
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(polymarket5mUniverseService.getLiveMarkets()[0]?.marketId ?? null);

  useEffect(() => {
    polymarket5mUniverseService.ensureStarted();
    polymarket5mStoreService.ensureStarted();

    const syncUniverse = () => {
      const nextMarkets = polymarket5mUniverseService.getMarkets();
      setMarkets(nextMarkets);
      if (!selectedMarketId || !nextMarkets.some(market => market.marketId === selectedMarketId)) {
        setSelectedMarketId(nextMarkets[0]?.marketId ?? null);
      }
    };

    const syncStates = () => {
      setStates(polymarket5mStoreService.getAllStates());
    };

    polymarket5mUniverseService.on('universeUpdated', syncUniverse);
    polymarket5mStoreService.on('stateUpdated', syncStates);
    polymarket5mStoreService.on('snapshot', syncStates);
    syncUniverse();
    syncStates();

    return () => {
      polymarket5mUniverseService.off('universeUpdated', syncUniverse);
      polymarket5mStoreService.off('stateUpdated', syncStates);
      polymarket5mStoreService.off('snapshot', syncStates);
    };
  }, [selectedMarketId]);

  useEffect(() => {
    void polymarket5mUniverseService.refreshNow();
  }, [refreshSignal]);

  const liveMarkets = useMemo(() => markets.filter(market => market.active && !market.closed && !market.archived), [markets]);
  const selectedMarket = useMemo(
    () => liveMarkets.find(market => market.marketId === selectedMarketId) ?? liveMarkets[0] ?? null,
    [liveMarkets, selectedMarketId]
  );
  const selectedState = selectedMarket ? states.find(state => state.market.marketId === selectedMarket.marketId) ?? polymarket5mStoreService.getState(selectedMarket.marketId) : null;
  const selectedSeries = selectedMarket ? polymarket5mStoreService.getSeries(selectedMarket.marketId) : [];

  const chartData = useMemo(() => selectedSeries.slice(-900).map(snapshot => ({
    timestamp: snapshot.capturedAt,
    label: new Date(snapshot.capturedAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
    yes: snapshot.yesMid,
    no: snapshot.noMid,
  })), [selectedSeries]);

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', backgroundColor: C.bg }}>
      <div style={{ width: 360, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, backgroundColor: C.header, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={12} style={{ color: C.orange }} />
            <span style={{ fontSize: 10, fontWeight: 'bold', color: C.orange, letterSpacing: '0.5px', fontFamily: C.font }}>UP/DOWN CRYPTO 5M</span>
          </div>
          <button
            onClick={() => { void polymarket5mUniverseService.refreshNow(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', backgroundColor: C.bg, color: C.white, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 9, fontFamily: C.font }}
          >
            <RefreshCw size={10} />
            REFRESH
          </button>
        </div>

        <div style={{ padding: '4px 10px', borderBottom: `1px solid ${C.border}`, fontSize: 9, color: C.faint, fontFamily: C.font }}>
          {liveMarkets.length} live markets, {markets.length} tracked
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {liveMarkets.length === 0 ? (
            <div style={{ margin: 12, padding: 12, backgroundColor: '#2A0000', border: `1px solid ${C.red}`, display: 'flex', gap: 8 }}>
              <AlertCircle size={14} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 9, color: C.white, fontFamily: C.font }}>
                No live 5m Up/Down crypto market currently detected.
              </div>
            </div>
          ) : liveMarkets.map(market => {
            const state = states.find(item => item.market.marketId === market.marketId);
            const selected = selectedMarket?.marketId === market.marketId;
            return (
              <div
                key={market.marketId}
                onClick={() => setSelectedMarketId(market.marketId)}
                style={{
                  padding: '8px 10px',
                  borderBottom: `1px solid ${C.borderFaint}`,
                  cursor: 'pointer',
                  backgroundColor: selected ? '#1A1200' : 'transparent',
                  borderLeft: `2px solid ${selected ? C.orange : 'transparent'}`,
                  fontFamily: C.font,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 9, color: C.white, fontWeight: 'bold', lineHeight: 1.35 }}>{market.question}</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: state?.stale ? C.orange : C.green, flexShrink: 0 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 6 }}>
                  <span style={{ fontSize: 8, color: C.faint }}>{market.asset}</span>
                  <span style={{ fontSize: 8, color: C.green }}>{formatPct(state?.yes.mid ?? state?.latestSnapshot?.yesMid ?? null)}</span>
                  <span style={{ fontSize: 8, color: C.red }}>{formatPct(state?.no.mid ?? state?.latestSnapshot?.noMid ?? null)}</span>
                  <span style={{ fontSize: 8, color: C.cyan, textAlign: 'right' }}>{new Date(market.endTs).toLocaleTimeString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedMarket || !selectedState ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontFamily: C.font, fontSize: 11 }}>
            Select a live market.
          </div>
        ) : (
          <>
            <div style={{ padding: '8px 12px', borderBottom: `2px solid ${C.orange}`, backgroundColor: C.bg }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 'bold', color: C.orange, fontFamily: C.font }}>{selectedMarket.question}</div>
                  <div style={{ marginTop: 4, fontSize: 9, color: C.faint, fontFamily: C.font }}>
                    {selectedMarket.asset} • ends {new Date(selectedMarket.endTs).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: selectedState.stale ? C.orange : C.green, fontFamily: C.font }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: selectedState.stale ? C.orange : C.green }} />
                  {selectedState.stale ? 'REST FALLBACK' : 'WEBSOCKET'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, backgroundColor: C.border, flexShrink: 0 }}>
              {statCell('YES MID', formatPct(selectedState.latestSnapshot?.yesMid))}
              {statCell('NO MID', formatPct(selectedState.latestSnapshot?.noMid))}
              {statCell('SPREAD', formatPct(selectedState.latestSnapshot?.spread))}
              {statCell('TICKS', String((selectedSeries.length)))}
              {statCell('VOLUME', fmtVol(selectedState.latestSnapshot?.volume ?? 0), C.cyan)}
              {statCell('PTB', selectedMarket.priceToBeat != null ? String(selectedMarket.priceToBeat) : 'N/A')}
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
              {sectionHeader('Live Probability')}
              <div style={{ height: 320, backgroundColor: C.bg, borderBottom: `1px solid ${C.border}` }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#161616" />
                    <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 8, fontFamily: C.font }} tickLine={false} axisLine={{ stroke: '#222' }} interval={Math.max(1, Math.floor(chartData.length / 8))} />
                    <YAxis domain={[0, 1]} tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} tick={{ fill: C.faint, fontSize: 8, fontFamily: C.font }} tickLine={false} axisLine={{ stroke: '#222' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#101010', border: `1px solid ${C.border}`, borderRadius: 2, fontFamily: C.font, fontSize: 9 }} />
                    <Legend wrapperStyle={{ fontSize: 9, fontFamily: C.font }} />
                    <ReferenceLine y={0.5} stroke={C.orange} strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="yes" name="YES MID" stroke={C.green} dot={false} strokeWidth={1.6} isAnimationActive={false} />
                    <Line type="monotone" dataKey="no" name="NO MID" stroke={C.red} dot={false} strokeWidth={1.6} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, backgroundColor: C.border }}>
                {([
                  { title: 'YES BOOK', color: C.green, book: selectedState.yes },
                  { title: 'NO BOOK', color: C.red, book: selectedState.no },
                ] as const).map(({ title, color, book }) => (
                  <div key={title} style={{ backgroundColor: C.bg }}>
                    {sectionHeader(title)}
                    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', padding: '3px 8px', backgroundColor: '#0B0B0B', borderBottom: `1px solid ${C.border}`, fontSize: 8, color: C.faint, fontFamily: C.font }}>
                      <span>PRICE</span>
                      <span>SIZE</span>
                    </div>
                    {(book.asks.slice(0, 6).concat(book.bids.slice(0, 6))).map((level, index) => (
                      <div key={`${title}-${index}-${level.price}-${level.size}`} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', padding: '3px 8px', borderBottom: `1px solid ${C.borderFaint}`, fontSize: 9, fontFamily: C.font }}>
                        <span style={{ color }}>{formatPct(level.price)}</span>
                        <span style={{ color: C.white }}>{level.size.toFixed(2)}</span>
                      </div>
                    ))}
                    {book.asks.length === 0 && book.bids.length === 0 && (
                      <div style={{ padding: 16, textAlign: 'center', fontSize: 9, color: C.faint, fontFamily: C.font }}>
                        Waiting for book data…
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UpDownView;
