import type { NewsletterBlock, NewsletterBlockContent, SlotName } from './types'
import { load } from 'cheerio'
import { getLayoutTemplate } from './layout-templates'
import {
  NEWSLETTER_CARD_MAX_WIDTH,
  NEWSLETTER_CHART_DISPLAY_HEIGHT,
  NEWSLETTER_CHART_DISPLAY_WIDTH,
  NEWSLETTER_CHART_SIDE_GUTTER,
} from './render-dimensions'
import { assertSafeNewsletterLink } from './delivery-quality'

// ---------------------------------------------------------------------------
// Brand colors (from tailwind.config.ts sage/cream tokens)
// ---------------------------------------------------------------------------

const BRAND = {
  sage500: '#5a6b4a',
  sage700: '#3d4a30',
  cream100: '#f5f5f0',
  cream300: '#e5e5e0',
  gray300: '#d1d5db',
  textDark: '#1a1a1a',
  textMuted: '#6b7280',
  white: '#ffffff',
} as const

const NEWSLETTER_CHART_WIDTH = NEWSLETTER_CHART_DISPLAY_WIDTH
const NEWSLETTER_CHART_HEIGHT = NEWSLETTER_CHART_DISPLAY_HEIGHT

// ---------------------------------------------------------------------------
// Content → slot mapping
// ---------------------------------------------------------------------------

/** Map a slot name to the corresponding field(s) in NewsletterBlockContent. */
function slotHasContent(
  slot: SlotName,
  content: NewsletterBlockContent,
): boolean {
  switch (slot) {
    case 'heading':
      return !!content.heading
    case 'body':
      return !!content.body
    case 'chart':
      return !!content.chartImageUrl
    case 'caption':
      return !!content.caption
    case 'cta':
      return !!content.ctaText && !!content.ctaUrl
    case 'footer':
      return !!content.footer
  }
}

// ---------------------------------------------------------------------------
// HTML fragment builders (inline styles, table layout for email clients)
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderHeading(text: string): string {
  return `<tr><td style="padding:24px 32px 8px 32px;">
  <h2 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:${BRAND.textDark};line-height:1.3;">
    ${escapeHtml(text)}
  </h2>
</td></tr>`
}

const BODY_ALLOWED_TAGS = new Set(['p', 'strong', 'em', 'br', 'ul', 'ol', 'li'])
const BODY_DROP_WITH_CONTENT_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
])

function looksLikeHtml(value: string): boolean {
  return /<\w+[^>]*>/.test(value)
}

function sanitizeBodyHtml(html: string): string {
  const $ = load(`<body>${html}</body>`)
  $('body *').each((_, element) => {
    const tagName = element.tagName?.toLowerCase()
    if (!tagName) return
    if (BODY_DROP_WITH_CONTENT_TAGS.has(tagName)) {
      $(element).remove()
      return
    }
    if (!BODY_ALLOWED_TAGS.has(tagName)) {
      $(element).replaceWith($(element).contents())
      return
    }
    for (const attribute of Object.keys(element.attribs ?? {})) {
      $(element).removeAttr(attribute)
    }
  })
  $('body')
    .contents()
    .filter((_, node) => node.type === 'comment')
    .remove()
  $('body *')
    .contents()
    .filter((_, node) => node.type === 'comment')
    .remove()
  return $('body').html() ?? ''
}

function renderBody(text: string): string {
  const paragraphStyle = `margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;color:${BRAND.textDark};line-height:1.65;`
  const listStyle = `margin:0 0 12px 0;padding-left:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;color:${BRAND.textDark};line-height:1.65;`

  let bodyInner: string
  if (looksLikeHtml(text)) {
    bodyInner = sanitizeBodyHtml(text)
      .replace(/<p>/g, `<p style="${paragraphStyle}">`)
      .replace(/<(ul|ol)>/g, (_, tag) => `<${tag} style="${listStyle}">`)
  } else {
    const escaped = escapeHtml(text)
    const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    bodyInner = `<p style="${paragraphStyle}">${withBold}</p>`
  }

  return `<tr><td style="padding:8px 32px 16px 32px;">
  ${bodyInner}
</td></tr>`
}

