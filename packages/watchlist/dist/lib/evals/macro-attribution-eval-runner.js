/**
 * Macro Attribution Eval Runner
 *
 * Runs eval test cases and validates attribution accuracy
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * Validate AI output against expected criteria
 */
export function validateEvalOutput(testCase, actualOutput) {
    const failures = [];
    const warnings = [];
    let score = 1.0;
    // 1. Check attribution type alignment (most critical)
    const attributionScore = checkAttributionType(testCase, actualOutput, failures);
    score *= attributionScore;
    // 2. Check primary driver content
    if (testCase.expected.primaryDriverMustInclude) {
        const driverScore = checkPrimaryDriver(testCase.expected.primaryDriverMustInclude, testCase.expected.primaryDriverMustNotInclude || [], actualOutput.primaryDriver, failures, warnings);
        score *= driverScore;
    }
    // 3. Check narrative content
    if (testCase.expected.narrativeMustInclude) {
        const narrativeScore = checkNarrative(testCase.expected.narrativeMustInclude, actualOutput.narrative, failures, warnings);
        score *= narrativeScore;
    }
    // 4. Check sentiment range
    const sentimentScore = checkSentiment(testCase.expected.sentimentRange, actualOutput.sentiment, failures);
    score *= sentimentScore;
    // 5. Check score range
    const scoreRangeScore = checkScoreRange(testCase.expected.scoreRange, actualOutput.score, failures);
    score *= scoreRangeScore;
    // 6. Check confidence range
    const confidenceScore = checkConfidenceRange(testCase.expected.confidenceRange, actualOutput.confidence, warnings);
    // Confidence is less critical, only reduce score by 50% of the miss
    if (confidenceScore < 1.0) {
        score *= (1.0 + confidenceScore) / 2;
    }
    const passed = failures.length === 0 && score >= 0.7;
    return {
        testId: testCase.id,
        testName: testCase.name,
        passed,
        score,
        failures,
        warnings,
        actualOutput,
    };
}
/**
 * Check attribution type alignment
 * This is the most critical check - worth 40% of score
 */
function checkAttributionType(testCase, output, failures) {
    const expected = testCase.expected.attributionType;
    const primaryDriver = output.primaryDriver.toLowerCase();
    // Determine actual attribution type from output
    let actualType = 'company';
    if (primaryDriver.includes('no clear catalyst') || primaryDriver.includes('without clear catalyst')) {
        actualType = 'no_clear_catalyst';
    }
    else if (primaryDriver.includes('market') ||
        primaryDriver.includes('tariff') ||
        primaryDriver.includes('fed') ||
        primaryDriver.includes('geopolitical') ||
        primaryDriver.includes('cpi') ||
        primaryDriver.includes('economic data')) {
        actualType = 'macro';
    }
    else if (primaryDriver.includes('earnings') ||
        primaryDriver.includes('acquisition') ||
        primaryDriver.includes('recall') ||
        primaryDriver.includes('revenue') ||
        primaryDriver.includes('guidance')) {
        actualType = 'company';
    }
    if (actualType !== expected) {
        failures.push(`Attribution type mismatch: expected "${expected}", got "${actualType}". ` +
            `Primary driver: "${output.primaryDriver}". ` +
            `Reasoning: ${testCase.expected.reasoning}`);
        return 0.0;
    }
    return 1.0;
}
/**
 * Check primary driver includes required keywords
 */
function checkPrimaryDriver(mustInclude, mustNotInclude, primaryDriver, failures, warnings) {
    const lower = primaryDriver.toLowerCase();
    let score = 1.0;
    // Check must-include keywords
    const missing = mustInclude.filter(keyword => !lower.includes(keyword.toLowerCase()));
    if (missing.length > 0) {
        failures.push(`Primary driver missing required keywords: ${missing.join(', ')}. ` +
            `Actual: "${primaryDriver}"`);
        score *= (mustInclude.length - missing.length) / mustInclude.length;
    }
    // Check must-not-include keywords
    const unwanted = mustNotInclude.filter(keyword => lower.includes(keyword.toLowerCase()));
    if (unwanted.length > 0) {
        failures.push(`Primary driver contains prohibited keywords: ${unwanted.join(', ')}. ` +
            `Actual: "${primaryDriver}"`);
        score *= 0.5; // Major penalty for including wrong attribution
    }
    return score;
}
/**
 * Check narrative includes required content
 */
function checkNarrative(mustInclude, narrative, failures, warnings) {
    const lower = narrative.toLowerCase();
    let score = 1.0;
    const missing = mustInclude.filter(keyword => !lower.includes(keyword.toLowerCase()));
    if (missing.length > 0) {
        warnings.push(`Narrative missing suggested keywords: ${missing.join(', ')}. ` +
            `Actual: "${narrative}"`);
        score *= 0.8; // Narrative is less critical than primary driver
    }
    return score;
}
/**
 * Check sentiment is within expected range
 */
function checkSentiment(expectedRange, actualSentiment, failures) {
    const sentimentOrder = ['bearish', 'neutral', 'bullish'];
    const minIndex = sentimentOrder.indexOf(expectedRange.min);
    const maxIndex = sentimentOrder.indexOf(expectedRange.max);
    const actualIndex = sentimentOrder.indexOf(actualSentiment);
    if (actualIndex < minIndex || actualIndex > maxIndex) {
        failures.push(`Sentiment out of range: expected ${expectedRange.min}-${expectedRange.max}, got ${actualSentiment}`);
        return 0.5; // Moderate penalty
    }
    return 1.0;
}
/**
 * Check score is within expected range
 */
