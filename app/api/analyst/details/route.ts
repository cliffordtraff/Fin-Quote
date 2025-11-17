'use server';

import { NextResponse } from 'next/server';

const FMP_ANALYST_URL = 'https://financialmodelingprep.com/api/v3/analyst-stock-grade';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing FMP_API_KEY' }, { status: 500 });
  }

  try {
    const response = await fetch(`${FMP_ANALYST_URL}/${symbol}?limit=50&apikey=${apiKey}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Analyst request failed (${response.status})`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return NextResponse.json({ changes: [] });
    }

    return NextResponse.json({ changes: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch analyst details';
    return NextResponse.json({ error: message, changes: [] }, { status: 502 });
  }
}
