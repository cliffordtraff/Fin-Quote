'use server';

import { NextRequest, NextResponse } from 'next/server';
import type { NewsArticle } from '@watchlist/types';

const SOURCE_ENDPOINTS = [
  { key: 'WSJ', path: '/api/news/wsj?feed=markets' },
  { key: 'NYT', path: '/api/news/nyt?feed=business' },
  { key: 'Bloomberg', path: '/api/news/bloomberg?feed=markets' }
];

interface SourceResult {
  source: string;
  articles: NewsArticle[];
  error?: string;
}

async function fetchSource(baseUrl: string, source: { key: string; path: string }): Promise<SourceResult> {
  try {
    const response = await fetch(`${baseUrl}${source.path}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source.key} feed (${response.status})`);
    }
    const data = await response.json();
    return {
      source: source.key,
      articles: Array.isArray(data.articles) ? data.articles : []
    };
  } catch (error) {
    console.warn(`[news] Error fetching ${source.key}:`, error);
    return {
      source: source.key,
      articles: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function GET(request: NextRequest) {
  const baseUrl = new URL(request.url).origin;

  const results = await Promise.all(SOURCE_ENDPOINTS.map((source) => fetchSource(baseUrl, source)));

  const articles = results.flatMap((result) => result.articles);

  // Sort newest first
  articles.sort((a, b) => {
    const dateA = new Date(a.publishedAt || a.date || 0).getTime();
    const dateB = new Date(b.publishedAt || b.date || 0).getTime();
    return dateB - dateA;
  });

  const stats = {
    total: articles.length,
    sources: results.reduce<Record<string, number>>((acc, result) => {
      acc[result.source] = result.articles.length;
      return acc;
    }, {})
  };

  return NextResponse.json(
    {
      success: true,
      articles,
      stats
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=120'
      }
    }
  );
}
