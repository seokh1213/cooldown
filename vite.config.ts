import * as fs from "node:fs";
import * as path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const BASE_PATH = "/cooldown/";

/**
 * 개발 서버에서 ONNX Runtime 런타임을 그대로 내보낸다.
 *
 * `public/ort/*.mjs` 는 상성 코치 워커가 실행 중에 동적 import 한다.
 * 그런데 Vite dev 는 public 아래 파일을 모듈로 변환하려 들고
 * "should not be imported from source code" 로 거절한다. 운영 빌드에서는 정적 파일이라 문제없다.
 * 개발과 운영이 같은 경로를 쓰도록, dev 에서만 이 경로를 가로채 파일을 그대로 돌려준다.
 */
function serveOrtRuntime(): PluginOption {
  return {
    name: "serve-ort-runtime",
    // configureServer 는 Vite 내부 미들웨어보다 먼저 실행된다
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (!url?.startsWith("/ort/")) return next();
        const file = path.join(process.cwd(), "public", url);
        if (!fs.existsSync(file)) return next();
        res.setHeader(
          "Content-Type",
          url.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        );
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? BASE_PATH : "/",
  plugins: [
    serveOrtRuntime(),
    tailwindcss(),
    react(),
    VitePWA({
      injectRegister: null,
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "favicon-48x48.png",
        "apple-touch-icon.png",
        "poro_logo.png",
        "og-image.png",
      ],
      manifest: {
        name: "LoL Champion Cooldown",
        short_name: "LoL Cooldown",
        description:
          "리그 오브 레전드 챔피언 스킬 쿨타임 비교 도구. 챔피언 간 스킬 쿨타임과 스탯을 비교하고 VS 모드로 대전 분석을 해보세요.",
        theme_color: "#0b0c0f",
        background_color: "#0b0c0f",
        display: "standalone",
        start_url: BASE_PATH,
        scope: BASE_PATH,
        icons: [
          { src: "favicon-16x16.png", sizes: "16x16", type: "image/png" },
          { src: "favicon-32x32.png", sizes: "32x32", type: "image/png" },
          { src: "favicon-48x48.png", sizes: "48x48", type: "image/png" },
          { src: "apple-touch-icon.png", sizes: "180x180", type: "image/png" },
          {
            src: "poro_logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,json}"],
        // 통계 오라클은 4MB 가 넘고 상성 코치를 쓸 때만 필요하다.
        // 앱을 설치하는 모든 사용자에게 미리 받게 할 이유가 없으므로 사전 캐시에서 뺀다.
        globIgnores: ["**/data/*/oracle/**"],
      },
      devOptions: { enabled: true },
    }),
  ],
  resolve: {
    alias: { "@": `${import.meta.dirname}/src` },
  },
  // 상성 코치 워커가 실행 시점에 처음 불러오면 Vite 가 그때 의존성을 최적화하면서
  // 페이지를 통째로 새로고침한다. 동의 버튼을 누른 순간 화면이 초기화되어 보이므로 미리 담아 둔다.
  optimizeDeps: { include: ["@huggingface/transformers"] },
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 600 },
  define: {
    "import.meta.env.VITE_DEPLOYMENT_VERSION": JSON.stringify(
      process.env.VITE_DEPLOYMENT_VERSION ??
        (mode === "production" ? "local" : "dev"),
    ),
  },
}));
