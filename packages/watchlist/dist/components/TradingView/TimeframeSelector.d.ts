import { Timeframe } from '@watchlist/types/chart';
interface TimeframeSelectorProps {
    currentTimeframe: Timeframe;
    onChange: (timeframe: Timeframe) => void;
}
/**
 * Timeframe selector component for switching chart intervals
 */
export declare function TimeframeSelector({ currentTimeframe, onChange }: TimeframeSelectorProps): import("react/jsx-runtime").JSX.Element;
export {};
