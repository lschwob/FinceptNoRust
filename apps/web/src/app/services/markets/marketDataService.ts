// Market Data Service - TypeScript wrapper for Tauri market data commands
// Modular design: gracefully handles failures and can be extended with other data sources
// CACHING: Use unified cache system (useCache hook) in components

import { invoke } from '@tauri-apps/api/core';
import { marketDataLogger } from '../core/loggerService';
import { cacheService } from '../cache/cacheService';

export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  volume?: number;
  high?: number;
  low?: number;
  open?: number;
  previous_close?: number;
  timestamp: number;
}

export interface QuoteResponse {
  success: boolean;
  data?: QuoteData;
  error?: string;
}

export interface QuotesResponse {
  success: boolean;
  data: QuoteData[];
  error?: string;
}

export interface PeriodReturns {
  symbol: string;
  seven_day: number;
  thirty_day: number;
}

export interface PeriodReturnsResponse {
  success: boolean;
  data?: PeriodReturns;
  error?: string;
}

/**
 * Market Data Service
 * Provides a clean TypeScript interface to fetch market data
 * Handles errors gracefully and provides fallback behavior
 */
class MarketDataService {
  private isAvailable: boolean | null = null;

  /**
   * Check if market data service is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const result = await invoke<boolean>('check_market_data_health');
      this.isAvailable = result;
      return result;
    } catch (error) {
      marketDataLogger.error('Health check failed:', error);
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Fetch a single quote
   * Returns null if fetch fails (graceful degradation)
   */
  async getQuote(symbol: string): Promise<QuoteData | null> {
    try {
      const response = await invoke<QuoteResponse>('get_market_quote', { symbol });
      if (response?.success && response.data && typeof response.data === 'object') {
        const d = response.data;
        return {
          symbol: d.symbol ?? symbol,
          price: Number(d.price) || 0,
          change: Number(d.change) ?? 0,
          change_percent: Number(d.change_percent) ?? 0,
          volume: d.volume != null ? Number(d.volume) : undefined,
          high: d.high != null ? Number(d.high) : undefined,
          low: d.low != null ? Number(d.low) : undefined,
          open: d.open != null ? Number(d.open) : undefined,
          previous_close: d.previous_close != null ? Number(d.previous_close) : undefined,
          timestamp: Number(d.timestamp) || Math.floor(Date.now() / 1000),
        };
      }
      marketDataLogger.warn(`Failed to fetch quote for ${symbol}:`, response?.error);
      return null;
    } catch (error) {
      marketDataLogger.error(`Error fetching quote for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Fetch multiple quotes in batch
   * Returns only successful fetches (partial success model)
   */
  async getQuotes(symbols: string[]): Promise<QuoteData[]> {
    try {
      const response = await invoke<QuotesResponse>('get_market_quotes', { symbols });
      if (!response?.success) {
        marketDataLogger.warn('Failed to fetch quotes:', response?.error);
        return [];
      }
      const list = Array.isArray(response.data) ? response.data : [];
      return list.filter((d): d is QuoteData => d && typeof d === 'object' && typeof d.symbol === 'string').map(d => ({
        symbol: d.symbol,
        price: Number(d.price) || 0,
        change: Number(d.change) ?? 0,
        change_percent: Number(d.change_percent) ?? 0,
        volume: d.volume != null ? Number(d.volume) : undefined,
        high: d.high != null ? Number(d.high) : undefined,
        low: d.low != null ? Number(d.low) : undefined,
        open: d.open != null ? Number(d.open) : undefined,
        previous_close: d.previous_close != null ? Number(d.previous_close) : undefined,
        timestamp: Number(d.timestamp) || Math.floor(Date.now() / 1000),
      }));
    } catch (error) {
      marketDataLogger.error('Error fetching quotes:', error);
      return [];
    }
  }

  /**
   * Fetch period returns (7D, 30D)
   * Returns null if fetch fails
   */
  async getPeriodReturns(symbol: string): Promise<PeriodReturns | null> {
    try {
      const response = await invoke<PeriodReturnsResponse>('get_period_returns', { symbol });
      if (response?.success && response.data && typeof response.data === 'object') {
        return {
          symbol: response.data.symbol ?? symbol,
          seven_day: Number(response.data.seven_day) ?? 0,
          thirty_day: Number(response.data.thirty_day) ?? 0,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch enhanced quote with period returns
   * Combines quote data with 7D/30D returns
   */
  async getEnhancedQuote(symbol: string): Promise<(QuoteData & { seven_day?: number; thirty_day?: number }) | null> {
    const [quote, returns] = await Promise.all([
      this.getQuote(symbol),
      this.getPeriodReturns(symbol)
    ]);

    if (!quote) return null;

    return {
      ...quote,
      seven_day: returns?.seven_day,
      thirty_day: returns?.thirty_day
    };
  }

  /**
   * Fetch enhanced quotes for multiple symbols
   * Fetches quotes and returns in parallel
   */
  async getEnhancedQuotes(symbols: string[]): Promise<(QuoteData & { seven_day?: number; thirty_day?: number })[]> {
    const quotes = await this.getQuotes(symbols);

    // Fetch returns for all symbols in parallel
    const returnsPromises = symbols.map(symbol => this.getPeriodReturns(symbol));
    const returns = await Promise.all(returnsPromises);

    // Merge quotes with returns
    return quotes.map((quote, index) => ({
      ...quote,
      seven_day: returns[index]?.seven_day,
      thirty_day: returns[index]?.thirty_day
    }));
  }

  /**
   * Fetch enhanced quotes with unified caching
   * Uses the new unified cache system (fincept_cache.db)
   * @deprecated Use useCache hook in components instead for better control
   */
  async getEnhancedQuotesWithCache(
    symbols: string[],
    category: string,
    maxCacheAgeMinutes: number = 10
  ): Promise<(QuoteData & { seven_day?: number; thirty_day?: number })[]> {
    const cacheKey = `market-quotes:${category}:${symbols.sort().join(',')}`;
    const ttlSeconds = maxCacheAgeMinutes * 60;

    try {
      // Check unified cache first
      const cached = await cacheService.get<(QuoteData & { seven_day?: number; thirty_day?: number })[]>(cacheKey);
      if (cached && !cached.isStale) {
        marketDataLogger.debug(`[Cache HIT] ${category} - ${symbols.length} symbols`);
        return cached.data;
      }

      // Fetch fresh data
      marketDataLogger.debug(`[Cache MISS] Fetching ${symbols.length} symbols for ${category}`);
      const freshData = await this.getEnhancedQuotes(symbols);

      // Store in unified cache
      if (freshData.length > 0) {
        await cacheService.set(cacheKey, freshData, 'market-quotes', ttlSeconds);
      }

      return freshData;
    } catch (error) {
      marketDataLogger.error('Cache error, falling back to direct fetch:', error);
      return await this.getEnhancedQuotes(symbols);
    }
  }

  /**
   * Format price change with sign
   */
  formatChange(value: number): string {
    return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
  }

  /**
   * Format percentage change with sign
   */
  formatChangePercent(value: number): string {
    return value >= 0 ? `+${value.toFixed(2)}%` : `${value.toFixed(2)}%`;
  }

  /**
   * Check if service is likely available
   * (cached result from last health check)
   */
  isLikelyAvailable(): boolean {
    return this.isAvailable !== false;
  }
}

// Export singleton instance
export const marketDataService = new MarketDataService();
export default marketDataService;
