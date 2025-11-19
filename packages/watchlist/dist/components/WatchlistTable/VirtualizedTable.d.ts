import { MergedStock, WatchlistEntry } from '@watchlist/types';
interface VirtualizedTableProps {
    items: WatchlistEntry[];
    stockData: Map<string, MergedStock>;
    columnWidths: {
        [key: string]: number;
    };
    columns: Array<{
        key: string;
        label: string;
    }>;
    highlightedSymbol: string | null;
    selectedSymbols: Set<string>;
    deleteMode?: boolean;
    reorderMode?: boolean;
    containerHeight?: number;
    newsData?: {
        [symbol: string]: {
            count: number;
            loading?: boolean;
        };
    };
    rssNewsData?: {
        [symbol: string]: {
            count: number;
            loading?: boolean;
        };
    };
    analystData?: {
        [symbol: string]: {
            count: number;
            loading?: boolean;
        };
    };
    onCellClick?: (symbol: string, columnKey: string) => void;
    onCheckboxChange?: (symbol: string, checked: boolean) => void;
    onSelectAll?: (checked: boolean) => void;
    onNewsClick?: (symbol: string) => void;
    onHeaderContextMenu?: (e: React.MouseEvent, columnKey: string) => void;
    onResizeStart?: (e: React.MouseEvent, columnKey: string, columnIndex: number) => void;
    onDoubleClick?: (columnKey: string) => void;
}
declare const VirtualizedTable: import("react").NamedExoticComponent<VirtualizedTableProps>;
export default VirtualizedTable;
