import React, { useState } from 'react';
import { useTerminalTheme } from '@/contexts/ThemeContext';
import {
  priceIRS, priceBond, priceCurveTrade, priceFly, priceASW, priceBasisSwap,
  type PriceIRSResult, type PriceBondResult, type StructuredPricingResult, type LiveRatesSnapshot,
} from '@/services/swap/swapService';

type ProductType = 'IRS' | 'OIS' | 'Bond' | 'Curve' | 'Fly' | 'ASW' | 'Basis';
const PRODUCTS: ProductType[] = ['IRS', 'Bond', 'Curve', 'Fly', 'ASW', 'Basis'];
const TENORS = ['1Y','2Y','3Y','4Y','5Y','6Y','7Y','8Y','9Y','10Y','15Y','20Y','30Y'];

interface Props {
  snapshot: LiveRatesSnapshot | null;
  onAddToBook?: (trade: Record<string, unknown>) => void;
}

function ResultCard({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10, minWidth: 120 }}>
      <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: colors.primary, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

export default function UnifiedPricerPanel({ snapshot, onAddToBook }: Props) {
  const { colors, fontSize } = useTerminalTheme();
  const [product, setProduct] = useState<ProductType>('IRS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [irsResult, setIrsResult] = useState<PriceIRSResult | null>(null);
  const [bondResult, setBondResult] = useState<PriceBondResult | null>(null);
  const [structResult, setStructResult] = useState<StructuredPricingResult | null>(null);

  const [notional, setNotional] = useState('10000000');
  const [fixedRate, setFixedRate] = useState('3.5');
  const [tenorYears, setTenorYears] = useState('10');
  const [payFreq, setPayFreq] = useState('2');
  const [position, setPosition] = useState('payer');
  const [shortTenor, setShortTenor] = useState('2Y');
  const [longTenor, setLongTenor] = useState('10Y');
  const [wing1, setWing1] = useState('2Y');
  const [body, setBody] = useState('5Y');
  const [wing2, setWing2] = useState('10Y');
  const [bondYield, setBondYield] = useState('3.2');
  const [couponRate, setCouponRate] = useState('2.5');
  const [ytm, setYtm] = useState('3.0');
  const [index1, setIndex1] = useState('3M');
  const [index2, setIndex2] = useState('6M');
  const [spreadBps, setSpreadBps] = useState('0');

  const clearResults = () => { setIrsResult(null); setBondResult(null); setStructResult(null); setError(null); };

  const handlePrice = async () => {
    setLoading(true); clearResults();
    try {
      if (product === 'IRS' || product === 'OIS') {
        const r = await priceIRS({
          notional: Number(notional), fixed_rate: Number(fixedRate),
          tenor_years: Number(tenorYears), pay_freq: Number(payFreq), position,
          yield_curve: snapshot?.spot_curve ?? [],
        });
        r ? setIrsResult(r) : setError('Pricing failed');
      } else if (product === 'Bond') {
        const r = await priceBond({
          face: 100, coupon_rate: Number(couponRate),
          yield_to_maturity: Number(ytm), tenor_years: Number(tenorYears), pay_freq: Number(payFreq),
        });
        r ? setBondResult(r) : setError('Pricing failed');
      } else if (product === 'Curve') {
        const r = await priceCurveTrade({
          short_tenor: shortTenor, long_tenor: longTenor,
          notional: Number(notional), position, pay_freq: Number(payFreq),
        });
        r ? setStructResult(r) : setError('Pricing failed');
      } else if (product === 'Fly') {
        const r = await priceFly({
          wing1, body, wing2, notional: Number(notional), position, pay_freq: Number(payFreq),
        });
        r ? setStructResult(r) : setError('Pricing failed');
      } else if (product === 'ASW') {
        const r = await priceASW({
          bond_yield: Number(bondYield), tenor: longTenor,
          notional: Number(notional), pay_freq: Number(payFreq),
        });
        r ? setStructResult(r) : setError('Pricing failed');
      } else if (product === 'Basis') {
        const r = await priceBasisSwap({
          tenor: longTenor, index1, index2,
          spread_bps: Number(spreadBps), notional: Number(notional), pay_freq: Number(payFreq),
        });
        r ? setStructResult(r) : setError('Pricing failed');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '6px 8px', backgroundColor: colors.background,
    border: `1px solid ${colors.textMuted}`, color: colors.secondary,
    borderRadius: 4, fontSize: 11, width: '100%',
  };
  const labelStyle: React.CSSProperties = { fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 2 };

  const handleAddToBook = () => {
    if (!onAddToBook) return;
    const base: Record<string, unknown> = { notional: Number(notional), pay_freq: Number(payFreq) };
    if (product === 'IRS' || product === 'OIS') {
      onAddToBook({ ...base, product_type: product, position, fixed_rate: Number(fixedRate), tenor_years: Number(tenorYears) });
    } else if (product === 'Curve') {
      onAddToBook({ ...base, product_type: 'CURVE', position, short_tenor: shortTenor, long_tenor: longTenor });
    } else if (product === 'Fly') {
      onAddToBook({ ...base, product_type: 'FLY', position, wing1, body, wing2 });
    } else if (product === 'ASW') {
      onAddToBook({ ...base, product_type: 'ASW', position: 'long', bond_yield: Number(bondYield), tenor: longTenor });
    } else if (product === 'Basis') {
      onAddToBook({ ...base, product_type: 'BASIS', position: 'long', tenor: longTenor, index1, index2, spread_bps: Number(spreadBps) });
    }
  };

  return (
    <div style={{ padding: 12, maxWidth: 1000 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {PRODUCTS.map(p => (
          <button key={p} type="button" onClick={() => { setProduct(p); clearResults(); }}
            style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 700, borderRadius: 3, cursor: 'pointer',
              backgroundColor: product === p ? colors.primary : 'transparent',
              color: product === p ? colors.background : colors.textMuted,
              border: `1px solid ${product === p ? colors.primary : colors.textMuted}`,
            }}>
            {p}
          </button>
        ))}
      </div>

      <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {(product === 'IRS' || product === 'OIS') && (<>
            <div style={{ width: 130 }}><div style={labelStyle}>Notional (€)</div><input type="number" value={notional} onChange={e => setNotional(e.target.value)} style={inputStyle} /></div>
            <div style={{ width: 100 }}><div style={labelStyle}>Fixed Rate (%)</div><input type="number" value={fixedRate} onChange={e => setFixedRate(e.target.value)} style={inputStyle} /></div>
            <div style={{ width: 100 }}><div style={labelStyle}>Tenor (Y)</div><input type="number" value={tenorYears} onChange={e => setTenorYears(e.target.value)} style={inputStyle} /></div>
            <div style={{ width: 70 }}><div style={labelStyle}>Freq</div><select value={payFreq} onChange={e => setPayFreq(e.target.value)} style={inputStyle}><option>1</option><option>2</option><option>4</option></select></div>
            <div style={{ width: 100 }}><div style={labelStyle}>Position</div><select value={position} onChange={e => setPosition(e.target.value)} style={inputStyle}><option value="payer">Payer</option><option value="receiver">Receiver</option></select></div>
          </>)}

          {product === 'Bond' && (<>
            <div style={{ width: 100 }}><div style={labelStyle}>Coupon (%)</div><input type="number" value={couponRate} onChange={e => setCouponRate(e.target.value)} style={inputStyle} /></div>
            <div style={{ width: 100 }}><div style={labelStyle}>YTM (%)</div><input type="number" value={ytm} onChange={e => setYtm(e.target.value)} style={inputStyle} /></div>
            <div style={{ width: 100 }}><div style={labelStyle}>Tenor (Y)</div><input type="number" value={tenorYears} onChange={e => setTenorYears(e.target.value)} style={inputStyle} /></div>
            <div style={{ width: 70 }}><div style={labelStyle}>Freq</div><select value={payFreq} onChange={e => setPayFreq(e.target.value)} style={inputStyle}><option>1</option><option>2</option><option>4</option></select></div>
          </>)}

          {product === 'Curve' && (<>
            <div style={{ width: 130 }}><div style={labelStyle}>Notional (€)</div><input type="number" value={notional} onChange={e => setNotional(e.target.value)} style={inputStyle} /></div>
            <div style={{ width: 80 }}><div style={labelStyle}>Short</div><select value={shortTenor} onChange={e => setShortTenor(e.target.value)} style={inputStyle}>{TENORS.map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ width: 80 }}><div style={labelStyle}>Long</div><select value={longTenor} onChange={e => setLongTenor(e.target.value)} style={inputStyle}>{TENORS.map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ width: 110 }}><div style={labelStyle}>Position</div><select value={position} onChange={e => setPosition(e.target.value)} style={inputStyle}><option value="steepener">Steepener</option><option value="flattener">Flattener</option></select></div>
          </>)}

          {product === 'Fly' && (<>
            <div style={{ width: 130 }}><div style={labelStyle}>Notional (€)</div><input type="number" value={notional} onChange={e => setNotional(e.target.value)} style={inputStyle} /></div>
            <div style={{ width: 80 }}><div style={labelStyle}>Wing 1</div><select value={wing1} onChange={e => setWing1(e.target.value)} style={inputStyle}>{TENORS.map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ width: 80 }}><div style={labelStyle}>Body</div><select value={body} onChange={e => setBody(e.target.value)} style={inputStyle}>{TENORS.map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ width: 80 }}><div style={labelStyle}>Wing 2</div><select value={wing2} onChange={e => setWing2(e.target.value)} style={inputStyle}>{TENORS.map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ width: 110 }}><div style={labelStyle}>Position</div><select value={position} onChange={e => setPosition(e.target.value)} style={inputStyle}><option value="sell_body">Sell Body</option><option value="buy_body">Buy Body</option></select></div>
          </>)}

          {product === 'ASW' && (<>
            <div style={{ width: 130 }}><div style={labelStyle}>Notional (€)</div><input type="number" value={notional} onChange={e => setNotional(e.target.value)} style={inputStyle} /></div>
            <div style={{ width: 100 }}><div style={labelStyle}>Bond Yield (%)</div><input type="number" value={bondYield} onChange={e => setBondYield(e.target.value)} style={inputStyle} /></div>
            <div style={{ width: 80 }}><div style={labelStyle}>Tenor</div><select value={longTenor} onChange={e => setLongTenor(e.target.value)} style={inputStyle}>{TENORS.map(t => <option key={t}>{t}</option>)}</select></div>
          </>)}

          {product === 'Basis' && (<>
            <div style={{ width: 130 }}><div style={labelStyle}>Notional (€)</div><input type="number" value={notional} onChange={e => setNotional(e.target.value)} style={inputStyle} /></div>
            <div style={{ width: 80 }}><div style={labelStyle}>Tenor</div><select value={longTenor} onChange={e => setLongTenor(e.target.value)} style={inputStyle}>{TENORS.map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ width: 70 }}><div style={labelStyle}>Index 1</div><select value={index1} onChange={e => setIndex1(e.target.value)} style={inputStyle}><option>1M</option><option>3M</option><option>6M</option></select></div>
            <div style={{ width: 70 }}><div style={labelStyle}>Index 2</div><select value={index2} onChange={e => setIndex2(e.target.value)} style={inputStyle}><option>1M</option><option>3M</option><option>6M</option></select></div>
            <div style={{ width: 100 }}><div style={labelStyle}>Spread (bp)</div><input type="number" value={spreadBps} onChange={e => setSpreadBps(e.target.value)} style={inputStyle} /></div>
          </>)}

          <button type="button" onClick={handlePrice} disabled={loading}
            style={{ padding: '8px 20px', backgroundColor: colors.primary, color: colors.background, border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 12, cursor: loading ? 'wait' : 'pointer', height: 34 }}>
            {loading ? '...' : 'PRICE'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, backgroundColor: '#EF444420', border: '1px solid #EF4444', borderRadius: 4, color: '#EF4444', fontSize: 11 }}>{error}</div>
      )}

      {irsResult && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <ResultCard label="PV" value={`${irsResult.pv >= 0 ? '+' : ''}€${irsResult.pv.toLocaleString()}`} colors={colors} />
          <ResultCard label="Par Rate" value={`${irsResult.par_rate.toFixed(2)}%`} colors={colors} />
          <ResultCard label="DV01" value={`€${irsResult.dv01.toLocaleString()}`} colors={colors} />
          <ResultCard label="Annuity" value={`${irsResult.annuity.toFixed(2)}Y`} colors={colors} />
        </div>
      )}

      {bondResult && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <ResultCard label="Clean Price" value={`${bondResult.clean_price.toFixed(3)}`} colors={colors} />
          <ResultCard label="Dirty Price" value={`€${bondResult.dirty_price.toLocaleString()}`} colors={colors} />
          <ResultCard label="Mod. Duration" value={`${bondResult.modified_duration.toFixed(3)}`} colors={colors} />
          <ResultCard label="DV01" value={`€${bondResult.dv01.toLocaleString()}`} colors={colors} />
          <ResultCard label="Convexity" value={`${bondResult.convexity.toFixed(3)}`} colors={colors} />
        </div>
      )}

      {structResult && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <ResultCard label="PV" value={`${Number(structResult.pv) >= 0 ? '+' : ''}€${Number(structResult.pv || 0).toLocaleString()}`} colors={colors} />
          <ResultCard label="DV01" value={`€${Number(structResult.dv01 || 0).toLocaleString()}`} colors={colors} />
          {structResult.current_spread_bps != null && <ResultCard label="Spread" value={`${structResult.current_spread_bps}bp`} colors={colors} />}
          {structResult.current_fly_bps != null && <ResultCard label="Fly Level" value={`${structResult.current_fly_bps}bp`} colors={colors} />}
          {structResult.current_asw_bps != null && <ResultCard label="ASW" value={`${structResult.current_asw_bps}bp`} colors={colors} />}
          {structResult.current_basis_bps != null && <ResultCard label="Basis" value={`${structResult.current_basis_bps}bp`} colors={colors} />}
          {structResult.description && <ResultCard label="Product" value={structResult.description} colors={colors} />}
        </div>
      )}

      {(irsResult || structResult) && onAddToBook && (
        <button type="button" onClick={handleAddToBook}
          style={{ padding: '8px 20px', backgroundColor: '#22C55E', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          ADD TO BOOK →
        </button>
      )}
    </div>
  );
}
