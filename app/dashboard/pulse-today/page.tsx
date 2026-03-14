import Navigation from '@/components/Navigation'
import PulseTodayDashboard from '@/components/PulseTodayDashboard'

export default function PulseTodayPage() {
  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900 flex flex-col">
      <Navigation />
      <main className="py-6 px-4 sm:px-6 lg:px-8 max-w-[1600px] mx-auto w-full">
        <PulseTodayDashboard />
      </main>
    </div>
  )
}
