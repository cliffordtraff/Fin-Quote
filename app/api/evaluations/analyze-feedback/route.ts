import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/auth/admin'
import {
  evaluationApiErrorResponse,
  parseEvaluationRequest,
} from '@/app/api/evaluations/_shared'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const feedbackAnalysisRequestSchema = z.object({
  question: z.string().trim().min(1).max(4_000),
  question_id: z.number().int().nonnegative().max(1_000_000_000),
  expected_tool: z.string().trim().min(1).max(128),
  expected_args: z.record(z.string(), z.unknown()),
  actual_tool: z.string().trim().min(1).max(128).nullable(),
  actual_args: z.record(z.string(), z.unknown()).nullable(),
  initial_analysis: z.string().trim().min(1).max(12_000),
  user_disagreement: z.string().trim().min(1).max(4_000),
}).strict()

type FeedbackAnalysisRequest = z.infer<typeof feedbackAnalysisRequestSchema>

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser()
    const body = await parseEvaluationRequest(
      request,
      feedbackAnalysisRequestSchema,
    )

    const prompt = buildFeedbackAnalysisPrompt(body)

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are Claude, an AI assistant helping to improve a financial Q&A system. A human evaluator has disagreed with your initial analysis. Your job is to:

1. Acknowledge their perspective respectfully
2. Understand the reasoning behind their disagreement
3. Provide an updated recommendation that incorporates their feedback
4. Learn from this to improve future analyses

Be humble, curious, and collaborative. Remember: the human has domain expertise and knows their product better than you do.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5,
    })

    const followupAnalysis = completion.choices[0].message.content

    return NextResponse.json({
      followup_analysis: followupAnalysis,
      question_id: body.question_id,
    })
  } catch (error) {
    return evaluationApiErrorResponse(
      error,
      'Failed to analyze feedback.',
    )
  }
}

function buildFeedbackAnalysisPrompt(data: FeedbackAnalysisRequest): string {
  const {
    question,
    expected_tool,
    expected_args,
    actual_tool,
    actual_args,
    initial_analysis,
    user_disagreement
  } = data

  return `Here's the situation:

**User Question:** "${question}"

**Expected vs Actual:**
Expected: ${expected_tool} with ${JSON.stringify(expected_args)}
Actual: ${actual_tool} with ${JSON.stringify(actual_args)}

**Your Initial Analysis:**
${initial_analysis}

**Human's Feedback (They Disagreed):**
"${user_disagreement}"

---

Please respond with:

1. **Acknowledgment:** Thank them for the feedback and show you understand their point
2. **Updated Understanding:** Explain what you learned from their perspective
3. **New Recommendation:** Based on their feedback, what should be done?
4. **Question (if needed):** If anything is still unclear, ask a clarifying question

Keep your response conversational and concise (3-4 sentences).`
}
