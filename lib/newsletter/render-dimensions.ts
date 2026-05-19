import type { NewsletterChartSpec } from './types'

// Canonical newsletter chart export dimensions.
//
// The PNG dimensions we send to the charting app double as the viewport the
// chart engine lays out for. So whatever we set here is what the chart "thinks"
// it's being drawn at: font sizes, candle widths, axis spacing, padding —
// everything keys off this viewport. The email then displays the PNG at the
// same width, so the chart you see in the email is the chart the engine drew.
//
// We render a single canonical size for every chart type. Same spec → same
// dimensions, regardless of whether the render comes from the orchestrator,
// the editor regenerate path, or anywhere else.

export const NEWSLETTER_CHART_DISPLAY_WIDTH = 620
export const NEWSLETTER_CHART_DISPLAY_HEIGHT = 440

// 20px gutter on each side of the chart inside the card.
export const NEWSLETTER_CHART_SIDE_GUTTER = 20
export const NEWSLETTER_CARD_MAX_WIDTH =
  NEWSLETTER_CHART_DISPLAY_WIDTH + NEWSLETTER_CHART_SIDE_GUTTER * 2

export interface NewsletterChartRenderDimensions {
  width: number
  height: number
}

export function getNewsletterChartRenderDimensions(
  _spec: NewsletterChartSpec,
): NewsletterChartRenderDimensions {
  return {
    width: NEWSLETTER_CHART_DISPLAY_WIDTH,
    height: NEWSLETTER_CHART_DISPLAY_HEIGHT,
  }
}
