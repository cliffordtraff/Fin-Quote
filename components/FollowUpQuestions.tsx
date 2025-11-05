'use client'

import { forwardRef } from 'react'

interface FollowUpQuestionsProps {
  questions: string[]
  onQuestionClick: (question: string) => void
}

const FollowUpQuestions = forwardRef<HTMLDivElement, FollowUpQuestionsProps>(
  ({ questions, onQuestionClick }, ref) => {
    if (!questions || questions.length === 0) {
      return null
    }

    return (
      <div ref={ref} className="mt-6 space-y-4" data-follow-up-root>
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
)

FollowUpQuestions.displayName = 'FollowUpQuestions'

export default FollowUpQuestions
