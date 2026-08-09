'use server';

import {
  normalizeMarketSymbol,
  toFmpMarketSymbol,
} from '@/lib/market-symbol'
import type { ProviderRequestOptions } from '@/lib/providers/types'

export interface CompanyProfile {
  symbol: string;
  companyName: string;
  description: string;
  ceo: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  website: string | null;
  fullTimeEmployees: number | null;
  ipoDate: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
}

/**
 * Fetch company profile from FMP API
 * Includes company description and other key details
 */
export async function getCompanyProfile(
  symbol: string = 'AAPL',
  options: ProviderRequestOptions = {},
): Promise<CompanyProfile | null> {
  options.signal?.throwIfAborted();
  const strict = options.failureMode === 'throw';
  const apiKey = process.env.FMP_API_KEY;
  const canonicalSymbol = normalizeMarketSymbol(symbol);
  const requestSymbol = toFmpMarketSymbol(canonicalSymbol);

  if (!apiKey) {
    if (strict) throw new Error('FMP_API_KEY not configured');
    console.error('FMP_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://financialmodelingprep.com/api/v3/profile/${requestSymbol}?apikey=${apiKey}`,
      {
        next: { revalidate: 86400 },
        signal: options.signal,
      }, // Cache for 24 hours - descriptions don't change often
    );
    options.signal?.throwIfAborted();

    if (!response.ok) {
      if (response.status === 404) return null;
      if (strict) {
        throw new Error(`FMP profile request failed with status ${response.status}`);
      }
      console.error('Failed to fetch company profile:', response.statusText);
      return null;
    }

    const data: unknown = await response.json();
    options.signal?.throwIfAborted();

    if (!Array.isArray(data)) {
      if (strict) throw new Error('FMP returned an invalid profile payload');
      return null;
    }

    if (data.length === 0) {
      return null;
    }

    const profile = data[0];
    if (
      !profile ||
      typeof profile !== 'object' ||
      Array.isArray(profile) ||
      typeof profile?.symbol !== 'string' ||
      normalizeMarketSymbol(profile.symbol) !== canonicalSymbol
    ) {
      if (strict) throw new Error(`FMP profile symbol mismatch for ${canonicalSymbol}`);
      console.error(`FMP profile symbol mismatch for ${canonicalSymbol}`);
      return null;
    }

    if (
      strict &&
      (
        typeof profile.companyName !== 'string' ||
        profile.companyName.trim().length === 0 ||
        (profile.description !== undefined && profile.description !== null && typeof profile.description !== 'string') ||
        (profile.sector !== undefined && profile.sector !== null && typeof profile.sector !== 'string') ||
        (profile.industry !== undefined && profile.industry !== null && typeof profile.industry !== 'string') ||
        (profile.exchange !== undefined && profile.exchange !== null && typeof profile.exchange !== 'string') ||
        (profile.fullTimeEmployees !== undefined &&
          profile.fullTimeEmployees !== null &&
          (
            typeof profile.fullTimeEmployees !== 'number' ||
            !Number.isSafeInteger(profile.fullTimeEmployees) ||
            profile.fullTimeEmployees < 0
          )) ||
        (profile.ipoDate !== undefined && profile.ipoDate !== null && typeof profile.ipoDate !== 'string') ||
        (profile.country !== undefined && profile.country !== null && typeof profile.country !== 'string') ||
        (profile.city !== undefined && profile.city !== null && typeof profile.city !== 'string')
      )
    ) {
      throw new Error('FMP returned an invalid profile payload');
    }

    return {
      symbol: canonicalSymbol,
      companyName: profile.companyName,
      description: profile.description || '',
      ceo: profile.ceo || null,
      sector: profile.sector || null,
      industry: profile.industry || null,
      exchange: profile.exchange || null,
      website: profile.website || null,
      fullTimeEmployees: profile.fullTimeEmployees || null,
      ipoDate: profile.ipoDate || null,
      country: profile.country || null,
      city: profile.city || null,
      state: profile.state || null,
      address: profile.address || null,
    };
  } catch (error) {
    options.signal?.throwIfAborted();
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (strict) throw error;
    console.error('Error fetching company profile:', error);
    return null;
  }
}
