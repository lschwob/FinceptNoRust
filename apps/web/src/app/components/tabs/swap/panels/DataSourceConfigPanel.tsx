import React, { useState } from 'react';
import { Settings, FolderOpen, Globe, Check, AlertCircle } from 'lucide-react';
import { useTerminalTheme } from '@/contexts/ThemeContext';
import { bridgeInvoke } from '../../../../shims/platform-bridge';

type AdapterType = 'ecb' | 'csv_folder';

interface ConfigResult {
  adapter: string;
  spot_points_loaded?: number;
  status?: Record<string, unknown>;
  [key: string]: unknown;
}

export default function DataSourceConfigPanel({ onConfigured }: { onConfigured?: () => void }) {
  const { colors, fontSize } = useTerminalTheme();
  const [adapter, setAdapter] = useState<AdapterType>('csv_folder');
  const [folder, setFolder] = useState('/workspace/data/swap_rates');
  const [currency, setCurrency] = useState('EUR');
  const [curveFilter, setCurveFilter] = useState('');
  const [rateField, setRateField] = useState('rate1');
  const [cacheTtl, setCacheTtl] = useState('30');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConfigResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const args: Record<string, unknown> = {
        adapter,
        cache_ttl: Number(cacheTtl),
      };
      if (adapter === 'csv_folder') {
        args.folder = folder;
        args.currency = currency;
        args.curve_filter = curveFilter || undefined;
        args.rate_field = rateField;
      }
      const res = await bridgeInvoke<{ success: boolean; data?: ConfigResult; error?: string }>(
        'set_market_data_adapter', args,
      );
      if (res?.success && res.data) {
        setResult(res.data);
        onConfigured?.();
      } else {
        setError(res?.error || 'Configuration failed');
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

  return (
    <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Settings size={14} color={colors.primary} />
        <span style={{ fontSize: 12, fontWeight: 700, color: colors.primary, textTransform: 'uppercase' }}>Data Source Configuration</span>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ width: 140 }}>
          <div style={labelStyle}>Source</div>
          <select value={adapter} onChange={e => setAdapter(e.target.value as AdapterType)} style={inputStyle}>
            <option value="csv_folder">CSV Folder</option>
            <option value="ecb">ECB SDW (free)</option>
          </select>
        </div>

        {adapter === 'csv_folder' && (
          <>
            <div style={{ width: 280 }}>
              <div style={labelStyle}>
                <FolderOpen size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Folder Path
              </div>
              <input value={folder} onChange={e => setFolder(e.target.value)} style={inputStyle} placeholder="/path/to/csv/folder" />
            </div>
            <div style={{ width: 70 }}>
              <div style={labelStyle}>Currency</div>
              <input value={currency} onChange={e => setCurrency(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ width: 120 }}>
              <div style={labelStyle}>Curve Filter</div>
              <input value={curveFilter} onChange={e => setCurveFilter(e.target.value)} style={inputStyle} placeholder="(optional)" />
            </div>
            <div style={{ width: 80 }}>
              <div style={labelStyle}>Rate Field</div>
              <select value={rateField} onChange={e => setRateField(e.target.value)} style={inputStyle}>
                <option value="rate1">Rate1</option>
                <option value="rate2">Rate2</option>
              </select>
            </div>
          </>
        )}

        <div style={{ width: 80 }}>
          <div style={labelStyle}>Cache (s)</div>
          <input type="number" value={cacheTtl} onChange={e => setCacheTtl(e.target.value)} style={inputStyle} />
        </div>

        <button type="button" onClick={handleApply} disabled={loading}
          style={{
            padding: '8px 20px', backgroundColor: colors.primary, color: colors.background,
            border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 11,
            cursor: loading ? 'wait' : 'pointer', height: 34,
          }}>
          {loading ? '...' : 'APPLY'}
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, padding: 8, backgroundColor: '#EF444420', border: '1px solid #EF4444', borderRadius: 4, fontSize: 11, color: '#EF4444' }}>
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, padding: 8, backgroundColor: '#22C55E20', border: '1px solid #22C55E', borderRadius: 4, fontSize: 11, color: '#22C55E' }}>
          <Check size={12} />
          Source: <strong>{result.adapter}</strong>
          {result.spot_points_loaded != null && <> — {result.spot_points_loaded} spot curve points loaded</>}
          {result.status && (result.status as Record<string, unknown>).last_file && <> — file: {String((result.status as Record<string, unknown>).last_file)}</>}
        </div>
      )}
    </div>
  );
}
