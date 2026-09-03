import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  // Android TV / older smart-TV Chromium builds: transpile down to Chrome 87,
  // emit SystemJS legacy bundle + polyfills guarded by nomodule.
  plugins: [legacy({ targets: ['chrome >= 87', 'safari >= 13', 'firefox >= 78'] }), react()],
  build: {
    target: 'es2018',
    cssTarget: 'chrome87',
  },
})
