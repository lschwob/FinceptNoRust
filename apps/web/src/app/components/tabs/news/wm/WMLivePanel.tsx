/**
 * World Monitor Live TV — same channels as LiveNewsPanel, works on web (YouTube embed) and Tauri (embed port).
 * WorldMonitor-style live stream strip.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Volume2, VolumeX, ChevronDown, ChevronUp, Radio } from 'lucide-react';

const C = {
  BG: '#000000', PANEL: '#0D0D0D', BORDER: '#1E1E1E', TEXT: '#D4D4D4', TEXT_MUTE: '#888',
  AMBER: '#FF8800', RED: '#E55A5A', CYAN: '#00D4AA',
};
const FONT = '"IBM Plex Mono", "SF Mono", "Consolas", monospace';

export interface WMLiveChannel {
  id: string;
  name: string;
  fallbackVideoId: string;
  hlsUrl?: string;
}

const DEFAULT_CHANNELS: WMLiveChannel[] = [
  { id: 'bloomberg', name: 'Bloomberg', fallbackVideoId: 'iEpJwprxDdk' },
  { id: 'cnbc', name: 'CNBC', fallbackVideoId: '9NyxcX3rhQs' },
  { id: 'sky', name: 'Sky News', fallbackVideoId: 'uvviIF4725I', hlsUrl: 'https://linear901-oo-hls0-prd-gtm.delivery.skycdp.com/17501/sde-fast-skynews/master.m3u8' },
  { id: 'dw', name: 'DW News', fallbackVideoId: 'LuKwFajn37U', hlsUrl: 'https://dwamdstream103.akamaized.net/hls/live/2015526/dwstream103/master.m3u8' },
  { id: 'france24', name: 'France 24', fallbackVideoId: 'Ap-UM1O9RBU', hlsUrl: 'https://amg00106-france24-france24-samsunguk-qvpp8.amagi.tv/playlist/amg00106-france24-france24-samsunguk/playlist.m3u8' },
  { id: 'aljazeera', name: 'Al Jazeera', fallbackVideoId: 'gCNeDWCI0vo' },
  { id: 'cbs-news', name: 'CBS News', fallbackVideoId: 'R9L8sDK8iEc', hlsUrl: 'https://cbsn-us.cbsnstream.cbsnews.com/out/v1/55a8648e8f134e82a470f83d562deeca/master.m3u8' },
  { id: 'trt-world', name: 'TRT World', fallbackVideoId: 'ABfFhWzWs0s', hlsUrl: 'https://tv-trtworld.medya.trt.com.tr/master.m3u8' },
  { id: 'euronews', name: 'Euronews', fallbackVideoId: 'pykpO5kQJ98' },
  { id: 'nhk', name: 'NHK World', fallbackVideoId: 'OpGjrfMFaSI' },
];

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

export interface WMLivePanelProps {
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
  /** Height when expanded */
  height?: number;
}

const WMLivePanel: React.FC<WMLivePanelProps> = ({ defaultCollapsed = true, height = 220 }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [activeId, setActiveId] = useState(DEFAULT_CHANNELS[0]?.id ?? '');
  const [muted, setMuted] = useState(true);
  const [embedPort, setEmbedPort] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      try {
        (window as any).__TAURI__.core?.invoke?.('get_embed_port').then((port: number) => setEmbedPort(port || 0)).catch(() => setEmbedPort(0));
      } catch {
        setEmbedPort(0);
      }
    }
  }, []);

  const activeCh = DEFAULT_CHANNELS.find(c => c.id === activeId) ?? DEFAULT_CHANNELS[0];

  const embedSrc = useCallback((ch: WMLiveChannel) => {
    if (embedPort > 0) return `http://127.0.0.1:${embedPort}/yt-embed?videoId=${ch.fallbackVideoId}&autoplay=1&mute=${muted ? '1' : '0'}`;
    return `https://www.youtube.com/embed/${ch.fallbackVideoId}?autoplay=1&mute=${muted ? '1' : '0'}`;
  }, [embedPort, muted]);

  return (
    <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.BORDER}`, fontFamily: FONT }}>
      {/* Header bar — always visible */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          backgroundColor: C.PANEL,
          border: 'none',
          borderBottom: `1px solid ${C.BORDER}`,
          color: C.TEXT,
          cursor: 'pointer',
          fontSize: '10px',
          fontWeight: 700,
        }}
      >
        <Radio size={12} style={{ color: C.RED }} />
        <span style={{ color: C.AMBER }}>LIVE TV</span>
        <span style={{ color: C.TEXT_MUTE, fontWeight: 400 }}>{activeCh?.name}</span>
        <span style={{ marginLeft: 'auto' }}>{collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span>
      </button>

      {!collapsed && (
        <>
          {/* Channel tabs */}
          <div style={{ display: 'flex', gap: 2, padding: '4px 8px', backgroundColor: C.PANEL, flexWrap: 'wrap' }}>
            {DEFAULT_CHANNELS.map(ch => (
              <button
                key={ch.id}
                onClick={() => setActiveId(ch.id)}
                style={{
                  padding: '2px 6px',
                  fontSize: '9px',
                  fontWeight: ch.id === activeId ? 700 : 400,
                  backgroundColor: ch.id === activeId ? `${C.AMBER}20` : 'transparent',
                  border: `1px solid ${ch.id === activeId ? C.AMBER : 'transparent'}`,
                  color: ch.id === activeId ? C.AMBER : C.TEXT_MUTE,
                  cursor: 'pointer',
                  borderRadius: 2,
                  whiteSpace: 'nowrap',
                  fontFamily: FONT,
                }}
              >
                {ch.name}
              </button>
            ))}
          </div>

          {/* Player area — HLS or YouTube */}
          <div style={{ height, position: 'relative', background: C.BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {activeCh?.hlsUrl ? (
              <video
                key={`hls-${activeId}`}
                ref={videoRef}
                src={activeCh.hlsUrl}
                autoPlay
                muted={muted}
                playsInline
                controls
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: C.BG }}
              />
            ) : activeCh ? (
              <iframe
                key={`yt-${activeId}`}
                src={embedSrc(activeCh)}
                style={{ width: '100%', height: '100%', border: 'none', background: C.BG }}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                title={`${activeCh.name} live`}
              />
            ) : null}
            {/* Mute toggle overlay */}
            <button
              onClick={() => setMuted(m => !m)}
              style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                padding: '4px 8px',
                backgroundColor: 'rgba(0,0,0,0.7)',
                border: `1px solid ${C.BORDER}`,
                borderRadius: 2,
                color: C.TEXT,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '9px',
                fontFamily: FONT,
              }}
            >
              {muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default WMLivePanel;
