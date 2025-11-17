'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'

interface StatusMessage {
  message: string
  isError: boolean
  id: string
}

interface StatusContextType {
  showStatus: (message: string, isError?: boolean) => void
  clearStatus: () => void
}

const StatusContext = createContext<StatusContextType | null>(null)

export function useStatus() {
  const context = useContext(StatusContext)
  if (!context) {
    throw new Error('useStatus must be used within a StatusProvider')
  }
  return context
}

function StatusMessagePortal({ status, onClose }: { 
  status: StatusMessage | null
  onClose: () => void 
}) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (status) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        onClose()
      }, 3000)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [status, onClose])

  if (!status) return null

  const statusElement = (
    <div 
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '10px 15px',
        borderRadius: '4px',
        background: status.isError ? '#ffebee' : '#e8f5e9',
        color: status.isError ? '#ff1744' : '#00c853',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        fontSize: '17px',
        zIndex: 1000,
        display: 'block',
        maxWidth: '300px',
        wordWrap: 'break-word'
      }}
    >
      {status.message}
    </div>
  )

  // Only render portal if we're in the browser
  if (typeof document !== 'undefined') {
    return createPortal(statusElement, document.body)
  }

  return null
}

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusMessage | null>(null)

  const showStatus = useCallback((message: string, isError: boolean = false) => {
    // Use requestAnimationFrame to batch the status update and prevent flicker
    requestAnimationFrame(() => {
      setStatus({
        message,
        isError,
        id: Date.now().toString()
      })
    })
  }, [])

  const clearStatus = useCallback(() => {
    setStatus(null)
  }, [])

  return (
    <StatusContext.Provider value={{ showStatus, clearStatus }}>
      {children}
      <StatusMessagePortal status={status} onClose={clearStatus} />
    </StatusContext.Provider>
  )
}