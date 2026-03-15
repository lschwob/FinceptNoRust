/**
 * 15-category tabbed intelligence feed with event cards.
 */
import React, { useMemo, useState } from 'react';

const FONT = '"IBM Plex Mono", "SF Mono", "Consolas", monospace';
const C = { PANEL: '#0D0D0D', BORDER: '#1E1E1E', TEXT: '#D4D4D4', TEXT_MUTE: '#888', AMBER: '#FF8800', BLUE: '#4DA6FF' };

const WM_CATEGORIES = [
  'BREAKING', 'CONFLICT', 'DISASTER', 'CYBER', 'AVIATION', 'MARITIME', 'ENERGY', 'POLITICAL',
  'TRADE', 'HEALTH', 'ENVIRONMENTAL', 'SECURITY', 'TECHNOLOGY', 'HUMANITARIAN', 'SPACE',
] as const;

const CATEGORY_MAP: Record<string, string[]> = {
  BREAKING: ['FLASH', 'URGENT', 'BREAKING'],
  CONFLICT: ['GEOPOLITICS', 'DEFENSE', 'GEO', 'DEF'],
  DISASTER: ['DISASTER', 'CRISIS', 'ENV'],
  CYBER: ['CYBER', 'TECH', 'SECURITY', 'SEC'],
  AVIATION: ['AVIATION', 'FLIGHT', 'AIR'],
  MARITIME: ['MARITIME', 'VESSEL', 'SHIP'],
  ENERGY: ['ENERGY', 'NRG'],
  POLITICAL: ['POLITICAL', 'POL'],
  TRADE: ['TRADE'],
  HEALTH: ['HEALTH', 'HLTH'],
  ENVIRONMENTAL: ['ENVIRONMENTAL', 'ENV'],
  SECURITY: ['SECURITY', 'SEC'],
  TECHNOLOGY: ['TECHNOLOGY', 'TECH'],
  HUMANITARIAN: ['HUMANITARIAN'],
  SPACE: ['SPACE'],
};

export interface IntelEvent {
  id: string;
  headline: string;
  source?: string;
  category?: string;
  priority?: string;
  time?: string;
  [k: string]: unknown;
}

export interface WMIntelFeedProps {
  /** Articles to show as events (from news feed) */
  articles?: Array<{ id: string; headline: string; source?: string; category?: string; priority?: string; sort_ts?: number; time?: string }>;
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
  selectedEventId?: string | null;
  onSelectEvent?: (event: IntelEvent | null) => void;
}

function mapArticleToWMCategory(article: { category?: string; priority?: string }): string {
  const cat = (article.category || '').toUpperCase();
  const pri = (article.priority || '').toUpperCase();
  if (pri === 'FLASH' || pri === 'URGENT') return 'BREAKING';
  for (const [wmCat, keys] of Object.entries(CATEGORY_MAP)) {
    if (keys.some(k => cat.includes(k))) return wmCat;
  }
  return 'TECHNOLOGY';
}

const WMIntelFeed: React.FC<WMIntelFeedProps> = ({
  articles = [],
  activeCategory = 'BREAKING',
  onCategoryChange,
  selectedEventId,
  onSelectEvent,
}) => {
  const [scrollTop, setScrollTop] = useState(0);

  const eventsByCategory = useMemo(() => {
    const map: Record<string, IntelEvent[]> = {};
    WM_CATEGORIES.forEach(c => { map[c] = []; });
    articles.forEach(a => {
      const wmCat = mapArticleToWMCategory(a);
      if (!map[wmCat]) map[wmCat] = [];
      map[wmCat].push({
        id: a.id,
        headline: a.headline,
        source: a.source,
        category: a.category,
        priority: a.priority,
        time: a.time,
      });
    });
    return map;
  }, [articles]);

  const categoriesWithCount = useMemo(() =>
    WM_CATEGORIES.map(cat => ({ id: cat, count: (eventsByCategory[cat] || []).length })).filter(c => c.count > 0),
    [eventsByCategory]
  );

  const currentEvents = eventsByCategory[activeCategory] || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT, fontSize: '10px', color: C.TEXT }}>
      {/* Category tabs — horizontal scroll */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 2, padding: '6px 8px', borderBottom: `1px solid ${C.BORDER}`,
        overflowX: 'auto', minHeight: 32,
      }}>
        {(categoriesWithCount.length ? categoriesWithCount : WM_CATEGORIES.map(c => ({ id: c, count: 0 }))).map(({ id, count }) => (
          <button
            key={id}
            onClick={() => onCategoryChange?.(id)}
            style={{
              flexShrink: 0, padding: '2px 6px', border: 'none', borderRadius: 2, cursor: 'pointer',
              backgroundColor: activeCategory === id ? C.AMBER : 'transparent',
              color: activeCategory === id ? '#fff' : C.TEXT_MUTE,
              fontWeight: activeCategory === id ? 700 : 400, fontSize: 9,
            }}
          >
            {id.slice(0, 6)}{count > 0 ? ` (${count})` : ''}
          </button>
        ))}
      </div>
      {/* Event list */}
      <div
        style={{ flex: 1, overflow: 'auto', padding: '4px 8px' }}
        onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        {currentEvents.length === 0 ? (
          <div style={{ color: C.TEXT_MUTE, padding: '12px 0' }}>No events in {activeCategory}.</div>
        ) : (
          currentEvents.slice(0, 80).map(ev => {
            const selected = selectedEventId === ev.id;
            return (
              <div
                key={ev.id}
                onClick={() => onSelectEvent?.(selected ? null : ev)}
                style={{
                  padding: '6px 8px', marginBottom: 4, borderRadius: 2, cursor: 'pointer',
                  backgroundColor: selected ? 'rgba(77,166,255,0.15)' : 'transparent',
                  borderLeft: selected ? `2px solid ${C.BLUE}` : '2px solid transparent',
                }}
              >
                <div style={{ fontSize: 9, color: C.TEXT_MUTE, marginBottom: 2 }}>{ev.source} {ev.priority ? ` · ${ev.priority}` : ''}</div>
                <div style={{ fontWeight: 600, color: C.TEXT, lineHeight: 1.3 }}>{ev.headline}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default WMIntelFeed;
