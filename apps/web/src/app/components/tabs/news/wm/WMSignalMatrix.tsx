/**
 * 4×4 cross-stream signal correlation matrix (Conflict × Economic × Disaster × Cyber) + convergence indicator.
 * Each cell = normalized signal strength 0–100; convergence when 3+ signals are HIGH.
 */
import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

const FONT = '"IBM Plex Mono", "SF Mono", "Consolas", monospace';
const C = { TEXT: '#D4D4D4', TEXT_MUTE: '#888', AMBER: '#FF8800', RED: '#E55A5A', GREEN: '#26C281' };

const SIGNALS = ['Conflict', 'Economic', 'Disaster', 'Cyber'] as const;
const SIGNAL_KEYS: Record<string, string[]> = {
  Conflict: ['GEOPOLITICS', 'DEFENSE', 'GEO', 'DEF'],
  Economic: ['ECONOMIC', 'MARKETS', 'ECO', 'MKT', 'EARNINGS'],
  Disaster: ['DISASTER', 'CRISIS', 'ENVIRONMENTAL', 'ENV'],
  Cyber: ['CYBER', 'TECH', 'SECURITY', 'SEC'],
};

export interface SignalMatrixValue {
  conflict: number;
  economic: number;
  disaster: number;
  cyber: number;
}

export interface WMSignalMatrixProps {
  /** Articles to compute signal counts from (category-based) */
  articles?: Array<{ category?: string }>;
  values?: SignalMatrixValue;
  convergenceActive?: boolean;
}

function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((value / max) * 100));
}

const WMSignalMatrix: React.FC<WMSignalMatrixProps> = ({ articles = [], values: valuesProp }) => {
  const { values, maxCount, convergenceActive } = useMemo(() => {
    const counts = { conflict: 0, economic: 0, disaster: 0, cyber: 0 };
    articles.forEach(a => {
      const cat = (a.category || '').toUpperCase();
      if (SIGNAL_KEYS.Conflict.some(k => cat.includes(k))) counts.conflict++;
      if (SIGNAL_KEYS.Economic.some(k => cat.includes(k))) counts.economic++;
      if (SIGNAL_KEYS.Disaster.some(k => cat.includes(k))) counts.disaster++;
      if (SIGNAL_KEYS.Cyber.some(k => cat.includes(k))) counts.cyber++;
    });
    const max = Math.max(1, counts.conflict, counts.economic, counts.disaster, counts.cyber);
    const values: SignalMatrixValue = valuesProp ?? {
      conflict: normalize(counts.conflict, max),
      economic: normalize(counts.economic, max),
      disaster: normalize(counts.disaster, max),
      cyber: normalize(counts.cyber, max),
    };
    const high = (v: number) => v >= 60;
    const convergenceActive = [values.conflict, values.economic, values.disaster, values.cyber].filter(high).length >= 3;
    return { values, maxCount: max, convergenceActive };
  }, [articles, valuesProp]);

  const cellColor = (v: number) => (v >= 60 ? C.RED : v >= 30 ? C.AMBER : C.GREEN);

  return (
    <div style={{ padding: '6px 10px', fontFamily: FONT, fontSize: '10px', color: C.TEXT }}>
      {convergenceActive && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, padding: '4px 6px',
          backgroundColor: 'rgba(229,90,90,0.15)', border: `1px solid ${C.RED}`, borderRadius: 2,
          color: C.RED, fontWeight: 700,
        }}>
          <AlertTriangle size={10} /> CONVERGENCE — 3+ signals elevated
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {SIGNALS.map((label, i) => {
          const key = label.toLowerCase() as keyof SignalMatrixValue;
          const v = values[key];
          return (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: C.TEXT_MUTE, marginBottom: 2 }}>{label}</div>
              <div style={{
                height: 28, background: '#1a1a1a', borderRadius: 2, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden',
              }}>
                <div style={{
                  width: '80%', height: `${v}%`, background: cellColor(v), borderRadius: '2px 2px 0 0', minHeight: v > 0 ? 4 : 0,
                }} />
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: cellColor(v), marginTop: 2 }}>{v}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WMSignalMatrix;
