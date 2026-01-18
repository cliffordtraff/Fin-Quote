'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  CandlestickSeries,
  HistogramSeries,
} from 'lightweight-charts';

export type Timeframe = '1h' | '4h' | '1d' | '1w' | '1m';

type PriceDataPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type TradingViewChartProps = {
  data: PriceDataPoint[];
  height?: number;
  selectedTimeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
  loading?: boolean;
  symbol?: string;
};

const TIMEFRAME_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: 'D' },
  { value: '1w', label: 'W' },
  { value: '1m', label: 'M' },
];

export default function TradingViewChart({
  data,
  height = 400,
  selectedTimeframe,
  onTimeframeChange,
  loading = false,
  symbol = '',
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Prevent body scroll when fullscreen
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  // Resize chart when entering/exiting fullscreen
  useEffect(() => {
    if (!chartRef.current || !chartContainerRef.current) return;

    // Use requestAnimationFrame to ensure DOM has updated
    const resizeChart = () => {
      if (chartRef.current && chartContainerRef.current) {
        const newWidth = isFullscreen ? window.innerWidth : chartContainerRef.current.clientWidth;
        const newHeight = isFullscreen ? window.innerHeight : height;

        // Only resize if we have valid dimensions
        if (newWidth > 0) {
          chartRef.current.applyOptions({
            width: newWidth,
            height: newHeight,
          });
          chartRef.current.timeScale().fitContent();
        }
      }
    };

    // Initial resize after a short delay for DOM to settle
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(resizeChart);
    }, 50);

    // Also resize after a longer delay as backup
    const backupTimeoutId = setTimeout(() => {
      requestAnimationFrame(resizeChart);
    }, 200);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(backupTimeoutId);
    };
  }, [isFullscreen, height]);

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: isDarkMode ? 'rgb(45,45,45)' : '#ffffff' },
        textColor: isDarkMode ? '#d1d5db' : '#374151',
      },
      grid: {
        vertLines: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
        horzLines: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
      },
      crosshair: {
        mode: 1, // Magnet mode
      },
      rightPriceScale: {
        borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
      },
      timeScale: {
        borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add candlestick series (v5 API)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // Add volume series (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#60a5fa',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
    });

    // Configure volume to be at the bottom with smaller height
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height, isDarkMode]);

  // Update data when it changes
  useEffect(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current || !data.length) {
      return;
    }

    // Convert data to lightweight-charts format
    // Data comes sorted most recent first, we need oldest first
    const sortedData = [...data].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Detect if this is intraday data (contains time component with hour != 00:00)
    const isIntradayData = sortedData.some((d) => {
      const dateStr = d.date;
      if (dateStr.includes(' ')) {
        const timePart = dateStr.split(' ')[1];
        return timePart && timePart !== '00:00:00';
      }
      if (dateStr.includes('T')) {
        const timePart = dateStr.split('T')[1];
        return timePart && !timePart.startsWith('00:00');
      }
      return false;
    });

    // For intraday data, use Unix timestamps; for daily data, use YYYY-MM-DD strings
    const getTimeValue = (dateStr: string): Time => {
      if (isIntradayData) {
        // Use Unix timestamp (seconds) for intraday data
        return Math.floor(new Date(dateStr).getTime() / 1000) as Time;
      } else {
        // Use YYYY-MM-DD format for daily/weekly/monthly data
        const formattedDate = dateStr.includes('T')
          ? dateStr.split('T')[0]
          : dateStr.split(' ')[0];
        return formattedDate as Time;
      }
    };

    // Deduplicate by time to avoid duplicate timestamp errors
    const seenTimes = new Set<string | number>();
    const uniqueData = sortedData.filter((d) => {
      const timeValue = getTimeValue(d.date);
      const key = String(timeValue);
      if (seenTimes.has(key)) return false;
      seenTimes.add(key);
      return true;
    });

    const candleData: CandlestickData<Time>[] = uniqueData.map((d) => ({
      time: getTimeValue(d.date),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const volumeData = uniqueData.map((d) => ({
      time: getTimeValue(d.date),
      value: d.volume,
      color: d.close >= d.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
    }));

    candlestickSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Fit content to view
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  // Update chart colors when theme changes
  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.applyOptions({
      layout: {
        background: { color: isDarkMode ? 'rgb(45,45,45)' : '#ffffff' },
        textColor: isDarkMode ? '#d1d5db' : '#374151',
      },
      grid: {
        vertLines: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
        horzLines: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
      },
      rightPriceScale: {
        borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
      },
      timeScale: {
        borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
      },
    });
  }, [isDarkMode]);

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 overflow-hidden flex flex-col' : 'w-full'}>
      {/* Header with timeframe selector and fullscreen button */}
      <div className={`flex flex-wrap items-center justify-between gap-2 ${isFullscreen ? 'absolute top-2 left-2 right-2 z-10' : 'mb-4'}`}>
        <div className="flex flex-wrap gap-2">
          {TIMEFRAME_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onTimeframeChange(option.value)}
              disabled={loading}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                selectedTimeframe === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              } ${loading ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Fullscreen button */}
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="flex items-center justify-center rounded-md p-2 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>
      </div>

      {/* Chart container */}
      <div className={`relative ${isFullscreen ? 'w-full h-full' : ''}`}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-gray-800/50">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          </div>
        )}
        <div
          ref={chartContainerRef}
          className="w-full"
          style={isFullscreen ? { width: '100vw', height: '100vh' } : undefined}
        />
      </div>
    </div>
  );
}
