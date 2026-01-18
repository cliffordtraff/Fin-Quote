'use server';

export interface NewsItem {
  title: string;
  text: string;
  url: string;
  image: string | null;
  publishedDate: string;
  site: string;
  symbol: string;
}

/**
 * Get latest news for a stock symbol
 * @param symbol - Stock symbol (e.g., 'AAPL', 'MSFT')
 * @param limit - Number of news items to fetch (default: 5)
 */
export async function getStockNews(symbol: string, limit: number = 5): Promise<NewsItem[]> {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    console.error('FMP_API_KEY is not set');
    return [];
  }

  try {
    const response = await fetch(
      `https://financialmodelingprep.com/api/v3/stock_news?tickers=${symbol}&limit=${limit}&apikey=${apiKey}`,
      { next: { revalidate: 300 } } // Cache for 5 minutes
    );

    if (!response.ok) {
      console.error(`FMP News API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data.map((item: any) => ({
      title: item.title || '',
      text: item.text || '',
      url: item.url || '',
      image: item.image || null,
      publishedDate: item.publishedDate || '',
      site: item.site || '',
      symbol: item.symbol || symbol,
    }));
  } catch (error) {
    console.error('Error fetching stock news:', error);
    return [];
  }
}
