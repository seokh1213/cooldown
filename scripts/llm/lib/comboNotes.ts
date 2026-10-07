/** 웹에서 확인하고 편집한 콤보를 기존 플레이북 형식으로 묶는다. */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "../../../src/lib/knowledge/facts";
import type { ComboGuideFile } from "../../../src/lib/knowledge/comboGuide";
import { renderComboPattern } from "../../../src/lib/knowledge/comboGuide";
import type { PlaybookEntry } from "../../../src/lib/knowledge/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./data";
import { reviewCombos, type ComboBaseline, type ComboReview } from "./comboReview";
import type { NumericChampion } from "../../patch-notes/sourceTypes";
export { abilityTextHash } from "./comboReview";

export function loadComboCompilation() {
  const root = process.cwd();
  const file = path.join(root, "knowledge", "combo-guides.json");
  if (!fs.existsSync(file)) return { notes: new Map<string, PlaybookEntry[]>(), reviews: [] as ComboReview[] };
  const guides = JSON.parse(fs.readFileSync(file, "utf8")) as ComboGuideFile;
  if (![1, 2].includes(guides.schemaVersion)) throw new Error("지원하지 않는 콤보 노트 형식");
  const cardFile = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm", "champion-cards-ko_KR.json");
  const cards = (JSON.parse(fs.readFileSync(cardFile, "utf8")) as { cards: ChampionCard[] }).cards;
  const baseline = guides.schemaVersion === 2
    ? JSON.parse(fs.readFileSync(path.join(root, "knowledge", "combo-baseline.json"), "utf8")) as ComboBaseline : undefined;
  const numericFile = path.join(root, "data/patch-notes/sources", `${resolvePatchVersion()}.json`);
  const numericSources = fs.existsSync(numericFile) ? JSON.parse(fs.readFileSync(numericFile, "utf8")) as Record<string, NumericChampion> : undefined;
  const reviews = reviewCombos({ guides, cards, baseline, numericSources, patch: resolvePatchVersion() });
  return { notes: compileComboNotes(guides, cards, { baseline, numericSources, reviews }), reviews };
}

export function loadComboNotes(): Map<string, PlaybookEntry[]> { return loadComboCompilation().notes; }

export function compileComboNotes(guides: ComboGuideFile, cards: ChampionCard[], options: {
  baseline?: ComboBaseline; patch?: string; reviews?: ComboReview[]; numericSources?: Record<string, NumericChampion>;
} = {}): Map<string, PlaybookEntry[]> {
  const reviews = options.reviews ?? reviewCombos({ guides, cards, baseline: options.baseline, numericSources: options.numericSources,
    patch: options.patch ?? options.baseline?.patch ?? guides.patch });
  const byId = new Map(reviews.map(review => [review.id, review]));
  const notes = new Map<string, PlaybookEntry[]>();
  for (const guide of guides.champions) {
    const verifiedPatch = guide.verifiedPatch ?? guides.patch;
    const entries: PlaybookEntry[] = guide.patterns.map(pattern => ({
      id: pattern.id, category: "combo", text: renderComboPattern(pattern), combo: pattern,
      source: pattern.sourceUrl, verifiedPatch,
    }));
    if (guide.laning) entries.push({ id: `${guide.champion.toLowerCase()}-web-laning`, category: "laning",
      text: guide.laning.text, source: guide.laning.sourceUrl, verifiedPatch });
    notes.set(guide.champion, entries.filter(entry => byId.get(entry.id!)?.status !== "needs-review").map(entry => {
      const review = byId.get(entry.id!)!;
      return { ...entry, compatibility: { checkedThroughPatch: review.checkedThroughPatch!, reviewedPatch: review.reviewedPatch,
        method: review.status, sourceHash: review.sourceHash! } };
    }));
  }
  return notes;
}
