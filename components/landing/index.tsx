import LandingNav from './LandingNav'
import HeroSection from './HeroSection'
import ValueProposition from './ValueProposition'
import FeaturesGrid from './FeaturesGrid'
import FeatureHighlights from './FeatureHighlights'
import FAQSection from './FAQSection'
import CTASection from './CTASection'
import Footer from './Footer'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <LandingNav />
      <main>
        <HeroSection />
        <ValueProposition />
        <FeaturesGrid />
        <FeatureHighlights />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
