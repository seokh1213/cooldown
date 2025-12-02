import type { Language } from "@/i18n";
import { getTranslations } from "@/i18n";

// 기본 스탯 필드 (중요한 것들만)
export function getStatFields(lang: Language = "ko_KR") {
  const t = getTranslations(lang);
  return [
    { key: "hp", label: t.stats.health, format: (v: number) => Math.round(v) },
    { key: "hpperlevel", label: t.stats.healthPerLevel, format: (v: number) => v.toFixed(1) },
    { key: "mp", label: t.stats.mana, format: (v: number) => Math.round(v) },
    { key: "mpperlevel", label: t.stats.manaPerLevel, format: (v: number) => v.toFixed(1) },
    { key: "movespeed", label: t.stats.movespeed, format: (v: number) => Math.round(v) },
    { key: "armor", label: t.stats.armor, format: (v: number) => Math.round(v) },
    { key: "armorperlevel", label: t.stats.armorPerLevel, format: (v: number) => v.toFixed(1) },
    { key: "spellblock", label: t.stats.spellblock, format: (v: number) => Math.round(v) },
    { key: "spellblockperlevel", label: t.stats.spellblockPerLevel, format: (v: number) => v.toFixed(1) },
    { key: "attackdamage", label: t.stats.attackdamage, format: (v: number) => Math.round(v) },
    { key: "attackdamageperlevel", label: t.stats.attackdamagePerLevel, format: (v: number) => v.toFixed(1) },
    { key: "attackspeed", label: t.stats.attackspeed, format: (v: number) => v.toFixed(3) },
    { key: "attackspeedperlevel", label: t.stats.attackspeedPerLevel, format: (v: number) => `${(v * 100).toFixed(1)}%` },
    { key: "attackrange", label: t.stats.attackrange, format: (v: number) => Math.round(v) },
    { key: "crit", label: t.stats.crit, format: (v: number) => `${(v * 100).toFixed(1)}%` },
    { key: "critperlevel", label: t.stats.critPerLevel, format: (v: number) => `${(v * 100).toFixed(1)}%` },
    { key: "hpregen", label: t.stats.hpregen, format: (v: number) => v.toFixed(1) },
    { key: "hpregenperlevel", label: t.stats.hpregenPerLevel, format: (v: number) => v.toFixed(1) },
    { key: "mpregen", label: t.stats.mpregen, format: (v: number) => v.toFixed(1) },
    { key: "mpregenperlevel", label: t.stats.mpregenPerLevel, format: (v: number) => v.toFixed(1) },
  ] as const;
}

export const SKILL_LETTERS = ["Q", "W", "E", "R"] as const;

