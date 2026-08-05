'use client'

import { useEffect, useRef, useState } from 'react'

interface EmbedChartProps {
  symbol: string
}

const DEFAULT_CHARTING_URL = 'https://charts.theintraday.com'
const DEFAULT_HOST_ORIGIN = 'https://theintraday.com'
const READY_TIMEOUT_MS = 12_000
const LOCAL_READY_TIMEOUT_MS = 5_000
const PM_VERSION = 1
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('light')
  const [frameTheme, setFrameTheme] = useState<'dark' | 'light'>('light')
  const [hostOrigin, setHostOrigin] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [frameKey, setFrameKey] = useState(0)

  useEffect(() => {
    const checkDarkMode = () => {
      setTheme(getDocumentTheme())
    }

    const initialTheme = getDocumentTheme()
    setTheme(initialTheme)
    setFrameTheme(initialTheme)
    setHostOrigin(normalizeOrigin(window.location.origin) || DEFAULT_HOST_ORIGIN)

    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  const chartingBaseUrl = (process.env.NEXT_PUBLIC_CHARTING_URL?.trim() || DEFAULT_CHARTING_URL).replace(/\/+$/, '')
  const chartingOrigin = normalizeOrigin(chartingBaseUrl)
  const surfaceBackground = PAGE_SURFACE_BG[theme]
  const src = hostOrigin
    ? `${chartingBaseUrl}/embed?${new URLSearchParams({
        symbol,
        tf: 'D',
        range: '1y',
        theme: frameTheme,
        toolbar: 'simplified',
        surface: 'page',
        origin: hostOrigin,
      }).toString()}`
    : null

  useEffect(() => {
    setIsReady(false)
    setLoadError(null)
  }, [src])

  useEffect(() => {
    if (!src || isReady || loadError) return

    const timeoutMs = chartingOrigin?.includes('localhost')
      ? LOCAL_READY_TIMEOUT_MS
      : READY_TIMEOUT_MS
    const timeoutId = window.setTimeout(() => {
      setLoadError('The charting service did not finish loading.')
    }, timeoutMs)

    return () => window.clearTimeout(timeoutId)
  }, [chartingOrigin, frameKey, isReady, loadError, src])

  useEffect(() => {
    if (!chartingOrigin) return

    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin !== chartingOrigin ||
        event.source !== iframeRef.current?.contentWindow ||
        !event.data ||
        typeof event.data !== 'object' ||
        event.data.v !== PM_VERSION
      ) {
        return
      }

      if (event.data.type === 'READY') {
        setIsReady(true)
        setLoadError(null)
      } else if (event.data.type === 'ERROR') {
        const payload = event.data.payload as {
          code?: unknown
          recoverable?: unknown
        } | undefined

        if (payload?.recoverable === true) {
          if (payload.code === 'THEME_CHANGE' && theme !== frameTheme) {
            setIsReady(false)
            setFrameTheme(theme)
          }
          return
        }
        setLoadError('The charting service could not render this symbol.')
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [chartingOrigin, frameTheme, theme])

  useEffect(() => {
    if (!isReady || !chartingOrigin || theme === frameTheme) return
    iframeRef.current?.contentWindow?.postMessage(
      { v: PM_VERSION, type: 'SET_THEME', payload: { theme } },
      chartingOrigin,
    )
  }, [chartingOrigin, frameTheme, isReady, theme])

  const retry = () => {
    setIsReady(false)
    setLoadError(null)
    setFrameTheme(theme)
    setFrameKey((current) => current + 1)
  }

  return (
    <div
      className="relative"
      style={{ minHeight: 500, backgroundColor: surfaceBackground }}
    >
      {!isReady && !loadError && (
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
      {loadError ? (
        <div
          role="alert"
          className="absolute inset-0 z-10 flex items-center justify-center px-6"
          style={{ backgroundColor: surfaceBackground }}
        >
          <div className="max-w-md rounded-2xl border border-red-200 bg-white/95 p-5 text-sm shadow-lg dark:border-red-900/50 dark:bg-gray-800/95">
            <p className="font-semibold text-gray-950 dark:text-white">
              Chart unavailable
            </p>
            <p className="mt-2 text-gray-600 dark:text-gray-300">{loadError}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={retry}
                className="rounded-lg bg-sage-600 px-3 py-2 font-medium text-white hover:bg-sage-700"
              >
                Retry
              </button>
              <a
                href={`${chartingBaseUrl}/tos-full/${encodeURIComponent(symbol)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-gray-200 px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Open chart separately
              </a>
            </div>
          </div>
        </div>
      ) : null}
      {src ? (
        <iframe
          key={frameKey}
          ref={iframeRef}
          src={src}
          style={{
            width: '100%',
            height: 500,
            border: 'none',
            display: 'block',
            backgroundColor: surfaceBackground,
            opacity: isReady ? 1 : 0,
            transition: 'opacity 150ms ease',
          }}
          allow="fullscreen"
          loading="eager"
          title={`${symbol} price chart`}
          onError={() => setLoadError('The browser could not reach the charting service.')}
        />
      ) : null}
    </div>
  )
}
