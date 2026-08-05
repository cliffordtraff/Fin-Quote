import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/auth/admin'
import {
  evaluationApiErrorResponse,
  parseEvaluationRequest,
} from '@/app/api/evaluations/_shared'

export const maxDuration = 60

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const MAX_BATCH_QUESTIONS = 20
const ANALYSIS_CONCURRENCY = 5

const analysisRequestSchema = z.object({
  question: z.string().trim().min(1).max(4_000),
  question_id: z.number().int().nonnegative().max(1_000_000_000),
  expected_tool: z.string().trim().min(1).max(128),
  expected_args: z.record(z.string(), z.unknown()),
  actual_tool: z.string().trim().min(1).max(128).nullable(),
  actual_args: z.record(z.string(), z.unknown()).nullable(),
  tool_match: z.boolean(),
}).strict()

const batchAnalysisRequestSchema = z.object({
  questions: z.array(analysisRequestSchema).min(1).max(MAX_BATCH_QUESTIONS),
}).strict()

const analysisPayloadSchema = z.union([
  batchAnalysisRequestSchema,
  analysisRequestSchema,
])

type AnalysisRequest = z.infer<typeof analysisRequestSchema>
type BatchAnalysisRequest = z.infer<typeof batchAnalysisRequestSchema>
type AnalysisPayload = z.infer<typeof analysisPayloadSchema>

function isBatchAnalysisRequest(
  body: AnalysisPayload,
): body is BatchAnalysisRequest {
  return 'questions' in body
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser()
    const body = await parseEvaluationRequest(request, analysisPayloadSchema)

    // Check if this is a batch request
    if (isBatchAnalysisRequest(body)) {
      return handleBatchAnalysis(body)
    }

    // Single question analysis (legacy support)
    return handleSingleAnalysis(body)
  } catch (error) {
    return evaluationApiErrorResponse(
      error,
      'Failed to analyze question.',
    )
  }
}

async function handleBatchAnalysis(body: BatchAnalysisRequest) {
  const { questions } = body

  console.log(`🔍 Analyzing ${questions.length} questions in batch...`)

  const results = []
  for (let index = 0; index < questions.length; index += ANALYSIS_CONCURRENCY) {
    const batch = questions.slice(index, index + ANALYSIS_CONCURRENCY)
    results.push(...await Promise.all(batch.map(analyzeQuestion)))
  }

  console.log(`✅ Batch analysis complete for ${results.length} questions`)

  return NextResponse.json({
    analyses: results,
  })
}

async function analyzeQuestion(question: AnalysisRequest) {
  const prompt = buildAnalysisPrompt(question)

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert evaluation assistant helping to analyze failed test cases for a financial Q&A system.

Your job is to:
1. Determine if the golden test (expected output) is correct, or if the AI's actual output is better
2. Provide clear reasoning for your opinion
3. Recommend a specific action (fix prompt, update golden test, or accept both)

Be concise but thorough. Think from the perspective of what a real user would want.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
  })

  return {
    question_id: question.question_id,
    analysis: completion.choices[0].message.content,
  }
}

async function handleSingleAnalysis(body: AnalysisRequest) {
  const prompt = buildAnalysisPrompt(body)

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert evaluation assistant helping to analyze failed test cases for a financial Q&A system.

Your job is to:
1. Determine if the golden test (expected output) is correct, or if the AI's actual output is better
2. Provide clear reasoning for your opinion
3. Recommend a specific action (fix prompt, update golden test, or accept both)

Be concise but thorough. Think from the perspective of what a real user would want.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
  })

  const analysis = completion.choices[0].message.content

  return NextResponse.json({
    analysis,
    question_id: body.question_id,
  })
}

function buildAnalysisPrompt(data: AnalysisRequest): string {
  const { question, expected_tool, expected_args, actual_tool, actual_args, tool_match } = data

  return `Analyze this failed test case:

**User Question:** "${question}"

**Expected Output (Golden Test):**
Tool: ${expected_tool}
Args: ${JSON.stringify(expected_args, null, 2)}

**Actual Output (AI Selected):**
Tool: ${actual_tool || 'null'}
Args: ${JSON.stringify(actual_args || {}, null, 2)}

**Status:** ${tool_match ? 'Correct tool, wrong arguments' : 'Wrong tool'}

Please provide your analysis in this format:

**Verdict:** [Choose ONE: "Golden test is correct" | "AI is correct" | "Both are reasonable" | "Need more context"]

**Reasoning:** [2-3 sentences explaining your verdict. Focus on user intent and semantic meaning.]

**Recommended Action:** [Choose ONE: "Fix the prompt" | "Update the golden test" | "Accept both as valid" | "Needs clarification"]

**Suggested Fix:** [If recommending a fix, provide 1-2 sentences of specific guidance on what to change]

Keep your response concise and actionable.`
}
