'use client'

import { useState } from 'react'
import { askQuestion, FinancialData, PriceData, FilingData } from '@/app/actions/ask-question'

export default function AskPage() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [dataUsed, setDataUsed] = useState<{
    type: 'financials' | 'prices' | 'filings'
    data: FinancialData[] | PriceData[] | FilingData[]
  } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!question.trim()) {
      setError('Please enter a question')
      return
    }

    setLoading(true)
    setError('')
    setAnswer('')
    setDataUsed(null)

    try {
      const result = await askQuestion(question)

      if (result.error) {
        setError(result.error)
      } else {
        setAnswer(result.answer)
        setDataUsed(result.dataUsed)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Fin Quote</h1>
          <p className="text-gray-600">Ask questions about AAPL financials</p>
        </div>

        <form onSubmit={handleSubmit} className="mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <label htmlFor="question" className="block text-sm font-medium mb-2">
              Your Question
            </label>
            <textarea
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., What is AAPL's revenue trend over the last 4 years?"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Thinking...' : 'Ask'}
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-lg mb-8">
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {answer && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-3">Answer</h2>
              <p className="text-gray-800 leading-relaxed">{answer}</p>
            </div>

            {dataUsed && dataUsed.data.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-sm font-semibold mb-3 text-blue-900">
                  Data Used ({dataUsed.data.length} rows)
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-blue-200">
                        {dataUsed.type === 'financials' ? (
                          <>
                            <th className="text-left py-2 px-3 font-medium text-blue-900">
                              Year
                            </th>
                            <th className="text-left py-2 px-3 font-medium text-blue-900">
                              Metric
                            </th>
                            <th className="text-right py-2 px-3 font-medium text-blue-900">
                              Value
                            </th>
                          </>
                        ) : dataUsed.type === 'prices' ? (
                          <>
                            <th className="text-left py-2 px-3 font-medium text-blue-900">
                              Date
                            </th>
                            <th className="text-right py-2 px-3 font-medium text-blue-900">
                              Close Price
                            </th>
                          </>
                        ) : (
                          <>
                            <th className="text-left py-2 px-3 font-medium text-blue-900">
                              Type
                            </th>
                            <th className="text-left py-2 px-3 font-medium text-blue-900">
                              Filing Date
                            </th>
                            <th className="text-left py-2 px-3 font-medium text-blue-900">
                              Period End
                            </th>
                            <th className="text-left py-2 px-3 font-medium text-blue-900">
                              Document
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {dataUsed.type === 'financials'
                        ? (dataUsed.data as FinancialData[]).map((row, idx) => (
                            <tr key={idx} className="border-b border-blue-100">
                              <td className="py-2 px-3 text-gray-700">{row.year}</td>
                              <td className="py-2 px-3 text-gray-700">{row.metric}</td>
                              <td className="py-2 px-3 text-right text-gray-700">
                                ${(row.value / 1_000_000_000).toFixed(2)}B
                              </td>
                            </tr>
                          ))
                        : dataUsed.type === 'prices'
                        ? (dataUsed.data as PriceData[]).map((row, idx) => (
                            <tr key={idx} className="border-b border-blue-100">
                              <td className="py-2 px-3 text-gray-700">{row.date}</td>
                              <td className="py-2 px-3 text-right text-gray-700">
                                ${row.close.toFixed(2)}
                              </td>
                            </tr>
                          ))
                        : (dataUsed.data as FilingData[]).map((row, idx) => (
                            <tr key={idx} className="border-b border-blue-100">
                              <td className="py-2 px-3 text-gray-700">
                                {row.filing_type}
                                {row.fiscal_quarter && ` Q${row.fiscal_quarter}`}
                              </td>
                              <td className="py-2 px-3 text-gray-700">{row.filing_date}</td>
                              <td className="py-2 px-3 text-gray-700">{row.period_end_date}</td>
                              <td className="py-2 px-3 text-gray-700">
                                <a
                                  href={row.document_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 underline"
                                >
                                  View on SEC
                                </a>
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!answer && !error && !loading && (
          <div className="text-center text-gray-500 py-12">
            <p>Ask a question to get started</p>
            <p className="text-sm mt-2">Try asking about:</p>
            <ul className="text-sm mt-2 space-y-1">
              <li>"How is AAPL's revenue trending over the last 5 years?"</li>
              <li>"What's AAPL's stock price trend over the last 30 days?"</li>
              <li>"Show me AAPL's last 3 quarterly filings"</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
