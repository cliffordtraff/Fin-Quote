'use client'

import { useState } from 'react'

interface DexterQueryBoxProps {
  onQueryResult?: (result: DexterQueryResult) => void
}

export interface DexterQueryResult {
  query: string
  answer: string
  toolsUsed: string[]
  iterations: number
  error?: string
  timestamp: Date
}

export default function DexterQueryBox({ onQueryResult }: DexterQueryBoxProps) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<DexterQueryResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const exampleQueries = [
    "Analyze Apple's financial health over the past 3 years",
    "Compare gross margins between Apple, Microsoft, and Google",
    "What were Nvidia's most recent quarterly earnings?",
    "Are there any notable insider trades for Meta recently?",
    "What's driving the semiconductor sector this year?",
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim() || isLoading) return

    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/dexter-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })

      const data = await response.json()

      const queryResult: DexterQueryResult = {
        query: query.trim(),
        answer: data.answer || '',
        toolsUsed: data.toolsUsed || [],
        iterations: data.iterations || 0,
        error: data.error,
        timestamp: new Date(),
      }

      setResult(queryResult)
      onQueryResult?.(queryResult)
    } catch (error) {
      const queryResult: DexterQueryResult = {
        query: query.trim(),
        answer: '',
        toolsUsed: [],
        iterations: 0,
        error: error instanceof Error ? error.message : 'Failed to query Dexter',
        timestamp: new Date(),
      }
      setResult(queryResult)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExampleClick = (example: string) => {
    setQuery(example)
  }

  return (
    <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔍</span>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Ask Dexter
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
            Financial Research Agent
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Ask any financial research question - Dexter will search news and analyze data
        </p>
      </div>

      {/* Query Input */}
      <div className="p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Analyze Nvidia's financial health..."
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[rgb(38,38,38)] text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Researching...' : 'Ask'}
            </button>
          </div>

          {/* Example Queries */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Try:</span>
            {exampleQueries.slice(0, 3).map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExampleClick(example)}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors truncate max-w-[200px]"
              >
                {example}
              </button>
            ))}
          </div>
        </form>

        {/* Loading State */}
        {isLoading && (
          <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Dexter is researching your question...
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
              This may take 30-60 seconds depending on complexity.
            </p>
          </div>
        )}

        {/* Result */}
        {result && !isLoading && (
          <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            {result.error ? (
              <div className="text-red-600 dark:text-red-400">
                <p className="text-sm font-medium">Error</p>
                <p className="text-xs mt-1">{result.error}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Query Echo */}
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium">Q:</span> {result.query}
                </div>

                {/* Answer */}
                <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {result.answer}
                </div>

                {/* Metadata */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                    {result.toolsUsed.length > 0 && (
                      <span className="flex items-center gap-1">
                        <span>Tools:</span>
                        {result.toolsUsed.map((tool) => (
                          <span
                            key={tool}
                            className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                          >
                            {tool}
                          </span>
                        ))}
                      </span>
                    )}
                    {result.iterations > 0 && (
                      <span className="text-gray-400 dark:text-gray-600">
                        | {result.iterations} iteration{result.iterations !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="text-gray-400 dark:text-gray-600">
                      | {result.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
