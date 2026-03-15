/**
 * WorldMonitor Integration Service
 * Fetches real-time geo-intelligence data from public sources
 * (USGS earthquakes, NASA EONET natural events) via backend proxy.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export interface GeoEvent {
  id: string;
  type: 'earthquake' | 'natural';
  category: string;
  title: string;
  lat: number;
  lng: number;
  magnitude?: number;
  depth?: number;
  time?: number;
  date?: string;
  url?: string;
  icon: string;
  color: string;
  priority: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  earthquake: '🔴',
  Wildfires: '🔥',
  Volcanoes: '🌋',
  'Severe Storms': '🌀',
  Floods: '🌊',
  Landslides: '⛰️',
  'Sea and Lake Ice': '🧊',
  Drought: '☀️',
  'Dust and Haze': '🌫️',
  'Temperature Extremes': '🌡️',
  Snow: '❄️',
};

const CATEGORY_COLORS: Record<string, string> = {
  earthquake: '#EF4444',
  Wildfires: '#F97316',
  Volcanoes: '#DC2626',
  'Severe Storms': '#8B5CF6',
  Floods: '#3B82F6',
  Landslides: '#A16207',
  'Sea and Lake Ice': '#06B6D4',
  Drought: '#EAB308',
  Snow: '#E5E7EB',
};

function getPriority(event: GeoEvent): number {
  if (event.type === 'earthquake') return (event.magnitude ?? 0) >= 6 ? 3 : 2;
  if (event.category === 'Volcanoes') return 3;
  if (event.category === 'Severe Storms') return 2;
  return 1;
}

let cachedEarthquakes: GeoEvent[] = [];
let cachedNatural: GeoEvent[] = [];
let lastFetchEq = 0;
let lastFetchNat = 0;
const CACHE_TTL_EQ = 5 * 60 * 1000;
const CACHE_TTL_NAT = 15 * 60 * 1000;

export async function fetchEarthquakes(timeframe = 'day', minMag = '4.5'): Promise<GeoEvent[]> {
  if (cachedEarthquakes.length > 0 && Date.now() - lastFetchEq < CACHE_TTL_EQ) return cachedEarthquakes;
  try {
    const res = await fetch(`${API_BASE}/api/v1/proxy/worldmonitor/earthquakes?min_magnitude=${minMag}&timeframe=${timeframe}`);
    if (!res.ok) return cachedEarthquakes;
    const data = await res.json();
    cachedEarthquakes = (data.events ?? []).map((e: any): GeoEvent => ({
      id: e.id,
      type: 'earthquake',
      category: 'earthquake',
      title: `M${e.magnitude} — ${e.place}`,
      lat: e.lat,
      lng: e.lng,
      magnitude: e.magnitude,
      depth: e.depth,
      time: e.time,
      url: e.url,
      icon: '🔴',
      color: '#EF4444',
      priority: e.magnitude >= 6 ? 3 : 2,
    }));
    lastFetchEq = Date.now();
    return cachedEarthquakes;
  } catch {
    return cachedEarthquakes;
  }
}

export async function fetchNaturalEvents(limit = 50): Promise<GeoEvent[]> {
  if (cachedNatural.length > 0 && Date.now() - lastFetchNat < CACHE_TTL_NAT) return cachedNatural;
  try {
    const res = await fetch(`${API_BASE}/api/v1/proxy/worldmonitor/natural-events?limit=${limit}`);
    if (!res.ok) return cachedNatural;
    const data = await res.json();
    cachedNatural = (data.events ?? []).map((e: any): GeoEvent => {
      const cat = e.category || 'Unknown';
      const evt: GeoEvent = {
        id: e.id,
        type: 'natural',
        category: cat,
        title: e.title,
        lat: e.lat,
        lng: e.lng,
        date: e.date,
        url: e.link,
        icon: CATEGORY_ICONS[cat] || '⚠️',
        color: CATEGORY_COLORS[cat] || '#EAB308',
        priority: cat === 'Volcanoes' ? 3 : cat === 'Severe Storms' ? 2 : 1,
      };
      return evt;
    });
    lastFetchNat = Date.now();
    return cachedNatural;
  } catch {
    return cachedNatural;
  }
}

export async function fetchAllGeoEvents(): Promise<GeoEvent[]> {
  const [eq, nat] = await Promise.all([
    fetchEarthquakes(),
    fetchNaturalEvents(),
  ]);
  return [...eq, ...nat].sort((a, b) => b.priority - a.priority);
}
