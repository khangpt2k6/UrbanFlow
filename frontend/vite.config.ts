import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // sockjs-client references the Node `global`, which does not exist in the browser.
  define: {
    global: 'globalThis',
  },
})
