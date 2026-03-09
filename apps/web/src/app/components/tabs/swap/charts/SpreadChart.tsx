import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useTerminalTheme } from '@/contexts/ThemeContext';

interface Props {
  spreads: Record<string, number | null>;
  flies: Record<string, number | null>;
}

export default function SpreadChart({ spreads, flies }: Props) {
  const { colors } = useTerminalTheme();

  const data: Array<{ name: string; value: number; type: string }> = [];

  Object.entries(spreads).forEach(([key, val]) => {
    if (val != null) data.push({ name: key, value: val, type: 'spread' });
  });
  Object.entries(flies).forEach(([key, val]) => {
    if (val != null) data.push({ name: key, value: val, type: 'fly' });
  });

  if (data.length === 0) {
    return <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>No spread data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 32 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.textMuted + '40'} />
        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} tickFormatter={v => `${v}bp`} />
        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 10 }} width={70} />
        <Tooltip
          contentStyle={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, fontSize: 11 }}
          formatter={(v: number, _name: string, entry: { payload: { type: string } }) => [
            `${v >= 0 ? '+' : ''}${v.toFixed(1)}bp`,
            entry.payload.type === 'fly' ? 'Butterfly' : 'Spread',
          ]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.value >= 0 ? '#22C55E' : '#EF4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
