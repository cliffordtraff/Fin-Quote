'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { updateDashboardChartOfTheDayChartSpec } from '@/app/actions/dashboard-chart-of-the-day'
import Navigation from '@/components/Navigation'
import { useTheme } from '@/components/ThemeProvider'
import {
  parseDashboardChartOfTheDayEditorSpecFromUrl,
  replaceDashboardChartOfTheDayEditorPathTheme,
  resolveDashboardChartOfTheDayEditorPath,
} from '@/lib/dashboard/chart-of-the-day-editor'
import type { ChartExportSpec } from '@/types/chart-export'

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

  const readCurrentEditorUrl = () => {
    const iframeWindow = iframeRef.current?.contentWindow
    if (!iframeWindow) return null

    try {
      const href = iframeWindow.location.href
      return href && href !== 'about:blank' ? href : null
    } catch {
      return null
    }
  }

  useEffect(() => {
    const currentEditorUrl = readCurrentEditorUrl()
    setIframeSrc((current) => {
      const nextEditorPath = currentEditorUrl
        ? replaceDashboardChartOfTheDayEditorPathTheme(currentEditorUrl, editorTheme)
        : replaceDashboardChartOfTheDayEditorPathTheme(
            current || resolveDashboardChartOfTheDayEditorPath(savedSpec, editorTheme),
            editorTheme,
          )

      return current === nextEditorPath ? current : nextEditorPath
    })
  }, [editorTheme, savedSpec])

  useEffect(() => {
    setStatus('loading')
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
      const editorUrl = readCurrentEditorUrl()
      if (!editorUrl) {
        setError('Editor state is unavailable. Wait for the chart to finish loading and try again.')
        return
      }

      const nextSpec = parseDashboardChartOfTheDayEditorSpecFromUrl(editorUrl, savedSpec)
      if (!nextSpec) {
        setError('Unable to read the current fundamentals state from the editor.')
        return
      }

      const result = await updateDashboardChartOfTheDayChartSpec(nextSpec)
      if (!result.success) {
        setError(result.error ?? 'Failed to update chart of the day')
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
              <p className="font-semibold">Chart of the Day editor</p>
              <p className="mt-1 text-blue-700 dark:text-blue-200/80">
                This page now uses the fundamentals charting surface directly. Build the chart in the frame, then publish it to the dashboard.
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
