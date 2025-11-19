import { NewsArticle } from '@watchlist/types';
interface NewsIndicatorProps {
    news?: NewsArticle | null;
    newsCount?: number;
    onNewsClick?: () => void;
    prefetchArticles?: () => Promise<void>;
    symbol?: string;
    allArticles?: NewsArticle[];
    fetchFMPArticles?: (symbol: string) => Promise<NewsArticle[]>;
    fmpNewsCount?: number;
}
export default function NewsIndicator({ news, newsCount, onNewsClick, prefetchArticles, symbol, allArticles, fetchFMPArticles, fmpNewsCount }: NewsIndicatorProps): import("react/jsx-runtime").JSX.Element;
export {};
