'use server';

import { NextResponse } from 'next/server';

const FMP_API_URL = 'https://financialmodelingprep.com/api/v3/stock_news';

async function fetchNewsCounts(symbols: string[], apiKey: string) {
  if (symbols.length === 0) {
    return {};
  }

  const url = new URL(FMP_API_URL);
  url.searchParams.set('tickers', symbols.join(','));
  url.searchParams.set('limit', Math.min(symbols.length * 5, 50).toString());
  url.searchParams.set('apikey', apiKey);

  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`News API request failed (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Unexpected news response format');
  }

  const counts: Record<string, number> = {};
  symbols.forEach((symbol) => (counts[symbol] = 0));

  payload.forEach((article: any) => {
    const ticker = (article?.symbol || '').toUpperCase();
    if (ticker && counts[ticker] !== undefined) {
      counts[ticker] += 1;
    }
  });

  return counts;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing FMP_API_KEY' }, { status: 500 });
  }

  try {
    const counts = await fetchNewsCounts(symbols, apiKey);
    const response: Record<string, { hasNews: boolean; count: number }> = {};
    symbols.forEach((symbol) => {
      const count = counts[symbol] ?? 0;
      response[symbol] = { hasNews: count > 0, count };
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch news counts';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
