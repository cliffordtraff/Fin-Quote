'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { updateDashboardChartOfTheDayChartSpec } from '@/app/actions/dashboard-chart-of-the-day'
import Navigation from '@/components/Navigation'
import { useTheme } from '@/components/ThemeProvider'
import {
  parseDashboardChartOfTheDayEditorSpecFromFundState,
  resolveDashboardChartOfTheDayEditorPath,
  replaceDashboardChartOfTheDayEditorPathTheme,
} from '@/lib/dashboard/chart-of-the-day-editor'
import type { ChartExportSpec } from '@/types/chart-export'

const PM_VERSION = 1

interface AdminChartOfTheDayEditorProps {
  initialSpec: ChartExportSpec
}

function resolveEditorTheme(theme: string): 'light' | 'dark' {
  return theme === 'dark' ? 'dark' : 'light'
}

export default function AdminChartOfTheDayEditor({
  initialSpec,
}: AdminChartOfTheDayEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const { theme } = useTheme()
  const editorTheme = resolveEditorTheme(theme)
  const [savedSpec, setSavedSpec] = useState(initialSpec)
  const [iframeSrc, setIframeSrc] = useState(() =>
    resolveDashboardChartOfTheDayEditorPath(initialSpec, 'light'),
  )
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaveTransition] = useTransition()

  // Ref to hold a pending resolve callback for the FUND_STATE response
  const fundStateResolveRef = useRef<((result: {
    fundState: Record<string, unknown> | null
    symbol: string
  } | null) => void) | null>(null)

  useEffect(() => {
    setIframeSrc((current) => {
      const next = replaceDashboardChartOfTheDayEditorPathTheme(
        current || resolveDashboardChartOfTheDayEditorPath(savedSpec, editorTheme),
        editorTheme,
      )
      return current === next ? current : next
    })
  }, [editorTheme, savedSpec])

  useEffect(() => {
    setStatus('loading')
  }, [iframeSrc])

  // Listen for FUND_STATE responses from the charting platform
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const iframeWindow = iframeRef.current?.contentWindow
      const expectedOrigin = new URL(iframeSrc, window.location.href).origin
      if (event.source !== iframeWindow || event.origin !== expectedOrigin) return

      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.v !== PM_VERSION || data.type !== 'FUND_STATE') return

      const resolve = fundStateResolveRef.current
      if (resolve) {
        fundStateResolveRef.current = null
        const payload = data.payload as Record<string, unknown> | undefined
        resolve(
          payload
            ? {
                fundState: (payload.fundState as Record<string, unknown> | null) ?? null,
                symbol: typeof payload.symbol === 'string' ? payload.symbol : '',
              }
            : null,
        )
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [iframeSrc])

  const requestFundState = useCallback((): Promise<{
    fundState: Record<string, unknown> | null
    symbol: string
  } | null> => {
    return new Promise((resolve) => {
      const iframeWindow = iframeRef.current?.contentWindow
      if (!iframeWindow) {
        resolve(null)
        return
      }

      fundStateResolveRef.current = resolve
      const targetOrigin = new URL(iframeSrc, window.location.href).origin

      // Send GET_FUND_STATE to the charting platform
      iframeWindow.postMessage(
        { v: PM_VERSION, type: 'GET_FUND_STATE', payload: {} },
        targetOrigin,
      )

      // Timeout after 3 seconds
      setTimeout(() => {
        if (fundStateResolveRef.current === resolve) {
          fundStateResolveRef.current = null
          resolve(null)
        }
      }, 3000)
    })
  }, [iframeSrc])

  const handleReloadSavedChart = () => {
    setNotice(null)
    setError(null)
    setIframeSrc(resolveDashboardChartOfTheDayEditorPath(savedSpec, editorTheme))
  }

  const handlePublish = () => {
    setNotice(null)
    setError(null)

    startSaveTransition(async () => {
      const result = await requestFundState()
      if (!result || !result.fundState) {
        setError(
          'Could not read the chart state. Make sure you are on the Fundamentals view and the chart has finished loading.',
        )
        return
      }

      const nextSpec = parseDashboardChartOfTheDayEditorSpecFromFundState(
        result.fundState,
        result.symbol,
        savedSpec,
      )
      if (!nextSpec) {
        setError(
          'Could not parse the chart configuration. Make sure at least one metric is selected.',
        )
        return
      }

      const saveResult = await updateDashboardChartOfTheDayChartSpec(nextSpec)
      if (!saveResult.success) {
        setError(saveResult.error ?? 'Failed to update chart of the day')
        return
      }

      setSavedSpec(nextSpec)
      setNotice('Dashboard chart of the day updated.')
    })
  }

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900">
      <Navigation />

      <main className="mx-auto flex max-w-[1600px] flex-col gap-4 px-6 py-8">
        <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Chart of the Day Editor</p>
              <p className="mt-1 text-blue-700 dark:text-blue-200/80">
                Build the chart in the frame below, then publish it to the dashboard.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleReloadSavedChart}
                disabled={isSaving}
                className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-1.5 font-medium text-blue-900 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100 dark:hover:bg-blue-900/40"
              >
                Reload Saved Chart
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={isSaving || status !== 'ready'}
                className="inline-flex items-center rounded-lg bg-sage-600 px-3 py-1.5 font-medium text-white transition hover:bg-sage-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Saving...' : 'Set as Chart of the Day'}
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-1.5 font-medium text-blue-900 transition hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100 dark:hover:bg-blue-900/40"
              >
                View Dashboard
              </Link>
            </div>
          </div>

          {(notice || error || status !== 'ready') && (
            <div className="flex flex-col gap-2">
              {notice && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                  {notice}
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                  {error}
                </div>
              )}
              {!notice && !error && status !== 'ready' && (
                <div className="rounded-lg border border-blue-200/80 bg-white/70 px-3 py-2 text-blue-800 dark:border-blue-900/40 dark:bg-slate-900/40 dark:text-blue-100/90">
                  Loading fundamentals editor...
                </div>
              )}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-cream-300 bg-cream-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
            <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Fundamentals Surface
            </h1>
          </div>

          <div className="relative min-h-[900px] bg-white dark:bg-gray-900">
            <iframe
              key={iframeSrc}
              ref={iframeRef}
              src={iframeSrc}
              title="Chart of the Day editor"
              loading="eager"
              allow="fullscreen"
              onLoad={() => setStatus('ready')}
              className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-150 ${
                status === 'ready' ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {status === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Loading charting platform...
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
