'use server';

import { NextResponse } from 'next/server';
import { getChartData } from '@/app/actions/watchlist/get-chart-data';
import type { Timeframe } from '@/hooks/useChartModal';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol');
  const timeframe = (url.searchParams.get('timeframe') as Timeframe | null) ?? '1D';

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  try {
    const data = await getChartData(symbol, timeframe);
    return NextResponse.json({ symbol, timeframe, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch chart data';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
