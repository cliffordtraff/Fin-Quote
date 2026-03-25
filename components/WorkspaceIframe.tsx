'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  dispatchNativeTickerSearchState,
  NATIVE_TICKER_SEARCH_CLOSE_EVENT,
  NATIVE_TICKER_SEARCH_OPEN_EVENT,
  type NativeTickerSearchCloseDetail,
  type NativeTickerSearchOpenDetail,
} from '@/lib/native-ticker-search'
import { useTheme } from './ThemeProvider'

type WorkspaceMode = 'price' | 'fundamentals' | 'overview'
type ThemeMode = 'light' | 'dark'
type NativeSearchMessageType = 'OPEN_TICKER_SEARCH' | 'SET_TICKER_SEARCH_QUERY'
type EmbedSurfaceMode = 'default' | 'search-only'

const DEFAULT_SYMBOL = 'AAPL'
const PM_VERSION = 1

function getWorkspaceMode(pathname: string | null): WorkspaceMode | null {
  if (!pathname) return null
  if (pathname.startsWith('/workspace/fundamentals')) return 'fundamentals'
  if (pathname.startsWith('/workspace/overview')) return 'overview'
  if (pathname.startsWith('/workspace/chart')) return 'price'
  return null
}

function getStockRouteSymbol(pathname: string | null): string | null {
  if (!pathname) return null
  const match = pathname.match(/^\/stock\/([^/?#]+)/)
  return match ? normalizeSymbol(match[1]) : null
}

function normalizeSymbol(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toUpperCase() : DEFAULT_SYMBOL
}

function normalizeSearchQuery(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toUpperCase() : null
}

function getOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function buildIframeSrc(chartingUrl: string, symbol: string, mode: WorkspaceMode, theme: ThemeMode): string {
  const base = chartingUrl.replace(/\/+$/, '')
  return `${base}/tos/${encodeURIComponent(symbol)}?embed=true&view=${mode}&theme=${theme}`
}

function buildSymbolDestination(
  pathname: string | null,
  searchParams: { toString(): string },
  symbol: string
): string {
  const normalizedSymbol = normalizeSymbol(symbol)

  if (pathname?.startsWith('/workspace/')) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('symbol', normalizedSymbol)
    return `${pathname}?${params.toString()}`
  }

  return `/stock/${encodeURIComponent(normalizedSymbol)}`
}

export default function WorkspaceIframe() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { theme } = useTheme()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const lastSyncedRef = useRef<{ mode: WorkspaceMode | null; symbol: string | null; theme: ThemeMode | null }>({
    mode: null,
    symbol: null,
    theme: null,
  })
  const lastSurfaceModeRef = useRef<EmbedSurfaceMode | null>(null)
  const pendingSearchMessageRef = useRef<{
    type: NativeSearchMessageType
    payload: { mode: 'chart'; query?: string }
  } | null>(null)
  const hasMountedFrameRef = useRef(false)
  const wasVisibleRef = useRef(false)
  const forceResyncRef = useRef(false)
  const [iframeSrc, setIframeSrc] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [navOffset, setNavOffset] = useState(0)
  const [searchOverlayActive, setSearchOverlayActive] = useState(false)

  const workspaceMode = getWorkspaceMode(pathname)
  const isWorkspaceRoute = workspaceMode !== null
  const requestedTheme: ThemeMode = theme === 'dark' ? 'dark' : 'light'
  const routeSymbol = useMemo(() => {
    return normalizeSymbol(searchParams.get('symbol') || getStockRouteSymbol(pathname))
  }, [pathname, searchParams])
  const chartingUrl = process.env.NEXT_PUBLIC_CHARTING_URL?.trim() || ''
  const chartingOrigin = useMemo(() => getOrigin(chartingUrl), [chartingUrl])
  const desiredSrc = useMemo(() => {
    if (!chartingUrl || !workspaceMode) return null
    return buildIframeSrc(chartingUrl, routeSymbol, workspaceMode, requestedTheme)
  }, [chartingUrl, requestedTheme, routeSymbol, workspaceMode])
  const launcherSrc = useMemo(() => {
    if (!chartingUrl) return null
    return buildIframeSrc(chartingUrl, routeSymbol, 'price', requestedTheme)
  }, [chartingUrl, requestedTheme, routeSymbol])
  const isSearchOnlySurface = searchOverlayActive && !isWorkspaceRoute
  const iframeVisible = isWorkspaceRoute || searchOverlayActive
  const activeMode: WorkspaceMode | null = workspaceMode ?? (searchOverlayActive ? 'price' : null)
  const desiredSurfaceMode: EmbedSurfaceMode = isSearchOnlySurface ? 'search-only' : 'default'
  const searchOnlyModalHeight = `min(80vh, calc(100vh - ${navOffset + 32}px))`

  useEffect(() => {
    const measureNav = () => {
      const nav = document.getElementById('app-navigation')
      if (!nav) {
        setNavOffset(0)
        return
      }
      const rect = nav.getBoundingClientRect()
      setNavOffset(Math.max(0, Math.ceil(rect.bottom)))
    }

    measureNav()
    const rafId = window.requestAnimationFrame(measureNav)
    const nav = document.getElementById('app-navigation')
    const resizeObserver = typeof ResizeObserver !== 'undefined' && nav
      ? new ResizeObserver(measureNav)
      : null

    if (nav && resizeObserver) {
      resizeObserver.observe(nav)
    }

    window.addEventListener('resize', measureNav)
    return () => {
      window.cancelAnimationFrame(rafId)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', measureNav)
    }
  }, [pathname])

  useEffect(() => {
    dispatchNativeTickerSearchState({ open: searchOverlayActive })
  }, [searchOverlayActive])

  useEffect(() => {
    lastSurfaceModeRef.current = null
  }, [iframeSrc])

  useEffect(() => {
    if (!chartingUrl) return

    const handleOpenSearch = (event: Event) => {
      const detail = (event as CustomEvent<NativeTickerSearchOpenDetail>).detail
      const query = normalizeSearchQuery(detail?.query)
      const nextMode = workspaceMode ?? 'price'
      const nextSrc = desiredSrc ?? launcherSrc

      pendingSearchMessageRef.current = query
        ? { type: 'SET_TICKER_SEARCH_QUERY', payload: { mode: 'chart', query } }
        : { type: 'OPEN_TICKER_SEARCH', payload: { mode: 'chart' } }

      setSearchOverlayActive(true)

      if (!iframeSrc && nextSrc) {
        hasMountedFrameRef.current = true
        lastSyncedRef.current = {
          mode: nextMode,
          symbol: routeSymbol,
          theme: requestedTheme,
        }
        setIsReady(false)
        setIframeSrc(nextSrc)
      }
    }

    const handleCloseSearch = (event: Event) => {
      const detail = (event as CustomEvent<NativeTickerSearchCloseDetail>).detail
      const iframeWindow = iframeRef.current?.contentWindow
      pendingSearchMessageRef.current = null

      if (iframeWindow && chartingOrigin && isReady) {
        iframeWindow.postMessage({
          v: PM_VERSION,
          type: 'CLOSE_TICKER_SEARCH',
          payload: { reason: detail?.reason ?? 'host' },
        }, chartingOrigin)
      }

      setSearchOverlayActive(false)
    }

    window.addEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpenSearch)
    window.addEventListener(NATIVE_TICKER_SEARCH_CLOSE_EVENT, handleCloseSearch)
    return () => {
      window.removeEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpenSearch)
      window.removeEventListener(NATIVE_TICKER_SEARCH_CLOSE_EVENT, handleCloseSearch)
    }
  }, [chartingOrigin, chartingUrl, desiredSrc, iframeSrc, isReady, launcherSrc, requestedTheme, routeSymbol, workspaceMode])

  useEffect(() => {
    if (!chartingOrigin) return

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== chartingOrigin) return
      if (!event.data || typeof event.data !== 'object') return

      const message = event.data as Record<string, unknown>
      if (message.v !== PM_VERSION || typeof message.type !== 'string') return

      if (message.type === 'READY') {
        setIsReady(true)
        return
      }

      if (message.type === 'TICKER_SELECTED') {
        const payload = message.payload as Record<string, unknown> | undefined
        const symbol = normalizeSearchQuery(typeof payload?.symbol === 'string' ? payload.symbol : undefined)
        pendingSearchMessageRef.current = null
        setSearchOverlayActive(false)
        if (!symbol) return
        router.push(buildSymbolDestination(pathname, searchParams, symbol))
        return
      }

      if (message.type === 'TICKER_SEARCH_CLOSED') {
        pendingSearchMessageRef.current = null
        setSearchOverlayActive(false)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [chartingOrigin, pathname, router, searchParams])

  useEffect(() => {
    if (!isWorkspaceRoute || !workspaceMode || !desiredSrc) return

    if (!iframeSrc) {
      hasMountedFrameRef.current = true
      lastSyncedRef.current = {
        mode: workspaceMode,
        symbol: routeSymbol,
        theme: requestedTheme,
      }
      setIsReady(false)
      setIframeSrc(desiredSrc)
      return
    }

    if (!isReady && iframeSrc !== desiredSrc) {
      lastSyncedRef.current = {
        mode: workspaceMode,
        symbol: routeSymbol,
        theme: requestedTheme,
      }
      setIsReady(false)
      setIframeSrc(desiredSrc)
    }
  }, [desiredSrc, iframeSrc, isReady, isWorkspaceRoute, requestedTheme, routeSymbol, workspaceMode])

  useEffect(() => {
    const becameVisible = iframeVisible && !wasVisibleRef.current
    wasVisibleRef.current = iframeVisible

    if (becameVisible && hasMountedFrameRef.current && iframeSrc) {
      forceResyncRef.current = true
    }
  }, [iframeSrc, iframeVisible])

  useEffect(() => {
    if (!iframeVisible || !activeMode || !isReady || !chartingOrigin) return

    const iframeWindow = iframeRef.current?.contentWindow
    if (!iframeWindow) return

    const lastSynced = lastSyncedRef.current
    const forceResync = forceResyncRef.current

    if (forceResync || lastSynced.mode !== activeMode) {
      iframeWindow.postMessage({
        v: PM_VERSION,
        type: 'SET_WORKSPACE_MODE',
        payload: { mode: activeMode },
      }, chartingOrigin)
      lastSynced.mode = activeMode
    }

    if (lastSynced.symbol !== routeSymbol) {
      iframeWindow.postMessage({
        v: PM_VERSION,
        type: 'SET_SYMBOL',
        payload: { symbolId: routeSymbol },
      }, chartingOrigin)
      lastSynced.symbol = routeSymbol
    }

    if (forceResync || lastSynced.theme !== requestedTheme) {
      iframeWindow.postMessage({
        v: PM_VERSION,
        type: 'SET_THEME',
        payload: { theme: requestedTheme },
      }, chartingOrigin)
      lastSynced.theme = requestedTheme
    }

    forceResyncRef.current = false
  }, [activeMode, chartingOrigin, iframeVisible, isReady, requestedTheme, routeSymbol])

  useEffect(() => {
    if (!chartingOrigin || !isReady) return

    const iframeWindow = iframeRef.current?.contentWindow
    if (!iframeWindow) return

    if (lastSurfaceModeRef.current === desiredSurfaceMode) {
      return
    }

    iframeWindow.postMessage({
      v: PM_VERSION,
      type: 'SET_EMBED_SURFACE_MODE',
      payload: { mode: desiredSurfaceMode },
    }, chartingOrigin)
    lastSurfaceModeRef.current = desiredSurfaceMode
  }, [chartingOrigin, desiredSurfaceMode, isReady])

  useEffect(() => {
    if (!chartingOrigin || !isReady || !searchOverlayActive) return

    const pendingMessage = pendingSearchMessageRef.current
    const iframeWindow = iframeRef.current?.contentWindow
    if (!pendingMessage || !iframeWindow) return

    iframeWindow.postMessage({
      v: PM_VERSION,
      type: pendingMessage.type,
      payload: pendingMessage.payload,
    }, chartingOrigin)
    pendingSearchMessageRef.current = null
  }, [chartingOrigin, isReady, searchOverlayActive])

  if (!iframeVisible && !iframeSrc) {
    return null
  }

  return (
    <div
      data-testid="workspace-iframe-shell"
      className={`fixed left-0 right-0 bottom-0 ${isSearchOnlySurface ? 'bg-transparent' : 'bg-cream-100 dark:bg-gray-900'}`}
      style={{
        top: navOffset,
        zIndex: searchOverlayActive && !isWorkspaceRoute ? 40 : 10,
        display: iframeVisible ? 'block' : 'none',
      }}
    >
      {!chartingUrl ? (
        <div
          data-testid="workspace-iframe-error"
          className="flex h-full items-center justify-center px-6 text-sm text-gray-600 dark:text-gray-300"
        >
          NEXT_PUBLIC_CHARTING_URL is not configured.
        </div>
      ) : (
        <>
          {isSearchOnlySurface && searchOverlayActive ? (
            <>
              <button
                type="button"
                data-testid="workspace-iframe-search-backdrop"
                aria-label="Close ticker search"
                onClick={() => {
                  const iframeWindow = iframeRef.current?.contentWindow
                  pendingSearchMessageRef.current = null

                  if (iframeWindow && chartingOrigin && isReady) {
                    iframeWindow.postMessage({
                      v: PM_VERSION,
                      type: 'CLOSE_TICKER_SEARCH',
                      payload: { reason: 'host' },
                    }, chartingOrigin)
                  }

                  setSearchOverlayActive(false)
                }}
                className="absolute inset-0 bg-transparent"
              />
              {iframeSrc ? (
                <div
                  className="absolute left-1/2 top-6 -translate-x-1/2 overflow-hidden rounded-[10px] shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
                  style={{
                    width: 'min(820px, calc(100vw - 32px))',
                    height: searchOnlyModalHeight,
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    title="Workspace charting"
                    src={iframeSrc}
                    className="h-full w-full border-0 bg-transparent"
                    allow="clipboard-write"
                    style={{ opacity: isReady ? 1 : 0, transition: 'opacity 150ms ease' }}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              {!isReady && (
                <div
                  data-testid="workspace-iframe-loading"
                  className="absolute inset-0 flex items-center justify-center bg-cream-100 dark:bg-gray-900"
                >
                  <div className="flex items-center gap-3 rounded-xl border border-sage-500/20 bg-white/80 px-4 py-3 text-sm text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-sage-500 border-t-transparent" />
                    Loading workspace...
                  </div>
                </div>
              )}
              {iframeSrc ? (
                <iframe
                  ref={iframeRef}
                  title="Workspace charting"
                  src={iframeSrc}
                  className="h-full w-full border-0 bg-cream-100 dark:bg-gray-900"
                  allow="clipboard-write"
                  style={{ opacity: isReady ? 1 : 0, transition: 'opacity 150ms ease' }}
                />
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  )
}
