/**
 * NewsMapPanel.tsx — Globe/map intel overlay with WorldMonitor data layers
 * Real-time earthquakes (USGS), natural events (NASA EONET), news markers
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Globe, Map, Eye, EyeOff, Crosshair, ChevronUp, ChevronDown, Zap, Flame, Activity } from 'lucide-react';
import { generateMapHTML } from '@/components/tabs/maritime/utils/mapHtmlGenerator';
import { NewsMarker } from '@/services/news/newsClusterService';
import { fetchAllGeoEvents, type GeoEvent } from '@/services/news/worldMonitorService';

const C = {
  BG: '#000000', TOOLBAR: '#1A1A1A',
  BORDER: '#1E1E1E',
  TEXT_MUTE: '#555555', TEXT_DIM: '#888888',
  AMBER: '#FF8800', BLUE: '#4DA6FF', CYAN: '#00D4AA', RED: '#EF4444',
} as const;
const FONT = '"IBM Plex Mono", "SF Mono", "Consolas", monospace';

interface Props {
  markers: NewsMarker[];
  onMarkerClick: (clusterId: string) => void;
  colors: Record<string, string>;
}

export const NewsMapPanel: React.FC<Props> = ({ markers, onMarkerClick }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [markersVisible, setMarkersVisible] = useState(true);
  const [geoVisible, setGeoVisible] = useState(true);
  const [mapMode, setMapMode] = useState<'3D' | '2D'>('3D');
  const [geoEvents, setGeoEvents] = useState<GeoEvent[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const mapHtml = useRef<string>(generateMapHTML());

  const loadGeoEvents = useCallback(async () => {
    setGeoLoading(true);
    try {
      const events = await fetchAllGeoEvents();
      setGeoEvents(events);
    } catch { /* non-fatal */ }
    setGeoLoading(false);
  }, []);

  useEffect(() => { loadGeoEvents(); }, [loadGeoEvents]);

  // Auto-refresh geo events every 5 min
  useEffect(() => {
    const iv = setInterval(loadGeoEvents, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [loadGeoEvents]);

  // Send news markers to iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || collapsed) return;
    const send = () => {
      try {
        const w = iframe.contentWindow as (Window & {
          updateNewsMarkers?: (m: NewsMarker[]) => void;
          onNewsMarkerClick?: ((id: string) => void) | null;
        }) | null;
        if (w?.updateNewsMarkers) { w.updateNewsMarkers(markers); w.onNewsMarkerClick = onMarkerClick; }
      } catch { /* iframe not ready */ }
    };
    const t = setTimeout(send, 600);
    return () => clearTimeout(t);
  }, [markers, collapsed, onMarkerClick]);

  // Send geo events to iframe as additional markers
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || collapsed || !geoVisible) return;
    const send = () => {
      try {
        const w = iframe.contentWindow as (Window & {
          updateNewsMarkers?: (m: NewsMarker[]) => void;
        }) | null;
        if (w?.updateNewsMarkers) {
          const geoMarkers: NewsMarker[] = geoEvents.map(e => ({
            lat: e.lat,
            lng: e.lng,
            headline: `${e.icon} ${e.title}`,
            category: e.category,
            priority: e.priority >= 3 ? 'URGENT' as const : 'NORMAL' as const,
            tier: e.priority >= 3 ? 1 : 2,
            clusterId: `geo-${e.id}`,
          }));
          const combined = [...markers, ...(geoVisible ? geoMarkers : [])];
          w.updateNewsMarkers(combined);
        }
      } catch { /* iframe not ready */ }
    };
    const t = setTimeout(send, 800);
    return () => clearTimeout(t);
  }, [geoEvents, geoVisible, markers, collapsed]);

  const toggleMarkers = () => {
    setMarkersVisible(v => !v);
    try { (iframeRef.current?.contentWindow as Window & { toggleNewsMarkers?: () => void })?.toggleNewsMarkers?.(); } catch {}
  };

  const switchMode = (m: '3D' | '2D') => {
    setMapMode(m);
    try { (iframeRef.current?.contentWindow as Window & { switchMapMode?: (m: string) => void })?.switchMapMode?.(m); } catch {}
  };

  const zoomHotspot = () => {
    const hot = markers.find(m => m.priority === 'FLASH' || m.priority === 'URGENT') || (geoEvents.length > 0 ? { lat: geoEvents[0].lat, lng: geoEvents[0].lng } : null);
    if (!hot) return;
    try {
      const w = iframeRef.current?.contentWindow as Window & { world?: { pointOfView: (p: any, d: number) => void } };
      w?.world?.pointOfView?.({ lat: (hot as any).lat, lng: (hot as any).lng, altitude: 1.5 }, 1000);
    } catch {}
  };

  const eqCount = geoEvents.filter(e => e.type === 'earthquake').length;
  const natCount = geoEvents.filter(e => e.type === 'natural').length;

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '2px 7px', fontSize: '8px', fontWeight: 700,
    backgroundColor: active ? `${C.CYAN}15` : 'transparent',
    border: `1px solid ${active ? C.CYAN : C.BORDER}`,
    color: active ? C.CYAN : C.TEXT_MUTE,
    cursor: 'pointer', borderRadius: '2px', fontFamily: FONT,
    display: 'flex', alignItems: 'center', gap: '3px',
    letterSpacing: '0.3px',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '4px',
        padding: '4px 10px',
        backgroundColor: C.TOOLBAR, borderBottom: `1px solid ${C.BORDER}`,
        fontFamily: FONT, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '8px', fontWeight: 700, color: C.CYAN, letterSpacing: '1px' }}>INTEL MAP</span>
        <span style={{ fontSize: '8px', color: C.TEXT_MUTE }}>{markers.length} NEWS</span>
        {geoEvents.length > 0 && (
          <span style={{ fontSize: '8px', color: C.RED }}>
            {eqCount > 0 && `🔴 ${eqCount}`} {natCount > 0 && `🔥 ${natCount}`}
          </span>
        )}
        <div style={{ flex: 1 }} />

        <button onClick={() => switchMode('3D')} style={btn(mapMode === '3D')}><Globe size={9} />3D</button>
        <button onClick={() => switchMode('2D')} style={btn(mapMode === '2D')}><Map size={9} />2D</button>
        <button onClick={toggleMarkers} style={btn(markersVisible)}>
          {markersVisible ? <Eye size={9} /> : <EyeOff size={9} />}NEWS
        </button>
        <button onClick={() => setGeoVisible(v => !v)} style={btn(geoVisible)}>
          <Activity size={9} />{geoVisible ? 'GEO' : 'GEO'}
        </button>
        <button onClick={zoomHotspot} style={btn(false)}><Crosshair size={9} />HOT</button>
        <button onClick={() => setCollapsed(c => !c)} style={btn(false)}>
          {collapsed ? <ChevronDown size={9} /> : <ChevronUp size={9} />}
        </button>
      </div>

      {/* Geo event legend */}
      {!collapsed && geoEvents.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, padding: '3px 10px',
          backgroundColor: C.BG, borderBottom: `1px solid ${C.BORDER}`,
          fontSize: 8, fontFamily: FONT, color: C.TEXT_DIM, flexWrap: 'wrap',
        }}>
          {eqCount > 0 && <span>🔴 Earthquakes ({eqCount})</span>}
          {geoEvents.filter(e => e.category === 'Wildfires').length > 0 && <span>🔥 Wildfires ({geoEvents.filter(e => e.category === 'Wildfires').length})</span>}
          {geoEvents.filter(e => e.category === 'Volcanoes').length > 0 && <span>🌋 Volcanoes ({geoEvents.filter(e => e.category === 'Volcanoes').length})</span>}
          {geoEvents.filter(e => e.category === 'Severe Storms').length > 0 && <span>🌀 Storms ({geoEvents.filter(e => e.category === 'Severe Storms').length})</span>}
          {geoEvents.filter(e => e.category === 'Floods').length > 0 && <span>🌊 Floods ({geoEvents.filter(e => e.category === 'Floods').length})</span>}
        </div>
      )}

      {!collapsed && (
        <div style={{ height: '280px', position: 'relative', flexShrink: 0 }}>
          <iframe
            ref={iframeRef}
            srcDoc={mapHtml.current}
            style={{ width: '100%', height: '100%', border: 'none', background: C.BG }}
            title="News Intelligence Map"
          />
          {geoLoading && (
            <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 8, color: C.AMBER, fontFamily: FONT }}>
              Loading geo data...
            </div>
          )}
        </div>
      )}
    </div>
  );
};
