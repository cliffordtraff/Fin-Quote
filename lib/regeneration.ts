/**
 * Answer Regeneration System - Phase 3
 *
 * When validation fails, regenerate the answer with stronger, error-specific prompts.
 * This provides the LLM with explicit guidance on what went wrong and how to fix it.
 */

import { CompleteValidationResults } from './validators'

// ============================================================================
// Types
// ============================================================================

export interface RegenerationContext {
  originalQuestion: string
  originalAnswer: string
  validationResults: CompleteValidationResults
  data: any[]
  toolName: string
  toolArgs: any
}

export interface RegenerationResult {
  shouldRegenerate: boolean
  reason?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

// ============================================================================
// Determine if Regeneration Should Happen
// ============================================================================

/**
 * Decide if we should regenerate based on validation results
 *
 * Regeneration is triggered for:
 * - Critical issues (year exists in DB but wasn't fetched)
 * - High severity issues (hallucinated filings, wrong numbers)
 * - Medium severity issues (minor inaccuracies)
 *
 * NOT triggered for:
 * - Low severity (acceptable rounding differences)
 * - All validators skipped (no relevant data to validate)
 */
export function shouldRegenerateAnswer(
  validationResults: CompleteValidationResults
): RegenerationResult {
  // If validation passed, no need to regenerate
  if (validationResults.overall_passed) {
    return {
      shouldRegenerate: false,
      severity: 'low',
    }
  }

  const severity = validationResults.overall_severity

  // Always regenerate for critical and high severity failures
  if (severity === 'critical' || severity === 'high') {
    return {
      shouldRegenerate: true,
      reason: `${severity} severity validation failure`,
      severity,
    }
  }

  // Regenerate for medium severity if specific validators failed
  if (severity === 'medium') {
    const numberFailed = validationResults.number_validation.status === 'fail'
    const yearFailed = validationResults.year_validation.status === 'fail'
    const filingFailed = validationResults.filing_validation.status === 'fail'

    if (numberFailed || yearFailed || filingFailed) {
      return {
        shouldRegenerate: true,
        reason: `Medium severity: ${numberFailed ? 'number' : yearFailed ? 'year' : 'filing'} validation failed`,
        severity,
      }
    }
  }

  // Low severity - don't regenerate (acceptable quality)
  return {
    shouldRegenerate: false,
    severity,
  }
}

// ============================================================================
// Build Error-Specific Correction Hints
// ============================================================================

/**
 * Build correction hint for number validation failures
 */
function buildNumberCorrectionHint(validationResults: CompleteValidationResults, data: any[]): string {
  const numberValidation = validationResults.number_validation

  if (numberValidation.status !== 'fail') {
    return ''
  }

  const metadata = numberValidation.metadata || {}
  const unmatchedNumbers = metadata.unmatched_numbers || []
  const matchedNumbers = metadata.matched_numbers || []

  // Extract all numeric values from data for reference
  const dataValues: number[] = []
  for (const row of data) {
    if (row.value !== undefined && row.value !== null) {
      dataValues.push(Number(row.value))
    }
    if (row.close !== undefined && row.close !== null) {
      dataValues.push(Number(row.close))
    }
  }

  let hint = `⚠️ NUMBER VALIDATION ERROR:\n\n`

  if (unmatchedNumbers.length > 0) {
    hint += `Your answer contained these numbers that don't match the data:\n`
    unmatchedNumbers.forEach((num: number) => {
      const formatted = formatNumberForDisplay(num)
      hint += `  - ${formatted} (not found in data)\n`
    })
    hint += `\n`
  }

  hint += `EXACT values from the data:\n`
  dataValues.forEach((value, index) => {
    const row = data[index]
    const year = row?.year ? ` (${row.year})` : ''
    hint += `  - ${formatNumberForDisplay(value)}${year}\n`
  })

  hint += `\nCRITICAL RULES:\n`
  hint += `  1. Use EXACT numbers from the data above\n`
  hint += `  2. Format large numbers: 383,285,000,000 = $383.3B (one decimal)\n`
  hint += `  3. Do NOT round significantly (e.g., $383B when data is $383.3B)\n`
  hint += `  4. Do NOT estimate or approximate\n`

  return hint
}

/**
 * Build correction hint for year validation failures
 */
function buildYearCorrectionHint(validationResults: CompleteValidationResults, data: any[]): string {
  const yearValidation = validationResults.year_validation

  if (yearValidation.status !== 'fail') {
    return ''
  }

  const metadata = yearValidation.metadata || {}
  const missingYears = metadata.missing_years || []
  const availableYears = metadata.available_years || []
  const existsInDatabase = metadata.exists_in_database || {}
  const criticalMissing = metadata.critical_missing || []

  let hint = `⚠️ YEAR VALIDATION ERROR:\n\n`

  // Critical case: Year exists in DB but wasn't in data
  if (criticalMissing.length > 0) {
    hint += `CRITICAL ISSUE: You said you don't have data for these years, but they EXIST in the database:\n`
    criticalMissing.forEach((year: number) => {
      const yearData = data.find(d => d.year === year)
      if (yearData) {
        hint += `  - ${year}: Value = ${formatNumberForDisplay(yearData.value)}\n`
      } else {
        hint += `  - ${year}: (data should have been refetched)\n`
      }
    })
    hint += `\nThe tool may have used the wrong limit parameter. The data has been refetched.\n\n`
  }

  // Show missing years
  if (missingYears.length > 0) {
    hint += `Years mentioned in your answer but not in the data:\n`
    missingYears.forEach((year: number) => {
      const inDb = existsInDatabase[year]
      hint += `  - ${year}${inDb ? ' (exists in DB, now refetched)' : ' (does not exist in DB)'}\n`
    })
    hint += `\n`
  }

  // Show available years
  hint += `Years ACTUALLY available in the data:\n`
  hint += `  ${availableYears.join(', ')}\n\n`

  hint += `CRITICAL RULES:\n`
  hint += `  1. ONLY mention years that appear in the data above\n`
  hint += `  2. If user asks for a specific year, check if it's in the list\n`
  hint += `  3. If year is missing, say "I don't have data for [year]"\n`
  hint += `  4. Do NOT guess or estimate for missing years\n`

  return hint
}

/**
 * Build correction hint for filing validation failures
 */
function buildFilingCorrectionHint(validationResults: CompleteValidationResults, data: any[]): string {
  const filingValidation = validationResults.filing_validation

  if (filingValidation.status !== 'fail') {
    return ''
  }

  const metadata = filingValidation.metadata || {}
  const unverifiedFilings = metadata.unverified_filings || []

  let hint = `⚠️ FILING VALIDATION ERROR:\n\n`

  if (unverifiedFilings.length > 0) {
    hint += `Your answer referenced these filings that don't exist in the data:\n`
    unverifiedFilings.forEach((filing: any) => {
      hint += `  - ${filing.type}${filing.date ? ` (${filing.date})` : ''}\n`
    })
    hint += `\n`
  }

  // Extract actual filings from data
  const actualFilings = data
    .filter(row => row.filing_type && row.filing_date)
    .map(row => ({
      type: row.filing_type,
      date: row.filing_date,
      periodEnd: row.period_end_date,
    }))

  if (actualFilings.length > 0) {
    hint += `ONLY use these ACTUAL filings:\n`
    actualFilings.forEach(filing => {
      const date = new Date(filing.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
      hint += `  - ${filing.type} filed ${date}\n`
    })
    hint += `\n`
  }

  hint += `CRITICAL RULES:\n`
  hint += `  1. ONLY reference filings listed above\n`
  hint += `  2. Use EXACT dates from the list\n`
  hint += `  3. Do NOT mention filings not in the list\n`
  hint += `  4. Do NOT invent filing dates\n`

  return hint
}

/**
 * Helper to format numbers for display
 */
function formatNumberForDisplay(num: number): string {
  if (num >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(1)}B`
  } else if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(1)}M`
  } else {
    return `$${num.toFixed(2)}`
  }
}

// ============================================================================
// Build Regeneration Prompt
// ============================================================================

/**
 * Build a stronger prompt for regeneration based on what failed
 *
 * This combines:
 * 1. The base answer prompt
 * 2. Error-specific correction hints
 * 3. Explicit instructions on what to fix
 */
export function buildRegenerationPrompt(
  context: RegenerationContext,
  basePromptBuilder: (question: string, factsJson: string) => string
): string {
  const { originalQuestion, originalAnswer, validationResults, data } = context

  // Start with base prompt
  const factsJson = JSON.stringify(data, null, 2)
  let prompt = basePromptBuilder(originalQuestion, factsJson)

  // Add preamble about regeneration
  prompt += `\n\n${'='.repeat(80)}\n`
  prompt += `⚠️ ANSWER REGENERATION - Your previous answer had validation errors\n`
  prompt += `${'='.repeat(80)}\n\n`

  prompt += `Your previous answer was:\n"${originalAnswer}"\n\n`

  prompt += `This answer failed validation. Please regenerate with the following corrections:\n\n`

  // Add error-specific hints
  const numberHint = buildNumberCorrectionHint(validationResults, data)
  const yearHint = buildYearCorrectionHint(validationResults, data)
  const filingHint = buildFilingCorrectionHint(validationResults, data)

  if (numberHint) {
    prompt += numberHint + `\n`
  }

  if (yearHint) {
    prompt += yearHint + `\n`
  }

  if (filingHint) {
    prompt += filingHint + `\n`
  }

  // Final instructions
  prompt += `${'='.repeat(80)}\n`
  prompt += `REGENERATE YOUR ANSWER\n`
  prompt += `${'='.repeat(80)}\n\n`

  prompt += `Using the corrections above:\n`
  prompt += `1. Address all validation errors\n`
  prompt += `2. Use EXACT values from the data\n`
  prompt += `3. Follow all critical rules\n`
  prompt += `4. Provide a complete, accurate answer\n\n`

  prompt += `Your regenerated answer:\n`

  return prompt
}

// ============================================================================
// Regeneration Decision Logic
// ============================================================================

/**
 * Decide what to do based on regeneration result
 */
export interface RegenerationAction {
  action: 'show_original' | 'regenerate' | 'show_error'
  message?: string
  refetchData?: boolean
  refetchArgs?: any
}

/**
 * Determine the action to take based on validation results
 */
export function determineRegenerationAction(
  context: RegenerationContext,
  regenerationDecision: RegenerationResult
): RegenerationAction {
  // If we shouldn't regenerate, show original
  if (!regenerationDecision.shouldRegenerate) {
    return { action: 'show_original' }
  }

  // Check if we need to refetch data (critical year issue)
  const yearValidation = context.validationResults.year_validation
  const metadata = yearValidation.metadata || {}
  const criticalMissing = metadata.critical_missing || []

  if (criticalMissing.length > 0 && context.toolName === 'getAaplFinancialsByMetric') {
    // Year exists in DB but wasn't fetched - need to refetch with limit: 10
    return {
      action: 'regenerate',
      refetchData: true,
      refetchArgs: {
        ...context.toolArgs,
        limit: 10, // Fetch all years
      },
    }
  }

  // For other failures, regenerate with same data but stronger prompt
  if (regenerationDecision.severity === 'critical' || regenerationDecision.severity === 'high') {
    return {
      action: 'regenerate',
      refetchData: false,
    }
  }

  // Medium severity - try regeneration
  return {
    action: 'regenerate',
    refetchData: false,
  }
}
