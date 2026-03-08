'use client'

import Link from 'next/link'
import Logo from '@/components/Logo'

export default function Footer() {
  return (
    <footer className="bg-white dark:bg-[rgb(18,18,18)] border-t border-gray-100 dark:border-gray-800 py-12">
      <div className="max-w-7xl mx-auto px-6">
        {/* Main Footer Content */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-8">
          {/* Logo and Description */}
          <div>
            <Logo size="md" href="/" />
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              Real-time market intelligence platform
            </p>
          </div>

          {/* Newsletter Signup */}
          <div className="w-full md:w-auto">
            <form className="flex items-center gap-2" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                placeholder="name@email.com"
                className="w-full md:w-64 px-4 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(30,30,30)] text-gray-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              <button
                type="submit"
                className="p-2 text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </form>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-2">
              By subscribing you agree to our Privacy Policy and agree
              to receive updates from our company. No spam ever.
            </p>
          </div>
        </div>

        {/* Divider */}
        <hr className="border-gray-100 dark:border-gray-800 mb-8" />

        {/* Bottom Row */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500 dark:text-gray-500">
          <p>&copy; {new Date().getFullYear()} The Intraday. All Rights Reserved</p>

          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-sage-600 dark:hover:text-sage-400 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-sage-600 dark:hover:text-sage-400 transition-colors">
              Terms of Service
            </Link>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-4">
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 dark:text-gray-600 hover:text-sage-600 dark:hover:text-sage-400 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 dark:text-gray-600 hover:text-sage-600 dark:hover:text-sage-400 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
