'use server';

import { NextResponse } from 'next/server';

const FMP_NEWS_URL = 'https://financialmodelingprep.com/api/v3/stock_news';

interface FmpArticle {
  title?: string;
  text?: string;
  summary?: string;
  url?: string;
  site?: string;
  source?: string;
  publishedDate?: string;
  date?: string;
  author?: string;
  symbol?: string;
  sentiment?: string;
}

function mapArticle(raw: FmpArticle) {
  const headline = raw.title || 'Untitled article';
  const publishedAt = raw.publishedDate || raw.date || new Date().toISOString();
  const canonicalUrl = raw.url || '';
  const source = raw.site || raw.source || 'FMP';

  return {
    headline,
    description: raw.text || raw.summary || '',
    canonicalUrl,
    source,
    publishedAt,
    author: raw.author || undefined,
    isArchived: false,
    topics: [],
    feedTopic: raw.sentiment || undefined,
    topicsClassified: false
  };
}

export async function GET() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing FMP_API_KEY' }, { status: 500 });
  }

  try {
    const url = new URL(FMP_NEWS_URL);
    url.searchParams.set('limit', '150');
    url.searchParams.set('apikey', apiKey);

    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`FMP news request failed (${response.status})`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Unexpected news response format');
    }

    const articles = payload.map(mapArticle);

    return NextResponse.json(
      {
        success: true,
        articles,
        stats: {
          total: articles.length
        }
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=180'
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch news feed';
    return NextResponse.json({ error: message, articles: [] }, { status: 502 });
  }
}
