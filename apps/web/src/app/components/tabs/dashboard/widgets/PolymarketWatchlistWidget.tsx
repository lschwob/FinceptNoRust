import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Star } from 'lucide-react';
import { BaseWidget } from './BaseWidget';
import { polymarketWatchlistService, type PolymarketWatchlistEntry } from '@/services/polymarket/polymarketWatchlistService';
import { useTranslation } from 'react-i18next';

interface PolymarketWatchlistWidgetProps {
  id: string;
  limit?: number;
  onRemove?: () => void;
  onNavigate?: () => void;
}

export const PolymarketWatchlistWidget: React.FC<PolymarketWatchlistWidgetProps> = ({
  id,
  limit = 5,
  onRemove,
  onNavigate
}) => {
  const { t } = useTranslation('dashboard');
  const [entries, setEntries] = useState<PolymarketWatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await polymarketWatchlistService.getWatchlist();
      if (mountedRef.current) setEntries(list);
    } catch (e: unknown) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Failed to load watchlist');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, []);

  const formatVolume = (v: string | undefined) => {
    if (v == null) return '—';
    const n = parseFloat(v);
    if (Number.isNaN(n)) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  const toPct = (v: string | number | undefined | null): string => {
    if (v === undefined || v === null || v === '') return '—';
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isNaN(n)) return '—';
    const pct = n <= 1 ? n * 100 : n;
    return `${Math.round(pct)}`;
  };

  return (
    <BaseWidget
      id={id}
      title="POLYMARKET WATCHLIST"
      onRemove={onRemove}
      onRefresh={load}
      isLoading={loading}
      error={error}
      headerColor="var(--ft-color-purple)"
    >
      <div style={{ padding: '4px' }}>
        {entries.slice(0, limit).map((entry) => {
          const prices = entry.outcomePrices ?? [];
          const yesPct = toPct(prices[0]);
          const noPct = toPct(prices[1]);
          return (
            <div key={entry.marketId} style={{ padding: '6px 8px', borderBottom: '1px solid var(--ft-border-color)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: 'var(--ft-font-size-small)', color: 'var(--ft-color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.question}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ fontSize: 'var(--ft-font-size-small)', color: 'var(--ft-color-success)' }}>
                    YES: {yesPct === '—' ? '—%' : `${yesPct}%`}
                  </span>
                  <span style={{ fontSize: 'var(--ft-font-size-small)', color: 'var(--ft-color-alert)' }}>
                    NO: {noPct === '—' ? '—%' : `${noPct}%`}
                  </span>
                </div>
                <span style={{ fontSize: 'var(--ft-font-size-tiny)', color: 'var(--ft-color-text-muted)' }}>
                  {formatVolume(entry.volume)}
                </span>
              </div>
            </div>
          );
        })}

        {entries.length === 0 && !loading && !error && (
          <div style={{ padding: '12px', textAlign: 'center', color: 'var(--ft-color-text-muted)', fontSize: 'var(--ft-font-size-small)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <Star size={20} style={{ opacity: 0.4 }} />
            <span>No predictions in watchlist</span>
            <span style={{ fontSize: 'var(--ft-font-size-tiny)' }}>Add from Polymarket tab</span>
          </div>
        )}

        {onNavigate && (
          <div onClick={onNavigate} style={{ padding: '6px', textAlign: 'center', color: 'var(--ft-color-purple)', fontSize: 'var(--ft-font-size-tiny)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <span>Open Polymarket</span>
            <ExternalLink size={10} />
          </div>
        )}
      </div>
    </BaseWidget>
  );
};
