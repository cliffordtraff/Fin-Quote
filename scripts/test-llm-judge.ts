/**
 * Test LLM-as-Judge with example answers
 *
 * This demonstrates the difference between testing tool selection vs answer quality
 */

import OpenAI from 'openai'
import dotenv from 'dotenv'
import { evaluateAnswerQuality } from '../lib/llm-judge'

dotenv.config({ path: '.env.local' })

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function testLLMJudge() {
  console.log('🧪 Testing LLM-as-Judge\n')
  console.log('This shows how we can evaluate answer QUALITY, not just tool selection.\n')

  // Example scenario
  const question = "What's AAPL's revenue trend over 5 years?"

  const sourceData = {
    metric: 'revenue',
    data: [
      { year: 2020, value: 274515000000 },
      { year: 2021, value: 365817000000 },
      { year: 2022, value: 394328000000 },
      { year: 2023, value: 383285000000 },
      { year: 2024, value: 391035000000 },
    ],
  }

  // Bad Answer: Only mentions 1 year despite having 5 years of data
  const badAnswer = "Apple's revenue in 2024 was $391.04 billion."

  // Good Answer: Uses all data, describes trend, provides insight
  const goodAnswer =
    "Apple's revenue showed strong growth over the past 5 years, rising from $274.5B in 2020 to $391.0B in 2024. The company saw rapid growth from 2020-2022 (up 44%), but revenue plateaued in 2023-2024, fluctuating between $383B-$394B. Overall, revenue is up 42% over the 5-year period."

  // Hallucinated Answer: Contains made-up numbers
  const hallucinatedAnswer =
    "Apple's revenue grew from $280B in 2020 to $450B in 2024, showing consistent double-digit growth every year."

  console.log('═'.repeat(70))
  console.log('SCENARIO 1: Bad Answer (Only mentions 1 year)')
  console.log('═'.repeat(70))
  console.log(`Question: "${question}"`)
  console.log(`Answer: "${badAnswer}"\n`)

  console.log('Evaluating with GPT-4...\n')

  const score1 = await evaluateAnswerQuality(question, badAnswer, sourceData, openai)

  console.log('📊 SCORES:')
  console.log(`   Accuracy:     ${score1.accuracy}/10`)
  console.log(`   Relevance:    ${score1.relevance}/10`)
  console.log(`   Completeness: ${score1.completeness}/10`)
  console.log(`   Insight:      ${score1.insight}/10`)
  console.log(`   OVERALL:      ${score1.overall}/10`)
  console.log(`\n💭 Reasoning: ${score1.reasoning}\n`)

  console.log('═'.repeat(70))
  console.log('SCENARIO 2: Good Answer (Uses all data, provides insight)')
  console.log('═'.repeat(70))
  console.log(`Question: "${question}"`)
  console.log(`Answer: "${goodAnswer}"\n`)

  console.log('Evaluating with GPT-4...\n')

  const score2 = await evaluateAnswerQuality(question, goodAnswer, sourceData, openai)

  console.log('📊 SCORES:')
  console.log(`   Accuracy:     ${score2.accuracy}/10`)
  console.log(`   Relevance:    ${score2.relevance}/10`)
  console.log(`   Completeness: ${score2.completeness}/10`)
  console.log(`   Insight:      ${score2.insight}/10`)
  console.log(`   OVERALL:      ${score2.overall}/10`)
  console.log(`\n💭 Reasoning: ${score2.reasoning}\n`)

  console.log('═'.repeat(70))
  console.log('SCENARIO 3: Hallucinated Answer (Contains made-up numbers)')
  console.log('═'.repeat(70))
  console.log(`Question: "${question}"`)
  console.log(`Answer: "${hallucinatedAnswer}"\n`)

  console.log('Evaluating with GPT-4...\n')

  const score3 = await evaluateAnswerQuality(
    question,
    hallucinatedAnswer,
    sourceData,
    openai
  )

  console.log('📊 SCORES:')
  console.log(`   Accuracy:     ${score3.accuracy}/10`)
  console.log(`   Relevance:    ${score3.relevance}/10`)
  console.log(`   Completeness: ${score3.completeness}/10`)
  console.log(`   Insight:      ${score3.insight}/10`)
  console.log(`   OVERALL:      ${score3.overall}/10`)
  console.log(`\n💭 Reasoning: ${score3.reasoning}\n`)

  console.log('═'.repeat(70))
  console.log('SUMMARY')
  console.log('═'.repeat(70))
  console.log(
    `Bad Answer (incomplete):       ${score1.overall}/10 ⚠️  ${getGrade(score1.overall)}`
  )
  console.log(
    `Good Answer (comprehensive):   ${score2.overall}/10 ✅  ${getGrade(score2.overall)}`
  )
  console.log(
    `Hallucinated Answer (wrong):   ${score3.overall}/10 ❌  ${getGrade(score3.overall)}`
  )
  console.log('\n💡 KEY INSIGHT:')
  console.log(
    '   Without LLM-as-judge, all three answers would "pass" if they used'
  )
  console.log(
    '   the correct tool. But only the good answer is actually helpful!\n'
  )
}

function getGrade(score: number): string {
  if (score >= 9) return 'Excellent'
  if (score >= 7) return 'Good'
  if (score >= 5) return 'Acceptable'
  if (score >= 3) return 'Poor'
  return 'Very Poor'
}

testLLMJudge().catch((error) => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
