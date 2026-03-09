import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useTerminalTheme } from '@/contexts/ThemeContext';
import {
  swapPtCreateBook, swapPtListBooks, swapPtEnterTrade,
  swapPtCloseTrade, swapPtMtmBook, swapPtGetRisk,
  type SwapBook, type SwapTrade, type BookMtmResult,
} from '@/services/swap/swapService';

function pnlColor(value: number): string {
  if (value > 0) return '#22C55E';
  if (value < 0) return '#EF4444';
  return '#888';
}

function fmtNum(v: number, decimals = 0): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function fmtPnl(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}€${fmtNum(v)}`;
}

interface Props {
  autoRefreshInterval?: number;
  pendingTrade?: Record<string, unknown> | null;
  onPendingTradeConsumed?: () => void;
}

export default function EnhancedBlotterPanel({ autoRefreshInterval = 30000, pendingTrade, onPendingTradeConsumed }: Props) {
  const { colors, fontSize } = useTerminalTheme();
  const [books, setBooks] = useState<SwapBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [trades, setTrades] = useState<SwapTrade[]>([]);
  const [summary, setSummary] = useState<BookMtmResult['summary'] | null>(null);
  const [riskByTenor, setRiskByTenor] = useState<Record<string, number>>({});
  const [newBookName, setNewBookName] = useState('EUR Rates Book');
  const [loading, setLoading] = useState(false);
  const [lastMtm, setLastMtm] = useState<string>('—');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadBooks = useCallback(async () => {
    const list = await swapPtListBooks();
    setBooks(list);
    if (list.length > 0 && !selectedBookId) setSelectedBookId(list[0].id);
  }, [selectedBookId]);

  const refreshMtm = useCallback(async () => {
    if (!selectedBookId) return;
    const result = await swapPtMtmBook(selectedBookId);
    if (result) {
      setTrades(result.trades);
      setSummary(result.summary);
      setLastMtm(new Date().toLocaleTimeString());
    }
    const risk = await swapPtGetRisk(selectedBookId);
    if (risk) setRiskByTenor(risk.by_tenor);
  }, [selectedBookId]);

  useEffect(() => { loadBooks(); }, []);
  useEffect(() => {
    if (selectedBookId) refreshMtm();
    else { setTrades([]); setSummary(null); }
  }, [selectedBookId]);

  useEffect(() => {
    if (!selectedBookId || autoRefreshInterval <= 0) return;
    intervalRef.current = setInterval(refreshMtm, autoRefreshInterval);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [selectedBookId, autoRefreshInterval, refreshMtm]);

  useEffect(() => {
    if (pendingTrade && selectedBookId) {
      (async () => {
        await swapPtEnterTrade({ ...pendingTrade, book_id: selectedBookId });
        await refreshMtm();
        onPendingTradeConsumed?.();
      })();
    }
  }, [pendingTrade]);

  const handleCreateBook = async () => {
    setLoading(true);
    const book = await swapPtCreateBook({ name: newBookName, currency: 'EUR' });
    if (book) { await loadBooks(); setSelectedBookId(book.id); }
    setLoading(false);
  };

  const handleClose = async (tradeId: string) => {
    await swapPtCloseTrade(tradeId);
    await refreshMtm();
  };

  const activeTrades = trades.filter(t => t.status === 'active');
  const closedTrades = trades.filter(t => t.status === 'closed');

  const dv01Data = Object.entries(riskByTenor)
    .map(([tenor, dv01]) => ({ tenor, dv01: Math.round(dv01) }))
    .sort((a, b) => {
      const parse = (s: string) => { const n = parseFloat(s); return s.endsWith('Y') ? n : n / 12; };
      return parse(a.tenor) - parse(b.tenor);
    });

  const inputStyle: React.CSSProperties = {
    padding: '6px 8px', backgroundColor: colors.background,
    border: `1px solid ${colors.textMuted}`, color: colors.secondary,
    borderRadius: 4, fontSize: 11,
  };

  return (
    <div style={{ padding: 12 }}>
      {/* Header with book selector and summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={selectedBookId ?? ''} onChange={e => setSelectedBookId(e.target.value || null)}
          style={{ ...inputStyle, width: 200, fontWeight: 600 }}>
          <option value="">— Select Book —</option>
          {books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input value={newBookName} onChange={e => setNewBookName(e.target.value)} placeholder="New book name" style={{ ...inputStyle, width: 160 }} />
        <button type="button" onClick={handleCreateBook} disabled={loading}
          style={{ padding: '6px 14px', backgroundColor: colors.primary, color: colors.background, border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          + NEW BOOK
        </button>
        <button type="button" onClick={refreshMtm} disabled={!selectedBookId}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, color: colors.primary, borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>
          <RefreshCw size={12} /> MTM
        </button>
        <div style={{ fontSize: 10, color: colors.textMuted }}>Last: {lastMtm}</div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <SummaryCard label="Unrealized P&L" value={fmtPnl(summary.total_unrealized_pnl)} valueColor={pnlColor(summary.total_unrealized_pnl)} colors={colors} />
          <SummaryCard label="Realized P&L" value={fmtPnl(summary.total_realized_pnl)} valueColor={pnlColor(summary.total_realized_pnl)} colors={colors} />
          <SummaryCard label="Total P&L" value={fmtPnl(summary.total_pnl)} valueColor={pnlColor(summary.total_pnl)} colors={colors} />
          <SummaryCard label="Total PV" value={`€${fmtNum(summary.total_pv)}`} valueColor={colors.primary} colors={colors} />
          <SummaryCard label="Total DV01" value={`€${fmtNum(summary.total_dv01)}`} valueColor={colors.primary} colors={colors} />
          <SummaryCard label="Active Trades" value={`${summary.active_trades}`} valueColor={colors.primary} colors={colors} />
        </div>
      )}

      {/* Trade table */}
      <div style={{ overflow: 'auto', backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 900 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${colors.textMuted}` }}>
              {['Type','Description','Notional','Entry','Current','PV','P&L','DV01','Status',''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: colors.primary, fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeTrades.map(t => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${colors.textMuted}30` }}>
                <td style={{ padding: '6px 10px', fontWeight: 600 }}>{t.product_type || t.type}</td>
                <td style={{ padding: '6px 10px' }}>{t.description || `${t.tenor_years}Y ${t.position}`}</td>
                <td style={{ padding: '6px 10px' }}>€{fmtNum(t.notional)}</td>
                <td style={{ padding: '6px 10px' }}>{t.entry_level ? `${t.entry_level}bp` : `${t.fixed_rate}%`}</td>
                <td style={{ padding: '6px 10px' }}>{t.current_level ? `${t.current_level}bp` : '—'}</td>
                <td style={{ padding: '6px 10px', color: pnlColor(t.current_pv) }}>€{fmtNum(t.current_pv)}</td>
                <td style={{ padding: '6px 10px', color: pnlColor(t.unrealized_pnl), fontWeight: 700 }}>{fmtPnl(t.unrealized_pnl)}</td>
                <td style={{ padding: '6px 10px' }}>€{fmtNum(t.dv01)}</td>
                <td style={{ padding: '6px 10px', color: '#22C55E' }}>● ACTIVE</td>
                <td style={{ padding: '6px 10px' }}>
                  <button type="button" onClick={() => handleClose(t.id)}
                    style={{ padding: '2px 10px', fontSize: 9, backgroundColor: 'transparent', border: `1px solid #EF4444`, color: '#EF4444', borderRadius: 2, cursor: 'pointer' }}>
                    CLOSE
                  </button>
                </td>
              </tr>
            ))}
            {closedTrades.map(t => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${colors.textMuted}20`, opacity: 0.5 }}>
                <td style={{ padding: '6px 10px' }}>{t.product_type || t.type}</td>
                <td style={{ padding: '6px 10px' }}>{t.description || `${t.tenor_years}Y ${t.position}`}</td>
                <td style={{ padding: '6px 10px' }}>€{fmtNum(t.notional)}</td>
                <td style={{ padding: '6px 10px' }}>{t.entry_level ? `${t.entry_level}bp` : `${t.fixed_rate}%`}</td>
                <td style={{ padding: '6px 10px' }}>—</td>
                <td style={{ padding: '6px 10px' }}>—</td>
                <td style={{ padding: '6px 10px', color: pnlColor(t.realized_pnl) }}>{fmtPnl(t.realized_pnl)}</td>
                <td style={{ padding: '6px 10px' }}>—</td>
                <td style={{ padding: '6px 10px', color: colors.textMuted }}>CLOSED</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        {trades.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: colors.textMuted }}>No trades. Use the Pricer tab to price and add trades.</div>
        )}
      </div>

      {/* DV01 by tenor chart */}
      {dv01Data.length > 0 && (
        <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.primary, marginBottom: 8 }}>DV01 BY TENOR</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dv01Data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.textMuted + '40'} />
              <XAxis dataKey="tenor" tick={{ fill: colors.textMuted, fontSize: 10 }} />
              <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} tickFormatter={v => `€${fmtNum(v)}`} />
              <Tooltip contentStyle={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, fontSize: 11 }} formatter={(v: number) => [`€${fmtNum(v)}`, 'DV01']} />
              <Bar dataKey="dv01" radius={[4, 4, 0, 0]}>
                {dv01Data.map((entry, i) => <Cell key={i} fill={entry.dv01 >= 0 ? '#FF8800' : '#EF4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, valueColor, colors }: { label: string; value: string; valueColor: string; colors: any }) {
  return (
    <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: '10px 16px', minWidth: 130 }}>
      <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: valueColor }}>{value}</div>
    </div>
  );
}
