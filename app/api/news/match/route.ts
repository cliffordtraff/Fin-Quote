'use server';

import { NextResponse } from 'next/server';
import type { NewsArticle } from '@watchlist/types';

const FMP_NEWS_URL = 'https://financialmodelingprep.com/api/v3/stock_news';

interface MatchRequest {
  symbols?: string[];
  feedType?: string;
  limit?: number;
}

function mapArticle(raw: any): NewsArticle {
  const publishedAt = raw?.publishedDate ? new Date(raw.publishedDate) : new Date();
  return {
    id: raw?.id?.toString() || raw?.url,
    headline: raw?.title || raw?.headline || 'Untitled',
    description: raw?.text || raw?.content || raw?.summary || '',
    canonicalUrl: raw?.url,
    sourceDomain: raw?.site || '',
    source: 'WSJ',
    isPaywalled: false,
    publishedAt,
    normalizedTitle: raw?.title || '',
    normalizedDescription: raw?.text || raw?.summary || '',
    entities: [],
    matchedTickers: [],
    topics: [],
    feedTopic: raw?.sentiment || null,
    topicsClassified: false,
    classificationMetadata: {
      model: 'fmp',
      promptVersion: '0',
      classifiedAt: publishedAt,
      idempotencyKey: raw?.url || raw?.title || ''
    },
    scope: 'company',
    macroEventType: null
  };
}

async function fetchNews(symbols: string[], apiKey: string, limit: number) {
  if (symbols.length === 0) return [];

  const url = new URL(FMP_NEWS_URL);
  url.searchParams.set('tickers', symbols.join(','));
  url.searchParams.set('limit', Math.min(limit, 50).toString());
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

export async function POST(request: Request) {
  let body: MatchRequest = {};
  try {
    body = await request.json();
  } catch {
    // ignore malformed JSON; fallback to defaults
  }

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing FMP_API_KEY' }, { status: 500 });
  }

  const symbols = (body.symbols || []).map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0) {
    return NextResponse.json({ news: {}, stats: { totalArticles: 0 } });
  }

  const limit = body.limit ?? symbols.length * 4;

  try {
    const rawNews = await fetchNews(symbols, apiKey, limit);
    const grouped: Record<string, NewsArticle[]> = {};
    symbols.forEach((symbol) => (grouped[symbol] = []));

    rawNews.forEach((article: any) => {
      const ticker = (article?.symbol || '').toUpperCase();
      if (grouped[ticker]) {
        grouped[ticker].push(mapArticle(article));
      }
    });

    return NextResponse.json({
      news: grouped,
      stats: {
        totalArticles: rawNews.length
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch news';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
