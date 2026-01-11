/**
 * Mini Chart Icon Component
 * Displays a small chart visualization icon next to financial metrics
 */

interface MiniChartIconProps {
  data?: number[]
  className?: string
}

export default function MiniChartIcon({ data, className = '' }: MiniChartIconProps) {
  // Default data if not provided (creates a generic chart pattern)
  const defaultData = [3, 5, 2, 8, 6, 4, 7]
  const chartData = data || defaultData

  // Normalize data to 0-10 range for consistent visualization
  const max = Math.max(...chartData)
  const min = Math.min(...chartData)
  const range = max - min || 1
  const normalized = chartData.map(val => ((val - min) / range) * 10)

  // Create SVG path for bars
  const barWidth = 2
  const barSpacing = 1
  const totalWidth = chartData.length * (barWidth + barSpacing) - barSpacing

  return (
    <svg
      width="24"
      height="12"
      viewBox={`0 0 ${totalWidth} 10`}
      className={`inline-block ${className}`}
      aria-hidden="true"
    >
      {normalized.map((height, index) => (
        <rect
          key={index}
          x={index * (barWidth + barSpacing)}
          y={10 - height}
          width={barWidth}
          height={height}
          fill="currentColor"
          className="text-blue-500 dark:text-blue-400 opacity-60"
        />
      ))}
    </svg>
  )
}
