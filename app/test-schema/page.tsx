'use client'

import { useState } from 'react'
import { checkFinancialsSchema } from '@/app/actions/check-schema'
import { addFinancialColumns } from '@/app/actions/add-columns'

export default function TestSchemaPage() {
  const [result, setResult] = useState<{ error: string | null; columns: string[] | null } | null>(null)
  const [addResult, setAddResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleCheckSchema = async () => {
    const data = await checkFinancialsSchema()
    setResult(data)
  }

  const handleAddColumns = async () => {
    setLoading(true)
    const data = await addFinancialColumns()
    setAddResult(data)
    setLoading(false)

    // Refresh schema after adding
    if (data.success) {
      setTimeout(handleCheckSchema, 1000)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">financials_std Schema Manager</h1>

      <div className="space-y-4">
        <button
          onClick={handleCheckSchema}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Check Current Schema
        </button>

        <button
          onClick={handleAddColumns}
          disabled={loading}
          className="ml-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
        >
          {loading ? 'Adding Columns...' : 'Add New Columns'}
        </button>
      </div>

      {addResult && (
        <div className={`mt-6 p-4 rounded ${addResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <h2 className="font-bold mb-2">{addResult.success ? 'Success!' : 'Error'}</h2>
          {addResult.error && <p className="text-red-600 mb-2">Error: {addResult.error}</p>}
          {addResult.hint && <p className="text-sm mb-2">{addResult.hint}</p>}
          {addResult.sqlToRun && (
            <div className="mt-2">
              <p className="font-semibold mb-1">Run this SQL in Supabase SQL Editor:</p>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">{addResult.sqlToRun}</pre>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-6 p-4 bg-white border rounded">
          {result.error ? (
            <p className="text-red-600">Error: {result.error}</p>
          ) : (
            <div>
              <p className="font-semibold mb-2">Available columns ({result.columns?.length}):</p>
              <ul className="list-disc pl-6 space-y-1">
                {result.columns?.map((col) => (
                  <li key={col} className="font-mono text-sm">{col}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
