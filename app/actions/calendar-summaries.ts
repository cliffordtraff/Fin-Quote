'use server'

import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Create Supabase client for caching
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// In-memory cache as fallback + faster first check
let cachedSummaries: { economicSummary: string; earningsSummary: string; timestamp: number } | null = null
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface EconomicEvent {
  date: string
  event: string
  impact: string
  previous: number | null
  estimate: number | null
}

interface EarningsEvent {
  symbol: string
  name: string
  date: string
  time: 'bmo' | 'amc' | 'dmh' | null
}

interface CalendarSummariesResult {
  economicSummary: string
  earningsSummary: string
  error?: string
}

export async function getCalendarSummaries(
  economicEvents: EconomicEvent[],
  earningsEvents: EarningsEvent[],
  forceRefresh?: boolean
): Promise<CalendarSummariesResult> {
  console.log('[Calendar Summaries] Called with', economicEvents.length, 'economic events and', earningsEvents.length, 'earnings events, forceRefresh:', forceRefresh)
  const now = Date.now()

  if (!forceRefresh) {
    // 1. Check in-memory cache first (fastest)
    if (cachedSummaries && (now - cachedSummaries.timestamp) < CACHE_TTL_MS) {
      console.log('[Calendar Summaries] Returning in-memory cached summaries (age:', Math.round((now - cachedSummaries.timestamp) / 1000), 'seconds)')
      return {
        economicSummary: cachedSummaries.economicSummary,
        earningsSummary: cachedSummaries.earningsSummary,
      }
    }

    // 2. Check Supabase cache
    console.log('[Calendar Summaries] Checking Supabase cache...')
    try {
      const { data: dbCache, error } = await supabase
        .from('calendar_summaries_cache')
        .select('economic_summary, earnings_summary, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.log('[Calendar Summaries] Supabase query error:', error.message)
      } else if (dbCache) {
        const cacheAge = now - new Date(dbCache.created_at).getTime()
        console.log('[Calendar Summaries] Found Supabase cache, age:', Math.round(cacheAge / 1000), 'seconds')
        if (cacheAge < CACHE_TTL_MS) {
          console.log('[Calendar Summaries] Returning Supabase cached summaries')
          cachedSummaries = {
            economicSummary: dbCache.economic_summary,
            earningsSummary: dbCache.earnings_summary,
            timestamp: new Date(dbCache.created_at).getTime()
          }
          return {
            economicSummary: dbCache.economic_summary,
            earningsSummary: dbCache.earnings_summary,
          }
        } else {
          console.log('[Calendar Summaries] Supabase cache expired')
        }
      } else {
        console.log('[Calendar Summaries] No Supabase cache entry found')
      }
    } catch (dbError) {
      console.log('[Calendar Summaries] Supabase cache check failed:', dbError)
    }
  } else {
    console.log('[Calendar Summaries] Force refresh - skipping cache')
  }

  try {
    const model = process.env.OPENAI_MODEL || 'gpt-5'
    console.log('[Calendar Summaries] Using model:', model)

    // Build context for economic events
    const economicContext = economicEvents.slice(0, 10).map(e => {
      const date = new Date(e.date)
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
      return `- ${dayName}: ${e.event} (${e.impact} impact)`
    }).join('\n')

    // Build context for earnings events
    const earningsContext = earningsEvents.slice(0, 10).map(e => {
      const date = new Date(e.date + 'T12:00:00')
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
      const timeLabel = e.time === 'bmo' ? 'before open' : e.time === 'amc' ? 'after close' : ''
      return `- ${dayName}: ${e.name} (${e.symbol})${timeLabel ? ` ${timeLabel}` : ''}`
    }).join('\n')

    const prompt = `Generate two brief, one-sentence summaries for financial calendars. Be specific about key events and companies. No filler words.

ECONOMIC CALENDAR EVENTS:
${economicContext || 'No upcoming events'}

EARNINGS CALENDAR:
${earningsContext || 'No upcoming earnings'}

Respond in this exact JSON format:
{
  "economicSummary": "One sentence highlighting the most important economic event(s) this week.",
  "earningsSummary": "One sentence highlighting the most notable company/companies reporting earnings."
}

Rules:
- Each summary must be ONE sentence only, under 20 words
- Be specific: mention actual event names and company names
- For economic: focus on high-impact events (Fed speeches, jobs data, GDP, etc.)
- For earnings: mention 1-2 most recognizable company names
- If no events, say "No major [economic events/earnings] scheduled this week."
- Do NOT use phrases like "This week features" or "Investors will watch" - just state the facts directly`

    const response = await openai.responses.create({
      model,
      input: prompt,
    })

    const content = response.output_text || ''

    console.log('[Calendar Summaries] Raw response:', content)

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      console.log('[Calendar Summaries] Parsed:', parsed)

      const economicSummary = parsed.economicSummary || ''
      const earningsSummary = parsed.earningsSummary || ''

      // Cache the result in memory
      cachedSummaries = { economicSummary, earningsSummary, timestamp: Date.now() }

      // Also save to Supabase (fire and forget)
      supabase
        .from('calendar_summaries_cache')
        .insert({ economic_summary: economicSummary, earnings_summary: earningsSummary })
        .then(({ error }) => {
          if (error) console.log('[Calendar Summaries] Failed to save to Supabase cache:', error.message)
          else console.log('[Calendar Summaries] Saved to Supabase cache')
        })

      return {
        economicSummary,
        earningsSummary,
      }
    }

    console.log('[Calendar Summaries] Failed to parse JSON from response')
    return {
      economicSummary: '',
      earningsSummary: '',
      error: 'Failed to parse response',
    }
  } catch (error) {
    console.error('[Calendar Summaries] Error:', error)
    return {
      economicSummary: '',
      earningsSummary: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
