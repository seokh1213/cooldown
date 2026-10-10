import { existsSync,readFileSync,writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ChampionCard } from "../../../../src/domain/knowledge/cards/contracts";
import type { ComboGuideFile } from "../../../../src/domain/knowledge/notes/comboGuide";
import type { NumericChampion } from "../../patch-notes/sourceTypes";
import { resolvePatchVersion } from "../lib/data";
import { abilityTextHash,comboHash,comboSource,type ComboBaseline } from "./comboReview";

export function backfillComboDependencies(root = process.cwd()) {
  const baselineFile = path.join(root, "dev/data/knowledge/combo-baseline.json");
  if (existsSync(baselineFile)) throw new Error("Combo baseline already exists; backfill cannot approve new source changes");
  const patch = resolvePatchVersion();
  const file = path.join(root, "dev/data/knowledge/combo-guides.json");
  const guides = JSON.parse(readFileSync(file, "utf8")) as ComboGuideFile;
  const cards = (JSON.parse(readFileSync(path.join(root, `public/data/${patch}/llm/champion-cards-ko_KR.json`), "utf8")) as { cards: ChampionCard[] }).cards;
  const baseline: ComboBaseline = { schemaVersion: 1, patch, sources: {}, noteHashes: {} };
  const numeric = JSON.parse(readFileSync(path.join(root, `dev/data/patch-notes/sources/${patch}.json`), "utf8")) as Record<string, NumericChampion>;
  for (const guide of guides.champions) {
    const card = cards.find(card => card.id === guide.champion);
    if (!card || abilityTextHash(card) !== guide.abilityTextHash) throw new Error(`Review source before backfill: ${guide.champion}`);
    if (!numeric[card.id]) throw new Error(`Missing combo numeric source: ${card.id}`);
    const source = comboSource(card, numeric[card.id]);
    baseline.sources[guide.champion] = { hash: comboHash(source), card: source };
    for (const pattern of guide.patterns) {
      pattern.dependencies = { slots: card.spells.map(spell => spell.slot), damageNumbers: guide.champion === "Ambessa" ? "independent" : "review",
        ...(guide.champion === "Ambessa" ? { damageSourceKeys: [
          `spells/${numeric.Ambessa.passive}/calculations//Calc_OnHit_Damage_Flat/mFormulaParts/0/mEndValue`,
          `spells/${numeric.Ambessa.passive}/calculations//Calc_OnHit_Damage_Flat/mFormulaParts/1/mCoefficient`,
        ] } : {}),
        basis: guide.champion === "Ambessa"
          ? "26.20 공식 패치·두 콤보 대조: 대시, 강화 평타 충전, Q2 적중 조건과 순서만 참조하며 피해 수치를 전제하지 않음."
          : "기존 승인 노트의 보수적 백필. 패시브와 모든 스킬을 포함하며 수치 변경 자동 승인은 하지 않음." };
      baseline.noteHashes[pattern.id] = comboHash(pattern);
    }
    if (guide.laning) baseline.noteHashes[`${guide.champion.toLowerCase()}-web-laning`] = comboHash({
      id: `${guide.champion.toLowerCase()}-web-laning`, ...guide.laning });
  }
  guides.schemaVersion = 2;
  writeFileSync(baselineFile, `${JSON.stringify(baseline)}\n`);
  writeFileSync(file, `${JSON.stringify(guides, null, 2)}\n`);
  return { champions: guides.champions.length, combos: guides.champions.reduce((n, guide) => n + guide.patterns.length, 0), patch };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(backfillComboDependencies());
