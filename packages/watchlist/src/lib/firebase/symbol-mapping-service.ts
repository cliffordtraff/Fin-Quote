import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  query, 
  where, 
  getDocs,
  updateDoc,
  increment,
  Timestamp,
  writeBatch,
  limit,
  orderBy,
  FieldValue
} from 'firebase/firestore';
import { db } from './config';
import type { SymbolMappingV2, UserSymbolOverride } from '@watchlist/types/symbol-mapping';

const MAPPINGS_COLLECTION = 'symbolMappings';
const USER_OVERRIDES_COLLECTION = 'userSymbolOverrides';

/**
 * Create document key from exchange and symbol
 * Format: {exchange}:{symbol} to prevent collisions
 */
function createDocumentKey(exchange: string, symbol: string): string {
  return `${exchange}:${symbol}`;
}

/**
 * Normalize exchange name for TradingView compatibility
 * ARCA ETFs use NYSEARCA prefix in TradingView
 */
export function normalizeExchangeForTV(exchange: string, type: 'stock' | 'etf' | 'index'): string {
  // ARCA ETFs need NYSEARCA prefix in TradingView
  if (exchange === 'ARCA' && type === 'etf') {
    return 'NYSEARCA';
  }
  return exchange;
}

/**
 * Get a symbol mapping by exchange and symbol
 */
export async function getSymbolMapping(exchange: string, symbol: string): Promise<SymbolMappingV2 | null> {
  try {
    const docKey = createDocumentKey(exchange, symbol);
    const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as SymbolMappingV2;
    }
    return null;
  } catch (error) {
    console.error('Error fetching symbol mapping:', error);
    return null;
  }
}

/**
 * Get a symbol mapping by FMP symbol (tries common exchanges)
 * This is a convenience function for when we only have the symbol
 * Note: NYSEARCA is the TradingView prefix for NYSE ETFs
 */
export async function getSymbolMappingByFmpSymbol(fmpSymbol: string): Promise<SymbolMappingV2 | null> {
  // Try common exchanges in order of likelihood
  // Include NYSEARCA for ETFs (maps to ARCA in our storage)
  const commonExchanges = ['NYSE', 'NASDAQ', 'AMEX', 'ARCA', 'NYSEARCA'];
  
  for (const exchange of commonExchanges) {
    // NYSEARCA is stored as ARCA in our DB but displayed as NYSEARCA in TradingView
    const storageExchange = exchange === 'NYSEARCA' ? 'ARCA' : exchange;
    const mapping = await getSymbolMapping(storageExchange, fmpSymbol);
    if (mapping) {
      return mapping;
    }
  }
  
  // If not found in common exchanges, query by fmpSymbol field
  try {
    const q = query(
      collection(db, MAPPINGS_COLLECTION),
      where('fmpSymbol', '==', fmpSymbol),
      where('active', '==', true),
      limit(1)
    );
    
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data() as SymbolMappingV2;
    }
  } catch (error) {
    console.error('Error querying symbol mapping:', error);
  }
  
  return null;
}

/**
 * Get multiple symbol mappings by FMP symbols
 */
export async function getSymbolMappings(fmpSymbols: string[]): Promise<Map<string, SymbolMappingV2>> {
  const mappings = new Map<string, SymbolMappingV2>();
  
  if (fmpSymbols.length === 0) return mappings;
  
  try {
    // Firestore has a limit of 10 for 'in' queries, so batch if needed
    const chunks = [];
    for (let i = 0; i < fmpSymbols.length; i += 10) {
      chunks.push(fmpSymbols.slice(i, i + 10));
    }
    
    for (const chunk of chunks) {
      const q = query(
        collection(db, MAPPINGS_COLLECTION),
        where('fmpSymbol', 'in', chunk)
      );
      
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach((doc) => {
        const data = doc.data() as SymbolMappingV2;
        mappings.set(data.fmpSymbol, data);
      });
    }
    
    return mappings;
  } catch (error) {
    console.error('Error fetching symbol mappings:', error);
    return mappings;
  }
}

/**
 * Create or update a symbol mapping (server-only)
 * Uses exchange:symbol as document key
 */
export async function upsertSymbolMapping(
  mapping: Omit<SymbolMappingV2, 'usageCount' | 'lastUsed'>
): Promise<void> {
  try {
    const docKey = createDocumentKey(mapping.exchange, mapping.fmpSymbol);
    const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
    const existingDoc = await getDoc(docRef);
    
    if (existingDoc.exists()) {
      // Update existing, preserve usage count and active status if not provided
      const updates: any = {
        ...mapping,
        lastVerified: Timestamp.now()
      };
      
      // Don't overwrite active status unless explicitly set
      if (mapping.active === undefined) {
        delete updates.active;
      }
      
      await updateDoc(docRef, updates);
    } else {
      // Create new with defaults
      await setDoc(docRef, {
        ...mapping,
        active: mapping.active !== false, // Default to active
        usageCount: 0,
        lastVerified: Timestamp.now()
      });
    }
  } catch (error) {
    console.error('Error upserting symbol mapping:', error);
    throw error;
  }
}

/**
 * Batch upsert multiple symbol mappings
 * Chunks into batches of 500 (Firestore limit)
 */
