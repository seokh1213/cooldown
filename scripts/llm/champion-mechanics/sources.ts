import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChampionDetailV2 } from "../../../src/data/contracts/championData";
import { SCHEMA_VERSION, SLOTS, type Job, type Slot, type SourceDoc } from "./contract";
import { GUIDE } from "./guide";
import { sourceNumbers } from "./numbers";
import { DRAFT_SCHEMA } from "./schema";
import { collectVariants } from "./variants";

interface SpellCard {
  slot: Slot; name: string; summary: string; text: string; crowdControl?: unknown;
}
interface Card {
  id: string; name: string; title: string; roleTags: string[]; wiki?: unknown;
  rangeType: string; attackRange: number; stats: unknown; spells: SpellCard[];
}
interface Cards { patch: string; cards: Card[] }
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const promptHash = () => digest({ version: SCHEMA_VERSION, guide: GUIDE, schema: DRAFT_SCHEMA });
export const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

function makeJob(context: { patch: string; en: Card; ko: Card; detail: ChampionDetailV2; slot: Slot }): Job {
  const { patch, en, ko, detail, slot } = context;
  const english = en.spells.find(spell => spell.slot === slot);
  const korean = ko.spells.find(spell => spell.slot === slot);
  const ability = detail.champion.abilities[slot];
  if (!english || !korean || !ability) throw new Error(`${en.id}.${slot}: source missing`);
  const sources: SourceDoc[] = [
    { id: "en:summary", locale: "en_US", tier: "summary", text: english.summary, variant: null },
    { id: "en:body", locale: "en_US", tier: "tooltip", text: english.text, variant: null },
    { id: "ko:summary", locale: "ko_KR", tier: "summary", text: korean.summary, variant: null },
    { id: "ko:body", locale: "ko_KR", tier: "tooltip", text: korean.text, variant: null },
  ].filter(source => typeof source.text === "string" && source.text.length > 0) as SourceDoc[];
  const variants = collectVariants({ champion: en.id, slot, ability, sources });
  const facts = { name: { en: english.name, ko: korean.name }, cooldownSeconds: ability.cooldownSeconds,
    rechargeSeconds: ability.rechargeSeconds ?? null, maxCharges: ability.maxCharges ?? null,
    range: ability.range, cost: ability.cost ?? null, rankValues: ability.rankValues,
    levelValues: ability.levelValues ?? [], scalings: ability.scalings, simulation: ability.simulation,
    crowdControl: english.crowdControl ?? null, diagnostics: ability.diagnostics,
    forms: (ability.forms ?? []).map(form => ({ ...form, bodyHtml: undefined })),
    provenance: { cards: `public/data/${patch}/llm/champion-cards-{en_US,ko_KR}.json`,
      detail: `public/data/${patch}/champions/en_US/${en.id}.json`, provider: ability.source },
  };
  const slotRole = /no third ability/i.test(english.summary) ? "interface_only" : "ability";
  const content = { champion: en.id, slot, patch, slotRole, sources, variants, facts };
  return { ...content, id: `${en.id}.${slot}`, slotRole, numbers: sourceNumbers(sources),
    sourceHash: digest(content), promptHash: promptHash() };
}

export async function buildInventory(root: string) {
  const { patchVersion: patch } = await readJson<{ patchVersion: string }>(path.join(root, "public/data/version.json"));
  const base = path.join(root, "public/data", patch);
  const [english, korean] = await Promise.all([
    readJson<Cards>(path.join(base, "llm/champion-cards-en_US.json")),
    readJson<Cards>(path.join(base, "llm/champion-cards-ko_KR.json")),
  ]);
  if (english.patch !== patch || korean.patch !== patch) throw new Error("Card patch mismatch");
  const jobs: Job[] = [];
  const overview: Array<Record<string, unknown>> = [];
  for (const en of english.cards) {
    const ko = korean.cards.find(card => card.id === en.id);
    if (!ko) throw new Error(`${en.id}: Korean card missing`);
    const detail = await readJson<ChampionDetailV2>(path.join(base, "champions/en_US", `${en.id}.json`));
    if (detail.patchVersion !== patch) throw new Error(`${en.id}: detail patch mismatch`);
    const content = { id: `${en.id}.common`, champion: en.id, slot: "common", patch,
      name: { en: en.name, ko: ko.name }, title: { en: en.title, ko: ko.title }, roles: en.roleTags,
      wiki: en.wiki ?? null, rangeType: en.rangeType, attackRange: en.attackRange, stats: en.stats,
      baseStats: detail.champion.baseStats, abilityIds: SLOTS.map(slot => `${en.id}.${slot}`) };
    overview.push({ ...content, schemaVersion: SCHEMA_VERSION, sourceHash: digest(content), status: "copied", author: "code" });
    for (const slot of SLOTS) jobs.push(makeJob({ patch, en, ko, detail, slot }));
  }
  const ids = new Set(jobs.map(job => job.id));
  if (ids.size !== jobs.length) throw new Error("Duplicate ability IDs");
  return { patch, jobs, overview };
}
