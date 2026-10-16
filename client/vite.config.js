import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_PROXY_TARGET || 'http://localhost:8000'

  return {
    // "/" locally; set VITE_BASE=/repo-name/ when hosting under a sub-path (e.g. GitHub Pages)
    base: env.VITE_BASE || '/',
    plugins: [
      vue(),
      tailwindcss(),
      mode !== 'test' && vueDevTools(),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Vue changes rarely: its own chunk stays in the browser cache between releases (icons stay
          // with the pages that use them, so no page downloads every icon)
          manualChunks(id) {
            if (/node_modules[\\/](@vue|vue|vue-router)[\\/]/.test(id)) return 'vue';
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      fs: { allow: ['..'] }, // lets the client import ../shared
      proxy: {
        '/api': apiTarget,
        '/uploads': apiTarget,
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.js', 'tests/**/*.test.js'],
    },
  }
})
