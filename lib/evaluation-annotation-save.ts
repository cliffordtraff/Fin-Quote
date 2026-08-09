export type AnnotationSaveTimer = ReturnType<typeof setTimeout>

export interface VersionedEvaluationAnnotation {
  question_id: number
  updated_at: string
}

export interface EvaluationAnnotationFileLike<
  TAnnotation extends VersionedEvaluationAnnotation,
> {
  evaluation_file: string
  timestamp: string
  annotations: TAnnotation[]
}

export function scheduleEvaluationAnnotationSave(
  timers: Map<number, AnnotationSaveTimer>,
  questionId: number,
  save: () => void,
  delayMs = 500,
): void {
  const existing = timers.get(questionId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    timers.delete(questionId)
    save()
  }, delayMs)
  timers.set(questionId, timer)
}

export function clearEvaluationAnnotationSaves(
  timers: Map<number, AnnotationSaveTimer>,
): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
}

export function mergeEvaluationAnnotationFiles<
  TAnnotation extends VersionedEvaluationAnnotation,
>(
  current: EvaluationAnnotationFileLike<TAnnotation> | null,
  incoming: EvaluationAnnotationFileLike<TAnnotation>,
  protectedQuestionIds: ReadonlySet<number>,
): EvaluationAnnotationFileLike<TAnnotation> {
  if (!current) return incoming
  if (current.evaluation_file !== incoming.evaluation_file) return current
  const merged = new Map(
    incoming.annotations.map((annotation) => [annotation.question_id, annotation]),
  )
  for (const annotation of current.annotations) {
    const server = merged.get(annotation.question_id)
    if (
      !server ||
      protectedQuestionIds.has(annotation.question_id) ||
      annotation.updated_at > server.updated_at
    ) {
      merged.set(annotation.question_id, annotation)
    }
  }
  return {
    ...incoming,
    annotations: Array.from(merged.values()).sort(
      (left, right) => left.question_id - right.question_id,
    ),
  }
}
