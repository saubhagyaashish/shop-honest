import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same origin as production (Hosting rewrites /api/** to Cloud Run): run the backend on :8080.
    // 127.0.0.1, not localhost: Node resolves localhost to ::1 first, and uvicorn listens on IPv4.
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
})
