'use client'

interface FollowUpQuestionsProps {
  questions: string[]
  onQuestionClick: (question: string) => void
}

export default function FollowUpQuestions({ questions, onQuestionClick }: FollowUpQuestionsProps) {
  if (!questions || questions.length === 0) {
    return null
  }

  return (
    <div className="mt-6 space-y-2">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
        Suggested follow-up questions:
      </p>
      <div className="flex flex-wrap gap-2">
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick(question)}
            className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors duration-200 border border-blue-200 dark:border-blue-800"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  )
}
