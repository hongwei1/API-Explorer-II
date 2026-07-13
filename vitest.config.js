import { configDefaults } from 'vitest/config'
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { svelte } from '@sveltejs/vite-plugin-svelte'

import { fileURLToPath, URL } from 'node:url'

import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    vue(), vueJsx(),
    // Mirrors vite.config.mts: SvelteDropdown.vue imports a .svelte component,
    // so this plugin is needed to import/mount it in tests too.
    svelte(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    nodePolyfills({
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue', '.svelte'],
    // vite-plugin-svelte otherwise compiles .svelte components for server-side
    // rendering under Vitest (mount() throws "not available on the server") -
    // this is the documented fix to make it resolve the client/browser build.
    conditions: process.env.VITEST ? ['browser'] : []
  },
  test: {
    globals: true,
    environment: 'happy-dom', // Simulates a browser environment
    // Client-side unit tests only. Server unit tests run in a plain Node
    // environment via vitest.server.config.js (npm run test:server) - they must
    // not go through the Vue/browser-polyfill pipeline above.
    include: ['src/test/**/*.test.ts'],
    exclude:[
      ...configDefaults.exclude,
      '**/integration/*'
    ],
    pool: "vmThreads",
    deps: {
      inline: ['element-plus'],
    }
  },
});