'use server';

import { NextResponse } from 'next/server';
import type { Stock, DividendData, UnifiedStockResponse } from '@watchlist/types';

const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

function mapQuotePayload(payload: any): Stock {
  return {
    symbol: payload.symbol,
    name: payload.name ?? payload.symbol,
    price: payload.price ?? 0,
    change: payload.change ?? 0,
    changePercent: payload.changesPercentage ?? 0,
    volume: payload.volume ?? 0,
    bid: payload.bid ?? 0,
    ask: payload.ask ?? 0,
    bidSize: payload.bidSize ?? 0,
    askSize: payload.askSize ?? 0,
    dayLow: payload.dayLow ?? 0,
    dayHigh: payload.dayHigh ?? 0,
    weekLow52: payload.yearLow ?? 0,
    weekHigh52: payload.yearHigh ?? 0,
    marketCap: payload.marketCap ?? 0,
    peRatio: payload.pe ?? null,
    eps: payload.eps ?? null,
    dividendYield: payload.dividendYield ?? null,
    exDividendDate: payload.exDividendDate ?? null,
    lastUpdated: new Date()
  };
}

async function fetchQuotes(symbols: string[], apiKey: string) {
  if (symbols.length === 0) {
    return {};
  }

  const url = `${FMP_BASE_URL}/quote/${symbols.join(',')}?apikey=${apiKey}`;
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Quote request failed (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Unexpected quote response format');
  }

  return payload.reduce<Record<string, Stock>>((acc, item) => {
    if (!item?.symbol) return acc;
    acc[item.symbol] = mapQuotePayload(item);
    return acc;
  }, {});
}

async function fetchDividends(symbols: string[], apiKey: string) {
  const results: Record<string, DividendData> = {};

  for (const symbol of symbols) {
    try {
      const url = `${FMP_BASE_URL}/historical-price-full/stock_dividend/${symbol}?limit=1&apikey=${apiKey}`;
      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const entry = payload?.historical?.[0];
      if (!entry) {
        continue;
      }

      results[symbol] = {
        symbol,
        dividendYield: entry?.dividendYield ?? null,
        exDividendDate: entry?.date ?? null,
        yieldBasis: 'TTM'
      };
    } catch {
      // ignore individual dividend errors, continue best-effort
    }
  }

  return results;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get('symbols');
  const includeParam = url.searchParams.get('include') ?? '';
  const includes = includeParam
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing FMP_API_KEY' }, { status: 500 });
  }

  const requestedSymbols = symbolsParam
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  if (requestedSymbols.length === 0) {
    return NextResponse.json({ error: 'No valid symbols supplied' }, { status: 400 });
  }

  const includeQuotes = includes.length === 0 || includes.includes('quotes');
  const includeDividends = includes.includes('dividends');

  try {
    const quotes = includeQuotes ? await fetchQuotes(requestedSymbols, apiKey) : {};
    const dividends = includeDividends ? await fetchDividends(requestedSymbols, apiKey) : {};

    const response: UnifiedStockResponse = {
      data: {
        quotes,
        dividends,
        metadata: {}
      },
      status: {
        source: 'live',
        timestamp: new Date().toISOString(),
        requestedSymbols,
        returnedSymbols: Object.keys(quotes),
        errors: [],
        warnings: [],
        cacheTTL: 0
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch stock data';
    return NextResponse.json(
      {
        data: { quotes: {}, dividends: {}, metadata: {} },
        status: {
          source: 'error',
          timestamp: new Date().toISOString(),
          requestedSymbols,
          returnedSymbols: [],
          errors: [message],
          warnings: [],
          cacheTTL: 0
        }
      },
      { status: 502 }
    );
  }
}