function renderChart(imageUrl: string, alt: string, chartUrl?: string): string {
  if (chartUrl) assertSafeNewsletterLink(chartUrl, 'Chart link')
  const img = `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}" width="${NEWSLETTER_CHART_WIDTH}" height="${NEWSLETTER_CHART_HEIGHT}" style="display:block;max-width:100%;height:auto;border-radius:6px;margin:0 auto;" />`
  const content = chartUrl
    ? `<a href="${escapeHtml(chartUrl)}" target="_blank" style="display:inline-block;text-decoration:none;">${img}</a>`
    : img
  return `<tr><td align="center" style="padding:8px ${NEWSLETTER_CHART_SIDE_GUTTER}px;text-align:center;">
  ${content}
</td></tr>`
}

function renderCaption(text: string): string {
  return `<tr><td style="padding:4px 32px 16px 32px;">
  <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:${BRAND.textMuted};line-height:1.4;font-style:italic;">
    ${escapeHtml(text)}
  </p>
</td></tr>`
}

function renderCta(text: string, url: string): string {
  assertSafeNewsletterLink(url, 'CTA link')
  // VML fallback for rounded-corner buttons in Outlook
  return `<tr><td style="padding:16px 32px;" align="center">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(url)}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="14%" strokecolor="${BRAND.sage700}" fillcolor="${BRAND.sage500}">
    <w:anchorlock/>
    <center style="color:${BRAND.white};font-family:sans-serif;font-size:14px;font-weight:bold;">${escapeHtml(text)}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-->
  <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:12px 32px;background-color:${BRAND.sage500};color:${BRAND.white};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;line-height:1;">
    ${escapeHtml(text)}
  </a>
  <!--<![endif]-->
</td></tr>`
}

function renderFooter(text: string): string {
  return `<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid ${BRAND.cream300};">
  <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:${BRAND.textMuted};line-height:1.4;">
    ${escapeHtml(text)}
  </p>
</td></tr>`
}

// ---------------------------------------------------------------------------
// Slot → HTML dispatcher
// ---------------------------------------------------------------------------

function renderSlot(
  slot: SlotName,
  content: NewsletterBlockContent,
): string {
  switch (slot) {
    case 'heading':
      return content.heading ? renderHeading(content.heading) : ''
    case 'body':
      return content.body ? renderBody(content.body) : ''
    case 'chart':
      return content.chartImageUrl
        ? renderChart(content.chartImageUrl, content.chartAlt ?? 'Chart', content.chartExportUrl)
        : ''
    case 'caption':
      return content.caption ? renderCaption(content.caption) : ''
    case 'cta':
      return content.ctaText && content.ctaUrl
        ? renderCta(content.ctaText, content.ctaUrl)
        : ''
    case 'footer':
      return content.footer ? renderFooter(content.footer) : ''
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a newsletter block from a layout template and content.
 *
 * Returns structured data + an email-safe HTML fragment using table layout
 * and inline styles for maximum email client compatibility.
 *
 * Throws if:
 *   - Layout ID is unknown
 *   - A required slot is missing content
 */
export function buildNewsletterBlock(
  layoutId: string,
  content: NewsletterBlockContent,
): NewsletterBlock {
  if (content.chartExportUrl) {
    assertSafeNewsletterLink(content.chartExportUrl, 'Chart link')
  }
  if (content.ctaUrl) {
    assertSafeNewsletterLink(content.ctaUrl, 'CTA link')
  }
  const layout = getLayoutTemplate(layoutId)
  if (!layout) {
    throw new Error(`Unknown newsletter layout: "${layoutId}"`)
  }

  // Validate required slots
  for (const slot of layout.slots) {
    if (slot.required && !slotHasContent(slot.name, content)) {
      throw new Error(
        `Layout "${layoutId}" requires slot "${slot.name}" but no content was provided`,
      )
    }
  }

  // Build HTML rows in slot order
  const rows = layout.slots
    .map((slot) => renderSlot(slot.name, content))
    .filter(Boolean)
    .join('\n')

  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:${NEWSLETTER_CARD_MAX_WIDTH}px;margin:0 auto;background-color:${BRAND.white};border-radius:8px;border:1px solid ${BRAND.gray300};">
${rows}
</table>`

  return { layoutId, data: content, html }
}
