interface DataSourceIndicatorProps {
    source: 'live' | 'cached' | 'mock' | 'error' | 'firestore-cache' | 'stale-cache' | 'mixed';
    lastUpdated?: string | null;
    className?: string;
}
export declare function DataSourceIndicator({ source, lastUpdated, className }: DataSourceIndicatorProps): import("react/jsx-runtime").JSX.Element | null;
export declare function DataSourceBadge({ source }: {
    source: 'live' | 'cached' | 'mock' | 'error' | 'firestore-cache' | 'stale-cache' | 'mixed';
}): import("react/jsx-runtime").JSX.Element | null;
export {};
