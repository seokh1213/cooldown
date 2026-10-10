import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import type { ChampionCard } from "../../../src/domain/knowledge/facts";
import type { ComboGuideFile } from "../../../src/domain/knowledge/comboGuide";
import { abilityTextHash, comboHash, comboSource, validateComboBaseline, type ComboBaseline } from "./lib/comboReview";
import { resolvePatchVersion } from "./lib/data";
import type { NumericChampion } from "../patch-notes/sourceTypes";

export function approveComboChampion(options: {
  guides: ComboGuideFile; baseline: ComboBaseline; cards: ChampionCard[];
  champion: string; patch: string; reason: string; reviewedAt: string;
  numericSources?: Record<string, NumericChampion>;
}) {
  const { guides, baseline, cards, champion, patch, reason, reviewedAt } = options;
  if (!reason.trim() || !/^\d+\.\d+$/.test(patch)) throw new Error("Explicit review reason and patch are required");
  validateComboBaseline(guides, baseline);
  const next = structuredClone({ guides, baseline });
  const guide = next.guides.champions.find(guide => guide.champion === champion);
  const card = cards.find(card => card.id === champion);
  if (!guide || !card) throw new Error(`Unknown combo champion: ${champion}`);
  if (baseline.sources[champion].card.numeric && !options.numericSources?.[champion]) throw new Error(`Missing combo numeric source: ${champion}`);
  const source = comboSource(card, options.numericSources?.[champion]);
  next.baseline.sources[champion] = { hash: comboHash(source), card: source };
  guide.abilityTextHash = abilityTextHash(card);
  guide.verifiedPatch = patch;
  guide.reviewedAt = reviewedAt;
  for (const pattern of guide.patterns) next.baseline.noteHashes[pattern.id] = comboHash(pattern);
  if (guide.laning) {
    const id = `${champion.toLowerCase()}-web-laning`;
    next.baseline.noteHashes[id] = comboHash({ id, ...guide.laning });
  }
  validateComboBaseline(next.guides, next.baseline);
  return { ...next, receipt: { champion, patch, reason, reviewedAt,
    previousSourceHash: baseline.sources[champion].hash, sourceHash: comboHash(source),
    noteIds: [...guide.patterns.map(pattern => pattern.id), ...(guide.laning ? [`${champion.toLowerCase()}-web-laning`] : [])] } };
}

function main() {
  const { values } = parseArgs({ options: { champion: { type: "string" }, reason: { type: "string" } } });
  if (!values.champion || !values.reason) throw new Error("Pass --champion <id> --reason <source review basis>; review every combo and laning note for this champion first");
  const patch = resolvePatchVersion();
  const guides = JSON.parse(readFileSync("dev/data/knowledge/combo-guides.json", "utf8")) as ComboGuideFile;
  const baseline = JSON.parse(readFileSync("dev/data/knowledge/combo-baseline.json", "utf8")) as ComboBaseline;
  const cards = (JSON.parse(readFileSync(`public/data/${patch}/llm/champion-cards-ko_KR.json`, "utf8")) as { cards: ChampionCard[] }).cards;
  const approved = approveComboChampion({ guides, baseline, cards, champion: values.champion, reason: values.reason, patch,
    numericSources: JSON.parse(readFileSync(`dev/data/patch-notes/sources/${patch}.json`, "utf8")) as Record<string, NumericChampion>,
    reviewedAt: new Date().toISOString().slice(0, 10) });
  const auditFile = "dev/data/knowledge/combo-review-ledger.json";
  const ledger = JSON.parse(readFileSync(auditFile, "utf8")) as { reviews: Array<typeof approved.receipt> };
  ledger.reviews.push(approved.receipt);
  const versionFile = "dev/data/knowledge/note-versions.json";
  const versions = JSON.parse(readFileSync(versionFile, "utf8")) as { files: Array<{ path: string; sourceHash: string }> };
  const version = versions.files.find(row => row.path === "dev/data/knowledge/combo-guides.json");
  if (!version) throw new Error("Missing combo note version index");
  const guideText = `${JSON.stringify(approved.guides, null, 2)}\n`;
  version.sourceHash = createHash("sha256").update(guideText).digest("hex");
  writeFileSync("dev/data/knowledge/combo-baseline.json", `${JSON.stringify(approved.baseline)}\n`);
  writeFileSync("dev/data/knowledge/combo-guides.json", guideText);
  writeFileSync(auditFile, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(versionFile, `${JSON.stringify(versions, null, 2)}\n`);
  console.log(JSON.stringify(approved.receipt));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
