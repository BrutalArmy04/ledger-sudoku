import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative base path is required so the built index.html works when
  // loaded via file:// (as Electron does), not just from a web server.
  base: './',
  plugins: [react()],
})
