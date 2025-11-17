import React from 'react'
import { cn } from '@watchlist/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-watchlist-focus-ring disabled:opacity-50 disabled:pointer-events-none'

    const variantStyles = {
      primary: 'bg-watchlist-button-bg hover:bg-watchlist-button-hover border border-watchlist-button-border text-watchlist-text-primary',
      secondary: 'bg-watchlist-button-bg hover:bg-watchlist-button-hover border border-watchlist-button-border text-watchlist-text-primary',
      success: 'bg-green-600 hover:bg-green-700 text-white border-none',
      danger: 'bg-red-600 hover:bg-red-700 text-white border-none'
    }

    const sizeStyles = {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-base',
      lg: 'h-12 px-6 text-lg'
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'

export default Button
