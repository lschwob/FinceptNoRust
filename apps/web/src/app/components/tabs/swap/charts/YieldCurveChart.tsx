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

const MATURITY_ORDER = ['3M','6M','1Y','2Y','3Y','4Y','5Y','6Y','7Y','8Y','9Y','10Y','15Y','20Y','30Y'];

function sortByMaturity(data: Record<string, number | string>[]) {
  return [...data].sort((a, b) => {
    const ia = MATURITY_ORDER.indexOf(a.maturity as string);
    const ib = MATURITY_ORDER.indexOf(b.maturity as string);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
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

  const merged: Record<string, Record<string, number | string>>  = {};
  for (const m of allMaturities) {
    merged[m] = { maturity: m };
  }
  if (showSpot) spotCurve.forEach(p => { if (merged[p.maturity]) merged[p.maturity].spot = p.value; });
  if (showForward) forwardCurve.forEach(p => { if (merged[p.maturity]) merged[p.maturity].forward = p.value; });
  if (showPar) parCurve.forEach(p => { if (merged[p.maturity]) merged[p.maturity].par = p.value; });

  const data = sortByMaturity(Object.values(merged));

  if (data.length === 0) {
    return <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>No curve data available</div>;
  }

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    border: `1px solid ${colors.textMuted}`,
    borderRadius: 3,
    cursor: 'pointer',
    backgroundColor: active ? colors.primary : 'transparent',
    color: active ? colors.background : colors.textMuted,
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button type="button" style={toggleStyle(showSpot)} onClick={() => setShowSpot(!showSpot)}>Spot</button>
        <button type="button" style={toggleStyle(showForward)} onClick={() => setShowForward(!showForward)}>Forward</button>
        <button type="button" style={toggleStyle(showPar)} onClick={() => setShowPar(!showPar)}>Par</button>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.textMuted + '40'} />
          <XAxis dataKey="maturity" tick={{ fill: colors.textMuted, fontSize: 10 }} />
          <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} tickFormatter={v => `${v}%`} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, fontSize: 11 }}
            labelStyle={{ color: colors.primary }}
            formatter={(v: number) => [`${v.toFixed(4)}%`]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {showSpot && <Line type="monotone" dataKey="spot" stroke="#FF8800" strokeWidth={2} dot={{ r: 3 }} name="Spot" />}
          {showForward && <Line type="monotone" dataKey="forward" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} name="Forward" />}
          {showPar && <Line type="monotone" dataKey="par" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} name="Par" />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
