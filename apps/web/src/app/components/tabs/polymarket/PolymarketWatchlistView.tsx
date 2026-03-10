import React, { useEffect, useState } from 'react';
import { Star, Trash2, Bell, BellOff, TrendingUp, TrendingDown, Plus, Edit3, X } from 'lucide-react';
import { C, fmtVol } from './tokens';
import { polymarketWatchlistService, type PolymarketWatchlistEntry, type Watchlist } from '@/services/polymarket/polymarketWatchlistService';
import { watchlistMonitor, type WatchlistLiveData, type WatchlistAlert } from '@/services/polymarket/polymarketWatchlistMonitor';

export interface PolymarketWatchlistViewProps {
  selectedMarketId: string | null;
  onSelect: (entry: PolymarketWatchlistEntry) => void;
  onRemove: (marketId: string) => void;
  onReload?: () => void;
}

function DeltaBadge({ bps }: { bps: number | null }) {
  if (bps === null || bps === undefined) return <span style={{ color: C.faint, fontSize: 8 }}>—</span>;
  const pct = (bps / 100).toFixed(1);
  const color = bps > 0 ? C.green : bps < 0 ? C.red : C.faint;
  const arrow = bps > 0 ? '▲' : bps < 0 ? '▼' : '';
  return <span style={{ color, fontSize: 8, fontWeight: 600, fontFamily: 'monospace' }}>{arrow}{bps > 0 ? '+' : ''}{pct}%</span>;
}

