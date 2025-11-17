'use server';

import { NextResponse } from 'next/server';

const FMP_ANALYST_URL = 'https://financialmodelingprep.com/api/v3/analyst-stock-grade';

interface AnalystMeta {
  hasAnalystData: boolean;
  recentChanges: number;
  latestAction?: string;
  latestDate?: string;
  latestCompany?: string;
  latestGrade?: string;
}

async function fetchAnalystData(symbol: string, apiKey: string): Promise<AnalystMeta> {
  const url = `${FMP_ANALYST_URL}/${symbol}?limit=20&apikey=${apiKey}`;
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Analyst request failed (${response.status}) for ${symbol}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) {
    return { hasAnalystData: false, recentChanges: 0 };
  }

  const latest = payload[0];
  return {
    hasAnalystData: true,
    recentChanges: payload.length,
    latestAction: latest?.action || latest?.analystFirm,
    latestDate: latest?.publishedDate,
    latestCompany: latest?.analystCompany,
    latestGrade: latest?.grade
  };
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

  const response: Record<string, AnalystMeta> = {};

  for (const symbol of symbols) {
    try {
      response[symbol] = await fetchAnalystData(symbol, apiKey);
    } catch (error) {
      console.warn('[watchlist] Analyst fetch failed for', symbol, error);
      response[symbol] = { hasAnalystData: false, recentChanges: 0 };
    }
  }

  return NextResponse.json(response);
}
