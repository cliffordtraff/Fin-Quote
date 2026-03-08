import Link from 'next/link'
import Logo from '@/components/Logo'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for getting started with market insights.',
    features: [
      'Real-time market data',
      'Basic stock charts',
      'Market movers & losers',
      'Limited historical data',
      'Community support',
    ],
    cta: 'Get Started',
    ctaHref: '/auth?signup=true',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$19',
    period: 'per month',
    description: 'For serious investors who need deeper insights.',
    features: [
      'Everything in Free',
      'Advanced charting tools',
      'Full historical data access',
      'Insider trading alerts',
      'Earnings calendar',
      'Sector heatmaps',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    ctaHref: '/auth?signup=true',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'contact us',
    description: 'For teams and institutions with advanced needs.',
    features: [
      'Everything in Pro',
      'API access',
      'Custom integrations',
      'Dedicated account manager',
      'Team collaboration tools',
      'Advanced analytics',
      'SLA guarantees',
    ],
    cta: 'Contact Sales',
    ctaHref: 'mailto:sales@theintraday.com',
    highlighted: false,
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Logo size="md" href="/" />
            <div className="hidden md:flex items-center gap-8">
              <Link href="/#features" className="text-sm text-gray-600 hover:text-sage-600 transition-colors">
                Features
              </Link>
              <Link href="/pricing" className="text-sm text-sage-600 font-medium">
                Pricing
              </Link>
              <Link href="/#faq" className="text-sm text-gray-600 hover:text-sage-600 transition-colors">
                FAQ
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <Link
                href="/auth"
                className="text-sm text-gray-600 hover:text-sage-600 transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/auth?signup=true"
                className="text-sm bg-sage-500 text-white px-4 py-2 rounded-lg hover:bg-sage-600 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h1 className="font-serif text-4xl md:text-5xl text-gray-900 mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Choose the plan that fits your investment style. All plans include our core market intelligence features.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative bg-white rounded-2xl p-8 ${
                  plan.highlighted
                    ? 'ring-2 ring-sage-500 shadow-xl'
                    : 'border border-gray-200 shadow-sm'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-sage-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-gray-500 text-sm">/{plan.period}</span>
                  </div>
                  <p className="text-gray-600 text-sm mt-2">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-sage-500 flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-gray-600 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.ctaHref}
                  className={`block w-full text-center py-3 px-4 rounded-lg font-medium transition-colors ${
                    plan.highlighted
                      ? 'bg-sage-500 text-white hover:bg-sage-600'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Preview */}
      <section className="py-16 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="font-serif text-2xl text-gray-900 mb-4">Questions about pricing?</h2>
          <p className="text-gray-600 mb-6">
            Check out our FAQ or reach out to our team for personalized guidance.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/#faq"
              className="text-sage-600 hover:text-sage-700 font-medium transition-colors"
            >
              View FAQ
            </Link>
            <span className="text-gray-300 hidden sm:block">|</span>
            <a
              href="mailto:support@theintraday.com"
              className="text-sage-600 hover:text-sage-700 font-medium transition-colors"
            >
              Contact Support
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo size="sm" href="/" />
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} The Intraday. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