export const PolymarketWatchlistView: React.FC<PolymarketWatchlistViewProps> = ({
  selectedMarketId, onSelect, onRemove, onReload,
}) => {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeWlId, setActiveWlId] = useState<string | null>(null);
  const [liveMap, setLiveMap] = useState<Map<string, WatchlistLiveData>>(new Map());
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const reload = () => {
    const all = polymarketWatchlistService.getAll();
    setWatchlists(all);
    if (all.length > 0 && (!activeWlId || !all.find(w => w.id === activeWlId))) {
      setActiveWlId(all[0].id);
    }
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    watchlistMonitor.start();
    const unsub = watchlistMonitor.onAlert(() => setAlerts(watchlistMonitor.getAlerts()));
    const iv = setInterval(() => setLiveMap(new Map(watchlistMonitor.getAllLiveData())), 5000);
    return () => { unsub(); clearInterval(iv); };
  }, []);

  const activeWl = watchlists.find(w => w.id === activeWlId);
  const entries = activeWl?.entries ?? [];
  const unreadCount = watchlistMonitor.getUnreadCount();

  const handleCreate = () => {
    if (!newName.trim()) return;
    const wl = polymarketWatchlistService.create(newName.trim());
    setNewName('');
    setShowCreate(false);
    reload();
    setActiveWlId(wl.id);
  };

  const handleDelete = (id: string) => {
    polymarketWatchlistService.delete(id);
    reload();
    onReload?.();
  };

  const handleRemoveEntry = (marketId: string) => {
    if (!activeWlId) return;
    polymarketWatchlistService.removeFromWatchlist(marketId, activeWlId);
    reload();
    onRemove(marketId);
  };

  const toPct = (v: string | number | undefined | null): number => {
    if (v === undefined || v === null || v === '') return 0;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isNaN(n)) return 0;
    return n <= 1 ? Math.round(n * 100) : Math.round(n);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Watchlist tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, padding: '4px 8px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        {watchlists.map(wl => (
          <div key={wl.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button onClick={() => setActiveWlId(wl.id)} style={{
              padding: '3px 8px', fontSize: 9, fontWeight: 600, fontFamily: C.font, cursor: 'pointer',
              background: activeWlId === wl.id ? C.orange : 'transparent',
              color: activeWlId === wl.id ? '#000' : C.muted,
              border: 'none', borderRadius: 2,
            }}>
              {wl.name} ({wl.entries.length})
            </button>
            {watchlists.length > 1 && (
              <button onClick={() => handleDelete(wl.id)} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', padding: 0, fontSize: 8 }}>
                <X size={8} />
              </button>
            )}
          </div>
        ))}
        {showCreate ? (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
              style={{ width: 80, padding: '2px 4px', fontSize: 9, background: C.bg, border: `1px solid ${C.border}`, color: C.white, borderRadius: 2, fontFamily: C.font, outline: 'none' }} />
            <button onClick={handleCreate} style={{ background: C.green, border: 'none', color: '#000', padding: '2px 6px', fontSize: 8, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: C.font }}>OK</button>
          </div>
        ) : (
          <button onClick={() => setShowCreate(true)} style={{ background: 'transparent', border: `1px dashed ${C.border}`, color: C.muted, padding: '3px 6px', fontSize: 8, cursor: 'pointer', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, fontFamily: C.font }}>
            <Plus size={8} /> NEW
          </button>
        )}
        {/* Alert bell */}
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => { setShowAlerts(!showAlerts); if (!showAlerts) watchlistMonitor.markAllRead(); }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, color: unreadCount > 0 ? C.orange : C.muted, padding: 2 }}>
            {unreadCount > 0 ? <Bell size={11} /> : <BellOff size={11} />}
            {unreadCount > 0 && <span style={{ fontSize: 8, fontWeight: 700, fontFamily: C.font }}>{unreadCount}</span>}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {showAlerts && alerts.length > 0 && (
        <div style={{ maxHeight: 120, overflow: 'auto', borderBottom: `1px solid ${C.border}` }}>
          {alerts.slice(0, 15).map(a => (
            <div key={a.id} style={{ padding: '4px 10px', fontSize: 9, fontFamily: C.font, borderBottom: `1px solid ${C.border}15`, color: a.type === 'spike_up' ? C.green : C.red, opacity: a.read ? 0.4 : 1 }}>
              {a.type === 'spike_up' ? <TrendingUp size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} /> : <TrendingDown size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />}
              {a.message}
              <span style={{ color: C.faint, marginLeft: 4 }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {watchlists.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 10, fontFamily: C.font }}>
          <Star size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div>NO WATCHLISTS YET</div>
          <button onClick={() => { polymarketWatchlistService.create('Default'); reload(); }}
            style={{ marginTop: 8, padding: '4px 12px', fontSize: 9, background: C.orange, color: '#000', border: 'none', borderRadius: 2, cursor: 'pointer', fontWeight: 700, fontFamily: C.font }}>
            CREATE DEFAULT WATCHLIST
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 10, fontFamily: C.font }}>
          <Star size={24} style={{ opacity: 0.3, marginBottom: 6 }} />
          <div>EMPTY WATCHLIST</div>
          <div style={{ marginTop: 3, color: C.faint, fontSize: 9 }}>Add markets from MARKETS or EVENTS tabs</div>
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 44px 44px 44px 44px 44px 20px',
            padding: '3px 10px', fontSize: 7, color: C.faint, fontFamily: C.font,
            borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            <span>Market</span>
            <span style={{ textAlign: 'right' }}>YES</span>
            <span style={{ textAlign: 'right' }}>NO</span>
            <span style={{ textAlign: 'right' }}>Δ1h</span>
            <span style={{ textAlign: 'right' }}>Δ1d</span>
            <span style={{ textAlign: 'right' }}>Δ1w</span>
            <span />
          </div>
          {entries.map(entry => {
            const live = liveMap.get(entry.marketId);
            const stored = entry.outcomePrices ?? [];
            const yesRaw = live ? live.yesPrice : parseFloat(stored[0] || '0');
            const noRaw = live ? live.noPrice : parseFloat(stored[1] || '0');
            return (
              <div key={entry.marketId} onClick={() => onSelect(entry)} style={{
                padding: '7px 10px', borderBottom: `1px solid ${C.border}`,
                backgroundColor: selectedMarketId === entry.marketId ? C.orange + '22' : 'transparent', cursor: 'pointer',
              }}>
                <div style={{ fontSize: 10, color: C.white, fontFamily: C.font, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                  {entry.question}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 44px 44px 44px 20px', alignItems: 'center', fontSize: 9, fontFamily: C.font }}>
                  <span style={{ color: C.faint, fontSize: 8 }}>{live ? fmtVol(live.volume) : entry.volume ? fmtVol(entry.volume) : ''}</span>
                  <span style={{ textAlign: 'right', color: C.green, fontWeight: 700, fontFamily: 'monospace' }}>{toPct(yesRaw)}%</span>
                  <span style={{ textAlign: 'right', color: C.red, fontWeight: 700, fontFamily: 'monospace' }}>{toPct(noRaw)}%</span>
                  <span style={{ textAlign: 'right' }}><DeltaBadge bps={live?.delta1h ?? null} /></span>
                  <span style={{ textAlign: 'right' }}><DeltaBadge bps={live?.delta1d ?? null} /></span>
                  <span style={{ textAlign: 'right' }}><DeltaBadge bps={live?.delta1w ?? null} /></span>
                  <button onClick={e => { e.stopPropagation(); handleRemoveEntry(entry.marketId); }} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 0 }}>
                    <Trash2 size={9} />
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
