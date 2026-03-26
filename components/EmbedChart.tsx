'use client'

import { useState, useEffect } from 'react'

interface EmbedChartProps {
  symbol: string
}

const DEFAULT_CHARTING_URL = 'https://charts.theintraday.com'
const DEFAULT_HOST_ORIGIN = 'https://theintraday.com'

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export default function EmbedChart({ symbol }: EmbedChartProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('light')

  useEffect(() => {
    const checkDarkMode = () => {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    }

    checkDarkMode()

    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  const chartingBaseUrl = (process.env.NEXT_PUBLIC_CHARTING_URL?.trim() || DEFAULT_CHARTING_URL).replace(/\/+$/, '')
  const hostOrigin = normalizeOrigin(typeof window !== 'undefined' ? window.location.href : null) || DEFAULT_HOST_ORIGIN
  const src = `${chartingBaseUrl}/embed?symbol=${encodeURIComponent(symbol)}&tf=D&range=1y&theme=${theme}&toolbar=simplified&origin=${encodeURIComponent(hostOrigin)}`

  return (
    <iframe
      src={src}
      style={{ width: '100%', height: 500, border: 'none' }}
      allow="fullscreen"
      title={`${symbol} price chart`}
    />
  )
}
