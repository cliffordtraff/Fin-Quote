'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { useTimezone, TIMEZONE_OPTIONS, getTimezoneAbbr } from '@/lib/timezone-context'

export default function TimezoneSelector() {
  const { timezone, setTimezone, isAutoDetected, resetToAutoDetect } = useTimezone()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!isOpen) return

    function handlePointerOutside(event: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      buttonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const currentAbbr = getTimezoneAbbr(timezone)
  const currentOption = TIMEZONE_OPTIONS.find(opt => opt.value === timezone)
  const displayLabel = currentOption?.label || currentAbbr

  const handleSelect = (tz: string) => {
    setTimezone(tz)
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  const handleAutoDetect = () => {
    resetToAutoDetect()
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={`Change timezone, currently ${displayLabel}`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-haspopup="true"
        className="flex min-h-10 items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        title="Change timezone"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{currentAbbr}</span>
        {isAutoDetected && (
          <span className="text-[9px] text-gray-400 dark:text-gray-500">(auto)</span>
        )}
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div id={menuId} role="group" aria-label="Timezone" className="absolute right-0 top-full z-50 mt-1 max-h-80 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {/* Auto-detect option */}
          <button
            type="button"
            aria-pressed={isAutoDetected}
            onClick={handleAutoDetect}
            className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${
              isAutoDetected ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            <span>Auto-detect</span>
            {isAutoDetected && (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

          {/* Timezone options */}
          {TIMEZONE_OPTIONS.map((option) => {
            const isSelected = timezone === option.value && !isAutoDetected
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleSelect(option.value)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <span>
                  {option.label}
                  <span className="text-gray-400 dark:text-gray-500 ml-1">({option.offset})</span>
                </span>
                {isSelected && (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
