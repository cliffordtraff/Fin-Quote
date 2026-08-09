/** @type {import('next').NextConfig} */
const DEFAULT_PUBLIC_CHARTING_BASE_URL = 'https://charts.theintraday.com'

function buildContentSecurityPolicy() {
  const scriptSources = ["'self'", "'unsafe-inline'"]
  if (process.env.NODE_ENV !== 'production') scriptSources.push("'unsafe-eval'")

  return [
    "default-src 'self' https: data: blob:",
    `script-src ${scriptSources.join(' ')} https:`,
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' https: data: blob:",
    "font-src 'self' https: data:",
    "connect-src 'self' https: wss: ws:",
    "frame-src 'self' https: http://localhost:3001",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    process.env.NODE_ENV === 'production' ? 'upgrade-insecure-requests' : '',
  ].filter(Boolean).join('; ')
}

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: buildContentSecurityPolicy() },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
]

if (process.env.NODE_ENV === 'production') {
  SECURITY_HEADERS.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  })
}

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
  // Defense in depth: never let local operator state or credentials enter a
  // server-function trace, even if a future module performs a broad fs scan.
  outputFileTracingExcludes: {
    '*': [
      '.local-credentials/**/*',
      '.claude/**/*',
      '.mcp.json',
      '.artifacts/**/*',
      '.newsletter-output/**/*',
      '.newsletter-drafts/**/*',
      '.newsletter-chart-library/**/*',
      '.why-moved-reviews/**/*',
      'coverage/**/*',
      'video_lessons/**/*',
    ],
  },
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },
  async rewrites() {
    const chartingProxyBaseUrl = resolveChartingProxyBaseUrl()

    return [
      {
        source: '/tos/:path*',
        destination: `${chartingProxyBaseUrl}/tos/:path*`,
      },
      {
        source: '/tos-full/:path*',
        destination: `${chartingProxyBaseUrl}/tos-full/:path*`,
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
