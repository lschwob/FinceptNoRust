/**
 * Compact market health radar: equities, crypto, commodities, sentiment (recharts RadarChart).
 * Derived from news articles: category volume and sentiment ratio.
 */
import React, { useMemo } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

const FONT = '"IBM Plex Mono", "SF Mono", "Consolas", monospace';
const C = { TEXT: '#D4D4D4', TEXT_MUTE: '#888', AMBER: '#FF8800' };

export interface WMFinanceRadarProps {
  /** Articles to derive market health from (category + sentiment) */
  articles?: Array<{ category?: string; sentiment?: string }>;
  equities?: number;
  crypto?: number;
  commodities?: number;
  sentiment?: number;
}

const WMFinanceRadar: React.FC<WMFinanceRadarProps> = ({ articles = [], equities: eqProp, crypto: crProp, commodities: coProp, sentiment: sentProp }) => {
  const radarData = useMemo(() => {
    let equities = eqProp;
    let crypto = crProp;
    let commodities = coProp;
    let sentiment = sentProp;
    if (articles.length > 0 && (eqProp === undefined && crProp === undefined && coProp === undefined && sentProp === undefined)) {
      const cat = (c: string) => (c || '').toUpperCase();
      let eq = 0, cr = 0, co = 0;
      let bull = 0, bear = 0, neu = 0;
      articles.forEach(a => {
        const c = cat(a.category || '');
        if (c.includes('MARKET') || c.includes('EARNINGS') || c.includes('MKT')) eq++;
        if (c.includes('CRYPTO') || c.includes('CRPT')) cr++;
        if (c.includes('ENERGY') || c.includes('NRG') || c.includes('COMMODITY')) co++;
        if (a.sentiment === 'BULLISH') bull++;
        else if (a.sentiment === 'BEARISH') bear++;
        else neu++;
      });
      const total = articles.length || 1;
      const maxCat = Math.max(1, eq, cr, co);
      equities = Math.min(100, Math.round((eq / maxCat) * 100));
      crypto = Math.min(100, Math.round((cr / maxCat) * 100));
      commodities = Math.min(100, Math.round((co / maxCat) * 100));
      sentiment = Math.min(100, Math.round(50 + ((bull - bear) / total) * 50));
    }
    const eqV = equities ?? 50;
    const crV = crypto ?? 50;
    const coV = commodities ?? 50;
    const sentV = sentiment ?? 50;
    return [
      { subject: 'Equities', value: eqV, fullMark: 100 },
      { subject: 'Crypto', value: crV, fullMark: 100 },
      { subject: 'Commodities', value: coV, fullMark: 100 },
      { subject: 'Sentiment', value: sentV, fullMark: 100 },
    ];
  }, [articles, eqProp, crProp, coProp, sentProp]);

  return (
    <div style={{ padding: '6px 10px', fontFamily: FONT, fontSize: '10px', color: C.TEXT, height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="#333" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: C.TEXT_MUTE, fontSize: 8 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: C.TEXT_MUTE, fontSize: 7 }} />
          <Radar name="Health" dataKey="value" stroke={C.AMBER} fill={C.AMBER} fillOpacity={0.35} strokeWidth={1.5} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WMFinanceRadar;
