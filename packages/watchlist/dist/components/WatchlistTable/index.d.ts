import { WatchlistEntry, NewsArticle } from '@watchlist/types';
interface WatchlistTableProps {
    symbols: string[];
    items?: WatchlistEntry[];
    allSymbolsWithTabs?: Array<{
        symbol: string;
        tabName: string;
        tabIndex: number;
    }>;
    activeTabIndex?: number;
    onRemoveSymbol: (symbol: string) => void;
    onRemoveSymbols?: (symbols: string[]) => void;
    onRenameHeader?: (oldName: string, newName: string) => void;
    onAddHeaderRow?: (index: number) => void;
    onAddTickerRow?: (index: number) => void;
    onSymbolClick?: (symbol: string) => void;
    deleteMode?: boolean;
    reorderMode?: boolean;
    onReorderMode?: () => void;
    onSelectionChange?: (selectedSymbols: string[]) => void;
    onDragStart?: (index: number) => void;
    onDragOver?: (e: React.DragEvent, index: number) => void;
    onDrop?: (e: React.DragEvent, index: number) => void;
    onDragEnd?: () => void;
    onDragLeave?: () => void;
    draggedIndex?: number | null;
    dropIndex?: number | null;
    dropPosition?: 'before' | 'after' | null;
    placeholderRow?: {
        index: number;
        type: 'header' | 'ticker';
    } | null;
    onPlaceholderHeaderSave?: (text: string) => void;
    onPlaceholderCancel?: () => void;
    showExtendedHours?: boolean;
    columnWidthOverrides?: Record<string, number>;
    onColumnWidthsChange?: (widths: Record<string, number>) => void;
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
}
declare const WatchlistTable: import("react").NamedExoticComponent<WatchlistTableProps>;
export default WatchlistTable;
