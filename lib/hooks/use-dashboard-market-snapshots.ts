'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchDashboardMarketSnapshot,
  type DashboardMarketSnapshotPatch,
} from '@/lib/dashboard-market-snapshot'
import type { DashboardSnapshotCaptureTimes } from '@/lib/dashboard-snapshot-provenance'
import type { FastMarketDataSection } from '@/lib/fast-snapshot-types'
import { isValidSnapshotTimestamp } from '@/lib/fast-snapshot-types'
import type { AllMarketData } from '@/lib/market-types'
import { safeErrorMessage } from '@/lib/safe-logging'
import type { SlowMarketDataSection } from '@/lib/slow-snapshot-types'

const FAST_REFRESH_INTERVAL_MS = 60_000

type RefreshOutcome = 'complete' | 'degraded' | 'failed'

interface RefreshOutcomes {
  fast: RefreshOutcome
  slow: RefreshOutcome
}

export interface DashboardSnapshotFreshness {
  fastCapturedAt: string
  slowCapturedAt: string
  globalLoadedAt: string
  fastDegradedSections: FastMarketDataSection[]
  slowDegradedSections: SlowMarketDataSection[]
}

export interface DashboardMarketSnapshotState {
  data: AllMarketData
  freshness: DashboardSnapshotFreshness
  clockAt: string
  refreshing: boolean
  refreshError: string | null
  refreshDashboard: () => Promise<void>
}

function isAbortLike(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'name' in error &&
      ((error as { name?: unknown }).name === 'AbortError' ||
        (error as { name?: unknown }).name === 'TimeoutError'),
  )
}

function classifyResult(
  result: PromiseSettledResult<DashboardMarketSnapshotPatch>,
  accepted: boolean,
): RefreshOutcome {
  if (result.status === 'rejected' || !accepted) {
    return 'failed'
  }
  return classifySnapshot(result.value)
}

function classifySnapshot(
  snapshot: DashboardMarketSnapshotPatch,
): RefreshOutcome {
  if (snapshot.appliedSections.length === 0) return 'failed'
  return snapshot.degradedSections.length > 0 ? 'degraded' : 'complete'
}

function refreshMessage(
  fast: RefreshOutcome,
  slow: RefreshOutcome,
): string | null {
  if (fast === 'complete' && slow === 'complete') return null
  if (fast === 'failed' && slow === 'failed') {
    return 'Market data could not be refreshed.'
  }
  if (fast === 'failed') {
    return slow === 'complete'
      ? 'Slower sections refreshed; live prices remain on their previous snapshot.'
      : 'Some slower sections refreshed; live prices and other sections remain on their previous snapshot.'
  }
  if (slow === 'failed') {
    return fast === 'complete'
      ? 'Core prices refreshed; some slower sections remain on their previous snapshot.'
      : 'Some core prices refreshed; slower and other price sections remain on their previous snapshot.'
  }
  if (fast === 'complete') {
    return 'Core prices refreshed; some slower sections remain on their previous snapshot.'
  }
  if (slow === 'complete') {
    return 'Slower sections refreshed; some price sections remain on their previous snapshot.'
  }
  return 'Refresh completed with some sections kept from the previous snapshot.'
}

function initialTimestamp(value: string, fallback: string): string {
  return isValidSnapshotTimestamp(value) ? value : fallback
}

