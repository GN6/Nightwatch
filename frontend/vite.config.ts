import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    // Needed so `npm run build` includes every page, not just index.html.
    // Add stargazer.html here when you create it.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        tips: resolve(import.meta.dirname, 'tips.html'),
      },
    },
  }
})
