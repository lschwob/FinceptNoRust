import React, { useState, useEffect } from 'react';
import { Settings, FolderOpen, Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useTerminalTheme } from '@/contexts/ThemeContext';
import { bridgeInvoke } from '../../../../../shims/platform-bridge';

type AdapterType = 'ecb' | 'csv_folder';

interface ConfigResult {
  adapter: string;
  spot_points_loaded?: number;
  status?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CurveListResult {
  file: string | null;
  currencies: string[];
  curves: string[];
}

export default function DataSourceConfigPanel({ onConfigured }: { onConfigured?: () => void }) {
  const { colors } = useTerminalTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [adapter, setAdapter] = useState<AdapterType>('csv_folder');
  const [folder, setFolder] = useState('/workspace/data/swap_rates');
  const [currency, setCurrency] = useState('EUR');
  const [curveFilter, setCurveFilter] = useState('');
  const [rateField, setRateField] = useState('rate1');
  const [cacheTtl, setCacheTtl] = useState('30');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConfigResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [availableCurves, setAvailableCurves] = useState<string[]>([]);
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>([]);
  const [csvFile, setCsvFile] = useState<string | null>(null);

  const fetchCurves = async (f?: string, ccy?: string) => {
    try {
      const res = await bridgeInvoke<{ success: boolean; data?: CurveListResult }>(
        'list_csv_curves', { folder: f || folder, currency: ccy || currency },
      );
      if (res?.success && res.data) {
        setAvailableCurves(res.data.curves);
        setAvailableCurrencies(res.data.currencies);
        setCsvFile(res.data.file);
        if (!curveFilter && res.data.curves.length > 0) {
          setCurveFilter(res.data.curves[0]);
        }
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (adapter === 'csv_folder' && folder) fetchCurves();
  }, []);

  const handleFolderBlur = () => { if (adapter === 'csv_folder' && folder) fetchCurves(); };
  const handleCurrencyChange = (ccy: string) => { setCurrency(ccy); if (folder) fetchCurves(folder, ccy); };

  const handleApply = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const args: Record<string, unknown> = { adapter, cache_ttl: Number(cacheTtl) };
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

  const inp: React.CSSProperties = {
    padding: '5px 8px', backgroundColor: colors.background,
    border: `1px solid ${colors.textMuted}50`, color: colors.secondary,
    borderRadius: 3, fontSize: 11, width: '100%', outline: 'none',
  };
  const lbl: React.CSSProperties = {
    fontSize: 9, color: colors.textMuted, textTransform: 'uppercase',
    marginBottom: 3, letterSpacing: '0.5px',
  };

  return (
    <div style={{
      backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}40`,
      borderRadius: 4, marginBottom: 14, overflow: 'hidden',
    }}>
      {/* Header — always visible */}
      <button type="button" onClick={() => setCollapsed(!collapsed)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        padding: '8px 14px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: colors.primary,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Settings size={13} />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Data Source</span>
          {result && (
            <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 400 }}>
              ● {result.adapter === 'csv_folder' ? 'CSV' : 'ECB'} — {result.spot_points_loaded ?? '?'} points
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown size={14} color={colors.textMuted} /> : <ChevronUp size={14} color={colors.textMuted} />}
      </button>

      {/* Body — collapsible */}
      {!collapsed && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ width: 120 }}>
              <div style={lbl}>Source</div>
              <select value={adapter} onChange={e => setAdapter(e.target.value as AdapterType)} style={inp}>
                <option value="csv_folder">CSV Folder</option>
                <option value="ecb">ECB SDW</option>
              </select>
            </div>

            {adapter === 'csv_folder' && (
              <>
                <div style={{ width: 240 }}>
                  <div style={lbl}><FolderOpen size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />Folder</div>
                  <input value={folder} onChange={e => setFolder(e.target.value)} onBlur={handleFolderBlur} style={inp} placeholder="/path/to/csv" />
                </div>

                <div style={{ width: 80 }}>
                  <div style={lbl}>Currency</div>
                  {availableCurrencies.length > 0 ? (
                    <select value={currency} onChange={e => handleCurrencyChange(e.target.value)} style={inp}>
                      {availableCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <input value={currency} onChange={e => setCurrency(e.target.value)} style={inp} />
                  )}
                </div>

                <div style={{ width: 180 }}>
                  <div style={lbl}>Curve</div>
                  {availableCurves.length > 0 ? (
                    <select value={curveFilter} onChange={e => setCurveFilter(e.target.value)} style={inp}>
                      <option value="">All curves</option>
                      {availableCurves.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <input value={curveFilter} onChange={e => setCurveFilter(e.target.value)} style={inp} placeholder="(auto-detect)" />
                  )}
                </div>

                <div style={{ width: 70 }}>
                  <div style={lbl}>Rate</div>
                  <select value={rateField} onChange={e => setRateField(e.target.value)} style={inp}>
                    <option value="rate1">Rate1</option>
                    <option value="rate2">Rate2</option>
                  </select>
                </div>
              </>
            )}

            <div style={{ width: 60 }}>
              <div style={lbl}>TTL (s)</div>
              <input type="number" value={cacheTtl} onChange={e => setCacheTtl(e.target.value)} style={inp} />
            </div>

            <button type="button" onClick={handleApply} disabled={loading} style={{
              padding: '6px 18px', backgroundColor: colors.primary, color: colors.background,
              border: 'none', borderRadius: 3, fontWeight: 700, fontSize: 11,
              cursor: loading ? 'wait' : 'pointer', height: 30, whiteSpace: 'nowrap',
            }}>
              {loading ? '···' : 'APPLY'}
            </button>
          </div>

          {csvFile && adapter === 'csv_folder' && (
            <div style={{ marginTop: 8, fontSize: 10, color: colors.textMuted }}>
              File: {csvFile} · {availableCurves.length} curve{availableCurves.length !== 1 ? 's' : ''} detected
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 10px', backgroundColor: '#EF444415', border: '1px solid #EF444440', borderRadius: 3, fontSize: 10, color: '#EF4444' }}>
              <AlertCircle size={11} /> {error}
            </div>
          )}
          {result && !error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 10px', backgroundColor: '#22C55E15', border: '1px solid #22C55E40', borderRadius: 3, fontSize: 10, color: '#22C55E' }}>
              <Check size={11} />
              Connected — {result.spot_points_loaded} spot points loaded
              {result.status && (result.status as Record<string, unknown>).last_file && <> · {String((result.status as Record<string, unknown>).last_file)}</>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
