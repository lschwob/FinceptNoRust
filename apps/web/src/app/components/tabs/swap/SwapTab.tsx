/**
 * SWAP tab — EUR interest rate derivatives: Market Data, IRS/Bond pricers, paper trading, backtesting.
 */
import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTerminalTheme } from '@/contexts/ThemeContext';
import { useCache } from '@/hooks/useCache';
import { getSwapTabSnapshot, SwapTabSnapshot } from '@/services/swap/swapService';
import IRSPricerPanel from './panels/IRSPricerPanel';
import BondPricerPanel from './panels/BondPricerPanel';
import SwapPaperTradingPanel from './panels/SwapPaperTradingPanel';
import RatesBacktestPanel from './panels/RatesBacktestPanel';
import RiskProjectionPanel from './panels/RiskProjectionPanel';

type SubTab = 'market' | 'irs' | 'bond' | 'paper' | 'backtest' | 'risk';
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'market', label: 'Market Data' },
  { id: 'irs', label: 'IRS Pricer' },
  { id: 'bond', label: 'Bond Pricer' },
  { id: 'paper', label: 'Paper Trading' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'risk', label: 'Risk Projection' },
];

const SNAPSHOT_TTL = 5 * 60 * 1000; // 5 min
const REFETCH_INTERVAL = 10 * 60 * 1000; // 10 min

