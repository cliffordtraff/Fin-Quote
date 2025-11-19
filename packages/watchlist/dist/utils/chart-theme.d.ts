export interface ChartColorPalette {
    layout: {
        background: string;
        textColor: string;
    };
    grid: {
        vertLines: string;
        horzLines: string;
    };
    timeScale: {
        borderColor: string;
    };
    candlestick: {
        upColor: string;
        downColor: string;
        wickUpColor: string;
        wickDownColor: string;
    };
    indicators: {
        sma20: string;
        sma50: string;
        sma200: string;
    };
}
export declare const lightTheme: ChartColorPalette;
export declare const darkTheme: ChartColorPalette;
export declare function getChartTheme(isDarkMode: boolean): ChartColorPalette;
