import fs from "node:fs/promises";

export type ResearchLocale = "en_US" | "ko_KR";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

export async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function run(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => run()));
  return results;
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "");
}

export function descriptionBody(value: string, locale: ResearchLocale): string {
  const metadataPattern = locale === "ko_KR"
    ? /^\s*(소모값|마나|비용|재사용 대기시간|스킬 소모|스킬 재사용)/i
    : /^\s*(cost|mana|cooldown|resource)/i;
  return stripHtml(value)
    .split("\n")
    .filter((line) => !metadataPattern.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedWords(value: string): Set<string> {
  const normalized = value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .trim();
  return new Set(normalized ? normalized.split(/\s+/) : []);
}

export function jaccard(left: string, right: string): number {
  const a = normalizedWords(left);
  const b = normalizedWords(right);
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

function numericSignature(value: string): string[] {
  return [...value.matchAll(/-?\d+(?:\.\d+)?%?/g)].map((match) => {
    const numeric = Number.parseFloat(match[0]);
    return String(Number.isFinite(numeric) ? numeric : match[0]);
  });
}

export function containsResolvedValue(
  lolpsBody: string,
  resolved: string | null
): boolean {
  if (!resolved) return false;
  const expected = numericSignature(resolved);
  const actual = new Set(numericSignature(lolpsBody));
  return expected.length > 0 && expected.every((value) => actual.has(value));
}

export function countBy<T>(
  values: T[],
  keyOf: (value: T) => string
): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
}

export function formatRows(rows: Array<Array<string | number>>): string {
  return rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
}
