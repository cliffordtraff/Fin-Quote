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
 * Extract percentages from text:
 * - "46.2%" → 46.2
 * - "15.3 percent" → 15.3
 */
function extractPercentages(text: string): number[] {
  const percentages: number[] = []

  // Pattern 1: XX.X% or XX%
  const percentPattern = /(\d+\.?\d*)\s*%/gi
  let match
  while ((match = percentPattern.exec(text)) !== null) {
    percentages.push(parseFloat(match[1]))
  }

  // Pattern 2: XX.X percent
  const percentWordPattern = /(\d+\.?\d*)\s*percent/gi
  while ((match = percentWordPattern.exec(text)) !== null) {
    percentages.push(parseFloat(match[1]))
  }

  return percentages
}

/**
 * Detect if data contains metrics needed for ratio calculations
 */
function detectRatioMetrics(data: any[]): {
  hasRevenue: boolean
  hasShareholders: boolean
  hasLiabilities: boolean
  hasAssets: boolean
  primaryMetric?: string
} {
  if (!data || data.length === 0) {
    return { hasRevenue: false, hasShareholders: false, hasLiabilities: false, hasAssets: false }
  }

  const firstRow = data[0]

  // Handle summary objects (for price data) - they don't have financial metrics
  if (firstRow && typeof firstRow === 'object' && 'summary' in firstRow) {
    return { hasRevenue: false, hasShareholders: false, hasLiabilities: false, hasAssets: false }
  }

  const hasRevenue = firstRow && 'revenue' in firstRow && firstRow.revenue != null
  const hasShareholders = firstRow && 'shareholders_equity' in firstRow && firstRow.shareholders_equity != null
  const hasLiabilities = firstRow && 'total_liabilities' in firstRow && firstRow.total_liabilities != null
  const hasAssets = firstRow && 'total_assets' in firstRow && firstRow.total_assets != null
  const primaryMetric = firstRow && firstRow.metric ? firstRow.metric : undefined

  return { hasRevenue, hasShareholders, hasLiabilities, hasAssets, primaryMetric }
}

/**
 * Calculate expected ratios from data
 */
