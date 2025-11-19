import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import { FontScaleProvider } from '@/components/FontScaleProvider'
import { SidebarProvider } from '@/components/SidebarProvider'

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
  return (
    <html lang="en" className="bg-gray-50 dark:bg-gray-900" suppressHydrationWarning>
      <body className={`${inter.className} bg-gray-50 dark:bg-gray-900`}>
        <ThemeProvider>
          <FontScaleProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </FontScaleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
