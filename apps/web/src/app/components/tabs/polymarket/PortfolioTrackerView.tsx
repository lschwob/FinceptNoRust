import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Clock3,
  Copy,
  Download,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import polymarketApiService, {
  ClosedPosition,
  UserActivity,
  UserPortfolioValue,
  UserPosition,
  UserTradeHistory,
} from '@/services/polymarket/polymarketApiService';
import { C, fmtVol, sectionHeader, statCell } from './tokens';

type PositionSortMode =
  | 'pnl_desc'
  | 'value_desc'
  | 'size_desc'
  | 'category'
  | 'market_az'
  | 'taken_date_desc'
  | 'taken_date_asc';
type QuickFilter =
  | 'all'
  | 'btc_updown_5m'
  | 'btc_updown_15m'
  | 'btc_updown_1h'
  | 'iran'
  | 'geopolitics';

interface TrackedWalletConfig {
  id: string;
  address: string;
  label: string;
  enabled: boolean;
  captureEnabled: boolean;
  createdAt: number;
}

interface WalletLiveSummary {
  openPositions: number;
  closedPositions: number;
  trades: number;
  activity: number;
  grossExposure: number;
  cashPnl: number;
  realizedPnl: number;
  yesExposure: number;
  noExposure: number;
  volume24h: number;
  tradeCount24h: number;
  winRateClosed: number | null;
  concentrationTop5: number;
}

interface WalletLiveState {
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  positions: UserPosition[];
  closedPositions: ClosedPosition[];
  trades: UserTradeHistory[];
  activity: UserActivity[];
  portfolioValue: number | null;
  summary: WalletLiveSummary;
}

interface PositionSnapshotRow {
  conditionId: string;
  title: string;
  slug: string;
  outcome: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  cashPnl: number;
  currentValue: number;
}

interface CaptureSnapshot {
  ts: number;
  positionCount: number;
  grossExposure: number;
  cashPnl: number;
  portfolioValue: number | null;
  positions: PositionSnapshotRow[];
}

interface CaptureTradeEvent {
  ts: number;
  side: string;
  outcome: string;
  title: string;
  size: number;
  price: number;
}

interface CaptureActivityEvent {
  ts: number;
  type: string;
  title: string;
  usdcSize: number;
  size: number;
}

interface WalletCaptureStore {
  lastPositionSignature: string | null;
  snapshots: CaptureSnapshot[];
  tradeEvents: CaptureTradeEvent[];
  activityEvents: CaptureActivityEvent[];
  seenTradeKeys: string[];
  seenActivityKeys: string[];
}

type CaptureStoreByAddress = Record<string, WalletCaptureStore>;
type LiveStateByAddress = Record<string, WalletLiveState>;

const CONFIG_STORAGE_KEY = 'polymarket.portfolioTracker.config.v1';
const CAPTURE_STORAGE_KEY = 'polymarket.portfolioTracker.capture.v1';
const REFRESH_STORAGE_KEY = 'polymarket.portfolioTracker.refreshMs.v1';
const MAX_SNAPSHOTS_PER_WALLET = 2000;
const MAX_EVENTS_PER_WALLET = 5000;
const DEFAULT_REFRESH_MS = 5000;
const POSITIONS_PAGE_SIZE = 100;
const MAX_POSITIONS_PAGES = 80;

const EMPTY_SUMMARY: WalletLiveSummary = {
  openPositions: 0,
  closedPositions: 0,
  trades: 0,
  activity: 0,
  grossExposure: 0,
  cashPnl: 0,
  realizedPnl: 0,
  yesExposure: 0,
  noExposure: 0,
  volume24h: 0,
  tradeCount24h: 0,
  winRateClosed: null,
  concentrationTop5: 0,
};

const defaultLiveState = (): WalletLiveState => ({
  loading: false,
  error: null,
  lastUpdated: null,
  positions: [],
  closedPositions: [],
  trades: [],
  activity: [],
  portfolioValue: null,
  summary: EMPTY_SUMMARY,
});

const defaultCaptureStore = (): WalletCaptureStore => ({
  lastPositionSignature: null,
  snapshots: [],
  tradeEvents: [],
  activityEvents: [],
  seenTradeKeys: [],
  seenActivityKeys: [],
});

const safeJsonParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const loadTrackedWallets = (): TrackedWalletConfig[] => {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
  const parsed = safeJsonParse<TrackedWalletConfig[]>(raw, []);
  return Array.isArray(parsed)
    ? parsed
        .map(wallet => ({
          ...wallet,
          label: String(wallet.label ?? ''),
          address: String(wallet.address ?? '').trim(),
          enabled: wallet.enabled !== false,
          captureEnabled: Boolean(wallet.captureEnabled),
          createdAt: Number.isFinite(wallet.createdAt) ? wallet.createdAt : Date.now(),
        }))
        .filter(wallet => wallet.address.length > 0)
    : [];
};

const loadCaptureStore = (): CaptureStoreByAddress => {
  if (typeof localStorage === 'undefined') return {};
  const raw = localStorage.getItem(CAPTURE_STORAGE_KEY);
  const parsed = safeJsonParse<CaptureStoreByAddress>(raw, {});
  return parsed && typeof parsed === 'object' ? parsed : {};
};

const loadRefreshMs = (): number => {
  if (typeof localStorage === 'undefined') return DEFAULT_REFRESH_MS;
  const raw = localStorage.getItem(REFRESH_STORAGE_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 120000) return DEFAULT_REFRESH_MS;
  return Math.round(parsed);
};

const saveToLocal = (key: string, value: unknown): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota/storage write failures
  }
};

