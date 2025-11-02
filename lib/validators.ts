/**
 * Answer Validation System - Phase 1
 *
 * Validates LLM-generated answers against the actual data to catch:
 * - Number mismatches (wrong values, units, rounding)
 * - Year/date errors (mentioning years not in data)
 * - Citation errors (fake filing references)
 *
 * Each validator returns a structured result with pass/fail status and details.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export type ValidationStatus = 'pass' | 'fail' | 'skip'
export type ValidationSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical'

/**
 * Result from a single validation check
 */
export interface ValidationResult {
  status: ValidationStatus
  severity?: ValidationSeverity
  details: string
  metadata?: Record<string, any>
}

/**
 * Complete validation results for a query
 */
export interface CompleteValidationResults {
  number_validation: ValidationResult
  year_validation: ValidationResult
  filing_validation: ValidationResult
  overall_severity: ValidationSeverity
  overall_passed: boolean
  latency_ms: number
}

// ============================================================================
// Number Validator
// ============================================================================

/**
 * Extract numbers from text, handling common formats:
 * - $383.3B → 383300000000
 * - $57.4 billion → 57400000000
 * - $274.5M → 274500000
 * - 99.8 → 99.8
 */
function extractNumbers(text: string): number[] {
  const numbers: number[] = []

  // Pattern 1: $XXX.XB or $XXX.X billion (billions)
  const billionPattern = /\$?(\d+\.?\d*)\s*(?:B|billion)/gi
  let match
  while ((match = billionPattern.exec(text)) !== null) {
    const value = parseFloat(match[1]) * 1_000_000_000
    numbers.push(value)
  }

  // Pattern 2: $XXX.XM or $XXX.X million (millions)
  const millionPattern = /\$?(\d+\.?\d*)\s*(?:M|million)/gi
  while ((match = millionPattern.exec(text)) !== null) {
    const value = parseFloat(match[1]) * 1_000_000
    numbers.push(value)
  }

  // Pattern 3: Plain numbers with $ (likely billions if >100, millions if <100)
  // Example: "$383.3" → likely 383.3B based on context
  const plainDollarPattern = /\$(\d+\.?\d*)/g
  while ((match = plainDollarPattern.exec(text)) !== null) {
    const value = parseFloat(match[1])
    // If number is large (>100), assume billions; otherwise millions
    if (value > 100) {
      numbers.push(value * 1_000_000_000)
    } else if (value > 1) {
      numbers.push(value * 1_000_000_000) // Default to billions for financial data
    } else {
      numbers.push(value)
    }
  }

  return numbers
}

/**
 * Check if two numbers are close enough (within tolerance)
 * @param actual - Number from data
 * @param mentioned - Number from LLM answer
 * @param tolerancePercent - Acceptable difference percentage (default 0.5%)
 */
function numbersMatch(actual: number, mentioned: number, tolerancePercent: number = 0.5): boolean {
  if (actual === 0) return mentioned === 0

  const difference = Math.abs(actual - mentioned)
  const percentDiff = (difference / actual) * 100

  return percentDiff <= tolerancePercent
}

/**
 * Find the closest matching number in the data
 */
function findClosestMatch(mentioned: number, dataNumbers: number[], tolerancePercent: number = 0.5): {
  found: boolean
  actual?: number
  percentDiff?: number
} {
  let closestMatch: number | undefined
  let smallestDiff = Infinity

  for (const dataNum of dataNumbers) {
    if (numbersMatch(dataNum, mentioned, tolerancePercent)) {
      const diff = Math.abs(dataNum - mentioned)
      if (diff < smallestDiff) {
        smallestDiff = diff
        closestMatch = dataNum
      }
    }
  }

  if (closestMatch !== undefined) {
    const percentDiff = closestMatch === 0 ? 0 : (Math.abs(closestMatch - mentioned) / closestMatch) * 100
    return { found: true, actual: closestMatch, percentDiff }
  }

  return { found: false }
}

/**
 * Validate that numbers in the answer match the data
 *
 * @param answer - LLM-generated answer text
 * @param data - Data returned from tool (array of objects with numeric values)
 * @returns ValidationResult with pass/fail and details
 */
