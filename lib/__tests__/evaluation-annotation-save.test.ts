import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearEvaluationAnnotationSaves,
  mergeEvaluationAnnotationFiles,
  scheduleEvaluationAnnotationSave,
  type AnnotationSaveTimer,
} from '@/lib/evaluation-annotation-save'

afterEach(() => {
  vi.useRealTimers()
})

describe('evaluation annotation save scheduling', () => {
  it('debounces each question independently', () => {
    vi.useFakeTimers()
    const timers = new Map<number, AnnotationSaveTimer>()
    const saveFirst = vi.fn()
    const saveSecond = vi.fn()

    scheduleEvaluationAnnotationSave(timers, 1, saveFirst)
    vi.advanceTimersByTime(100)
    scheduleEvaluationAnnotationSave(timers, 2, saveSecond)
    vi.advanceTimersByTime(400)

    expect(saveFirst).toHaveBeenCalledOnce()
    expect(saveSecond).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(saveSecond).toHaveBeenCalledOnce()
    expect(timers.size).toBe(0)
  })

  it('replaces only the pending save for the same question and cleans up', () => {
    vi.useFakeTimers()
    const timers = new Map<number, AnnotationSaveTimer>()
    const staleSave = vi.fn()
    const latestSave = vi.fn()
    const otherSave = vi.fn()

    scheduleEvaluationAnnotationSave(timers, 1, staleSave)
    scheduleEvaluationAnnotationSave(timers, 2, otherSave)
    scheduleEvaluationAnnotationSave(timers, 1, latestSave)
    clearEvaluationAnnotationSaves(timers)
    vi.runAllTimers()

    expect(staleSave).not.toHaveBeenCalled()
    expect(latestSave).not.toHaveBeenCalled()
    expect(otherSave).not.toHaveBeenCalled()
    expect(timers.size).toBe(0)
  })

  it('does not let an out-of-order whole-file response regress another edit', () => {
    const current = {
      evaluation_file: 'eval-fast-2026-08-08.json',
      timestamp: '2026-08-08T10:08:00.000Z',
      annotations: [
        {
          question_id: 1,
          updated_at: '2026-08-08T10:07:00.000Z',
          comment: 'Saved first',
        },
        {
          question_id: 2,
          updated_at: '2026-08-08T10:08:00.000Z',
          comment: 'Saved second',
        },
        {
          question_id: 3,
          updated_at: '2026-08-08T10:00:00.000Z',
          comment: 'Optimistic pending edit',
        },
      ],
    }
    const lateStaleResponse = {
      ...current,
      timestamp: '2026-08-08T10:07:00.000Z',
      annotations: [
        current.annotations[0],
        {
          question_id: 2,
          updated_at: '2026-08-08T10:01:00.000Z',
          comment: 'Stale second',
        },
        {
          question_id: 3,
          updated_at: '2026-08-08T10:00:00.000Z',
          comment: 'Old third',
        },
      ],
    }

    const merged = mergeEvaluationAnnotationFiles(
      current,
      lateStaleResponse,
      new Set([3]),
    )

    expect(merged.annotations).toEqual(current.annotations)
  })

  it('protects an optimistic row while its per-question debounce is pending', () => {
    vi.useFakeTimers()
    const timers = new Map<number, AnnotationSaveTimer>()
    scheduleEvaluationAnnotationSave(timers, 2, vi.fn())
    const current = {
      evaluation_file: 'eval-fast-2026-08-08.json',
      timestamp: '2026-08-08T10:00:00.000Z',
      annotations: [
        {
          question_id: 2,
          updated_at: '2026-08-08T10:00:00.000Z',
          comment: 'Optimistic q2 text',
        },
      ],
    }
    const staleResponse = {
      ...current,
      annotations: [
        {
          ...current.annotations[0],
          comment: 'Old q2 text',
        },
      ],
    }

    expect(
      mergeEvaluationAnnotationFiles(
        current,
        staleResponse,
        new Set(timers.keys()),
      ).annotations[0].comment,
    ).toBe('Optimistic q2 text')
  })
})
