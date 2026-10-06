import { defineConfig } from "@playwright/test";
import path from "node:path";
import original from "../../../playwright.config";
import { ROOT } from "./bank";

const baseURL = "http://127.0.0.1:53678/cooldown/";

export default defineConfig({
  ...original,
  testDir: path.join(ROOT, "e2e"),
  use: { ...original.use, baseURL },
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --mode local-preview --host 127.0.0.1 --port 53678 --strictPort",
    cwd: ROOT,
    url: baseURL,
    reuseExistingServer: false,
  },
});
