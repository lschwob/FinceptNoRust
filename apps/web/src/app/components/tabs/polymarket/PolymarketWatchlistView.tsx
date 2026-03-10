import React, { useEffect, useState, useCallback } from 'react';
import { Star, Trash2, Bell, BellOff, TrendingUp, TrendingDown } from 'lucide-react';
import { C, fmtVol } from './tokens';
import type { PolymarketWatchlistEntry } from '@/services/polymarket/polymarketWatchlistService';
import { watchlistMonitor, type WatchlistLiveData, type WatchlistAlert } from '@/services/polymarket/polymarketWatchlistMonitor';

export interface PolymarketWatchlistViewProps {
  entries: PolymarketWatchlistEntry[];
  selectedMarketId: string | null;
  onSelect: (entry: PolymarketWatchlistEntry) => void;
  onRemove: (marketId: string) => void;
}

function DeltaBadge({ bps }: { bps: number | null }) {
  if (bps === null || bps === undefined) return <span style={{ color: C.faint, fontSize: 8 }}>—</span>;
  const pct = (bps / 100).toFixed(1);
  const color = bps > 0 ? C.green : bps < 0 ? C.red : C.faint;
  const arrow = bps > 0 ? '▲' : bps < 0 ? '▼' : '';
  return (
    <span style={{ color, fontSize: 8, fontWeight: 600, fontFamily: 'monospace' }}>
      {arrow}{bps > 0 ? '+' : ''}{pct}%
    </span>
  );
}

export const PolymarketWatchlistView: React.FC<PolymarketWatchlistViewProps> = ({
  entries, selectedMarketId, onSelect, onRemove,
}) => {
  const [liveMap, setLiveMap] = useState<Map<string, WatchlistLiveData>>(new Map());
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    watchlistMonitor.start();
    const unsub = watchlistMonitor.onAlert((alert) => {
      setAlerts(watchlistMonitor.getAlerts());
    });
    const iv = setInterval(() => {
      setLiveMap(new Map(watchlistMonitor.getAllLiveData()));
      setTick(t => t + 1);
    }, 5000);
    return () => { unsub(); clearInterval(iv); };
  }, []);

  const unreadCount = watchlistMonitor.getUnreadCount();

  if (entries.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 10, fontFamily: C.font }}>
        <Star size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
        <div>NO PREDICTIONS IN WATCHLIST</div>
        <div style={{ marginTop: 4, color: C.faint }}>Add markets from MARKETS or EVENTS</div>
      </div>
    );
  }

  const toPct = (v: string | number | undefined | null): number => {
    if (v === undefined || v === null || v === '') return 0;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isNaN(n)) return 0;
    return n <= 1 ? Math.round(n * 100) : Math.round(n);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Alert header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px', borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 9, color: C.muted, fontFamily: C.font }}>LIVE PRICES · 30s</span>
        <button
          onClick={() => { setShowAlerts(!showAlerts); if (!showAlerts) watchlistMonitor.markAllRead(); }}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: unreadCount > 0 ? C.orange : C.muted, padding: 2 }}
        >
          {unreadCount > 0 ? <Bell size={12} /> : <BellOff size={12} />}
          {unreadCount > 0 && <span style={{ fontSize: 9, fontWeight: 700, fontFamily: C.font }}>{unreadCount}</span>}
        </button>
      </div>

      {/* Alerts panel */}
      {showAlerts && alerts.length > 0 && (
        <div style={{ maxHeight: 150, overflow: 'auto', borderBottom: `1px solid ${C.border}` }}>
          {alerts.slice(0, 20).map(a => (
            <div key={a.id} style={{
              padding: '5px 12px', fontSize: 9, fontFamily: C.font,
              borderBottom: `1px solid ${C.border}20`,
              color: a.type === 'spike_up' ? C.green : C.red,
              opacity: a.read ? 0.5 : 1,
            }}>
              {a.type === 'spike_up' ? <TrendingUp size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} /> : <TrendingDown size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
              {a.message}
              <span style={{ color: C.faint, marginLeft: 6 }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 50px 50px 48px 48px 48px 24px',
        padding: '4px 12px', fontSize: 8, color: C.faint, fontFamily: C.font,
        borderBottom: `1px solid ${C.border}`,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        <span>Market</span>
        <span style={{ textAlign: 'right' }}>YES</span>
        <span style={{ textAlign: 'right' }}>NO</span>
        <span style={{ textAlign: 'right' }}>Δ1h</span>
        <span style={{ textAlign: 'right' }}>Δ1d</span>
        <span style={{ textAlign: 'right' }}>Δ1w</span>
        <span />
      </div>

      {/* Entries */}
      {entries.map((entry) => {
        const live = liveMap.get(entry.marketId);
        const storedPrices = entry.outcomePrices ?? [];
        const yesRaw = live ? live.yesPrice : parseFloat(storedPrices[0] || '0');
        const noRaw = live ? live.noPrice : parseFloat(storedPrices[1] || '0');
        const yesPct = toPct(yesRaw);
        const noPct = toPct(noRaw);
        const isSelected = selectedMarketId === entry.marketId;

        return (
          <div
            key={entry.marketId}
            onClick={() => onSelect(entry)}
            style={{
              padding: '8px 12px',
              borderBottom: `1px solid ${C.border}`,
              backgroundColor: isSelected ? C.orange + '22' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 10, color: C.white, fontFamily: C.font, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
              {entry.question}
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 50px 50px 48px 48px 48px 24px',
              alignItems: 'center', fontSize: 9, fontFamily: C.font,
            }}>
              <span style={{ color: C.faint, fontSize: 8 }}>
                {live ? fmtVol(live.volume) : entry.volume ? fmtVol(entry.volume) : ''}
              </span>
              <span style={{ textAlign: 'right', color: C.green, fontWeight: 700, fontFamily: 'monospace' }}>{yesPct}%</span>
              <span style={{ textAlign: 'right', color: C.red, fontWeight: 700, fontFamily: 'monospace' }}>{noPct}%</span>
              <span style={{ textAlign: 'right' }}><DeltaBadge bps={live?.delta1h ?? null} /></span>
              <span style={{ textAlign: 'right' }}><DeltaBadge bps={live?.delta1d ?? null} /></span>
              <span style={{ textAlign: 'right' }}><DeltaBadge bps={live?.delta1w ?? null} /></span>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(entry.marketId); }}
                title="Remove"
                style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 0 }}
              >
                <Trash2 size={10} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
