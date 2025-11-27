import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { copyFileSync } from 'fs'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // GitHub Pages용 404.html 생성 플러그인
    {
      name: 'github-pages-404',
      closeBundle() {
        if (mode === 'production') {
          const distPath = path.resolve(__dirname, 'dist')
          copyFileSync(
            path.join(distPath, 'index.html'),
            path.join(distPath, '404.html')
          )
        }
      },
    },
  ],
  base: mode === 'production' ? '/cooldown/' : '/',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))


