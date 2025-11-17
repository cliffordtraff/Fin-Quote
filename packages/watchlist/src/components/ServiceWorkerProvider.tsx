'use client'

import { useEffect, useState } from 'react'
import { Workbox } from 'workbox-window'

export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [wb, setWb] = useState<Workbox | null>(null)

  useEffect(() => {
    // Only register in production with feature flag enabled
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PUBLIC_ENABLE_SW === 'true'
    ) {
      const workbox = new Workbox('/sw.js', { scope: '/' })
      
      // Track when update is available
      workbox.addEventListener('waiting', () => {
        setUpdateAvailable(true)
        setWb(workbox)
      })
      
      // Log when SW is controlling the page
      workbox.addEventListener('controlling', () => {
      })
      
      // Register the service worker
      workbox.register().then(() => {
      }).catch((error) => {
        console.error('[SW] Service worker registration failed:', error)
      })
      
      // Check for updates every hour in production
      setInterval(() => {
        workbox.update()
      }, 60 * 60 * 1000)
    }
  }, [])

  // Handle update prompt
  const handleUpdate = () => {
    if (wb) {
      // Tell SW to skip waiting
      wb.messageSkipWaiting()
      
      // Reload once SW is controlling
      wb.addEventListener('controlling', () => {
        window.location.reload()
      })
    }
  }

  const dismissUpdate = () => {
    setUpdateAvailable(false)
  }

  return (
    <>
      {children}
      
      {/* Update notification */}
      {updateAvailable && (
        <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 max-w-sm z-50 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                New version available!
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Click update to get the latest features and improvements.
              </p>
              <div className="mt-3 flex space-x-2">
                <button
                  onClick={handleUpdate}
                  className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Update now
                </button>
                <button
                  onClick={dismissUpdate}
                  className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}