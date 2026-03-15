/**
 * World Monitor — real-time global intelligence dashboard.
 * Layout: breaking banner + left (Country Intel, Signal Matrix, Finance Radar) | center map | right (Intel Feed + detail).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWorkspaceTabState } from '@/hooks/useWorkspaceTabState';
import { fetchAllNews, type NewsArticle } from '@/services/news/newsService';
import { clusterArticles, getBreakingClusters, type NewsCluster } from '@/services/news/newsClusterService';
import { NewsBreakingBanner } from './NewsBreakingBanner';
import { WMMap, WMCountryIntel, WMSignalMatrix, WMIntelFeed, WMFinanceRadar, WMLivePanel } from './wm';

const FONT = '"IBM Plex Mono", "SF Mono", "Consolas", monospace';
const C = {
  BG: '#000000',
  SURFACE: '#080808',
  PANEL: '#0D0D0D',
  BORDER: '#1E1E1E',
  TEXT: '#D4D4D4',
  TEXT_MUTE: '#888888',
  AMBER: '#FF8800',
};

const WorldMonitorTab: React.FC = () => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedBannerIds, setDismissedBannerIds] = useState<Set<string>>(new Set());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeIntelCategory, setActiveIntelCategory] = useState('BREAKING');
  const [layersVisible, setLayersVisible] = useState<Record<string, boolean>>({
    news: true, conflict: true, disaster: true, cyber: false, maritime: false, aviation: false,
  });

  const getWorkspaceState = useCallback(() => ({
    activeIntelCategory, selectedEventId, layersVisible,
  }), [activeIntelCategory, selectedEventId, layersVisible]);
  const setWorkspaceState = useCallback((s: Record<string, unknown>) => {
    if (typeof s.activeIntelCategory === 'string') setActiveIntelCategory(s.activeIntelCategory);
    if (s.selectedEventId === null || typeof s.selectedEventId === 'string') setSelectedEventId(s.selectedEventId as string | null);
    if (s.layersVisible && typeof s.layersVisible === 'object') setLayersVisible(s.layersVisible as Record<string, boolean>);
  }, []);
  useWorkspaceTabState('news-wm', getWorkspaceState, setWorkspaceState);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchAllNews(true);
      setArticles(list);
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const clusters = useMemo(() => clusterArticles(articles), [articles]);
  const breakingClusters = useMemo(() => getBreakingClusters(clusters).filter(c => !dismissedBannerIds.has(c.id)), [clusters, dismissedBannerIds]);
  const topBreaking: NewsCluster | null = breakingClusters[0] ?? null;

  const scrollToCluster = useCallback((_id: string) => {}, []);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: C.BG,
      color: C.TEXT,
      fontFamily: FONT,
      fontSize: '11px',
      overflow: 'hidden',
    }}>
      {/* Breaking banner */}
      {topBreaking && (
        <NewsBreakingBanner
          cluster={topBreaking}
          onDismiss={id => setDismissedBannerIds(prev => new Set([...prev, id]))}
          onScrollTo={scrollToCluster}
          colors={{}}
        />
      )}

      {/* Live TV — WorldMonitor-style video strip (collapsible) */}
      <WMLivePanel defaultCollapsed={true} height={220} />

      {/* Three-panel body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        {/* Left panel — 320px */}
        <div style={{
          width: '320px',
          flexShrink: 0,
          backgroundColor: C.PANEL,
          borderRight: `1px solid ${C.BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '6px 10px', borderBottom: `1px solid ${C.BORDER}`, fontSize: '9px', fontWeight: 700, color: C.AMBER, letterSpacing: '0.5px' }}>COUNTRY INTELLIGENCE INDEX</div>
            <WMCountryIntel articles={articles} />
          </div>
          <div style={{ flexShrink: 0, borderTop: `1px solid ${C.BORDER}` }}>
            <div style={{ padding: '4px 10px', fontSize: '9px', fontWeight: 700, color: C.AMBER }}>SIGNAL CORRELATION</div>
            <WMSignalMatrix articles={articles} />
          </div>
          <div style={{ flexShrink: 0, borderTop: `1px solid ${C.BORDER}` }}>
            <div style={{ padding: '4px 10px', fontSize: '9px', fontWeight: 700, color: C.AMBER }}>FINANCE RADAR</div>
            <WMFinanceRadar articles={articles} />
          </div>
        </div>

        {/* Center — map */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', backgroundColor: C.SURFACE }}>
          <WMMap
            articles={articles}
            layersVisible={layersVisible}
            onLayersChange={setLayersVisible}
            onEventSelect={e => setSelectedEventId(e?.id ?? null)}
            selectedEventId={selectedEventId}
          />
        </div>

        {/* Right panel — 320px */}
        <div style={{
          width: '320px',
          flexShrink: 0,
          backgroundColor: C.PANEL,
          borderLeft: `1px solid ${C.BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '6px 10px', borderBottom: `1px solid ${C.BORDER}`, fontSize: '9px', fontWeight: 700, color: C.AMBER }}>
            INTELLIGENCE FEED
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <WMIntelFeed
              articles={articles}
              activeCategory={activeIntelCategory}
              onCategoryChange={setActiveIntelCategory}
              selectedEventId={selectedEventId}
              onSelectEvent={e => setSelectedEventId(e?.id ?? null)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorldMonitorTab;
