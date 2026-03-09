import React, { useState, useEffect, useRef } from 'react';
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

interface SavedConfig {
  adapter: AdapterType;
  folder: string;
  currency: string;
  curve_filter: string;
  rate_field: string;
  cache_ttl: string;
}

const SETTINGS_KEY = 'swap_data_source_config';

async function saveConfig(config: SavedConfig): Promise<void> {
  try {
    await bridgeInvoke('db_save_setting', { key: SETTINGS_KEY, value: JSON.stringify(config), category: 'swap' });
  } catch { /* ignore */ }
}

async function loadConfig(): Promise<SavedConfig | null> {
  try {
    const val = await bridgeInvoke<string | null>('db_get_setting', { key: SETTINGS_KEY });
    if (val && typeof val === 'string') return JSON.parse(val);
  } catch { /* ignore */ }
  return null;
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
  const autoAppliedRef = useRef(false);

  const fetchCurves = async (f?: string, ccy?: string) => {
    try {
      const res = await bridgeInvoke<{ success: boolean; data?: CurveListResult }>(
        'list_csv_curves', { folder: f || folder, currency: ccy || currency },
      );
      if (res?.success && res.data) {
        setAvailableCurves(res.data.curves);
        setAvailableCurrencies(res.data.currencies);
        setCsvFile(res.data.file);
        return res.data.curves;
      }
    } catch { /* ignore */ }
    return [];
  };

  const applyConfig = async (cfg?: Partial<SavedConfig>) => {
    const a = cfg?.adapter || adapter;
    const f = cfg?.folder || folder;
    const ccy = cfg?.currency || currency;
    const cf = cfg?.curve_filter ?? curveFilter;
    const rf = cfg?.rate_field || rateField;
    const ttl = cfg?.cache_ttl || cacheTtl;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const args: Record<string, unknown> = { adapter: a, cache_ttl: Number(ttl) };
      if (a === 'csv_folder') {
        args.folder = f;
        args.currency = ccy;
        args.curve_filter = cf || undefined;
        args.rate_field = rf;
      }
      const res = await bridgeInvoke<{ success: boolean; data?: ConfigResult; error?: string }>(
        'set_market_data_adapter', args,
      );
      if (res?.success && res.data) {
        setResult(res.data);
        // Persist config
        await saveConfig({ adapter: a, folder: f, currency: ccy, curve_filter: cf, rate_field: rf, cache_ttl: ttl });
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

  // Load saved config on mount and auto-apply
  useEffect(() => {
    if (autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    (async () => {
      const saved = await loadConfig();
      if (saved) {
        setAdapter(saved.adapter);
        setFolder(saved.folder);
        setCurrency(saved.currency);
        setCurveFilter(saved.curve_filter);
        setRateField(saved.rate_field);
        setCacheTtl(saved.cache_ttl);
        if (saved.adapter === 'csv_folder' && saved.folder) {
          const curves = await fetchCurves(saved.folder, saved.currency);
          if (!saved.curve_filter && curves.length > 0) {
            setCurveFilter(curves[0]);
            await applyConfig({ ...saved, curve_filter: curves[0] });
          } else {
            await applyConfig(saved);
          }
        } else {
          await applyConfig(saved);
        }
        setCollapsed(true);
      } else {
        // No saved config — try to fetch curves for default folder
        await fetchCurves();
      }
    })();
  }, []);

  const handleFolderBlur = () => { if (adapter === 'csv_folder' && folder) fetchCurves(); };
  const handleCurrencyChange = (ccy: string) => { setCurrency(ccy); if (folder) fetchCurves(folder, ccy); };

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
    <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}40`, borderRadius: 4, marginBottom: 14, overflow: 'hidden' }}>
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
                  ) : <input value={currency} onChange={e => setCurrency(e.target.value)} style={inp} />}
                </div>
                <div style={{ width: 180 }}>
                  <div style={lbl}>Curve</div>
                  {availableCurves.length > 0 ? (
                    <select value={curveFilter} onChange={e => setCurveFilter(e.target.value)} style={inp}>
                      <option value="">All curves</option>
                      {availableCurves.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : <input value={curveFilter} onChange={e => setCurveFilter(e.target.value)} style={inp} placeholder="(auto-detect)" />}
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
            <button type="button" onClick={() => applyConfig()} disabled={loading} style={{
              padding: '6px 18px', backgroundColor: colors.primary, color: colors.background,
              border: 'none', borderRadius: 3, fontWeight: 700, fontSize: 11,
              cursor: loading ? 'wait' : 'pointer', height: 30, whiteSpace: 'nowrap',
            }}>
              {loading ? '···' : 'APPLY'}
            </button>
          </div>
          {csvFile && adapter === 'csv_folder' && (
            <div style={{ marginTop: 6, fontSize: 10, color: colors.textMuted }}>
              File: {csvFile} · {availableCurves.length} curve{availableCurves.length !== 1 ? 's' : ''} detected
            </div>
          )}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '5px 10px', backgroundColor: '#EF444415', border: '1px solid #EF444440', borderRadius: 3, fontSize: 10, color: '#EF4444' }}>
              <AlertCircle size={11} /> {error}
            </div>
          )}
          {result && !error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '5px 10px', backgroundColor: '#22C55E15', border: '1px solid #22C55E40', borderRadius: 3, fontSize: 10, color: '#22C55E' }}>
              <Check size={11} /> Connected — {result.spot_points_loaded} points · config saved
            </div>
          )}
        </div>
      )}
    </div>
  );
}
