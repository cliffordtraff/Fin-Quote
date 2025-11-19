import { Timeframe } from '@watchlist/types/chart';
import { DrawingTool } from '@watchlist/hooks/useDrawingTools';
export interface TradingViewChartRef {
    clearAllDrawings: () => void;
}
interface TradingViewChartProps {
    symbol: string;
    timeframe?: Timeframe;
    height?: number;
    showSMA20?: boolean;
    showSMA50?: boolean;
    showSMA200?: boolean;
    drawingTool?: DrawingTool;
    onDrawingComplete?: () => void;
    onClearAll?: () => void;
    onClose?: () => void;
}
/**
 * TradingView Lightweight Charts component
 *
 * Displays candlestick charts with data from FMP API
 */
export declare function TradingViewChart({ symbol, timeframe, height, showSMA20, showSMA50, showSMA200, drawingTool, onDrawingComplete, onClearAll, onClose }: TradingViewChartProps): import("react/jsx-runtime").JSX.Element;
export {};