function Panel({
  title,
  children,
  colors,
  fontSize,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTerminalTheme>['colors'];
  fontSize: ReturnType<typeof useTerminalTheme>['fontSize'];
}) {
  return (
    <div
      style={{
        backgroundColor: colors.panel,
        border: `1px solid ${colors.textMuted}`,
        flex: '1 1 320px',
        minWidth: '280px',
        maxWidth: '500px',
        margin: '8px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          backgroundColor: colors.background,
          color: colors.primary,
          padding: '8px',
          fontSize: fontSize.subheading,
          fontWeight: 'bold',
          borderBottom: `1px solid ${colors.textMuted}`,
        }}
      >
        {title}
      </div>
      <div style={{ padding: '12px', fontSize: fontSize.body, color: colors.secondary, flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function Table({
  rows,
  columns,
  colors,
  fontSize,
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
          {columns.map((c) => (
            <th key={c.key} style={{ textAlign: 'left', padding: '4px 8px', color: colors.primary }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${colors.textMuted}` }}>
            {columns.map((c) => (
              <td key={c.key} style={{ padding: '4px 8px' }}>
                {row[c.key]}
              </td>
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
  const { data, isLoading, isFetching, error, refresh } = useCache<SwapTabSnapshot | null>({
    key: 'swap:tab:snapshot',
    category: 'swap-rates',
    fetcher: getSwapTabSnapshot,
    ttl: SNAPSHOT_TTL,
    enabled: true,
    refetchInterval: REFETCH_INTERVAL,
    staleWhileRevalidate: true,
  });

  const snapshot = data ?? null;

  return (
    <div
      style={{
        padding: '12px',
        minHeight: '100%',
        backgroundColor: colors.background,
        color: colors.secondary,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: fontSize.heading, color: colors.primary }}>
          EUR Rates & IRD
        </h2>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {SUB_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSubTab(id)}
              style={{
                padding: '6px 12px',
                backgroundColor: activeSubTab === id ? colors.primary : 'transparent',
                color: activeSubTab === id ? colors.background : colors.textMuted,
                border: `1px solid ${colors.textMuted}`,
                borderRadius: '2px',
                fontSize: fontSize.small,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={isFetching}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            backgroundColor: colors.panel,
            border: `1px solid ${colors.textMuted}`,
            color: colors.primary,
            cursor: isFetching ? 'wait' : 'pointer',
            borderRadius: '4px',
          }}
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '12px',
            marginBottom: '12px',
            backgroundColor: colors.alert + '20',
            border: `1px solid ${colors.alert}`,
            borderRadius: '4px',
          }}
        >
          {error.message}
        </div>
      )}

      {isLoading && !snapshot && activeSubTab === 'market' && (
        <div style={{ padding: '24px', textAlign: 'center' }}>Loading SWAP data…</div>
      )}

      {activeSubTab === 'irs' && <IRSPricerPanel />}
      {activeSubTab === 'bond' && <BondPricerPanel />}
      {activeSubTab === 'paper' && <SwapPaperTradingPanel />}
      {activeSubTab === 'backtest' && <RatesBacktestPanel />}
      {activeSubTab === 'risk' && <RiskProjectionPanel />}

      {activeSubTab === 'market' && snapshot && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
          {/* Money Market */}
          <Panel title="Money Market" colors={colors} fontSize={fontSize}>
            <div style={{ marginBottom: '12px' }}>
              <strong>€STR</strong>{' '}
              {snapshot.estr.rate != null ? `${snapshot.estr.rate.toFixed(4)}%` : '—'}
            </div>
            {Object.keys(snapshot.euribor).length > 0 ? (
              <Table
                rows={Object.entries(snapshot.euribor).map(([tenor, rate]) => ({
                  tenor,
                  rate: `${Number(rate).toFixed(4)}%`,
                }))}
                columns={[
                  { key: 'tenor', label: 'Tenor' },
                  { key: 'rate', label: 'Rate' },
                ]}
                colors={colors}
                fontSize={fontSize}
              />
            ) : (
              <span style={{ color: colors.textMuted }}>No EURIBOR data</span>
            )}
          </Panel>

          {/* ECB Yield Curve (Spot) */}
          <Panel title="ECB Yield Curve (Spot)" colors={colors} fontSize={fontSize}>
            {snapshot.yield_curve_spot.length > 0 ? (
              <Table
                rows={snapshot.yield_curve_spot.map((p) => ({
                  maturity: p.maturity,
                  value: `${p.value.toFixed(4)}%`,
                }))}
                columns={[
                  { key: 'maturity', label: 'Maturity' },
                  { key: 'value', label: 'Rate' },
                ]}
                colors={colors}
                fontSize={fontSize}
              />
            ) : (
              <span style={{ color: colors.textMuted }}>No curve data</span>
            )}
          </Panel>

          {/* EUR IRS Swap Rates */}
          <Panel title="EUR IRS Swap Rates" colors={colors} fontSize={fontSize}>
            {snapshot.eur_irs_rates.length > 0 ? (
              <Table
                rows={snapshot.eur_irs_rates.map((p) => ({
                  tenor: p.tenor,
                  rate: `${p.rate.toFixed(4)}%`,
                }))}
                columns={[
                  { key: 'tenor', label: 'Tenor' },
                  { key: 'rate', label: 'Rate' },
                ]}
                colors={colors}
                fontSize={fontSize}
              />
            ) : (
              <span style={{ color: colors.textMuted }}>No IRS data</span>
            )}
          </Panel>

          {/* EUR Rate Futures */}
          <Panel title="EUR Rate Futures" colors={colors} fontSize={fontSize}>
            {snapshot.eur_futures.length > 0 ? (
              <Table
                rows={snapshot.eur_futures.map((f) => ({
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
                colors={colors}
                fontSize={fontSize}
              />
            ) : (
              <span style={{ color: colors.textMuted }}>No futures data</span>
            )}
          </Panel>

          {/* Curve Analysis */}
          <Panel title="Curve Analysis" colors={colors} fontSize={fontSize}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {snapshot.curve_analysis.spread_2s10s != null && (
                <div>
                  <strong>2s10s spread</strong>: {(snapshot.curve_analysis.spread_2s10s * 100).toFixed(1)} bp
                </div>
              )}
              {snapshot.curve_analysis.spread_2s30s != null && (
                <div>
                  <strong>2s30s spread</strong>: {(snapshot.curve_analysis.spread_2s30s * 100).toFixed(1)} bp
                </div>
              )}
              {snapshot.curve_analysis.inverted_2s10s === true && (
                <div style={{ color: colors.alert }}>2s10s curve inverted</div>
              )}
              {!snapshot.curve_analysis.spread_2s10s && !snapshot.curve_analysis.spread_2s30s && (
                <span style={{ color: colors.textMuted }}>No curve analysis</span>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};

export default SwapTab;
