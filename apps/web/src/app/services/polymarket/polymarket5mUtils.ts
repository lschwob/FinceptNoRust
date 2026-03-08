import type { PolymarketMarket } from './polymarketApiService';
import type {
  Polymarket5mAsset,
  Polymarket5mMarketRecord,
  Polymarket5mOrderLevel,
  Polymarket5mSnapshot,
} from './polymarket5mTypes';

const ASSET_PATTERNS: Array<{ asset: Polymarket5mAsset; regex: RegExp }> = [
  { asset: 'BTC', regex: /\b(btc|bitcoin)\b/i },
  { asset: 'ETH', regex: /\b(eth|ethereum)\b/i },
  { asset: 'SOL', regex: /\b(sol|solana)\b/i },
  { asset: 'XRP', regex: /\b(xrp|ripple)\b/i },
  { asset: 'DOGE', regex: /\b(doge|dogecoin)\b/i },
  { asset: 'AVAX', regex: /\b(avax|avalanche)\b/i },
];

const UP_DOWN_REGEX = /(up[- /]?or[- /]?down|up\/down|updown)/i;
const FIVE_MIN_REGEX = /\b5m\b|5[- ]?min(?:ute)?s?/i;
const TIMEFRAME_MS = 5 * 60 * 1000;
const NEW_YORK_TZ = 'America/New_York';
const QUESTION_ET_WINDOW_REGEX = /-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)\s*ET/i;
const MONTH_INDEX_BY_NAME: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

interface Polymarket5mQuestionEtWindow {
  month: number;
  day: number;
  startMinuteOfDay: number;
  endMinuteOfDay: number;
}

interface Polymarket5mEtNowState {
  year: number;
  month: number;
  day: number;
  minuteOfDay: number;
}

export const normalizeUnitPrice = (value: number | null | undefined): number | null => {
  if (value == null || !Number.isFinite(value)) return null;
  let normalized = value;
  if (normalized > 1 && normalized <= 100) normalized /= 100;
  if (normalized < 0 || normalized > 1.25) return null;
  return Math.max(0, Math.min(1, normalized));
};

export const toNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseDateTs = (value: unknown): number | null => {
  if (!value) return null;
  const ts = new Date(String(value)).getTime();
  return Number.isFinite(ts) && ts > 0 ? ts : null;
};

const getPartsFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const existing = PARTS_FORMATTERS.get(timeZone);
  if (existing) return existing;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  PARTS_FORMATTERS.set(timeZone, formatter);
  return formatter;
};

const minuteDistance = (left: number, right: number): number => {
  const direct = Math.abs(left - right);
  return Math.min(direct, 24 * 60 - direct);
};

const isMinuteOfDayInWindow = (minuteOfDay: number, startMinuteOfDay: number, endMinuteOfDay: number): boolean => (
  minuteOfDay >= startMinuteOfDay && minuteOfDay < endMinuteOfDay
);

const parseClockMinuteOfDay = (value: string): number | null => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return null;
  const hour12 = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();
  if (!Number.isFinite(hour12) || !Number.isFinite(minute) || hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) {
    return null;
  }

  const hour24 = (hour12 % 12) + (meridiem === 'PM' ? 12 : 0);
  return hour24 * 60 + minute;
};

export const extractPolymarket5mSlugStartTs = (
  market: Pick<PolymarketMarket, 'slug'> | Pick<Polymarket5mMarketRecord, 'slug'>
): number | null => {
  const match = String(market.slug ?? '').match(/-(\d{10})$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value * 1000 : null;
};

export const parsePolymarket5mQuestionEtWindow = (question: string | null | undefined): Polymarket5mQuestionEtWindow | null => {
  const match = String(question ?? '').match(QUESTION_ET_WINDOW_REGEX);
  if (!match) return null;

  const month = MONTH_INDEX_BY_NAME[match[1].trim().toLowerCase()];
  const day = parseInt(match[2], 10);
  const startMinuteOfDay = parseClockMinuteOfDay(match[3]);
  const endMinuteOfDay = parseClockMinuteOfDay(match[4]);
  if (!month || !Number.isFinite(day) || startMinuteOfDay == null || endMinuteOfDay == null) return null;

  return {
    month,
    day,
    startMinuteOfDay,
    endMinuteOfDay,
  };
};

export const getPolymarket5mEtNowState = (now = new Date(), timeZone = NEW_YORK_TZ): Polymarket5mEtNowState => {
  const parts = getPartsFormatter(timeZone).formatToParts(now);
  const getPart = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find(part => part.type === type)?.value ?? '';
    const value = parseInt(raw, 10);
    return Number.isFinite(value) ? value : 0;
  };

  const hour = getPart('hour');
  const minute = getPart('minute');
  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    minuteOfDay: hour * 60 + minute,
  };
};

