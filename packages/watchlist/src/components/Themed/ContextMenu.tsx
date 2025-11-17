'use client'

import { ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ContextMenuProps {
  isOpen: boolean
  x: number
  y: number
  onClose: () => void
  children: ReactNode
}

export default function ContextMenu({ isOpen, x, y, onClose, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          onClose()
        }
      }

      // Small delay to prevent immediate close from the click that opened it
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
      }, 0)

      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div
      ref={menuRef}
      className="
        fixed z-[10000]
        bg-watchlist-surface rounded-md shadow-xl
        border border-watchlist-border
        min-w-[140px] py-1
      "
      style={{ top: y, left: x }}
      role="menu"
    >
      {children}
    </div>,
    document.body
  )
}

interface ContextMenuItemProps {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}

export function ContextMenuItem({ onClick, disabled, danger, children }: ContextMenuItemProps) {
  return (
    <button
      className={`
        w-full px-3 py-2 text-left text-sm
        transition-colors duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${danger
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-watchlist-text-primary hover:bg-watchlist-surface-elevated'
        }
      `}
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
    >
      {children}
    </button>
  )
}
