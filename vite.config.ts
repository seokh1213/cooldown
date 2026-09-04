import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const BASE_PATH = "/cooldown/";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? BASE_PATH : "/",
  plugins: [
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
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        runtimeCaching: [
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
              cacheName: "cooldown-game-data",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 60,
              },
            },
          },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
  resolve: {
    alias: { "@": `${import.meta.dirname}/src` },
  },
  build: { chunkSizeWarningLimit: 600 },
  define: {
    "import.meta.env.VITE_DEPLOYMENT_VERSION": JSON.stringify(
      process.env.VITE_DEPLOYMENT_VERSION ??
        (mode === "production" ? "local" : "dev"),
    ),
  },
}));
