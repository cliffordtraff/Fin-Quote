import { DeepPartial, ChartOptions } from 'lightweight-charts';

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

export const lightTheme: ChartColorPalette = {
  layout: {
    background: '#ffffff',
    textColor: '#333333',
  },
  grid: {
    vertLines: 'transparent',
    horzLines: 'transparent',
  },
  timeScale: {
    borderColor: '#cccccc',
  },
  candlestick: {
    upColor: '#26a69a',
    downColor: '#ef5350',
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
  },
  indicators: {
    sma20: '#9ca3af', // light gray (gray-400)
    sma50: '#0d47a1', // very dark blue (blue-900)
    sma200: '#dc2626', // red (red-600)
  },
};

export const darkTheme: ChartColorPalette = {
  layout: {
    background: '#0a0a0a',
    textColor: '#e0e0e0',
  },
  grid: {
    vertLines: 'transparent',
    horzLines: 'transparent',
  },
  timeScale: {
    borderColor: '#404040',
  },
  candlestick: {
    upColor: '#26a69a',
    downColor: '#ef5350',
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
  },
  indicators: {
    sma20: '#d1d5db', // lighter gray for dark bg (gray-300)
    sma50: '#0d47a1', // very dark blue for dark bg (blue-900)
    sma200: '#dc2626', // red for dark bg (red-600)
  },
};

export function getChartTheme(isDarkMode: boolean): ChartColorPalette {
  return isDarkMode ? darkTheme : lightTheme;
}
