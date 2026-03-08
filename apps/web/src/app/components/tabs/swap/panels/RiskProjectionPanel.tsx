/**
 * Risk Projection — Curve history import (CSV/XLSX or ECB), projection matrix (PCA/OLS/Ridge/linear interp), P&L projection.
 */
import React, { useState, useCallback } from 'react';
import { useTerminalTheme } from '@/contexts/ThemeContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { EndpointCard, Row, Field, Input, Select, RunButton } from '../../quantlib-core/shared';
import { useRiskProjection, type CurveRow, type RiskTechnique } from '../hooks/useRiskProjection';
import * as XLSX from 'xlsx';

const COMMON_TENORS = ['1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '15Y', '20Y', '30Y'];
const SCENARIO_SHOCKS: Record<string, Record<string, number>> = {
  '−50 bp': { '5Y': -50, '7Y': -50, '10Y': -50 },
  '+50 bp': { '5Y': 50, '7Y': 50, '10Y': 50 },
  '+100 bp': { '5Y': 100, '7Y': 100, '10Y': 100 },
};

function parseCSV(text: string): CurveRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
  const rows: CurveRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const row: CurveRow = { date: values[0] ?? '' };
    headers.forEach((h, j) => {
      if (h && h !== 'date') row[h] = values[j] !== undefined && values[j] !== '' ? Number(values[j]) : '';
    });
    rows.push(row);
  }
  return rows;
}

function parseXLSX(file: File): Promise<CurveRow[]> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const wb = XLSX.read(r.result, { type: 'array' });
        const sh = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, { header: 1 }) as (string | number)[][];
        if (data.length < 2) {
          resolve([]);
          return;
        }
        const headers = (data[0] ?? []).map((h) => String(h).trim()) as string[];
        const rows: CurveRow[] = [];
        for (let i = 1; i < data.length; i++) {
          const values = data[i] ?? [];
          const row: CurveRow = { date: String(values[0] ?? '') };
          headers.forEach((h, j) => {
            if (h && h !== 'date') {
              const v = values[j];
              row[h] = v !== undefined && v !== '' && v !== null ? Number(v) : '';
            }
          });
          rows.push(row);
        }
        resolve(rows);
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(new Error('File read failed'));
    r.readAsArrayBuffer(file);
  });
}

