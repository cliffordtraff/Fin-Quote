import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Fin Quote - Financial Data',
  description: 'View company financial data',
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
          root.style.backgroundColor = '#f9fafb';
          document.body && (document.body.style.backgroundColor = '#f9fafb');
        }
      } catch (e) {}
    })();
  `

  return (
    <html lang="en" suppressHydrationWarning className="min-h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.className} bg-gray-50 dark:bg-gray-900 min-h-full`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
