import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RefreshCw, Plus } from 'lucide-react';
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
  return `${v >= 0 ? '+' : ''}€${fmtNum(v)}`;
}

interface Props {
  autoRefreshInterval?: number;
  pendingTrade?: Record<string, unknown> | null;
  onPendingTradeConsumed?: () => void;
}

const DEFAULT_BOOK_NAME = 'EUR Rates Book';

export default function EnhancedBlotterPanel({ autoRefreshInterval = 30000, pendingTrade, onPendingTradeConsumed }: Props) {
  const { colors, fontSize } = useTerminalTheme();
  const [books, setBooks] = useState<SwapBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [trades, setTrades] = useState<SwapTrade[]>([]);
  const [summary, setSummary] = useState<BookMtmResult['summary'] | null>(null);
  const [riskByTenor, setRiskByTenor] = useState<Record<string, number>>({});
  const [newBookName, setNewBookName] = useState(DEFAULT_BOOK_NAME);
  const [loading, setLoading] = useState(false);
  const [lastMtm, setLastMtm] = useState<string>('—');
  const [msg, setMsg] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingTradeRef = useRef<Record<string, unknown> | null>(null);
  const booksLoadedRef = useRef(false);

  const refreshMtm = useCallback(async (bookId?: string) => {
    const bid = bookId || selectedBookId;
    if (!bid) return;
    const result = await swapPtMtmBook(bid);
    if (result) {
      setTrades(result.trades);
      setSummary(result.summary);
      setLastMtm(new Date().toLocaleTimeString());
    }
    const risk = await swapPtGetRisk(bid);
    if (risk) setRiskByTenor(risk.by_tenor);
  }, [selectedBookId]);

  const ensureBookExists = useCallback(async (booksList: SwapBook[]): Promise<string> => {
    if (booksList.length > 0) return booksList[0].id;
    const book = await swapPtCreateBook({ name: DEFAULT_BOOK_NAME, currency: 'EUR' });
    if (book) {
      setBooks(prev => [...prev, book]);
      setSelectedBookId(book.id);
      return book.id;
    }
    throw new Error('Failed to create book');
  }, []);

  const processPendingTrade = useCallback(async (trade: Record<string, unknown>, bookId: string) => {
    setMsg(null);
    const result = await swapPtEnterTrade({ ...trade, book_id: bookId });
    if (result) {
      setMsg(`Trade booked: ${result.description || result.product_type || 'OK'}`);
      await refreshMtm(bookId);
    } else {
      setMsg('⚠ Trade booking failed');
    }
    onPendingTradeConsumed?.();
  }, [refreshMtm, onPendingTradeConsumed]);

  // Load books on mount
  useEffect(() => {
    (async () => {
      const list = await swapPtListBooks();
      setBooks(list);
      booksLoadedRef.current = true;
      let bid: string | null = null;
      if (list.length > 0) {
        bid = list[0].id;
        setSelectedBookId(bid);
      }
      // Process any pending trade that arrived before books loaded
      if (pendingTradeRef.current) {
        const trade = pendingTradeRef.current;
        pendingTradeRef.current = null;
        const bookId = bid || await ensureBookExists(list);
        setSelectedBookId(bookId);
        await processPendingTrade(trade, bookId);
      } else if (bid) {
        await refreshMtm(bid);
      }
    })();
  }, []);

  // Handle incoming pendingTrade prop
  useEffect(() => {
    if (!pendingTrade) return;
    if (!booksLoadedRef.current) {
      // Books not loaded yet — stash for processing after load
      pendingTradeRef.current = pendingTrade;
      return;
    }
    (async () => {
      const bookId = selectedBookId || await ensureBookExists(books);
      setSelectedBookId(bookId);
      await processPendingTrade(pendingTrade, bookId);
    })();
  }, [pendingTrade]);

  // Refresh MTM when book changes
  useEffect(() => {
    if (selectedBookId && booksLoadedRef.current) refreshMtm(selectedBookId);
  }, [selectedBookId]);

  // Auto-refresh interval
  useEffect(() => {
    if (!selectedBookId || autoRefreshInterval <= 0) return;
    intervalRef.current = setInterval(() => refreshMtm(), autoRefreshInterval);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [selectedBookId, autoRefreshInterval, refreshMtm]);

  const handleCreateBook = async () => {
    setLoading(true);
    const book = await swapPtCreateBook({ name: newBookName, currency: 'EUR' });
    if (book) {
      setBooks(prev => [...prev, book]);
      setSelectedBookId(book.id);
      setNewBookName(DEFAULT_BOOK_NAME);
    }
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
      const parse = (s: string) => { const n = parseFloat(s); return s.endsWith('Y') ? n : s.endsWith('M') ? n / 12 : n; };
      return parse(a.tenor) - parse(b.tenor);
    });

  const inp: React.CSSProperties = {
    padding: '5px 8px', backgroundColor: colors.background,
    border: `1px solid ${colors.textMuted}50`, color: colors.secondary,
    borderRadius: 3, fontSize: 11,
  };

  return (
    <div style={{ padding: 10 }}>
      {/* Book header */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={selectedBookId ?? ''} onChange={e => setSelectedBookId(e.target.value || null)}
          style={{ ...inp, width: 200, fontWeight: 600 }}>
          <option value="">— Select Book —</option>
          {books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input value={newBookName} onChange={e => setNewBookName(e.target.value)} placeholder="New book" style={{ ...inp, width: 140 }} />
        <button type="button" onClick={handleCreateBook} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', backgroundColor: colors.primary, color: colors.background, border: 'none', borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={11} /> NEW BOOK
        </button>
        <button type="button" onClick={() => refreshMtm()} disabled={!selectedBookId}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}50`, color: colors.primary, borderRadius: 3, fontSize: 10, cursor: 'pointer' }}>
          <RefreshCw size={11} /> MTM
        </button>
        <span style={{ fontSize: 9, color: colors.textMuted }}>Last: {lastMtm}</span>
        {msg && <span style={{ fontSize: 10, color: msg.startsWith('⚠') ? '#EF4444' : '#22C55E', fontWeight: 600 }}>{msg}</span>}
      </div>

      {/* Summary */}
      {summary && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <SummaryCard label="Unrealized P&L" value={fmtPnl(summary.total_unrealized_pnl)} color={pnlColor(summary.total_unrealized_pnl)} bg={colors.panel} border={colors.textMuted} />
          <SummaryCard label="Realized P&L" value={fmtPnl(summary.total_realized_pnl)} color={pnlColor(summary.total_realized_pnl)} bg={colors.panel} border={colors.textMuted} />
          <SummaryCard label="Total P&L" value={fmtPnl(summary.total_pnl)} color={pnlColor(summary.total_pnl)} bg={colors.panel} border={colors.textMuted} />
          <SummaryCard label="Total PV" value={`€${fmtNum(summary.total_pv)}`} color={colors.primary} bg={colors.panel} border={colors.textMuted} />
          <SummaryCard label="Total DV01" value={`€${fmtNum(summary.total_dv01)}`} color={colors.primary} bg={colors.panel} border={colors.textMuted} />
          <SummaryCard label="Trades" value={`${summary.active_trades}`} color={colors.primary} bg={colors.panel} border={colors.textMuted} />
        </div>
      )}

      {/* Trade table */}
      <div style={{ overflow: 'auto', backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}30`, borderRadius: 4, marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 880 }}>
          <thead>
            <tr>
              {['Type','Description','Notional','Entry','Current','PV','P&L','DV01','Status',''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: colors.primary, fontSize: 9, textTransform: 'uppercase', borderBottom: `1px solid ${colors.textMuted}40` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeTrades.map(t => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${colors.textMuted}15` }}>
                <td style={{ padding: '5px 8px', fontWeight: 600 }}>{t.product_type || t.type}</td>
                <td style={{ padding: '5px 8px' }}>{t.description || `${t.tenor_years}Y ${t.position}`}</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>€{fmtNum(t.notional)}</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{t.product_type === 'IRS' || t.product_type === 'OIS' ? `${t.fixed_rate}%` : `${t.entry_level}bp`}</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{t.current_level ? `${t.current_level}bp` : '—'}</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: pnlColor(t.current_pv) }}>€{fmtNum(t.current_pv)}</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: pnlColor(t.unrealized_pnl), fontWeight: 700 }}>{fmtPnl(t.unrealized_pnl)}</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>€{fmtNum(t.dv01)}</td>
                <td style={{ padding: '5px 8px', color: '#22C55E', fontSize: 9 }}>● ACTIVE</td>
                <td style={{ padding: '5px 8px' }}>
                  <button type="button" onClick={() => handleClose(t.id)}
                    style={{ padding: '2px 8px', fontSize: 9, backgroundColor: 'transparent', border: '1px solid #EF4444', color: '#EF4444', borderRadius: 2, cursor: 'pointer' }}>
                    CLOSE
                  </button>
                </td>
              </tr>
            ))}
            {closedTrades.map(t => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${colors.textMuted}10`, opacity: 0.4 }}>
                <td style={{ padding: '5px 8px' }}>{t.product_type || t.type}</td>
                <td style={{ padding: '5px 8px' }}>{t.description || `${t.tenor_years}Y ${t.position}`}</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>€{fmtNum(t.notional)}</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{t.product_type === 'IRS' || t.product_type === 'OIS' ? `${t.fixed_rate}%` : `${t.entry_level}bp`}</td>
                <td style={{ padding: '5px 8px' }}>—</td>
                <td style={{ padding: '5px 8px' }}>—</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: pnlColor(t.realized_pnl) }}>{fmtPnl(t.realized_pnl)}</td>
                <td style={{ padding: '5px 8px' }}>—</td>
                <td style={{ padding: '5px 8px', color: colors.textMuted, fontSize: 9 }}>CLOSED</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        {trades.length === 0 && (
          <div style={{ padding: 28, textAlign: 'center', color: colors.textMuted, fontSize: 11 }}>
            No trades. Use the Pricer to price an instrument and click "ADD TO BOOK".
          </div>
        )}
      </div>

      {/* DV01 by tenor */}
      {dv01Data.length > 0 && (
        <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}30`, borderRadius: 4, padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.primary, marginBottom: 6, textTransform: 'uppercase' }}>DV01 by Tenor</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dv01Data} margin={{ top: 5, right: 16, left: 16, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.textMuted + '30'} />
              <XAxis dataKey="tenor" tick={{ fill: colors.textMuted, fontSize: 9 }} />
              <YAxis tick={{ fill: colors.textMuted, fontSize: 9 }} tickFormatter={v => `€${fmtNum(v)}`} />
              <Tooltip contentStyle={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, fontSize: 10 }} formatter={(v: number) => [`€${fmtNum(v)}`, 'DV01']} />
              <Bar dataKey="dv01" radius={[3, 3, 0, 0]}>
                {dv01Data.map((entry, i) => <Cell key={i} fill={entry.dv01 >= 0 ? '#FF8800' : '#EF4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, bg, border }: { label: string; value: string; color: string; bg: string; border: string }) {
  return (
    <div style={{ backgroundColor: bg, border: `1px solid ${border}30`, borderRadius: 3, padding: '8px 14px', minWidth: 110 }}>
      <div style={{ fontSize: 8, color: border, textTransform: 'uppercase', marginBottom: 3, letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}
