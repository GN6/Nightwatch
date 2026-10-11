import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [tailwindcss()],
    server: {
    proxy: {
      // The browser asks /api/sky-feed; Vite fetches the real feed for it
      '/api/sky-feed': {
        target: 'https://www.astronomy.com',
        changeOrigin: true,
        rewrite: () => '/tags/sky-this-week/feed/',
      },
    },
  },
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
