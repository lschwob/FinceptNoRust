import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { BaseWidget } from './BaseWidget';
import { PolymarketMarket } from '@/services/polymarket/polymarketService';
import polymarketApiService from '@/services/polymarket/polymarketApiService';
import { useTranslation } from 'react-i18next';

interface PolymarketWidgetProps {
  id: string;
  limit?: number;
  onRemove?: () => void;
  onNavigate?: () => void;
}

/** Gamma API can return outcome_prices (snake) or outcomePrices (camel). */
function getOutcomePrices(m: PolymarketMarket & { outcome_prices?: string[] }): string[] {
  return m.outcomePrices ?? m.outcome_prices ?? [];
}

export const PolymarketWidget: React.FC<PolymarketWidgetProps> = ({
  id,
  limit = 5,
  onRemove,
  onNavigate
}) => {
  const { t } = useTranslation('dashboard');
  const [markets, setMarkets] = useState<PolymarketMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadMarkets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await polymarketApiService.getMarkets({
        limit,
        active: true,
        order: 'volume',
        ascending: false,
      });
      if (mountedRef.current) setMarkets(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error('[PolymarketWidget] Error:', e);
      if (mountedRef.current) setError(String(e?.message || 'Failed to load'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    loadMarkets();
    return () => { mountedRef.current = false; };
  }, [limit]);

  const formatVolume = (v: string) => {
    const n = parseFloat(v || '0');
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  return (
    <BaseWidget
      id={id}
      title="PREDICTION MARKETS - TOP ACTIVE"
      onRemove={onRemove}
      onRefresh={loadMarkets}
      isLoading={loading}
      error={error}
      headerColor="var(--ft-color-purple)"
    >
      <div style={{ padding: '4px' }}>
        {markets.slice(0, limit).map((market, index) => (
          <div key={market.id || index} style={{ padding: '6px 8px', borderBottom: '1px solid var(--ft-border-color)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: 'var(--ft-font-size-small)', color: 'var(--ft-color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {market.question}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span style={{ fontSize: 'var(--ft-font-size-small)', color: 'var(--ft-color-success)' }}>
                  YES: {((parseFloat(getOutcomePrices(market)[0] || '0')) * 100).toFixed(0)}%
                </span>
                <span style={{ fontSize: 'var(--ft-font-size-small)', color: 'var(--ft-color-alert)' }}>
                  NO: {((parseFloat(getOutcomePrices(market)[1] || '0')) * 100).toFixed(0)}%
                </span>
              </div>
              <span style={{ fontSize: 'var(--ft-font-size-tiny)', color: 'var(--ft-color-text-muted)' }}>
                Vol: {formatVolume(String(market.volume ?? (market as { volumeNum?: number }).volumeNum ?? ''))}
              </span>
            </div>
          </div>
        ))}

        {markets.length === 0 && !loading && !error && (
          <div style={{ padding: '12px', textAlign: 'center', color: 'var(--ft-color-text-muted)', fontSize: 'var(--ft-font-size-small)' }}>
            {t('widgets.noActiveMarkets')}
          </div>
        )}

        {onNavigate && (
          <div onClick={onNavigate} style={{ padding: '6px', textAlign: 'center', color: 'var(--ft-color-purple)', fontSize: 'var(--ft-font-size-tiny)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <span>{t('widgets.openPolymarketTab')}</span>
            <ExternalLink size={10} />
          </div>
        )}
      </div>
    </BaseWidget>
  );
};