function calculateRatios(data: any[]): number[] {
  const ratios: number[] = []

  // Guard: if data is not an array or is a summary object, return empty ratios
  if (!Array.isArray(data) || (data.length > 0 && data[0] && 'summary' in data[0])) {
    return ratios
  }

  const { hasRevenue, hasShareholders, hasLiabilities, hasAssets, primaryMetric } = detectRatioMetrics(data)

  for (const row of data) {
    // Margin calculations (value / revenue) - for gross_profit, operating_income, net_income, operating_cash_flow
    if (hasRevenue && row.value != null && row.revenue != null) {
      const margin = (row.value / row.revenue) * 100
      ratios.push(parseFloat(margin.toFixed(1)))
    }

    // ROE calculation (net_income / shareholders_equity)
    if (hasShareholders && primaryMetric === 'net_income' && row.value != null && row.shareholders_equity != null) {
      const roe = (row.value / row.shareholders_equity) * 100
      ratios.push(parseFloat(roe.toFixed(1)))
    }

    // ROA calculation (net_income / total_assets)
    if (hasAssets && primaryMetric === 'net_income' && row.value != null && row.total_assets != null) {
      const roa = (row.value / row.total_assets) * 100
      ratios.push(parseFloat(roa.toFixed(1)))
    }

    // Debt-to-Equity ratio (total_liabilities / shareholders_equity)
    if (hasLiabilities && primaryMetric === 'shareholders_equity' && row.value != null && row.total_liabilities != null) {
      const debtToEquity = row.total_liabilities / row.value
      ratios.push(parseFloat(debtToEquity.toFixed(2)))
    }

    // Debt-to-Assets ratio (total_liabilities / total_assets)
    if (hasAssets && primaryMetric === 'total_liabilities' && row.value != null && row.total_assets != null) {
      const debtToAssets = row.value / row.total_assets
      ratios.push(parseFloat(debtToAssets.toFixed(2)))
    }

    // Asset Turnover (revenue / total_assets)
    if (hasRevenue && hasAssets && primaryMetric === 'total_assets' && row.value != null && row.revenue != null) {
      const turnover = row.revenue / row.value
      ratios.push(parseFloat(turnover.toFixed(2)))
    }
  }

  return ratios
}

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
  // Check if this is a ratio calculation scenario
  const ratioMetrics = detectRatioMetrics(data)
  const isRatioCalculation = ratioMetrics.hasRevenue || ratioMetrics.hasShareholders || ratioMetrics.hasLiabilities || ratioMetrics.hasAssets

  // Extract percentages and absolute numbers
  const mentionedPercentages = extractPercentages(answer)
  const mentionedNumbers = extractNumbers(answer)

  // Track all validations
  let totalMentioned = 0
  let totalMatched = 0
  let totalUnmatched = 0
  const validationDetails: string[] = []

  // ============================================================================
  // RATIO VALIDATION (if applicable)
  // ============================================================================
  if (isRatioCalculation && mentionedPercentages.length > 0) {
    const expectedRatios = calculateRatios(data)

    const unmatchedPercentages: number[] = []
    const matchedPercentages: Array<{ mentioned: number; expected: number; percentDiff: number }> = []

    for (const mentioned of mentionedPercentages) {
      const match = findClosestMatch(mentioned, expectedRatios, 0.5) // Allow 0.5% tolerance for ratios

      if (match.found && match.actual !== undefined && match.percentDiff !== undefined) {
        matchedPercentages.push({
          mentioned,
          expected: match.actual,
          percentDiff: match.percentDiff,
        })
        totalMatched++
      } else {
        unmatchedPercentages.push(mentioned)
        totalUnmatched++
      }
      totalMentioned++
    }

    if (matchedPercentages.length > 0) {
      validationDetails.push(`Ratios: ${matchedPercentages.length}/${mentionedPercentages.length} validated`)
    }
    if (unmatchedPercentages.length > 0) {
      validationDetails.push(`Ratios: ${unmatchedPercentages.length} unmatched`)
    }
  }

  // ============================================================================
  // ABSOLUTE NUMBER VALIDATION
  // ============================================================================
  if (mentionedNumbers.length > 0) {
    // Extract all numeric values from the data
    const dataNumbers: number[] = []

    // Guard: skip validation if data is not an array or is a summary object
    if (Array.isArray(data) && !(data.length > 0 && data[0] && 'summary' in data[0])) {
      for (const row of data) {
        if (row.value !== undefined && row.value !== null) {
          dataNumbers.push(Number(row.value))
        }
        // Also check for price data
        if (row.close !== undefined && row.close !== null) {
          dataNumbers.push(Number(row.close))
        }
        // Include related metrics for validation
        if (row.revenue !== undefined && row.revenue !== null) {
          dataNumbers.push(Number(row.revenue))
        }
      }
    }

    if (dataNumbers.length > 0) {
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
          totalMatched++
        } else {
          unmatchedNumbers.push(mentioned)
          totalUnmatched++
        }
        totalMentioned++
      }

      if (matchedNumbers.length > 0) {
        validationDetails.push(`Numbers: ${matchedNumbers.length}/${mentionedNumbers.length} validated`)
      }
      if (unmatchedNumbers.length > 0) {
        validationDetails.push(`Numbers: ${unmatchedNumbers.length} unmatched`)
      }
    }
  }

  // ============================================================================
  // DETERMINE OVERALL RESULT
  // ============================================================================

  // Skip validation if nothing to validate
  if (totalMentioned === 0) {
    return {
      status: 'skip',
      details: 'No numbers or percentages found in answer',
      metadata: {
        mentioned_count: 0,
        data_count: 0,
      },
    }
  }

  // All validated successfully
  if (totalUnmatched === 0) {
    return {
      status: 'pass',
      severity: 'none',
      details: `All ${totalMentioned} values validated: ${validationDetails.join(', ')}`,
      metadata: {
        mentioned_count: totalMentioned,
        matched_count: totalMatched,
        is_ratio_calculation: isRatioCalculation,
        tolerance_percent: 0.5,
      },
    }
  }

  // Calculate severity based on failure rate
  const failureRate = totalUnmatched / totalMentioned
  let severity: ValidationSeverity = 'low'

  if (failureRate >= 0.5) {
    severity = 'high' // 50%+ of values wrong
  } else if (failureRate >= 0.25) {
    severity = 'medium' // 25-50% of values wrong
  }

  return {
    status: 'fail',
    severity,
    details: `${totalUnmatched} of ${totalMentioned} values could not be validated: ${validationDetails.join(', ')}`,
    metadata: {
      mentioned_count: totalMentioned,
      matched_count: totalMatched,
      unmatched_count: totalUnmatched,
      is_ratio_calculation: isRatioCalculation,
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

  // Guard: skip if data is not an array or is a summary object
  if (Array.isArray(data) && !(data.length > 0 && data[0] && 'summary' in data[0])) {
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

  // Guard: skip if data is not an array or is a summary object
  if (Array.isArray(data) && !(data.length > 0 && data[0] && 'summary' in data[0])) {
    for (const row of data) {
      if (row.filing_type && row.filing_date) {
        dataFilings.push({
          type: row.filing_type.toUpperCase(),
          date: row.filing_date,
        })
      }
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
