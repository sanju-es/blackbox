import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const html = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: html('index.html'),
        token: html('token.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:9115',
      '/metrics': 'http://localhost:9115',
      '/probe': 'http://localhost:9115',
    },
  },
})
