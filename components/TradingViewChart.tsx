'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  CandlestickSeries,
  HistogramSeries,
} from 'lightweight-charts';

export type PriceRange = '7d' | '30d' | '90d' | '365d' | 'ytd' | '3y' | '5y' | '10y' | '20y' | 'max';

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
  selectedRange: PriceRange;
  onRangeChange: (range: PriceRange) => void;
  loading?: boolean;
};

const RANGE_OPTIONS: { value: PriceRange; label: string }[] = [
  { value: '7d', label: '1W' },
  { value: '30d', label: '1M' },
  { value: '90d', label: '3M' },
  { value: '365d', label: '1Y' },
  { value: 'ytd', label: 'YTD' },
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
  { value: '10y', label: '10Y' },
  { value: 'max', label: 'Max' },
];

export default function TradingViewChart({
  data,
  height = 400,
  selectedRange,
  onRangeChange,
  loading = false,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

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

    // Convert date strings to Time format (YYYY-MM-DD for daily data)
    // lightweight-charts expects dates in YYYY-MM-DD format for daily bars
    const candleData: CandlestickData<Time>[] = sortedData.map((d) => {
      // Ensure date is in YYYY-MM-DD format
      const dateStr = d.date;
      // If date includes time, extract just the date part
      const formattedDate = dateStr.includes('T') 
        ? dateStr.split('T')[0] 
        : dateStr.split(' ')[0]; // Handle space-separated dates too
      
      return {
        time: formattedDate as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      };
    });

    const volumeData = sortedData.map((d) => {
      const dateStr = d.date;
      const formattedDate = dateStr.includes('T') 
        ? dateStr.split('T')[0] 
        : dateStr.split(' ')[0];
      
      return {
        time: formattedDate as Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
      };
    });
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
    <div className="w-full">
      {/* Range selector */}
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onRangeChange(option.value)}
            disabled={loading}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedRange === option.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            } ${loading ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Chart container */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-gray-800/50">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full" />
      </div>
    </div>
  );
}
