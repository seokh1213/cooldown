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
         * 시트는 설치 목록에 넣지 않는다.
         *
         * 한때 챔피언과 룬 시트를 여기 넣어 두었다. 그러다 시트마다 AVIF 사본이
         * 생기면서 셈이 달라졌다 — 브라우저는 둘 중 **하나만** 쓰는데 설치 목록은
         * 둘 다 받는다. 챔피언 한 장에 383+179KB 를 받아 179KB 만 쓰는 꼴이다.
         *
         * 대신 앱이 뜬 뒤 손이 빈 틈에 넷을 다 받는다(`warmIcons`). 그쪽은 브라우저가
         * 고른 꼴 하나만 받고, 설치를 늦추지도 않는다. 받은 것은 같은 `cooldown-icons-v1`
         * 에 들어가므로 다음부터는 요청 자체가 안 나간다.
         *
         * 목록 JSON 도 넣지 않는다 — 화면이 칸 자리를 스스로 세므로 받을 일이 없고,
         * 그 파일은 생성기와 화면의 셈이 같은지 시험이 맞춰 보는 용도로만 남는다.
         */
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
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
          /*
           * 스플래시 아트는 본 것만 담는다.
           *
           * 아이콘과 달리 우리 자리로 옮기지 않았다. 스킨이 2,121종이고 960px WebP
           * 로 줄여도 97MB 다. 저장소에 넣고 스킨이 나올 때마다 불리는 값보다,
           * 갤러리에서 한 장씩 보는 그림을 그때 받는 값이 싸다.
           *
           * 대신 한 번 본 것은 다시 묻지 않는다. 주소에 스킨 번호가 박혀 있어 같은
           * 주소의 내용이 바뀌지 않으므로 CacheFirst 로 둔다. 갤러리를 앞뒤로 넘길 때
           * 두 번째부터는 네트워크를 안 탄다.
           */
          {
            urlPattern: /^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/img\/champion\/splash\//,
            handler: "CacheFirst",
            options: {
              cacheName: "cooldown-splash-v1",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
          /*
           * 도우미 모델의 실행기(ONNX Runtime)와 판정 헤드.
           *
           * 여기에 규칙이 없어서 모델을 받아 둔 사용자도 오프라인에서는 모델을 못 올렸다.
           * 가중치(수백 MB)는 Transformers.js 가 Cache Storage 에 넣지만, 그것을 돌리는
           * `ort/*.mjs`·`*.wasm`(12MB)은 선캐시 패턴에도 없고 런타임 규칙도 없어 브라우저
           * HTTP 캐시에 우연히 남아 있어야만 떴다. 선캐시에 넣지 않는 까닭은 모델을 안 쓰는
           * 사람에게까지 12MB 를 받게 할 이유가 없어서다 — 한 번 쓴 사람만 담는다.
           * 파일 이름이 판본과 함께 바뀌지 않으므로 수명을 두어 판올림을 따라간다.
           */
          {
            urlPattern: /\/cooldown\/(ort|models)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "cooldown-advisor-runtime-v1",
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
