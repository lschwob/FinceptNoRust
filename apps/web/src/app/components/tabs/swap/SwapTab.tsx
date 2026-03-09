/**
 * SWAP tab — EUR interest rate derivatives.
 * Market Data with curves, Unified Pricer (IRS/Bond/Curve/Fly/ASW/Basis),
 * Enhanced Blotter with real-time P&L, Backtest, Risk Projection.
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
import RatesBacktestPanel from './panels/RatesBacktestPanel';
import RiskProjectionPanel from './panels/RiskProjectionPanel';

type SubTab = 'market' | 'pricer' | 'blotter' | 'backtest' | 'risk';
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'market', label: 'Market Data' },
  { id: 'pricer', label: 'Pricer' },
  { id: 'blotter', label: 'Blotter' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'risk', label: 'Risk Projection' },
];

const POLL_INTERVAL = 30_000;

function Panel({
  title, children, colors, fontSize, style,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTerminalTheme>['colors'];
  fontSize: ReturnType<typeof useTerminalTheme>['fontSize'];
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`,
      borderRadius: 4, display: 'flex', flexDirection: 'column', ...style,
    }}>
      <div style={{
        backgroundColor: colors.background, color: colors.primary, padding: '8px 12px',
        fontSize: fontSize.subheading, fontWeight: 'bold', borderBottom: `1px solid ${colors.textMuted}`,
      }}>
        {title}
      </div>
      <div style={{ padding: '12px', fontSize: fontSize.body, color: colors.secondary, flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function Table({
  rows, columns, colors, fontSize,
}: {
  rows: Array<Record<string, string | number>>;
  columns: Array<{ key: string; label: string }>;
  colors: ReturnType<typeof useTerminalTheme>['colors'];
  fontSize: ReturnType<typeof useTerminalTheme>['fontSize'];
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.small }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${colors.textMuted}` }}>
          {columns.map(c => (
            <th key={c.key} style={{ textAlign: 'left', padding: '4px 8px', color: colors.primary }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${colors.textMuted}30` }}>
            {columns.map(c => (
              <td key={c.key} style={{ padding: '4px 8px' }}>{row[c.key]}</td>
            ))}
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
      if (data) {
        setSnapshot(data);
        setLastUpdate(new Date().toLocaleTimeString());
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load rates');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(() => fetchData(), POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  const handleAddToBook = (trade: Record<string, unknown>) => {
    setPendingTrade(trade);
    setActiveSubTab('blotter');
  };

  return (
    <div style={{ padding: '12px', minHeight: '100%', backgroundColor: colors.background, color: colors.secondary }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: fontSize.heading, color: colors.primary }}>EUR RATES & IRD</h2>
          <div style={{ fontSize: 10, color: colors.textMuted }}>Last: {lastUpdate}</div>
          {snapshot && <div style={{ fontSize: 10, color: '#22C55E' }}>● LIVE ({Math.round(POLL_INTERVAL / 1000)}s)</div>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {SUB_TABS.map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setActiveSubTab(id)}
              style={{
                padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 3,
                backgroundColor: activeSubTab === id ? colors.primary : 'transparent',
                color: activeSubTab === id ? colors.background : colors.textMuted,
                border: `1px solid ${activeSubTab === id ? colors.primary : colors.textMuted}`,
                textTransform: 'uppercase',
              }}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => fetchData(true)} disabled={isLoading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`,
            color: colors.primary, cursor: isLoading ? 'wait' : 'pointer', borderRadius: 4, fontSize: 11,
          }}>
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          REFRESH
        </button>
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, backgroundColor: '#EF444420', border: '1px solid #EF4444', borderRadius: 4, color: '#EF4444', fontSize: 11 }}>{error}</div>
      )}

      {/* Sub-tabs */}
      {activeSubTab === 'pricer' && <UnifiedPricerPanel snapshot={snapshot} onAddToBook={handleAddToBook} />}
      {activeSubTab === 'blotter' && (
        <EnhancedBlotterPanel autoRefreshInterval={POLL_INTERVAL} pendingTrade={pendingTrade} onPendingTradeConsumed={() => setPendingTrade(null)} />
      )}
      {activeSubTab === 'backtest' && <RatesBacktestPanel />}
      {activeSubTab === 'risk' && <RiskProjectionPanel />}

      {activeSubTab === 'market' && (
        <>
          {isLoading && !snapshot && (
            <div style={{ padding: 32, textAlign: 'center' }}>Loading market data…</div>
          )}

          {snapshot && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Yield Curves chart */}
              <Panel title="YIELD CURVES" colors={colors} fontSize={fontSize}>
                <YieldCurveChart
                  spotCurve={snapshot.spot_curve}
                  forwardCurve={snapshot.forward_curve}
                  parCurve={snapshot.par_curve}
                />
              </Panel>

              {/* Row: Money Market | IRS Rates | Discount Factors */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                <Panel title="MONEY MARKET" colors={colors} fontSize={fontSize}>
                  <div style={{ marginBottom: 10 }}>
                    <strong>€STR</strong>{' '}
                    {snapshot.estr != null ? <span style={{ color: colors.primary }}>{snapshot.estr.toFixed(4)}%</span> : '—'}
                  </div>
                  {Object.keys(snapshot.euribor).length > 0 ? (
                    <Table
                      rows={Object.entries(snapshot.euribor).map(([tenor, rate]) => ({ tenor, rate: `${Number(rate).toFixed(4)}%` }))}
                      columns={[{ key: 'tenor', label: 'Tenor' }, { key: 'rate', label: 'Rate' }]}
                      colors={colors} fontSize={fontSize}
                    />
                  ) : <span style={{ color: colors.textMuted }}>No EURIBOR data</span>}
                </Panel>

                <Panel title="EUR IRS SWAP RATES" colors={colors} fontSize={fontSize}>
                  {snapshot.irs_rates.length > 0 ? (
                    <Table
                      rows={snapshot.irs_rates.map(p => ({ tenor: p.tenor, rate: `${p.rate.toFixed(4)}%` }))}
                      columns={[{ key: 'tenor', label: 'Tenor' }, { key: 'rate', label: 'Rate' }]}
                      colors={colors} fontSize={fontSize}
                    />
                  ) : <span style={{ color: colors.textMuted }}>No IRS data</span>}
                </Panel>

                <Panel title="DISCOUNT FACTORS" colors={colors} fontSize={fontSize}>
                  <DiscountFactorChart discountFactors={snapshot.discount_factors} />
                </Panel>
              </div>

              {/* Row: Spreads | Butterflies */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, minHeight: 200 }}>
                <Panel title="CURVE SPREADS (bp)" colors={colors} fontSize={fontSize}>
                  <SpreadChart spreads={snapshot.spreads} flies={{}} />
                </Panel>
                <Panel title="BUTTERFLIES (bp)" colors={colors} fontSize={fontSize}>
                  <SpreadChart spreads={{}} flies={snapshot.flies} />
                </Panel>
              </div>

              {/* Futures */}
              {snapshot.futures.length > 0 && (
                <Panel title="EUR RATE FUTURES" colors={colors} fontSize={fontSize}>
                  <Table
                    rows={snapshot.futures.map(f => ({
                      name: f.name,
                      price: f.price.toFixed(2),
                      change: (f.change >= 0 ? '+' : '') + f.change.toFixed(2),
                      change_pct: (f.change_percent >= 0 ? '+' : '') + f.change_percent.toFixed(2) + '%',
                    }))}
                    columns={[
                      { key: 'name', label: 'Contract' },
                      { key: 'price', label: 'Price' },
                      { key: 'change', label: 'Chg' },
                      { key: 'change_pct', label: '%' },
                    ]}
                    colors={colors} fontSize={fontSize}
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
