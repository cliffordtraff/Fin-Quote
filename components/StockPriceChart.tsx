'use client';

import { useState, useEffect } from 'react';
import TradingViewChart, { Timeframe } from './TradingViewChart';
import { getPricesByTimeframe } from '@/app/actions/prices';

type PriceDataPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type StockPriceChartProps = {
  symbol: string;
  initialData?: PriceDataPoint[];
  initialTimeframe?: Timeframe;
};

export default function StockPriceChart({
  symbol,
  initialData = [],
  initialTimeframe = '1d',
}: StockPriceChartProps) {
  const [data, setData] = useState<PriceDataPoint[]>(initialData);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>(initialTimeframe);
  const [loading, setLoading] = useState(initialData.length === 0);
  const [error, setError] = useState<string | null>(null);

  // Fetch data when timeframe or symbol changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const result = await getPricesByTimeframe({ symbol, timeframe: selectedTimeframe });

      if (result.error) {
        setError(result.error);
        setData([]);
      } else if (result.data) {
        setData(result.data);
      }

      setLoading(false);
    };

    fetchData();
  }, [symbol, selectedTimeframe]);

  const handleTimeframeChange = (timeframe: Timeframe) => {
    setSelectedTimeframe(timeframe);
  };

  if (error) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => handleTimeframeChange(selectedTimeframe)}
            className="mt-2 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <TradingViewChart
      data={data}
      selectedTimeframe={selectedTimeframe}
      onTimeframeChange={handleTimeframeChange}
      loading={loading}
      height={400}
      symbol={symbol}
    />
  );
}
