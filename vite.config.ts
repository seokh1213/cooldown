import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { copyFileSync, writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync, cpSync } from 'fs'
import { createHash } from 'crypto'

// GitHub Pages base path
const BASE_PATH = '/cooldown/'

// 동적 import 및 정적 import 경로를 base path에 맞게 수정하는 플러그인
function fixDynamicImports() {
  return {
    name: 'fix-dynamic-imports',
    closeBundle() {
      const distPath = path.resolve(__dirname, 'dist')
      const assetsPath = path.join(distPath, 'assets')
      
      // assets 디렉토리의 모든 JS 파일을 확인
      const files = readdirSync(assetsPath).filter(f => f.endsWith('.js'))
      
      files.forEach(file => {
        const filePath = path.join(assetsPath, file)
        let content = readFileSync(filePath, 'utf-8')
        
        // 상대 경로 동적 import를 절대 경로로 변경
        // ./FileName-xxx.js -> /cooldown/assets/FileName-xxx.js
        content = content.replace(
          /import\(['"]\.\/([^'"]+)['"]\)/g,
          (match, fileName) => {
            return `import("${BASE_PATH}assets/${fileName}")`
          }
        )
        
        // assets/FileName-xxx.js -> /cooldown/assets/FileName-xxx.js (동적 import)
        content = content.replace(
          /import\(['"]assets\/([^'"]+)['"]\)/g,
          (match, fileName) => {
            return `import("${BASE_PATH}assets/${fileName}")`
          }
        )
        
        // 정적 import 경로도 수정 (from"./react-vendor-xxx.js" -> from"/cooldown/assets/react-vendor-xxx.js")
        content = content.replace(
          /from['"]\.\/([^'"]+)['"]/g,
          (match, fileName) => {
            return `from"${BASE_PATH}assets/${fileName}"`
          }
        )
        
        // from"assets/xxx.js" -> from"/cooldown/assets/xxx.js" (정적 import)
        content = content.replace(
          /from['"]assets\/([^'"]+)['"]/g,
          (match, fileName) => {
            return `from"${BASE_PATH}assets/${fileName}"`
          }
        )
        
        writeFileSync(filePath, content, 'utf-8')
      })
    },
  }
}

function getDeploymentVersion(mode: string): string {
  if (mode === 'production') {
    // localStorage / sessionStorage 직렬화 구조(스키마)가 정의된 파일들만 해싱해서 버전을 만든다.
    // 이 배열에 포함된 파일 내용이 바뀔 때만 해시가 변경되므로,
    // 일반 코드/스타일 변경만으로는 스토리지가 초기화되지 않는다.
    const SCHEMA_FILES = [
      path.resolve(__dirname, 'src/lib/storageValidator.ts'),
      path.resolve(__dirname, 'src/lib/storageSchema.ts'),
      // 필요하면 나중에 다른 스키마 관련 파일을 여기에 추가
    ]

    const hash = createHash('sha256')

    for (const schemaFile of SCHEMA_FILES) {
      if (!existsSync(schemaFile)) {
        console.warn(`⚠️ Storage schema file not found for hashing: ${schemaFile}`)
        continue
      }

      const content = readFileSync(schemaFile, 'utf-8')
      // 파일 경로와 내용 둘 다 섞어서 해시를 조금 더 안정적으로 만든다
      hash.update(schemaFile)
      hash.update(content)
    }

    const deploymentVersion = hash.digest('hex').substring(0, 16)
    console.log(`📦 Storage schema based deployment version: ${deploymentVersion}`)
    return deploymentVersion;
  }
  return 'dev';
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const deploymentVersion = getDeploymentVersion(mode);
  
  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'favicon-48x48.png',
        'apple-touch-icon.png',
        'poro_logo.png',
        'og-image.png',
      ],
      manifest: {
        name: 'LoL Champion Cooldown',
        short_name: 'LoL Cooldown',
        description:
          '리그 오브 레전드 챔피언 스킬 쿨타임 비교 도구. 챔피언 간 스킬 쿨타임과 스탯을 비교하고 VS 모드로 대전 분석을 해보세요.',
        theme_color: '#0b0c0f',
        background_color: '#0b0c0f',
        display: 'standalone',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        icons: [
          {
            src: 'favicon-16x16.png',
            sizes: '16x16',
            type: 'image/png',
          },
          {
            src: 'favicon-32x32.png',
            sizes: '32x32',
            type: 'image/png',
          },
          {
            src: 'favicon-48x48.png',
            sizes: '48x48',
            type: 'image/png',
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
          {
            src: 'poro_logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json}'],
      },
    }),
    // 동적 import 경로 수정 플러그인
    fixDynamicImports(),
    // HTML의 modulepreload 순서를 수정하는 플러그인 (react-vendor를 먼저 로드)
    {
      name: 'fix-html-preload-order',
      transformIndexHtml(html) {
        if (mode === 'production') {
          // react-vendor를 먼저 preload하도록 순서 변경
          const reactVendorPreload = html.match(/<link rel="modulepreload"[^>]*react-vendor[^>]*>/);
          const vendorPreload = html.match(/<link rel="modulepreload"[^>]*vendor-[^>]*>/);
          
          if (reactVendorPreload && vendorPreload && html.indexOf(vendorPreload[0]) < html.indexOf(reactVendorPreload[0])) {
            html = html.replace(vendorPreload[0], '');
            html = html.replace(reactVendorPreload[0], reactVendorPreload[0] + '\n    ' + vendorPreload[0]);
          }
        }
        return html;
      },
    },
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
    // 정적 데이터 폴더 복사 보장 플러그인
    {
      name: 'ensure-static-data',
      closeBundle() {
        if (mode === 'production') {
          const publicDataPath = path.resolve(__dirname, 'public', 'data')
          const distDataPath = path.resolve(__dirname, 'dist', 'data')
          
          // public/data 폴더가 존재하고 dist/data 폴더가 없거나 비어있으면 복사
          if (existsSync(publicDataPath)) {
            if (!existsSync(distDataPath)) {
              mkdirSync(distDataPath, { recursive: true })
            }
            
            // public/data의 모든 내용을 dist/data로 복사
            try {
              cpSync(publicDataPath, distDataPath, { recursive: true, force: true })
              console.log('✅ Static data files copied to dist/data')
            } catch (error) {
              console.warn('⚠️ Failed to copy static data files:', error)
            }
          }
        }
      },
    },
  ],
  base: mode === 'production' ? BASE_PATH : '/',
  publicDir: 'public',
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
            // lucide-react 아이콘 라이브러리 (React 의존성 없음)
            if (id.includes('lucide-react')) {
              return 'lucide-icons';
            }
            // 모든 다른 라이브러리를 react-vendor에 포함
            // (vendor 파일이 react-vendor를 import하는 문제를 방지하기 위해)
            return 'react-vendor';
          }
        },
        // 동적 import 청크 파일명 설정 (base path가 자동으로 포함됨)
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 600,
  },
  define: {
    'import.meta.env.VITE_DEPLOYMENT_VERSION': JSON.stringify(deploymentVersion),
  },
}})


