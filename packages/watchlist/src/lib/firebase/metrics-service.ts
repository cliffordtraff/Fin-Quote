/**
 * Firestore service for AI Summary Metrics persistence
 *
 * Stores metrics with automatic cleanup of old data
 */

import { db } from './config'
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
  deleteDoc,
  doc
} from 'firebase/firestore'
import { SummaryMetrics } from '@watchlist/lib/monitoring/whyItMovedMonitor'

const METRICS_COLLECTION = 'aiSummaryMetrics'
const RETENTION_DAYS = 30 // Keep metrics for 30 days

/**
 * Save a metric to Firestore
 */
export async function saveMetric(metrics: SummaryMetrics): Promise<void> {
  try {
    // Remove undefined values (Firestore doesn't accept them)
    const cleanedMetrics = Object.entries(metrics).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value
      }
      return acc
    }, {} as Record<string, any>)

    await addDoc(collection(db, METRICS_COLLECTION), {
      ...cleanedMetrics,
      timestamp: Timestamp.fromMillis(metrics.timestamp)
    })
  } catch (error) {
    console.error('[Metrics Service] Error saving metric:', error)
    // Don't throw - metrics logging should not break the main flow
  }
}

/**
 * Get metrics for a time window
 */
export async function getMetrics(
  startTime: number,
  endTime: number = Date.now()
): Promise<SummaryMetrics[]> {
  try {
    const q = query(
      collection(db, METRICS_COLLECTION),
      where('timestamp', '>=', Timestamp.fromMillis(startTime)),
      where('timestamp', '<=', Timestamp.fromMillis(endTime)),
      orderBy('timestamp', 'desc'),
      limit(1000) // Max 1000 records per query
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => {
      const data = doc.data()
      return {
        ...data,
        timestamp: data.timestamp.toMillis()
      } as SummaryMetrics
    })
  } catch (error) {
    console.error('[Metrics Service] Error fetching metrics:', error)
    return []
  }
}

/**
 * Get metrics for last N hours
 */
export async function getRecentMetrics(hours: number = 24): Promise<SummaryMetrics[]> {
  const startTime = Date.now() - (hours * 60 * 60 * 1000)
  return getMetrics(startTime)
}

/**
 * Get aggregated stats for a time period
 */
export async function getAggregatedStats(hours: number = 24) {
  const metrics = await getRecentMetrics(hours)

  if (metrics.length === 0) {
    return {
      totalRequests: 0,
      validationPassRate: 100,
      retryRate: 0,
      fallbackRate: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0
    }
  }

  // Calculate rates
  const passed = metrics.filter(m => m.validationPassed && !m.retried).length
  const retried = metrics.filter(m => m.retried).length
  const fallback = metrics.filter(m => m.usedFallback).length

  const validationPassRate = (passed / metrics.length) * 100
  const retryRate = (retried / metrics.length) * 100
  const fallbackRate = (fallback / metrics.length) * 100

  // Calculate latencies
  const latencies = metrics.map(m => m.latencyMs).sort((a, b) => a - b)
  const avgLatencyMs = latencies.reduce((sum, l) => sum + l, 0) / latencies.length
  const p50LatencyMs = latencies[Math.floor(latencies.length * 0.5)] || 0
  const p95LatencyMs = latencies[Math.floor(latencies.length * 0.95)] || 0
  const p99LatencyMs = latencies[Math.floor(latencies.length * 0.99)] || 0

  return {
    totalRequests: metrics.length,
    validationPassRate,
    retryRate,
    fallbackRate,
    avgLatencyMs: Math.round(avgLatencyMs),
    p50LatencyMs,
    p95LatencyMs,
    p99LatencyMs
  }
}

/**
 * Get hourly breakdown for charts
 */
export async function getHourlyBreakdown(hours: number = 24) {
  const metrics = await getRecentMetrics(hours)

  // Group by hour
  const hourlyData: Record<string, {
    hour: string
    timestamp: number
    total: number
    passed: number
    retried: number
    fallback: number
    avgLatency: number
  }> = {}

  metrics.forEach(m => {
    const hourKey = new Date(m.timestamp).toISOString().slice(0, 13) // YYYY-MM-DDTHH

    if (!hourlyData[hourKey]) {
      hourlyData[hourKey] = {
        hour: hourKey,
        timestamp: new Date(hourKey).getTime(),
        total: 0,
        passed: 0,
        retried: 0,
        fallback: 0,
        avgLatency: 0
      }
    }

    hourlyData[hourKey].total++
    if (m.validationPassed && !m.retried) hourlyData[hourKey].passed++
    if (m.retried) hourlyData[hourKey].retried++
    if (m.usedFallback) hourlyData[hourKey].fallback++
    hourlyData[hourKey].avgLatency += m.latencyMs
  })

  // Calculate averages and sort by time
  return Object.values(hourlyData)
    .map(h => ({
      ...h,
      avgLatency: Math.round(h.avgLatency / h.total),
      passRate: ((h.passed / h.total) * 100).toFixed(1)
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Clean up old metrics (run periodically)
 */
export async function cleanupOldMetrics(): Promise<number> {
  try {
    const cutoffTime = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000)

    const q = query(
      collection(db, METRICS_COLLECTION),
      where('timestamp', '<', Timestamp.fromMillis(cutoffTime)),
      limit(500) // Delete in batches
    )

    const snapshot = await getDocs(q)

    const deletePromises = snapshot.docs.map(docSnapshot =>
      deleteDoc(doc(db, METRICS_COLLECTION, docSnapshot.id))
    )

    await Promise.all(deletePromises)

    console.log(`[Metrics Service] Cleaned up ${snapshot.size} old metrics`)
    return snapshot.size
  } catch (error) {
    console.error('[Metrics Service] Error cleaning up metrics:', error)
    return 0
  }
}
