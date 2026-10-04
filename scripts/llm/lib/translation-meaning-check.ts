import * as path from "node:path";

type MeaningVerdict = Record<string, boolean>;

/** Unchecked translations must stay in an explicit store outside live data. */
export function requireStagingStore(checker: string, store: string | undefined): void {
  if (checker !== "none") return;
  if (!store) throw new Error("--checker none은 명시적인 staging --store가 필요합니다.");
  const resolved = path.resolve(store);
  for (const root of ["knowledge", "public"]) {
    const relative = path.relative(path.resolve(root), resolved);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
      throw new Error("--checker none은 knowledge/public 밖의 staging --store에만 저장할 수 있습니다.");
    }
  }
}

function parseVerdict(text: string): MeaningVerdict | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    return start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) as MeaningVerdict : undefined;
  } catch {
    return undefined;
  }
}

/** The caller supplies only candidates that already passed structural checks. */
export async function translationMeaningVerdict(
  checker: string,
  candidateCount: number,
  runChecker: () => Promise<string>,
): Promise<MeaningVerdict | undefined> {
  if (!candidateCount) return {};
  if (checker === "none") {
    return Object.fromEntries(Array.from({ length: candidateCount }, (_, index) => [String(index), true]));
  }
  // Retry unreadable replies once; execution errors still propagate immediately.
  return parseVerdict(await runChecker()) ?? parseVerdict(await runChecker());
}
