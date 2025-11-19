export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';
export interface CandlestickData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}
export interface ChartDataResponse {
    symbol: string;
    timeframe: Timeframe;
    data: CandlestickData[];
    cached: boolean;
    cacheExpiry?: string;
    error?: string;
}
export interface ChartConfig {
    symbol: string;
    timeframe: Timeframe;
    height?: number;
    showVolume?: boolean;
    showGrid?: boolean;
    theme?: 'light' | 'dark';
}
export interface FMPCandleData {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
