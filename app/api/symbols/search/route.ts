'use server';

import { NextRequest, NextResponse } from 'next/server';

type SymbolSearchResult = {
  symbol: string;
  tvSymbol: string;
  name: string;
  exchange: string;
  type: string;
  country: string;
  currency: string;
  isADR: boolean;
  source: 'fmp' | 'mock';
};

const searchCache = new Map<string, { data: SymbolSearchResult[]; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 60 seconds

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q');
    if (!query || !query.trim()) {
      return NextResponse.json({ results: [] });
    }

    const trimmed = query.trim().toUpperCase();
    const cacheKey = `symbol-search-${trimmed}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ results: cached.data, cached: true });
    }

    const apiKey = process.env.FMP_API_KEY;
    const results = apiKey
      ? await fetchFmpResults(trimmed, apiKey)
      : getMockResults(trimmed);

    searchCache.set(cacheKey, { data: results, timestamp: Date.now() });
    cleanCache();

    return NextResponse.json({ results, cached: false });
  } catch (error) {
    console.error('[symbols/search] error', error);
    return NextResponse.json(
      { results: [], error: 'Search failed' },
      { status: 500 }
    );
  }
}

async function fetchFmpResults(query: string, apiKey: string): Promise<SymbolSearchResult[]> {
  const url = new URL('https://financialmodelingprep.com/api/v3/search');
  url.searchParams.set('query', query);
  url.searchParams.set('limit', '10');
  url.searchParams.set('apikey', apiKey);

  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    console.warn('[symbols/search] FMP search failed', response.status);
    return getMockResults(query);
  }

  const payload = (await response.json()) as any[];
  return payload
    .filter((item) => item?.symbol && item?.stockExchange)
    .slice(0, 10)
    .map((item) => ({
      symbol: item.symbol,
      tvSymbol: mapToTradingViewSymbol(item.symbol, item.exchangeShortName),
      name: item.name || item.symbol,
      exchange: item.exchangeShortName || '',
      type: item.type === 'etf' ? 'etf' : 'stock',
      country: item.country || '',
      currency: item.currency || 'USD',
      isADR: detectADR(item),
      source: 'fmp' as const
    }));
}

function mapToTradingViewSymbol(symbol: string, exchange?: string): string {
  if (!exchange) return symbol;
  const map: Record<string, string> = {
    NASDAQ: 'NASDAQ',
    NYSE: 'NYSE',
    AMEX: 'AMEX',
    LSE: 'LSE',
    TSX: 'TSX',
    TSXV: 'TSXV',
    ASX: 'ASX',
    HKG: 'HKEX',
    SSE: 'SSE',
    SZSE: 'SZSE',
    NSE: 'NSE',
    BSE: 'BSE',
    JPX: 'TSE',
    KRX: 'KRX',
    TWSE: 'TWSE',
    SGX: 'SGX',
    XETRA: 'XETR',
    EURONEXT: 'EURONEXT',
    BME: 'BME',
    SIX: 'SIX',
    OMX: 'OMX',
    MOEX: 'MOEX',
    JSE: 'JSE',
    BOVESPA: 'BMFBOVESPA',
    BMV: 'BMV',
    CRYPTO: 'CRYPTO'
  };
  const tvExchange = map[exchange] || exchange;
  return `${tvExchange}:${symbol}`;
}

function detectADR(item: any): boolean {
  const usExchanges = ['NYSE', 'NASDAQ', 'AMEX'];
  const isUSExchange = usExchanges.includes(item.exchangeShortName);
  const isNonUSCompany = item.country && item.country !== 'United States';
  return Boolean(isUSExchange && isNonUSCompany);
}

function getMockResults(query: string): SymbolSearchResult[] {
  const list = [
    { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' },
    { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ' },
    { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', exchange: 'NASDAQ' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ' },
    { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ' }
  ];

  return list
    .filter(
      (entry) =>
        entry.symbol.toLowerCase().includes(query.toLowerCase()) ||
        entry.name.toLowerCase().includes(query.toLowerCase())
    )
    .map((entry) => ({
      symbol: entry.symbol,
      tvSymbol: `${entry.exchange}:${entry.symbol}`,
      name: entry.name,
      exchange: entry.exchange,
      type: 'stock',
      country: 'US',
      currency: 'USD',
      isADR: false,
      source: 'mock' as const
    }));
}

function cleanCache() {
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      searchCache.delete(key);
    }
  }
}
