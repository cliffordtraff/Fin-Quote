import Navigation from '@/components/Navigation'
import PulseLab2Dashboard from '@/components/PulseLab2Dashboard'

export default function PulseLab2Page() {
  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900 flex flex-col">
      <Navigation />
      <main className="py-6 px-4 sm:px-6 lg:px-8 max-w-[1600px] mx-auto w-full">
        <PulseLab2Dashboard />
      </main>
    </div>
  )
}
