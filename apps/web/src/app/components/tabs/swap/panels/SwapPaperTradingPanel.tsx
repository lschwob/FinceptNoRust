/**
 * Swap Paper Trading — Create book, enter trades, blotter, MTM refresh.
 */
import React, { useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTerminalTheme } from '@/contexts/ThemeContext';
import {
  swapPtCreateBook,
  swapPtListBooks,
  swapPtEnterTrade,
  swapPtGetTrades,
  swapPtMtmBook,
  swapPtCloseTrade,
  type SwapBook,
  type SwapTrade,
} from '@/services/swap/swapService';

export default function SwapPaperTradingPanel() {
  const { colors, fontSize } = useTerminalTheme();
  const [books, setBooks] = useState<SwapBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [trades, setTrades] = useState<SwapTrade[]>([]);
  const [newBookName, setNewBookName] = useState('My Swap Book');
  const [newBookCurrency, setNewBookCurrency] = useState('EUR');
  const [notional, setNotional] = useState('10000000');
  const [fixedRate, setFixedRate] = useState('3.5');
  const [tenorYears, setTenorYears] = useState('10');
  const [payFreq, setPayFreq] = useState('2');
  const [position, setPosition] = useState('payer');
  const [tradeType, setTradeType] = useState('IRS');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    const list = await swapPtListBooks();
    setBooks(list);
    if (list.length > 0 && !selectedBookId) setSelectedBookId(list[0].id);
  }, [selectedBookId]);

  const loadTrades = useCallback(async () => {
    if (!selectedBookId) return;
    const list = await swapPtGetTrades(selectedBookId);
    setTrades(list);
  }, [selectedBookId]);

  React.useEffect(() => {
    loadBooks();
  }, []);
  React.useEffect(() => {
    if (selectedBookId) loadTrades();
    else setTrades([]);
  }, [selectedBookId, loadTrades]);

  const handleCreateBook = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const book = await swapPtCreateBook({ name: newBookName, currency: newBookCurrency });
      if (book) {
        await loadBooks();
        setSelectedBookId(book.id);
        setMsg('Book created');
      } else setMsg('Create failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterTrade = async () => {
    if (!selectedBookId) {
      setMsg('Select a book first');
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const t = await swapPtEnterTrade({
        book_id: selectedBookId,
        type: tradeType,
        position,
        notional: Number(notional),
        fixed_rate: Number(fixedRate),
        tenor_years: Number(tenorYears),
        pay_freq: Number(payFreq),
      });
      if (t) {
        await loadTrades();
        setMsg('Trade entered');
      } else setMsg('Enter trade failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMtm = async () => {
    if (!selectedBookId) return;
    setLoading(true);
    try {
      await swapPtMtmBook(selectedBookId);
      await loadTrades();
    } finally {
      setLoading(false);
    }
  };

  const handleCloseTrade = async (tradeId: string) => {
    setLoading(true);
    try {
      await swapPtCloseTrade(tradeId);
      await loadTrades();
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { key: 'type', label: 'Type' },
    { key: 'position', label: 'Pos' },
    { key: 'notional', label: 'Notional' },
    { key: 'fixed_rate', label: 'Fixed%' },
    { key: 'tenor_years', label: 'Tenor' },
    { key: 'current_pv', label: 'PV' },
    { key: 'dv01', label: 'DV01' },
    { key: 'status', label: 'Status' },
  ];

  return (
    <div style={{ padding: '12px', display: 'flex', gap: 16, flexWrap: 'wrap', minHeight: 400 }}>
      <div style={{ width: 300, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 12 }}>
          <div style={{ fontSize: fontSize.subheading, fontWeight: 600, color: colors.primary, marginBottom: 8 }}>Create book</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              value={newBookName}
              onChange={(e) => setNewBookName(e.target.value)}
              placeholder="Book name"
              style={{ padding: '6px 8px', backgroundColor: colors.background, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }}
            />
            <input
              value={newBookCurrency}
              onChange={(e) => setNewBookCurrency(e.target.value)}
              placeholder="Currency"
              style={{ padding: '6px 8px', backgroundColor: colors.background, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }}
            />
            <button type="button" onClick={handleCreateBook} disabled={loading} style={{ padding: '6px 12px', backgroundColor: colors.primary, color: colors.background, border: 'none', borderRadius: 4, cursor: loading ? 'wait' : 'pointer', fontSize: fontSize.small }}>
              Create book
            </button>
          </div>
        </div>
        <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 12 }}>
          <div style={{ fontSize: fontSize.subheading, fontWeight: 600, color: colors.primary, marginBottom: 8 }}>Books</div>
          <select
            value={selectedBookId ?? ''}
            onChange={(e) => setSelectedBookId(e.target.value || null)}
            style={{ width: '100%', padding: '6px 8px', backgroundColor: colors.background, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }}
          >
            <option value="">— Select —</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 12 }}>
          <div style={{ fontSize: fontSize.subheading, fontWeight: 600, color: colors.primary, marginBottom: 8 }}>Enter trade</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <select value={tradeType} onChange={(e) => setTradeType(e.target.value)} style={{ padding: '6px 8px', backgroundColor: colors.background, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }}>
              <option value="IRS">IRS</option>
              <option value="OIS">OIS</option>
            </select>
            <select value={position} onChange={(e) => setPosition(e.target.value)} style={{ padding: '6px 8px', backgroundColor: colors.background, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }}>
              <option value="payer">Payer</option>
              <option value="receiver">Receiver</option>
            </select>
            <input type="number" value={notional} onChange={(e) => setNotional(e.target.value)} placeholder="Notional" style={{ padding: '6px 8px', backgroundColor: colors.background, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }} />
            <input type="number" value={fixedRate} onChange={(e) => setFixedRate(e.target.value)} placeholder="Fixed %" style={{ padding: '6px 8px', backgroundColor: colors.background, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }} />
            <input type="number" value={tenorYears} onChange={(e) => setTenorYears(e.target.value)} placeholder="Tenor (y)" style={{ padding: '6px 8px', backgroundColor: colors.background, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }} />
            <select value={payFreq} onChange={(e) => setPayFreq(e.target.value)} style={{ padding: '6px 8px', backgroundColor: colors.background, border: `1px solid ${colors.textMuted}`, color: colors.secondary, borderRadius: 4, fontSize: fontSize.small }}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="4">4</option>
            </select>
            <button type="button" onClick={handleEnterTrade} disabled={loading || !selectedBookId} style={{ padding: '6px 12px', backgroundColor: colors.primary, color: colors.background, border: 'none', borderRadius: 4, cursor: loading ? 'wait' : 'pointer', fontSize: fontSize.small }}>
              Enter trade
            </button>
          </div>
        </div>
        {msg && <div style={{ fontSize: fontSize.small, color: colors.textMuted }}>{msg}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: fontSize.subheading, fontWeight: 600, color: colors.primary }}>Blotter</span>
          <button type="button" onClick={handleMtm} disabled={loading || !selectedBookId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, color: colors.primary, borderRadius: 4, cursor: loading ? 'wait' : 'pointer', fontSize: fontSize.small }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            MTM
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.small }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.textMuted}` }}>
                {columns.map((c) => (
                  <th key={c.key} style={{ textAlign: 'left', padding: '6px 8px', color: colors.primary }}>{c.label}</th>
                ))}
                <th style={{ padding: '6px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${colors.textMuted}` }}>
                  <td style={{ padding: '6px 8px' }}>{t.type}</td>
                  <td style={{ padding: '6px 8px' }}>{t.position}</td>
                  <td style={{ padding: '6px 8px' }}>{Number(t.notional).toLocaleString('en-EU')}</td>
                  <td style={{ padding: '6px 8px' }}>{Number(t.fixed_rate).toFixed(2)}</td>
                  <td style={{ padding: '6px 8px' }}>{t.tenor_years}</td>
                  <td style={{ padding: '6px 8px' }}>{Number(t.current_pv).toLocaleString('en-EU', { maximumFractionDigits: 0 })}</td>
                  <td style={{ padding: '6px 8px' }}>{Number(t.dv01).toLocaleString('en-EU', { maximumFractionDigits: 0 })}</td>
                  <td style={{ padding: '6px 8px' }}>{t.status}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {t.status === 'active' && (
                      <button type="button" onClick={() => handleCloseTrade(t.id)} style={{ padding: '2px 8px', fontSize: 9, backgroundColor: 'transparent', border: `1px solid ${colors.alert}`, color: colors.alert, borderRadius: 2, cursor: 'pointer' }}>Close</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {trades.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>No trades. Select a book and enter a trade.</div>
          )}
        </div>
      </div>
    </div>
  );
}
