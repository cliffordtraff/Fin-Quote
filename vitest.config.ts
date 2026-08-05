import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // Next.js treats this marker as a compile-time boundary. Vitest runs
      // server modules directly, so map it to a no-op test stub.
      'server-only': path.resolve(__dirname, './test/stubs/server-only.ts'),
    },
  },
})