export function validateNumbers(answer: string, data: any[]): ValidationResult {
  // Extract all numbers mentioned in the answer
  const mentionedNumbers = extractNumbers(answer)

  // Skip validation if no numbers mentioned
  if (mentionedNumbers.length === 0) {
    return {
      status: 'skip',
      details: 'No numbers found in answer',
      metadata: {
        mentioned_count: 0,
        data_count: 0,
      },
    }
  }

  // Extract all numeric values from the data
  const dataNumbers: number[] = []
  for (const row of data) {
    if (row.value !== undefined && row.value !== null) {
      dataNumbers.push(Number(row.value))
    }
    // Also check for price data
    if (row.close !== undefined && row.close !== null) {
      dataNumbers.push(Number(row.close))
    }
  }

  // Skip validation if no data to compare against
  if (dataNumbers.length === 0) {
    return {
      status: 'skip',
      details: 'No numeric data to validate against',
      metadata: {
        mentioned_count: mentionedNumbers.length,
        data_count: 0,
      },
    }
  }

  // Check each mentioned number
  const unmatchedNumbers: number[] = []
  const matchedNumbers: Array<{ mentioned: number; actual: number; percentDiff: number }> = []

  for (const mentioned of mentionedNumbers) {
    const match = findClosestMatch(mentioned, dataNumbers, 0.5)

    if (match.found && match.actual !== undefined && match.percentDiff !== undefined) {
      matchedNumbers.push({
        mentioned,
        actual: match.actual,
        percentDiff: match.percentDiff,
      })
    } else {
      unmatchedNumbers.push(mentioned)
    }
  }

  // Determine severity and status
  if (unmatchedNumbers.length === 0) {
    // All numbers matched
    return {
      status: 'pass',
      severity: 'none',
      details: `All ${mentionedNumbers.length} numbers validated successfully`,
      metadata: {
        mentioned_count: mentionedNumbers.length,
        matched_count: matchedNumbers.length,
        matches: matchedNumbers,
        tolerance_percent: 0.5,
      },
    }
  }

  // Calculate severity based on how many numbers failed
  const failureRate = unmatchedNumbers.length / mentionedNumbers.length
  let severity: ValidationSeverity = 'low'

  if (failureRate >= 0.5) {
    severity = 'high' // 50%+ of numbers wrong
  } else if (failureRate >= 0.25) {
    severity = 'medium' // 25-50% of numbers wrong
  }

  return {
    status: 'fail',
    severity,
    details: `${unmatchedNumbers.length} of ${mentionedNumbers.length} numbers could not be validated`,
    metadata: {
      mentioned_count: mentionedNumbers.length,
      matched_count: matchedNumbers.length,
      unmatched_count: unmatchedNumbers.length,
      unmatched_numbers: unmatchedNumbers,
      matched_numbers: matchedNumbers,
      tolerance_percent: 0.5,
    },
  }
}

// ============================================================================
// Year Validator
// ============================================================================

/**
 * Extract years from text (4-digit numbers that look like years)
 * Filters to reasonable range: 2000-2030
 */
function extractYears(text: string): number[] {
  const years: Set<number> = new Set()

  // Match 4-digit numbers that could be years
  const yearPattern = /\b(20[0-2][0-9]|2030)\b/g
  let match

  while ((match = yearPattern.exec(text)) !== null) {
    years.add(parseInt(match[1]))
  }

  return Array.from(years).sort()
}

/**
 * Validate that years mentioned in the answer exist in the data
 *
 * @param answer - LLM-generated answer text
 * @param data - Data returned from tool (with year fields)
 * @param checkDatabase - Optional function to check if year exists in full database
 * @returns ValidationResult with pass/fail and details
 */
