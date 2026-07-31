/** @type {import('next').NextConfig} */
const DEFAULT_PUBLIC_CHARTING_BASE_URL = 'https://charts.theintraday.com'

function resolveChartingProxyBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_CHARTING_URL?.trim()
    || process.env.NEWSLETTER_PUBLIC_CHARTING_URL?.trim()

  if (configured) {
    return configured.replace(/\/+$/, '')
  }

  return DEFAULT_PUBLIC_CHARTING_BASE_URL
}

const nextConfig = {
  serverExternalPackages: ['ws'],
  devIndicators: false,
  async rewrites() {
    const chartingProxyBaseUrl = resolveChartingProxyBaseUrl()

    return [
      {
        source: '/tos/:path*',
        destination: `${chartingProxyBaseUrl}/tos/:path*`,
      },
      // Newsletter export editor iframe — served standalone by the charting
      // platform so Fin Quote can host it inside a draft UI.
      {
        source: '/export-editor',
        destination: `${chartingProxyBaseUrl}/export-editor`,
      },
      // The editor's preview iframe loads `/chart-export?spec=...` directly,
      // and headless rendering POSTs to `/api/chart-export/render`. Both must
      // proxy through to the charting host.
      {
        source: '/chart-export',
        destination: `${chartingProxyBaseUrl}/chart-export`,
      },
      {
        source: '/api/chart-export/:path*',
        destination: `${chartingProxyBaseUrl}/api/chart-export/:path*`,
      },
      // Bundled assets (engine.bundle.js, export-editor.bundle.js, etc.) and
      // the bars API the chart-export page fetches from.
      {
        source: '/embed/:path*',
        destination: `${chartingProxyBaseUrl}/embed/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
