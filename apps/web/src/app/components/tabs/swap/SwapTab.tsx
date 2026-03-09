/**
 * SWAP tab — EUR interest rate derivatives.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTerminalTheme } from '@/contexts/ThemeContext';
import { getLiveRates, type LiveRatesSnapshot } from '@/services/swap/swapService';

import YieldCurveChart from './charts/YieldCurveChart';
import DiscountFactorChart from './charts/DiscountFactorChart';
import SpreadChart from './charts/SpreadChart';
import UnifiedPricerPanel from './panels/UnifiedPricerPanel';
import EnhancedBlotterPanel from './panels/EnhancedBlotterPanel';
import DataSourceConfigPanel from './panels/DataSourceConfigPanel';
import RatesBacktestPanel from './panels/RatesBacktestPanel';
import RiskProjectionPanel from './panels/RiskProjectionPanel';

type SubTab = 'market' | 'pricer' | 'blotter' | 'backtest' | 'risk';
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'market', label: 'Market Data' },
  { id: 'pricer', label: 'Pricer' },
  { id: 'blotter', label: 'Blotter' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'risk', label: 'Risk' },
];

const POLL_INTERVAL = 30_000;

function maturityToYears(m: string): number {
  const s = m.trim().toUpperCase();
  if (s.endsWith('Y')) { const n = parseFloat(s.slice(0, -1)); return isNaN(n) ? 999 : n; }
  if (s.endsWith('M')) { const n = parseFloat(s.slice(0, -1)); return isNaN(n) ? 999 : n / 12; }
  if (s.endsWith('W')) { const n = parseFloat(s.slice(0, -1)); return isNaN(n) ? 999 : n / 52; }
  if (s === 'O/N' || s === 'ON' || s.endsWith('D')) return 1 / 365;
  return 999;
}

function Panel({ title, children, colors, fontSize, style }: {
  title: string; children: React.ReactNode;
  colors: ReturnType<typeof useTerminalTheme>['colors'];
  fontSize: ReturnType<typeof useTerminalTheme>['fontSize'];
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}30`,
      borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden', ...style,
    }}>
      <div style={{
        color: colors.primary, padding: '6px 12px',
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
        borderBottom: `1px solid ${colors.textMuted}30`,
        background: `linear-gradient(180deg, ${colors.background}, ${colors.panel})`,
      }}>
        {title}
      </div>
      <div style={{ padding: 10, fontSize: fontSize.body, color: colors.secondary, flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

function RateTable({ rows, colors }: {
  rows: Array<{ label: string; value: string; move?: string }>;
  colors: ReturnType<typeof useTerminalTheme>['colors'];
}) {
  const sorted = [...rows].sort((a, b) => maturityToYears(a.label) - maturityToYears(b.label));
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', padding: '3px 6px', color: colors.primary, fontSize: 9, textTransform: 'uppercase', borderBottom: `1px solid ${colors.textMuted}40` }}>Tenor</th>
          <th style={{ textAlign: 'right', padding: '3px 6px', color: colors.primary, fontSize: 9, textTransform: 'uppercase', borderBottom: `1px solid ${colors.textMuted}40` }}>Rate</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${colors.textMuted}15` }}>
            <td style={{ padding: '3px 6px', color: colors.textMuted, fontWeight: 600 }}>{r.label}</td>
            <td style={{ padding: '3px 6px', textAlign: 'right', color: colors.secondary, fontFamily: 'monospace' }}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SwapTab: React.FC = () => {
  const { colors, fontSize } = useTerminalTheme();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('market');
  const [snapshot, setSnapshot] = useState<LiveRatesSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('—');
  const [pendingTrade, setPendingTrade] = useState<Record<string, unknown> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getLiveRates(force);
      if (data) { setSnapshot(data); setLastUpdate(new Date().toLocaleTimeString()); }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load rates');
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(() => fetchData(), POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  const handleAddToBook = (trade: Record<string, unknown>) => { setPendingTrade(trade); setActiveSubTab('blotter'); };

  const tabBtn = (id: SubTab, label: string) => (
    <button key={id} type="button" onClick={() => setActiveSubTab(id)} style={{
      padding: '5px 14px', fontSize: 10, fontWeight: 700, cursor: 'pointer', borderRadius: 2,
      backgroundColor: activeSubTab === id ? colors.primary : 'transparent',
      color: activeSubTab === id ? colors.background : colors.textMuted,
      border: activeSubTab === id ? 'none' : `1px solid ${colors.textMuted}50`,
      textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all .15s',
    }}>
      {label}
    </button>
  );

  return (
    <div style={{ padding: 10, minHeight: '100%', backgroundColor: colors.background, color: colors.secondary }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, flexWrap: 'wrap', gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 14, color: colors.primary, fontWeight: 800, letterSpacing: '1px' }}>
            EUR RATES & IRD
          </h2>
          <span style={{ fontSize: 9, color: colors.textMuted }}>Last: {lastUpdate}</span>
          {snapshot && <span style={{ fontSize: 9, color: '#22C55E' }}>● LIVE {Math.round(POLL_INTERVAL / 1000)}s</span>}
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {SUB_TABS.map(t => tabBtn(t.id, t.label))}
        </div>
        <button type="button" onClick={() => fetchData(true)} disabled={isLoading} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px',
          backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}40`,
          color: colors.primary, cursor: isLoading ? 'wait' : 'pointer', borderRadius: 3, fontSize: 10,
        }}>
          <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} /> REFRESH
        </button>
      </div>

      {error && (
        <div style={{ padding: 8, marginBottom: 10, backgroundColor: '#EF444415', border: '1px solid #EF444440', borderRadius: 3, color: '#EF4444', fontSize: 10 }}>{error}</div>
      )}

      {activeSubTab === 'pricer' && <UnifiedPricerPanel snapshot={snapshot} onAddToBook={handleAddToBook} />}
      {activeSubTab === 'blotter' && <EnhancedBlotterPanel autoRefreshInterval={POLL_INTERVAL} pendingTrade={pendingTrade} onPendingTradeConsumed={() => setPendingTrade(null)} />}
      {activeSubTab === 'backtest' && <RatesBacktestPanel />}
      {activeSubTab === 'risk' && <RiskProjectionPanel />}

      {activeSubTab === 'market' && (
        <>
          <DataSourceConfigPanel onConfigured={() => fetchData(true)} />

          {isLoading && !snapshot && <div style={{ padding: 40, textAlign: 'center', fontSize: 11, color: colors.textMuted }}>Loading market data…</div>}

          {snapshot && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Yield Curves — full width */}
              <Panel title="Yield Curves" colors={colors} fontSize={fontSize}>
                <YieldCurveChart spotCurve={snapshot.spot_curve} forwardCurve={snapshot.forward_curve} parCurve={snapshot.par_curve} />
              </Panel>

              {/* Row: Money Market | IRS Swap Rates | Discount Factors */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1.2fr) minmax(280px, 1.5fr)', gap: 12 }}>
                <Panel title="Money Market" colors={colors} fontSize={fontSize}>
                  <div style={{ marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 10, color: colors.textMuted, fontWeight: 600 }}>€STR</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: colors.primary, fontFamily: 'monospace' }}>
                      {snapshot.estr != null ? `${snapshot.estr.toFixed(4)}%` : '—'}
                    </span>
                  </div>
                  {Object.keys(snapshot.euribor).length > 0 ? (
                    <RateTable
                      rows={Object.entries(snapshot.euribor).map(([t, r]) => ({ label: t, value: `${Number(r).toFixed(4)}%` }))}
                      colors={colors}
                    />
                  ) : <span style={{ color: colors.textMuted, fontSize: 10 }}>No EURIBOR data</span>}
                </Panel>

                <Panel title="Swap Rates" colors={colors} fontSize={fontSize} style={{ overflow: 'auto', maxHeight: 360 }}>
                  {snapshot.irs_rates.length > 0 ? (
                    <RateTable
                      rows={snapshot.irs_rates.map(p => ({ label: p.tenor, value: `${p.rate.toFixed(4)}%` }))}
                      colors={colors}
                    />
                  ) : <span style={{ color: colors.textMuted, fontSize: 10 }}>No IRS data</span>}
                </Panel>

                <Panel title="Discount Factors" colors={colors} fontSize={fontSize}>
                  <DiscountFactorChart discountFactors={snapshot.discount_factors} />
                </Panel>
              </div>

              {/* Row: Spreads | Butterflies */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Panel title="Curve Spreads (bp)" colors={colors} fontSize={fontSize}>
                  <SpreadChart spreads={snapshot.spreads} flies={{}} />
                </Panel>
                <Panel title="Butterflies (bp)" colors={colors} fontSize={fontSize}>
                  <SpreadChart spreads={{}} flies={snapshot.flies} />
                </Panel>
              </div>

              {/* Futures (if any) */}
              {snapshot.futures.length > 0 && (
                <Panel title="EUR Rate Futures" colors={colors} fontSize={fontSize}>
                  <RateTable
                    rows={snapshot.futures.map(f => ({
                      label: f.name,
                      value: `${f.price.toFixed(2)}  ${f.change >= 0 ? '+' : ''}${f.change.toFixed(2)} (${f.change_percent >= 0 ? '+' : ''}${f.change_percent.toFixed(2)}%)`,
                    }))}
                    colors={colors}
                  />
                </Panel>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SwapTab;
