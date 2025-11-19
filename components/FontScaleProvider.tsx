'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface FontScaleContextType {
  fontScale: number
  increaseFontScale: () => void
  decreaseFontScale: () => void
  canIncrease: boolean
  canDecrease: boolean
}

const FontScaleContext = createContext<FontScaleContextType | undefined>(undefined)

const FONT_SCALE_MIN = 0.8
const FONT_SCALE_MAX = 1.3
const FONT_SCALE_STEP = 0.1
const STORAGE_KEY = 'fin-quote-font-scale'

export function FontScaleProvider({ children }: { children: ReactNode }) {
  const [fontScale, setFontScale] = useState(1)

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = parseFloat(stored)
      if (!isNaN(parsed)) {
        setFontScale(parsed)
      }
    }
  }, [])

  // Apply font scale via CSS custom property
  useEffect(() => {
    console.log('Setting --font-scale to:', fontScale)
    document.documentElement.style.setProperty('--font-scale', fontScale.toString())
  }, [fontScale])

  const increaseFontScale = useCallback(() => {
    console.log('increaseFontScale called')
    setFontScale((current) => {
      if (current >= FONT_SCALE_MAX) return current
      const next = Math.min(FONT_SCALE_MAX, parseFloat((current + FONT_SCALE_STEP).toFixed(2)))
      console.log('Increasing from', current, 'to', next)
      localStorage.setItem(STORAGE_KEY, next.toString())
      return next
    })
  }, [])

  const decreaseFontScale = useCallback(() => {
    console.log('decreaseFontScale called')
    setFontScale((current) => {
      if (current <= FONT_SCALE_MIN) return current
      const next = Math.max(FONT_SCALE_MIN, parseFloat((current - FONT_SCALE_STEP).toFixed(2)))
      console.log('Decreasing from', current, 'to', next)
      localStorage.setItem(STORAGE_KEY, next.toString())
      return next
    })
  }, [])

  // Listen to global events from Navigation
  useEffect(() => {
    window.addEventListener('watchlist:font-scale:increase', increaseFontScale)
    window.addEventListener('watchlist:font-scale:decrease', decreaseFontScale)

    return () => {
      window.removeEventListener('watchlist:font-scale:increase', increaseFontScale)
      window.removeEventListener('watchlist:font-scale:decrease', decreaseFontScale)
    }
  }, [increaseFontScale, decreaseFontScale])

  const canIncrease = fontScale < FONT_SCALE_MAX
  const canDecrease = fontScale > FONT_SCALE_MIN

  return (
    <FontScaleContext.Provider
      value={{ fontScale, increaseFontScale, decreaseFontScale, canIncrease, canDecrease }}
    >
      {children}
    </FontScaleContext.Provider>
  )
}

export function useFontScale() {
  const context = useContext(FontScaleContext)
  if (context === undefined) {
    throw new Error('useFontScale must be used within a FontScaleProvider')
  }
  return context
}
