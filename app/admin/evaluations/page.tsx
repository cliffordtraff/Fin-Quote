'use client'

import { useState, useEffect, useRef, forwardRef, useMemo } from 'react'

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

type EvaluationResult = {
  question_id: number
  question: string
  expected_tool: string
  expected_args: Record<string, any>
  actual_tool: string | null
  actual_args: Record<string, any> | null
  tool_match: boolean
  args_match: boolean
  args_match_semantic?: boolean
  overall_correct: boolean
  overall_correct_semantic?: boolean
  routing_latency_ms: number
  error?: string
}

type EvaluationData = {
  mode: 'fast' | 'full'
  timestamp: string
  total_questions: number
  correct_tool: number
  correct_args: number
  correct_args_semantic?: number
  fully_correct: number
  fully_correct_semantic?: number
  accuracy: {
    tool_selection: number
    args_selection: number
    args_selection_semantic?: number
    overall: number
    overall_semantic?: number
  }
  results: EvaluationResult[]
}

export default function EvaluationsPage() {
  const [evaluationData, setEvaluationData] = useState<EvaluationData | null>(null)
  const [annotationsData, setAnnotationsData] = useState<AnnotationsFile | null>(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [evaluationFile, setEvaluationFile] = useState('')
  const [saving, setSaving] = useState(false)
  const [claudeAnalyses, setClaudeAnalyses] = useState<Record<number, string>>({})
  const [loadingAnalyses, setLoadingAnalyses] = useState(false)

  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Memoize results before any conditional returns (hooks must be called unconditionally)
  const results: EvaluationResult[] = useMemo(() => {
    const maybe = (evaluationData as EvaluationData | null)?.results
    return Array.isArray(maybe) ? maybe : []
  }, [evaluationData])

  const failedQuestions = useMemo(() => results.filter((r) => !r.overall_correct_semantic), [results])
  const minorVariations = useMemo(() => results.filter((r) => r.overall_correct_semantic && !r.overall_correct), [results])

  // Load latest evaluation on mount
  useEffect(() => {
    loadLatestEvaluation()
  }, [])

  // Load annotations when evaluation data changes
  useEffect(() => {
    if (evaluationData && evaluationFile) {
      loadAnnotations()
    }
  }, [evaluationFile])

  // Auto-fetch Claude analyses when failed questions are loaded
  useEffect(() => {
    if (failedQuestions.length > 0 && Object.keys(claudeAnalyses).length === 0) {
      fetchAllClaudeAnalyses()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failedQuestions.length])

  async function loadLatestEvaluation() {
    try {
      setLoading(true)
      const response = await fetch('/api/evaluations/latest')
      if (!response.ok) {
        // Gracefully handle 404 (no results yet) vs other errors
        if (response.status === 404) {
          setEvaluationData(null)
          setEvaluationFile('')
          return
        }
        throw new Error('Failed to load evaluation')
      }
      const data = await response.json()
      setEvaluationData(data.evaluation)
      setEvaluationFile(data.filename)
    } catch (error) {
      console.error('Error loading evaluation:', error)
      alert('Failed to load evaluation. Make sure you have run the evaluation script.')
    } finally {
      setLoading(false)
    }
  }

  async function loadAnnotations() {
    if (!evaluationFile) return
    try {
      const response = await fetch(`/api/annotations?file=${evaluationFile}`)
      if (!response.ok) throw new Error('Failed to load annotations')
      const data: AnnotationsFile = await response.json()
      setAnnotationsData(data)
    } catch (error) {
      console.error('Error loading annotations:', error)
    }
  }

  async function fetchAllClaudeAnalyses() {
    if (!failedQuestions.length) return

    setLoadingAnalyses(true)
    try {
      const questionsToAnalyze = failedQuestions.map((q) => ({
        question: q.question,
        question_id: q.question_id,
        expected_tool: q.expected_tool,
        expected_args: q.expected_args,
        actual_tool: q.actual_tool,
        actual_args: q.actual_args,
        tool_match: q.tool_match,
      }))

      const response = await fetch('/api/evaluations/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: questionsToAnalyze }),
      })

      if (!response.ok) throw new Error('Failed to fetch analyses')

      const data = await response.json()

      // Convert array of analyses to a map keyed by question_id
      const analysesMap: Record<number, string> = {}
      data.analyses.forEach((item: { question_id: number; analysis: string }) => {
        analysesMap[item.question_id] = item.analysis
      })

      setClaudeAnalyses(analysesMap)
    } catch (error) {
      console.error('Error fetching Claude analyses:', error)
      alert('Failed to fetch Claude analyses. Please try again.')
    } finally {
      setLoadingAnalyses(false)
    }
  }

  async function saveAnnotations(newAnnotations: AnnotationsFile) {
    try {
      setSaving(true)
      const response = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAnnotations),
      })
      if (!response.ok) throw new Error('Failed to save annotations')
      const data: AnnotationsFile = await response.json()
      // Persist the full annotations file shape to state
      setAnnotationsData(data)
    } catch (error) {
      console.error('Error saving annotations:', error)
      alert('Failed to save annotations')
    } finally {
      setSaving(false)
    }
  }

  function updateAnnotation(questionId: number, action: string, comment: string) {
    if (!annotationsData) return

    const updatedAnnotations = [...annotationsData.annotations]
    const existingIndex = updatedAnnotations.findIndex((a) => a.question_id === questionId)

    const newAnnotation: Annotation = {
      question_id: questionId,
      action: action as any,
      comment,
      updated_at: new Date().toISOString(),
    }

    if (existingIndex >= 0) {
      updatedAnnotations[existingIndex] = newAnnotation
    } else {
      updatedAnnotations.push(newAnnotation)
    }

    const updatedData: AnnotationsFile = {
      ...annotationsData,
      annotations: updatedAnnotations,
    }

    // Update state immediately (no flicker)
    setAnnotationsData(updatedData)

    // Debounce the save to server (wait 500ms after last change)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveAnnotations(updatedData)
    }, 500)
  }

  function handleDone(questionId: number) {
    const failedQuestions =
      evaluationData?.results.filter((r) => !r.overall_correct_semantic) || []
    const currentIndex = failedQuestions.findIndex((q) => q.question_id === questionId)

    if (currentIndex < failedQuestions.length - 1) {
      const nextQuestion = failedQuestions[currentIndex + 1]
      setCurrentQuestionIndex(currentIndex + 1)

      const nextElement = questionRefs.current[nextQuestion.question_id]
      if (nextElement) {
        nextElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    } else {
      alert("You've reviewed all failed questions!")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading evaluation...</p>
        </div>
      </div>
    )
  }

  if (!evaluationData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">No Evaluation Loaded</h1>
          <p className="text-gray-600 mb-4">
            Run the evaluation script to generate test results:
          </p>
          <code className="bg-gray-100 px-4 py-2 rounded block text-sm">
            npx tsx scripts/evaluate.ts --mode fast
          </code>
          <button
            onClick={loadLatestEvaluation}
            className="mt-6 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
          >
            Retry Loading
          </button>
        </div>
      </div>
    )
  }

  // TypeScript assertion: evaluationData is guaranteed to be non-null here
  const data = evaluationData!

  // Defensive check: ensure accuracy object exists
  if (!data.accuracy) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Invalid Evaluation Data</h1>
          <p className="text-gray-600 mb-4">
            The evaluation file is missing required accuracy metrics. This might be an old format.
          </p>
          <p className="text-gray-600 mb-4">
            Try running a new evaluation:
          </p>
          <code className="bg-gray-100 px-4 py-2 rounded block text-sm">
            npx tsx scripts/evaluate.ts --mode fast
          </code>
          <button
            onClick={loadLatestEvaluation}
            className="mt-6 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
          >
            Retry Loading
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-8">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-3xl font-bold">Evaluation Results</h1>
          <p className="text-indigo-100 mt-2">
            {evaluationFile} • {new Date(data.timestamp).toLocaleString()}
          </p>
          {saving && (
            <p className="text-indigo-200 text-sm mt-2">💾 Saving annotations...</p>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard
            label="Tool Accuracy"
            value={`${data.accuracy.tool_selection}%`}
            detail={`${data.correct_tool}/${data.total_questions}`}
          />
          <MetricCard
            label="Semantic Match"
            value={`${data.accuracy.overall_semantic || data.accuracy.overall}%`}
            detail={`${data.fully_correct_semantic || data.fully_correct}/${data.total_questions}`}
            highlight
          />
          <MetricCard
            label="Exact Match"
            value={`${data.accuracy.overall}%`}
            detail={`${data.fully_correct}/${data.total_questions}`}
          />
          <MetricCard
            label="Failed Questions"
            value={failedQuestions.length.toString()}
            detail="Need attention"
            alert
          />
        </div>

        {/* Failed Questions */}
        {failedQuestions.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">
                ⚠️ Questions Needing Attention ({failedQuestions.length})
              </h2>
              {!loadingAnalyses && Object.keys(claudeAnalyses).length === 0 && (
                <button
                  onClick={fetchAllClaudeAnalyses}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium flex items-center gap-2 shadow-lg"
                >
                  <span>🤖</span>
                  <span>Analyze All {failedQuestions.length} Questions</span>
                </button>
              )}
              {loadingAnalyses && (
                <div className="flex items-center gap-3 text-purple-700">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-700"></div>
                  <span className="font-medium">Claude is analyzing {failedQuestions.length} questions...</span>
                </div>
              )}
              {Object.keys(claudeAnalyses).length > 0 && (
                <div className="flex items-center gap-2 text-green-700 font-medium">
                  <span>✅</span>
                  <span>Analyzed {Object.keys(claudeAnalyses).length} questions</span>
                </div>
              )}
            </div>
            <div className="space-y-4">
              {failedQuestions.map((question, index) => (
                <QuestionCard
                  key={question.question_id}
                  question={question}
                  annotation={annotationsData?.annotations.find(
                    (a) => a.question_id === question.question_id
                  )}
                  claudeAnalysis={claudeAnalyses[question.question_id]}
                  onUpdate={updateAnnotation}
                  onDone={handleDone}
                  ref={(el) => (questionRefs.current[question.question_id] = el)}
                  isFirst={index === 0}
                />
              ))}
            </div>
          </div>
        )}

        {/* Minor Variations */}
        {minorVariations.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              ✨ Minor Variations ({minorVariations.length})
            </h2>
            <div className="space-y-4">
              {minorVariations.map((question) => (
                <QuestionCard
                  key={question.question_id}
                  question={question}
                  annotation={annotationsData?.annotations.find(
                    (a) => a.question_id === question.question_id
                  )}
                  onUpdate={updateAnnotation}
                  onDone={handleDone}
                  isMinorVariation
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

type QuestionCardProps = {
  question: EvaluationResult
  annotation?: Annotation
  claudeAnalysis?: string
  onUpdate: (questionId: number, action: string, comment: string) => void
  onDone: (questionId: number) => void
  isMinorVariation?: boolean
  isFirst?: boolean
}

const QuestionCard = forwardRef<HTMLDivElement, QuestionCardProps>(
  ({ question, annotation, claudeAnalysis: preloadedAnalysis, onUpdate, onDone, isMinorVariation, isFirst }, ref) => {
    const [action, setAction] = useState(annotation?.action || '')
    const [comment, setComment] = useState(annotation?.comment || '')
    const [claudeAnalysis, setClaudeAnalysis] = useState<string | null>(preloadedAnalysis || null)
    const [loadingAnalysis, setLoadingAnalysis] = useState(false)
    const [showDisagreement, setShowDisagreement] = useState(false)
    const [disagreementText, setDisagreementText] = useState('')

    // Only sync from prop on initial mount or when question changes
    // This prevents flickering when parent state updates
    useEffect(() => {
      setAction(annotation?.action || '')
      setComment(annotation?.comment || '')
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [question.question_id])

    // Update analysis when preloaded analysis becomes available
    useEffect(() => {
      if (preloadedAnalysis) {
        setClaudeAnalysis(preloadedAnalysis)
      }
    }, [preloadedAnalysis])

    function handleActionChange(newAction: string) {
      setAction(newAction)
      onUpdate(question.question_id, newAction, comment)
    }

    function handleCommentChange(newComment: string) {
      setComment(newComment)
      onUpdate(question.question_id, action, newComment)
    }

    function handleDoneClick() {
      onDone(question.question_id)
    }

    async function fetchClaudeAnalysis() {
      setLoadingAnalysis(true)
      try {
        const response = await fetch('/api/evaluations/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: question.question,
            question_id: question.question_id,
            expected_tool: question.expected_tool,
            expected_args: question.expected_args,
            actual_tool: question.actual_tool,
            actual_args: question.actual_args,
            tool_match: question.tool_match,
          }),
        })
        const data = await response.json()
        setClaudeAnalysis(data.analysis)
      } catch (error) {
        console.error('Failed to fetch analysis:', error)
        setClaudeAnalysis('Failed to load analysis. Please try again.')
      } finally {
        setLoadingAnalysis(false)
      }
    }

    function handleAgree() {
      // User agrees with Claude's recommendation
      setShowDisagreement(false)
      setAction('update_prompt')
      setComment(`Agreed with Claude: ${claudeAnalysis?.substring(0, 200)}...`)
      onUpdate(question.question_id, 'update_prompt', `Agreed with Claude: ${claudeAnalysis}`)

      // Visual feedback
      const button = document.activeElement as HTMLElement
      if (button) {
        button.textContent = '✓ Saved!'
      }

      // Auto-move to next question after short delay
      setTimeout(() => {
        onDone(question.question_id)
      }, 800)
    }

    function handleDisagree() {
      setShowDisagreement(true)
    }

    function handleSubmitDisagreement() {
      // User provided their own opinion
      setAction('skip')
      setComment(disagreementText)
      onUpdate(question.question_id, 'skip', disagreementText)
      setShowDisagreement(false)
      alert('Your feedback has been saved!')
    }

    const issueType = !question.tool_match
      ? 'WRONG TOOL'
      : question.overall_correct_semantic
      ? 'SEMANTIC MATCH'
      : 'WRONG ARGS'

    return (
      <div
        ref={ref}
        className={`bg-white rounded-lg shadow p-6 ${isFirst ? 'ring-2 ring-indigo-500' : ''}`}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-indigo-600 font-bold">Q{question.question_id}</span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  issueType === 'WRONG TOOL'
                    ? 'bg-red-100 text-red-800'
                    : issueType === 'SEMANTIC MATCH'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-orange-100 text-orange-800'
                }`}
              >
                {issueType}
              </span>
            </div>
            <p className="text-gray-900 text-lg">"{question.question}"</p>
          </div>
        </div>

        {/* Error Display */}
        {question.error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
            <p className="text-red-800 font-semibold">Error: {question.error}</p>
          </div>
        )}

        {/* Tool & Args Comparison */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm font-semibold text-gray-600 mb-2">📋 Test Expects</p>
            <p className="text-sm mb-2">
              <span className="font-medium">Tool:</span>{' '}
              <code className="bg-gray-200 px-2 py-1 rounded text-xs">
                {question.expected_tool}
              </code>
            </p>
            <p className="text-sm">
              <span className="font-medium">Args:</span>
            </p>
            <pre className="bg-gray-200 p-2 rounded text-xs mt-1 overflow-x-auto">
              {JSON.stringify(question.expected_args, null, 2)}
            </pre>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm font-semibold text-gray-600 mb-2">🤖 AI Chose</p>
            <p className="text-sm mb-2">
              <span className="font-medium">Tool:</span>{' '}
              <code className="bg-gray-200 px-2 py-1 rounded text-xs">
                {question.actual_tool || 'null'}
              </code>
            </p>
            <p className="text-sm">
              <span className="font-medium">Args:</span>
            </p>
            <pre className="bg-gray-200 p-2 rounded text-xs mt-1 overflow-x-auto">
              {JSON.stringify(question.actual_args, null, 2)}
            </pre>
          </div>
        </div>

        {/* Claude's Opinion Section */}
        <div className="border-t border-b py-4 my-4">
          {claudeAnalysis && !showDisagreement && (
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
                <span>🤖</span>
                <span>Claude's Analysis</span>
              </h3>
              <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap mb-4">
                {claudeAnalysis}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAgree}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <span>✅</span>
                  <span>Yes, Claude is right</span>
                </button>
                <button
                  onClick={handleDisagree}
                  className="flex-1 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <span>❌</span>
                  <span>No, let me explain</span>
                </button>
              </div>
            </div>
          )}

          {showDisagreement && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-orange-900 mb-3">
                📝 Share your perspective
              </h3>
              <p className="text-sm text-gray-700 mb-3">
                Help Claude learn! Explain why you disagree:
              </p>
              <textarea
                value={disagreementText}
                onChange={(e) => setDisagreementText(e.target.value)}
                placeholder="For example: 'Actually, 90d is acceptable because most users think YTD means recent performance...'"
                className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none mb-3"
                rows={4}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSubmitDisagreement}
                  disabled={!disagreementText.trim()}
                  className="flex-1 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Feedback
                </button>
                <button
                  onClick={() => setShowDisagreement(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Annotation Section */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-indigo-600 mb-3">📝 Your Feedback</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select
              value={action}
              onChange={(e) => handleActionChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select action...</option>
              <option value="fix_bug">🐛 Fix Bug</option>
              <option value="update_golden_test">📋 Update Golden Test</option>
              <option value="add_alias">🔗 Add Alias</option>
              <option value="update_prompt">✏️ Update Prompt</option>
              <option value="skip">⏭️ Skip (acceptable)</option>
            </select>

            <textarea
              value={comment}
              onChange={(e) => handleCommentChange(e.target.value)}
              placeholder="Add your notes..."
              className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={handleDoneClick}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              Done → Next
            </button>
          </div>
        </div>
      </div>
    )
  }
)
QuestionCard.displayName = 'QuestionCard'

function MetricCard({
  label,
  value,
  detail,
  highlight,
  alert,
}: {
  label: string
  value: string
  detail: string
  highlight?: boolean
  alert?: boolean
}) {
  return (
    <div
      className={`p-6 rounded-lg shadow ${
        highlight
          ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white'
          : alert
          ? 'bg-red-50 border border-red-200'
          : 'bg-white'
      }`}
    >
      <p
        className={`text-sm font-medium ${
          highlight ? 'text-indigo-100' : alert ? 'text-red-600' : 'text-gray-600'
        }`}
      >
        {label}
      </p>
      <p className={`text-3xl font-bold mt-2 ${alert && !highlight ? 'text-red-900' : ''}`}>
        {value}
      </p>
      <p
        className={`text-sm mt-1 ${
          highlight ? 'text-indigo-100' : alert ? 'text-red-600' : 'text-gray-500'
        }`}
      >
        {detail}
      </p>
    </div>
  )
}