export default function RiskProjectionPanel() {
  const { colors, fontSize } = useTerminalTheme();
  const {
    curveHistory,
    setCurveFromFile,
    loadRatesHistory,
    pillars,
    togglePillar,
    selectedTechniques,
    toggleTechnique,
    TECHNIQUES,
    runProjection,
    projectionResult,
    runBookPnl,
    pnlResult,
    loadBookRisk,
    loading,
    error,
    setError,
  } = useRiskProjection();

  const [fileDrop, setFileDrop] = useState(false);
  const [selectedTechnique, setSelectedTechnique] = useState<RiskTechnique>('ols');
  const [bookId, setBookId] = useState('');
  const [byTenorManual, setByTenorManual] = useState('');
  const [scenarioKey, setScenarioKey] = useState<string>('+50 bp');

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const ext = (file.name || '').toLowerCase();
      if (ext.endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const rows = parseCSV(String(reader.result));
            setCurveFromFile(rows);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Invalid CSV');
          }
        };
        reader.readAsText(file);
      } else if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
        parseXLSX(file)
          .then(setCurveFromFile)
          .catch((e) => setError(e instanceof Error ? e.message : 'Invalid XLSX'));
      } else {
        setError('Use CSV or XLSX');
      }
    },
    [setCurveFromFile, setError]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setFileDrop(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
      e.target.value = '';
    },
    [handleFile]
  );

  const exportMatrixCSV = useCallback(() => {
    const proj = projectionResult?.projection_matrix;
    const pils = projectionResult?.pillars ?? pillars;
    if (!proj || !pils.length) return;
    const tenors = Object.keys(proj).sort();
    const header = ['tenor', ...pils].join(',');
    const lines = tenors.map((t) => [t, ...(proj[t] ?? []).map((v) => v.toFixed(6))].join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'projection_matrix.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [projectionResult, pillars]);

  const runPnl = useCallback(() => {
    const shocks = SCENARIO_SHOCKS[scenarioKey] ?? {};
    const filled: Record<string, number> = {};
    pillars.forEach((p) => {
      filled[p] = shocks[p] ?? 0;
    });
    if (bookId.trim()) {
      runBookPnl(bookId.trim(), undefined, filled);
    } else {
      let byTenor: Record<string, number> = {};
      try {
        if (byTenorManual.trim()) byTenor = JSON.parse(byTenorManual) as Record<string, number>;
      } catch {
        setError('by_tenor must be JSON object e.g. {"5Y":1000,"10Y":-500}');
        return;
      }
      runBookPnl(undefined, byTenor, filled);
    }
  }, [bookId, byTenorManual, scenarioKey, pillars, runBookPnl, setError]);

  const r2ChartData = projectionResult?.r2_scores
    ? Object.entries(projectionResult.r2_scores).map(([tenor, r2]) => ({ tenor, r2, fill: colors.primary }))
    : [];
  const pcaVarianceData =
    projectionResult?.explained_variance?.map((v, i) => ({ component: `PC${i + 1}`, variance: v * 100 })) ?? [];

  return (
    <div style={{ padding: '12px', maxWidth: 1100 }}>
      {/* Data Import */}
      <EndpointCard title="Data import" description="CSV/XLSX (date + tenor columns) or load ECB history">
        <Row>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setFileDrop(true);
            }}
            onDragLeave={() => setFileDrop(false)}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${fileDrop ? colors.primary : colors.textMuted}`,
              borderRadius: 8,
              padding: 16,
              textAlign: 'center',
              backgroundColor: fileDrop ? colors.primary + '15' : colors.panel,
              color: colors.secondary,
              fontSize: fontSize.small,
            }}
          >
            <input type="file" accept=".csv,.xlsx,.xls" onChange={onFileInput} style={{ display: 'none' }} id="risk-upload" />
            <label htmlFor="risk-upload" style={{ cursor: 'pointer' }}>
              Drop CSV/XLSX here or click to browse
            </label>
          </div>
          <RunButton label="Load ECB history" loading={loading} onClick={() => loadRatesHistory()} />
        </Row>
        {curveHistory.length > 0 && (
          <div style={{ marginTop: 8, fontSize: fontSize.small, color: colors.textMuted }}>
            Loaded {curveHistory.length} rows. Columns: {Object.keys(curveHistory[0] ?? {}).join(', ')}
          </div>
        )}
      </EndpointCard>

      {/* Pillars & Technique */}
      <EndpointCard title="Pillars & technique" description="Select liquid pillars and projection method">
        <Row>
          <Field label="Pillars" width="280px">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COMMON_TENORS.map((t) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: fontSize.small }}>
                  <input type="checkbox" checked={pillars.includes(t)} onChange={() => togglePillar(t)} />
                  {t}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Technique" width="140px">
            <Select
              value={selectedTechnique}
              onChange={(v) => setSelectedTechnique(v as RiskTechnique)}
              options={[...TECHNIQUES]}
            />
          </Field>
          <RunButton
            label="Compute projection"
            loading={loading}
            onClick={() => runProjection(selectedTechnique)}
          />
        </Row>
      </EndpointCard>

      {error && (
        <div
          style={{
            marginBottom: 8,
            padding: 8,
            backgroundColor: colors.alert + '20',
            border: `1px solid ${colors.alert}`,
            borderRadius: 4,
            color: colors.alert,
            fontSize: fontSize.small,
          }}
        >
          {error}
        </div>
      )}

      {/* Projection matrix table + export */}
      {projectionResult?.success && projectionResult.projection_matrix && (
        <EndpointCard title="Projection matrix" description="Tenor → pillar weights">
          <Row>
            <button
              type="button"
              onClick={exportMatrixCSV}
              style={{
                padding: '6px 12px',
                backgroundColor: colors.panel,
                border: `1px solid ${colors.textMuted}`,
                color: colors.primary,
                borderRadius: 4,
                fontSize: fontSize.small,
                cursor: 'pointer',
              }}
            >
              Export CSV
            </button>
          </Row>
          <div style={{ overflowX: 'auto', marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.small }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.textMuted}` }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: colors.primary }}>Tenor</th>
                  {(projectionResult.pillars ?? []).map((p) => (
                    <th key={p} style={{ textAlign: 'right', padding: '4px 8px', color: colors.primary }}>
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(projectionResult.tenors ?? Object.keys(projectionResult.projection_matrix)).map((t) => (
                  <tr key={t} style={{ borderBottom: `1px solid ${colors.textMuted}` }}>
                    <td style={{ padding: '4px 8px' }}>{t}</td>
                    {(projectionResult.pillars ?? []).map((p, j) => (
                      <td key={p} style={{ textAlign: 'right', padding: '4px 8px' }}>
                        {(projectionResult.projection_matrix![t]?.[j] ?? 0).toFixed(4)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EndpointCard>
      )}

      {/* R² and PCA charts */}
      {(r2ChartData.length > 0 || pcaVarianceData.length > 0) && (
        <EndpointCard title="Comparison" description="R² by tenor and PCA explained variance">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8 }}>
            {r2ChartData.length > 0 && (
              <div style={{ width: 320, height: 220 }}>
                <div style={{ fontSize: 9, color: colors.textMuted, marginBottom: 4 }}>R² by tenor</div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r2ChartData} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.textMuted} />
                    <XAxis dataKey="tenor" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} domain={[0, 1]} />
                    <Tooltip contentStyle={{ fontSize: 10 }} />
                    <Bar dataKey="r2" radius={2}>
                      {r2ChartData.map((_, i) => (
                        <Cell key={i} fill={colors.primary} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {pcaVarianceData.length > 0 && (
              <div style={{ width: 280, height: 220 }}>
                <div style={{ fontSize: 9, color: colors.textMuted, marginBottom: 4 }}>PCA explained variance %</div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pcaVarianceData} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.textMuted} />
                    <XAxis dataKey="component" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 10 }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                    <Bar dataKey="variance" radius={2} fill={colors.primary} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </EndpointCard>
      )}

      {/* P&L projection */}
      <EndpointCard title="P&L projection" description="Project book or manual DV01 onto pillars and apply rate shock">
        <Row>
          <Field label="Book ID (optional)" width="140px">
            <Input value={bookId} onChange={setBookId} placeholder="e.g. book-uuid" />
          </Field>
          <Field label="or by_tenor JSON" width="220px">
            <Input value={byTenorManual} onChange={setByTenorManual} placeholder='{"5Y":1000,"10Y":-500}' />
          </Field>
          <Field label="Scenario" width="100px">
            <Select value={scenarioKey} onChange={setScenarioKey} options={Object.keys(SCENARIO_SHOCKS)} />
          </Field>
          <RunButton label="Project P&L" loading={loading} onClick={runPnl} />
        </Row>
        {pnlResult?.success && (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10 }}>
              <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Projected P&L</div>
              <div style={{ fontSize: fontSize.body, color: colors.primary }}>
                €{(pnlResult.pnl ?? 0).toLocaleString('en-EU', { maximumFractionDigits: 0 })}
              </div>
            </div>
            {pnlResult.projected_dv01_by_pillar &&
              Object.entries(pnlResult.projected_dv01_by_pillar).map(([p, dv01]) => (
                <div key={p} style={{ backgroundColor: colors.panel, border: `1px solid ${colors.textMuted}`, borderRadius: 4, padding: 10 }}>
                  <div style={{ fontSize: 9, color: colors.textMuted }}>DV01 {p}</div>
                  <div style={{ fontSize: fontSize.small }}>€{dv01.toLocaleString('en-EU', { maximumFractionDigits: 0 })}</div>
                </div>
              ))}
          </div>
        )}
      </EndpointCard>
    </div>
  );
}
