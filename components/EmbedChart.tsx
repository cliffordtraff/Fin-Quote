'use client'

import { useState, useEffect } from 'react'

interface EmbedChartProps {
  symbol: string
}

const DEFAULT_CHARTING_URL = 'https://charts.theintraday.com'
const DEFAULT_HOST_ORIGIN = 'https://theintraday.com'
const PAGE_SURFACE_BG = {
  light: '#f5f5f0',
  dark: '#111827',
} as const

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function getDocumentTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') {
    return 'light'
  }

  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export default function EmbedChart({ symbol }: EmbedChartProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('light')
  const [hostOrigin, setHostOrigin] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const checkDarkMode = () => {
      setTheme(getDocumentTheme())
    }

    checkDarkMode()
    setHostOrigin(normalizeOrigin(window.location.origin) || DEFAULT_HOST_ORIGIN)

    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  const chartingBaseUrl = (process.env.NEXT_PUBLIC_CHARTING_URL?.trim() || DEFAULT_CHARTING_URL).replace(/\/+$/, '')
  const surfaceBackground = PAGE_SURFACE_BG[theme]
  const src = hostOrigin
    ? `${chartingBaseUrl}/embed?${new URLSearchParams({
        symbol,
        tf: 'D',
        range: '1y',
        theme,
        toolbar: 'simplified',
        surface: 'page',
        origin: hostOrigin,
      }).toString()}`
    : null

  useEffect(() => {
    setIsLoaded(false)
  }, [src])

  return (
    <div
      className="relative"
      style={{ minHeight: 500, backgroundColor: surfaceBackground }}
    >
      {!isLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: surfaceBackground }}
        >
          <div className="flex items-center gap-3 rounded-xl border border-sage-500/20 bg-white/80 px-4 py-3 text-sm text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-sage-500 border-t-transparent" />
            Loading chart...
          </div>
        </div>
      )}
      {src ? (
        <iframe
          src={src}
          style={{
            width: '100%',
            height: 500,
            border: 'none',
            display: 'block',
            backgroundColor: surfaceBackground,
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 150ms ease',
          }}
          allow="fullscreen"
          loading="eager"
          title={`${symbol} price chart`}
          onLoad={() => setIsLoaded(true)}
        />
      ) : null}
    </div>
  )
}
