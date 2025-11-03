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
      <p className="text-sm font-medium text-gray-700">
        Suggested follow-up questions:
      </p>
      <div className="flex flex-wrap gap-2">
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick(question)}
            className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-200 shadow-sm hover:shadow-md"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  )
}
