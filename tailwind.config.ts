import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sage: {
          50: '#f6f7f4',
          100: '#e8ebe3',
          200: '#d4d9ca',
          300: '#b5bea6',
          400: '#8a9b7a',   // Light sage (dark mode accent)
          500: '#5a6b4a',   // Primary sage
          600: '#4a5a3a',   // Hover state
          700: '#3d4a30',
          800: '#333d29',
          900: '#2b3223',
        },
        cream: {
          50: '#fdfdfb',
          100: '#f5f5f0',   // Main background
          200: '#ededea',
          300: '#e5e5e0',   // Borders
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Times New Roman', 'serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'grow-bar': 'growBar 0.8s ease-out forwards',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        growBar: {
          '0%': { transform: 'scaleY(0)', opacity: '0' },
          '100%': { transform: 'scaleY(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
export default config
