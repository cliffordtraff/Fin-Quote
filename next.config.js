/** @type {import('next').NextConfig} */
const DEFAULT_LOCAL_CHARTING_BASE_URL = 'http://localhost:3001'
const DEFAULT_PUBLIC_CHARTING_BASE_URL = 'https://charts.theintraday.com'

function resolveChartingProxyBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_CHARTING_URL?.trim()
    || process.env.NEWSLETTER_PUBLIC_CHARTING_URL?.trim()

  if (configured) {
    return configured.replace(/\/+$/, '')
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEFAULT_LOCAL_CHARTING_BASE_URL
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
    ]
  },
}

module.exports = nextConfig
