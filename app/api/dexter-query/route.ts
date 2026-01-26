import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const dexterPath = path.join(process.cwd(), 'dexter')
    const bunPath = `${process.env.HOME}/.bun/bin/bun`

    // Build environment variables for Dexter
    const env = {
      ...process.env,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      EXASEARCH_API_KEY: process.env.EXASEARCH_API_KEY || process.env.EXA_API_KEY,
      TAVILY_API_KEY: process.env.TAVILY_API_KEY,
      FINANCIAL_DATASETS_API_KEY: process.env.FINANCIAL_DATASETS_API_KEY,
      FMP_API_KEY: process.env.FMP_API_KEY, // Fallback data source
      DEXTER_MODEL: process.env.DEXTER_MODEL || 'gpt-4o',
      DEXTER_MODEL_PROVIDER: process.env.DEXTER_MODEL_PROVIDER || 'openai',
    }

    console.log('[Dexter API] Query:', query.substring(0, 100) + '...')

    // Escape the query for shell
    const escapedQuery = query.replace(/"/g, '\\"').replace(/\n/g, '\\n')

    const { stdout, stderr } = await execAsync(
      `"${bunPath}" run-query.ts "${escapedQuery}"`,
      {
        cwd: dexterPath,
        env,
        timeout: 180000, // 3 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }
    )

    if (stderr) {
      console.warn('[Dexter API] stderr:', stderr)
    }

    // Parse the JSON response from Dexter
    const result = JSON.parse(stdout.trim())

    if (result.error) {
      console.error('[Dexter API] Agent error:', result.error)
      return NextResponse.json({
        answer: '',
        toolsUsed: [],
        iterations: 0,
        error: result.error,
      })
    }

    // Extract tool names from tool calls
    const toolsUsed = result.toolCalls?.map((tc: { tool: string }) => tc.tool) || []

    console.log('[Dexter API] Success - Tools:', toolsUsed, 'Iterations:', result.iterations)

    return NextResponse.json({
      answer: result.answer,
      toolsUsed: [...new Set(toolsUsed)],
      iterations: result.iterations,
    })
  } catch (error) {
    console.error('[Dexter API] Error:', error)

    return NextResponse.json({
      answer: '',
      toolsUsed: [],
      iterations: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
