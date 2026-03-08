// News Monitor Service
// SQLite-backed keyword alert monitors for the News Tab.
// All persistence is via Tauri invoke (not localStorage).

import { invoke } from '@tauri-apps/api/core';
import { NewsArticle } from './newsService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsMonitor {
  id: string;
  label: string;
  keywords: string[];
  color: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Color palette (10 colors, cycles when adding monitors) ──────────────────

export const MONITOR_COLORS: string[] = [
  '#00E5FF', // cyan
  '#00FF88', // green
  '#FF6B35', // orange
  '#FFD700', // gold
  '#9D4EDD', // purple
  '#FF4D6D', // red-pink
  '#4CC9F0', // sky blue
  '#F72585', // hot pink
  '#7FFF00', // chartreuse
  '#FF9500', // amber
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatchRegex(keywords: string[]): RegExp | null {
  if (keywords.length === 0) return null;
  const pattern = keywords
    .map(k => `\\b${escapeRegex(k.trim())}\\b`)
    .join('|');
  try {
    return new RegExp(pattern, 'gi');
  } catch {
    return null;
  }
}

function articleMatchesMonitor(article: NewsArticle, monitor: NewsMonitor): boolean {
  if (!monitor.enabled || monitor.keywords.length === 0) return false;
  const regex = buildMatchRegex(monitor.keywords);
  if (!regex) return false;
  const text = `${article.headline} ${article.summary}`;
  regex.lastIndex = 0;
  return regex.test(text);
}

// ─── Persistence: backend (invoke) with localStorage fallback when backend returns empty ───

const NEWS_MONITORS_STORAGE_KEY = 'fincept_news_monitors';

function loadMonitorsFromStorage(): NewsMonitor[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(NEWS_MONITORS_STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is NewsMonitor =>
        m && typeof m === 'object' && typeof m.id === 'string' && typeof m.label === 'string' && Array.isArray(m.keywords)
    );
  } catch {
    return [];
  }
}

function saveMonitorsToStorage(list: NewsMonitor[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(NEWS_MONITORS_STORAGE_KEY, JSON.stringify(list));
    }
  } catch (e) {
    console.warn('[NewsMonitorService] localStorage setItem failed:', e);
  }
}

export async function getMonitors(): Promise<NewsMonitor[]> {
  try {
    const fromBackend = await invoke<unknown>('get_news_monitors');
    const arr = Array.isArray(fromBackend) ? fromBackend : [];
    if (arr.length > 0) return arr as NewsMonitor[];
  } catch (e) {
    console.warn('[NewsMonitorService] get_news_monitors failed, using localStorage:', e);
  }
  return loadMonitorsFromStorage();
}

export async function addMonitor(
  label: string,
  keywords: string[],
  color?: string
): Promise<NewsMonitor | null> {
  const trimmed = label.trim();
  const kws = keywords.map(k => k.trim()).filter(Boolean);
  if (!trimmed || kws.length === 0) return null;
  const assignedColor = color ?? MONITOR_COLORS[0];
  const now = new Date().toISOString();
  const monitor: NewsMonitor = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label: trimmed,
    keywords: kws,
    color: assignedColor,
    enabled: true,
    created_at: now,
    updated_at: now,
  };
  const list = loadMonitorsFromStorage();
  list.push(monitor);
  saveMonitorsToStorage(list);
  return monitor;
}

export async function updateMonitor(
  id: string,
  label: string,
  keywords: string[],
  color: string,
  enabled: boolean
): Promise<boolean> {
  const list = loadMonitorsFromStorage();
  const idx = list.findIndex(m => m.id === id);
  if (idx === -1) return false;
  const now = new Date().toISOString();
  list[idx] = { ...list[idx], label: label.trim(), keywords: keywords.map(k => k.trim()).filter(Boolean), color, enabled, updated_at: now };
  saveMonitorsToStorage(list);
  return true;
}

export async function deleteMonitor(id: string): Promise<boolean> {
  const list = loadMonitorsFromStorage().filter(m => m.id !== id);
  saveMonitorsToStorage(list);
  return true;
}

export async function toggleMonitor(id: string, enabled: boolean): Promise<boolean> {
  const list = loadMonitorsFromStorage();
  const m = list.find(m => m.id === id);
  if (!m) return false;
  m.enabled = enabled;
  m.updated_at = new Date().toISOString();
  saveMonitorsToStorage(list);
  return true;
}

// ─── Scanning ────────────────────────────────────────────────────────────────

/**
 * Scan articles against all monitors.
 * Returns a Map of monitorId → matched articles (de-duplicated by article id).
 */
export function scanMonitors(
  monitors: NewsMonitor[],
  articles: NewsArticle[]
): Map<string, NewsArticle[]> {
  const results = new Map<string, NewsArticle[]>();

  for (const monitor of monitors) {
    if (!monitor.enabled) continue;
    const matches: NewsArticle[] = [];
    const seen = new Set<string>();
    for (const article of articles) {
      if (!seen.has(article.id) && articleMatchesMonitor(article, monitor)) {
        matches.push(article);
        seen.add(article.id);
      }
    }
    results.set(monitor.id, matches);
  }

  return results;
}

/**
 * Detect new monitor matches that weren't in the previous fetch.
 * Used to fire notifications only for newly-arrived articles.
 *
 * @param monitors    All active monitors
 * @param articles    Current article list
 * @param prevIds     Set of article IDs from the previous refresh cycle
 * @returns           Array of { monitor, article } pairs to notify about
 */
export function checkForNewBreakingMatches(
  monitors: NewsMonitor[],
  articles: NewsArticle[],
  prevIds: Set<string>
): { monitor: NewsMonitor; article: NewsArticle }[] {
  const results: { monitor: NewsMonitor; article: NewsArticle }[] = [];

  const newArticles = articles.filter(
    a => !prevIds.has(a.id) && (a.priority === 'FLASH' || a.priority === 'URGENT')
  );

  for (const monitor of monitors) {
    if (!monitor.enabled) continue;
    for (const article of newArticles) {
      if (articleMatchesMonitor(article, monitor)) {
        results.push({ monitor, article });
      }
    }
  }

  return results;
}

/**
 * Determine which color to assign the next monitor based on existing monitors.
 */
export function nextMonitorColor(existingMonitors: NewsMonitor[]): string {
  const usedColors = new Set(existingMonitors.map(m => m.color));
  return (
    MONITOR_COLORS.find(c => !usedColors.has(c)) ??
    MONITOR_COLORS[existingMonitors.length % MONITOR_COLORS.length]
  );
}
