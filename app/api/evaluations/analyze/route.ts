import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type AnalysisRequest = {
  question: string
  question_id: number
  expected_tool: string
  expected_args: Record<string, any>
  actual_tool: string | null
  actual_args: Record<string, any> | null
  tool_match: boolean
}

type BatchAnalysisRequest = {
  questions: AnalysisRequest[]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Check if this is a batch request
    if ('questions' in body && Array.isArray(body.questions)) {
      return handleBatchAnalysis(body as BatchAnalysisRequest)
    }

    // Single question analysis (legacy support)
    return handleSingleAnalysis(body as AnalysisRequest)
  } catch (error) {
    console.error('Analysis error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze question' },
      { status: 500 }
    )
  }
}

async function handleBatchAnalysis(body: BatchAnalysisRequest) {
  const { questions } = body

  console.log(`🔍 Analyzing ${questions.length} questions in batch...`)

  // Analyze all questions in parallel
  const analysisPromises = questions.map(async (question) => {
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
  })

  const results = await Promise.all(analysisPromises)

  console.log(`✅ Batch analysis complete for ${results.length} questions`)

  return NextResponse.json({
    analyses: results,
  })
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
