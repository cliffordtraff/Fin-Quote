import Link from 'next/link'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  href?: string
}

export default function Logo({ size = 'md', showText = true, href = '/' }: LogoProps) {
  const sizes = {
    sm: { icon: 'w-6 h-6', svg: 'w-4 h-4', text: 'text-base' },
    md: { icon: 'w-8 h-8', svg: 'w-5 h-5', text: 'text-lg' },
    lg: { icon: 'w-10 h-10', svg: 'w-6 h-6', text: 'text-xl' },
  }

  const content = (
    <div className="flex items-center gap-2">
      <div className={`${sizes[size].icon} rounded-lg bg-sage-500 flex items-center justify-center`}>
        <svg
          className={`${sizes[size].svg} text-white`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 3v18h18" />
          <path d="M18 9l-5 5-4-4-3 3" />
        </svg>
      </div>
      {showText && (
        <span className={`${sizes[size].text} font-medium text-gray-900 dark:text-white`}>
          The Intraday Markets
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="flex items-center">
        {content}
      </Link>
    )
  }

  return content
}
