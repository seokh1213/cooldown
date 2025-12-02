import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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

// 배포 버전 해시 생성 플러그인
function generateDeploymentVersion() {
  return {
    name: 'generate-deployment-version',
    config({ mode }) {
      let deploymentVersion: string;
      
      if (mode === 'production') {
        // 프로덕션 빌드: package.json 버전 + 빌드 타임스탬프를 조합하여 고유한 해시 생성
        const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
        const buildTimestamp = Date.now().toString();
        const versionString = `${packageJson.version}-${buildTimestamp}`;
        deploymentVersion = createHash('sha256').update(versionString).digest('hex').substring(0, 16);
        console.log(`📦 Deployment version hash: ${deploymentVersion}`);
      } else {
        // 개발 환경: 고정값 사용 (개발 중에는 초기화되지 않도록)
        deploymentVersion = 'dev';
      }
      
      // 환경 변수로 주입
      return {
        define: {
          'import.meta.env.VITE_DEPLOYMENT_VERSION': JSON.stringify(deploymentVersion),
        },
      };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // 배포 버전 해시 생성 플러그인
    generateDeploymentVersion(),
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
}))


