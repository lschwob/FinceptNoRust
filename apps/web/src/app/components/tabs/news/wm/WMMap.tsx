/**
 * World Monitor Map — deck.gl map with 6 data layers (news, conflict, disaster, cyber, maritime, aviation).
 * Data: API events (when apiKey) + RSS articles by region (WorldMonitor-style). Fallback reference points if empty.
 */
import React, { useState, useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { useAuth } from '@/contexts/AuthContext';
import { useCache } from '@/hooks/useCache';
import { cacheKey } from '@/hooks/useCache';
import { NewsEventsService, type NewsEvent } from '@/services/news/newsEventsService';
import { getArticleCoords } from '@/services/news/newsClusterService';
import type { NewsArticle } from '@/services/news/newsService';
import { withTimeout } from '@/services/core/apiUtils';
import { Layers } from 'lucide-react';

const API_TIMEOUT_MS = 30000;
const INITIAL_VIEW_STATE = { longitude: 20, latitude: 30, zoom: 2, pitch: 0, bearing: 0 };

const LAYER_IDS = ['news', 'conflict', 'disaster', 'cyber', 'maritime', 'aviation'] as const;
const LAYER_LABELS: Record<string, string> = { news: 'News', conflict: 'Conflict', disaster: 'Disaster', cyber: 'Cyber', maritime: 'Maritime', aviation: 'Aviation' };
const LAYER_COLORS: Record<string, [number, number, number, number]> = {
  news: [255, 136, 0, 220],
  conflict: [230, 70, 70, 220],
  disaster: [255, 165, 0, 220],
  cyber: [147, 51, 234, 220],
  maritime: [100, 149, 237, 220],
  aviation: [0, 229, 255, 220],
};

function mapEventToLayer(event: NewsEvent): string {
  const cat = (event.event_category || '').toLowerCase();
  if (cat.includes('armed_conflict') || cat.includes('terrorism') || cat.includes('political_violence') || cat.includes('civilian_violence') || cat.includes('riots')) return 'conflict';
  if (cat.includes('crisis') || cat.includes('explosions') || cat.includes('disaster')) return 'disaster';
  if (cat.includes('cyber') || cat.includes('hack')) return 'cyber';
  if (cat.includes('maritime') || cat.includes('vessel') || cat.includes('ship')) return 'maritime';
  if (cat.includes('aviation') || cat.includes('flight') || cat.includes('air')) return 'aviation';
  return 'news';
}

/** Map RSS article category to map layer (WorldMonitor-style). */
function articleCategoryToLayer(article: { category?: string }): string {
  const cat = (article.category || '').toUpperCase();
  if (cat.includes('GEOPOLITICS') || cat.includes('DEFENSE') || cat === 'GEO' || cat === 'DEF') return 'conflict';
  if (cat.includes('DISASTER') || cat.includes('CRISIS') || cat.includes('ENVIRONMENTAL') || cat === 'ENV') return 'disaster';
  if (cat.includes('CYBER') || cat.includes('SECURITY') && cat.includes('TECH')) return 'cyber';
  if (cat.includes('MARITIME') || cat.includes('SHIP')) return 'maritime';
  if (cat.includes('AVIATION') || cat.includes('FLIGHT')) return 'aviation';
  return 'news';
}

/** Fallback reference points (WorldMonitor-style hotspots) when no articles/events — so map is never empty. */
const REFERENCE_POINTS: Array<{ layer: string; lng: number; lat: number; label: string }> = [
  { layer: 'conflict', lng: 31.2, lat: 48.4, label: 'Ukraine' },
  { layer: 'conflict', lng: 34.9, lat: 31.0, label: 'Israel' },
  { layer: 'conflict', lng: 38.9, lat: 34.8, label: 'Syria' },
  { layer: 'news', lng: -0.1, lat: 51.5, label: 'UK' },
  { layer: 'news', lng: -77.0, lat: 38.9, label: 'US' },
  { layer: 'news', lng: 10.5, lat: 50.9, label: 'EU' },
  { layer: 'news', lng: 104.2, lat: 35.9, label: 'China' },
  { layer: 'disaster', lng: 133.8, lat: -25.3, label: 'Australia' },
  { layer: 'news', lng: 78.9, lat: 20.6, label: 'India' },
];

export interface WMMapProps {
  /** RSS articles to display on map by region (WorldMonitor-style). */
  articles?: NewsArticle[];
  layersVisible?: Record<string, boolean>;
  onLayersChange?: (layers: Record<string, boolean>) => void;
  onEventSelect?: (event: { id: string; headline?: string; [k: string]: unknown }) => void;
  selectedEventId?: string | null;
}

type MapPoint = { position: [number, number, number]; color: [number, number, number, number]; event: NewsEvent | NewsArticle; isArticle: boolean };

const WMMap: React.FC<WMMapProps> = ({
  articles = [],
  layersVisible = {},
  onLayersChange,
  onEventSelect,
  selectedEventId,
}) => {
  const { session } = useAuth();
  const apiKey = session?.api_key || null;
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

  const { data: eventsResponse } = useCache({
    key: cacheKey('wm-map-events'),
    category: 'news',
    fetcher: async () => {
      if (!apiKey) return { success: true as const, events: [] as NewsEvent[], total: 0, page: 1, limit: 100 };
      return withTimeout(
        NewsEventsService.getNewsEvents(apiKey, { limit: 150 }),
        API_TIMEOUT_MS
      );
    },
    enabled: true,
    ttl: 300000,
    staleWhileRevalidate: true,
  });

  const events = useMemo(() => (eventsResponse?.success ? eventsResponse.events || [] : []), [eventsResponse]);

  const pointsByLayer = useMemo(() => {
    const byLayer: Record<string, MapPoint[]> = {};
    LAYER_IDS.forEach(id => { byLayer[id] = []; });

    // 1) API events (geo from API)
    events.forEach(event => {
      if (event.latitude == null || event.longitude == null || !isFinite(event.latitude) || !isFinite(event.longitude)) return;
      const layer = mapEventToLayer(event);
      const color = LAYER_COLORS[layer] ?? LAYER_COLORS.news;
      const jitter = 0.02 * (Math.random() - 0.5);
      const angle = Math.random() * Math.PI * 2;
      byLayer[layer].push({
        position: [
          event.longitude + jitter * Math.cos(angle),
          event.latitude + jitter * Math.sin(angle),
          0,
        ],
        color,
        event: event as NewsEvent & NewsArticle,
        isArticle: false,
      });
    });

    // 2) RSS articles by region (WorldMonitor-style)
    articles.forEach(article => {
      const coords = getArticleCoords(article);
      if (!coords) return;
      const layer = articleCategoryToLayer(article);
      const color = LAYER_COLORS[layer] ?? LAYER_COLORS.news;
      const jitter = 0.015 * (Math.random() - 0.5);
      const angle = Math.random() * Math.PI * 2;
      byLayer[layer].push({
        position: [
          coords.lng + jitter * Math.cos(angle),
          coords.lat + jitter * Math.sin(angle),
          0,
        ],
        color,
        event: article as NewsEvent & NewsArticle,
        isArticle: true,
      });
    });

    // 3) Fallback: reference points so map is never empty
    const totalPoints = Object.values(byLayer).reduce((s, arr) => s + arr.length, 0);
    if (totalPoints === 0) {
      REFERENCE_POINTS.forEach((ref, i) => {
        const color = LAYER_COLORS[ref.layer] ?? LAYER_COLORS.news;
        byLayer[ref.layer].push({
          position: [ref.lng, ref.lat, 0],
          color,
          event: { id: `ref-${i}`, headline: ref.label, event_category: ref.layer } as NewsEvent & NewsArticle,
          isArticle: false,
        });
      });
    }
    return byLayer;
  }, [events, articles]);

  const layers = useMemo(() => {
    const base: any[] = [
      new TileLayer({
        id: 'wm-basemap',
        data: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        minZoom: 0,
        maxZoom: 19,
        tileSize: 256,
        renderSubLayers: (props: { tile: { boundingBox: number[][] }; data: unknown }) => {
          const { boundingBox } = props.tile;
          return new BitmapLayer(props as any, {
            data: undefined,
            image: (props as any).data,
            bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
          });
        },
      }),
    ];
    LAYER_IDS.forEach(layerId => {
      const visible = layersVisible[layerId] !== false;
      const points = pointsByLayer[layerId] || [];
      if (!visible || points.length === 0) return;
      base.push(
        new ScatterplotLayer({
          id: `wm-${layerId}`,
          data: points,
          getPosition: (d: MapPoint) => d.position,
          getFillColor: (d: MapPoint) => d.color,
          getRadius: 120,
          radiusMinPixels: 4,
          radiusMaxPixels: 24,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 180],
          onClick: (info: { object?: MapPoint }) => {
            if (info.object && onEventSelect) {
              const e = info.object.event as NewsEvent & NewsArticle;
              const id = e.id || (e.url || e.city || (e as NewsEvent).latitude != null ? `${(e as NewsEvent).latitude}-${(e as NewsEvent).longitude}` : '');
              const headline = e.headline || (e as NewsEvent).domain || (e as NewsEvent).event_category || (e as NewsEvent).city || (e as NewsArticle).category || '';
              onEventSelect({ id, headline, ...e });
            }
          },
        } as any)
      );
    });
    return base;
  }, [pointsByLayer, layersVisible, onEventSelect]);

  const toggleLayer = useCallback((id: string) => {
    if (!onLayersChange) return;
    onLayersChange({ ...layersVisible, [id]: !layersVisible[id] });
  }, [layersVisible, onLayersChange]);

  const visibleDefault = { news: true, conflict: true, disaster: true, cyber: false, maritime: false, aviation: false };
  const vis = { ...visibleDefault, ...layersVisible };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0a0a' }}>
      {/* Layer toggle toolbar */}
      <div style={{
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '4px 6px',
        backgroundColor: 'rgba(13,13,13,0.9)',
        border: '1px solid #1e1e1e',
        borderRadius: 4,
        fontSize: 10,
        fontFamily: '"IBM Plex Mono", monospace',
      }}>
        <Layers size={10} style={{ color: '#888', marginRight: 4 }} />
        {LAYER_IDS.map(id => (
          <button
            key={id}
            onClick={() => toggleLayer(id)}
            style={{
              padding: '2px 6px',
              backgroundColor: vis[id] ? `rgb(${LAYER_COLORS[id].slice(0, 3).join(',')})` : 'transparent',
              color: vis[id] ? '#fff' : '#888',
              border: '1px solid ' + (vis[id] ? `rgb(${LAYER_COLORS[id].slice(0, 3).join(',')})` : '#333'),
              borderRadius: 2,
              cursor: 'pointer',
              fontWeight: vis[id] ? 700 : 400,
            }}
          >
            {LAYER_LABELS[id]}
          </button>
        ))}
      </div>

      <DeckGL
        viewState={viewState}
        onViewStateChange={(({ viewState: vs }: any) => setViewState(vs)) as any}
        controller={true}
        layers={layers}
        getTooltip={({ object }: { object?: MapPoint }) => {
          if (!object) return null;
          const e = object.event as NewsEvent & NewsArticle;
          const text = e.headline || (e as NewsEvent).event_category || (e as NewsEvent).city || (e as NewsArticle).category || (e as NewsEvent).domain || 'Event';
          return { text: typeof text === 'string' ? text.slice(0, 80) : 'Event', style: { fontSize: '10px' } };
        }}
      />
    </div>
  );
};

export default WMMap;
