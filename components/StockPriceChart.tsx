'use client';

import { useState, useEffect } from 'react';
import TradingViewChart, { PriceRange } from './TradingViewChart';
import { getPrices } from '@/app/actions/prices';

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
  initialRange?: PriceRange;
};

export default function StockPriceChart({
  symbol,
  initialData = [],
  initialRange = '365d',
}: StockPriceChartProps) {
  const [data, setData] = useState<PriceDataPoint[]>(initialData);
  const [selectedRange, setSelectedRange] = useState<PriceRange>(initialRange);
  const [loading, setLoading] = useState(initialData.length === 0);
  const [error, setError] = useState<string | null>(null);

  // Fetch data when range or symbol changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const result = await getPrices({ symbol, range: selectedRange });

      if (result.error) {
        setError(result.error);
        setData([]);
      } else if (result.data) {
        setData(result.data);
      }

      setLoading(false);
    };

    fetchData();
  }, [symbol, selectedRange]);

  const handleRangeChange = (range: PriceRange) => {
    setSelectedRange(range);
  };

  if (error) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => handleRangeChange(selectedRange)}
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
      selectedRange={selectedRange}
      onRangeChange={handleRangeChange}
      loading={loading}
      height={400}
    />
  );
}
