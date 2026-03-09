import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTerminalTheme } from '@/contexts/ThemeContext';

interface Props {
  discountFactors: Array<[number, number]>;
}

export default function DiscountFactorChart({ discountFactors }: Props) {
  const { colors } = useTerminalTheme();

  const data = discountFactors.map(([years, df]) => ({
    years: Number(years.toFixed(2)),
    df: Number(df.toFixed(6)),
  }));

  if (data.length === 0) {
    return <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>No discount factor data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.textMuted + '40'} />
        <XAxis dataKey="years" tick={{ fill: colors.textMuted, fontSize: 10 }} tickFormatter={v => `${v}Y`} />
        <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} domain={[0, 1.05]} tickFormatter={v => v.toFixed(2)} />
        <Tooltip
          contentStyle={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, fontSize: 11 }}
          labelStyle={{ color: colors.primary }}
          formatter={(v: number) => [v.toFixed(6), 'DF']}
          labelFormatter={v => `${v}Y`}
        />
        <Area type="monotone" dataKey="df" stroke="#FF8800" fill="#FF880030" strokeWidth={2} name="Discount Factor" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
