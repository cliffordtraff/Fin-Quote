'use server';

import { NextRequest, NextResponse } from 'next/server';
import { Topic, TOPICS } from '@watchlist/config/topics';

function classifyArticle(headline: string, description: string, feedTopic?: string): Topic[] {
  const text = `${headline} ${description}`.toLowerCase();
  const topics = new Set<Topic>();

  if (feedTopic && TOPICS.includes(feedTopic as Topic)) {
    topics.add(feedTopic as Topic);
  }

  const rules: Record<string, string[]> = {
    Technology: ['ai', 'artificial intelligence', 'tech', 'software', 'nvidia', 'apple', 'google', 'microsoft', 'meta', 'amazon', 'chip', 'semiconductor'],
    Economy: ['economy', 'economic', 'gdp', 'inflation', 'recession', 'employment', 'unemployment', 'consumer spending'],
    'Fed Policy': ['federal reserve', 'fed', 'interest rate', 'monetary policy', 'powell', 'central bank', 'rate cut', 'rate hike'],
    Markets: ['stock', 'market', 'dow', 'nasdaq', 's&p', 'trading', 'wall street', 'investor'],
    Earnings: ['earnings', 'profit', 'revenue', 'quarterly', 'eps', 'guidance'],
    'M&A': ['merger', 'acquisition', 'buyout', 'takeover', 'deal'],
    Energy: ['oil', 'energy', 'gas', 'petroleum', 'renewable', 'solar', 'wind'],
    Crypto: ['bitcoin', 'crypto', 'cryptocurrency', 'ethereum', 'blockchain'],
    Banking: ['bank', 'lending', 'credit', 'wells fargo', 'jpmorgan', 'goldman'],
    Politics: ['congress', 'senate', 'biden', 'trump', 'election', 'legislation', 'government'],
    International: ['china', 'europe', 'global', 'international', 'geopolitical'],
    'Real Estate': ['housing', 'real estate', 'mortgage', 'property'],
    Commodities: ['gold', 'silver', 'copper', 'commodity', 'metals']
  };

  for (const [topic, keywords] of Object.entries(rules)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        topics.add(topic as Topic);
        break;
      }
    }
  }

  if (topics.size === 0) {
    topics.add('Business');
  }

  return Array.from(topics).slice(0, 3);
}

export async function POST(request: NextRequest) {
  try {
    const { articles } = await request.json();

    if (!articles || !Array.isArray(articles)) {
      return NextResponse.json({ error: 'Invalid request: articles array required' }, { status: 400 });
    }

    const results = articles.map((article: any) => {
      const topics = classifyArticle(article.headline, article.description || '', article.feedTopic);
      return {
        canonicalUrl: article.canonicalUrl,
        topics,
        topicsClassified: true,
        classificationMethod: 'keyword'
      };
    });

    return NextResponse.json({
      success: true,
      classified: results.length,
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Classification failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