export const isPolymarket5mEtWindowCurrent = (
  market: Pick<Polymarket5mMarketRecord, 'question'>,
  now = new Date(),
  timeZone = NEW_YORK_TZ
): boolean => {
  const etWindow = parsePolymarket5mQuestionEtWindow(market.question);
  if (!etWindow) return false;
  const etNow = getPolymarket5mEtNowState(now, timeZone);
  if (etWindow.month !== etNow.month || etWindow.day !== etNow.day) return false;
  return isMinuteOfDayInWindow(etNow.minuteOfDay, etWindow.startMinuteOfDay, etWindow.endMinuteOfDay);
};

export const isPolymarket5mQuestionTimeCurrent = (
  market: Pick<Polymarket5mMarketRecord, 'question'>,
  now = new Date(),
  timeZone = NEW_YORK_TZ
): boolean => {
  const etWindow = parsePolymarket5mQuestionEtWindow(market.question);
  if (!etWindow) return false;
  const etNow = getPolymarket5mEtNowState(now, timeZone);
  return isMinuteOfDayInWindow(etNow.minuteOfDay, etWindow.startMinuteOfDay, etWindow.endMinuteOfDay);
};

export const getPolymarket5mClosestCurrentMinuteDistance = (
  market: Pick<Polymarket5mMarketRecord, 'question'>,
  now = new Date()
): number => {
  const etWindow = parsePolymarket5mQuestionEtWindow(market.question);
  if (!etWindow) return Number.MAX_SAFE_INTEGER;

  const nyNow = getPolymarket5mEtNowState(now, NEW_YORK_TZ);
  return minuteDistance(etWindow.startMinuteOfDay, nyNow.minuteOfDay);
};

export const parseTokenIds = (market: PolymarketMarket): string[] => {
  try {
    const raw = market.clobTokenIds as unknown;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => String(item ?? '').trim())
      .filter((tokenId, index, arr) => tokenId.length > 0 && arr.indexOf(tokenId) === index);
  } catch {
    return [];
  }
};

export const detectPolymarket5mAsset = (market: PolymarketMarket): Polymarket5mAsset | null => {
  const source = `${market.slug ?? ''} ${market.question ?? ''} ${market.resolutionSource ?? ''}`;
  for (const { asset, regex } of ASSET_PATTERNS) {
    if (regex.test(source)) return asset;
  }
  return null;
};

export const isPolymarket5mCandidate = (market: PolymarketMarket): boolean => {
  const source = `${market.slug ?? ''} ${market.question ?? ''}`.toLowerCase();
  return UP_DOWN_REGEX.test(source) && FIVE_MIN_REGEX.test(source);
};

export const computePolymarket5mWindow = (market: PolymarketMarket): { startTs: number; endTs: number } | null => {
  const endTs = parseDateTs(market.endDate);
  if (endTs == null) return null;
  const fallbackStart = endTs - TIMEFRAME_MS;
  const startDateTs = parseDateTs(market.startDate);
  const startTs = startDateTs != null ? Math.max(startDateTs, fallbackStart) : fallbackStart;
  return { startTs, endTs };
};

export const isPolymarket5mLive = (market: PolymarketMarket): boolean => {
  if (market.closed || market.archived) return false;
  const window = computePolymarket5mWindow(market);
  if (!window) return false;
  const marketStatus = String((market as { status?: string }).status ?? '').trim().toLowerCase();
  const eventStatus = String((market as { events?: Array<{ status?: string }> }).events?.[0]?.status ?? '').trim().toLowerCase();
  const hasExplicitOpenStatus = marketStatus.length > 0 || eventStatus.length > 0;
  const openStatus = hasExplicitOpenStatus
    ? (marketStatus === 'open' || eventStatus === 'open')
    : (market.active && !market.closed && !market.archived);
  if (!openStatus) return false;

  const acceptingOrders = market.acceptingOrders === true || (market.acceptingOrders == null && market.enableOrderBook !== false);
  if (!acceptingOrders) return false;

  const now = Date.now();
  return now < window.endTs;
};

