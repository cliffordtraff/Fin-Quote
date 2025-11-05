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
    <div className="mt-6 space-y-4">
      <p className="text-xl font-medium text-gray-700 dark:text-gray-300">
        Suggested follow-up questions:
      </p>
      <div className="flex flex-col gap-2">
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick(question)}
            className="text-left px-0 py-2 text-lg text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline transition-colors duration-200"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  )
}
