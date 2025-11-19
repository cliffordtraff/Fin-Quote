'use server';

import { NextRequest, NextResponse } from 'next/server';

type TvSearchResult = {
  symbol: string;
  tvSymbol: string;
  name: string;
  exchange: string;
  type: string;
  country?: string;
  currency?: string;
  isADR?: boolean;
  source: 'tradingview' | 'fallback';
};

const tvSearchCache = new Map<string, { data: TvSearchResult[]; timestamp: number }>();
const CACHE_TTL = 60 * 1000;

const rateLimit = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    if (!checkRateLimit(request)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const query = request.nextUrl.searchParams.get('q');
    if (!query || !query.trim()) {
      return NextResponse.json({ results: [] });
    }
    const trimmedQuery = query.trim();
    const cacheKey = `tv-${trimmedQuery.toLowerCase()}`;
    const cached = tvSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ results: cached.data, cached: true, source: 'tradingview-proxy' });
    }

    const tvResults = await fetchTradingView(trimmedQuery);
    if (tvResults.length) {
      tvSearchCache.set(cacheKey, { data: tvResults, timestamp: Date.now() });
      cleanCache();
      return NextResponse.json({ results: tvResults, cached: false, source: 'tradingview-proxy' });
    }

    // no tv results -> fall back to FMP via symbols search
    const fallback = await fetch(`${request.nextUrl.origin}/api/symbols/search?q=${encodeURIComponent(trimmedQuery)}`);
    const fallbackData = await fallback.json();
    return NextResponse.json({ ...fallbackData, source: 'fallback' });
  } catch (error) {
    console.error('[tv/search] error', error);
    try {
      const query = request.nextUrl.searchParams.get('q') ?? '';
      const fallback = await fetch(`${request.nextUrl.origin}/api/symbols/search?q=${encodeURIComponent(query)}`);
      const fallbackData = await fallback.json();
      return NextResponse.json({ ...fallbackData, source: 'fallback' });
    } catch (fallbackError) {
      return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 });
    }
  }
}

async function fetchTradingView(query: string): Promise<TvSearchResult[]> {
  const url = new URL('https://symbol-search.tradingview.com/symbol_search/');
  url.searchParams.set('text', query);
  url.searchParams.set('hl', '1');
  url.searchParams.set('exchange', '');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('type', '');
  url.searchParams.set('domain', 'production');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://www.tradingview.com/',
      Origin: 'https://www.tradingview.com'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    console.warn('[tv/search] TradingView request failed', response.status);
    return [];
  }

  const payload = (await response.json()) as any[];
  const filtered = payload
    .filter((item) => isAllowedType(item.type) && isValidExchange(item.exchange))
    .map((item) => ({
      symbol: stripHtml(item.symbol),
      tvSymbol: `${stripHtml(item.exchange || 'NASDAQ')}:${stripHtml(item.symbol)}`,
      name: stripHtml(item.description || item.symbol),
      exchange: stripHtml(item.exchange || ''),
      type: mapType(item.type),
      country: item.country || '',
      currency: item.currency_code || item.currency || '',
      isADR: detectADR(item),
      source: 'tradingview' as const,
      priorityScore: getPriorityScore(item)
    }))
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));

  const deduped: TvSearchResult[] = [];
  const seen = new Set<string>();
  for (const item of filtered) {
    if (seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    deduped.push(item);
    if (deduped.length >= 12) break;
  }

  return deduped;
}

function checkRateLimit(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    request.ip ||
    'unknown';
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now > entry.reset) {
    rateLimit.set(ip, { count: 1, reset: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) {
    return false;
  }
  entry.count += 1;
  return true;
}

function isAllowedType(type?: string) {
  if (!type) return false;
  const normalized = type.toLowerCase();
  return ['stock', 'index', 'fund', 'etf', 'dr'].includes(normalized);
}

function isValidExchange(exchange?: string) {
  if (!exchange) return false;
  const ex = exchange.toUpperCase();
  if (EXCLUDED_SOURCES.has(ex)) return false;
  return VALID_EXCHANGES.has(ex);
}

function stripHtml(input: string) {
  return input?.replace(/<[^>]+>/g, '') ?? '';
}

function mapType(type?: string) {
  if (!type) return 'stock';
  const value = type.toLowerCase();
  if (value === 'fund' || value === 'etf') return 'etf';
  return 'stock';
}

function detectADR(item: any): boolean {
  const usExchanges = ['NYSE', 'NASDAQ', 'AMEX'];
  return Boolean(usExchanges.includes(item.exchange) && item.country && item.country !== 'United States');
}

function getPriorityScore(item: any) {
  let score = 0;
  if (item.type === 'stock') score += 5;
  if (item.exchange && ['NASDAQ', 'NYSE', 'AMEX'].includes(item.exchange)) score += 5;
  if (item.country === 'United States') score += 3;
  if (item.symbol?.toUpperCase() === item.symbol) score += 1;
  return score;
}

function cleanCache() {
  const now = Date.now();
  for (const [key, value] of tvSearchCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      tvSearchCache.delete(key);
    }
  }
}

const VALID_EXCHANGES = new Set([
  'NYSE',
  'NASDAQ',
  'AMEX',
  'ARCA',
  'BATS',
  'IEX',
  'CBOEBZX',
  'LSE',
  'TSX',
  'TSXV',
  'ASX',
  'XETRA',
  'EURONEXT',
  'SIX',
  'HKEX',
  'TSE',
  'KRX',
  'SSE',
  'SZSE',
  'NSE',
  'BSE',
  'CME',
  'CBOT',
  'NYMEX',
  'COMEX',
  'ICE',
  'BMFBOVESPA',
  'BMV',
  'BYMA',
  'BVC',
  'BCS',
  'JSE',
  'SET',
  'IDX',
  'MYX',
  'PSE',
  'TWSE',
  'TASE'
]);

const EXCLUDED_SOURCES = new Set([
  'PYTH',
  'VANTAGE',
  'BOATS',
  'CFI',
  'SPREADEX',
  'EIGHTCAP',
  'THINKMARKETS',
  'MARKETS.COM',
  'OANDA',
  'FOREXCOM',
  'SAXO',
  'PEPPERSTONE',
  'CURRENCYCOM',
  'FX',
  'FXCM',
  'CAPITALCOM',
  'SKILLING',
  'BLACKBULL',
  'PHILLIPNOVA',
  'TVC'
]);
