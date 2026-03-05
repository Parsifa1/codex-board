import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const useProxy = env.VITE_PROXY_MODE === 'true'
  const proxyTarget = env.VITE_ENDPOINT || 'http://localhost:8317'

  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    ...(useProxy && {
      server: {
        proxy: {
          '/api/management': {
            target: proxyTarget,
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/api\/management/, '/v0/management'),
          },
        },
      },
    }),
  }
})
