'use client'

import { useState } from 'react'

const faqs = [
  {
    question: 'What is The Intraday?',
    answer: 'The Intraday is a comprehensive market intelligence platform that provides real-time market data, AI-powered insights, and advanced charting tools to help traders and investors make informed decisions.',
  },
  {
    question: 'How does The Intraday work?',
    answer: 'Our platform aggregates real-time data from major market sources and uses AI to analyze trends, surface significant movements, and provide actionable insights. Simply sign up, and you\'ll have access to live market data, customizable dashboards, and intelligent analysis tools.',
  },
  {
    question: 'Is The Intraday secure?',
    answer: 'Yes, security is our top priority. We use bank-level encryption to protect your data, offer two-factor authentication, and never store sensitive financial credentials. Your information is always protected with industry-standard security measures.',
  },
  {
    question: 'What data sources does The Intraday support?',
    answer: 'We support major market indices (S&P 500, NASDAQ, DOW, Russell 2000), individual stocks, futures, forex, and economic calendars. Our data is sourced from reliable financial data providers to ensure accuracy and timeliness.',
  },
  {
    question: 'Can I access The Intraday on my mobile device?',
    answer: 'Yes! The Intraday is fully responsive and works seamlessly on desktop, tablet, and mobile devices. You can monitor markets and access your dashboard from anywhere.',
  },
  {
    question: 'How does The Intraday help with market analysis?',
    answer: 'Our platform provides AI-generated market summaries, sector heatmaps, gainers/losers tracking, and trend analysis. These tools help you quickly understand market conditions and identify opportunities without spending hours on research.',
  },
]

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section id="faq" className="bg-white py-16 md:py-24 border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-12">
          {/* Header */}
          <div>
            <h2 className="font-serif text-2xl md:text-3xl text-gray-900 mb-4">
              Questions & Answers
            </h2>
            <p className="text-gray-600">
              Learn more about what The Intraday has to offer or
              feel free to contact us at{' '}
              <a href="mailto:support@theintraday.com" className="text-sage-600 hover:underline">
                support@theintraday.com
              </a>
            </p>
          </div>

          {/* FAQ List */}
          <div className="md:col-span-2 space-y-0">
            {faqs.map((faq, index) => (
              <div key={index} className="border-b border-gray-100">
                <button
                  type="button"
                  className="w-full py-5 flex items-center justify-between text-left"
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                >
                  <span className="text-gray-900 font-medium pr-8">{faq.question}</span>
                  <span className="text-gray-400 text-2xl flex-shrink-0">
                    {openIndex === index ? '−' : '+'}
                  </span>
                </button>
                {openIndex === index && (
                  <div className="pb-5 pr-12">
                    <p className="text-gray-600 text-sm leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
