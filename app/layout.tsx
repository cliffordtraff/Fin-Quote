import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import WorkspaceIframe from '@/components/WorkspaceIframe'
import { TimezoneProvider } from '@/lib/timezone-context'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'The Intraday | Market Dashboard, Stock Analysis, and Charting Workspace',
  description: 'Real-time market dashboards, stock research, financial metrics, charting workspace, and AI-assisted analysis.',
  applicationName: 'The Intraday',
  keywords: [
    'stocks',
    'market dashboard',
    'stock analysis',
    'financial metrics',
    'charting workspace',
    'insider trading',
  ],
  openGraph: {
    title: 'The Intraday',
    description: 'Real-time market dashboards, stock research, financial metrics, charting workspace, and AI-assisted analysis.',
    siteName: 'The Intraday',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Intraday',
    description: 'Real-time market dashboards, stock research, financial metrics, charting workspace, and AI-assisted analysis.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const themeInitScript = `
    (function() {
      try {
        const stored = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = stored || (prefersDark ? 'dark' : 'light');
        const root = document.documentElement;
        if (theme === 'dark') {
          root.classList.add('dark');
          root.style.backgroundColor = '#111827';
          document.body && (document.body.style.backgroundColor = '#111827');
        } else {
          root.classList.remove('dark');
          root.style.backgroundColor = '#f5f5f0';
          document.body && (document.body.style.backgroundColor = '#f5f5f0');
        }
      } catch (e) {}
    })();
  `

  return (
    <html lang="en" suppressHydrationWarning className="min-h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.className} bg-cream-100 dark:bg-gray-900 min-h-full`}>
        <ThemeProvider>
          <TimezoneProvider>
            {children}
            <Suspense fallback={null}>
              <WorkspaceIframe />
            </Suspense>
          </TimezoneProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
