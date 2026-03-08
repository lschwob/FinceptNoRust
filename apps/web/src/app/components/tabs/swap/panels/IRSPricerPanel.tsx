/**
 * IRS Pricer — Notional, fixed rate, tenor, pay freq, position; uses ECB spot curve for discount factors.
 */
import React, { useState } from 'react';
import { useTerminalTheme } from '@/contexts/ThemeContext';
import { useCache } from '@/hooks/useCache';
import { getSwapTabSnapshot } from '@/services/swap/swapService';
import { priceIRS, type PriceIRSResult } from '@/services/swap/swapService';
import { EndpointCard, Row, Field, Input, Select, RunButton } from '../../quantlib-core/shared';

export default function IRSPricerPanel() {
  const { colors, fontSize } = useTerminalTheme();
  const [notional, setNotional] = useState('100000000');
  const [fixedRate, setFixedRate] = useState('3.5');
  const [tenorYears, setTenorYears] = useState('10');
  const [payFreq, setPayFreq] = useState('2');
  const [position, setPosition] = useState('payer');
  const [result, setResult] = useState<PriceIRSResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: snapshot } = useCache({
    key: 'swap:tab:snapshot',
    category: 'swap-rates',
    fetcher: getSwapTabSnapshot,
    ttl: 5 * 60 * 1000,
    enabled: true,
  });

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const yield_curve = snapshot?.yield_curve_spot ?? [];
      const r = await priceIRS({
        notional: Number(notional),
        fixed_rate: Number(fixedRate),
        tenor_years: Number(tenorYears),
        pay_freq: Number(payFreq),
        position,
        yield_curve,
      });
      if (r) setResult(r);
      else setError('Price failed');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '12px', maxWidth: 900 }}>
      <EndpointCard title="IRS Pricer" description="Price interest rate swap using ECB spot curve">
        <Row>
          <Field label="Notional (€)" width="120px">
            <Input value={notional} onChange={setNotional} type="number" />
          </Field>
          <Field label="Fixed rate (%)" width="100px">
            <Input value={fixedRate} onChange={setFixedRate} type="number" />
          </Field>
          <Field label="Tenor (years)" width="100px">
            <Input value={tenorYears} onChange={setTenorYears} type="number" />
          </Field>
          <Field label="Pay freq" width="80px">
            <Select value={payFreq} onChange={setPayFreq} options={['1', '2', '4']} />
          </Field>
          <Field label="Position" width="100px">
            <Select value={position} onChange={setPosition} options={['payer', 'receiver']} />
          </Field>
          <RunButton label="Price" loading={loading} onClick={run} />
        </Row>
        {error && (
          <div style={{ marginTop: 8, padding: 8, backgroundColor: colors.alert + '20', border: `1px solid ${colors.alert}`, borderRadius: 4, color: colors.alert, fontSize: fontSize.small }}>
            {error}
          </div>
        )}
        {result && (
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 8,
            }}
          >
            <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10 }}>
              <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>PV</div>
              <div style={{ fontSize: fontSize.body, color: colors.primary }}>
                {result.pv >= 0 ? '+' : ''}€{result.pv.toLocaleString('en-EU', { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10 }}>
              <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Par rate</div>
              <div style={{ fontSize: fontSize.body, color: colors.primary }}>{result.par_rate.toFixed(2)}%</div>
            </div>
            <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10 }}>
              <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>DV01</div>
              <div style={{ fontSize: fontSize.body, color: colors.primary }}>€{result.dv01.toLocaleString('en-EU', { maximumFractionDigits: 0 })}</div>
            </div>
            <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10 }}>
              <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Annuity</div>
              <div style={{ fontSize: fontSize.body, color: colors.primary }}>{result.annuity.toFixed(2)}Y</div>
            </div>
          </div>
        )}
      </EndpointCard>
    </div>
  );
}
