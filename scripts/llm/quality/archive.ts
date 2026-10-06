import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { ROOT, WORKFLOW, digest, mergeStories } from "./bank";
import type { QualityStory } from "./types";
import type { Language } from "../../../src/i18n";

export function filesUnder(directory: string): string[] {
  return fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    if (entry.name.startsWith(".") || ["__pycache__", "node_modules"].includes(entry.name) || file === WORKFLOW) return [];
    return entry.isDirectory() ? filesUnder(file) : [file];
  }).sort();
}
export const fileHash = (file: string): string => createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");

export function historicalInputs(value: unknown, pointer = "$", history: string[] = []): Array<{ q: string; history: string[]; pointer: string; lang?: Language }> {
  if (Array.isArray(value)) return value.flatMap((row, i) => historicalInputs(row, `${pointer}[${i}]`, history));
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  if (typeof row.split === "string" && ["train", "training", "dev", "development", "validation"].includes(row.split)) return [];
  if (Array.isArray(row.turns)) {
    const prior: string[] = [];
    return row.turns.flatMap((turn, i) => {
      const q = typeof turn === "string" ? turn : (turn as Record<string, unknown>).q ?? (turn as Record<string, unknown>).question;
      if (typeof q !== "string") return [];
      const result = { q, history: [...history, ...prior], pointer: `${pointer}.turns[${i}]`, lang: row.lang as Language | undefined };
      prior.push(q); return [result];
    });
  }
  const q = row.q ?? row.question;
  if (typeof q === "string") return [{ q, history, pointer, lang: (row.lang ?? row.language) as Language | undefined }];
  return Object.entries(row).filter(([key]) => !["train", "training", "dev", "development", "validation"].includes(key))
    .flatMap(([key, child]) => historicalInputs(child, `${pointer}.${key}`, history));
}

export function archivedInputs(files: string[], canonical: QualityStory[]): QualityStory[] {
  const seen = new Set(canonical.flatMap(story => story.turns.map((turn, i) => digest([story.lang, story.turns.slice(0, i).map(t => t.q), turn.q]))));
  const stories: QualityStory[] = [];
  for (const file of files.filter(file => /\.jsonl?$/.test(file) && !/(?:train|corpus|parity|seed|examples|cache|labels|key\.json|\/datasets\/qa\/dev\/|(?:^|[/-])dev[/.-])/.test(file))) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    let data: unknown;
    try { data = file.endsWith(".jsonl") ? text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : JSON.parse(text); } catch { continue; }
    for (const row of historicalInputs(data)) {
      const lang = row.lang ?? (/[가-힣]/.test(row.q) ? "ko_KR" : /[一-鿿]/.test(row.q) ? "zh_CN" : "en_US");
      if (seen.has(digest([lang, row.history, row.q]))) continue;
      stories.push({ id: "", suites: ["manual-archive"], lang, split: "archive", manual: true,
        sources: [{ file, row: row.pointer }], turns: [...row.history.map(q => ({ q, expected: {} })), { q: row.q, expected: {} }] });
    }
  }
  return mergeStories(stories);
}

export function retiredFiles(root = ROOT): Array<{ file: string; lastChange: string; recovery: string }> {
  const recovered = new Set((JSON.parse(fs.readFileSync(path.join(root, WORKFLOW, "datasets/archive/retired/sources.json"), "utf8")) as Array<{ original: string }>).map(row => row.original));
  // Unmerged branches can contain active experiments absent from this checkout.
  const history = execFileSync("git", ["log", "HEAD", "--format=%H", "--name-only", "--", "research", "scripts/llm", "tests", "e2e"], { cwd: root, encoding: "utf8", maxBuffer: 10_000_000 });
  const missing = new Map<string, string>();
  let commit = "";
  for (const line of history.split("\n")) {
    if (/^[0-9a-f]{40}$/.test(line)) commit = line;
    else if (line && !line.split("/").some(part => part.startsWith(".") || part === "__pycache__" || part === "node_modules")
      && !fs.existsSync(path.join(root, line)) && !missing.has(line)) missing.set(line, commit);
  }
  return [...missing].map(([file, lastChange]) => ({ file, lastChange,
    recovery: recovered.has(file) ? "datasets/archive/retired; historical contract needs current-patch review"
      : "archive by commit; replaced runner/results are not current gold" }));
}
