export default function FeatureHighlights() {
  return (
    <section className="bg-cream-50 py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-6 space-y-24">
        {/* Feature 1: Instant Market Data */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Visual */}
          <div className="relative">
            {/* Card */}
            <div className="bg-white rounded-2xl shadow-lg p-6 relative z-10">
              <div className="mb-4">
                <p className="text-xs text-gray-500">Market Overview</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-semibold text-gray-900">$12,650.27</span>
                  <span className="text-sm text-green-500">↗ $201.28 (+12.3%)</span>
                </div>
              </div>

              {/* Account List */}
              <div className="space-y-3">
                {[
                  { name: 'S&P 500', value: '$5,234.18', change: '+1.2%', up: true },
                  { name: 'NASDAQ', value: '$16,742.39', change: '+0.8%', up: true },
                  { name: 'DOW', value: '$39,127.14', change: '-0.3%', up: false },
                  { name: 'Russell 2000', value: '$2,018.42', change: '+0.5%', up: true },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        <span className="text-xs text-gray-500">{item.name[0]}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">Index</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{item.value}</p>
                      <p className={`text-xs ${item.up ? 'text-green-500' : 'text-red-500'}`}>{item.change}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Text */}
          <div>
            <h3 className="font-serif text-2xl md:text-3xl text-gray-900 mb-4">
              Instant Market Data
            </h3>
            <p className="text-gray-600 leading-relaxed">
              The Intraday platform delivers real-time market data with instant updates,
              allowing users to track indices, futures, and individual stocks quickly and efficiently.
              Whether monitoring pre-market activity, regular sessions, or after-hours trading,
              you&apos;ll always have the latest information at your fingertips.
            </p>
          </div>
        </div>

        {/* Feature 2: Customizable Charts */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <div className="order-2 md:order-1">
            <h3 className="font-serif text-2xl md:text-3xl text-gray-900 mb-4">
              Customizable Dashboard
            </h3>
            <p className="text-gray-600 leading-relaxed">
              The Intraday platform offers a customizable dashboard that
              allows users to personalize their experience based on
              their preferences and priorities. Users can rearrange
              widgets, add or remove modules, and tailor the
              dashboard layout to suit their individual needs.
            </p>
          </div>

          {/* Visual */}
          <div className="order-1 md:order-2 relative">
            {/* Card */}
            <div className="bg-white rounded-2xl shadow-lg p-6 relative z-10">
              <p className="text-sm text-gray-500 mb-3">Summary</p>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Total Value</span>
                    <span className="text-gray-900 font-semibold">$24,235.67</span>
                  </div>
                  {/* Stacked Bar */}
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                    <div className="bg-sage-300 h-full" style={{ width: '30%' }} />
                    <div className="bg-sage-500 h-full" style={{ width: '70%' }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-sage-300" />
                    <span className="text-gray-600">Cash</span>
                    <span className="text-gray-900 font-medium">30%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-sage-500" />
                    <span className="text-gray-600">Investments</span>
                    <span className="text-gray-900 font-medium">70%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-300" />
                    <span className="text-gray-600">Debt</span>
                    <span className="text-gray-900 font-medium">0%</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-sm text-gray-600">Day Change</span>
                  <span className="text-sm text-green-500 font-medium">+$135.50 (0.50%)</span>
                </div>

                <button className="w-full bg-gray-50 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-100 transition-colors">
                  View Statements
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 3: Real-Time Analysis */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Visual */}
          <div className="relative">
            {/* Card */}
            <div className="bg-white rounded-2xl shadow-lg p-6 relative z-10">
              <p className="text-xs text-gray-500 mb-2">Portfolio Value</p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-xl font-semibold text-gray-900">$12,650.27</span>
                <span className="text-sm text-green-500">↗ $201.28 (+12.3%)</span>
              </div>

              {/* Mini Chart */}
              <div className="h-24 relative">
                <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#5a6b4a" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#5a6b4a" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,80 Q30,70 60,65 T120,55 T180,40 T240,35 T300,25 L300,100 L0,100 Z"
                    fill="url(#areaGradient)"
                  />
                  <path
                    d="M0,80 Q30,70 60,65 T120,55 T180,40 T240,35 T300,25"
                    fill="none"
                    stroke="#5a6b4a"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Text */}
          <div>
            <h3 className="font-serif text-2xl md:text-3xl text-gray-900 mb-4">
              Real-Time Alerts & Notifications
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Stay informed with AI-powered market analysis that surfaces significant
              movements and trends as they happen. Our intelligent system monitors
              market conditions and delivers actionable insights directly to your
              dashboard, helping you make informed decisions quickly.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
