import { CSSProperties } from 'react';
import { MergedStock } from '@watchlist/types';
interface TableCellProps {
    style: CSSProperties;
    columnKey: string;
    rowData: MergedStock | null;
    isHeader?: boolean;
    isHighlighted?: boolean;
    isSelected?: boolean;
    deleteMode?: boolean;
    reorderMode?: boolean;
    newsMeta?: {
        count: number;
        loading?: boolean;
    };
    rssNewsMeta?: {
        count: number;
        loading?: boolean;
    };
    analystMeta?: {
        count: number;
        loading?: boolean;
    };
    allArticles?: any[];
    onCellClick?: () => void;
    onCheckboxChange?: (checked: boolean) => void;
    onNewsClick?: () => void;
}
declare const TableCell: import("react").NamedExoticComponent<TableCellProps>;
export default TableCell;
