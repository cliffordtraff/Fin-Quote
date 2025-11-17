import React from 'react'
import { cn } from '@watchlist/lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export default function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[1999] flex items-center justify-center"
        onClick={onClose}
      >
        {/* Modal */}
        <div
          className={cn(
            'bg-watchlist-surface rounded-lg p-6 min-w-[300px] shadow-xl',
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <h3 className="text-lg font-semibold text-watchlist-text-primary mb-4">
              {title}
            </h3>
          )}
          {children}
        </div>
      </div>
    </>
  )
}
