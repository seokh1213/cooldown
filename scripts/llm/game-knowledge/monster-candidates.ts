import fs from "node:fs/promises";
import path from "node:path";
import { sha256, type Snapshot } from "./sources";

const FIELDS = ["baseHPModifiable", "hpPerLevelModifiable", "baseDamageModifiable", "damagePerLevelModifiable",
  "baseArmorModifiable", "armorPerLevelModifiable", "attackSpeedModifiable", "attackRangeModifiable",
  "baseStaticHPRegenModifiable", "baseMoveSpeedModifiable", "goldGivenOnDeath", "globalGoldGivenOnDeath",
  "expGivenOnDeath", "globalExpGivenOnDeath"];

export function monsterCandidate(raw: string, snapshot: Snapshot) {
  const data = JSON.parse(raw) as Record<string, Record<string, unknown>>;
  const roots = Object.entries(data).filter(([key, value]) => key.endsWith("/CharacterRecords/Root") && value.__type === "CharacterRecord");
  if (roots.length !== 1) throw new Error(`Expected one normal CharacterRecord root: ${snapshot.id}`);
  const [rootPath, record] = roots[0];
  const fields = Object.fromEntries(FIELDS.flatMap(field => {
    const raw = record[field];
    const value = typeof raw === "number" ? raw : raw && typeof raw === "object" ? (raw as { baseValue?: unknown }).baseValue : undefined;
    return typeof value === "number" && Number.isFinite(value) ? [[field, Number(value.toFixed(6))]] : [];
  }));
  if (!Object.keys(fields).length) throw new Error(`No recognized monster stats: ${snapshot.id}`);
  return { id: snapshot.id, reviewStatus: "candidate", source: snapshot, rootPath, fields,
    scope: "Client base record. Spawn scripts, growth, form and combat adjustments require review.",
    version: { verifiedThroughPatch: null, lastChangedPatch: null } };
}

export async function writeMonsterCandidates(output: string, snapshots: Snapshot[], root: string) {
  const candidates = [];
  for (const snapshot of snapshots.filter(entry => entry.kind === "cdragon")) {
    const raw = await fs.readFile(path.join(output, "sources", `${sha256(snapshot.id).slice(0, 16)}.txt`), "utf8");
    candidates.push(monsterCandidate(raw, snapshot));
  }
  const authored = await fs.readFile(path.join(root, "knowledge/monster-notes.json"), "utf8").catch(error => {
    if (error.code !== "ENOENT") throw error;
    return '{"sources":{},"entities":[]}';
  });
  const notes = JSON.parse(authored) as {
    sources: Record<string, { hash: string }>; entities: Array<{ id: string; sources: string[]; stats: Record<string, { sources: string[] }>; abilities: Array<{ id: string; sources: string[] }>; buffs?: Array<{ id: string; sources: string[] }> }>;
  };
  const changed = new Set(snapshots.filter(snapshot => notes.sources[snapshot.id] && notes.sources[snapshot.id].hash !== snapshot.hash).map(snapshot => snapshot.id));
  const affected = notes.entities.flatMap(entity => [
    ...Object.entries(entity.stats).map(([field, fact]) => ({ id: `${entity.id}.stats.${field}`, sources: fact.sources })),
    ...entity.abilities.map(fact => ({ id: `${entity.id}.abilities.${fact.id}`, sources: fact.sources })),
    ...(entity.buffs ?? []).map(fact => ({ id: `${entity.id}.buffs.${fact.id}`, sources: fact.sources })),
  ]).filter(fact => fact.sources.some(id => changed.has(id)));
  const report = { schemaVersion: 1, reviewStatus: "detection-only", candidates, approvedSourceChanges: [...changed], affectedFacts: affected };
  await fs.writeFile(path.join(output, "monster-candidates.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
