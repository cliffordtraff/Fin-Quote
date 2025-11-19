import React from 'react';
import { WatchlistTab } from '@watchlist/types';
interface TabManagerProps {
    tabs: WatchlistTab[];
    activeTabIndex: number;
    onTabsChange: (tabs: WatchlistTab[]) => void;
    onActiveTabChange: (index: number) => void;
    isWatchlistModeActive?: boolean;
    onTabReorderModeChange?: (isActive: boolean) => void;
    userHeader?: React.ReactNode;
}
export default function TabManager({ tabs, activeTabIndex, onTabsChange, onActiveTabChange, isWatchlistModeActive, onTabReorderModeChange, userHeader, }: TabManagerProps): import("react/jsx-runtime").JSX.Element;
export {};
