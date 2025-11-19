interface ColumnWidth {
    [key: string]: number;
}
interface UseColumnResizeOptions {
    persistedWidths?: ColumnWidth | null;
    onWidthsPersist?: (widths: ColumnWidth) => void;
    disableLocalStorage?: boolean;
    persistDebounceMs?: number;
}
export declare function useColumnResize(tableRef: React.RefObject<HTMLTableElement | null>, options?: UseColumnResizeOptions): {
    columnWidths: ColumnWidth;
    handleResizeStart: (e: React.MouseEvent, columnKey: string, columnIndex: number, edge?: "left" | "right") => void;
    handleDoubleClick: (columnKey: string) => void;
    resetWidths: () => void;
    isResizing: boolean;
};
export {};
