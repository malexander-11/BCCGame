import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is relative so the built site works from any path — GitHub Pages
// project sites live under /<repo>/, not the domain root.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', sourcemap: false },
})
