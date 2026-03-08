/**
 * Rates Backtest — Strategy params, equity curve (DataChart), trades table & stats.
 */
import React, { useState } from 'react';
import { useTerminalTheme } from '@/contexts/ThemeContext';
import { DataChart } from '@/components/common/charts';
import { FINCEPT_COLORS } from '@/components/common/charts/types';
import { backtestRatesStrategy, type RatesBacktestResult } from '@/services/swap/swapService';

export default function RatesBacktestPanel() {
  const { colors, fontSize } = useTerminalTheme();
  const [strategy, setStrategy] = useState('curve_steepener');
  const [instrument, setInstrument] = useState('2s10s');
  const [entryThreshold, setEntryThreshold] = useState('0.5');
  const [exitThreshold, setExitThreshold] = useState('1.5');
  const [notional, setNotional] = useState('10000000');
  const [result, setResult] = useState<RatesBacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<'trades' | 'stats'>('trades');

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await backtestRatesStrategy({
        strategy,
        instrument,
        entry_threshold: Number(entryThreshold),
        exit_threshold: Number(exitThreshold),
        notional: Number(notional),
      });
      if (r) setResult(r);
      else setError('Backtest failed');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const equityData = result?.equity_curve?.map(({ date, cumulative }) => ({ date, value: cumulative })) ?? [];

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase' }}>Strategy</span>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)} style={{ padding: '6px 10px', backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small, minWidth: 160 }}>
            <option value="curve_steepener">Curve steepener</option>
            <option value="curve_flattener">Curve flattener</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase' }}>Instrument</span>
          <select value={instrument} onChange={(e) => setInstrument(e.target.value)} style={{ padding: '6px 10px', backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small, minWidth: 100 }}>
            <option value="2s10s">2s10s</option>
            <option value="2s30s">2s30s</option>
            <option value="5s30s">5s30s</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase' }}>Entry (spread %)</span>
          <input type="number" value={entryThreshold} onChange={(e) => setEntryThreshold(e.target.value)} step="0.1" style={{ padding: '6px 10px', width: 80, backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase' }}>Exit (spread %)</span>
          <input type="number" value={exitThreshold} onChange={(e) => setExitThreshold(e.target.value)} step="0.1" style={{ padding: '6px 10px', width: 80, backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase' }}>Notional</span>
          <input type="number" value={notional} onChange={(e) => setNotional(e.target.value)} style={{ padding: '6px 10px', width: 120, backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }} />
        </label>
        <button type="button" onClick={run} disabled={loading} style={{ padding: '6px 16px', backgroundColor: loading ? colors.textMuted : colors.primary, color: colors.background, border: 'none', borderRadius: 4, cursor: loading ? 'wait' : 'pointer', fontSize: fontSize.small, fontWeight: 600 }}>
          {loading ? 'Running…' : 'Run backtest'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 8, backgroundColor: colors.alert + '20', border: `1px solid ${colors.alert}`, borderRadius: 4, color: colors.alert, fontSize: fontSize.small }}>
          {error}
        </div>
      )}

      {result && (
        <>
          <div style={{ minHeight: 280, backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 12 }}>
            <div style={{ fontSize: fontSize.subheading, fontWeight: 600, color: colors.primary, marginBottom: 8 }}>Equity curve</div>
            {equityData.length > 0 ? (
              <DataChart
                data={equityData}
                sourceColor={FINCEPT_COLORS.ORANGE}
                formatValue={(v) => `€${v.toLocaleString('en-EU', { maximumFractionDigits: 0 })}`}
                width={700}
                height={260}
              />
            ) : (
              <div style={{ padding: 24, color: colors.textMuted }}>No equity data</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${colors.textMuted}`, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${colors.textMuted}` }}>
              <button type="button" onClick={() => setBottomTab('trades')} style={{ padding: '8px 16px', backgroundColor: bottomTab === 'trades' ? colors.panel : 'transparent', border: 'none', color: bottomTab === 'trades' ? colors.primary : colors.textMuted, cursor: 'pointer', fontSize: fontSize.small, fontWeight: 600 }}>
                Trades
              </button>
              <button type="button" onClick={() => setBottomTab('stats')} style={{ padding: '8px 16px', backgroundColor: bottomTab === 'stats' ? colors.panel : 'transparent', border: 'none', color: bottomTab === 'stats' ? colors.primary : colors.textMuted, cursor: 'pointer', fontSize: fontSize.small, fontWeight: 600 }}>
                Statistics
              </button>
            </div>
            <div style={{ padding: 12, backgroundColor: colors.panel, maxHeight: 280, overflow: 'auto' }}>
              {bottomTab === 'trades' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.small }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.textMuted}` }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: colors.primary }}>Entry</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: colors.primary }}>Exit</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: colors.primary }}>Position</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: colors.primary }}>Entry spread</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: colors.primary }}>Exit spread</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: colors.primary }}>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${colors.textMuted}` }}>
                        <td style={{ padding: '6px 8px' }}>{t.entry_date}</td>
                        <td style={{ padding: '6px 8px' }}>{t.exit_date}</td>
                        <td style={{ padding: '6px 8px' }}>{t.position}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{t.entry_spread.toFixed(2)}%</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{t.exit_spread.toFixed(2)}%</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: t.pnl >= 0 ? colors.primary : colors.alert }}>{t.pnl >= 0 ? '+' : ''}€{t.pnl.toLocaleString('en-EU', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {bottomTab === 'stats' && result.stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                  <div style={{ padding: 10, backgroundColor: colors.background, borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Total trades</div>
                    <div style={{ fontSize: fontSize.body, color: colors.primary }}>{result.stats.total_trades}</div>
                  </div>
                  <div style={{ padding: 10, backgroundColor: colors.background, borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Win rate</div>
                    <div style={{ fontSize: fontSize.body, color: colors.primary }}>{(result.stats.win_rate * 100).toFixed(0)}%</div>
                  </div>
                  <div style={{ padding: 10, backgroundColor: colors.background, borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Total P&L</div>
                    <div style={{ fontSize: fontSize.body, color: result.stats.total_pnl >= 0 ? colors.primary : colors.alert }}>€{result.stats.total_pnl.toLocaleString('en-EU', { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div style={{ padding: 10, backgroundColor: colors.background, borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Max drawdown</div>
                    <div style={{ fontSize: fontSize.body, color: colors.alert }}>€{result.stats.max_drawdown.toLocaleString('en-EU', { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div style={{ padding: 10, backgroundColor: colors.background, borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Sharpe</div>
                    <div style={{ fontSize: fontSize.body, color: colors.primary }}>{result.stats.sharpe.toFixed(2)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!result && !loading && !error && (
        <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>Set parameters and run backtest.</div>
      )}
    </div>
  );
}
