'use server'

import { createServerClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

type QueryLogValidationRow = {
  id: string
  created_at: string
  user_question: string
  answer_generated: string
  tool_selected: string
  tool_args: any
  validation_passed: boolean | null
  validation_results: {
    overall_severity?: string
    number_validation?: { status?: 'pass' | 'fail' | 'skip' }
    year_validation?: { status?: 'pass' | 'fail' | 'skip' }
    filing_validation?: { status?: 'pass' | 'fail' | 'skip' }
    regeneration?: {
      triggered?: boolean
      second_attempt_passed?: boolean
    }
  } | null
  user_feedback: string | null
  validation_run_at: string | null
}

export type ValidationStats = {
  overall: {
    total_queries: number
    validated_queries: number
    passed: number
    failed: number
    pass_rate: number
  }
  by_severity: Array<{
    severity: string
    count: number
    percentage: number
  }>
  by_validator: {
    number: { pass: number; fail: number; skip: number }
    year: { pass: number; fail: number; skip: number }
    filing: { pass: number; fail: number; skip: number }
  }
  regeneration: {
    total_triggered: number
    succeeded: number
    failed: number
    success_rate: number
  }
  daily_trend: Array<{
    date: string
    total: number
    passed: number
    failed: number
    pass_rate: number
  }>
}

export type ValidationFailure = {
  id: string
  created_at: string
  user_question: string
  answer_generated: string
  tool_selected: string
  tool_args: any
  validation_results: any
  user_feedback: string | null
  overall_severity: string
  regeneration_attempted: boolean
  regeneration_succeeded: boolean
}

// ============================================================================
// Get Overall Validation Statistics
// ============================================================================

export async function getValidationStats(params?: {
  days?: number
}): Promise<{ data: ValidationStats | null; error: string | null }> {
  try {
    const supabase = await createServerClient()
    const days = params?.days ?? 7

    // Calculate date range
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Fetch all validated queries within date range
    const { data: queries, error } = await supabase
      .from('query_logs')
      .select('*')
      .not('validation_run_at', 'is', null)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch validation stats:', error)
      return { data: null, error: error.message }
    }

    const allQueries: QueryLogValidationRow[] = (queries ?? []) as QueryLogValidationRow[]

    // Overall stats
    const totalQueries = allQueries.length
    const passedQueries = allQueries.filter((q) => q.validation_passed === true).length
    const failedQueries = allQueries.filter((q) => q.validation_passed === false).length
    const passRate = totalQueries > 0 ? (passedQueries / totalQueries) * 100 : 0

    // By severity
    const severityCounts: Record<string, number> = {}
    allQueries.forEach((q) => {
      const severity = q.validation_results?.overall_severity || 'none'
      severityCounts[severity] = (severityCounts[severity] || 0) + 1
    })

    const bySeverity = Object.entries(severityCounts)
      .map(([severity, count]) => ({
        severity,
        count,
        percentage: totalQueries > 0 ? (count / totalQueries) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)

    // By validator
    const validatorStats = {
      number: { pass: 0, fail: 0, skip: 0 },
      year: { pass: 0, fail: 0, skip: 0 },
      filing: { pass: 0, fail: 0, skip: 0 },
    }

    allQueries.forEach((q) => {
      const results = q.validation_results
      if (results) {
        // Number validation
        const numberStatus = results.number_validation?.status
        if (numberStatus === 'pass') validatorStats.number.pass++
        else if (numberStatus === 'fail') validatorStats.number.fail++
        else if (numberStatus === 'skip') validatorStats.number.skip++

        // Year validation
        const yearStatus = results.year_validation?.status
        if (yearStatus === 'pass') validatorStats.year.pass++
        else if (yearStatus === 'fail') validatorStats.year.fail++
        else if (yearStatus === 'skip') validatorStats.year.skip++

        // Filing validation
        const filingStatus = results.filing_validation?.status
        if (filingStatus === 'pass') validatorStats.filing.pass++
        else if (filingStatus === 'fail') validatorStats.filing.fail++
        else if (filingStatus === 'skip') validatorStats.filing.skip++
      }
    })

    // Regeneration stats
    const regenerationQueries = allQueries.filter(
      (q) => q.validation_results?.regeneration?.triggered === true
    )
    const regenerationSucceeded = regenerationQueries.filter(
      (q) => q.validation_results?.regeneration?.second_attempt_passed === true
    ).length
    const regenerationFailed = regenerationQueries.filter(
      (q) => q.validation_results?.regeneration?.second_attempt_passed === false
    ).length
    const regenerationSuccessRate =
      regenerationQueries.length > 0 ? (regenerationSucceeded / regenerationQueries.length) * 100 : 0

    // Daily trend (group by day)
    const dailyMap: Record<
      string,
      { total: number; passed: number; failed: number }
    > = {}

    allQueries.forEach((q) => {
      const date = new Date(q.created_at).toISOString().split('T')[0]
      if (!dailyMap[date]) {
        dailyMap[date] = { total: 0, passed: 0, failed: 0 }
      }
      dailyMap[date].total++
      if (q.validation_passed === true) dailyMap[date].passed++
      else if (q.validation_passed === false) dailyMap[date].failed++
    })

    const dailyTrend = Object.entries(dailyMap)
      .map(([date, stats]) => ({
        date,
        total: stats.total,
        passed: stats.passed,
        failed: stats.failed,
        pass_rate: stats.total > 0 ? (stats.passed / stats.total) * 100 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const validationStats: ValidationStats = {
      overall: {
        total_queries: totalQueries,
        validated_queries: totalQueries,
        passed: passedQueries,
        failed: failedQueries,
        pass_rate: passRate,
      },
      by_severity: bySeverity,
      by_validator: validatorStats,
      regeneration: {
        total_triggered: regenerationQueries.length,
        succeeded: regenerationSucceeded,
        failed: regenerationFailed,
        success_rate: regenerationSuccessRate,
      },
      daily_trend: dailyTrend,
    }

    return { data: validationStats, error: null }
  } catch (err) {
    console.error('Failed to fetch validation stats (unexpected error):', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}

// ============================================================================
// Get Recent Validation Failures
// ============================================================================

export async function getValidationFailures(params?: {
  limit?: number
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'all'
}): Promise<{ data: ValidationFailure[] | null; error: string | null }> {
  try {
    const supabase = await createServerClient()
    const limit = params?.limit ?? 50

    // Fetch recent validation failures
    let query = supabase
      .from('query_logs')
      .select('*')
      .eq('validation_passed', false)
      .not('validation_run_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    const { data: queries, error } = await query

    if (error) {
      console.error('Failed to fetch validation failures:', error)
      return { data: null, error: error.message }
    }

    const typedFailures: QueryLogValidationRow[] = (queries ?? []) as QueryLogValidationRow[]

    const allFailures = typedFailures.map((q) => ({
      id: q.id,
      created_at: q.created_at,
      user_question: q.user_question,
      answer_generated: q.answer_generated,
      tool_selected: q.tool_selected,
      tool_args: q.tool_args,
      validation_results: q.validation_results,
      user_feedback: q.user_feedback,
      overall_severity: q.validation_results?.overall_severity || 'unknown',
      regeneration_attempted: q.validation_results?.regeneration?.triggered === true,
      regeneration_succeeded:
        q.validation_results?.regeneration?.second_attempt_passed === true,
    }))

    // Filter by severity if specified
    let filteredFailures = allFailures
    if (params?.severity && params.severity !== 'all') {
      filteredFailures = allFailures.filter(
        (f) => f.overall_severity === params.severity
      )
    }

    return { data: filteredFailures, error: null }
  } catch (err) {
    console.error('Failed to fetch validation failures (unexpected error):', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}

// ============================================================================
// Get Queries for Validation Review
// ============================================================================

export async function getQueriesForValidationReview(params?: {
  filter?: 'failed' | 'regenerated' | 'critical' | 'all'
  limit?: number
}): Promise<{ data: ValidationFailure[] | null; error: string | null }> {
  try {
    const supabase = await createServerClient()
    const limit = params?.limit ?? 50

    let query = supabase
      .from('query_logs')
      .select('*')
      .not('validation_run_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Apply filters
    if (params?.filter === 'failed') {
      query = query.eq('validation_passed', false)
    } else if (params?.filter === 'regenerated') {
      // Can't filter directly in query, will filter in memory
    } else if (params?.filter === 'critical') {
      // Can't filter directly in query, will filter in memory
    }

    const { data: queries, error } = await query

    if (error) {
      console.error('Failed to fetch queries for validation review:', error)
      return { data: null, error: error.message }
    }

    let allQueries = ((queries ?? []) as QueryLogValidationRow[]).map((q) => ({
      id: q.id,
      created_at: q.created_at,
      user_question: q.user_question,
      answer_generated: q.answer_generated,
      tool_selected: q.tool_selected,
      tool_args: q.tool_args,
      validation_results: q.validation_results,
      user_feedback: q.user_feedback,
      overall_severity: q.validation_results?.overall_severity || 'none',
      regeneration_attempted: q.validation_results?.regeneration?.triggered === true,
      regeneration_succeeded:
        q.validation_results?.regeneration?.second_attempt_passed === true,
    }))

    // Apply in-memory filters
    if (params?.filter === 'regenerated') {
      allQueries = allQueries.filter((q) => q.regeneration_attempted)
    } else if (params?.filter === 'critical') {
      allQueries = allQueries.filter((q) => q.overall_severity === 'critical')
    }

    return { data: allQueries, error: null }
  } catch (err) {
    console.error(
      'Failed to fetch queries for validation review (unexpected error):',
      err
    )
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
