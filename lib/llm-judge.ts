/**
 * LLM-as-Judge: Use GPT-4 to evaluate answer quality
 *
 * This evaluates whether an AI-generated answer is actually good,
 * beyond just checking if it used the right tool.
 */

import OpenAI from 'openai'

export interface AnswerQualityScore {
  accuracy: number // 1-10: Are numbers/facts correct?
  relevance: number // 1-10: Does it answer the question?
  completeness: number // 1-10: Uses all provided data?
  insight: number // 1-10: Provides helpful context?
  overall: number // 1-10: Overall quality
  reasoning: string // Explanation of the scores
}

export async function evaluateAnswerQuality(
  question: string,
  answer: string,
  sourceData: any,
  openai: OpenAI
): Promise<AnswerQualityScore> {
  const prompt = buildJudgePrompt(question, answer, sourceData)

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert evaluator of AI-generated financial answers. Grade answers objectively and explain your reasoning.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0, // Deterministic grading
    })

    const result = JSON.parse(response.choices[0].message.content || '{}')

    return {
      accuracy: result.accuracy_score || 0,
      relevance: result.relevance_score || 0,
      completeness: result.completeness_score || 0,
      insight: result.insight_score || 0,
      overall: result.overall_score || 0,
      reasoning: result.reasoning || 'No reasoning provided',
    }
  } catch (error) {
    console.error('LLM-as-judge error:', error)
    return {
      accuracy: 0,
      relevance: 0,
      completeness: 0,
      insight: 0,
      overall: 0,
      reasoning: `Error during evaluation: ${error}`,
    }
  }
}

function buildJudgePrompt(
  question: string,
  answer: string,
  sourceData: any
): string {
  return `You are grading an AI's answer to a financial question.

QUESTION ASKED BY USER:
"${question}"

DATA PROVIDED TO THE AI:
${formatSourceData(sourceData)}

AI'S ANSWER:
"${answer}"

Grade this answer on these criteria (1-10 scale for each):

1. ACCURACY (1-10)
   - Are all numbers, dates, and facts correct based on the source data?
   - Any hallucinations or made-up information?
   - Proper formatting (e.g., "$383.3B" not "383300000000")?

2. RELEVANCE (1-10)
   - Does the answer directly address what the user asked?
   - If user asked for a "trend", does it describe a trend?
   - If user asked for multiple years, does it cover them?

3. COMPLETENESS (1-10)
   - Does it use all the relevant data provided?
   - If given 5 years of data, does it mention all 5?
   - Are there important details missing?

4. INSIGHT (1-10)
   - Does it provide helpful context (percentages, comparisons, patterns)?
   - Is it just a data dump, or does it interpret the data?
   - Would this answer actually help the user?

5. OVERALL (1-10)
   - Considering all factors, how good is this answer?
   - Would you be satisfied if you asked this question?

GRADING GUIDELINES:
- 9-10: Excellent, comprehensive, insightful answer
- 7-8: Good answer, covers the basics well
- 5-6: Acceptable but missing key details
- 3-4: Poor answer, major gaps or errors
- 1-2: Very poor, barely answers the question

Return ONLY valid JSON in this exact format:
{
  "accuracy_score": <number 1-10>,
  "relevance_score": <number 1-10>,
  "completeness_score": <number 1-10>,
  "insight_score": <number 1-10>,
  "overall_score": <number 1-10>,
  "reasoning": "<2-3 sentence explanation of your grading>"
}

Be strict but fair. An answer that only uses 1 year when 5 were provided should score low on completeness. An answer without context or insight should score low on that dimension.`
}

function formatSourceData(sourceData: any): string {
  if (Array.isArray(sourceData)) {
    // Financial data array
    return JSON.stringify(sourceData, null, 2)
  } else if (typeof sourceData === 'object') {
    // Object data (prices, filings, etc.)
    return JSON.stringify(sourceData, null, 2)
  } else {
    return String(sourceData)
  }
}

/**
 * Batch evaluate multiple answers (for full test runs)
 */
export async function batchEvaluateAnswers(
  evaluations: Array<{
    question: string
    answer: string
    sourceData: any
  }>,
  openai: OpenAI,
  onProgress?: (current: number, total: number) => void
): Promise<AnswerQualityScore[]> {
  const results: AnswerQualityScore[] = []

  for (let i = 0; i < evaluations.length; i++) {
    const { question, answer, sourceData } = evaluations[i]

    if (onProgress) {
      onProgress(i + 1, evaluations.length)
    }

    const score = await evaluateAnswerQuality(question, answer, sourceData, openai)
    results.push(score)

    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  return results
}

/**
 * Calculate aggregate statistics from quality scores
 */
export function calculateQualityStats(scores: AnswerQualityScore[]): {
  avgAccuracy: number
  avgRelevance: number
  avgCompleteness: number
  avgInsight: number
  avgOverall: number
  excellentCount: number // 9-10
  goodCount: number // 7-8
  poorCount: number // 1-4
} {
  if (scores.length === 0) {
    return {
      avgAccuracy: 0,
      avgRelevance: 0,
      avgCompleteness: 0,
      avgInsight: 0,
      avgOverall: 0,
      excellentCount: 0,
      goodCount: 0,
      poorCount: 0,
    }
  }

  const sum = scores.reduce(
    (acc, score) => ({
      accuracy: acc.accuracy + score.accuracy,
      relevance: acc.relevance + score.relevance,
      completeness: acc.completeness + score.completeness,
      insight: acc.insight + score.insight,
      overall: acc.overall + score.overall,
    }),
    { accuracy: 0, relevance: 0, completeness: 0, insight: 0, overall: 0 }
  )

  const count = scores.length

  const excellentCount = scores.filter((s) => s.overall >= 9).length
  const goodCount = scores.filter((s) => s.overall >= 7 && s.overall < 9).length
  const poorCount = scores.filter((s) => s.overall < 5).length

  return {
    avgAccuracy: sum.accuracy / count,
    avgRelevance: sum.relevance / count,
    avgCompleteness: sum.completeness / count,
    avgInsight: sum.insight / count,
    avgOverall: sum.overall / count,
    excellentCount,
    goodCount,
    poorCount,
  }
}