export function useDashboardMarketSnapshots(
  initialData: AllMarketData,
  initialCaptureTimes: DashboardSnapshotCaptureTimes,
  initialRenderedAt: string,
): DashboardMarketSnapshotState {
  const fallbackAt = useRef(new Date().toISOString()).current
  const initialAt = useRef(
    initialTimestamp(initialRenderedAt, fallbackAt),
  ).current
  const initialFreshness = useRef<DashboardSnapshotCaptureTimes>({
    fastCapturedAt: initialTimestamp(
      initialCaptureTimes.fastCapturedAt,
      initialAt,
    ),
    slowCapturedAt: initialTimestamp(
      initialCaptureTimes.slowCapturedAt,
      initialAt,
    ),
    globalLoadedAt: initialTimestamp(
      initialCaptureTimes.globalLoadedAt,
      initialAt,
    ),
  }).current
  const [data, setData] = useState(initialData)
  const initialSnapshotFreshness = useRef<DashboardSnapshotFreshness>({
    ...initialFreshness,
    fastDegradedSections: [],
    slowDegradedSections: [],
  }).current
  const [freshness, setFreshness] = useState<DashboardSnapshotFreshness>(
    initialSnapshotFreshness,
  )
  const [clockAt, setClockAt] = useState(initialAt)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const mountedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)
  const modeRef = useRef<'idle' | 'auto' | 'manual'>('idle')
  const controllersRef = useRef(new Set<AbortController>())
  const runAutoRef = useRef<(() => void) | null>(null)
  const manualOutcomesRef = useRef<RefreshOutcomes | null>(null)
  const freshnessRef = useRef(initialSnapshotFreshness)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const invalidateActiveWork = useCallback(() => {
    generationRef.current += 1
    clearTimer()
    for (const controller of controllersRef.current) controller.abort()
    controllersRef.current.clear()
    modeRef.current = 'idle'
  }, [clearTimer])

  const commitSnapshot = useCallback(
    (snapshot: DashboardMarketSnapshotPatch) => {
      const currentFreshness = freshnessRef.current
      const currentCapturedAt = snapshot.kind === 'fast'
        ? currentFreshness.fastCapturedAt
        : currentFreshness.slowCapturedAt
      if (snapshot.capturedAt < currentCapturedAt) return false

      if (snapshot.appliedSections.length > 0) {
        setData((current) => ({ ...current, ...snapshot.data }))
      }
      setClockAt(snapshot.receivedAt)

      const nextFreshness = snapshot.kind === 'fast'
        ? {
            ...currentFreshness,
            fastCapturedAt:
              snapshot.appliedSections.length > 0
                ? snapshot.capturedAt
                : currentFreshness.fastCapturedAt,
            fastDegradedSections:
              snapshot.degradedSections as FastMarketDataSection[],
          }
        : {
            ...currentFreshness,
            slowCapturedAt:
              snapshot.appliedSections.length > 0
                ? snapshot.capturedAt
                : currentFreshness.slowCapturedAt,
            slowDegradedSections:
              snapshot.degradedSections as SlowMarketDataSection[],
          }
      freshnessRef.current = nextFreshness
      setFreshness(nextFreshness)
      return true
    },
    [],
  )

  const scheduleAuto = useCallback((delayMs = FAST_REFRESH_INTERVAL_MS) => {
    clearTimer()
    if (
      !mountedRef.current ||
      modeRef.current !== 'idle' ||
      document.visibilityState !== 'visible'
    ) {
      return
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      runAutoRef.current?.()
    }, delayMs)
  }, [clearTimer])

  const runAuto = useCallback(() => {
    if (
      !mountedRef.current ||
      modeRef.current !== 'idle' ||
      document.visibilityState !== 'visible'
    ) {
      return
    }

    clearTimer()
    const generation = ++generationRef.current
    const controller = new AbortController()
    controllersRef.current.add(controller)
    modeRef.current = 'auto'

    void fetchDashboardMarketSnapshot('fast', { signal: controller.signal })
      .then((snapshot) => {
        if (
          mountedRef.current &&
          generationRef.current === generation &&
          modeRef.current === 'auto' &&
          !controller.signal.aborted
        ) {
          const accepted = commitSnapshot(snapshot)
          if (!accepted) return
          const previousOutcomes = manualOutcomesRef.current
          if (previousOutcomes) {
            const nextOutcomes = {
              ...previousOutcomes,
              fast: classifySnapshot(snapshot),
            }
            const nextMessage = refreshMessage(
              nextOutcomes.fast,
              nextOutcomes.slow,
            )
            manualOutcomesRef.current = nextMessage ? nextOutcomes : null
            setRefreshError(nextMessage)
          }
        }
      })
      .catch((error: unknown) => {
        if (
          mountedRef.current &&
          generationRef.current === generation &&
          !controller.signal.aborted &&
          !isAbortLike(error)
        ) {
          console.error(
            'Failed to refresh market snapshot:',
            safeErrorMessage(error),
          )
          setClockAt(new Date().toISOString())
        }
      })
      .finally(() => {
        controllersRef.current.delete(controller)
        if (
          !mountedRef.current ||
          generationRef.current !== generation ||
          modeRef.current !== 'auto'
        ) {
          return
        }
        modeRef.current = 'idle'
        scheduleAuto()
      })
  }, [clearTimer, commitSnapshot, scheduleAuto])

  runAutoRef.current = runAuto

  const refreshDashboard = useCallback(async () => {
    if (!mountedRef.current || modeRef.current === 'manual') return

    invalidateActiveWork()
    const generation = generationRef.current
    modeRef.current = 'manual'
    const fastController = new AbortController()
    const slowController = new AbortController()
    controllersRef.current.add(fastController)
    controllersRef.current.add(slowController)
    setRefreshing(true)
    manualOutcomesRef.current = null
    setRefreshError(null)

    const results = await Promise.allSettled([
      fetchDashboardMarketSnapshot('fast', {
        signal: fastController.signal,
      }),
      fetchDashboardMarketSnapshot('slow', {
        signal: slowController.signal,
      }),
    ])
    controllersRef.current.delete(fastController)
    controllersRef.current.delete(slowController)

    if (
      !mountedRef.current ||
      generationRef.current !== generation ||
      modeRef.current !== 'manual'
    ) {
      return
    }

    const [fastResult, slowResult] = results
    const fastAccepted = fastResult.status === 'fulfilled'
      ? commitSnapshot(fastResult.value)
      : false
    const slowAccepted = slowResult.status === 'fulfilled'
      ? commitSnapshot(slowResult.value)
      : false

    const outcomes = {
      fast: classifyResult(fastResult, fastAccepted),
      slow: classifyResult(slowResult, slowAccepted),
    }
    const message = refreshMessage(outcomes.fast, outcomes.slow)
    manualOutcomesRef.current = message ? outcomes : null
    setRefreshError(message)
    if (fastAccepted || slowAccepted) {
      setClockAt(new Date().toISOString())
    }
    setRefreshing(false)
    modeRef.current = 'idle'
    scheduleAuto()
  }, [commitSnapshot, invalidateActiveWork, scheduleAuto])

  useEffect(() => {
    mountedRef.current = true

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        invalidateActiveWork()
        setRefreshing(false)
        return
      }

      invalidateActiveWork()
      setClockAt(new Date().toISOString())
      runAutoRef.current?.()
    }

    const handleFocus = () => {
      if (
        document.visibilityState !== 'visible' ||
        modeRef.current === 'manual'
      ) {
        return
      }
      invalidateActiveWork()
      setClockAt(new Date().toISOString())
      runAutoRef.current?.()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    scheduleAuto()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      mountedRef.current = false
      invalidateActiveWork()
    }
  }, [invalidateActiveWork, scheduleAuto])

  return {
    data,
    freshness,
    clockAt,
    refreshing,
    refreshError,
    refreshDashboard,
  }
}