export async function validateYears(
  answer: string,
  data: any[],
  checkDatabase?: (year: number) => Promise<boolean>
): Promise<ValidationResult> {
  // Extract years mentioned in answer
  const mentionedYears = extractYears(answer)

  // Skip validation if no years mentioned
  if (mentionedYears.length === 0) {
    return {
      status: 'skip',
      details: 'No years found in answer',
      metadata: {
        mentioned_years: [],
        available_years: [],
      },
    }
  }

  // Extract years from data
  const dataYears: Set<number> = new Set()
  for (const row of data) {
    if (row.year !== undefined && row.year !== null) {
      dataYears.add(Number(row.year))
    }
    // Also check for date fields in filing data
    if (row.filing_date) {
      const year = new Date(row.filing_date).getFullYear()
      dataYears.add(year)
    }
    if (row.period_end_date) {
      const year = new Date(row.period_end_date).getFullYear()
      dataYears.add(year)
    }
  }

  const availableYears = Array.from(dataYears).sort()

  // Check which mentioned years are missing
  const missingYears: number[] = []
  const presentYears: number[] = []

  for (const year of mentionedYears) {
    if (dataYears.has(year)) {
      presentYears.push(year)
    } else {
      missingYears.push(year)
    }
  }

  // If all years are present, validation passes
  if (missingYears.length === 0) {
    return {
      status: 'pass',
      severity: 'none',
      details: `All ${mentionedYears.length} mentioned years found in data`,
      metadata: {
        mentioned_years: mentionedYears,
        available_years: availableYears,
        all_present: true,
      },
    }
  }

  // Check if missing years exist in database (critical issue if they do)
  const existsInDatabase: Record<number, boolean> = {}
  if (checkDatabase) {
    for (const year of missingYears) {
      existsInDatabase[year] = await checkDatabase(year)
    }
  }

  // Determine severity
  const criticalMissingYears = Object.entries(existsInDatabase)
    .filter(([_, exists]) => exists)
    .map(([year]) => parseInt(year))

  let severity: ValidationSeverity
  let status: ValidationStatus = 'fail'

  if (criticalMissingYears.length > 0) {
    // CRITICAL: Year exists in DB but wasn't fetched (tool argument issue)
    severity = 'critical'
  } else if (missingYears.some(y => y > new Date().getFullYear())) {
    // HIGH: Future year mentioned (hallucination)
    severity = 'high'
  } else if (missingYears.length === mentionedYears.length) {
    // HIGH: ALL mentioned years missing
    severity = 'high'
  } else {
    // MEDIUM: Some years missing
    severity = 'medium'
  }

  return {
    status,
    severity,
    details: `${missingYears.length} of ${mentionedYears.length} mentioned years not found in data`,
    metadata: {
      mentioned_years: mentionedYears,
      available_years: availableYears,
      missing_years: missingYears,
      present_years: presentYears,
      exists_in_database: existsInDatabase,
      critical_missing: criticalMissingYears,
    },
  }
}

// ============================================================================
// Filing/Citation Validator
// ============================================================================

/**
 * Extract filing references from text
 * Looks for patterns like "10-K", "10-Q", "8-K" with dates
 */
function extractFilingReferences(text: string): Array<{ type: string; date?: string }> {
  const references: Array<{ type: string; date?: string }> = []

  // Pattern: "10-K filed [date]" or "August 2024 10-Q"
  const filingPattern = /(10-K|10-Q|8-K)/gi
  let match

  while ((match = filingPattern.exec(text)) !== null) {
    const type = match[1].toUpperCase()

    // Try to extract nearby date
    const contextStart = Math.max(0, match.index - 50)
    const contextEnd = Math.min(text.length, match.index + 50)
    const context = text.slice(contextStart, contextEnd)

    // Look for date patterns near the filing mention
    const datePattern = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}/i
    const dateMatch = context.match(datePattern)

    references.push({
      type,
      date: dateMatch ? dateMatch[0] : undefined,
    })
  }

  return references
}

/**
 * Validate that filing references in the answer match the data
 *
 * @param answer - LLM-generated answer text
 * @param data - Filing data returned from tool
 * @returns ValidationResult with pass/fail and details
 */
