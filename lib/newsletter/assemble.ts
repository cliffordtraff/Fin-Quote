import type { NewsletterBlock, StockNewsItem, TodayQuote } from './types'

// Brand colors (matching build-block.ts)
const BRAND = {
  sage500: '#5a6b4a',
  sage700: '#3d4a30',
  cream100: '#f5f5f0',
  cream300: '#e5e5e0',
  textDark: '#1a1a1a',
  textMuted: '#6b7280',
  white: '#ffffff',
} as const

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Format a date like "March 12, 2026"
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Wrap newsletter blocks in a complete email HTML document.
 *
 * Produces a table-based layout with inline styles for maximum
 * email client compatibility (including Outlook).
 *
 * Structure:
 *   - Header: "The Intraday" branding + date + ticker badge
 *   - Blocks: each separated by 24px spacers
 *   - Footer: data source disclaimer + link
 */
/**
 * Format a large number as human-readable (e.g. 3.4T, 245.6B)
 */
function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`
  return `$${value.toLocaleString()}`
}

/**
 * Render a compact 3-column stats card (market cap, P/E, 52-week range).
 */
function renderStatsCard(quote: TodayQuote): string {
  const hasStats = quote.marketCap != null || quote.pe != null || quote.ytdReturn != null
  if (!hasStats) return ''

  const marketCapStr = quote.marketCap != null ? formatMarketCap(quote.marketCap) : '—'
  const peStr = quote.pe != null ? `${quote.pe.toFixed(1)}x` : '—'
  const ytdVal = quote.ytdReturn != null ? quote.ytdReturn : null
  const ytdSign = ytdVal != null && ytdVal >= 0 ? '+' : ''
  const ytdStr = ytdVal != null ? `${ytdSign}${ytdVal.toFixed(1)}%` : '—'
  const ytdColor = ytdVal != null ? (ytdVal >= 0 ? '#16a34a' : '#dc2626') : BRAND.textDark

  return `
    <!-- Stats Card -->
    <tr><td style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:664px;margin:0 auto;background-color:${BRAND.white};border-radius:8px;border:1px solid ${BRAND.cream300};">
        <tr>
          <td style="padding:16px 32px;width:33%;text-align:center;border-right:1px solid ${BRAND.cream300};">
            <p style="margin:0 0 2px 0;font-size:11px;color:${BRAND.textMuted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.5px;">Market Cap</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:${BRAND.textDark};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${marketCapStr}</p>
          </td>
          <td style="padding:16px 32px;width:33%;text-align:center;border-right:1px solid ${BRAND.cream300};">
            <p style="margin:0 0 2px 0;font-size:11px;color:${BRAND.textMuted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.5px;">P/E Ratio</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:${BRAND.textDark};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${peStr}</p>
          </td>
          <td style="padding:16px 32px;width:34%;text-align:center;">
            <p style="margin:0 0 2px 0;font-size:11px;color:${BRAND.textMuted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.5px;">YTD Performance</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:${ytdColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${ytdStr}</p>
          </td>
        </tr>
      </table>
    </td></tr>`
}

/**
 * Render a compact "In the News" block with 2-3 linked headlines.
 */
function renderHeadlinesBlock(headlines: StockNewsItem[]): string {
  const items = headlines.slice(0, 3)
  if (items.length === 0) return ''

  const rows = items
    .map((h) => {
      const title = escapeHtml(h.title)
      const site = escapeHtml(h.site)
      const url = escapeHtml(h.url)
      return `<tr><td style="padding:4px 0;">
        <a href="${url}" target="_blank" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:${BRAND.sage700};text-decoration:none;line-height:1.4;">${title}</a>
        <span style="font-size:12px;color:${BRAND.textMuted};"> — ${site}</span>
      </td></tr>`
    })
    .join('\n')

  return `
    <!-- In the News -->
    <tr><td style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:664px;margin:0 auto;background-color:${BRAND.white};border-radius:8px;border:1px solid ${BRAND.cream300};">
        <tr><td style="padding:20px 32px 8px 32px;">
          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">In the News</p>
        </td></tr>
        <tr><td style="padding:4px 32px 20px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${rows}
          </table>
        </td></tr>
      </table>
    </td></tr>`
}

export function assembleNewsletterHtml(
  ticker: string,
  blocks: NewsletterBlock[],
  date: Date,
  quote?: TodayQuote,
  editorialHook?: string,
  subjectLine?: string,
  headlines?: StockNewsItem[],
): string {
  const formattedDate = formatDate(date)
  const tickerUpper = escapeHtml(ticker.toUpperCase())

  // Preheader: editorial hook truncated to ~90 chars for inbox preview
  const preheaderText = editorialHook
    ? editorialHook.slice(0, 90)
    : `${ticker.toUpperCase()} financial snapshot for ${formattedDate}`

  // Build intro block with today's trading data + editorial hook
  let introHtml = ''
  if (quote) {
    const pct = quote.changesPercentage
    const pctSign = pct >= 0 ? '+' : ''
    const dollarChange = Math.abs(quote.change)
    const dollarSign = quote.change >= 0 ? '+' : '-'
    const hook = editorialHook ? ` ${escapeHtml(editorialHook)}` : ''
    const name = escapeHtml(quote.name)
    const moveColor = pct >= 0 ? '#16a34a' : '#dc2626'

    introHtml = `
    <!-- Intro -->
    <tr><td style="padding:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:664px;margin:0 auto;background-color:${BRAND.white};border-radius:8px;border:1px solid ${BRAND.cream300};">
        <tr><td style="padding:24px 32px;">
          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;color:${BRAND.textDark};line-height:1.6;">
            <strong>${name}</strong> (<span style="font-weight:600;">${tickerUpper}</span>) is
            <span style="color:${moveColor};font-weight:600;">${pctSign}${pct.toFixed(2)}% (${dollarSign}$${dollarChange.toFixed(2)})</span> today.${hook}
          </p>
        </td></tr>
      </table>
    </td></tr>`
  }

  const blockHtml = blocks
    .map(
      (block) => `
    <!-- Block -->
    <tr><td style="padding:0 0 24px 0;">
      ${block.html}
    </td></tr>`,
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${subjectLine ? escapeHtml(subjectLine) : `The Intraday — ${tickerUpper} Snapshot`}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    img { border: 0; display: block; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.cream100};">
  <!-- Preheader: visible in inbox preview, hidden in email body -->
  <span style="display:none;font-size:1px;color:${BRAND.cream100};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(preheaderText)}
    ${'&#847; &zwnj; &nbsp; '.repeat(30)}
  </span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.cream100};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="664" style="max-width:664px;">

          <!-- Header -->
          <tr><td style="padding:0 0 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:664px;margin:0 auto;background-color:${BRAND.white};border-radius:8px;border:1px solid ${BRAND.cream300};">
              <tr><td style="padding:24px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td>
                      <h1 style="margin:0 0 4px 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:${BRAND.sage700};">
                        The Intraday
                      </h1>
                      <p style="margin:0;font-size:13px;color:${BRAND.textMuted};">
                        ${escapeHtml(formattedDate)}
                      </p>
                    </td>
                    <td align="right" valign="middle">
                      <span style="display:inline-block;padding:6px 16px;background-color:${BRAND.sage500};color:${BRAND.white};font-size:14px;font-weight:600;border-radius:4px;letter-spacing:0.5px;">
                        ${tickerUpper} Snapshot
                      </span>
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>
          </td></tr>

${introHtml}
${headlines && headlines.length > 0 ? renderHeadlinesBlock(headlines) : ''}
${quote ? renderStatsCard(quote) : ''}
${blockHtml}

          <!-- Footer -->
          <tr><td style="padding:8px 0 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:664px;margin:0 auto;">
              <tr><td style="padding:16px 32px;text-align:center;">
                <p style="margin:0 0 8px 0;font-size:11px;color:${BRAND.textMuted};line-height:1.5;">
                  Data sourced from SEC filings and Financial Modeling Prep. Charts generated by The Intraday.
                  This newsletter is for informational purposes only and does not constitute investment advice.
                </p>
                <p style="margin:0 0 12px 0;font-size:11px;color:${BRAND.textMuted};">
                  <a href="https://theintraday.com" style="color:${BRAND.sage500};text-decoration:underline;">theintraday.com</a>
                </p>
                <p style="margin:0 0 8px 0;font-size:11px;color:${BRAND.textMuted};line-height:1.5;border-top:1px solid ${BRAND.cream300};padding-top:12px;">
                  You received this email because you subscribed to The Intraday newsletter.
                  <a href="https://theintraday.com/unsubscribe?email={{email}}" style="color:${BRAND.sage500};text-decoration:underline;">Unsubscribe</a> &middot;
                  <a href="https://theintraday.com/preferences?email={{email}}" style="color:${BRAND.sage500};text-decoration:underline;">Manage preferences</a>
                </p>
                <p style="margin:0;font-size:10px;color:${BRAND.textMuted};line-height:1.4;">
                  The Intraday &middot; 123 Market St, Suite 100, San Francisco, CA 94105
                </p>
              </td></tr>
            </table>
          </td></tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
