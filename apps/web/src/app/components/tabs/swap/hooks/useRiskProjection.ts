/**
 * Risk projection: curve history, pillars, technique, projection matrix, P&L.
 */
import { useState, useCallback } from 'react';
import {
  computeRiskProjection,
  projectBookPnl,
  getRatesHistory,
  swapPtGetRisk,
  type ComputeRiskProjectionResult,
  type ProjectBookPnlResult,
} from '@/services/swap/swapService';

const DEFAULT_PILLARS = ['5Y', '7Y', '10Y'];
const TECHNIQUES = ['ols', 'ridge', 'pca', 'linear_interp'] as const;
export type RiskTechnique = (typeof TECHNIQUES)[number];

export interface CurveRow {
  date: string;
  [tenor: string]: string | number;
}

export function useRiskProjection() {
  const [curveHistory, setCurveHistory] = useState<CurveRow[]>([]);
  const [pillars, setPillars] = useState<string[]>(DEFAULT_PILLARS);
  const [selectedTechniques, setSelectedTechniques] = useState<RiskTechnique[]>(['ols']);
  const [projectionResult, setProjectionResult] = useState<ComputeRiskProjectionResult | null>(null);
  const [pnlResult, setPnlResult] = useState<ProjectBookPnlResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRatesHistory = useCallback(async (instrument?: string, lastN?: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRatesHistory({ instrument: instrument ?? 'eur_irs', last_n: lastN ?? 252 });
      if (!data?.series) {
        setCurveHistory([]);
        return;
      }
      const tenors = Object.keys(data.series).filter((k) => Array.isArray(data.series[k]) && data.series[k].length);
      if (tenors.length === 0) {
        setCurveHistory([]);
        return;
      }
      const dates = [...new Set(tenors.flatMap((t) => (data.series[t] ?? []).map((p: { date: string }) => p.date)))].sort();
      const rows: CurveRow[] = dates.map((date) => {
        const row: CurveRow = { date };
        tenors.forEach((t) => {
          const pt = (data.series[t] ?? []).find((p: { date: string }) => p.date === date);
          row[t] = pt?.value ?? '';
        });
        return row;
      });
      setCurveHistory(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCurveHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const setCurveFromFile = useCallback((rows: CurveRow[]) => {
    setCurveHistory(rows);
    setError(null);
  }, []);

  const togglePillar = useCallback((p: string) => {
    setPillars((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p].sort()));
  }, []);

  const toggleTechnique = useCallback((t: RiskTechnique) => {
    setSelectedTechniques((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }, []);

  const runProjection = useCallback(
    async (technique?: RiskTechnique) => {
      const tech = technique ?? selectedTechniques[0];
      if (!curveHistory.length || !pillars.length) {
        setError('Load curve history and select at least one pillar.');
        return null;
      }
      setLoading(true);
      setError(null);
      setProjectionResult(null);
      try {
        const payload = curveHistory.map((r) => {
          const out: Record<string, string | number> = { date: r.date };
          Object.keys(r).forEach((k) => {
            if (k !== 'date' && (typeof r[k] === 'number' || (typeof r[k] === 'string' && r[k] !== ''))) {
              out[k] = typeof r[k] === 'number' ? r[k] : Number(r[k]);
            }
          });
          return out;
        });
        const result = await computeRiskProjection({
          curve_history: payload,
          pillars,
          technique: tech,
        });
        setProjectionResult(result ?? null);
        return result ?? null;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setProjectionResult(null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [curveHistory, pillars, selectedTechniques]
  );

  const runBookPnl = useCallback(
    async (bookId: string | undefined, byTenor: Record<string, number> | undefined, rateShocksBps: Record<string, number>) => {
      const proj = projectionResult?.projection_matrix;
      if (!proj || !pillars.length) {
        setError('Run projection first and ensure pillars are set.');
        return null;
      }
      setLoading(true);
      setError(null);
      setPnlResult(null);
      try {
        const result = await projectBookPnl({
          book_id: bookId,
          by_tenor: byTenor,
          projection_matrix: proj,
          pillars,
          rate_shocks_bps: rateShocksBps,
        });
        setPnlResult(result ?? null);
        return result ?? null;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPnlResult(null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [projectionResult, pillars]
  );

  const loadBookRisk = useCallback(async (bookId: string): Promise<Record<string, number>> => {
    const risk = await swapPtGetRisk(bookId);
    return risk?.by_tenor ?? {};
  }, []);

  return {
    curveHistory,
    setCurveFromFile,
    loadRatesHistory,
    pillars,
    setPillars,
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
  };
}