const shortAddress = (address: string): string => {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const toMs = (timestamp: number): number => (timestamp < 1e12 ? timestamp * 1000 : timestamp);

const validateAddress = (address: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(address.trim());

const normalizeOutcome = (value: string | undefined | null): string => String(value ?? '').trim().toLowerCase();

const uniqueNonEmpty = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const buildPositionLookupKeys = (position: Pick<UserPosition, 'asset' | 'conditionId' | 'outcome'>): string[] => {
  const asset = String(position.asset ?? '').trim();
  const conditionId = String(position.conditionId ?? '').trim();
  const outcome = normalizeOutcome(position.outcome);
  return uniqueNonEmpty([
    asset ? `asset:${asset}` : '',
    conditionId && outcome ? `condition_outcome:${conditionId}|${outcome}` : '',
    conditionId ? `condition:${conditionId}` : '',
  ]);
};

const buildTradeLookupKeys = (trade: Pick<UserTradeHistory, 'asset' | 'conditionId' | 'outcome'>): string[] => {
  const asset = String(trade.asset ?? '').trim();
  const conditionId = String(trade.conditionId ?? '').trim();
  const outcome = normalizeOutcome(trade.outcome);
  return uniqueNonEmpty([
    asset ? `asset:${asset}` : '',
    conditionId && outcome ? `condition_outcome:${conditionId}|${outcome}` : '',
    conditionId ? `condition:${conditionId}` : '',
  ]);
};

const buildActivityLookupKeys = (activity: Pick<UserActivity, 'asset' | 'conditionId' | 'outcome'>): string[] => {
  const asset = String(activity.asset ?? '').trim();
  const conditionId = String(activity.conditionId ?? '').trim();
  const outcome = normalizeOutcome(activity.outcome);
  return uniqueNonEmpty([
    asset ? `asset:${asset}` : '',
    conditionId && outcome ? `condition_outcome:${conditionId}|${outcome}` : '',
    conditionId ? `condition:${conditionId}` : '',
  ]);
};

const extractPositionTimestampMs = (position: UserPosition): number | null => {
  const raw = position as unknown as Record<string, unknown>;
  const candidates = [
    raw.timestamp,
    raw.openedAt,
    raw.opened_at,
    raw.createdAt,
    raw.created_at,
    raw.updatedAt,
    raw.updated_at,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    return toMs(parsed);
  }
  return null;
};

const formatTakenDate = (timestampMs: number | null): string => {
  if (!timestampMs || !Number.isFinite(timestampMs)) return '—';
  return new Date(timestampMs).toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const getPositionUniqueKey = (position: UserPosition): string => {
  const asset = String(position.asset ?? '').trim();
  if (asset) return `asset:${asset}`;
  const conditionId = String(position.conditionId ?? '').trim();
  const outcome = normalizeOutcome(position.outcome);
  const outcomeIndex = Number.isFinite(position.outcomeIndex) ? String(position.outcomeIndex) : '';
  return uniqueNonEmpty([
    conditionId ? `condition:${conditionId}` : '',
    outcome ? `outcome:${outcome}` : '',
    outcomeIndex ? `idx:${outcomeIndex}` : '',
  ]).join('|');
};

const fetchAllUserPositions = async (walletAddress: string): Promise<UserPosition[]> => {
  const all: UserPosition[] = [];
  const seen = new Set<string>();
  let offset = 0;

  for (let page = 0; page < MAX_POSITIONS_PAGES; page += 1) {
    const batch = await polymarketApiService
      .getUserPositions(walletAddress, {
        limit: POSITIONS_PAGE_SIZE,
        offset,
        sortBy: 'TITLE',
        sortDirection: 'ASC',
      })
      .catch(() => [] as UserPosition[]);

    if (!Array.isArray(batch) || batch.length === 0) break;

    let inserted = 0;
    for (const position of batch) {
      const key = getPositionUniqueKey(position);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      all.push(position);
      inserted += 1;
    }

    if (batch.length < POSITIONS_PAGE_SIZE) break;
    if (inserted === 0) break;
    offset += batch.length;
  }

  return all;
};

const normalizedText = (...parts: Array<string | undefined | null>): string =>
  parts
    .filter(Boolean)
    .map(part => String(part).toLowerCase())
    .join(' ');

const detectCategories = (textRaw: string): string[] => {
  const text = textRaw.toLowerCase();
  const categories: string[] = [];
  if (/(btc|bitcoin)/.test(text) && /(up[^a-z0-9]*or[^a-z0-9]*down|up\/down|updown)/.test(text)) {
    if (/\b5m\b|5[- ]?min/.test(text)) categories.push('BTC Up/Down 5m');
    if (/\b15m\b|15[- ]?min/.test(text)) categories.push('BTC Up/Down 15m');
    if (/\b1h\b|hourly|60[- ]?min/.test(text)) categories.push('BTC Up/Down 1h');
  }
  if (/\biran\b/.test(text)) categories.push('Iran');
  if (/\b(israel|gaza|ukraine|russia|china|taiwan|middle east)\b/.test(text)) categories.push('Geopolitics');
  if (/\b(election|president|senate|congress|trump|biden)\b/.test(text)) categories.push('Politics');
  if (/\b(eth|ethereum)\b/.test(text)) categories.push('ETH');
  if (/\b(sol|solana)\b/.test(text)) categories.push('SOL');
  if (/\b(xrp|ripple)\b/.test(text)) categories.push('XRP');
  if (categories.length === 0) categories.push('Other');
  return Array.from(new Set(categories));
};

const matchesQuickFilter = (textRaw: string, quickFilter: QuickFilter): boolean => {
  const text = textRaw.toLowerCase();
  if (quickFilter === 'all') return true;
  if (quickFilter === 'btc_updown_5m') return /(btc|bitcoin)/.test(text) && /(up[^a-z0-9]*or[^a-z0-9]*down|up\/down|updown)/.test(text) && (/\b5m\b|5[- ]?min/.test(text));
  if (quickFilter === 'btc_updown_15m') return /(btc|bitcoin)/.test(text) && /(up[^a-z0-9]*or[^a-z0-9]*down|up\/down|updown)/.test(text) && (/\b15m\b|15[- ]?min/.test(text));
  if (quickFilter === 'btc_updown_1h') return /(btc|bitcoin)/.test(text) && /(up[^a-z0-9]*or[^a-z0-9]*down|up\/down|updown)/.test(text) && (/\b1h\b|hourly|60[- ]?min/.test(text));
  if (quickFilter === 'iran') return /\biran\b/.test(text);
  return /\b(israel|gaza|ukraine|russia|china|taiwan|middle east|iran)\b/.test(text);
};

const computeSummary = (
  positions: UserPosition[],
  closed: ClosedPosition[],
  trades: UserTradeHistory[],
  activity: UserActivity[]
): WalletLiveSummary => {
  const openPositions = positions.filter(position => (position.size ?? 0) > 0);
  const grossExposure = openPositions.reduce((sum, position) => sum + (position.currentValue ?? 0), 0);
  const cashPnl = openPositions.reduce((sum, position) => sum + (position.cashPnl ?? 0), 0);
  const realizedPnlOpen = openPositions.reduce((sum, position) => sum + (position.realizedPnl ?? 0), 0);
  const realizedPnlClosed = closed.reduce((sum, position) => sum + (position.realizedPnl ?? 0), 0);
  const yesExposure = openPositions
    .filter(position => String(position.outcome ?? '').toLowerCase().includes('yes') || String(position.outcome ?? '').toLowerCase().includes('up'))
    .reduce((sum, position) => sum + (position.currentValue ?? 0), 0);
  const noExposure = Math.max(0, grossExposure - yesExposure);
  const now = Date.now();
  const activity24h = activity.filter(item => {
    const ts = toMs(Number(item.timestamp ?? 0));
    return Number.isFinite(ts) && now - ts <= 24 * 60 * 60 * 1000;
  });
  const volume24h = activity24h.reduce((sum, item) => sum + Math.abs(item.usdcSize ?? 0), 0);
  const tradeCount24h = activity24h.filter(item => item.type === 'BUY' || item.type === 'SELL').length;
  const winCountClosed = closed.filter(position => (position.realizedPnl ?? 0) > 0).length;
  const winRateClosed = closed.length > 0 ? winCountClosed / closed.length : null;
  const top5 = [...openPositions]
    .map(position => Math.abs(position.currentValue ?? 0))
    .sort((a, b) => b - a)
    .slice(0, 5)
    .reduce((sum, value) => sum + value, 0);
  const concentrationTop5 = grossExposure > 0 ? top5 / grossExposure : 0;

  return {
    openPositions: openPositions.length,
    closedPositions: closed.length,
    trades: trades.length,
    activity: activity.length,
    grossExposure,
    cashPnl,
    realizedPnl: realizedPnlOpen + realizedPnlClosed,
    yesExposure,
    noExposure,
    volume24h,
    tradeCount24h,
    winRateClosed,
    concentrationTop5,
  };
};

const buildPositionSignature = (positions: UserPosition[]): string => {
  const normalized = positions
    .filter(position => (position.size ?? 0) > 0)
    .map(position => [
      position.conditionId ?? '',
      position.outcome ?? '',
      Number(position.size ?? 0).toFixed(6),
      Number(position.avgPrice ?? 0).toFixed(6),
      Number(position.curPrice ?? 0).toFixed(6),
    ])
    .sort((a, b) => `${a[0]}|${a[1]}`.localeCompare(`${b[0]}|${b[1]}`));
  return JSON.stringify(normalized);
};

const buildCaptureSnapshot = (
  positions: UserPosition[],
  summary: WalletLiveSummary,
  portfolioValue: number | null
): CaptureSnapshot => ({
  ts: Date.now(),
  positionCount: summary.openPositions,
  grossExposure: summary.grossExposure,
  cashPnl: summary.cashPnl,
  portfolioValue,
  positions: positions
    .filter(position => (position.size ?? 0) > 0)
    .map(position => ({
      conditionId: String(position.conditionId ?? ''),
      title: String(position.title ?? ''),
      slug: String(position.slug ?? ''),
      outcome: String(position.outcome ?? ''),
      size: Number(position.size ?? 0),
      avgPrice: Number(position.avgPrice ?? 0),
      curPrice: Number(position.curPrice ?? 0),
      cashPnl: Number(position.cashPnl ?? 0),
      currentValue: Number(position.currentValue ?? 0),
    })),
});

const applyCaptureUpdate = (
  previous: WalletCaptureStore,
  positions: UserPosition[],
  trades: UserTradeHistory[],
  activity: UserActivity[],
  summary: WalletLiveSummary,
  portfolioValue: number | null
): WalletCaptureStore => {
  let nextStore: WalletCaptureStore = {
    ...previous,
    snapshots: [...previous.snapshots],
    tradeEvents: [...previous.tradeEvents],
    activityEvents: [...previous.activityEvents],
    seenTradeKeys: [...previous.seenTradeKeys],
    seenActivityKeys: [...previous.seenActivityKeys],
  };

  const signature = buildPositionSignature(positions);
  if (signature !== previous.lastPositionSignature) {
    nextStore.lastPositionSignature = signature;
    nextStore.snapshots.push(buildCaptureSnapshot(positions, summary, portfolioValue));
    if (nextStore.snapshots.length > MAX_SNAPSHOTS_PER_WALLET) {
      nextStore.snapshots = nextStore.snapshots.slice(-MAX_SNAPSHOTS_PER_WALLET);
    }
  }

  const seenTradeSet = new Set(nextStore.seenTradeKeys);
  for (const trade of trades) {
    const key = `${trade.timestamp}|${trade.asset}|${trade.side}|${trade.size}|${trade.price}|${trade.conditionId}`;
    if (seenTradeSet.has(key)) continue;
    seenTradeSet.add(key);
    nextStore.tradeEvents.unshift({
      ts: toMs(Number(trade.timestamp ?? 0)),
      side: String(trade.side ?? ''),
      outcome: String(trade.outcome ?? ''),
      title: String(trade.title ?? ''),
      size: Number(trade.size ?? 0),
      price: Number(trade.price ?? 0),
    });
  }
  nextStore.tradeEvents = nextStore.tradeEvents.slice(0, MAX_EVENTS_PER_WALLET);
  nextStore.seenTradeKeys = Array.from(seenTradeSet).slice(-MAX_EVENTS_PER_WALLET);

  const seenActivitySet = new Set(nextStore.seenActivityKeys);
  for (const event of activity) {
    const txHash = String(event.transactionHash ?? '');
    const key = `${txHash}|${event.timestamp}|${event.type}|${event.usdcSize}|${event.size}`;
    if (seenActivitySet.has(key)) continue;
    seenActivitySet.add(key);
    nextStore.activityEvents.unshift({
      ts: toMs(Number(event.timestamp ?? 0)),
      type: String(event.type ?? ''),
      title: String(event.title ?? event.outcome ?? ''),
      usdcSize: Number(event.usdcSize ?? 0),
      size: Number(event.size ?? 0),
    });
  }
  nextStore.activityEvents = nextStore.activityEvents.slice(0, MAX_EVENTS_PER_WALLET);
  nextStore.seenActivityKeys = Array.from(seenActivitySet).slice(-MAX_EVENTS_PER_WALLET);

  return nextStore;
};

const generateId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const PortfolioTrackerView: React.FC = () => {
  const [wallets, setWallets] = useState<TrackedWalletConfig[]>(() => loadTrackedWallets());
  const [captureStore, setCaptureStore] = useState<CaptureStoreByAddress>(() => loadCaptureStore());
  const [liveByAddress, setLiveByAddress] = useState<LiveStateByAddress>({});
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(() => loadTrackedWallets()[0]?.id ?? null);

  const [refreshMs, setRefreshMs] = useState<number>(() => loadRefreshMs());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<PositionSortMode>('pnl_desc');

  const pollInFlightRef = useRef(false);

  useEffect(() => {
    saveToLocal(CONFIG_STORAGE_KEY, wallets);
  }, [wallets]);

  useEffect(() => {
    saveToLocal(CAPTURE_STORAGE_KEY, captureStore);
  }, [captureStore]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(REFRESH_STORAGE_KEY, String(refreshMs));
  }, [refreshMs]);

  useEffect(() => {
    if (wallets.length === 0) {
      setSelectedWalletId(null);
      return;
    }
    if (!selectedWalletId || !wallets.some(wallet => wallet.id === selectedWalletId)) {
      setSelectedWalletId(wallets[0].id);
    }
  }, [wallets, selectedWalletId]);

  const selectedWallet = useMemo(
    () => wallets.find(wallet => wallet.id === selectedWalletId) ?? null,
    [wallets, selectedWalletId]
  );

  const selectedLive = selectedWallet ? (liveByAddress[selectedWallet.address] ?? defaultLiveState()) : defaultLiveState();
  const selectedCapture = selectedWallet ? (captureStore[selectedWallet.address] ?? defaultCaptureStore()) : defaultCaptureStore();

  const runRefresh = async () => {
    const enabledWallets = wallets.filter(wallet => wallet.enabled);
    if (enabledWallets.length === 0) return;
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    setGlobalError(null);

    try {
      for (const wallet of enabledWallets) {
        setLiveByAddress(prev => ({
          ...prev,
          [wallet.address]: {
            ...(prev[wallet.address] ?? defaultLiveState()),
            loading: true,
            error: null,
          },
        }));
      }

      const updates = await Promise.all(
        enabledWallets.map(async wallet => {
          try {
            const [positions, closedPositions, trades, valueRows, activity] = await Promise.all([
              fetchAllUserPositions(wallet.address),
              polymarketApiService.getClosedPositions(wallet.address, { limit: 200, sortBy: 'REALIZEDPNL', sortDirection: 'DESC' }).catch(() => [] as ClosedPosition[]),
              polymarketApiService.getUserTrades(wallet.address, { limit: 300 }).catch(() => [] as UserTradeHistory[]),
              polymarketApiService.getPortfolioValue(wallet.address).catch(() => [] as UserPortfolioValue[]),
              polymarketApiService.getUserActivity(wallet.address, { limit: 300 }).catch(() => [] as UserActivity[]),
            ]);
            const summary = computeSummary(positions, closedPositions, trades, activity);
            const portfolioValue = Number.isFinite(valueRows[0]?.value) ? Number(valueRows[0].value) : null;
            return {
              address: wallet.address,
              state: {
                loading: false,
                error: null,
                lastUpdated: Date.now(),
                positions,
                closedPositions,
                trades,
                activity,
                portfolioValue,
                summary,
              } as WalletLiveState,
              captureEnabled: wallet.captureEnabled,
            };
          } catch {
            return {
              address: wallet.address,
              state: {
                ...(liveByAddress[wallet.address] ?? defaultLiveState()),
                loading: false,
                error: 'Refresh failed',
                lastUpdated: Date.now(),
              } as WalletLiveState,
              captureEnabled: false,
            };
          }
        })
      );

      setLiveByAddress(prev => {
        const next = { ...prev };
        for (const update of updates) next[update.address] = update.state;
        return next;
      });

      setCaptureStore(prev => {
        let next = { ...prev };
        for (const update of updates) {
          if (!update.captureEnabled || update.state.error) continue;
          const current = next[update.address] ?? defaultCaptureStore();
          next = {
            ...next,
            [update.address]: applyCaptureUpdate(
              current,
              update.state.positions,
              update.state.trades,
              update.state.activity,
              update.state.summary,
              update.state.portfolioValue
            ),
          };
        }
        return next;
      });
    } catch {
      setGlobalError('Failed to refresh one or more tracked portfolios');
    } finally {
      pollInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!autoRefresh) return;
    runRefresh();
    const timer = window.setInterval(runRefresh, refreshMs);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refreshMs, wallets]);

  const addWallet = () => {
    const address = newAddress.trim();
    const label = newLabel.trim();
    if (!validateAddress(address)) {
      setAddError('Invalid EVM address');
      return;
    }
    if (wallets.some(wallet => wallet.address.toLowerCase() === address.toLowerCase())) {
      setAddError('Address already tracked');
      return;
    }
    const next: TrackedWalletConfig = {
      id: generateId(),
      address,
      label,
      enabled: true,
      captureEnabled: false,
      createdAt: Date.now(),
    };
    setWallets(prev => [next, ...prev]);
    setSelectedWalletId(next.id);
    setNewAddress('');
    setNewLabel('');
    setAddError(null);
  };

  const removeWallet = (walletId: string) => {
    const wallet = wallets.find(item => item.id === walletId);
    setWallets(prev => prev.filter(item => item.id !== walletId));
    if (wallet) {
      setLiveByAddress(prev => {
        const next = { ...prev };
        delete next[wallet.address];
        return next;
      });
    }
  };

  const toggleWalletField = (walletId: string, field: 'enabled' | 'captureEnabled') => {
    setWallets(prev => prev.map(wallet => (
      wallet.id === walletId ? { ...wallet, [field]: !wallet[field] } : wallet
    )));
  };

  const updateRefreshMs = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(1000, Math.min(120000, Math.round(parsed)));
    setRefreshMs(clamped);
  };

  const trackedAggregates = useMemo(() => {
    const enabled = wallets.filter(wallet => wallet.enabled);
    const aggregated = enabled.reduce(
      (acc, wallet) => {
        const live = liveByAddress[wallet.address];
        if (!live) return acc;
        acc.openPositions += live.summary.openPositions;
        acc.closedPositions += live.summary.closedPositions;
        acc.cashPnl += live.summary.cashPnl;
        acc.realizedPnl += live.summary.realizedPnl;
        acc.grossExposure += live.summary.grossExposure;
        acc.volume24h += live.summary.volume24h;
        acc.tradeCount24h += live.summary.tradeCount24h;
        if (Number.isFinite(live.portfolioValue ?? NaN)) {
          acc.portfolioValue += Number(live.portfolioValue);
        }
        return acc;
      },
      {
        trackedWallets: enabled.length,
        openPositions: 0,
        closedPositions: 0,
        cashPnl: 0,
        realizedPnl: 0,
        grossExposure: 0,
        volume24h: 0,
        tradeCount24h: 0,
        portfolioValue: 0,
      }
    );
    return aggregated;
  }, [wallets, liveByAddress]);

  const selectedCategories = useMemo(() => {
    const categoryMap = new Map<string, { positions: number; notional: number; pnl: number }>();
    for (const position of selectedLive.positions.filter(item => (item.size ?? 0) > 0)) {
      const text = normalizedText(position.title, position.slug, position.eventSlug);
      const categories = detectCategories(text);
      const value = Math.abs(position.currentValue ?? 0);
      const pnl = position.cashPnl ?? 0;
      for (const category of categories) {
        const current = categoryMap.get(category) ?? { positions: 0, notional: 0, pnl: 0 };
        categoryMap.set(category, {
          positions: current.positions + 1,
          notional: current.notional + value,
          pnl: current.pnl + pnl,
        });
      }
    }
    return Array.from(categoryMap.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.notional - a.notional);
  }, [selectedLive.positions]);

  const positionTakenAtByKey = useMemo(() => {
    const map = new Map<string, number>();

    const assignEarliest = (keys: string[], timestampMs: number | null) => {
      if (!timestampMs || !Number.isFinite(timestampMs)) return;
      for (const key of keys) {
        const previous = map.get(key);
        if (previous == null || timestampMs < previous) {
          map.set(key, timestampMs);
        }
      }
    };

    for (const position of selectedLive.positions) {
      assignEarliest(buildPositionLookupKeys(position), extractPositionTimestampMs(position));
    }

    for (const trade of selectedLive.trades) {
      if (String(trade.side ?? '').toUpperCase() !== 'BUY') continue;
      const timestampMs = toMs(Number(trade.timestamp ?? 0));
      assignEarliest(buildTradeLookupKeys(trade), Number.isFinite(timestampMs) && timestampMs > 0 ? timestampMs : null);
    }

    for (const activity of selectedLive.activity) {
      if (String(activity.type ?? '').toUpperCase() !== 'BUY') continue;
      const timestampMs = toMs(Number(activity.timestamp ?? 0));
      assignEarliest(buildActivityLookupKeys(activity), Number.isFinite(timestampMs) && timestampMs > 0 ? timestampMs : null);
    }

    return map;
  }, [selectedLive.positions, selectedLive.trades, selectedLive.activity]);

  const filteredPositions = useMemo(() => {
    const rows = selectedLive.positions
      .filter(position => (position.size ?? 0) > 0)
      .map(position => {
        const keys = buildPositionLookupKeys(position);
        const byRaw = extractPositionTimestampMs(position);
        const byLookup = keys.map(key => positionTakenAtByKey.get(key)).find((value): value is number => value != null) ?? null;
        return {
          position,
          takenAt: byRaw ?? byLookup,
        };
      })
      .filter(row => {
        const text = normalizedText(row.position.title, row.position.slug, row.position.eventSlug, row.position.outcome);
        if (!matchesQuickFilter(text, quickFilter)) return false;
        if (categoryFilter !== 'all') {
          const categories = detectCategories(text);
          if (!categories.includes(categoryFilter)) return false;
        }
        if (searchQuery.trim().length > 0 && !text.includes(searchQuery.trim().toLowerCase())) return false;
        return true;
      });

    rows.sort((a, b) => {
      if (sortMode === 'taken_date_desc') return (b.takenAt ?? 0) - (a.takenAt ?? 0);
      if (sortMode === 'taken_date_asc') {
        const aTs = a.takenAt ?? Number.MAX_SAFE_INTEGER;
        const bTs = b.takenAt ?? Number.MAX_SAFE_INTEGER;
        return aTs - bTs;
      }
      if (sortMode === 'pnl_desc') return (b.position.cashPnl ?? 0) - (a.position.cashPnl ?? 0);
      if (sortMode === 'value_desc') return (b.position.currentValue ?? 0) - (a.position.currentValue ?? 0);
      if (sortMode === 'size_desc') return (b.position.size ?? 0) - (a.position.size ?? 0);
      if (sortMode === 'market_az') return String(a.position.title ?? '').localeCompare(String(b.position.title ?? ''));
      const aCategory = detectCategories(normalizedText(a.position.title, a.position.slug, a.position.eventSlug))[0] ?? 'Other';
      const bCategory = detectCategories(normalizedText(b.position.title, b.position.slug, b.position.eventSlug))[0] ?? 'Other';
      return aCategory.localeCompare(bCategory);
    });
    return rows;
  }, [selectedLive.positions, quickFilter, categoryFilter, searchQuery, sortMode, positionTakenAtByKey]);

  const reverseEngineering = useMemo(() => {
    const summary = selectedLive.summary;
    const totalDirectional = summary.yesExposure + summary.noExposure;
    const yesBias = totalDirectional > 0 ? summary.yesExposure / totalDirectional : 0;
    const snapshots = selectedCapture.snapshots;
    const snapshotIntervals: number[] = [];
    for (let i = 1; i < snapshots.length; i += 1) {
      snapshotIntervals.push(Math.max(0, snapshots[i].ts - snapshots[i - 1].ts));
    }
    const avgSnapshotIntervalSec = snapshotIntervals.length > 0
      ? snapshotIntervals.reduce((sum, value) => sum + value, 0) / snapshotIntervals.length / 1000
      : null;

    const marketFrequency = new Map<string, number>();
    for (const tradeEvent of selectedCapture.tradeEvents) {
      const key = tradeEvent.title || 'Unknown';
      marketFrequency.set(key, (marketFrequency.get(key) ?? 0) + 1);
    }
    const frequentMarkets = Array.from(marketFrequency.entries())
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const timeframeCounts = {
      m5: 0,
      m15: 0,
      h1: 0,
      day1: 0,
      other: 0,
    };
    for (const position of selectedLive.positions) {
      const text = normalizedText(position.title, position.slug);
      if (/\b5m\b|5[- ]?min/.test(text)) timeframeCounts.m5 += 1;
      else if (/\b15m\b|15[- ]?min/.test(text)) timeframeCounts.m15 += 1;
      else if (/\b1h\b|hourly|60[- ]?min/.test(text)) timeframeCounts.h1 += 1;
      else if (/\b1d\b|daily|24[- ]?h/.test(text)) timeframeCounts.day1 += 1;
      else timeframeCounts.other += 1;
    }

    return {
      yesBias,
      avgSnapshotIntervalSec,
      frequentMarkets,
      timeframeCounts,
      concentration: summary.concentrationTop5,
    };
  }, [selectedLive, selectedCapture]);

  const snapshotChartData = useMemo(() => {
    return selectedCapture.snapshots.slice(-240).map(snapshot => ({
      ts: snapshot.ts,
      label: new Date(snapshot.ts).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
      pnl: snapshot.cashPnl,
      exposure: snapshot.grossExposure,
      count: snapshot.positionCount,
    }));
  }, [selectedCapture.snapshots]);

  const exportCapture = () => {
    if (!selectedWallet) return;
    const payload = {
      wallet: selectedWallet,
      capturedAt: new Date().toISOString(),
      live: selectedLive,
      capture: selectedCapture,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `portfolio-tracker-${selectedWallet.address}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearCaptureForSelected = () => {
    if (!selectedWallet) return;
    setCaptureStore(prev => ({
      ...prev,
      [selectedWallet.address]: defaultCaptureStore(),
    }));
  };

  const quickFilterLabel = (filter: QuickFilter): string => {
    if (filter === 'all') return 'All Markets';
    if (filter === 'btc_updown_5m') return 'BTC Up/Down 5m';
    if (filter === 'btc_updown_15m') return 'BTC Up/Down 15m';
    if (filter === 'btc_updown_1h') return 'BTC Up/Down 1h';
    if (filter === 'iran') return 'Iran';
    return 'Geopolitics';
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: `2px solid ${C.orange}`, backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={14} style={{ color: C.orange }} />
          <span style={{ fontSize: 11, fontWeight: 'bold', color: C.orange, fontFamily: C.font }}>PORTFOLIO TRACKER</span>
          <span style={{ fontSize: 9, color: C.faint, fontFamily: C.font }}>
            MULTI-ADDRESS / REAL-TIME / REVERSE ENGINEERING
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: C.muted, fontFamily: C.font }}>
            <span>AUTO</span>
            <input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: C.muted, fontFamily: C.font }}>
            <span>REFRESH MS</span>
            <input
              type="number"
              value={refreshMs}
              min={1000}
              max={120000}
              step={500}
              onChange={event => updateRefreshMs(event.target.value)}
              style={{
                width: 90,
                backgroundColor: C.bg,
                border: `1px solid ${C.border}`,
                color: C.white,
                fontSize: 9,
                padding: '3px 6px',
                fontFamily: C.font,
              }}
            />
          </label>
          <button
            onClick={runRefresh}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              border: `1px solid ${C.border}`,
              backgroundColor: C.header,
              color: C.muted,
              fontSize: 9,
              fontFamily: C.font,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={10} />
            REFRESH NOW
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 1, backgroundColor: C.border }}>
        {statCell('TRACKED', String(trackedAggregates.trackedWallets))}
        {statCell('OPEN POS', String(trackedAggregates.openPositions))}
        {statCell('CLOSED POS', String(trackedAggregates.closedPositions))}
        {statCell('EXPOSURE', trackedAggregates.grossExposure > 0 ? fmtVol(trackedAggregates.grossExposure) : '—')}
        {statCell('PORTFOLIO VALUE', trackedAggregates.portfolioValue > 0 ? fmtVol(trackedAggregates.portfolioValue) : '—', C.orange)}
        {statCell('CASH P&L', trackedAggregates.cashPnl !== 0 ? `${trackedAggregates.cashPnl >= 0 ? '+' : ''}${fmtVol(trackedAggregates.cashPnl)}` : '—', trackedAggregates.cashPnl >= 0 ? C.green : C.red)}
        {statCell('REALIZED P&L', trackedAggregates.realizedPnl !== 0 ? `${trackedAggregates.realizedPnl >= 0 ? '+' : ''}${fmtVol(trackedAggregates.realizedPnl)}` : '—', trackedAggregates.realizedPnl >= 0 ? C.green : C.red)}
        {statCell('VOL 24H', trackedAggregates.volume24h > 0 ? fmtVol(trackedAggregates.volume24h) : '—')}
      </div>

      {globalError && (
        <div style={{ margin: 10, padding: 8, border: `1px solid ${C.red}`, backgroundColor: '#2A0000', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={12} style={{ color: C.red }} />
          <span style={{ fontSize: 9, color: '#FF9696', fontFamily: C.font }}>{globalError}</span>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 380, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {sectionHeader('TRACKED WALLETS')}
          <div style={{ padding: 10, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
              <input
                type="text"
                placeholder="0x wallet address..."
                value={newAddress}
                onChange={event => setNewAddress(event.target.value)}
                style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, color: C.white, fontSize: 10, padding: '6px 8px', fontFamily: C.font }}
              />
              <input
                type="text"
                placeholder="Label (optional)"
                value={newLabel}
                onChange={event => setNewLabel(event.target.value)}
                style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, color: C.white, fontSize: 10, padding: '6px 8px', fontFamily: C.font }}
              />
              <button
                onClick={addWallet}
                style={{ backgroundColor: C.orange, color: '#000', border: 'none', fontSize: 10, fontWeight: 'bold', fontFamily: C.font, padding: '6px 8px', cursor: 'pointer' }}
              >
                <Plus size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                ADD WALLET
              </button>
              {addError && <div style={{ fontSize: 9, color: C.red, fontFamily: C.font }}>{addError}</div>}
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {wallets.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: C.muted, fontFamily: C.font }}>
                <Wallet size={24} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                <div style={{ fontSize: 10 }}>NO TRACKED WALLETS</div>
              </div>
            ) : (
              wallets.map(wallet => {
                const selected = wallet.id === selectedWalletId;
                const live = liveByAddress[wallet.address] ?? defaultLiveState();
                return (
                  <div
                    key={wallet.id}
                    onClick={() => setSelectedWalletId(wallet.id)}
                    style={{
                      borderBottom: `1px solid ${C.borderFaint}`,
                      borderLeft: selected ? `2px solid ${C.orange}` : '2px solid transparent',
                      backgroundColor: selected ? '#1A1200' : 'transparent',
                      padding: '8px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: C.orange, fontWeight: 'bold', fontFamily: C.font }}>
                        {wallet.label.trim() || shortAddress(wallet.address)}
                      </span>
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          removeWallet(wallet.id);
                        }}
                        style={{ border: `1px solid ${C.border}`, backgroundColor: 'transparent', color: C.muted, cursor: 'pointer', padding: '1px 4px' }}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                    <div style={{ fontSize: 8, color: C.faint, fontFamily: C.font, marginBottom: 6 }}>{wallet.address}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: wallet.enabled ? C.green : C.muted, fontFamily: C.font }}>
                        <input
                          type="checkbox"
                          checked={wallet.enabled}
                          onChange={event => {
                            event.stopPropagation();
                            toggleWalletField(wallet.id, 'enabled');
                          }}
                        />
                        TRACK
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: wallet.captureEnabled ? C.orange : C.muted, fontFamily: C.font }}>
                        <input
                          type="checkbox"
                          checked={wallet.captureEnabled}
                          onChange={event => {
                            event.stopPropagation();
                            toggleWalletField(wallet.id, 'captureEnabled');
                          }}
                        />
                        CAPTURE
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 8, color: C.faint, fontFamily: C.font }}>OPEN</div>
                        <div style={{ fontSize: 10, color: C.white, fontWeight: 'bold', fontFamily: C.font }}>{live.summary.openPositions}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 8, color: C.faint, fontFamily: C.font }}>VALUE</div>
                        <div style={{ fontSize: 10, color: C.white, fontWeight: 'bold', fontFamily: C.font }}>{live.portfolioValue != null ? fmtVol(live.portfolioValue) : '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 8, color: C.faint, fontFamily: C.font }}>P&L</div>
                        <div style={{ fontSize: 10, color: live.summary.cashPnl >= 0 ? C.green : C.red, fontWeight: 'bold', fontFamily: C.font }}>
                          {live.summary.cashPnl !== 0 ? `${live.summary.cashPnl >= 0 ? '+' : ''}${fmtVol(live.summary.cashPnl)}` : '—'}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 8, color: C.faint, fontFamily: C.font, marginTop: 6 }}>
                      {live.loading
                        ? 'Refreshing...'
                        : live.lastUpdated
                          ? `Updated ${new Date(live.lastUpdated).toLocaleTimeString()}`
                          : 'Not refreshed yet'}
                    </div>
                    {live.error && <div style={{ fontSize: 8, color: C.red, fontFamily: C.font, marginTop: 2 }}>{live.error}</div>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedWallet ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
              <Wallet size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div style={{ fontSize: 10, fontFamily: C.font }}>SELECT A WALLET TO ANALYZE</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, backgroundColor: C.bg }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.orange, fontWeight: 'bold', fontFamily: C.font }}>
                      {selectedWallet.label.trim() || shortAddress(selectedWallet.address)}
                    </div>
                    <div style={{ fontSize: 9, color: C.faint, fontFamily: C.font }}>{selectedWallet.address}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => navigator.clipboard.writeText(selectedWallet.address)}
                      style={{ border: `1px solid ${C.border}`, backgroundColor: C.header, color: C.muted, cursor: 'pointer', padding: '3px 8px', fontSize: 9, fontFamily: C.font }}
                    >
                      <Copy size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      COPY
                    </button>
                    <button
                      onClick={exportCapture}
                      style={{ border: `1px solid ${C.border}`, backgroundColor: C.header, color: C.muted, cursor: 'pointer', padding: '3px 8px', fontSize: 9, fontFamily: C.font }}
                    >
                      <Download size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      EXPORT
                    </button>
                    <button
                      onClick={clearCaptureForSelected}
                      style={{ border: `1px solid ${C.border}`, backgroundColor: C.header, color: C.red, cursor: 'pointer', padding: '3px 8px', fontSize: 9, fontFamily: C.font }}
                    >
                      <Trash2 size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      CLEAR CAPTURE
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 1, backgroundColor: C.border }}>
                  {statCell('OPEN POS', String(selectedLive.summary.openPositions))}
                  {statCell('EXPOSURE', selectedLive.summary.grossExposure > 0 ? fmtVol(selectedLive.summary.grossExposure) : '—')}
                  {statCell('YES/NO', `${selectedLive.summary.yesExposure > 0 ? `${((selectedLive.summary.yesExposure / Math.max(selectedLive.summary.grossExposure, 1e-9)) * 100).toFixed(1)}%` : '0%'} / ${selectedLive.summary.noExposure > 0 ? `${((selectedLive.summary.noExposure / Math.max(selectedLive.summary.grossExposure, 1e-9)) * 100).toFixed(1)}%` : '0%'}`)}
                  {statCell('CASH P&L', selectedLive.summary.cashPnl !== 0 ? `${selectedLive.summary.cashPnl >= 0 ? '+' : ''}${fmtVol(selectedLive.summary.cashPnl)}` : '—', selectedLive.summary.cashPnl >= 0 ? C.green : C.red)}
                  {statCell('REALIZED', selectedLive.summary.realizedPnl !== 0 ? `${selectedLive.summary.realizedPnl >= 0 ? '+' : ''}${fmtVol(selectedLive.summary.realizedPnl)}` : '—', selectedLive.summary.realizedPnl >= 0 ? C.green : C.red)}
                  {statCell('WIN RATE', selectedLive.summary.winRateClosed != null ? `${(selectedLive.summary.winRateClosed * 100).toFixed(1)}%` : '—')}
                  {statCell('VOL 24H', selectedLive.summary.volume24h > 0 ? fmtVol(selectedLive.summary.volume24h) : '—')}
                  {statCell('TOP5 CONC', `${(selectedLive.summary.concentrationTop5 * 100).toFixed(1)}%`, selectedLive.summary.concentrationTop5 > 0.7 ? C.red : C.muted)}
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'auto' }}>
                <div style={{ borderBottom: `1px solid ${C.border}` }}>
                  {sectionHeader('MARKET FILTERS / CATEGORIES')}
                  <div style={{ padding: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.border}`, backgroundColor: C.bg, padding: '4px 8px' }}>
                        <Search size={11} style={{ color: C.muted, marginRight: 6 }} />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={event => setSearchQuery(event.target.value)}
                          placeholder="Search markets (e.g. iran, btc up/down 5m)..."
                          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.white, fontSize: 10, fontFamily: C.font }}
                        />
                      </div>
                      <select
                        value={quickFilter}
                        onChange={event => setQuickFilter(event.target.value as QuickFilter)}
                        style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, color: C.white, fontSize: 9, padding: '4px 6px', fontFamily: C.font }}
                      >
                        <option value="all">ALL</option>
                        <option value="btc_updown_5m">BTC U/D 5m</option>
                        <option value="btc_updown_15m">BTC U/D 15m</option>
                        <option value="btc_updown_1h">BTC U/D 1h</option>
                        <option value="iran">IRAN</option>
                        <option value="geopolitics">GEOPOLITICS</option>
                      </select>
                      <select
                        value={categoryFilter}
                        onChange={event => setCategoryFilter(event.target.value)}
                        style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, color: C.white, fontSize: 9, padding: '4px 6px', fontFamily: C.font }}
                      >
                        <option value="all">ALL CATEGORIES</option>
                        {selectedCategories.map(category => (
                          <option key={category.name} value={category.name}>{category.name.toUpperCase()}</option>
                        ))}
                      </select>
                      <select
                        value={sortMode}
                        onChange={event => setSortMode(event.target.value as PositionSortMode)}
                        style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, color: C.white, fontSize: 9, padding: '4px 6px', fontFamily: C.font }}
                      >
                        <option value="taken_date_desc">SORT DATE ↓</option>
                        <option value="taken_date_asc">SORT DATE ↑</option>
                        <option value="pnl_desc">SORT P&L</option>
                        <option value="value_desc">SORT VALUE</option>
                        <option value="size_desc">SORT SIZE</option>
                        <option value="category">SORT CATEGORY</option>
                        <option value="market_az">SORT A-Z</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(['all', 'btc_updown_5m', 'btc_updown_15m', 'btc_updown_1h', 'iran', 'geopolitics'] as QuickFilter[]).map(filter => (
                        <button
                          key={filter}
                          onClick={() => setQuickFilter(filter)}
                          style={{
                            border: `1px solid ${quickFilter === filter ? C.orange : C.border}`,
                            backgroundColor: quickFilter === filter ? `${C.orange}22` : 'transparent',
                            color: quickFilter === filter ? C.orange : C.muted,
                            fontSize: 8,
                            fontFamily: C.font,
                            padding: '3px 7px',
                            cursor: 'pointer',
                          }}
                        >
                          {quickFilterLabel(filter).toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ borderBottom: `1px solid ${C.border}` }}>
                  {sectionHeader(`POSITIONS (${filteredPositions.length})`)}
                  {filteredPositions.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', color: C.muted, fontFamily: C.font, fontSize: 10 }}>NO POSITIONS MATCH THIS FILTER</div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '2.7fr 1.2fr 1.1fr 0.8fr 0.8fr 0.8fr 0.9fr', gap: 6, padding: '4px 10px', backgroundColor: C.header, borderBottom: `1px solid ${C.border}` }}>
                        {['MARKET', 'OPENED', 'CATEGORY', 'OUTCOME', 'SIZE', 'VALUE', 'P&L'].map((header, index) => (
                          <span key={header} style={{ fontSize: 8, color: C.orange, fontWeight: 'bold', fontFamily: C.font, textAlign: index === 0 ? 'left' : 'right' }}>
                            {header}
                          </span>
                        ))}
                      </div>
                      {filteredPositions.map(({ position, takenAt }, index) => {
                        const text = normalizedText(position.title, position.slug, position.eventSlug);
                        const categories = detectCategories(text);
                        const categoryText = categories.slice(0, 2).join(', ');
                        const pnl = Number(position.cashPnl ?? 0);
                        const value = Number(position.currentValue ?? 0);
                        return (
                          <div key={`${position.conditionId}-${position.outcome}-${position.asset}-${index}`} style={{ display: 'grid', gridTemplateColumns: '2.7fr 1.2fr 1.1fr 0.8fr 0.8fr 0.8fr 0.9fr', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${C.borderFaint}`, alignItems: 'center' }}>
                            <div style={{ overflow: 'hidden' }}>
                              <div style={{ fontSize: 10, color: C.white, fontWeight: 'bold', fontFamily: C.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{position.title}</div>
                              <div style={{ fontSize: 8, color: C.faint, fontFamily: C.font }}>{position.slug || position.eventSlug || position.conditionId}</div>
                            </div>
                            <span style={{ fontSize: 8, color: C.faint, textAlign: 'right', fontFamily: C.font }}>{formatTakenDate(takenAt)}</span>
                            <span style={{ fontSize: 8, color: C.muted, textAlign: 'right', fontFamily: C.font }}>{categoryText.toUpperCase()}</span>
                            <span style={{ fontSize: 9, color: String(position.outcome ?? '').toLowerCase().includes('yes') || String(position.outcome ?? '').toLowerCase().includes('up') ? C.green : C.red, textAlign: 'right', fontWeight: 'bold', fontFamily: C.font }}>
                              {String(position.outcome ?? '').toUpperCase()}
                            </span>
                            <span style={{ fontSize: 10, color: C.white, textAlign: 'right', fontFamily: C.font }}>{Number(position.size ?? 0).toFixed(1)}</span>
                            <span style={{ fontSize: 10, color: C.white, textAlign: 'right', fontFamily: C.font }}>{value > 0 ? fmtVol(value) : '—'}</span>
                            <span style={{ fontSize: 10, color: pnl >= 0 ? C.green : C.red, textAlign: 'right', fontWeight: 'bold', fontFamily: C.font }}>
                              {pnl !== 0 ? `${pnl >= 0 ? '+' : ''}${fmtVol(pnl)}` : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>

                <div style={{ borderBottom: `1px solid ${C.border}` }}>
                  {sectionHeader('REVERSE ENGINEERING INSIGHTS')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, backgroundColor: C.border }}>
                    {statCell('YES BIAS', `${(reverseEngineering.yesBias * 100).toFixed(1)}%`, reverseEngineering.yesBias > 0.6 ? C.green : reverseEngineering.yesBias < 0.4 ? C.red : C.muted)}
                    {statCell('SNAPSHOT CADENCE', reverseEngineering.avgSnapshotIntervalSec != null ? `${reverseEngineering.avgSnapshotIntervalSec.toFixed(1)}s` : '—')}
                    {statCell('CAPTURED SNAPSHOTS', String(selectedCapture.snapshots.length), selectedCapture.snapshots.length > 0 ? C.orange : C.muted)}
                    {statCell('TRADE EVENTS', String(selectedCapture.tradeEvents.length))}
                    {statCell('ACTIVITY EVENTS', String(selectedCapture.activityEvents.length))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 1, backgroundColor: C.border }}>
                    <div style={{ backgroundColor: C.bg, padding: 10 }}>
                      <div style={{ fontSize: 9, color: C.orange, fontWeight: 'bold', fontFamily: C.font, marginBottom: 8 }}>
                        CAPTURED P&L / EXPOSURE CURVE
                      </div>
                      {snapshotChartData.length > 1 ? (
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={snapshotChartData} margin={{ top: 8, right: 12, left: 4, bottom: 6 }}>
                            <CartesianGrid strokeDasharray="2 4" stroke="#1a1a1a" vertical={false} />
                            <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 8, fontFamily: C.font }} tickLine={false} axisLine={{ stroke: '#222' }} interval={Math.max(1, Math.floor(snapshotChartData.length / 8))} />
                            <YAxis yAxisId="left" tick={{ fill: '#666', fontSize: 8, fontFamily: C.font }} tickLine={false} axisLine={false} width={56} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#666', fontSize: 8, fontFamily: C.font }} tickLine={false} axisLine={false} width={56} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#101010', border: `1px solid ${C.border}`, borderRadius: 2, fontFamily: C.font, fontSize: 9 }}
                              formatter={(value: number, name: string) => [fmtVol(value), name]}
                            />
                            <Line yAxisId="left" type="monotone" dataKey="pnl" stroke={C.green} strokeWidth={1.5} dot={false} isAnimationActive={false} name="Cash PnL" />
                            <Line yAxisId="right" type="monotone" dataKey="exposure" stroke={C.cyan} strokeWidth={1.3} dot={false} isAnimationActive={false} name="Exposure" />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: C.font, fontSize: 9 }}>
                          ENABLE CAPTURE AND WAIT FOR SNAPSHOTS
                        </div>
                      )}
                    </div>

                    <div style={{ backgroundColor: C.bg, padding: 10, borderLeft: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 9, color: C.orange, fontWeight: 'bold', fontFamily: C.font, marginBottom: 8 }}>
                        STRATEGY FINGERPRINT
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <div style={{ border: `1px solid ${C.border}`, padding: '6px 8px' }}>
                          <div style={{ fontSize: 8, color: C.faint, fontFamily: C.font }}>TIMEFRAME BIAS</div>
                          <div style={{ fontSize: 9, color: C.white, fontFamily: C.font, marginTop: 4, lineHeight: 1.5 }}>
                            <div>5m: {reverseEngineering.timeframeCounts.m5}</div>
                            <div>15m: {reverseEngineering.timeframeCounts.m15}</div>
                            <div>1h: {reverseEngineering.timeframeCounts.h1}</div>
                            <div>1d: {reverseEngineering.timeframeCounts.day1}</div>
                            <div>Other: {reverseEngineering.timeframeCounts.other}</div>
                          </div>
                        </div>
                        <div style={{ border: `1px solid ${C.border}`, padding: '6px 8px' }}>
                          <div style={{ fontSize: 8, color: C.faint, fontFamily: C.font }}>RISK PROFILE</div>
                          <div style={{ fontSize: 9, color: C.white, fontFamily: C.font, marginTop: 4, lineHeight: 1.5 }}>
                            <div>Top5 concentration: {(reverseEngineering.concentration * 100).toFixed(1)}%</div>
                            <div>
                              Style: {reverseEngineering.concentration > 0.75 ? 'Concentrated' : reverseEngineering.concentration > 0.5 ? 'Balanced' : 'Diversified'}
                            </div>
                            <div>
                              Bias: {reverseEngineering.yesBias > 0.6 ? 'Directional Long' : reverseEngineering.yesBias < 0.4 ? 'Directional Short' : 'Market Neutral'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 8, border: `1px solid ${C.border}` }}>
                        <div style={{ padding: '5px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 8, color: C.faint, fontWeight: 'bold', fontFamily: C.font }}>
                          MOST FREQUENT MARKETS (CAPTURED TRADES)
                        </div>
                        {reverseEngineering.frequentMarkets.length === 0 ? (
                          <div style={{ padding: 8, fontSize: 8, color: C.muted, fontFamily: C.font }}>No captured trades yet</div>
                        ) : reverseEngineering.frequentMarkets.map(market => (
                          <div key={market.title} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 8px', borderBottom: `1px solid ${C.borderFaint}` }}>
                            <span style={{ fontSize: 8, color: C.white, fontFamily: C.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{market.title}</span>
                            <span style={{ fontSize: 8, color: C.orange, fontFamily: C.font, fontWeight: 'bold' }}>{market.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  {sectionHeader('CAPTURE LOG (REAL-TIME POSITION MEMORY)')}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, backgroundColor: C.border }}>
                    <div style={{ backgroundColor: C.bg }}>
                      <div style={{ padding: '5px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 8, color: C.faint, fontWeight: 'bold', fontFamily: C.font }}>
                        LAST SNAPSHOTS
                      </div>
                      {selectedCapture.snapshots.length === 0 ? (
                        <div style={{ padding: 10, fontSize: 8, color: C.muted, fontFamily: C.font }}>Enable capture to build a local replay dataset.</div>
                      ) : selectedCapture.snapshots.slice(-12).reverse().map((snapshot, index) => (
                        <div key={`${snapshot.ts}-${index}`} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr', gap: 6, padding: '5px 8px', borderBottom: `1px solid ${C.borderFaint}`, alignItems: 'center' }}>
                          <span style={{ fontSize: 8, color: C.faint, fontFamily: C.font }}>{new Date(snapshot.ts).toLocaleString()}</span>
                          <span style={{ fontSize: 8, color: C.white, fontFamily: C.font }}>pos {snapshot.positionCount}</span>
                          <span style={{ fontSize: 8, color: C.cyan, fontFamily: C.font }}>{snapshot.grossExposure > 0 ? fmtVol(snapshot.grossExposure) : '—'}</span>
                          <span style={{ fontSize: 8, color: snapshot.cashPnl >= 0 ? C.green : C.red, fontFamily: C.font }}>
                            {snapshot.cashPnl !== 0 ? `${snapshot.cashPnl >= 0 ? '+' : ''}${fmtVol(snapshot.cashPnl)}` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div style={{ backgroundColor: C.bg, borderLeft: `1px solid ${C.border}` }}>
                      <div style={{ padding: '5px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 8, color: C.faint, fontWeight: 'bold', fontFamily: C.font }}>
                        LAST EVENTS
                      </div>
                      {selectedCapture.activityEvents.length === 0 && selectedCapture.tradeEvents.length === 0 ? (
                        <div style={{ padding: 10, fontSize: 8, color: C.muted, fontFamily: C.font }}>No captured activity/trade events yet.</div>
                      ) : (
                        [...selectedCapture.activityEvents.map(event => ({ kind: 'activity' as const, ts: event.ts, label: `${event.type} | ${event.title}`, metric: event.usdcSize })),
                        ...selectedCapture.tradeEvents.map(event => ({ kind: 'trade' as const, ts: event.ts, label: `${event.side} ${event.outcome} | ${event.title}`, metric: event.size * event.price }))]
                          .sort((a, b) => b.ts - a.ts)
                          .slice(0, 20)
                          .map((event, index) => (
                            <div key={`${event.kind}-${event.ts}-${index}`} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px', gap: 6, padding: '5px 8px', borderBottom: `1px solid ${C.borderFaint}`, alignItems: 'center' }}>
                              <span style={{ fontSize: 8, color: C.faint, fontFamily: C.font }}>{new Date(event.ts).toLocaleTimeString()}</span>
                              <span style={{ fontSize: 8, color: C.white, fontFamily: C.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.label}</span>
                              <span style={{ fontSize: 8, color: event.kind === 'trade' ? C.orange : C.cyan, textAlign: 'right', fontFamily: C.font }}>
                                {event.metric > 0 ? fmtVol(event.metric) : '—'}
                              </span>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: '4px 10px', backgroundColor: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 8, fontFamily: C.font, color: C.faint }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock3 size={9} /> Poll: {refreshMs}ms</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Activity size={9} /> Mode: {autoRefresh ? 'Auto' : 'Manual'}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><ShieldCheck size={9} /> Capture: local persistent store</span>
        </div>
        <span style={{ fontSize: 8, color: C.faint, fontFamily: C.font }}>
          Designed for live tracking and strategy reverse engineering
        </span>
      </div>
    </div>
  );
};

export default PortfolioTrackerView;
