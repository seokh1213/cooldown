import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { copyFileSync, writeFileSync } from 'fs'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // GitHub Pages용 404.html 및 .nojekyll 생성 플러그인
    {
      name: 'github-pages-404',
      closeBundle() {
        if (mode === 'production') {
          const distPath = path.resolve(__dirname, 'dist')
          // 404.html 생성 (SPA 라우팅 지원)
          copyFileSync(
            path.join(distPath, 'index.html'),
            path.join(distPath, '404.html')
          )
          // .nojekyll 생성 (Jekyll 비활성화)
          writeFileSync(
            path.join(distPath, '.nojekyll'),
            ''
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
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // node_modules의 패키지들을 청크로 분리
          if (id.includes('node_modules')) {
            // React 및 React Router를 별도 청크로
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // Radix UI 컴포넌트들을 하나의 청크로
            if (id.includes('@radix-ui')) {
              return 'radix-ui';
            }
            // DnD Kit 라이브러리들을 하나의 청크로
            if (id.includes('@dnd-kit')) {
              return 'dnd-kit';
            }
            // lucide-react 아이콘 라이브러리
            if (id.includes('lucide-react')) {
              return 'lucide-icons';
            }
            // 기타 vendor 라이브러리들
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
}))


