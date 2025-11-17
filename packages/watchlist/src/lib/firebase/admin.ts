import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  try {
    // Debug logging
    console.log('[Firebase Admin] Initialization starting...');
    console.log('[Firebase Admin] NODE_ENV:', process.env.NODE_ENV);
    console.log('[Firebase Admin] FIREBASE_SERVICE_ACCOUNT exists:', !!process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('[Firebase Admin] FIREBASE_SERVICE_ACCOUNT length:', process.env.FIREBASE_SERVICE_ACCOUNT?.length || 0);

    // Check if we have service account JSON in environment variable (Vercel production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('[Firebase Admin] ✅ Using FIREBASE_SERVICE_ACCOUNT environment variable');
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
      console.log('[Firebase Admin] ✅ Successfully initialized with service account');
    }
    // In development, try to use local service account file
    else if (process.env.NODE_ENV === 'development') {
      const serviceAccountPath = path.join(process.cwd(), '.firebase', 'service-account.json');
      if (fs.existsSync(serviceAccountPath)) {
        console.log('Using local service account credentials');
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        initializeApp({
          credential: cert(serviceAccount),
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
      } else {
        console.log('No local service account found, trying application default credentials');
        initializeApp({
          credential: applicationDefault(),
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
      }
    } else {
      // Fallback: try application default credentials (GCP environments)
      console.log('[Firebase Admin] ⚠️ No service account found, trying application default credentials');
      console.log('[Firebase Admin] This will likely fail on Vercel!');
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    // Fallback to just project ID (limited functionality)
    console.log('Using fallback Firebase Admin initialization (limited functionality)');
    initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }
}

export const auth = getAuth();
export const db = getFirestore();

// Helper function to save dividend data with admin privileges
export async function saveDividendDataAsAdmin(
  symbol: string,
  exDate: string | null,
  paymentDate: string | null,
  amount: number | null,
  updatedBy: 'cron' | 'on-demand' | 'manual' = 'on-demand'
) {
  try {
    const dividendData = {
      exDate,
      paymentDate,
      amount,
      lastUpdated: new Date(),
      ttl: 90, // days
      updatedBy
    };

    const docRef = db.collection('dividends').doc(symbol);
    await docRef.set(dividendData);

    // Update memory cache to keep it in sync (24 hour TTL)
    const { dividendsCache } = await import('@watchlist/lib/cache/simple-cache');
    const TTL_24_HOURS = 24 * 60 * 60;
    dividendsCache.set(`dividend:${symbol}`, dividendData, TTL_24_HOURS);

    return true;
  } catch (error) {
    console.error(`Error saving dividend data for ${symbol}:`, error);
    return false;
  }
}

// Helper function to batch read dividend data with admin privileges
export async function getDividendDataAsAdmin(symbols: string[]) {
  const { dividendsCache } = await import('@watchlist/lib/cache/simple-cache');
  const results = new Map<string, any>();
  const missingSymbols: string[] = [];
  const TTL_24_HOURS = 24 * 60 * 60; // 24 hours in seconds

  // Check memory cache first for each symbol
  for (const symbol of symbols) {
    const cached = dividendsCache.get<any>(`dividend:${symbol}`);
    if (cached) {
      results.set(symbol, cached.data);
    } else {
      missingSymbols.push(symbol);
    }
  }

  if (results.size > 0) {
    console.log(`[Dividend Cache] HIT for ${results.size}/${symbols.length} symbols`);
  }

  // Only fetch missing symbols from Firestore
  if (missingSymbols.length > 0) {
    console.log(`[Dividend Cache] Fetching ${missingSymbols.length} missing symbols from Firestore`);

    try {
      const refs = missingSymbols.map(symbol => db.collection('dividends').doc(symbol));
      const docs = await db.getAll(...refs);

      docs.forEach((doc) => {
        if (doc.exists) {
          const data = doc.data();
          results.set(doc.id, data);

          // Cache each individual dividend with 24-hour TTL
          dividendsCache.set(`dividend:${doc.id}`, data, TTL_24_HOURS);
        }
      });

      console.log(`[Admin] Batch read ${docs.length} dividend docs from Firestore (${docs.filter(d => d.exists).length} exist)`);
    } catch (error) {
      console.error('Error fetching dividend data from Firestore:', error);
    }
  }

  return results;
}

// Helper function to scan all user watchlists and extract unique symbols
export async function scanUserWatchlists(): Promise<Set<string>> {
  const allSymbols = new Set<string>();

  try {
    const usersSnapshot = await db.collection('users').get();

    // Process each user's watchlist in parallel
    const promises = usersSnapshot.docs.map(async (userDoc) => {
      try {
        // Watchlist is stored at /users/{uid}/data/watchlist
        const watchlistDoc = await db
          .collection('users')
          .doc(userDoc.id)
          .collection('data')
          .doc('watchlist')
          .get();

        if (watchlistDoc.exists) {
          const watchlistData = watchlistDoc.data();

          if (watchlistData?.tabs && Array.isArray(watchlistData.tabs)) {
            watchlistData.tabs.forEach((tab: any) => {
              if (tab.items && Array.isArray(tab.items)) {
                tab.items.forEach((item: any) => {
                  if (item.type === 'stock' && item.symbol) {
                    allSymbols.add(item.symbol);
                  }
                });
              }
            });
          }
        }
      } catch (userError) {
        console.error(`[Admin] Error scanning watchlist for user ${userDoc.id}:`, userError);
      }
    });

    await Promise.all(promises);

    console.log(`[Admin] Scanned ${usersSnapshot.size} users, found ${allSymbols.size} unique symbols`);
  } catch (error) {
    console.error('[Admin] Error scanning watchlists:', error);
  }

  return allSymbols;
}

// ============================================================================
// QUOTES CACHE - Materialized Active Symbols Set
// ============================================================================

/**
 * Update materialized active symbols set
 * Call this when a symbol is added/removed from any watchlist
 * Maintains /admin/meta/activeSymbols with current symbol list
 */
export async function updateActiveSymbolsSet(): Promise<boolean> {
  try {
    const symbols = await scanUserWatchlists();
    const symbolsArray = Array.from(symbols).sort();

    const docRef = db.collection('admin').doc('meta').collection('cache').doc('activeSymbols');
    await docRef.set({
      symbols: symbolsArray,
      updatedAt: new Date(),
      approxCount: symbolsArray.length
    });

    console.log(`[Admin] Updated active symbols set: ${symbolsArray.length} symbols`);
    return true;
  } catch (error) {
    console.error('[Admin] Error updating active symbols set:', error);
    return false;
  }
}

/**
 * Get active symbols from materialized set
 * Much faster than scanning all watchlists (1 read vs hundreds)
 * Falls back to scanning if materialized set doesn't exist
 */
export async function getActiveSymbols(): Promise<Set<string>> {
  try {
    const docRef = db.collection('admin').doc('meta').collection('cache').doc('activeSymbols');
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data();
      if (data?.symbols && Array.isArray(data.symbols)) {
        console.log(`[Admin] Loaded ${data.symbols.length} active symbols from materialized set`);
        return new Set(data.symbols);
      }
    }

    // Fallback: scan watchlists and update materialized set
    console.log('[Admin] No materialized symbols found, scanning watchlists...');
    const symbols = await scanUserWatchlists();

    // Asynchronously update the materialized set for next time (don't wait)
    updateActiveSymbolsSet().catch(err =>
      console.error('[Admin] Failed to update symbols set after fallback scan:', err)
    );

    return symbols;
  } catch (error) {
    console.error('[Admin] Error getting active symbols:', error);
    // Final fallback: scan directly
    return await scanUserWatchlists();
  }
}

// ============================================================================
// QUOTES CACHE - Save/Get Functions
// ============================================================================

/**
 * Save stock quote data to Firestore global cache with schema versioning
 * @param symbol Stock symbol (e.g., "AAPL")
 * @param quoteData Stock data from FMP API
 * @param updatedBy Source of update ('cron' | 'on-demand' | 'manual')
 */
export async function saveQuoteDataAsAdmin(
  symbol: string,
  quoteData: any, // Using any to avoid circular import of Stock type
  updatedBy: 'cron' | 'on-demand' | 'manual' = 'cron'
): Promise<boolean> {
  try {
    const cacheDoc = {
      // Schema versioning (prevents migration pain)
      schemaVersion: 1,
      apiVersion: 'fmp-v3',

      // Stock data
      ...quoteData,

      // Cache metadata
      lastUpdated: new Date(),
      ttl: 60, // seconds
      updatedBy
    };

    const docRef = db.collection('quotesCache').doc(symbol);
    await docRef.set(cacheDoc);

    // Update memory cache to keep it in sync (30 second TTL)
    const { quotesCache } = await import('@watchlist/lib/cache/simple-cache');
    const TTL_30_SECONDS = 30; // seconds
    quotesCache.set(`quote:${symbol}`, quoteData, TTL_30_SECONDS);

    return true;
  } catch (error) {
    console.error(`[Admin] Error saving quote data for ${symbol}:`, error);
    return false;
  }
}

/**
 * Batch read stock quotes from Firestore global cache with memory fallback
 * @param symbols Array of stock symbols to fetch
 * @returns Map of symbol -> quote data
 */
export async function getQuoteDataAsAdmin(symbols: string[]): Promise<Map<string, any>> {
  const { quotesCache } = await import('@watchlist/lib/cache/simple-cache');
  const results = new Map<string, any>();
  const missingSymbols: string[] = [];
  const TTL_30_SECONDS = 30; // seconds

  // Check memory cache first for each symbol
  for (const symbol of symbols) {
    const cached = quotesCache.get<any>(`quote:${symbol}`);
    if (cached) {
      results.set(symbol, cached.data);
    } else {
      missingSymbols.push(symbol);
    }
  }

  if (results.size > 0) {
    console.log(`[Quote Cache] Memory HIT for ${results.size}/${symbols.length} symbols`);
  }

  // Only fetch missing symbols from Firestore
  if (missingSymbols.length > 0) {
    console.log(`[Quote Cache] Fetching ${missingSymbols.length} missing symbols from Firestore`);

    try {
      // Batch read from Firestore (max 500 per batch, but we'll rarely hit this)
      const batchSize = 500;
      let totalDocs = 0;
      let firestoreHits = 0;

      for (let i = 0; i < missingSymbols.length; i += batchSize) {
        const batch = missingSymbols.slice(i, i + batchSize);
        const refs = batch.map(symbol => db.collection('quotesCache').doc(symbol));
        const docs = await db.getAll(...refs);

        totalDocs += docs.length;

        docs.forEach((doc) => {
          if (doc.exists) {
            firestoreHits++;
            const data = doc.data();

            // Check schema version for forward compatibility
            if (!data?.schemaVersion || data.schemaVersion === 1) {
              // Remove cache metadata before returning
              const { schemaVersion, apiVersion, lastUpdated, ttl, updatedBy, ...quoteData } = data!;

              results.set(doc.id, quoteData);

              // Cache each individual quote with 30-second TTL
              quotesCache.set(`quote:${doc.id}`, quoteData, TTL_30_SECONDS);
            } else {
              console.warn(`[Quote Cache] Unknown schema version ${data.schemaVersion} for ${doc.id}`);
            }
          }
        });
      }

      console.log(`[Admin] Batch read ${missingSymbols.length} quote docs from Firestore (${firestoreHits} exist)`);
    } catch (error) {
      console.error('[Admin] Error fetching quote data from Firestore:', error);
    }
  }

  return results;
}