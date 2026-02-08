import Link from 'next/link'

export default function CTASection() {
  return (
    <section className="bg-cream-100 py-16 md:py-24 border-t-2 border-sage-500">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Text Content */}
          <div>
            <h2 className="font-serif text-3xl md:text-4xl text-gray-900 mb-6">
              Start analyzing with
              <br />
              The Intraday Today
            </h2>
            <Link
              href="/auth?signup=true"
              className="inline-block bg-white border border-gray-200 text-gray-900 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Get Started Free
            </Link>
            <p className="text-sm text-gray-500 mt-4">
              We offer a variety of flexible features that cater to all
              types of trading needs and goals.
            </p>
          </div>

          {/* Dashboard Preview */}
          <div className="bg-sage-500 rounded-3xl p-4 shadow-xl">
            <div className="bg-white rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="w-6 h-6 rounded-full bg-sage-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-sage-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3v18h18" />
                    <path d="M18 9l-5 5-4-4-3 3" />
                  </svg>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                </div>
                <div className="w-6 h-6 rounded-full bg-gray-100" />
              </div>

              {/* Content */}
              <div className="p-4">
                {/* Portfolio Header */}
                <div className="mb-4">
                  <p className="text-xs text-gray-500">Portfolio Value</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-gray-900">$12,650.27</span>
                    <span className="text-xs text-green-500">↗ $201.28 (+12.3%)</span>
                  </div>
                </div>

                {/* Mini Chart */}
                <div className="h-16 mb-4">
                  <svg className="w-full h-full" viewBox="0 0 200 60" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="ctaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#5a6b4a" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#5a6b4a" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,50 Q25,45 50,40 T100,30 T150,25 T200,15 L200,60 L0,60 Z"
                      fill="url(#ctaGradient)"
                    />
                    <path
                      d="M0,50 Q25,45 50,40 T100,30 T150,25 T200,15"
                      fill="none"
                      stroke="#5a6b4a"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Accounts</p>
                    <p className="text-sm font-semibold text-gray-900">$12,650.27</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Total Value</p>
                    <p className="text-sm font-semibold text-gray-900">$24,235.67</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
