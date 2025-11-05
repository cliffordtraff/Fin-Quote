'use client'

import { useMemo } from 'react'
import type { FlowEvent, FlowEventGroup, FlowEventStatus } from '@/lib/flow/events'

export type FlowFilter = 'all' | 'errors' | 'warnings' | 'slow' | 'cost'

type FlowVisualizationProps = {
  events: FlowEvent[]
  isOpen: boolean
  onToggle: () => void
  filter: FlowFilter
  onFilterChange: (filter: FlowFilter) => void
}

const FILTERS: Array<{ value: FlowFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'errors', label: 'Errors' },
  { value: 'warnings', label: 'Warnings' },
  { value: 'slow', label: 'Slow >1s' },
  { value: 'cost', label: 'Cost' },
]

const GROUP_LABELS: Record<FlowEventGroup, string> = {
  planning: 'Planning',
  data: 'Data',
  answering: 'Answering',
}

const STEP_LABELS: Record<string, string> = {
  tool_selection: 'Tool Selection',
  tool_execution: 'Tool Execution',
  chart_generation: 'Chart Generation',
  answer_generation: 'Answer Generation',
  validation: 'Validation',
  followup_generation: 'Follow-up Suggestions',
}

const STATUS_STYLES: Record<FlowEventStatus, string> = {
  success: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300',
  active: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  pending: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400',
}

const STATUS_DOT: Record<FlowEventStatus, string> = {
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  active: 'bg-blue-500 animate-pulse',
  pending: 'bg-gray-300',
}

const formatDuration = (durationMs?: number) => {
  if (durationMs == null) return '—'
  if (durationMs < 1000) return `${durationMs} ms`
  const seconds = durationMs / 1000
  return `${seconds.toFixed(1)} s`
}

const formatCost = (costUsd?: number) => {
  if (!costUsd || costUsd <= 0) return null
  return `$${costUsd.toFixed(costUsd < 0.01 ? 4 : 2)}`
}

const filterEvents = (events: FlowEvent[], filter: FlowFilter) => {
  switch (filter) {
    case 'errors':
      return events.filter(event => event.status === 'error')
    case 'warnings':
      return events.filter(event => event.status === 'warning')
    case 'slow':
      return events.filter(event => typeof event.durationMs === 'number' && event.durationMs >= 1000)
    case 'cost':
      return events.filter(event => (event.costUsd || 0) > 0)
    default:
      return events
  }
}

const eventToLabel = (event: FlowEvent) => STEP_LABELS[event.step] ?? event.step.replace(/_/g, ' ')

const sanitizeDetails = (details?: Record<string, unknown>) => {
  if (!details) return []

  return Object.entries(details)
    .filter(([, value]) => {
      const valueType = typeof value
      if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
        return true
      }
      if (value && valueType === 'object' && !Array.isArray(value)) {
        return Object.keys(value as Record<string, unknown>).length > 0
      }
      return false
    })
    .slice(0, 4)
}

const SlowSummary = ({ event }: { event: FlowEvent | undefined }) => {
  if (!event || !event.durationMs) return null
  return (
    <span className="text-xs text-gray-500">
      Slowest: {eventToLabel(event)} ({formatDuration(event.durationMs)})
    </span>
  )
}

const CostSummary = ({ total }: { total: number }) => {
  if (total <= 0) return null
  return (
    <span className="text-xs text-gray-500">
      Cost: ${total.toFixed(total < 0.01 ? 4 : 2)}
    </span>
  )
}

const SummaryBadge = ({
  slowest,
  totalCost,
}: {
  slowest: FlowEvent | undefined
  totalCost: number
}) => {
  if (!slowest && totalCost <= 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
      <SlowSummary event={slowest} />
      <CostSummary total={totalCost} />
    </div>
  )
}

