'use client'

import { useState, useEffect } from 'react'

interface EmbedChartProps {
  symbol: string
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

  const src = `https://charts.theintraday.com/embed?symbol=${encodeURIComponent(symbol)}&tf=D&theme=${theme}&toolbar=simplified&origin=https://theintraday.com`

  return (
    <iframe
      src={src}
      style={{ width: '100%', height: 500, border: 'none' }}
      allow="fullscreen"
      title={`${symbol} price chart`}
    />
  )
}
