export type FlowEventStatus = 'pending' | 'active' | 'success' | 'warning' | 'error'
export type FlowEventGroup = 'planning' | 'data' | 'answering'

export type FlowInspectorRefType = 'query_log' | 'prompt' | 'validation_log' | 'custom'

export interface FlowInspectorRef {
  type: FlowInspectorRefType
  id: string
}

export interface FlowEvent {
  id: string
  step: string
  group: FlowEventGroup
  sequence: number
  parentId?: string
  status: FlowEventStatus
  startedAt: string
  durationMs?: number
  why?: string
  summary?: string
  details?: Record<string, unknown>
  costUsd?: number
  inspectorRef?: FlowInspectorRef
}

export type FlowEventSender = (event: FlowEvent) => void

type StartOptions = {
  step: string
  group: FlowEventGroup
  summary?: string
  why?: string
  details?: Record<string, unknown>
  parentId?: string
  inspectorRef?: FlowInspectorRef
}

type CompleteOptions = {
  step: string
  group?: FlowEventGroup
  status?: Extract<FlowEventStatus, 'success' | 'warning' | 'error'>
  summary?: string
  why?: string
  details?: Record<string, unknown>
  costUsd?: number
  inspectorRef?: FlowInspectorRef
}

interface ActiveStep {
  id: string
  group: FlowEventGroup
  sequence: number
  startedAt: string
  summary?: string
  why?: string
  details?: Record<string, unknown>
  parentId?: string
  inspectorRef?: FlowInspectorRef
}

export interface FlowEmitter {
  startStep(options: StartOptions): string
  completeStep(options: CompleteOptions): void
  failStep(step: string, details?: Partial<CompleteOptions>): void
  warnStep(step: string, details?: Partial<CompleteOptions>): void
  emit(event: FlowEvent): void
}

export function createFlowEmitter(send: FlowEventSender): FlowEmitter {
  let sequence = 0
  const activeSteps = new Map<string, ActiveStep>()

  const createId = (step: string) => {
    let uuid: string
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      uuid = globalThis.crypto.randomUUID()
    } else {
      uuid = Math.random().toString(36).slice(2, 10)
    }
    return `${step}:${uuid.replace(/-/g, '').slice(0, 12)}`
  }

  const emit = (event: FlowEvent) => {
    send(event)
  }

  const startStep = ({
    step,
    group,
    summary,
    why,
    details,
    parentId,
    inspectorRef,
  }: StartOptions): string => {
    const id = createId(step)
    const startedAt = new Date().toISOString()
    sequence += 1

    activeSteps.set(step, {
      id,
      group,
      sequence,
      startedAt,
      summary,
      why,
      details,
      parentId,
      inspectorRef,
    })

    emit({
      id,
      step,
      group,
      sequence,
      parentId,
      status: 'active',
      startedAt,
      summary,
      why,
      details,
      inspectorRef,
    })

    return id
  }

  const completeWithStatus = (
    step: string,
    status: FlowEventStatus,
    overrides?: Partial<CompleteOptions>
  ) => {
    const active = activeSteps.get(step)
    if (!active) {
      // If we never started the step, emit a standalone event
      sequence += 1
      const startedAt = new Date().toISOString()
      emit({
        id: createId(step),
        step,
        group: overrides?.group ?? 'planning',
        sequence,
        status,
        startedAt,
        durationMs: 0,
        summary: overrides?.summary,
        why: overrides?.why,
        details: overrides?.details,
        costUsd: overrides?.costUsd,
        inspectorRef: overrides?.inspectorRef,
      })
      return
    }

    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - new Date(active.startedAt).getTime()

    emit({
      id: active.id,
      step,
      group: active.group,
      sequence: active.sequence,
      parentId: active.parentId,
      status,
      startedAt: active.startedAt,
      durationMs,
      summary: overrides?.summary ?? active.summary,
      why: overrides?.why ?? active.why,
      details: overrides?.details ?? active.details,
      costUsd: overrides?.costUsd,
      inspectorRef: overrides?.inspectorRef ?? active.inspectorRef,
    })

    activeSteps.delete(step)
  }

  const completeStep = (options: CompleteOptions) => {
    completeWithStatus(options.step, options.status ?? 'success', options)
  }

  const failStep = (step: string, details?: Partial<CompleteOptions>) => {
    completeWithStatus(step, 'error', {
      step,
      ...details,
    })
  }

  const warnStep = (step: string, details?: Partial<CompleteOptions>) => {
    completeWithStatus(step, 'warning', {
      step,
      ...details,
    })
  }

  return {
    startStep,
    completeStep,
    failStep,
    warnStep,
    emit,
  }
}
