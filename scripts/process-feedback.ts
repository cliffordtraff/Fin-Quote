/**
 * Process Feedback from Annotations File
 *
 * Usage:
 *   npx tsx scripts/process-feedback.ts test-data/test-results/eval-fast-2025-11-07-annotations.json
 *
 * This script:
 * 1. Reads the annotations file
 * 2. Groups annotations by action type
 * 3. Reports what needs to be done
 */

import fs from 'fs'
import path from 'path'

type Annotation = {
  question_id: number
  action: 'fix_bug' | 'update_golden_test' | 'add_alias' | 'update_prompt' | 'skip' | ''
  comment: string
  updated_at: string
}

type AnnotationsFile = {
  evaluation_file: string
  timestamp: string
  annotations: Annotation[]
}

function groupByAction(annotations: Annotation[]): Record<string, Annotation[]> {
  const groups: Record<string, Annotation[]> = {
    fix_bug: [],
    update_golden_test: [],
    add_alias: [],
    update_prompt: [],
    skip: [],
  }

  annotations.forEach((annotation) => {
    if (annotation.action && groups[annotation.action]) {
      groups[annotation.action].push(annotation)
    }
  })

  return groups
}

function generateReport(annotationsData: AnnotationsFile, evaluationResults: any) {
  console.log('\n📋 Feedback Processing Report')
  console.log('═'.repeat(80))
  console.log(`Evaluation File: ${annotationsData.evaluation_file}`)
  console.log(`Feedback Timestamp: ${new Date(annotationsData.timestamp).toLocaleString()}`)
  console.log(`Total Annotations: ${annotationsData.annotations.length}`)
  console.log('═'.repeat(80))

  if (annotationsData.annotations.length === 0) {
    console.log('\n⚠️  No annotations found. Add feedback in /admin/evaluations first.')
    return
  }

  const grouped = groupByAction(annotationsData.annotations)

  // Report by action type
  Object.entries(grouped).forEach(([action, annotations]) => {
    if (annotations.length === 0) return

    console.log(
      `\n${
        {
          fix_bug: '🐛 Fix Bug',
          update_golden_test: '📋 Update Golden Test',
          add_alias: '🔗 Add Alias',
          update_prompt: '✏️  Update Prompt',
          skip: '⏭️  Skip (acceptable)',
        }[action]
      } (${annotations.length} items)`
    )
    console.log('-'.repeat(80))

    annotations.forEach((annotation) => {
      const question = evaluationResults.results.find(
        (r: any) => r.question_id === annotation.question_id
      )
      if (!question) return

      console.log(`\nQ${annotation.question_id}: "${question.question}"`)
      console.log(
        `Expected: ${question.expected_tool} → ${JSON.stringify(question.expected_args)}`
      )
      console.log(
        `Actual:   ${question.actual_tool || 'null'} → ${JSON.stringify(question.actual_args)}`
      )
      if (annotation.comment) {
        console.log(`Comment:  ${annotation.comment}`)
      }
    })
  })

  // Summary of recommended actions
  console.log('\n\n📊 Summary of Actions')
  console.log('═'.repeat(80))

  if (grouped.fix_bug.length > 0) {
    console.log(`\n🐛 ${grouped.fix_bug.length} bugs to fix:`)
    grouped.fix_bug.forEach((a) => {
      const q = evaluationResults.results.find((r: any) => r.question_id === a.question_id)
      console.log(`   - Q${a.question_id}: ${a.comment || q?.error || 'System crash or error'}`)
    })
  }

  if (grouped.update_golden_test.length > 0) {
    console.log(`\n📋 ${grouped.update_golden_test.length} golden test updates needed:`)
    grouped.update_golden_test.forEach((a) => {
      console.log(`   - Q${a.question_id}: ${a.comment || 'Update expected output'}`)
    })
  }

  if (grouped.add_alias.length > 0) {
    console.log(`\n🔗 ${grouped.add_alias.length} metric aliases to add:`)
    grouped.add_alias.forEach((a) => {
      const q = evaluationResults.results.find((r: any) => r.question_id === a.question_id)
      console.log(
        `   - Q${a.question_id}: Add equivalence for "${q?.expected_args?.metric || q?.expected_args?.metricNames?.[0]}" ↔ "${q?.actual_args?.metric || q?.actual_args?.metricNames?.[0]}"`
      )
    })
  }

  if (grouped.update_prompt.length > 0) {
    console.log(`\n✏️  ${grouped.update_prompt.length} prompt updates needed:`)
    grouped.update_prompt.forEach((a) => {
      console.log(`   - Q${a.question_id}: ${a.comment || 'Improve prompt'}`)
    })
  }

  if (grouped.skip.length > 0) {
    console.log(`\n⏭️  ${grouped.skip.length} items marked as acceptable (skip):`)
    grouped.skip.forEach((a) => {
      console.log(`   - Q${a.question_id}: ${a.comment || 'Acceptable variation'}`)
    })
  }

  console.log('\n')
}

// Main execution
const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('❌ Usage: npx tsx scripts/process-feedback.ts <path-to-annotations.json>')
  console.error(
    '   Example: npx tsx scripts/process-feedback.ts test-data/test-results/eval-fast-2025-11-07-annotations.json'
  )
  process.exit(1)
}

const annotationsPath = args[0]

if (!fs.existsSync(annotationsPath)) {
  console.error(`❌ File not found: ${annotationsPath}`)
  process.exit(1)
}

try {
  console.log(`📖 Reading feedback from: ${annotationsPath}`)
  const annotationsData: AnnotationsFile = JSON.parse(fs.readFileSync(annotationsPath, 'utf-8'))

  // Load corresponding evaluation results
  const evalPath = annotationsPath.replace('-annotations.json', '.json')
  if (!fs.existsSync(evalPath)) {
    console.error(`❌ Evaluation results not found: ${evalPath}`)
    process.exit(1)
  }

  const evaluationResults = JSON.parse(fs.readFileSync(evalPath, 'utf-8'))

  generateReport(annotationsData, evaluationResults)

  console.log('✅ Feedback processing complete!')
  console.log('\n💡 Next steps:')
  console.log('   1. Review the summary above')
  console.log('   2. Use this information to fix bugs, update tests, or add aliases')
  console.log('   3. Re-run evaluation to verify fixes')
} catch (error) {
  console.error('❌ Error processing feedback:', error)
  process.exit(1)
}
