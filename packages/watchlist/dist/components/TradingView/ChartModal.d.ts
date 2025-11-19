import { Timeframe } from '@watchlist/types/chart';
interface ChartModalProps {
    symbol: string | null;
    timeframe?: Timeframe;
    isOpen: boolean;
    onClose: () => void;
}
/**
 * Modal wrapper for TradingView Lightweight Charts
 *
 * Displays chart in a centered modal overlay
 */
export declare function ChartModal({ symbol, timeframe: initialTimeframe, isOpen, onClose }: ChartModalProps): import("react/jsx-runtime").JSX.Element | null;
export {};