export const extractPriceToBeat = (market: PolymarketMarket): number | null => {
  const marketExtras = market as unknown as Record<string, unknown>;
  const directFields = [
    marketExtras.priceToBeat,
    marketExtras.price_to_beat,
    marketExtras.startPrice,
    marketExtras.start_price,
    marketExtras.referencePrice,
    marketExtras.reference_price,
    marketExtras.strikePrice,
    marketExtras.strike_price,
    marketExtras.threshold,
  ];
  for (const candidate of directFields) {
    const value = toNumber(candidate);
    if (value > 0) return value;
  }

  const texts: string[] = [
    market.question ?? '',
    market.description ?? '',
    market.groupItemTitle ?? '',
    market.resolutionSource ?? '',
    ...((market.events ?? []).flatMap(event => [event.title ?? '', String((event as { description?: string }).description ?? '')])),
  ];

  const patterns = [
    /(?:price(?:\s+to\s+beat)?|reference\s*price|opening\s*price|start(?:ing)?\s*price|strike)\s*(?:is|=|:)?\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)/i,
    /(?:above|over|greater than|higher than|below|under|less than|lower than|at or above|at or below)\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)/i,
  ];

  for (const text of texts) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match) continue;
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value > 0) return value;
    }
  }

  return null;
};

export const buildPolymarket5mMarketRecord = (market: PolymarketMarket): Polymarket5mMarketRecord | null => {
  if (!isPolymarket5mCandidate(market)) return null;
  const asset = detectPolymarket5mAsset(market);
  const window = computePolymarket5mWindow(market);
  const [yesTokenId, noTokenId] = parseTokenIds(market);
  if (!asset || !window || !yesTokenId) return null;

  return {
    marketId: market.id,
    slug: market.slug,
    question: market.question ?? market.slug ?? market.id,
    asset,
    timeframe: '5m',
    startTs: window.startTs,
    endTs: window.endTs,
    yesTokenId,
    noTokenId,
    conditionId: market.conditionId,
    priceToBeat: extractPriceToBeat(market),
    active: isPolymarket5mLive(market),
    closed: Boolean(market.closed),
    archived: Boolean(market.archived),
    acceptingOrders: market.acceptingOrders === true || (market.acceptingOrders == null && market.enableOrderBook !== false),
    resolutionSource: market.resolutionSource,
    rawMarket: market,
  };
};

export const logicalMarketSlot = (market: Pick<Polymarket5mMarketRecord, 'asset' | 'timeframe' | 'endTs'>): string =>
  `${market.asset}:${market.timeframe}:${market.endTs}`;

export const normalizeOrderLevels = (levels: Array<{ price: string; size: string }> | undefined): Polymarket5mOrderLevel[] =>
  Array.isArray(levels)
    ? levels.map(level => ({
        price: toNumber(level.price),
        size: toNumber(level.size),
      })).filter(level => level.price > 0 && level.size > 0)
    : [];

export const computeMidFromQuotes = (bid: number | null, ask: number | null, last: number | null): number | null => {
  if (bid != null && ask != null && bid > 0 && ask > 0) {
    return normalizeUnitPrice((bid + ask) / 2);
  }
  return normalizeUnitPrice(last);
};

export const computeSpread = (yesBid: number | null, yesAsk: number | null, noBid: number | null, noAsk: number | null): number | null => {
  const spreads = [
    yesBid != null && yesAsk != null ? Math.max(0, yesAsk - yesBid) : null,
    noBid != null && noAsk != null ? Math.max(0, noAsk - noBid) : null,
  ].filter((value): value is number => value != null && Number.isFinite(value));
  if (spreads.length === 0) return null;
  return spreads.reduce((sum, value) => sum + value, 0) / spreads.length;
};

export const snapshotToDbRow = (snapshot: Polymarket5mSnapshot) => ({
  market_id: snapshot.marketId,
  asset: snapshot.asset,
  captured_at: snapshot.capturedAt,
  yes_bid: snapshot.yesBid,
  yes_ask: snapshot.yesAsk,
  yes_mid: snapshot.yesMid,
  yes_last: snapshot.yesLast,
  no_bid: snapshot.noBid,
  no_ask: snapshot.noAsk,
  no_mid: snapshot.noMid,
  no_last: snapshot.noLast,
  spread: snapshot.spread,
  volume: snapshot.volume,
  liquidity: snapshot.liquidity,
  price_to_beat: snapshot.priceToBeat,
  chainlink_price: snapshot.chainlinkPrice,
});

export const marketToDbRow = (market: Polymarket5mMarketRecord) => ({
  market_id: market.marketId,
  slug: market.slug ?? null,
  question: market.question,
  asset: market.asset,
  timeframe: market.timeframe,
  start_ts: market.startTs,
  end_ts: market.endTs,
  yes_token_id: market.yesTokenId,
  no_token_id: market.noTokenId ?? null,
  condition_id: market.conditionId ?? null,
  price_to_beat: market.priceToBeat ?? null,
  active: market.active,
  closed: market.closed,
  archived: market.archived,
  accepting_orders: market.acceptingOrders,
  resolution_source: market.resolutionSource ?? null,
  raw_json: JSON.stringify(market.rawMarket),
  created_at: market.createdAt ?? null,
  updated_at: market.updatedAt ?? new Date().toISOString(),
});
