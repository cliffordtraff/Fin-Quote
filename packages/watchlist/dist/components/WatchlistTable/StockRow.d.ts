import { MergedStock } from '@watchlist/types';
interface NewsMeta {
    hasNews: boolean;
    count: number;
    latestPublishedAt?: string;
    latestTitle?: string;
}
interface RSSNewsMeta {
    symbol: string;
    articles: any[];
    count: number;
    latestArticle?: any;
}
interface NewsArticle {
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    summary: string;
}
interface AnalystMeta {
    hasAnalystData: boolean;
    recentChanges: number;
    latestAction?: string;
    latestDate?: string;
    latestCompany?: string;
    latestGrade?: string;
    priceTarget?: number;
    upgrades: number;
    downgrades: number;
    initiations: number;
}
interface StockRowProps {
    symbol: string;
    stock?: MergedStock;
    isHeader?: boolean;
    isHighlighted: boolean;
    deleteMode?: boolean;
    reorderMode?: boolean;
    isSelected?: boolean;
    isDragging?: boolean;
    isDropTarget?: boolean;
    dropPosition?: 'before' | 'after' | null;
    index?: number;
    newsMeta?: NewsMeta;
    rssNewsMeta?: RSSNewsMeta;
    analystMeta?: AnalystMeta;
    fetchArticles?: (symbol: string) => Promise<NewsArticle[]>;
    fetchRSSArticles?: (symbol: string) => Promise<any[]>;
    prefetchArticles?: (symbol: string) => Promise<void>;
    prefetchRSSArticles?: (symbol: string) => void;
    onShowNewsModal?: (modal: {
        symbol: string;
        articles: NewsArticle[];
        loading: boolean;
    }) => void;
    onShowAnalystModal?: (modal: {
        symbol: string;
        changes: any[];
        loading: boolean;
    }) => void;
    onCheckboxChange?: (checked: boolean) => void;
    onRowClick: () => void;
    onSymbolClick: () => void;
    onRemove: () => void;
    onRename?: (newName: string) => void;
    onContextMenu?: (e: React.MouseEvent, symbol: string, rowIndex: number) => void;
    onDragStart?: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
    onDragEnd?: () => void;
    onDragLeave?: () => void;
    showExtendedHours?: boolean;
}
declare const StockRow: import("react").NamedExoticComponent<StockRowProps>;
export default StockRow;
