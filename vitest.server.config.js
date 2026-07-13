import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// Server-side unit tests. These exercise the Express services/routes, which
// need a plain Node environment (typedi + reflect-metadata, process.env) and
// must NOT load the Vue/browser-polyfill plugin pipeline used by the client
// config - that pipeline is what broke server tests when everything ran under
// one happy-dom config.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['server/test/**/*.test.ts'],
    // server/test/integration is live-stack (imports app.ts, needs Redis + a
    // real OBP/Opey backend) - it must never load in the unit run.
    exclude: ['server/test/integration/**'],
    setupFiles: ['server/test/setup.ts']
  }
})
