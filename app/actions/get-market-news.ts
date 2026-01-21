'use server';

export interface MarketNewsItem {
  title: string;
  text: string;
  url: string;
  publishedDate: string;
  site: string;
}

/**
 * Get general market news headlines
 * @param limit - Number of news items to fetch (default: 5)
 */
export async function getMarketNews(limit: number = 5): Promise<MarketNewsItem[]> {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    console.error('FMP_API_KEY is not set');
    return [];
  }

  try {
    const response = await fetch(
      `https://financialmodelingprep.com/api/v4/general_news?page=0&apikey=${apiKey}`,
      { next: { revalidate: 300 } } // Cache for 5 minutes
    );

    if (!response.ok) {
      console.error(`FMP General News API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data || !Array.isArray(data)) {
      return [];
    }

    // Take only the requested limit
    return data.slice(0, limit).map((item: any) => ({
      title: item.title || '',
      text: item.text || '',
      url: item.url || '',
      publishedDate: item.publishedDate || '',
      site: item.site || '',
    }));
  } catch (error) {
    console.error('Error fetching market news:', error);
    return [];
  }
}