export async function batchUpsertSymbolMappings(
  mappings: Omit<SymbolMappingV2, 'usageCount' | 'lastUsed'>[]
): Promise<{ success: number; failed: number }> {
  const BATCH_SIZE = 500; // Firestore batch limit
  let successCount = 0;
  let failedCount = 0;
  
  try {
    // Process in chunks of 500
    for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
      const chunk = mappings.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      
      for (const mapping of chunk) {
        const docKey = createDocumentKey(mapping.exchange, mapping.fmpSymbol);
        const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
        
        batch.set(docRef, {
          ...mapping,
          active: mapping.active !== false,
          usageCount: 0,
          lastVerified: Timestamp.now()
        }, { merge: true });
      }
      
      try {
        await batch.commit();
        successCount += chunk.length;
      } catch (error) {
        console.error(`Error committing batch ${i / BATCH_SIZE}:`, error);
        failedCount += chunk.length;
      }
    }
    
    return { success: successCount, failed: failedCount };
  } catch (error) {
    console.error('Error batch upserting symbol mappings:', error);
    throw error;
  }
}

/**
 * Increment usage count for a symbol mapping (atomic operation)
 * This prevents race conditions when multiple users access simultaneously
 */
export async function incrementMappingUsage(exchange: string, symbol: string): Promise<void> {
  try {
    const docKey = createDocumentKey(exchange, symbol);
    const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
    
    // Use atomic increment to prevent race conditions
    await updateDoc(docRef, {
      usageCount: increment(1),
      lastUsed: Timestamp.now()
    });
  } catch (error) {
    console.error('Error incrementing mapping usage:', error);
    // Don't throw - this is not critical for app functionality
  }
}

/**
 * Increment usage by FMP symbol (tries common exchanges)
 */
export async function incrementMappingUsageByFmpSymbol(fmpSymbol: string): Promise<void> {
  const mapping = await getSymbolMappingByFmpSymbol(fmpSymbol);
  if (mapping) {
    await incrementMappingUsage(mapping.exchange, fmpSymbol);
  }
}

/**
 * Get top N most used symbol mappings
 */
export async function getTopUsedMappings(n: number = 20): Promise<SymbolMappingV2[]> {
  try {
    const q = query(
      collection(db, MAPPINGS_COLLECTION),
      orderBy('usageCount', 'desc'),
      limit(n)
    );
    
    const querySnapshot = await getDocs(q);
    const mappings: SymbolMappingV2[] = [];
    
    querySnapshot.forEach((doc) => {
      mappings.push(doc.data() as SymbolMappingV2);
    });
    
    return mappings;
  } catch (error) {
    console.error('Error fetching top used mappings:', error);
    return [];
  }
}

/**
 * Get mappings that need verification
 */
export async function getMappingsForVerification(minUsageCount: number = 10): Promise<SymbolMappingV2[]> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const q = query(
      collection(db, MAPPINGS_COLLECTION),
      where('usageCount', '>=', minUsageCount),
      where('confidence', '==', 'unverified'),
      orderBy('usageCount', 'desc'),
      limit(10)
    );
    
    const querySnapshot = await getDocs(q);
    const mappings: SymbolMappingV2[] = [];
    
    querySnapshot.forEach((doc) => {
      mappings.push(doc.data() as SymbolMappingV2);
    });
    
    return mappings;
  } catch (error) {
    console.error('Error fetching mappings for verification:', error);
    return [];
  }
}

/**
 * Mark a mapping as verified
 */
export async function markMappingVerified(exchange: string, symbol: string): Promise<void> {
  try {
    const docKey = createDocumentKey(exchange, symbol);
    const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
    await updateDoc(docRef, {
      confidence: 'verified',
      lastVerified: Timestamp.now(),
      active: true // Verified mappings are active
    });
  } catch (error) {
    console.error('Error marking mapping as verified:', error);
    throw error;
  }
}

/**
 * Mark a mapping as inactive (for delisted symbols)
 */
export async function markMappingInactive(exchange: string, symbol: string, supersededBy?: string): Promise<void> {
  try {
    const docKey = createDocumentKey(exchange, symbol);
    const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
    
    const updates: any = {
      active: false,
      lastVerified: Timestamp.now()
    };
    
    if (supersededBy) {
      updates.supersededBy = supersededBy;
    }
    
    await updateDoc(docRef, updates);
  } catch (error) {
    console.error('Error marking mapping as inactive:', error);
    throw error;
  }
}

/**
 * Get user-specific symbol override
 */
export async function getUserSymbolOverride(userId: string, fmpSymbol: string): Promise<UserSymbolOverride | null> {
  try {
    const docId = `${userId}_${fmpSymbol}`;
    const docRef = doc(db, USER_OVERRIDES_COLLECTION, docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as UserSymbolOverride;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user symbol override:', error);
    return null;
  }
}

/**
 * Set user-specific symbol override
 */
export async function setUserSymbolOverride(
  userId: string, 
  fmpSymbol: string, 
  tvSymbol: string
): Promise<void> {
  try {
    const docId = `${userId}_${fmpSymbol}`;
    const docRef = doc(db, USER_OVERRIDES_COLLECTION, docId);
    
    await setDoc(docRef, {
      userId,
      fmpSymbol,
      tvSymbol,
      createdAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error setting user symbol override:', error);
    throw error;
  }
}