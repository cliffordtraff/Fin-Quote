'use server';

import { NextResponse } from 'next/server';
import type { ExtendedHoursQuote } from '@watchlist/types';
import { getExtendedHoursSession } from '@watchlist/utils/market-hours';

const FMP_URL = 'https://financialmodelingprep.com/api/v3/quote';

function mapExtendedQuote(raw: any, session: 'pre-market' | 'after-hours' | null): ExtendedHoursQuote | null {
  const price = raw?.extendedPrice ?? raw?.preMarketPrice ?? raw?.postMarketPrice;
  if (price == null) {
    return null;
  }

  const change = raw?.extendedChange ?? raw?.postMarketChange ?? raw?.preMarketChange ?? 0;
  const changePercent =
    raw?.extendedChangePercent ?? raw?.postMarketChangePercent ?? raw?.preMarketChangePercent ?? 0;

  return {
    symbol: raw?.symbol,
    price,
    change,
    changePercent,
    timestamp: raw?.extendedPriceTime
      ? new Date(raw.extendedPriceTime).toISOString()
      : new Date().toISOString(),
    session: session ?? 'after-hours'
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing FMP_API_KEY' }, { status: 500 });
  }

  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'No valid symbols provided' }, { status: 400 });
  }

  try {
    const response = await fetch(`${FMP_URL}/${symbols.join(',')}?apikey=${apiKey}`, {
      cache: 'no-store'
    });

    if (response.status === 404) {
      return NextResponse.json({ error: 'Extended hours data unavailable' }, { status: 404 });
    }

    if (!response.ok) {
      throw new Error(`Extended hours request failed (${response.status})`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Unexpected extended-hours response format');
    }

    const session = getExtendedHoursSession();
    const data: Record<string, ExtendedHoursQuote> = {};

    payload.forEach((quote: any) => {
      const extendedQuote = mapExtendedQuote(quote, session);
      if (extendedQuote) {
        data[quote.symbol] = extendedQuote;
      }
    });

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No extended hours quotes' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch extended hours data';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
