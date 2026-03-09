import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useTerminalTheme } from '@/contexts/ThemeContext';

interface CurvePoint {
  maturity: string;
  value: number;
}

interface Props {
  spotCurve: CurvePoint[];
  forwardCurve: CurvePoint[];
  parCurve: CurvePoint[];
}

function maturityToYears(m: string): number {
  const s = m.trim().toUpperCase();
  if (s.endsWith('Y')) {
    const n = parseFloat(s.slice(0, -1));
    return isNaN(n) ? 999 : n;
  }
  if (s.endsWith('M')) {
    const n = parseFloat(s.slice(0, -1));
    return isNaN(n) ? 999 : n / 12;
  }
  if (s.endsWith('W')) {
    const n = parseFloat(s.slice(0, -1));
    return isNaN(n) ? 999 : n / 52;
  }
  if (s.endsWith('D') || s === 'O/N' || s === 'ON') return 1 / 365;
  return 999;
}

function sortByMaturity(data: Record<string, number | string>[]) {
  return [...data].sort(
    (a, b) => maturityToYears(a.maturity as string) - maturityToYears(b.maturity as string),
  );
}

export default function YieldCurveChart({ spotCurve, forwardCurve, parCurve }: Props) {
  const { colors } = useTerminalTheme();
  const [showSpot, setShowSpot] = useState(true);
  const [showForward, setShowForward] = useState(true);
  const [showPar, setShowPar] = useState(true);

  const allMaturities = new Set<string>();
  spotCurve.forEach(p => allMaturities.add(p.maturity));
  forwardCurve.forEach(p => allMaturities.add(p.maturity));
  parCurve.forEach(p => allMaturities.add(p.maturity));

  const merged: Record<string, Record<string, number | string>> = {};
  for (const m of allMaturities) merged[m] = { maturity: m };
  if (showSpot) spotCurve.forEach(p => { if (merged[p.maturity]) merged[p.maturity].spot = p.value; });
  if (showForward) forwardCurve.forEach(p => { if (merged[p.maturity]) merged[p.maturity].forward = p.value; });
  if (showPar) parCurve.forEach(p => { if (merged[p.maturity]) merged[p.maturity].par = p.value; });

  const data = sortByMaturity(Object.values(merged));
  if (data.length === 0) return <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>No curve data available</div>;

  const toggle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: 2,
    border: `1px solid ${active ? 'transparent' : colors.textMuted}`,
    backgroundColor: active ? colors.primary : 'transparent',
    color: active ? colors.background : colors.textMuted,
    transition: 'all .15s',
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button type="button" style={toggle(showSpot)} onClick={() => setShowSpot(!showSpot)}>Spot</button>
        <button type="button" style={toggle(showForward)} onClick={() => setShowForward(!showForward)}>Forward</button>
        <button type="button" style={toggle(showPar)} onClick={() => setShowPar(!showPar)}>Par</button>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.textMuted + '30'} />
          <XAxis dataKey="maturity" tick={{ fill: colors.textMuted, fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={40} />
          <YAxis tick={{ fill: colors.textMuted, fontSize: 9 }} tickFormatter={v => `${v}%`} domain={['auto', 'auto']} width={48} />
          <Tooltip
            contentStyle={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, fontSize: 11, borderRadius: 4 }}
            labelStyle={{ color: colors.primary, fontWeight: 700 }}
            formatter={(v: number) => [`${v.toFixed(4)}%`]}
          />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
          {showSpot && <Line type="monotone" dataKey="spot" stroke="#FF8800" strokeWidth={2} dot={{ r: 2.5, fill: '#FF8800' }} activeDot={{ r: 4 }} name="Spot" connectNulls />}
          {showForward && <Line type="monotone" dataKey="forward" stroke="#3B82F6" strokeWidth={1.5} dot={{ r: 2, fill: '#3B82F6' }} activeDot={{ r: 4 }} name="Forward" connectNulls />}
          {showPar && <Line type="monotone" dataKey="par" stroke="#22C55E" strokeWidth={1.5} dot={{ r: 2, fill: '#22C55E' }} activeDot={{ r: 4 }} name="Par" connectNulls />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
