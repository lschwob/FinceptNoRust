// PolymarketWatchlistView — list of saved prediction markets, click to open detail, remove button
import React from 'react';
import { Star, Trash2 } from 'lucide-react';
import { C, fmtVol } from './tokens';
import type { PolymarketWatchlistEntry } from '@/services/polymarket/polymarketWatchlistService';

export interface PolymarketWatchlistViewProps {
  entries: PolymarketWatchlistEntry[];
  selectedMarketId: string | null;
  onSelect: (entry: PolymarketWatchlistEntry) => void;
  onRemove: (marketId: string) => void;
}

export const PolymarketWatchlistView: React.FC<PolymarketWatchlistViewProps> = ({
  entries,
  selectedMarketId,
  onSelect,
  onRemove,
}) => {
  if (entries.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 10, fontFamily: C.font }}>
        <Star size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
        <div>NO PREDICTIONS IN WATCHLIST</div>
        <div style={{ marginTop: 4, color: C.faint }}>Add markets from MARKETS or EVENTS</div>
      </div>
    );
  }

  const toPct = (v: string | number | undefined | null): string => {
    if (v === undefined || v === null || v === '') return '—';
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isNaN(n)) return '—';
    const pct = n <= 1 ? n * 100 : n;
    return `${Math.round(pct)}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {entries.map((entry) => {
        const prices = entry.outcomePrices ?? [];
        const yesPct = toPct(prices[0]);
        const noPct = toPct(prices[1]);
        const isSelected = selectedMarketId === entry.marketId;
        return (
          <div
            key={entry.marketId}
            onClick={() => onSelect(entry)}
            style={{
              padding: '10px 12px',
              borderBottom: `1px solid ${C.border}`,
              backgroundColor: isSelected ? C.orange + '22' : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 10, color: C.white, fontFamily: C.font, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.question}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(entry.marketId); }}
                title="Remove from watchlist"
                style={{ flexShrink: 0, background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 2 }}
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, fontFamily: C.font }}>
              <span style={{ color: C.green }}>YES {yesPct === '—' ? '—%' : `${yesPct}%`}</span>
              <span style={{ color: C.red }}>NO {noPct === '—' ? '—%' : `${noPct}%`}</span>
              {entry.volume != null && <span style={{ color: C.faint }}>{fmtVol(entry.volume)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
