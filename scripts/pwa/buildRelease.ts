import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { decodeDataManifest } from "../../src/data/contracts/dataManifest.ts";
import type { AppRelease } from "../../src/pwa/release.ts";
import { createWorkerBridge } from "./workerBridge.ts";

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  }).sort();
}

function digestFiles(files: string[], root: string, salt = ""): string {
  const hash = createHash("sha256").update(salt);
  for (const file of files) {
    hash.update(path.relative(root, file)).update("\0").update(readFileSync(file)).update("\0");
  }
  return hash.digest("hex").slice(0, 32);
}

export function createBuildRelease(root: string, publicDirectory: string, mode: string) {
  const dataDirectory = path.join(publicDirectory, "data");
  const dataFiles = listFiles(dataDirectory);
  const manifest = decodeDataManifest(JSON.parse(readFileSync(path.join(dataDirectory, "version.json"), "utf8")));
  const appFiles = [
    ...listFiles(path.join(root, "src")),
    ...listFiles(path.join(root, "scripts/pwa")),
    ...["index.html", "vite.config.ts", "package-lock.json"].map((file) => path.join(root, file)),
  ].sort();
  const publicAssets = listFiles(publicDirectory).filter((file) => !file.startsWith(`${dataDirectory}${path.sep}`));
  const assetVersion = digestFiles(publicAssets, publicDirectory);
  const appVersion = digestFiles(appFiles, root, `${mode}:${assetVersion}:${process.env.VITE_DEPLOYMENT_VERSION ?? ""}`);
  const snapshot = dataFiles.map((file) => ({
    relative: path.relative(dataDirectory, file),
    source: readFileSync(file),
  }));
  // Hash exactly the bytes emitted, even if a data generator runs during a build.
  const dataHash = createHash("sha256");
  for (const file of snapshot) dataHash.update(file.relative).update("\0").update(file.source).update("\0");
  const dataVersion = dataHash.digest("hex").slice(0, 32);
  const release: AppRelease = {
    schemaVersion: 1,
    appVersion,
    dataVersion,
    releaseId: createHash("sha256").update(`${appVersion}:${dataVersion}`).digest("hex").slice(0, 32),
    patchVersion: manifest.patchVersion,
  };
  const bridgeFile = `pwa-release-${release.releaseId}.js`;
  const prefix = `data/releases/${dataVersion}/`;
  const plugin: Plugin = {
    name: "versioned-app-release",
    apply: "build",
    transformIndexHtml() {
      return [{ tag: "meta", attrs: { name: "cooldown-release", content: release.releaseId }, injectTo: "head" }];
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "release.json", source: JSON.stringify(release) });
      this.emitFile({ type: "asset", fileName: bridgeFile, source: createWorkerBridge(release) });
    },
    writeBundle(output) {
      if (!output.dir) throw new Error("Release builds require an output directory");
      for (const file of snapshot) {
        const destination = path.join(output.dir, prefix, file.relative);
        mkdirSync(path.dirname(destination), { recursive: true });
        writeFileSync(destination, file.source);
      }
    },
  };
  const bootstrapFiles = ["version.json", ...["ko_KR", "en_US", "zh_CN"].map((locale) =>
    `${manifest.patchVersion}/champions/${locale}/index.json`)];
  return {
    release,
    plugin,
    bridgeFile,
    bootstrapEntries: bootstrapFiles.map((file) => ({ url: prefix + file, revision: dataVersion })),
  };
}
