import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium, type BrowserContext } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { ROOT } from "./bank";
import type { ModelRuntime } from "./dialogue";
import type { CallRecord } from "../conversational-advisor/runtime";

export function graphRoute(graph: string): string {
  const hash = createHash("sha256").update(fs.readFileSync(graph)).digest("hex");
  return `/quality-models/${hash}/model_q4.onnx`;
}

export async function openModel(options: { graph?: string; headless?: boolean; cacheDirectory: string; signal?: AbortSignal;
  onCloseReady?: (close: () => Promise<void>) => void }): Promise<{
  runtime: ModelRuntime; errors: string[]; close: () => Promise<void>; calls: () => Promise<CallRecord[]>;
}> {
  let server: ViteDevServer | undefined, context: BrowserContext | undefined;
  const errors: string[] = [];
  const close = async () => {
    const activeContext = context, activeServer = server;
    context = undefined; server = undefined;
    try { await activeContext?.close(); } finally { await activeServer?.close(); }
  };
  options.onCloseReady?.(close);
  try {
    options.signal?.throwIfAborted();
    execFileSync(process.execPath, ["--import", "tsx", path.join(ROOT, "scripts/prepare-ort.ts")], { cwd: ROOT, stdio: "pipe" });
    const graph = options.graph ? path.resolve(ROOT, options.graph) : undefined;
    if (graph && !fs.existsSync(graph)) throw new Error("Candidate graph does not exist");
    const graphUrl = graph ? graphRoute(graph) : undefined;
    server = await createServer({ root: ROOT, configFile: false, base: "/", logLevel: "error",
      server: { host: "127.0.0.1", port: 0, strictPort: true }, worker: { format: "es" }, plugins: [{ name: "quality-fixture", configureServer(vite) {
        vite.middlewares.use((req, res, next) => {
          if (req.url?.split("?")[0] === "/quality-fixture") {
            res.setHeader("Content-Type", "text/html");
            res.end('<!doctype html><title>Advisor model tests</title><script type="module" src="/scripts/llm/quality/browser.ts"></script>');
          } else if (graph && req.url === graphUrl) {
            res.setHeader("Content-Type", "application/octet-stream"); fs.createReadStream(graph).pipe(res);
          } else { if (req.url?.startsWith("/ort/")) req.url = req.url.split("?")[0]; next(); }
        });
      } }], resolve: { alias: { "@": path.join(ROOT, "src") } } });
    await server.listen();
    options.signal?.throwIfAborted();
    context = await chromium.launchPersistentContext(path.join(options.cacheDirectory, "browser"), {
      channel: "chrome", headless: options.headless ?? false, args: ["--enable-unsafe-webgpu"],
    });
    options.signal?.throwIfAborted();
    const page = await context.newPage();
    page.setDefaultTimeout(240_000);
    await page.goto(`${server.resolvedUrls!.local[0]}quality-fixture${graphUrl ? `?graph=${encodeURIComponent(graphUrl)}` : ""}`);
    await page.waitForFunction(() => "qualityRuntime" in window);
    await page.evaluate(async () => {
      const state = window as unknown as { qualityRuntime: { load: () => Promise<unknown> } };
      if (!navigator.gpu || !await navigator.gpu.requestAdapter()) throw new Error("WebGPU unavailable");
      await state.qualityRuntime.load();
    });
    const call = async (method: "judge" | "search" | "generate", args: unknown[]) => {
      try {
        return await page.evaluate(async ({ method, args }) => {
          const state = window as unknown as { qualityRuntime: { rpc: (method: string, args: unknown[]) => Promise<unknown> } };
          return state.qualityRuntime.rpc(method, args);
        }, { method, args });
      } catch (error) { errors.push(`${method}: ${String(error)}`); throw error; }
    };
    return { runtime: { judge: async (name, state, questions) => await call("judge", [name, state, questions]) as number[][],
      search: async (question, lang) => await call("search", [question, lang]) as Array<{ id: string; score: number }>,
      generate: async (system, prompt, maxTokens, purpose) => (await call("generate", [system, prompt, maxTokens, purpose]) as { text: string }).text },
      errors, close, calls: () => page.evaluate(() => (window as unknown as { qualityRuntime: { calls: CallRecord[] } }).qualityRuntime.calls) };
  } catch (error) { await close(); throw error; }
}
