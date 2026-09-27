import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  server: {
    // Proxying /api makes the browser see ONE origin, which is what lets the
    // auth cookies work with sameSite=lax and no CORS credential setup.
    // It also removes the hardcoded http://localhost:3000 from 7 files.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