export function validateFilings(answer: string, data: any[]): ValidationResult {
  // Extract filing references from answer
  const mentionedFilings = extractFilingReferences(answer)

  // Skip validation if no filings mentioned
  if (mentionedFilings.length === 0) {
    return {
      status: 'skip',
      details: 'No filing references found in answer',
      metadata: {
        mentioned_count: 0,
        data_count: 0,
      },
    }
  }

  // Extract filing info from data
  const dataFilings: Array<{ type: string; date: string }> = []
  for (const row of data) {
    if (row.filing_type && row.filing_date) {
      dataFilings.push({
        type: row.filing_type.toUpperCase(),
        date: row.filing_date,
      })
    }
  }

  // Skip if no filing data to validate against
  if (dataFilings.length === 0) {
    return {
      status: 'skip',
      details: 'No filing data to validate against',
      metadata: {
        mentioned_count: mentionedFilings.length,
        data_count: 0,
      },
    }
  }

  // Check each mentioned filing
  const unverifiedFilings: typeof mentionedFilings = []
  const verifiedFilings: typeof mentionedFilings = []

  for (const mentioned of mentionedFilings) {
    // Check if this filing type exists in data
    const matchingType = dataFilings.some(f => f.type === mentioned.type)

    if (!matchingType) {
      unverifiedFilings.push(mentioned)
      continue
    }

    // If date mentioned, verify it matches
    if (mentioned.date) {
      const matchingDate = dataFilings.some(f =>
        f.type === mentioned.type &&
        f.date.includes(mentioned.date!)
      )

      if (!matchingDate) {
        unverifiedFilings.push(mentioned)
        continue
      }
    }

    verifiedFilings.push(mentioned)
  }

  // Determine status and severity
  if (unverifiedFilings.length === 0) {
    return {
      status: 'pass',
      severity: 'none',
      details: `All ${mentionedFilings.length} filing references validated`,
      metadata: {
        mentioned_count: mentionedFilings.length,
        verified_count: verifiedFilings.length,
        verified_filings: verifiedFilings,
      },
    }
  }

  // Filing hallucination is critical
  const severity: ValidationSeverity = unverifiedFilings.length === mentionedFilings.length ? 'critical' : 'high'

  return {
    status: 'fail',
    severity,
    details: `${unverifiedFilings.length} of ${mentionedFilings.length} filing references could not be verified`,
    metadata: {
      mentioned_count: mentionedFilings.length,
      verified_count: verifiedFilings.length,
      unverified_count: unverifiedFilings.length,
      unverified_filings: unverifiedFilings,
      verified_filings: verifiedFilings,
    },
  }
}

// ============================================================================
// Orchestration - Run All Validators
// ============================================================================

/**
 * Run all validators and combine results
 *
 * @param answer - LLM-generated answer text
 * @param data - Data returned from tool
 * @param checkYearInDatabase - Optional function to check if year exists in DB
 * @returns Complete validation results
 */
export async function validateAnswer(
  answer: string,
  data: any[],
  checkYearInDatabase?: (year: number) => Promise<boolean>
): Promise<CompleteValidationResults> {
  const startTime = Date.now()

  // Run all validators
  const numberValidation = validateNumbers(answer, data)
  const yearValidation = await validateYears(answer, data, checkYearInDatabase)
  const filingValidation = validateFilings(answer, data)

  // Determine overall severity (use the highest severity from any validator)
  const severities: ValidationSeverity[] = [
    numberValidation.severity || 'none',
    yearValidation.severity || 'none',
    filingValidation.severity || 'none',
  ]

  const severityOrder: Record<ValidationSeverity, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }

  const overallSeverity = severities.reduce((max, current) =>
    severityOrder[current] > severityOrder[max] ? current : max
  , 'none' as ValidationSeverity)

  // Overall passes if all non-skipped validators pass
  const overallPassed =
    (numberValidation.status === 'pass' || numberValidation.status === 'skip') &&
    (yearValidation.status === 'pass' || yearValidation.status === 'skip') &&
    (filingValidation.status === 'pass' || filingValidation.status === 'skip')

  const latencyMs = Date.now() - startTime

  return {
    number_validation: numberValidation,
    year_validation: yearValidation,
    filing_validation: filingValidation,
    overall_severity: overallSeverity,
    overall_passed: overallPassed,
    latency_ms: latencyMs,
  }
}
