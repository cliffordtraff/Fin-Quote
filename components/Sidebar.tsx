'use client'

import { useSidebar } from './SidebarProvider'
import { ReactNode } from 'react'

interface SidebarProps {
  children: ReactNode
}

export default function Sidebar({ children }: SidebarProps) {
  const { sidebarOpen, setSidebarOpen } = useSidebar()

  return (
    <>
      {/* Sidebar - fixed position overlay */}
      <div
        className={`hidden lg:block fixed left-0 top-0 h-screen w-64 xl:w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(26,26,26)] z-[60] transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {children}
      </div>

      {/* Sidebar Toggle Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`hidden lg:flex fixed top-1/2 -translate-y-1/2 z-[70] bg-white dark:bg-[rgb(45,45,45)] border border-gray-300 dark:border-gray-600 rounded-r-lg px-2 py-4 hover:bg-gray-100 dark:hover:bg-[rgb(55,55,55)] transition-all shadow-lg ${
          sidebarOpen ? 'xl:left-80 left-64' : 'left-0'
        }`}
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        {sidebarOpen ? (
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>
    </>
  )
}
