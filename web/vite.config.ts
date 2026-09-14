import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The browser only ever talks to same-origin `/api/...` URLs.
 * In development Vite proxies those to the Express API; in production the API
 * serves the built bundle from the same origin, so no proxy is needed.
 */
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The app is previewed through a sandbox host name; accept any host so the
    // dev server does not reject the proxied preview origin.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:4000',
        // Keep the browser's Host header: the API rejects writes whose Origin
        // does not match the host it was served from (CSRF defence), so the
        // proxy must not rewrite it to the internal target.
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
});
