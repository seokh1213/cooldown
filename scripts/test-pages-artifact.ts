import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { preparePagesArtifact } from "./data-pipeline/pages-artifact";

const directory = await mkdtemp(path.join(os.tmpdir(), "cooldown-pages-"));
const indexHtml = "<!doctype html><title>cooldown</title>";

try {
  await writeFile(path.join(directory, "index.html"), indexHtml);
  await preparePagesArtifact(directory);

  for (const relativePath of [
    "404.html",
    "encyclopedia/index.html",
    "simulation/index.html",
  ]) {
    assert.equal(await readFile(path.join(directory, relativePath), "utf8"), indexHtml);
  }
  assert.equal(await readFile(path.join(directory, ".nojekyll"), "utf8"), "");
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("GitHub Pages artifact preparation tests passed.");
