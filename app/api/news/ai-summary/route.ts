import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { WhyItMovedData } from '@watchlist/types/ai-summary';

const FMP_NEWS_URL = 'https://financialmodelingprep.com/api/v3/stock_news';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function extractResponseText(response: any): string | undefined {
  if (response?.output_text) return response.output_text;
  const message = (response?.output as any[])?.find((item) => item.type === 'message');
  if (!message?.content) return undefined;

  return message.content
    .map((part: any) => {
      if (part?.type === 'output_text' && typeof part?.text === 'string') return part.text;
      if (typeof part?.text === 'string') return part.text;
      if (typeof part === 'string') return part;
      return '';
    })
    .join('')
    .trim();
}

async function fetchArticles(symbol: string, apiKey: string, limit = 6) {
  const url = new URL(FMP_NEWS_URL);
  url.searchParams.set('tickers', symbol);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('apikey', apiKey);

  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`News API request failed (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload;
}

function buildPrompt(symbol: string, articles: any[]) {
  const headlineList = articles
    .map((article: any, index: number) => {
      const source = article?.site || article?.source || 'Unknown';
      const published = article?.publishedDate || article?.date || 'Unknown';
      return `${index + 1}. [${source}] (${published}) ${article?.title || 'Untitled'} — ${article?.text || article?.summary || ''}`;
    })
    .join('\n');

  return `You are a financial analyst. Summarize why ${symbol} moved today using the headlines below.
Return JSON with keys: summary (string), data (object with fields primaryDriver, sentiment, score, confidence, narrative) and sources (array of { title, source, link, time }).
Sentiment must be one of bullish, neutral, bearish.
Headlines:\n${headlineList}`;
}

function buildFallback(symbol: string, articles: any[]): { summary: string; data: WhyItMovedData } {
  if (articles.length === 0) {
    const data: WhyItMovedData = {
      narrative: `No recent headlines for ${symbol}.`,
      primaryDriver: 'No news',
      sentiment: 'neutral',
      score: 0,
      confidence: 0.2
    };
    return { summary: data.narrative, data };
  }

  const first = articles[0];
  const source = first?.site || first?.source || 'Unknown';
  const title = first?.title || 'Latest headline';
  const summaryText = `${symbol}: ${title} (${source})`;
  const data: WhyItMovedData = {
    narrative: summaryText,
    primaryDriver: title,
    sentiment: 'neutral',
    score: 0,
    confidence: 0.4
  };
  return { summary: summaryText, data };
}

function mapSources(articles: any[]) {
  return articles.map((article: any) => ({
    title: article?.title || 'Untitled',
    source: article?.site || article?.source || 'Unknown',
    link: article?.url,
    time: article?.publishedDate || article?.date || new Date().toISOString()
  }));
}

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const symbol = (body?.symbol || '').toUpperCase();

    if (!symbol) {
      return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
    }

    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing FMP_API_KEY' }, { status: 500 });
    }

    const articles = await fetchArticles(symbol, apiKey, 6);
    const sources = mapSources(articles);

    if (!openai || articles.length === 0) {
      const fallback = buildFallback(symbol, articles);
      return NextResponse.json({ summary: fallback.summary, data: fallback.data, sources, earningsContext: null });
    }

    const prompt = buildPrompt(symbol, articles);
    const response = await openai.responses.create({
      model: DEFAULT_MODEL,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }],
          type: 'message'
        }
      ],
      text: { format: { type: 'json_object' } },
      max_output_tokens: 600,
      ...(DEFAULT_MODEL.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {})
    });

    const content = extractResponseText(response);
    if (!content) {
      const fallback = buildFallback(symbol, articles);
      return NextResponse.json({ summary: fallback.summary, data: fallback.data, sources, earningsContext: null, mock: true });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      const fallback = buildFallback(symbol, articles);
      return NextResponse.json({ summary: fallback.summary, data: fallback.data, sources, earningsContext: null, mock: true });
    }

    const summary: string = parsed.summary || parsed.data?.narrative || content;
    const data: WhyItMovedData = {
      narrative: parsed.data?.narrative || summary,
      primaryDriver: parsed.data?.primaryDriver || parsed.data?.driver || 'General market activity',
      sentiment: parsed.data?.sentiment === 'bullish' || parsed.data?.sentiment === 'bearish' ? parsed.data.sentiment : 'neutral',
      score: typeof parsed.data?.score === 'number' ? parsed.data.score : 0,
      confidence: typeof parsed.data?.confidence === 'number' ? parsed.data.confidence : 0.5,
      supportingFactors: parsed.data?.supportingFactors || []
    };

    return NextResponse.json({ summary, data, sources, earningsContext: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate AI summary';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
