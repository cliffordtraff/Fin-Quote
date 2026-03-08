'use client'

export default function AfterHours() {
  return (
    <div className="rounded-lg border border-cream-300 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden" style={{ width: '340px', minHeight: '280px' }}>
      <div className="px-2 py-1 border-b border-cream-300 dark:border-gray-700 bg-cream-50 dark:bg-gray-800">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">After Hours</h2>
      </div>
      <div className="p-2 text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-red-500">📉</span>
          <span>Intel stock falls 13% after company offers soft first-quarter guidance.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-500">📈</span>
          <span>Tesla rises 4% on strong delivery numbers for Q4.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-500">📈</span>
          <span>Netflix jumps 6% after beating subscriber expectations.</span>
        </div>
      </div>
    </div>
  )
}
