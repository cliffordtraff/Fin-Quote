'use server';

import { getProvider } from '@/lib/providers';

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
  try {
    const provider = getProvider();
    const articles = await provider.getNews(symbol, limit);

    return articles.map((a) => ({
      title: a.title,
      text: a.text,
      url: a.url,
      image: a.image,
      publishedDate: a.publishedDate,
      site: a.site,
      symbol: a.symbol,
    }));
  } catch (error) {
    console.error('Error fetching stock news:', error);
    return [];
  }
}
