import type { ChampionPassive, ChampionSpell } from "../types";
import type { AbilitySlot } from "./championData";
import type { DataLocale, StaticDataSources } from "./staticData";

export interface PatchSkillInfo {
  slot: AbilitySlot;
  skill?: ChampionSpell;
  passive?: ChampionPassive;
  icons?: PatchSkillIcon[];
}

export interface PatchSkillIcon {
  file: string;
  spellId: string;
}

export interface PatchSkillArchive {
  schemaVersion: 1;
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
  champions: Record<string, Record<string, PatchSkillInfo>>;
}

export function patchSkillKey(section: string, title: string): string {
  return `${section}:${title}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function decodePatchSkillArchive(value: unknown, identity: {
  patchVersion: string; sources: StaticDataSources; locale: DataLocale;
}): PatchSkillArchive {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.patchVersion !== identity.patchVersion ||
    value.locale !== identity.locale || !isRecord(value.sources) ||
    value.sources.ddragon !== identity.sources.ddragon || value.sources.cdragon !== identity.sources.cdragon ||
    !isRecord(value.champions)) throw new Error("Invalid patch skill archive identity");
  for (const skills of Object.values(value.champions)) {
    if (!isRecord(skills)) throw new Error("Invalid patch champion skills");
    for (const info of Object.values(skills)) {
      if (!isRecord(info) || !["P", "Q", "W", "E", "R"].includes(String(info.slot))) throw new Error("Invalid patch skill slot");
      if (info.icons !== undefined && (!Array.isArray(info.icons) || !info.icons.every(icon =>
        isRecord(icon) && typeof icon.spellId === "string" &&
        typeof icon.file === "string" && /^patch-notes\/icons\/[a-f0-9]{32}\.webp$/.test(icon.file)))) {
        throw new Error("Invalid patch skill icons");
      }
      if (info.slot === "P") {
        if (!isRecord(info.passive) || !isRecord(info.passive.image) || typeof info.passive.image.full !== "string") {
          throw new Error("Invalid patch passive");
        }
      } else if (!isRecord(info.skill) || typeof info.skill.id !== "string" ||
        !Array.isArray(info.skill.cooldown) || !info.skill.cooldown.every(n => typeof n === "number" && Number.isFinite(n))) {
        throw new Error("Invalid patch active skill");
      }
    }
  }
  return value as unknown as PatchSkillArchive;
}
