import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load env vars from .env files (local dev) AND process.env (Vercel dashboard).
  // Passing '' as the prefix loads every variable, not just VITE_* ones.
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.GEMINI_API_KEY || env.API_KEY || ''

  return {
    plugins: [react()],
    base: '/',
    define: {
      // The app code uses `process.env.API_KEY`. Browsers have no `process`
      // object, so we replace that expression with the actual key at build time.
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
    },
  }
})
