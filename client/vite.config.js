import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:5050',
    },
  },
  build: {
    // Windows can lock files under dist/ (antivirus/indexers), causing builds to fail when emptying the directory.
    // Hashed assets mean stale files are harmless, and deploy environments are clean anyway.
    emptyOutDir: false,
  },
})
