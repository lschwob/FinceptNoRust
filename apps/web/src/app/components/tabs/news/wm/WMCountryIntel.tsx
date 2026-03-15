/**
 * Country Intelligence Index — top 10 countries/regions, composite risk score, 12 signal category badges.
 * Computes risk from articles: group by region, weight by priority + category.
 */
import React, { useMemo } from 'react';

const FONT = '"IBM Plex Mono", "SF Mono", "Consolas", monospace';
const C = { PANEL: '#0D0D0D', BORDER: '#1E1E1E', TEXT: '#D4D4D4', TEXT_MUTE: '#888', AMBER: '#FF8800', RED: '#E55A5A', GREEN: '#26C281' };

const PRIORITY_WEIGHT: Record<string, number> = { FLASH: 4, URGENT: 3, BREAKING: 2, ROUTINE: 1 };
const CATEGORY_WEIGHT: Record<string, number> = {
  GEOPOLITICS: 3, DEFENSE: 3, MARKETS: 2, ECONOMIC: 2, EARNINGS: 1, TECH: 1, ENERGY: 2, CRYPTO: 1,
};
const SIGNAL_CATEGORIES = ['GEO', 'DEF', 'MKT', 'ECO', 'TECH', 'NRG', 'CRPT', 'HLTH', 'ENV', 'SEC', 'POL', 'TRADE'];

export interface CountryRiskRow {
  country: string;
  code?: string;
  riskScore: number;
  articleCount: number;
  signals: Record<string, number>;
}

export interface WMCountryIntelProps {
  /** Articles to compute risk from (uses region + priority + category) */
  articles?: Array<{ region?: string; priority?: string; category?: string }>;
  selectedCountry?: string | null;
  onSelectCountry?: (country: string) => void;
}

function getCategoryKey(cat: string): string {
  const c = (cat || '').toUpperCase();
  if (c.includes('GEO') || c === 'GEOPOLITICS') return 'GEO';
  if (c.includes('DEF') || c === 'DEFENSE') return 'DEF';
  if (c.includes('MARKET') || c === 'MARKETS') return 'MKT';
  if (c.includes('ECO')) return 'ECO';
  if (c.includes('TECH')) return 'TECH';
  if (c.includes('NRG') || c.includes('ENERGY')) return 'NRG';
  if (c.includes('CRYPTO')) return 'CRPT';
  if (c.includes('HEALTH') || c.includes('HLTH')) return 'HLTH';
  if (c.includes('ENV')) return 'ENV';
  if (c.includes('SEC')) return 'SEC';
  if (c.includes('POL')) return 'POL';
  if (c.includes('TRADE')) return 'TRADE';
  return 'OTHER';
}

const WMCountryIntel: React.FC<WMCountryIntelProps> = ({ articles = [], selectedCountry, onSelectCountry }) => {
  const countries = useMemo((): CountryRiskRow[] => {
    const byRegion: Record<string, { prioritySum: number; categorySum: number; count: number; signals: Record<string, number> }> = {};
    articles.forEach(a => {
      const region = (a.region || 'Global').trim() || 'Global';
      if (!byRegion[region]) {
        byRegion[region] = { prioritySum: 0, categorySum: 0, count: 0, signals: {} };
        SIGNAL_CATEGORIES.forEach(s => { byRegion[region].signals[s] = 0; });
      }
      const pri = PRIORITY_WEIGHT[a.priority || 'ROUTINE'] ?? 1;
      const catKey = getCategoryKey(a.category || '');
      const catMult = catKey === 'OTHER' ? 1 : (CATEGORY_WEIGHT[a.category?.toUpperCase() || ''] ?? 1);
      byRegion[region].prioritySum += pri;
      byRegion[region].categorySum += pri * catMult;
      byRegion[region].count += 1;
      if (catKey !== 'OTHER') byRegion[region].signals[catKey] = (byRegion[region].signals[catKey] || 0) + 1;
    });
    return Object.entries(byRegion)
      .map(([country, data]) => ({
        country,
        riskScore: data.count > 0 ? Math.min(100, Math.round((data.categorySum / data.count) * 10)) : 0,
        articleCount: data.count,
        signals: data.signals,
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);
  }, [articles]);

  return (
    <div style={{ padding: '6px 10px', fontFamily: FONT, fontSize: '10px', color: C.TEXT }}>
      {countries.length === 0 ? (
        <div style={{ color: C.TEXT_MUTE, padding: '8px 0' }}>No region data — load news in Terminal mode first.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {countries.map((row, i) => {
            const selected = selectedCountry === row.country;
            return (
              <li
                key={row.country}
                onClick={() => onSelectCountry?.(row.country)}
                style={{
                  padding: '4px 6px',
                  marginBottom: 2,
                  backgroundColor: selected ? 'rgba(255,136,0,0.15)' : 'transparent',
                  borderLeft: selected ? `2px solid ${C.AMBER}` : '2px solid transparent',
                  borderRadius: 2,
                  cursor: onSelectCountry ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: C.TEXT }}>{i + 1}. {row.country}</span>
                  <span style={{ color: row.riskScore >= 50 ? C.RED : row.riskScore >= 25 ? C.AMBER : C.GREEN, fontWeight: 700 }}>{row.riskScore}</span>
                </div>
                <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, marginTop: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, row.riskScore)}%`,
                      height: '100%',
                      background: row.riskScore >= 50 ? C.RED : row.riskScore >= 25 ? C.AMBER : C.GREEN,
                      borderRadius: 2,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 4 }}>
                  {SIGNAL_CATEGORIES.filter(s => (row.signals[s] || 0) > 0).map(s => (
                    <span key={s} style={{ fontSize: 7, color: C.TEXT_MUTE, backgroundColor: '#1a1a1a', padding: '1px 3px', borderRadius: 1 }}>
                      {s} {row.signals[s]}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default WMCountryIntel;
