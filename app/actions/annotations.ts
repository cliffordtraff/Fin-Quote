'use server'

import { createClient } from '@/lib/supabase/server'

export type Annotation = {
  id: string
  evaluation_file: string
  question_id: number
  action: 'fix_bug' | 'update_golden_test' | 'add_alias' | 'update_prompt' | 'skip' | null
  comment: string | null
  created_at: string
  updated_at: string
}

export type AnnotationInput = {
  evaluation_file: string
  question_id: number
  action?: 'fix_bug' | 'update_golden_test' | 'add_alias' | 'update_prompt' | 'skip'
  comment?: string
}

/**
 * Get all annotations for a specific evaluation file
 */
export async function getAnnotations(evaluationFile: string): Promise<Annotation[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('evaluation_annotations')
    .select('*')
    .eq('evaluation_file', evaluationFile)
    .order('question_id', { ascending: true })

  if (error) {
    console.error('Error fetching annotations:', error)
    throw error
  }

  return data || []
}

/**
 * Get annotation for a specific question
 */
export async function getAnnotation(
  evaluationFile: string,
  questionId: number
): Promise<Annotation | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('evaluation_annotations')
    .select('*')
    .eq('evaluation_file', evaluationFile)
    .eq('question_id', questionId)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned
    console.error('Error fetching annotation:', error)
    throw error
  }

  return data || null
}

/**
 * Upsert (create or update) an annotation
 */
export async function upsertAnnotation(input: AnnotationInput): Promise<Annotation> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('evaluation_annotations')
    .upsert(
      {
        evaluation_file: input.evaluation_file,
        question_id: input.question_id,
        action: input.action || null,
        comment: input.comment || null,
      },
      {
        onConflict: 'evaluation_file,question_id',
      }
    )
    .select()
    .single()

  if (error) {
    console.error('Error upserting annotation:', error)
    throw error
  }

  return data
}

/**
 * Delete an annotation
 */
export async function deleteAnnotation(
  evaluationFile: string,
  questionId: number
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('evaluation_annotations')
    .delete()
    .eq('evaluation_file', evaluationFile)
    .eq('question_id', questionId)

  if (error) {
    console.error('Error deleting annotation:', error)
    throw error
  }
}

/**
 * Get annotations grouped by action type
 */
export async function getAnnotationsSummary(evaluationFile: string) {
  const annotations = await getAnnotations(evaluationFile)

  const summary = {
    fix_bug: annotations.filter((a) => a.action === 'fix_bug'),
    update_golden_test: annotations.filter((a) => a.action === 'update_golden_test'),
    add_alias: annotations.filter((a) => a.action === 'add_alias'),
    update_prompt: annotations.filter((a) => a.action === 'update_prompt'),
    skip: annotations.filter((a) => a.action === 'skip'),
    total: annotations.length,
  }

  return summary
}
