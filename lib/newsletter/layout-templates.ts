import type { NewsletterLayoutTemplate } from './types'

/**
 * Registry of newsletter block layout templates.
 *
 * Each layout defines an ordered list of slots. The block builder fills
 * them with content and produces email-safe HTML.
 */
export const LAYOUT_TEMPLATES: NewsletterLayoutTemplate[] = [
  {
    id: 'chart_focus',
    label: 'Chart Focus',
    slots: [
      { name: 'heading', required: true },
      { name: 'chart', required: true },
      { name: 'caption', required: false },
      { name: 'footer', required: false },
    ],
  },
  {
    id: 'chart_plus_commentary',
    label: 'Chart + Commentary',
    slots: [
      { name: 'heading', required: true },
      { name: 'body', required: true },
      { name: 'chart', required: true },
      { name: 'caption', required: false },
      { name: 'footer', required: false },
    ],
  },
  {
    id: 'chart_with_cta',
    label: 'Chart with CTA',
    slots: [
      { name: 'heading', required: true },
      { name: 'body', required: false },
      { name: 'chart', required: true },
      { name: 'caption', required: false },
      { name: 'cta', required: true },
      { name: 'footer', required: false },
    ],
  },
]

/** Lookup a layout template by ID. */
export function getLayoutTemplate(
  id: string,
): NewsletterLayoutTemplate | undefined {
  return LAYOUT_TEMPLATES.find((t) => t.id === id)
}

/** All layout IDs. */
export const LAYOUT_TEMPLATE_IDS = LAYOUT_TEMPLATES.map((t) => t.id)
