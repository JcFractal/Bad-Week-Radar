/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Production-only Content Security Policy: the built app may load only its own files and
// cannot open any network connection (no uploads, no analytics). Dev mode is left without it
// because Vite's hot reload needs a websocket.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

const csp = (): Plugin => ({
  name: 'bwr-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
})

export default defineConfig({
  // Relative asset paths + hash routing: the build works from any static host or sub-path.
  base: './',
  plugins: [react(), csp()],
  build: { modulePreload: { polyfill: false } },
  // The Evidence page imports the committed aggregate results from ../analysis/results.
  server: { fs: { allow: ['..'] } },
  test: { environment: 'node' },
})
