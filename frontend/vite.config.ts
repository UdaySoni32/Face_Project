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
    },
  },
})
