import type {
  NewsletterFormat,
  NewsletterBlock,
  NewsletterDraftHeader,
  NewsletterDraftStatsCard,
  TodayQuote,
} from './types'

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

const NEWSLETTER_CARD_MAX_WIDTH = 600

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
 *   - Header: Subject line + date + company logo
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

export interface AssembleNewsletterOptions {
  headerOverride?: NewsletterDraftHeader
  introTextOverride?: string
  statsCardOverride?: NewsletterDraftStatsCard
}

export function buildNewsletterIntroText(
  quote?: TodayQuote,
  editorialHook?: string,
): string {
  if (!quote) {
    return editorialHook?.trim() ?? ''
  }

  const pctSign = quote.changesPercentage >= 0 ? '+' : ''
  const dollarChange = Math.abs(quote.change)
  const dollarSign = quote.change >= 0 ? '+' : '-'
  const tickerUpper = quote.ticker.toUpperCase()
  const base = `${quote.name} (${tickerUpper}) is ${pctSign}${quote.changesPercentage.toFixed(2)}% (${dollarSign}$${dollarChange.toFixed(2)}) today.`
  const hook = editorialHook?.trim()
  return hook ? `${base} ${hook}` : base
}

function formatStatValueColor(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('+')) return '#16a34a'
  if (trimmed.startsWith('-')) return '#dc2626'
  return BRAND.textDark
}

export function buildNewsletterStatsCard(
  quote?: TodayQuote,
): NewsletterDraftStatsCard | undefined {
  if (!quote) return undefined

  const hasStats = quote.marketCap != null || quote.pe != null || quote.ytdReturn != null
  if (!hasStats) return undefined

  const marketCapStr = quote.marketCap != null ? formatMarketCap(quote.marketCap) : '—'
  const peStr = quote.pe != null ? `${quote.pe.toFixed(1)}x` : '—'
  const ytdVal = quote.ytdReturn != null ? quote.ytdReturn : null
  const ytdSign = ytdVal != null && ytdVal >= 0 ? '+' : ''
  const ytdStr = ytdVal != null ? `${ytdSign}${ytdVal.toFixed(1)}%` : '—'

  return {
    items: [
      { label: 'Market Cap', value: marketCapStr },
      { label: 'P/E Ratio', value: peStr },
      { label: 'YTD Performance', value: ytdStr },
    ],
  }
}

/**
 * Build a ticker logo URL using FMP's public image CDN.
 * Works for any ticker — no API key required.
 */
function getTickerLogoUrl(ticker: string): string {
  const sym = ticker.trim().toUpperCase()
  if (!sym) return ''
  return `https://financialmodelingprep.com/image-stock/${sym}.png`
}

const HEADER_LOGO_GRID_MAX = 4

function sanitizeLogoUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return []
  return urls
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => u && !/\/MARKET\.png(?:[?#].*)?$/i.test(u))
}

function getSingleHeaderLogoUrl(header: NewsletterDraftHeader): string {
  const logoUrl = typeof header.logoUrl === 'string' ? header.logoUrl.trim() : ''
  if (!logoUrl) return ''
  if (/\/MARKET\.png(?:[?#].*)?$/i.test(logoUrl)) return ''
  return logoUrl
}

function renderNewsletterHeaderLogo(header: NewsletterDraftHeader): string {
  const singleLogoUrl = getSingleHeaderLogoUrl(header)
  if (singleLogoUrl) {
    return `<img src="${escapeHtml(singleLogoUrl)}" alt="${escapeHtml(header.badgeText)}" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:8px;border:1px solid ${BRAND.cream300};" />`
  }

  const gridUrls = sanitizeLogoUrls(header.logoUrls).slice(0, HEADER_LOGO_GRID_MAX)
  if (gridUrls.length >= 2) {
    const imgStyle = `display:block;width:22px;height:22px;border-radius:4px;border:1px solid ${BRAND.cream300};`
    const img = (url: string) =>
      `<img src="${escapeHtml(url)}" alt="" width="22" height="22" style="${imgStyle}" />`

    if (gridUrls.length === 2) {
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="padding-right:4px;">${img(gridUrls[0])}</td><td>${img(gridUrls[1])}</td></tr></table>`
    }

    const cells = [gridUrls[0] || '', gridUrls[1] || '', gridUrls[2] || '', gridUrls[3] || '']
    return (
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
      `<tr><td style="padding:0 2px 2px 0;width:22px;height:22px;">${cells[0] ? img(cells[0]) : ''}</td><td style="padding:0 0 2px 2px;width:22px;height:22px;">${cells[1] ? img(cells[1]) : ''}</td></tr>` +
      `<tr><td style="padding:2px 2px 0 0;width:22px;height:22px;">${cells[2] ? img(cells[2]) : ''}</td><td style="padding:2px 0 0 2px;width:22px;height:22px;">${cells[3] ? img(cells[3]) : ''}</td></tr>` +
      `</table>`
    )
  }

  return `<span style="display:inline-block;padding:6px 16px;background-color:${BRAND.sage500};color:${BRAND.white};font-size:14px;font-weight:600;border-radius:4px;letter-spacing:0.5px;">${escapeHtml(header.badgeText)}</span>`
}

export function buildNewsletterHeader(
  ticker: string,
  date: Date,
  options: {
    format?: NewsletterFormat
    featuredTickers?: string[]
    subjectLine?: string
  } = {},
): NewsletterDraftHeader {
  const featured = options.featuredTickers ?? []
  const featuredCount = featured.length
  const isRoundup = options.format === 'market_roundup'
  const defaultSubject = isRoundup
    ? `Market Roundup${featuredCount > 0 ? ` — ${featuredCount} Stocks` : ''}`
    : `${ticker.toUpperCase()} Snapshot`

  let logoUrl = ''
  let logoUrls: string[] | undefined

  if (isRoundup) {
    if (featuredCount === 1) {
      logoUrl = getTickerLogoUrl(featured[0])
    } else if (featuredCount >= 2) {
      const urls = featured
        .slice(0, HEADER_LOGO_GRID_MAX)
        .map((t) => getTickerLogoUrl(t))
        .filter(Boolean)
      if (urls.length >= 2) logoUrls = urls
    }
  } else {
    logoUrl = getTickerLogoUrl(ticker)
  }

  return {
    title: options.subjectLine?.trim() || defaultSubject,
    dateText: formatDate(date),
    badgeText: isRoundup
      ? `Market Roundup${featuredCount > 0 ? ` • ${featuredCount} Stocks` : ''}`
      : `${ticker.toUpperCase()} Snapshot`,
    ...(logoUrl ? { logoUrl } : {}),
    ...(logoUrls ? { logoUrls } : {}),
  }
}

/**
 * Render the inner stats row (no card wrapper — used inside the combined header card).
 */
function renderStatsCardInner(statsCard: NewsletterDraftStatsCard): string {
  const items = statsCard.items
    .slice(0, 3)
    .map((item) => ({
      label: item.label.trim(),
      value: item.value.trim(),
    }))

  if (!items.length || items.every((item) => !item.label && !item.value)) return ''

  const normalizedItems = [0, 1, 2].map((index) => {
    const item = items[index] ?? { label: '', value: '' }
    return {
      label: item.label || '—',
      value: item.value || '—',
      valueColor: formatStatValueColor(item.value || '—'),
    }
  })

  return `
                <tr id="newsletter-preview-stats"><td colspan="2" style="padding:0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="padding:16px 32px;width:33%;text-align:center;border-right:1px solid ${BRAND.cream300};">
                        <p style="margin:0 0 2px 0;font-size:11px;color:${BRAND.textMuted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(normalizedItems[0].label)}</p>
                        <p style="margin:0;font-size:18px;font-weight:700;color:${normalizedItems[0].valueColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${escapeHtml(normalizedItems[0].value)}</p>
                      </td>
                      <td style="padding:16px 32px;width:33%;text-align:center;border-right:1px solid ${BRAND.cream300};">
                        <p style="margin:0 0 2px 0;font-size:11px;color:${BRAND.textMuted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(normalizedItems[1].label)}</p>
                        <p style="margin:0;font-size:18px;font-weight:700;color:${normalizedItems[1].valueColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${escapeHtml(normalizedItems[1].value)}</p>
                      </td>
                      <td style="padding:16px 32px;width:34%;text-align:center;">
                        <p style="margin:0 0 2px 0;font-size:11px;color:${BRAND.textMuted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(normalizedItems[2].label)}</p>
                        <p style="margin:0;font-size:18px;font-weight:700;color:${normalizedItems[2].valueColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${escapeHtml(normalizedItems[2].value)}</p>
                      </td>
                    </tr>
                  </table>
                </td></tr>`
}

export interface AssembleNewsletterResult {
  /** Full HTML document for standalone use / previews */
  fullHtml: string
  /** Beehiiv-compatible snippet (just content, no document wrapper or footer) */
  beehiivHtml: string
}

export function assembleNewsletterHtml(
  ticker: string,
  blocks: NewsletterBlock[],
  date: Date,
  quote?: TodayQuote,
  editorialHook?: string,
  subjectLine?: string,
  options?: AssembleNewsletterOptions,
): string {
  const formattedDate = formatDate(date)
  const tickerUpper = escapeHtml(ticker.toUpperCase())
  const header = options?.headerOverride ?? buildNewsletterHeader(ticker, date)
  const introText = options?.introTextOverride ?? buildNewsletterIntroText(quote, editorialHook)
  const statsCard = options?.statsCardOverride ?? buildNewsletterStatsCard(quote)

  // Preheader: editorial hook truncated to ~90 chars for inbox preview
  const preheaderText = introText
    ? introText.slice(0, 90)
    : `${ticker.toUpperCase()} financial snapshot for ${formattedDate}`

  // Build intro inner HTML (no card wrapper — merged into header card)
  let introInnerHtml = ''
  if (options?.introTextOverride) {
    introInnerHtml = `
                <tr id="newsletter-preview-intro"><td colspan="2" style="padding:0 32px 24px 32px;border-top:1px solid ${BRAND.cream300};">
                  <p style="margin:0;padding-top:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;color:${BRAND.textDark};line-height:1.6;">
                    ${escapeHtml(options.introTextOverride)}
                  </p>
                </td></tr>`
  } else if (quote && introText) {
    const pct = quote.changesPercentage
    const pctSign = pct >= 0 ? '+' : ''
    const dollarChange = Math.abs(quote.change)
    const dollarSign = quote.change >= 0 ? '+' : '-'
    const hook = editorialHook ? ` ${escapeHtml(editorialHook)}` : ''
    const name = escapeHtml(quote.name)
    const moveColor = pct >= 0 ? '#16a34a' : '#dc2626'

    introInnerHtml = `
                <tr id="newsletter-preview-intro"><td colspan="2" style="padding:0 32px 24px 32px;border-top:1px solid ${BRAND.cream300};">
                  <p style="margin:0;padding-top:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;color:${BRAND.textDark};line-height:1.6;">
                    <strong>${name}</strong> (<span style="font-weight:600;">${tickerUpper}</span>) is
                    <span style="color:${moveColor};font-weight:600;">${pctSign}${pct.toFixed(2)}% (${dollarSign}$${dollarChange.toFixed(2)})</span> today.${hook}
                  </p>
                </td></tr>`
  }

  // Build stats inner HTML (no card wrapper — merged into header card)
  const statsInnerHtml = statsCard ? renderStatsCardInner(statsCard) : ''
  // Add divider before stats if both intro and stats are present
  const statsDivider = introInnerHtml && statsInnerHtml
    ? `<tr><td colspan="2" style="padding:0 32px;"><div style="border-top:1px solid ${BRAND.cream300};"></div></td></tr>`
    : statsInnerHtml && !introInnerHtml
      ? `<tr><td colspan="2" style="padding:0;"><div style="border-top:1px solid ${BRAND.cream300};"></div></td></tr>`
      : ''
  const headerLogoHtml = renderNewsletterHeaderLogo(header)

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
  <title>${subjectLine ? escapeHtml(subjectLine) : escapeHtml(header.title)}</title>
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
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${NEWSLETTER_CARD_MAX_WIDTH}" style="max-width:${NEWSLETTER_CARD_MAX_WIDTH}px;">

          <!-- Header + Intro + Stats (unified card) -->
          <tr id="newsletter-preview-header"><td style="padding:0 0 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:${NEWSLETTER_CARD_MAX_WIDTH}px;margin:0 auto;background-color:${BRAND.white};border-radius:8px;border:1px solid ${BRAND.cream300};">
                <tr>
                  <td style="padding:24px 32px${introInnerHtml || statsInnerHtml ? '' : ''};">
                    <h1 style="margin:0 0 4px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:${BRAND.sage700};line-height:1.3;">
                      ${escapeHtml(header.title)}
                    </h1>
                    <p style="margin:0;font-size:13px;color:${BRAND.textMuted};">
                      ${escapeHtml(header.dateText)}
                    </p>
                  </td>
                  <td align="right" valign="middle" style="width:60px;padding:24px 32px 24px 0;">
                    ${headerLogoHtml}
                  </td>
                </tr>
${introInnerHtml}
${statsDivider}${statsInnerHtml}
            </table>
          </td></tr>

${blockHtml}

          <!-- Footer -->
          <tr><td style="padding:8px 0 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:${NEWSLETTER_CARD_MAX_WIDTH}px;margin:0 auto;">
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

/**
 * Assemble newsletter HTML specifically for Beehiiv's HTML Snippet block.
 *
 * Outputs just the content (header + intro + stats + blocks) without:
 * - Document wrapper (<!DOCTYPE>, <html>, <head>, <body>)
 * - <style> tags (Beehiiv strips them anyway)
 * - Footer/unsubscribe (Beehiiv handles this)
 * - Preheader text (Beehiiv has its own preview text field)
 *
 * All styles are inline for maximum compatibility.
 */
export function assembleNewsletterHtmlForBeehiiv(
  ticker: string,
  blocks: NewsletterBlock[],
  date: Date,
  quote?: TodayQuote,
  editorialHook?: string,
  subjectLine?: string,
  options?: AssembleNewsletterOptions,
): string {
  const tickerUpper = escapeHtml(ticker.toUpperCase())
  const header = options?.headerOverride ?? buildNewsletterHeader(ticker, date)
  const introText = options?.introTextOverride ?? buildNewsletterIntroText(quote, editorialHook)
  const statsCard = options?.statsCardOverride ?? buildNewsletterStatsCard(quote)

  // Build intro inner HTML (no card wrapper — merged into header card)
  let introInnerHtml = ''
  if (options?.introTextOverride) {
    introInnerHtml = `
                <tr id="newsletter-preview-intro"><td colspan="2" style="padding:0 32px 24px 32px;border-top:1px solid ${BRAND.cream300};">
                  <p style="margin:0;padding-top:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;color:${BRAND.textDark};line-height:1.6;">
                    ${escapeHtml(options.introTextOverride)}
                  </p>
                </td></tr>`
  } else if (quote && introText) {
    const pct = quote.changesPercentage
    const pctSign = pct >= 0 ? '+' : ''
    const dollarChange = Math.abs(quote.change)
    const dollarSign = quote.change >= 0 ? '+' : '-'
    const hook = editorialHook ? ` ${escapeHtml(editorialHook)}` : ''
    const name = escapeHtml(quote.name)
    const moveColor = pct >= 0 ? '#16a34a' : '#dc2626'

    introInnerHtml = `
                <tr id="newsletter-preview-intro"><td colspan="2" style="padding:0 32px 24px 32px;border-top:1px solid ${BRAND.cream300};">
                  <p style="margin:0;padding-top:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;color:${BRAND.textDark};line-height:1.6;">
                    <strong>${name}</strong> (<span style="font-weight:600;">${tickerUpper}</span>) is
                    <span style="color:${moveColor};font-weight:600;">${pctSign}${pct.toFixed(2)}% (${dollarSign}$${dollarChange.toFixed(2)})</span> today.${hook}
                  </p>
                </td></tr>`
  }

  // Build stats inner HTML (no card wrapper — merged into header card)
  const statsInnerHtml = statsCard ? renderStatsCardInner(statsCard) : ''
  // Add divider before stats if both intro and stats are present
  const statsDivider = introInnerHtml && statsInnerHtml
    ? `<tr><td colspan="2" style="padding:0 32px;"><div style="border-top:1px solid ${BRAND.cream300};"></div></td></tr>`
    : statsInnerHtml && !introInnerHtml
      ? `<tr><td colspan="2" style="padding:0;"><div style="border-top:1px solid ${BRAND.cream300};"></div></td></tr>`
      : ''
  const headerLogoHtml = renderNewsletterHeaderLogo(header)

  const blockHtml = blocks
    .map(
      (block) => `
    <!-- Block -->
    <tr><td style="padding:0 0 24px 0;">
      ${block.html}
    </td></tr>`,
    )
    .join('\n')

  // Beehiiv-compatible output: let Beehiiv's post container provide the card
  // background, width, and padding. No outer max-width; no redundant white card
  // around the header section.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <!-- Header + Intro + Stats -->
  <tr id="newsletter-preview-header"><td style="padding:0 0 32px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="padding:24px 32px;">
            <h1 style="margin:0 0 4px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:${BRAND.sage700};line-height:1.3;">
              ${escapeHtml(header.title)}
            </h1>
            <p style="margin:0;font-size:13px;color:${BRAND.textMuted};">
              ${escapeHtml(header.dateText)}
            </p>
          </td>
          <td align="right" valign="middle" style="width:60px;padding:24px 32px 24px 0;">
            ${headerLogoHtml}
          </td>
        </tr>
${introInnerHtml}
${statsDivider}${statsInnerHtml}
    </table>
  </td></tr>

${blockHtml}

  <!-- Minimal footer (Beehiiv handles unsubscribe) -->
  <tr><td style="padding:8px 0 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="padding:16px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:${BRAND.textMuted};line-height:1.5;">
          Data sourced from SEC filings and Financial Modeling Prep. Charts generated by <a href="https://theintraday.com" style="color:${BRAND.sage500};text-decoration:underline;">The Intraday</a>.
        </p>
      </td></tr>
    </table>
  </td></tr>

</table>`
}
