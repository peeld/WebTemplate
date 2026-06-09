import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Shared utilities and components from the core frontend package.
      '@core/frontend': path.resolve(__dirname, '../../core/frontend/src'),
      // Self-referencing alias for consistent intra-module imports.
      '@modules/userauth': path.resolve(__dirname, './src'),
    },
  },
})
