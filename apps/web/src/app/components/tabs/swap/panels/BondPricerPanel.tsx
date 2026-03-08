/**
 * Bond Pricer — Face, coupon, YTM, tenor, freq; clean/dirty price, durations, DV01, convexity.
 */
import React, { useState } from 'react';
import { useTerminalTheme } from '@/contexts/ThemeContext';
import { priceBond, type PriceBondResult } from '@/services/swap/swapService';
import { EndpointCard, Row, Field, Input, Select, RunButton } from '../../quantlib-core/shared';

export default function BondPricerPanel() {
  const { colors, fontSize } = useTerminalTheme();
  const [face, setFace] = useState('100');
  const [couponRate, setCouponRate] = useState('3');
  const [ytm, setYtm] = useState('3.5');
  const [tenorYears, setTenorYears] = useState('10');
  const [payFreq, setPayFreq] = useState('2');
  const [result, setResult] = useState<PriceBondResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await priceBond({
        face: Number(face),
        coupon_rate: Number(couponRate),
        yield_to_maturity: Number(ytm),
        tenor_years: Number(tenorYears),
        pay_freq: Number(payFreq),
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
      <EndpointCard title="Bond Pricer" description="Clean/dirty price, Macaulay & modified duration, DV01, convexity">
        <Row>
          <Field label="Face" width="100px">
            <Input value={face} onChange={setFace} type="number" />
          </Field>
          <Field label="Coupon (%)" width="90px">
            <Input value={couponRate} onChange={setCouponRate} type="number" />
          </Field>
          <Field label="YTM (%)" width="90px">
            <Input value={ytm} onChange={setYtm} type="number" />
          </Field>
          <Field label="Tenor (years)" width="100px">
            <Input value={tenorYears} onChange={setTenorYears} type="number" />
          </Field>
          <Field label="Freq" width="70px">
            <Select value={payFreq} onChange={setPayFreq} options={['1', '2']} />
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
              <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Clean price</div>
              <div style={{ fontSize: fontSize.body, color: colors.primary }}>{result.clean_price.toFixed(2)}%</div>
            </div>
            <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10 }}>
              <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Dirty price</div>
              <div style={{ fontSize: fontSize.body, color: colors.primary }}>{result.dirty_price.toLocaleString('en-EU', { maximumFractionDigits: 2 })}</div>
            </div>
            <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10 }}>
              <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Mac. duration</div>
              <div style={{ fontSize: fontSize.body, color: colors.primary }}>{result.macaulay_duration.toFixed(2)}</div>
            </div>
            <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10 }}>
              <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Mod. duration</div>
              <div style={{ fontSize: fontSize.body, color: colors.primary }}>{result.modified_duration.toFixed(2)}</div>
            </div>
            <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10 }}>
              <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>DV01</div>
              <div style={{ fontSize: fontSize.body, color: colors.primary }}>{result.dv01.toLocaleString('en-EU', { maximumFractionDigits: 2 })}</div>
            </div>
            <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10 }}>
              <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Convexity</div>
              <div style={{ fontSize: fontSize.body, color: colors.primary }}>{result.convexity.toFixed(2)}</div>
            </div>
          </div>
        )}
      </EndpointCard>
    </div>
  );
}
