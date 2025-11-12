import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type FeedbackAnalysisRequest = {
  question: string
  question_id: number
  expected_tool: string
  expected_args: Record<string, any>
  actual_tool: string | null
  actual_args: Record<string, any> | null
  initial_analysis: string
  user_disagreement: string
}

export async function POST(request: NextRequest) {
  try {
    const body: FeedbackAnalysisRequest = await request.json()

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
    console.error('Feedback analysis error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze feedback' },
      { status: 500 }
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
