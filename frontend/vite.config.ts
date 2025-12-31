import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxying websockets
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
      // Proxying regular API calls. Any request to /api/... will be forwarded to http://localhost:8000/api/...
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
