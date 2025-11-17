'use client'

import { useEffect } from 'react'

interface StatusMessageProps {
  message: string | null
  isError?: boolean
  onClose?: () => void
}

export default function StatusMessage({ message, isError = false, onClose }: StatusMessageProps) {
  useEffect(() => {
    if (message && onClose) {
      const timer = setTimeout(onClose, 3000)
      return () => clearTimeout(timer)
    }
  }, [message, onClose])

  if (!message) return null

  return (
    <div 
      className={`status ${isError ? 'error' : 'success'}`}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '10px 15px',
        borderRadius: '4px',
        background: isError ? '#ffebee' : '#e8f5e9',
        color: isError ? '#ff1744' : '#00c853',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        fontSize: '17px',
        zIndex: 1000,
        display: 'block'
      }}
    >
      {message}
    </div>
  )
}