function checkScoreRange(expectedRange, actualScore, failures) {
    if (actualScore < expectedRange.min || actualScore > expectedRange.max) {
        failures.push(`Score out of range: expected ${expectedRange.min} to ${expectedRange.max}, got ${actualScore}`);
        // Calculate how far off we are
        const midpoint = (expectedRange.min + expectedRange.max) / 2;
        const distance = Math.abs(actualScore - midpoint);
        const range = expectedRange.max - expectedRange.min;
        const penalty = Math.min(distance / range, 1.0);
        return 1.0 - (penalty * 0.5); // Up to 50% penalty
    }
    return 1.0;
}
/**
 * Check confidence is within expected range
 * (Less critical than other metrics)
 */
function checkConfidenceRange(expectedRange, actualConfidence, warnings) {
    if (actualConfidence < expectedRange.min || actualConfidence > expectedRange.max) {
        warnings.push(`Confidence out of range: expected ${expectedRange.min} to ${expectedRange.max}, got ${actualConfidence}`);
        // Calculate penalty (less severe than score penalty)
        const midpoint = (expectedRange.min + expectedRange.max) / 2;
        const distance = Math.abs(actualConfidence - midpoint);
        const range = expectedRange.max - expectedRange.min;
        const penalty = Math.min(distance / range, 1.0);
        return 1.0 - (penalty * 0.3); // Up to 30% penalty
    }
    return 1.0;
}
/**
 * Run all evals and generate summary
 */
export function runEvals(testCases, getOutputForTestCase) {
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        const results = [];
        for (const testCase of testCases) {
            try {
                const startTime = Date.now();
                const output = yield getOutputForTestCase(testCase);
                const executionTimeMs = Date.now() - startTime;
                const result = validateEvalOutput(testCase, output);
                result.executionTimeMs = executionTimeMs;
                results.push(result);
            }
            catch (error) {
                results.push({
                    testId: testCase.id,
                    testName: testCase.name,
                    passed: false,
                    score: 0,
                    failures: [`Execution error: ${error instanceof Error ? error.message : String(error)}`],
                    warnings: []
                });
            }
        }
        const passed = results.filter(r => r.passed).length;
        const failed = results.length - passed;
        const passRate = results.length > 0 ? passed / results.length : 0;
        const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
        resolve({
            totalTests: results.length,
            passed,
            failed,
            passRate,
            averageScore,
            results,
            timestamp: new Date()
        });
    }));
}
/**
 * Check if deployment gate passes (80% pass rate required)
 */
export function checkDeploymentGate(summary) {
    const REQUIRED_PASS_RATE = 0.80; // 80%
    const REQUIRED_AVG_SCORE = 0.75; // 75%
    if (summary.passRate < REQUIRED_PASS_RATE) {
        return {
            canDeploy: false,
            reason: `Pass rate ${(summary.passRate * 100).toFixed(1)}% below required ${(REQUIRED_PASS_RATE * 100).toFixed(1)}%`
        };
    }
    if (summary.averageScore < REQUIRED_AVG_SCORE) {
        return {
            canDeploy: false,
            reason: `Average score ${(summary.averageScore * 100).toFixed(1)}% below required ${(REQUIRED_AVG_SCORE * 100).toFixed(1)}%`
        };
    }
    return {
        canDeploy: true,
        reason: 'All deployment gates passed'
    };
}
/**
 * Format eval summary for console output
 */
export function formatEvalSummary(summary) {
    const lines = [];
    lines.push('='.repeat(70));
    lines.push('Macro Attribution Eval Summary');
    lines.push('='.repeat(70));
    lines.push(`Timestamp: ${summary.timestamp.toISOString()}`);
    lines.push(`Total Tests: ${summary.totalTests}`);
    lines.push(`Passed: ${summary.passed} (${(summary.passRate * 100).toFixed(1)}%)`);
    lines.push(`Failed: ${summary.failed}`);
    lines.push(`Average Score: ${(summary.averageScore * 100).toFixed(1)}%`);
    lines.push('');
    // Deployment gate check
    const gate = checkDeploymentGate(summary);
    const gateIcon = gate.canDeploy ? '✅' : '❌';
    lines.push(`${gateIcon} Deployment Gate: ${gate.reason}`);
    lines.push('');
    // Individual results
    lines.push('Test Results:');
    lines.push('-'.repeat(70));
    for (const result of summary.results) {
        const icon = result.passed ? '✅' : '❌';
        const scoreStr = `${(result.score * 100).toFixed(0)}%`;
        lines.push(`${icon} [${scoreStr}] ${result.testName}`);
        if (result.failures.length > 0) {
            result.failures.forEach(f => {
                lines.push(`    ❌ ${f}`);
            });
        }
        if (result.warnings.length > 0) {
            result.warnings.forEach(w => {
                lines.push(`    ⚠️  ${w}`);
            });
        }
        if (result.executionTimeMs) {
            lines.push(`    ⏱️  ${result.executionTimeMs}ms`);
        }
        lines.push('');
    }
    lines.push('='.repeat(70));
    return lines.join('\n');
}
