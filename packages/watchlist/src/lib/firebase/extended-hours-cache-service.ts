import { db } from './admin';
import { ExtendedHoursQuote } from '@watchlist/types';

export interface CachedExtendedHoursData {
  preMarket?: {
    price: number;
    change: number;
    changePercent: number;
    timestamp: string;
  };
  afterHours?: {
    price: number;
    change: number;
    changePercent: number;
    timestamp: string;
  };
  updatedAt: string;
}

/**
 * Check if a symbol is cryptocurrency
 */
function isCrypto(symbol: string): boolean {
  return symbol.includes('-USD') || symbol.includes('BTC') || symbol.includes('ETH');
}

/**
 * Save pre-market extended hours data to cache
 */
export async function savePreMarketCache(symbol: string, data: ExtendedHoursQuote): Promise<void> {
  if (isCrypto(symbol)) {
    console.log(`[ExtHoursCache] Skipping crypto symbol: ${symbol}`);
    return;
  }

  const cacheRef = db.collection('extendedHoursCache').doc(symbol);

  const cacheData = {
    preMarket: {
      price: data.price,
      change: data.change,
      changePercent: data.changePercent,
      timestamp: data.timestamp
    },
    updatedAt: new Date().toISOString()
  };

  await cacheRef.set(cacheData, { merge: true });
  console.log(`[ExtHoursCache] Saved pre-market data for ${symbol}: $${data.price}`);
}

/**
 * Save after-hours extended hours data to cache
 */
export async function saveAfterHoursCache(symbol: string, data: ExtendedHoursQuote): Promise<void> {
  if (isCrypto(symbol)) {
    console.log(`[ExtHoursCache] Skipping crypto symbol: ${symbol}`);
    return;
  }

  const cacheRef = db.collection('extendedHoursCache').doc(symbol);

  const cacheData = {
    afterHours: {
      price: data.price,
      change: data.change,
      changePercent: data.changePercent,
      timestamp: data.timestamp
    },
    updatedAt: new Date().toISOString()
  };

  await cacheRef.set(cacheData, { merge: true });
  console.log(`[ExtHoursCache] Saved after-hours data for ${symbol}: $${data.price}`);
}

/**
 * Get cached extended hours data for a symbol
 */
export async function getCachedExtendedHours(symbol: string): Promise<CachedExtendedHoursData | null> {
  if (isCrypto(symbol)) {
    return null; // Don't use cache for crypto
  }

  const cacheRef = db.collection('extendedHoursCache').doc(symbol);
  const doc = await cacheRef.get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as CachedExtendedHoursData;
}

/**
 * Batch save pre-market data for multiple symbols
 */
export async function batchSavePreMarket(data: Map<string, ExtendedHoursQuote>): Promise<void> {
  const batch = db.batch();
  let count = 0;

  for (const [symbol, quote] of data.entries()) {
    if (isCrypto(symbol)) {
      continue;
    }

    const cacheRef = db.collection('extendedHoursCache').doc(symbol);
    batch.set(cacheRef, {
      preMarket: {
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        timestamp: quote.timestamp
      },
      updatedAt: new Date().toISOString()
    }, { merge: true });

    count++;
  }

  if (count > 0) {
    await batch.commit();
    console.log(`[ExtHoursCache] Batch saved pre-market data for ${count} symbols`);
  }
}

/**
 * Batch save after-hours data for multiple symbols
 */
export async function batchSaveAfterHours(data: Map<string, ExtendedHoursQuote>): Promise<void> {
  const batch = db.batch();
  let count = 0;

  for (const [symbol, quote] of data.entries()) {
    if (isCrypto(symbol)) {
      continue;
    }

    const cacheRef = db.collection('extendedHoursCache').doc(symbol);
    batch.set(cacheRef, {
      afterHours: {
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        timestamp: quote.timestamp
      },
      updatedAt: new Date().toISOString()
    }, { merge: true });

    count++;
  }

  if (count > 0) {
    await batch.commit();
    console.log(`[ExtHoursCache] Batch saved after-hours data for ${count} symbols`);
  }
}
