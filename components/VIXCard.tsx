'use client'

interface VIXData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  dayLow: number
  dayHigh: number
  yearHigh: number
  yearLow: number
  history: Array<{ date: string; close: number }>
}

interface VIXCardProps {
  vix: VIXData | null
}

export default function VIXCard({ vix }: VIXCardProps) {
  if (!vix) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] p-4" style={{ width: '150px' }}>
        <div className="text-center text-gray-500 dark:text-gray-400 text-xs">
          Loading VIX...
        </div>
      </div>
    )
  }

  // Generate sparkline path
  const generateSparklinePath = () => {
    if (!vix.history || vix.history.length === 0) return ''

    const width = 118 // 150 - 2*16 padding
    const height = 40
    const data = vix.history

    const maxValue = Math.max(...data.map(d => d.close))
    const minValue = Math.min(...data.map(d => d.close))
    const range = maxValue - minValue || 1

    const points = data.map((point, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((point.close - minValue) / range) * height
      return `${x},${y}`
    })

    return `M ${points.join(' L ')}`
  }

  const sparklinePath = generateSparklinePath()
  const hasHistory = vix.history && vix.history.length > 0

  // VIX interpretation:
  // Below 12: Very Low volatility
  // 12-20: Normal/Low volatility
  // 20-30: Elevated volatility
  // 30-50: High volatility (fear)
  // Above 50: Extreme fear/panic

  const getVIXStatus = (price: number) => {
    if (price < 12) return { label: 'Very Low', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900' }
    if (price < 20) return { label: 'Low', color: 'text-green-500 dark:text-green-500', bg: 'bg-green-50 dark:bg-green-900/50' }
    if (price < 30) return { label: 'Elevated', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900' }
    if (price < 50) return { label: 'High', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900' }
    return { label: 'Extreme', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900' }
  }

  const status = getVIXStatus(vix.price)
  const isNegative = vix.change < 0

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] p-4 self-start" style={{ width: '150px' }}>
      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
        VIX
      </div>

      <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        {vix.price.toFixed(2)}
      </div>

      <div className={`text-xs font-semibold mb-2 ${isNegative ? 'text-green-500' : 'text-red-500'}`}>
        {isNegative ? '' : '+'}{vix.change.toFixed(2)} ({isNegative ? '' : '+'}{vix.changesPercentage.toFixed(2)}%)
      </div>

      <div className={`${status.bg} ${status.color} text-xs font-bold py-1 px-2 rounded text-center mb-3`}>
        {status.label}
      </div>

      {/* Sparkline Chart */}
      {hasHistory && (
        <div className="mb-2">
          <svg width="118" height="40" className="w-full">
            <path
              d={sparklinePath}
              fill="none"
              stroke={status.color.includes('green') ? '#10b981' : status.color.includes('red') ? '#ef4444' : '#f59e0b'}
              strokeWidth="1.5"
            />
          </svg>
          <div className="text-[9px] text-gray-500 dark:text-gray-400 text-center">
            30-day trend
          </div>
        </div>
      )}

      <div className="text-[10px] text-gray-500 dark:text-gray-400">
        Range: {vix.dayLow.toFixed(2)} - {vix.dayHigh.toFixed(2)}
      </div>
    </div>
  )
}
