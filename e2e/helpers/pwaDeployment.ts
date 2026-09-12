import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { decodeAppRelease, type AppRelease } from "../../src/pwa/release";

export interface ReleaseBuilds {
  directory: string;
  a: string;
  b: string;
  c: string;
  releaseA: AppRelease;
  releaseB: AppRelease;
  releaseC: AppRelease;
}

export function buildPwaReleases(): ReleaseBuilds {
  const directory = mkdtempSync(path.join(tmpdir(), "cooldown-pwa-releases-"));
  const publicDir = path.join(directory, "public");
  cpSync("public", publicDir, { recursive: true });
  const build = (name: string, label: string) => {
    const output = path.join(directory, name);
    execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--mode", "local-preview", "--outDir", output, "--logLevel", "silent"], {
      env: { ...process.env, COOLDOWN_PUBLIC_DIR: publicDir, VITE_DEPLOYMENT_VERSION: label },
      stdio: "pipe",
    });
    return output;
  };
  try {
    const a = build("a", "same-app");
    const manifest = JSON.parse(readFileSync(path.join(publicDir, "data/version.json"), "utf8"));
    const profilePath = path.join(publicDir, `data/${manifest.patchVersion}/champion-profiles/ko_KR/Aatrox.json`);
    const profile = JSON.parse(readFileSync(profilePath, "utf8"));
    profile.champion.lore = "PWA 갱신 테스트: 같은 패치의 새 이야기";
    writeFileSync(profilePath, JSON.stringify(profile));
    const b = build("b", "same-app");
    const c = build("c", "new-app");
    const readRelease = (dir: string) => decodeAppRelease(JSON.parse(readFileSync(path.join(dir, "release.json"), "utf8")));
    return { directory, a, b, c, releaseA: readRelease(a), releaseB: readRelease(b), releaseC: readRelease(c) };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

const contentTypes: Record<string, string> = { ".js": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const legacyHtml = `<h1>Legacy PWA</h1><script>
navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
</script>`;
const legacyWorker = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') event.respondWith(Promise.resolve(new Response(${JSON.stringify(legacyHtml)}, { headers: { 'Content-Type': 'text/html' } })));
});`;

export async function startPwaDeployment(builds: ReleaseBuilds) {
  let current = builds.a;
  let blocked: RegExp | undefined;
  let legacy = false;
  const requests: string[] = [];
  const failedRequests: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    requests.push(url.pathname);
    response.setHeader("Cache-Control", "no-store");
    if (legacy && (url.pathname === "/cooldown/sw.js" || !path.extname(url.pathname))) {
      response.setHeader("Content-Type", url.pathname.endsWith(".js") ? "text/javascript" : "text/html");
      response.end(url.pathname.endsWith(".js") ? legacyWorker : legacyHtml);
      return;
    }
    if (blocked?.test(url.pathname)) {
      failedRequests.push(url.pathname);
      response.writeHead(503).end("Partial deployment");
      return;
    }
    const relative = url.pathname.replace(/^\/cooldown\//, "");
    const file = path.join(current, relative);
    if (!file.startsWith(`${current}${path.sep}`)) { response.writeHead(404).end(); return; }
    const extension = path.extname(relative);
    try {
      response.setHeader("Content-Type", contentTypes[extension || ".html"] ?? "application/octet-stream");
      response.end(readFileSync(extension ? file : path.join(current, "index.html")));
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing deployment port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    failedRequests,
    deploy: (name: "a" | "b" | "c") => { current = builds[name]; legacy = false; },
    serveLegacy: () => { legacy = true; },
    block: (pattern?: RegExp) => { blocked = pattern; },
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}
