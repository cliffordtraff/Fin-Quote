'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Logo from '@/components/Logo'
import ThemeToggle from '@/components/ThemeToggle'

export default function LandingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const supabase = createClientComponentClient()

  useEffect(() => {
    // Check initial auth state
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setIsLoggedIn(!!session)
    }
    checkAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const navLinks = [
    { href: '#features', label: 'Features' },
    { href: '/pricing', label: 'Pricing' },
    { href: '#faq', label: 'FAQ' },
  ]

  return (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-[rgb(18,18,18)]/90 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Logo size="md" href="/" />

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) =>
              link.href.startsWith('/') ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-sage-600 dark:hover:text-sage-400 transition-colors"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-sage-600 dark:hover:text-sage-400 transition-colors"
                >
                  {link.label}
                </a>
              )
            )}
          </div>

          {/* Theme Toggle + Auth Buttons */}
          <div className="hidden md:flex items-center gap-4">
            <ThemeToggle />
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="text-sm bg-sage-500 text-white px-4 py-2 rounded-lg hover:bg-sage-600 transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/auth"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-sage-600 dark:hover:text-sage-400 transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/auth?signup=true"
                  className="text-sm bg-sage-500 text-white px-4 py-2 rounded-lg hover:bg-sage-600 transition-colors"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="md:hidden p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) =>
                link.href.startsWith('/') ? (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-sage-600 dark:hover:text-sage-400 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-sage-600 dark:hover:text-sage-400 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </a>
                )
              )}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Theme</span>
                <ThemeToggle />
              </div>
              <hr className="border-gray-100 dark:border-gray-800" />
              {isLoggedIn ? (
                <Link
                  href="/dashboard"
                  className="text-sm bg-sage-500 text-white px-4 py-2 rounded-lg hover:bg-sage-600 transition-colors text-center"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/auth"
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-sage-600 dark:hover:text-sage-400 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Log in
                  </Link>
                  <Link
                    href="/auth?signup=true"
                    className="text-sm bg-sage-500 text-white px-4 py-2 rounded-lg hover:bg-sage-600 transition-colors text-center"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
