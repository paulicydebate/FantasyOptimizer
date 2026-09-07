import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves this project from /FantasyOptimizer/, but keep the
  // dev server at the root so `npm run dev` works normally.
  base: command === 'build' ? '/FantasyOptimizer/' : '/',
  plugins: [react()],
}))
