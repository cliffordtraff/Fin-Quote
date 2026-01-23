'use client'

export default function AfterHours() {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden self-start" style={{ width: '340px' }}>
      <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">After Hours</h2>
      </div>
      <div className="p-2 text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-red-500">📉</span>
          <span>Intel stock falls 13% after company offers soft first-quarter guidance.</span>
        </div>
      </div>
    </div>
  )
}
