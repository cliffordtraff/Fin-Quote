import Navigation from '@/components/Navigation'
import MarketSessions from '@/components/MarketSessions'

export default function CalendarPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <MarketSessions />
      </main>
    </div>
  )
}
