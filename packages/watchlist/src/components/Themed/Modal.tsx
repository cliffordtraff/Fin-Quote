'use client'

import { ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ThemedModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function ThemedModal({ isOpen, onClose, title, children }: ThemedModalProps) {
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 z-[9999] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div
          className="
            bg-watchlist-surface rounded-lg shadow-xl
            border border-watchlist-border
            min-w-[350px] max-w-lg w-full
            p-6
          "
          onClick={(e) => e.stopPropagation()}
        >
          <h3
            id="modal-title"
            className="text-lg font-semibold text-watchlist-text-primary mb-4"
          >
            {title}
          </h3>

          {children}
        </div>
      </div>
    </>,
    document.body
  )
}
