export default function ValueProposition() {
  return (
    <section className="bg-white py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-serif text-3xl md:text-4xl text-gray-900 mb-4">
            Works for you,
            <br />
            not against.
          </h2>
          <p className="text-gray-600">
            Market tools that meet all your needs.
          </p>
        </div>

        {/* Two Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Real-Time Data Card */}
          <div className="bg-white rounded-3xl border border-gray-100 p-8 hover:shadow-lg transition-shadow">
            <div className="inline-block bg-gray-900 text-white text-xs px-3 py-1 rounded-full mb-4">
              Real-Time Data
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Live Market Data
            </h3>
            <p className="text-gray-600 mb-8">
              Access real-time market data from major indices, stocks, futures, and forex markets,
              allowing you to make informed decisions efficiently.
            </p>

            {/* Mini Card Preview */}
            <div className="bg-gray-50 rounded-xl p-4 inline-flex items-center gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">S&P 500 Index</p>
                <p className="text-xs text-gray-500">Live Quote</p>
              </div>
              <button className="bg-white border border-gray-200 text-gray-700 text-xs px-3 py-1.5 rounded-lg hover:bg-gray-50">
                View
              </button>
            </div>
          </div>

          {/* AI Insights Card */}
          <div className="bg-white rounded-3xl border border-gray-100 p-8 hover:shadow-lg transition-shadow">
            <div className="inline-block bg-gray-100 text-gray-700 text-xs px-3 py-1 rounded-full mb-4">
              AI-Powered
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Market Insights
            </h3>
            <p className="text-gray-600 mb-8">
              Get AI-generated market summaries and trend analysis, ensuring you stay
              informed with intelligent insights when markets move.
            </p>

            {/* Progress Indicator */}
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                <div className="w-8 h-8 rounded-full bg-sage-100 border-2 border-white" />
                <div className="w-8 h-8 rounded-full bg-sage-200 border-2 border-white" />
                <div className="w-8 h-8 rounded-full bg-sage-300 border-2 border-white" />
              </div>
              <span className="text-sm text-gray-500">Analyzing trends...</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
