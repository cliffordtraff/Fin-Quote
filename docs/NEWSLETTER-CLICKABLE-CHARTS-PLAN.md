# Clickable Newsletter Charts — Implementation Plan

## Goal

Make every chart image in the newsletter a clickable link that opens the interactive version of that chart on theintraday.com. Readers see the static PNG in their inbox but can click to explore the data with hover tooltips, zoom, etc.

---

## How It Works Today

The newsletter pipeline already generates a `ChartExportSpec` for each chart and encodes it as a base64 URL parameter. Puppeteer navigates to `/charts/export?spec=<base64>`, waits for the chart to render, and screenshots it. After that, **the spec and URL are thrown away** — only the PNG filename makes it into the final HTML.

The key insight: we already have everything we need. We just need to stop discarding the URL and thread it through to the `<img>` tag.

---

## Changes (4 files, ~15 lines)

### 1. `lib/newsletter/types.ts` — Add field to block content

Add an optional `chartExportUrl` field to `NewsletterBlockContent`:

```diff
 export interface NewsletterBlockContent {
   heading?: string
   body?: string
   chartImageUrl?: string
   chartAlt?: string
+  chartExportUrl?: string   // URL to interactive chart on the website
   caption?: string
   ctaText?: string
   ctaUrl?: string
   footer?: string
 }
```

### 2. `lib/newsletter/build-block.ts` — Wrap `<img>` in `<a>` tag

Update `renderChart()` to accept the URL and wrap the image in a link when provided:

```diff
-function renderChart(imageUrl: string, alt: string): string {
-  return `<tr><td style="padding:8px 32px;">
-  <img src="${escapeHtml(imageUrl)}" ... />
-</td></tr>`
+function renderChart(imageUrl: string, alt: string, chartUrl?: string): string {
+  const img = `<img src="${escapeHtml(imageUrl)}" ... />`
+  const content = chartUrl
+    ? `<a href="${escapeHtml(chartUrl)}" target="_blank" style="display:block;text-decoration:none;">${img}</a>`
+    : img
+  return `<tr><td style="padding:8px 32px;">${content}</td></tr>`
 }
```

Update `renderSlot()` to pass the URL through:

```diff
 case 'chart':
   return content.chartImageUrl
-    ? renderChart(content.chartImageUrl, content.chartAlt ?? 'Chart')
+    ? renderChart(content.chartImageUrl, content.chartAlt ?? 'Chart', content.chartExportUrl)
     : ''
```

### 3. `lib/newsletter/orchestrate.ts` — Thread the URL to block builder

The resolved charts already have an `exportUrl` field. Pass it when building blocks:

```diff
 for (let i = 0; i < selections.length; i++) {
   const copy = generatedCopies[i]
   const chartPath = chartPaths[i]
   const chartImageUrl = chartPath.split('/').pop()!
+  const chartExportUrl = `${baseUrl}${resolvedCharts[i].exportUrl}`

   const block = buildNewsletterBlock('chart_plus_commentary', {
     heading: copy.headline,
     body: copy.body,
     chartImageUrl,
+    chartExportUrl,
     chartAlt: `${tickerUpper} ${selections[i].templateId.replace(/_/g, ' ')} chart`,
   })
 }
```

### 4. `lib/newsletter/resolve-chart.ts` — Verify exportUrl exists

Already present. `resolveEditorialChart()` returns `ResolvedChart` which includes:
- `spec` — the full `ChartExportSpec`
- `exportUrl` — the relative URL like `/charts/export?spec=<base64>`

No changes needed here.

---

## Production URL Consideration

In development, `baseUrl` is `http://localhost:3005`, so chart links would point there. In production, it would need to be `https://theintraday.com`. The `baseUrl` is already configurable via:
- CLI: `--base-url https://theintraday.com`
- API: auto-detected from request headers

No extra work needed — just pass the right base URL when generating.

---

## Email Client Compatibility

- `<a>` tags wrapping `<img>` tags work in all major email clients (Gmail, Apple Mail, Outlook, Yahoo)
- `target="_blank"` ensures the link opens in the browser, not in the email client
- No JavaScript required — it's a plain hyperlink

---

## Optional Enhancements (not in scope for v1)

- **"View interactive chart" text link** below each chart image as a secondary CTA
- **UTM tracking parameters** on the URLs for newsletter click analytics
- **Dedicated `/charts/view` page** that renders the same chart but without the headless export styling (bigger title, no `exportMode` flag, navigation bar visible)
- **Hover badge** — a small "Click to explore" overlay on the chart image (would need CSS-in-email tricks)

---

## Testing

1. Generate a newsletter: `npx tsx scripts/generate-newsletter.ts --ticker AAPL`
2. Open the HTML file in browser
3. Click on any chart image — should navigate to `/charts/export?spec=...`
4. Verify the interactive chart loads with the same data and styling
