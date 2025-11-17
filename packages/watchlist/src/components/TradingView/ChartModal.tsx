'use client'

import { useEffect, useState, useRef } from 'react'
import { TradingViewChart } from './TradingViewChart'
import { TimeframeSelector } from './TimeframeSelector'
import { Timeframe } from '@watchlist/types/chart'
import { DrawingTool } from '@watchlist/hooks/useDrawingTools'

interface ChartModalProps {
  symbol: string | null
  timeframe?: Timeframe
  isOpen: boolean
  onClose: () => void
}

/**
 * Modal wrapper for TradingView Lightweight Charts
 *
 * Displays chart in a centered modal overlay
 */
export function ChartModal({
  symbol,
  timeframe: initialTimeframe = '1d',
  isOpen,
  onClose
}: ChartModalProps) {
  const [currentTimeframe, setCurrentTimeframe] = useState<Timeframe>(initialTimeframe)
  const [showSMA20, setShowSMA20] = useState(false)
  const [showSMA50, setShowSMA50] = useState(false)
  const [showSMA200, setShowSMA200] = useState(false)
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // Reset timeframe when modal opens with new symbol
  useEffect(() => {
    if (isOpen) {
      setCurrentTimeframe(initialTimeframe)
    }
  }, [isOpen, initialTimeframe])

  // Handle fullscreen toggle
  const toggleFullscreen = async () => {
    if (!modalRef.current) return

    try {
      if (!document.fullscreenElement) {
        await modalRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (error) {
      console.error('Fullscreen error:', error)
    }
  }

  // Listen for fullscreen changes (e.g., user presses ESC)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen || !symbol) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-opacity-70"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className={`bg-white dark:bg-[#0a0a0a] rounded-lg shadow-2xl overflow-hidden border border-gray-300 dark:border-gray-700 ${
          isFullscreen
            ? 'w-full h-full max-w-none max-h-none rounded-none'
            : 'w-[90vw] max-w-[1800px] max-h-[90vh]'
        }`}
        onClick={(e) => e.stopPropagation()} // Prevent close when clicking inside modal
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0a0a0a]">
          <div className="flex items-center gap-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{symbol}</h2>
            <TimeframeSelector
              currentTimeframe={currentTimeframe}
              onChange={setCurrentTimeframe}
            />

            {/* Indicators inline */}
            <div className="flex items-center gap-4 ml-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative mt-1">
                  <input
                    type="checkbox"
                    checked={showSMA20}
                    onChange={(e) => setShowSMA20(e.target.checked)}
                    className="appearance-none w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-500 bg-white dark:bg-black checked:bg-gray-400 checked:border-gray-400 focus:ring-2 focus:ring-gray-400 cursor-pointer"
                  />
                  {showSMA20 && (
                    <svg className="absolute top-0 left-0 w-4 h-4 pointer-events-none" viewBox="0 0 16 16" fill="none">
                      <path d="M12 5L6.5 10.5L4 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                  20 SMA
                  <span className="inline-block w-6 h-0.5 bg-gray-400"></span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative mt-1">
                  <input
                    type="checkbox"
                    checked={showSMA50}
                    onChange={(e) => setShowSMA50(e.target.checked)}
                    className="appearance-none w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-500 bg-white dark:bg-black checked:bg-blue-600 checked:border-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  {showSMA50 && (
                    <svg className="absolute top-0 left-0 w-4 h-4 pointer-events-none" viewBox="0 0 16 16" fill="none">
                      <path d="M12 5L6.5 10.5L4 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                  50 SMA
                  <span className="inline-block w-6 h-0.5 bg-blue-600"></span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative mt-1">
                  <input
                    type="checkbox"
                    checked={showSMA200}
                    onChange={(e) => setShowSMA200(e.target.checked)}
                    className="appearance-none w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-500 bg-white dark:bg-black checked:bg-red-600 checked:border-red-600 focus:ring-2 focus:ring-red-500 cursor-pointer"
                  />
                  {showSMA200 && (
                    <svg className="absolute top-0 left-0 w-4 h-4 pointer-events-none" viewBox="0 0 16 16" fill="none">
                      <path d="M12 5L6.5 10.5L4 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                  200 SMA
                  <span className="inline-block w-6 h-0.5 bg-red-600"></span>
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-900 border border-gray-300 dark:border-gray-700"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
              )}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-900 border border-gray-300 dark:border-gray-700"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Chart Content */}
        <div className={`p-4 pb-6 bg-white dark:bg-[#0a0a0a] ${isFullscreen ? 'h-[calc(100vh-80px)]' : ''}`}>
          <TradingViewChart
            symbol={symbol}
            timeframe={currentTimeframe}
            height={isFullscreen ? typeof window !== 'undefined' ? window.innerHeight - 140 : 700 : 700}
            showSMA20={showSMA20}
            showSMA50={showSMA50}
            showSMA200={showSMA200}
            drawingTool={drawingTool}
            onDrawingComplete={() => setDrawingTool('none')}
            onClearAll={() => {}}
            onClose={onClose}
          />
          <div className="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">
            Charts provided by TradingView Lightweight Charts Library
          </div>
        </div>
      </div>
    </div>
  )
}