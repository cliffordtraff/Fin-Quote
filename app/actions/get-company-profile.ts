'use server';

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
export async function getCompanyProfile(symbol: string = 'AAPL'): Promise<CompanyProfile | null> {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    console.error('FMP_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${apiKey}`,
      { next: { revalidate: 86400 } } // Cache for 24 hours - descriptions don't change often
    );

    if (!response.ok) {
      console.error('Failed to fetch company profile:', response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    const profile = data[0];

    return {
      symbol: profile.symbol,
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
    console.error('Error fetching company profile:', error);
    return null;
  }
}
