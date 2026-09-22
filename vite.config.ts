import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { createBuildRelease } from "./scripts/pwa/buildRelease.ts";

const BASE_PATH = "/cooldown/";

/**
 * 개발 서버에서 ORT wasm 글루를 날것으로 내보낸다.
 *
 * onnxruntime 은 실행 중에 `import("/ort/ort-wasm-simd-threaded.asyncify.mjs")` 를 부른다.
 * vite 개발 서버는 동적 import 를 보면 `?import` 를 붙여 모듈 변환 경로로 보내는데,
 * 이 파일은 emscripten 이 만든 글루라 변환하면 깨진다. 그래서 적재가 실패했다.
 *
 *   no available backend found. ERR: [webgpu] TypeError:
 *   Failed to fetch dynamically imported module: .../ort-wasm-simd-threaded.asyncify.mjs?import
 *
 * 배포본은 public/ 을 그대로 복사하므로 이 문제가 없다. 개발 서버에서만 질의를 떼어
 * 정적 파일로 내보낸다.
 */
function serveOrtRaw(): PluginOption {
  return {
    name: "serve-ort-raw",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith("/ort/")) req.url = req.url.split("?")[0];
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const publicDirectory = path.resolve(import.meta.dirname, process.env.COOLDOWN_PUBLIC_DIR ?? "public");
  const { release, plugin, bridgeFile, bootstrapEntries } = createBuildRelease(import.meta.dirname, publicDirectory, mode);
  return {
  base: mode === "development" ? "/" : BASE_PATH,
  publicDir: publicDirectory,
  plugins: [
    serveOrtRaw(),
    tailwindcss(),
    react(),
    plugin,
    VitePWA({
      injectRegister: null,
      registerType: "prompt",
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
        clientsClaim: true,
        skipWaiting: false,
        importScripts: [bridgeFile],
        additionalManifestEntries: bootstrapEntries,
        cleanupOutdatedCaches: true,
        /*
         * 챔피언 아이콘만 미리 받아 둔다.
         *
         * 챔피언 목록은 173장을 한꺼번에 그린다. 지연 로딩이 통하지 않는 화면이라
         * 처음 열 때 173건이 줄줄이 날아가고 그동안 자리맡이 보인다. 설치 때
         * 424KB 를 미리 받아 두면 그 화면이 처음부터 꽉 찬 채로 뜬다.
         *
         * 아이템 스프라이트(1.28MB)는 넣지 않는다. 아이템 화면에 들어가야 쓰는
         * 것이라 미리 받으면 안 볼 사람까지 받는다. 목록 매니페스트는 둘 다 넣는다 —
         * 합쳐서 30KB 도 안 되는데, 이것이 늦으면 스프라이트를 쓸지 정하지 못해
         * 낱장이 먼저 나가 버린다.
         */
        globPatterns: ["**/*.{js,css,html,png,svg,ico}", "img/*/champions.webp", "img/*/*s.json"],
        runtimeCaching: [
          {
            urlPattern: /\/cooldown\/release\.json$/,
            handler: "NetworkOnly",
            options: { fetchOptions: { cache: "no-store" } },
          },
          {
            urlPattern: /\/cooldown\/data\/releases\/[a-f0-9]{32}\//,
            handler: "CacheFirst",
            options: {
              cacheName: "cooldown-game-data-releases-v1",
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          /*
           * 아이콘은 한 번 받으면 다시 묻지 않는다.
           *
           * 여기에 규칙이 없어서 이미지가 서비스워커를 아예 안 거치고 있었다.
           * 챔피언 목록을 두 번째로 열어도 요청이 174건 그대로 나갔다. 바이트는
           * 브라우저 캐시로 줄지만 왕복 174번은 그대로라, 그 사이 자리맡이
           * 보였다가 채워졌다.
           *
           * 경로에 Data Dragon 판본이 박혀 있어(`img/16.18.1/...`) 같은 주소의
           * 내용이 바뀌는 일이 없다. 그래서 CacheFirst 로 두고 오래 붙잡는다.
           * 판본이 올라가면 주소가 달라지고, 낡은 것은 `cleanupOutdatedCaches` 와
           * 수명이 치운다.
           *
           * 미리 받아 두지는 않는다(globPatterns 에 webp 를 넣지 않았다). 1,041장
           * 1.9MB 를 설치 때 다 받으면 첫 방문이 그만큼 늦어진다. 본 것만 담는다.
           */
          {
            urlPattern: /\/cooldown\/img\//,
            handler: "CacheFirst",
            options: {
              cacheName: "cooldown-icons-v1",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          {
            urlPattern: /\/cooldown\/data\/version\.json$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "cooldown-version",
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/cooldown\/data\/(?!version\.json$).+/,
            handler: "CacheFirst",
            options: {
              cacheName: "cooldown-game-data-forms-v1",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 60,
              },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { "@": `${import.meta.dirname}/src` },
  },
  build: {
    outDir: mode === "local-preview" ? "dev-dist/preview" : "dist",
    chunkSizeWarningLimit: 600,
  },
  preview: {
    headers: mode === "local-preview" ? { "Cache-Control": "no-store" } : {},
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(mode === "development" ? "dev" : release.appVersion),
    "import.meta.env.VITE_DATA_VERSION": JSON.stringify(mode === "development" ? "dev" : release.dataVersion),
    "import.meta.env.VITE_RELEASE_ID": JSON.stringify(mode === "development" ? "dev" : release.releaseId),
    "import.meta.env.VITE_DEPLOYMENT_VERSION": JSON.stringify(
      process.env.VITE_DEPLOYMENT_VERSION ??
        (mode === "development" ? "dev" : "local"),
    ),
  },
  };
});
