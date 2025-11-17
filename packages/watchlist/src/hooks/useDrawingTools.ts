import { useState, useCallback, useRef, useEffect } from 'react'
import { IChartApi, ISeriesApi, SeriesType, MouseEventParams, Time } from 'lightweight-charts'
import { TrendLine } from '@watchlist/components/TradingView/plugins/trend-line'

export type DrawingTool = 'none' | 'trendline'

interface DrawingPoint {
  time: Time
  price: number
}

export function useDrawingTools(
  chartRef: React.RefObject<IChartApi | null>,
  seriesRef: React.RefObject<ISeriesApi<SeriesType> | null>,
  externalTool?: DrawingTool
) {
  const [activeTool, setActiveTool] = useState<DrawingTool>('none')
  const activeToolRef = useRef<DrawingTool>('none')
  const isDrawingRef = useRef<boolean>(false)
  const firstPoint = useRef<DrawingPoint | null>(null)
  const trendLines = useRef<TrendLine[]>([])

  // Sync with external tool prop
  useEffect(() => {
    if (externalTool !== undefined) {
      setActiveTool(externalTool)
      activeToolRef.current = externalTool
      if (externalTool === 'none') {
        isDrawingRef.current = false
        firstPoint.current = null
      }
    }
  }, [externalTool])

  const startDrawing = useCallback((tool: DrawingTool) => {
    setActiveTool(tool)
    activeToolRef.current = tool
    isDrawingRef.current = false
    firstPoint.current = null
  }, [])

  const stopDrawing = useCallback(() => {
    setActiveTool('none')
    activeToolRef.current = 'none'
    isDrawingRef.current = false
    firstPoint.current = null
  }, [])

  const handleChartClick = useCallback((param: MouseEventParams) => {
    if (activeToolRef.current === 'none' || !chartRef.current || !seriesRef.current) return

    // Get price and time from click
    const price = seriesRef.current.coordinateToPrice(param.point?.y ?? 0)
    const time = param.time

    if (!price || !time) return

    if (activeToolRef.current === 'trendline') {
      if (!isDrawingRef.current) {
        // First point
        firstPoint.current = { time, price }
        isDrawingRef.current = true
      } else {
        // Second point - create the trend line
        if (firstPoint.current) {
          const trendLine = new TrendLine(
            chartRef.current,
            seriesRef.current,
            firstPoint.current,
            { time, price },
            {
              lineColor: 'rgb(0, 122, 255)',
              width: 2,
              showLabels: true,
              labelBackgroundColor: 'rgba(255, 255, 255, 0.85)',
              labelTextColor: 'rgb(0, 122, 255)',
            }
          )

          // Attach primitive to series
          seriesRef.current.attachPrimitive(trendLine)
          trendLines.current.push(trendLine)

          // Reset drawing state
          isDrawingRef.current = false
          firstPoint.current = null
        }
      }
    }
  }, [chartRef, seriesRef])

  const clearAllDrawings = useCallback(() => {
    if (!seriesRef.current) return

    trendLines.current.forEach(line => {
      seriesRef.current?.detachPrimitive(line)
    })
    trendLines.current = []
  }, [seriesRef])

  return {
    activeTool,
    isDrawing: isDrawingRef.current,
    startDrawing,
    stopDrawing,
    handleChartClick,
    clearAllDrawings,
  }
}