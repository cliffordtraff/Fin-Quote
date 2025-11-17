'use server';

import { NextResponse } from 'next/server';

const FMP_NEWS_URL = 'https://financialmodelingprep.com/api/v3/stock_news';

interface WatchlistNewsArticle {
  title: string;
  url: string;
  source: string;
  sourceDomain?: string;
  publishedAt: string;
  summary: string;
  headline?: string;
}

function mapArticle(raw: any): WatchlistNewsArticle {
  const publishedIso = raw?.publishedDate || raw?.date || new Date().toISOString();
  const url: string = raw?.url || '';
  let sourceDomain = '';
  try {
    sourceDomain = url ? new URL(url).hostname : '';
  } catch {
    sourceDomain = raw?.site || '';
  }

  const title = raw?.title || raw?.headline || 'Untitled';
  const summary = raw?.text || raw?.content || raw?.summary || '';

  return {
    title,
    headline: title,
    summary,
    url,
    sourceDomain,
    source: raw?.site || raw?.source || sourceDomain || 'FMP',
    publishedAt: publishedIso
  };
}

async function fetchArticles(symbol: string, limit: number, apiKey: string) {
  const url = new URL(FMP_NEWS_URL);
  url.searchParams.set('tickers', symbol);
  url.searchParams.set('limit', Math.min(Math.max(limit, 1), 50).toString());
  url.searchParams.set('apikey', apiKey);

  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`News API request failed (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Unexpected news response format');
  }

  return payload;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbolParam = (url.searchParams.get('symbol') || '').toUpperCase();
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : 10;

  if (!symbolParam) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing FMP_API_KEY' }, { status: 500 });
  }

  try {
    const rawArticles = await fetchArticles(symbolParam, limit, apiKey);
    const articles = rawArticles.map(mapArticle);

    return NextResponse.json({
      symbol: symbolParam,
      articles,
      stats: {
        totalArticles: articles.length,
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch news';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
