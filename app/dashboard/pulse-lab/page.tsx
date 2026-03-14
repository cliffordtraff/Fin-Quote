import Navigation from '@/components/Navigation'
import PulseLabDashboard from '@/components/PulseLabDashboard'

export default function PulseLabPage() {
  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900 flex flex-col">
      <Navigation />
      <main className="py-6 px-4 sm:px-6 lg:px-8 max-w-[1600px] mx-auto w-full">
        <PulseLabDashboard />
      </main>
    </div>
  )
}
