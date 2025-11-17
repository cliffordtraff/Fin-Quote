import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class', // Enable class-based dark mode
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './packages/watchlist/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundColor: {
        'watchlist-bg': 'rgb(var(--watchlist-bg))',
        'watchlist-surface': 'rgb(var(--watchlist-surface))',
        'watchlist-surface-elevated': 'rgb(var(--watchlist-surface-elevated))',
        'watchlist-tab-bar': 'rgb(var(--watchlist-tab-bar))',
        'watchlist-tab-active': 'rgb(var(--watchlist-tab-active))',
        'watchlist-tab-inactive': 'rgb(var(--watchlist-tab-inactive))',
        'watchlist-controls-bg': 'rgb(var(--watchlist-controls-bg))',
        'watchlist-button-bg': 'rgb(var(--watchlist-button-bg))',
        'watchlist-button-hover': 'rgb(var(--watchlist-button-hover))',
        'watchlist-highlight': 'rgb(var(--watchlist-highlight))',
      },
      textColor: {
        'watchlist-text-primary': 'rgb(var(--watchlist-text-primary))',
        'watchlist-text-secondary': 'rgb(var(--watchlist-text-secondary))',
        'watchlist-text-muted': 'rgb(var(--watchlist-text-muted))',
      },
      borderColor: {
        'watchlist-border': 'rgb(var(--watchlist-border))',
        'watchlist-border-table': 'rgb(var(--watchlist-border-table))',
        'watchlist-button-border': 'rgb(var(--watchlist-button-border))',
      },
      ringColor: {
        'watchlist-focus-ring': 'rgb(var(--watchlist-focus-ring))',
      },
    },
  },
  plugins: [],
}
export default config
