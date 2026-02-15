export default function ValueProposition() {
  return (
    <section className="bg-white dark:bg-[rgb(18,18,18)] py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-serif text-3xl md:text-4xl text-gray-900 dark:text-white mb-4">
            Works for you,
            <br />
            not against.
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Market tools that meet all your needs.
          </p>
        </div>

        {/* Two Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Real-Time Data Card */}
          <div className="bg-white dark:bg-[rgb(30,30,30)] rounded-3xl border border-gray-100 dark:border-gray-800 p-8 hover:shadow-lg dark:hover:shadow-2xl dark:hover:shadow-black/20 transition-shadow">
            <div className="inline-block bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs px-3 py-1 rounded-full mb-4">
              Real-Time Data
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              Live Market Data
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Access real-time market data from major indices, stocks, futures, and forex markets,
              allowing you to make informed decisions efficiently.
            </p>

            {/* Mini Card Preview */}
            <div className="bg-gray-50 dark:bg-[rgb(40,40,40)] rounded-xl p-4 inline-flex items-center gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">S&P 500 Index</p>
                <p className="text-xs text-gray-500 dark:text-gray-500">Live Quote</p>
              </div>
              <button className="bg-white dark:bg-[rgb(55,55,55)] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-[rgb(65,65,65)]">
                View
              </button>
            </div>
          </div>

          {/* AI Insights Card */}
          <div className="bg-white dark:bg-[rgb(30,30,30)] rounded-3xl border border-gray-100 dark:border-gray-800 p-8 hover:shadow-lg dark:hover:shadow-2xl dark:hover:shadow-black/20 transition-shadow">
            <div className="inline-block bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs px-3 py-1 rounded-full mb-4">
              AI-Powered
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              Market Insights
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Get AI-generated market summaries and trend analysis, ensuring you stay
              informed with intelligent insights when markets move.
            </p>

            {/* Progress Indicator */}
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                <div className="w-8 h-8 rounded-full bg-sage-100 dark:bg-sage-900/50 border-2 border-white dark:border-[rgb(30,30,30)]" />
                <div className="w-8 h-8 rounded-full bg-sage-200 dark:bg-sage-800/50 border-2 border-white dark:border-[rgb(30,30,30)]" />
                <div className="w-8 h-8 rounded-full bg-sage-300 dark:bg-sage-700/50 border-2 border-white dark:border-[rgb(30,30,30)]" />
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-500">Analyzing trends...</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
