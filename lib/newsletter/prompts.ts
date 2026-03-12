import { EDITORIAL_TEMPLATES } from './editorial-templates'
import type { NewsletterContext, TemplateSelection, GeneratedCopy } from './types'

// ---------------------------------------------------------------------------
// Template selection prompt
// ---------------------------------------------------------------------------

/**
 * Build the messages for the LLM call that selects which editorial
 * chart templates tell the most compelling story for this company.
 */
export function buildTemplateSelectionMessages(
  context: NewsletterContext,
  maxSelections: number,
): Array<{ role: 'system' | 'user'; content: string }> {
  const templateDescriptions = EDITORIAL_TEMPLATES.map(
    (t) =>
      `- id: "${t.id}"\n  label: ${t.label}\n  description: ${t.description}\n  whenToUse: ${t.whenToUse}`,
  ).join('\n\n')

  const system = [
    'You are a financial newsletter editor for The Intraday.',
    `Select ${maxSelections} chart templates that tell the most compelling visual story for this company.`,
    'Pick templates that highlight the most interesting or noteworthy trends in the data.',
    'Do NOT pick templates whose underlying data is flat or uninteresting.',
    '',
    'Respond with JSON only:',
    '{ "selections": [{ "templateId": "<id>", "reason": "<1 sentence editorial angle>" }] }',
  ].join('\n')

  const user = [
    `Company: ${context.ticker}`,
    '',
    '=== Financial Data (last 7 years) ===',
    JSON.stringify(context.financials, null, 2),
    '',
    '=== Highlights ===',
    JSON.stringify(context.highlights, null, 2),
    '',
    '=== Available Templates ===',
    templateDescriptions,
  ].join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]
}

/**
 * Parse the LLM response for template selection.
 * Validates that returned template IDs actually exist.
 */
export function parseTemplateSelections(
  responseText: string,
  maxSelections: number,
): TemplateSelection[] {
  const parsed = JSON.parse(responseText)
  const selections: TemplateSelection[] = parsed.selections ?? []

  const validIds = new Set(EDITORIAL_TEMPLATES.map((t) => t.id))
  const validated = selections.filter((s) => validIds.has(s.templateId))

  return validated.slice(0, maxSelections)
}

// ---------------------------------------------------------------------------
// Copy generation prompt
// ---------------------------------------------------------------------------

/**
 * Build the messages for the LLM call that generates editorial copy
 * (headline, body, caption) for a single newsletter chart section.
 */
export function buildCopyGenerationMessages(
  context: NewsletterContext,
  templateId: string,
  templateLabel: string,
  editorialAngle: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  const system = [
    'You are a financial newsletter copywriter for The Intraday.',
    'Write concise, data-grounded copy for one chart section of a newsletter.',
    '',
    'Rules:',
    '- headline: 6-12 words, punchy, no ticker symbol',
    '- body: 2-3 sentences with specific numbers (use $B/$M format)',
    '- caption: 1 sentence describing what the chart shows',
    '- All numbers MUST come from the provided data — never invent figures',
    '- Write in present tense for current state, past tense for trends',
    '- Do not use markdown formatting',
    '',
    'Respond with JSON only:',
    '{ "headline": "...", "body": "...", "caption": "..." }',
  ].join('\n')

  const user = [
    `Company: ${context.ticker}`,
    `Chart template: ${templateLabel}`,
    `Editorial angle: ${editorialAngle}`,
    '',
    '=== Financial Data ===',
    JSON.stringify(context.financials, null, 2),
    '',
    '=== Highlights ===',
    JSON.stringify(context.highlights, null, 2),
  ].join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]
}

/**
 * Parse the LLM response for copy generation.
 */
export function parseCopyGeneration(responseText: string): GeneratedCopy {
  const parsed = JSON.parse(responseText)
  return {
    headline: parsed.headline ?? '',
    body: parsed.body ?? '',
    caption: parsed.caption ?? '',
  }
}