const FilterChips = ({
  active,
  onFilterChange,
  events,
}: {
  active: FlowFilter
  onFilterChange: (filter: FlowFilter) => void
  events: FlowEvent[]
}) => {
  const counts = useMemo(() => ({
    errors: events.filter(event => event.status === 'error').length,
    warnings: events.filter(event => event.status === 'warning').length,
    slow: events.filter(event => event.durationMs && event.durationMs >= 1000).length,
    cost: events.filter(event => (event.costUsd || 0) > 0).length,
  }), [events])

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {FILTERS.map(filter => {
        const isActive = active === filter.value
        const extra =
          filter.value === 'errors' ? counts.errors
            : filter.value === 'warnings' ? counts.warnings
            : filter.value === 'slow' ? counts.slow
            : filter.value === 'cost' ? counts.cost
            : undefined

        const disabled = filter.value !== 'all' && (extra ?? 0) === 0

        return (
          <button
            key={filter.value}
            type="button"
            onClick={() => onFilterChange(filter.value)}
            disabled={disabled}
            className={[
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'border-blue-500 bg-blue-50 text-blue-600'
                : 'border-gray-200 text-gray-500 hover:border-blue-200 hover:text-blue-600',
              disabled ? 'opacity-40 cursor-not-allowed hover:border-gray-200 hover:text-gray-500' : '',
            ].join(' ')}
          >
            {filter.label}
            {extra != null && (
              <span className="ml-1 text-[11px] text-gray-400">({extra})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

const FlowEventRow = ({ event }: { event: FlowEvent }) => {
  const statusStyle = STATUS_STYLES[event.status] ?? STATUS_STYLES.pending
  const dotStyle = STATUS_DOT[event.status] ?? STATUS_DOT.pending
  const costLabel = formatCost(event.costUsd)
  const detailEntries = sanitizeDetails(event.details)

  return (
    <div className={`rounded-xl border p-3 text-sm shadow-sm transition-colors ${statusStyle}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className={`inline-flex items-center gap-2 text-sm font-semibold`}>
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotStyle}`} />
            {event.summary || eventToLabel(event)}
          </span>
          <div className="mt-1 text-xs uppercase tracking-wide text-gray-400">
            {GROUP_LABELS[event.group]} • {eventToLabel(event)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-gray-500">
          <span>{formatDuration(event.durationMs)}</span>
          {costLabel && <span>{costLabel}</span>}
        </div>
      </div>

      {event.why && (
        <div className="mt-2 rounded-md border border-dashed border-blue-200 bg-white/30 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
          <span className="font-medium text-blue-800 dark:text-blue-200">Why:</span> <span className="italic">{event.why}</span>
        </div>
      )}

      {detailEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
          {detailEntries.map(([key, value]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="uppercase tracking-wide text-[10px] text-gray-400 dark:text-gray-500">{key}</span>
              <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const FlowGroupSection = ({
  label,
  events,
}: {
  label: string
  events: FlowEvent[]
}) => {
  if (events.length === 0) return null

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</h3>
      <div className="space-y-3">
        {events.map(event => (
          <FlowEventRow key={event.id} event={event} />
        ))}
      </div>
    </section>
  )
}

const FlowVisualization = ({
  events,
  isOpen,
  onToggle,
  filter,
  onFilterChange,
}: FlowVisualizationProps) => {
  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        if (a.sequence === b.sequence) {
          return a.startedAt.localeCompare(b.startedAt)
        }
        return a.sequence - b.sequence
      }),
    [events]
  )

  const filteredEvents = useMemo(
    () => filterEvents(sortedEvents, filter),
    [sortedEvents, filter]
  )

  const groupedEvents = useMemo(() => {
    const groups: Record<FlowEventGroup, FlowEvent[]> = {
      planning: [],
      data: [],
      answering: [],
    }

    for (const event of filteredEvents) {
      groups[event.group]?.push(event)
    }

    return groups
  }, [filteredEvents])

  const slowestEvent = useMemo(
    () =>
      events.reduce<FlowEvent | undefined>(
        (slowest, event) => {
          if (!event.durationMs) return slowest
          if (!slowest || (slowest.durationMs ?? 0) < event.durationMs) {
            return event
          }
          return slowest
        },
        undefined
      ),
    [events]
  )

  const totalCost = useMemo(
    () => events.reduce((sum, event) => sum + (event.costUsd || 0), 0),
    [events]
  )

  return (
    <>
      <aside
        className={[
          'fixed right-0 top-[80px] z-30 flex h-[calc(100vh-80px)] w-full max-w-[400px] transform flex-col border-l border-gray-200 bg-white shadow-xl transition-transform duration-300 ease-in-out overflow-hidden dark:border-gray-700 dark:bg-gray-900',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 flex-shrink-0 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Flow Visualization</h2>
            <SummaryBadge slowest={slowestEvent} totalCost={totalCost} />
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label={isOpen ? 'Close flow panel' : 'Open flow panel'}
          >
            {isOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 8.586l4.95-4.95a1 1 0 111.414 1.414L11.414 10l4.95 4.95a1 1 0 01-1.414 1.414L10 11.414l-4.95 4.95a1 1 0 01-1.414-1.414L8.586 10l-4.95-4.95A1 1 0 115.05 3.636L10 8.586z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.75 3a.75.75 0 00-1.5 0v6.25H3a.75.75 0 000 1.5h6.25V17a.75.75 0 001.5 0v-6.25H17a.75.75 0 000-1.5h-6.25V3z" />
              </svg>
            )}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 overscroll-contain">
          <FilterChips active={filter} onFilterChange={onFilterChange} events={events} />

          {filteredEvents.length === 0 ? (
            <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              {events.length === 0
                ? 'Submit a question to see the execution flow.'
                : 'No events match the selected filter.'}
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {(Object.keys(GROUP_LABELS) as FlowEventGroup[]).map(group => (
                <FlowGroupSection
                  key={group}
                  label={GROUP_LABELS[group]}
                  events={groupedEvents[group]}
                />
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

export default FlowVisualization
