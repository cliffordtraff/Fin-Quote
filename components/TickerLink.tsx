'use client'

import Link from 'next/link'

interface TickerLinkProps {
  symbol: string
  className?: string
  title?: string
}

/**
 * Consistent ticker link styling.
 * Keeps the “clickable tickers everywhere” behavior uniform.
 */
export default function TickerLink({ symbol, className = '', title }: TickerLinkProps) {
  const s = (symbol || '').toUpperCase()
  return (
    <Link
      href={`/stock/${encodeURIComponent(s)}`}
      className={`text-sky-600 dark:text-sky-400 hover:underline underline-offset-2 ${className}`}
      title={title || `Open ${s}`}
      prefetch={false}
    >
      {s}
    </Link>
  )
}
