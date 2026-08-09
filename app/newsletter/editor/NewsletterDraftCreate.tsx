'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface DraftCreateResponse {
  draft: {
    id: string
  }
  error?: string
}

interface NewsletterDraftCreateProps {
  defaultFormat?: 'single_stock' | 'market_roundup'
  beforeCreate?: () => boolean
  getEditSequence?: () => number
  beforeNavigate?: (submittedEditSequence: number | null) => boolean
}

export default function NewsletterDraftCreate({
  defaultFormat = 'single_stock',
  beforeCreate,
  getEditSequence,
  beforeNavigate,
}: NewsletterDraftCreateProps = {}) {
  const router = useRouter()
  const [ticker, setTicker] = useState('')
  const [generationPrompt, setGenerationPrompt] = useState('')
  const [format, setFormat] = useState<'single_stock' | 'market_roundup'>(defaultFormat)
  const [submittingMode, setSubmittingMode] = useState<'generate' | 'blank' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const requestControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestControllerRef.current?.abort()
    }
  }, [])

  const normalizedTicker = useMemo(() => ticker.trim().toUpperCase(), [ticker])
  const promptPlaceholder = useMemo(
    () =>
      format === 'market_roundup'
        ? 'Optional: describe the theme, sector, catalyst, or type of roundup you want. Example: Generate a newsletter based on chip stocks reacting to earnings.'
        : 'Optional: describe the angle you want. Example: Focus on margin pressure after earnings and whether the recent selloff looks overdone.',
    [format],
  )

  async function createDraft(mode: 'generate' | 'blank') {
    if (beforeCreate && !beforeCreate()) return
    const submittedEditSequence = getEditSequence?.() ?? null
    const controller = new AbortController()
    requestControllerRef.current?.abort()
    requestControllerRef.current = controller

    try {
      setSubmittingMode(mode)
      setError(null)
      const response = await fetch('/api/newsletter/drafts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          ticker: format === 'single_stock' ? normalizedTicker || undefined : undefined,
          format,
          generationPrompt:
            mode === 'generate' ? generationPrompt.trim() || undefined : undefined,
          creationMode: mode,
        }),
      })

      const payload = (await response.json()) as DraftCreateResponse

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create newsletter draft')
      }

      if (!mountedRef.current || controller.signal.aborted) return
      if (beforeNavigate && !beforeNavigate(submittedEditSequence)) {
        setError(
          'The new draft was created, but newer edits in this editor are still open. It was not opened automatically.',
        )
        return
      }
      router.push(`/newsletter/editor/${payload.draft.id}`)
    } catch (err) {
      if (controller.signal.aborted || !mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to create newsletter draft')
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null
      }
      if (mountedRef.current) setSubmittingMode(null)
    }
  }

  return (
    <section
      aria-labelledby="newsletter-draft-create-title"
      className="mx-auto w-full max-w-md rounded-2xl border border-gray-300 bg-white p-4 shadow-sm sm:p-6"
    >
      <h2
        id="newsletter-draft-create-title"
        className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600"
      >
        Start A Draft
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        Generate with AI, or start from a blank manual draft you fill in yourself.
      </p>
      <div className="mt-4 grid gap-3">
        <fieldset>
          <legend className="sr-only">Newsletter format</legend>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-1">
            <button
              type="button"
              aria-pressed={format === 'single_stock'}
              onClick={() => setFormat('single_stock')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                format === 'single_stock'
                  ? 'bg-sage-700 text-white'
                  : 'text-gray-700 hover:bg-cream-100'
              }`}
            >
              Single stock
            </button>
            <button
              type="button"
              aria-pressed={format === 'market_roundup'}
              onClick={() => setFormat('market_roundup')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                format === 'market_roundup'
                  ? 'bg-sage-700 text-white'
                  : 'text-gray-700 hover:bg-cream-100'
              }`}
            >
              Market roundup
            </button>
          </div>
        </fieldset>

        {format === 'single_stock' ? (
          <div>
            <label htmlFor="newsletter-draft-ticker" className="sr-only">
              Stock ticker
            </label>
            <input
              id="newsletter-draft-ticker"
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
              placeholder="AAPL"
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium uppercase tracking-[0.16em] text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
            />
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <label
            htmlFor="newsletter-generation-prompt"
            className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-600"
          >
            AI generation prompt
          </label>
          <p
            id="newsletter-generation-prompt-description"
            className="mt-2 text-sm text-gray-500"
          >
            {format === 'market_roundup'
              ? 'Leave this blank to auto-pick 3-5 of today’s most interesting names, or describe the theme you want.'
              : 'Leave this blank for the default deep dive, or describe the angle you want the generator to emphasize.'}
          </p>
          <textarea
            id="newsletter-generation-prompt"
            aria-describedby="newsletter-generation-prompt-description"
            value={generationPrompt}
            onChange={(event) => setGenerationPrompt(event.target.value)}
            placeholder={promptPlaceholder}
            rows={4}
            maxLength={500}
            className="mt-3 w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
          />
        </div>

        <button
          type="button"
          onClick={() => void createDraft('generate')}
          disabled={submittingMode !== null}
          className="rounded-xl bg-sage-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submittingMode === 'generate' ? 'Generating…' : 'Generate'}
        </button>

        <button
          type="button"
          onClick={() => void createDraft('blank')}
          disabled={submittingMode !== null}
          className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:border-sage-300 hover:bg-sage-50 hover:text-sage-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submittingMode === 'blank' ? 'Creating blank draft…' : 'Start blank'}
        </button>
        <p className="text-xs leading-5 text-gray-500">
          Start blank skips AI generation and creates editable sections with chart
          blocks ready for the Chart Builder.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
    </section>
  )
}
