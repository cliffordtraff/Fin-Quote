import { buildPriceExportEditorBaseSpec } from './chart-editor'
import { isPriceNewsletterChartSpec } from './chart-spec'
import { resolveChartingPlatformNewsletterChart } from './charting-platform-export'
import { sha256Hex } from './sha256'
import type {
  NewsletterChartSpec,
  NewsletterDraftBlock,
  NewsletterDraftChartProvenance,
  NewsletterDraftChartProvenanceSource,
} from './types'

export const NEWSLETTER_CHART_RENDERER_CONTRACT =
  'the-intraday-newsletter-chart/v1'

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry) ?? null)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  return undefined
}

export function canonicalNewsletterChartScene(scene: NewsletterChartSpec): string {
  return JSON.stringify(canonicalize(scene))
}

export function hashNewsletterChartScene(scene: NewsletterChartSpec): string {
  return sha256Hex(canonicalNewsletterChartScene(scene))
}

export function immutableNewsletterImageDigest(
  imageUrl: string,
): string | null {
  return (
    imageUrl.match(/\/immutable\/[0-9a-f]{2}\/([0-9a-f]{64})\.png(?:$|[?#])/i)?.[1]
      ?.toLowerCase() ?? null
  )
}

export function materializeNewsletterChartScene(
  scene: NewsletterChartSpec,
  capturedAt: string,
): NewsletterChartSpec {
  const capturedOn = new Date(capturedAt)
  if (!Number.isFinite(capturedOn.getTime())) {
    throw new Error('Chart capture timestamp must be a valid ISO date')
  }

  if (isPriceNewsletterChartSpec(scene)) {
    const chartExportSpec = buildPriceExportEditorBaseSpec(scene, {
      theme: scene.chartExportSpec?.theme === 'dark' ? 'dark' : 'light',
      now: capturedOn,
    })
    return JSON.parse(
      JSON.stringify({
        ...scene,
        chartExportSpec,
      }),
    ) as NewsletterChartSpec
  }

  const resolved = resolveChartingPlatformNewsletterChart(scene, {
    chartBaseUrl: 'https://charts.theintraday.com',
    theme: 'light',
  })
  return JSON.parse(
    JSON.stringify({
      ...scene,
      editorState: resolved.fundState ?? {},
    }),
  ) as NewsletterChartSpec
}

export function buildNewsletterChartProvenance(options: {
  source: NewsletterDraftChartProvenanceSource
  capturedAt: string
  imageUrl: string
  interactiveUrl: string
  scene: NewsletterChartSpec
  libraryItemId?: string
  rendererContract?: string
  imageSha256?: string | null
}): NewsletterDraftChartProvenance {
  const scene = JSON.parse(JSON.stringify(options.scene)) as NewsletterChartSpec
  return {
    version: 1,
    source: options.source,
    ...(options.libraryItemId ? { libraryItemId: options.libraryItemId } : {}),
    capturedAt: options.capturedAt,
    rendererContract:
      options.rendererContract ?? NEWSLETTER_CHART_RENDERER_CONTRACT,
    imageUrl: options.imageUrl,
    imageSha256:
      options.imageSha256 ?? immutableNewsletterImageDigest(options.imageUrl),
    interactiveUrl: options.interactiveUrl,
    scene,
    sceneSha256: hashNewsletterChartScene(scene),
  }
}

export function isNewsletterChartProvenanceCurrent(
  provenance: NewsletterDraftChartProvenance | undefined,
  options: {
    imageUrl: string
    interactiveUrl: string
    scene: NewsletterChartSpec
  },
): boolean {
  if (!provenance || provenance.version !== 1) return false
  const immutableImageDigest = immutableNewsletterImageDigest(options.imageUrl)
  if (
    !Number.isFinite(Date.parse(provenance.capturedAt)) ||
    provenance.rendererContract !== NEWSLETTER_CHART_RENDERER_CONTRACT ||
    (provenance.imageSha256 != null &&
      !/^[0-9a-f]{64}$/i.test(provenance.imageSha256)) ||
    (immutableImageDigest != null &&
      provenance.imageSha256 !== immutableImageDigest)
  ) {
    return false
  }
  return (
    provenance.imageUrl === options.imageUrl &&
    provenance.interactiveUrl === options.interactiveUrl &&
    provenance.sceneSha256 === hashNewsletterChartScene(options.scene) &&
    canonicalNewsletterChartScene(provenance.scene) ===
      canonicalNewsletterChartScene(options.scene)
  )
}

export function isNewsletterChartLibraryEvidenceCurrent(item: {
  id: string
  capturedAt: string
  rendererContract: string
  chartImageUrl: string
  imageSha256: string | null
  chartExportUrl: string
  chartSpec: NewsletterChartSpec
  sceneHash: string
}): boolean {
  return isNewsletterChartProvenanceCurrent(
    {
      version: 1,
      source: 'chart_library',
      libraryItemId: item.id,
      capturedAt: item.capturedAt,
      rendererContract: item.rendererContract,
      imageUrl: item.chartImageUrl,
      imageSha256: item.imageSha256,
      interactiveUrl: item.chartExportUrl,
      scene: item.chartSpec,
      sceneSha256: item.sceneHash,
    },
    {
      imageUrl: item.chartImageUrl,
      interactiveUrl: item.chartExportUrl,
      scene: item.chartSpec,
    },
  )
}

export function isNewsletterChartCaptureCurrentForMarketDate(
  capturedAt: string | null | undefined,
  marketDate: string,
): boolean {
  return (
    typeof capturedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
      capturedAt,
    ) &&
    Number.isFinite(Date.parse(capturedAt)) &&
    capturedAt.slice(0, 10) >= marketDate
  )
}

/**
 * Compares the chart evidence and the reader-visible labels that describe it.
 * Editorial prose is intentionally excluded: automation may preserve that copy
 * while still requiring review when the chart underneath it changes.
 */
export function hasSameNewsletterDraftChartEvidence(
  left: NewsletterDraftBlock,
  right: NewsletterDraftBlock,
): boolean {
  return (
    left.chartImageUrl === right.chartImageUrl &&
    left.chartAlt === right.chartAlt &&
    left.chartExportUrl === right.chartExportUrl &&
    canonicalNewsletterChartScene(left.chartSpec) ===
      canonicalNewsletterChartScene(right.chartSpec) &&
    JSON.stringify(canonicalize(left.chartProvenance ?? null)) ===
      JSON.stringify(canonicalize(right.chartProvenance ?? null)) &&
    left.chartNeedsRegeneration === right.chartNeedsRegeneration &&
    (left.caption ?? null) === (right.caption ?? null)
  )
}
