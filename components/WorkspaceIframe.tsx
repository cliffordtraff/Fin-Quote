'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTheme } from './ThemeProvider'

type WorkspaceMode = 'price' | 'fundamentals' | 'overview'
type ThemeMode = 'light' | 'dark'

const DEFAULT_SYMBOL = 'AAPL'
const PM_VERSION = 1

function getWorkspaceMode(pathname: string | null): WorkspaceMode | null {
  if (!pathname) return null
  if (pathname.startsWith('/workspace/fundamentals')) return 'fundamentals'
  if (pathname.startsWith('/workspace/overview')) return 'overview'
  if (pathname.startsWith('/workspace/chart')) return 'price'
  return null
}

function normalizeSymbol(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toUpperCase() : DEFAULT_SYMBOL
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

export default function WorkspaceIframe() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { theme } = useTheme()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const lastSyncedRef = useRef<{ mode: WorkspaceMode | null; symbol: string | null; theme: ThemeMode | null }>({
    mode: null,
    symbol: null,
    theme: null,
  })
  const hasMountedFrameRef = useRef(false)
  const wasVisibleRef = useRef(false)
  const forceResyncRef = useRef(false)
  const [iframeSrc, setIframeSrc] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [navOffset, setNavOffset] = useState(0)

  const workspaceMode = getWorkspaceMode(pathname)
  const isWorkspaceRoute = workspaceMode !== null
  const requestedTheme: ThemeMode = theme === 'dark' ? 'dark' : 'light'
  const requestedSymbol = normalizeSymbol(searchParams.get('symbol'))
  const chartingUrl = process.env.NEXT_PUBLIC_CHARTING_URL?.trim() || ''
  const chartingOrigin = useMemo(() => getOrigin(chartingUrl), [chartingUrl])
  const desiredSrc = useMemo(() => {
    if (!chartingUrl || !workspaceMode) return null
    return buildIframeSrc(chartingUrl, requestedSymbol, workspaceMode, requestedTheme)
  }, [chartingUrl, requestedSymbol, requestedTheme, workspaceMode])

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
    if (!chartingOrigin) return

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== chartingOrigin) return
      if (!event.data || typeof event.data !== 'object') return

      const message = event.data as Record<string, unknown>
      if (message.v !== PM_VERSION || message.type !== 'READY') return
      setIsReady(true)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [chartingOrigin])

  useEffect(() => {
    if (!isWorkspaceRoute || !workspaceMode || !desiredSrc) return

    if (!iframeSrc) {
      hasMountedFrameRef.current = true
      lastSyncedRef.current = {
        mode: workspaceMode,
        symbol: requestedSymbol,
        theme: requestedTheme,
      }
      setIsReady(false)
      setIframeSrc(desiredSrc)
      return
    }

    if (!isReady && iframeSrc !== desiredSrc) {
      lastSyncedRef.current = {
        mode: workspaceMode,
        symbol: requestedSymbol,
        theme: requestedTheme,
      }
      setIsReady(false)
      setIframeSrc(desiredSrc)
    }
  }, [desiredSrc, iframeSrc, isReady, isWorkspaceRoute, requestedSymbol, requestedTheme, workspaceMode])

  useEffect(() => {
    const becameVisible = isWorkspaceRoute && !wasVisibleRef.current
    wasVisibleRef.current = isWorkspaceRoute

    if (becameVisible && hasMountedFrameRef.current && iframeSrc) {
      forceResyncRef.current = true
    }
  }, [iframeSrc, isWorkspaceRoute])

  useEffect(() => {
    if (!isWorkspaceRoute || !workspaceMode || !isReady || !chartingOrigin) return

    const iframeWindow = iframeRef.current?.contentWindow
    if (!iframeWindow) return

    const lastSynced = lastSyncedRef.current
    const forceResync = forceResyncRef.current

    if (forceResync || lastSynced.mode !== workspaceMode) {
      iframeWindow.postMessage({
        v: PM_VERSION,
        type: 'SET_WORKSPACE_MODE',
        payload: { mode: workspaceMode },
      }, chartingOrigin)
      lastSynced.mode = workspaceMode
    }

    if (lastSynced.symbol !== requestedSymbol) {
      iframeWindow.postMessage({
        v: PM_VERSION,
        type: 'SET_SYMBOL',
        payload: { symbolId: requestedSymbol },
      }, chartingOrigin)
      lastSynced.symbol = requestedSymbol
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
  }, [chartingOrigin, isReady, isWorkspaceRoute, requestedSymbol, requestedTheme, workspaceMode])

  if (!isWorkspaceRoute && !iframeSrc) {
    return null
  }

  return (
    <div
      data-testid="workspace-iframe-shell"
      className="fixed left-0 right-0 bottom-0 bg-cream-100 dark:bg-gray-900"
      style={{
        top: navOffset,
        zIndex: 10,
        display: isWorkspaceRoute ? 'block' : 'none',
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
    </div>
  )
}
