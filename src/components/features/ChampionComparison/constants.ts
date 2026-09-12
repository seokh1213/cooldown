import type { Language } from "@/i18n";
import { getTranslations } from "@/i18n";

export interface StatField {
  key: string;
  label: string;
  format: (value: number) => string;
  growthKey?: string;
  growthFormat?: (value: number) => string;
}

export function getStatFields(lang: Language = "ko_KR"): StatField[] {
  const t = getTranslations(lang);
  const number = new Intl.NumberFormat(lang.replace("_", "-"), { maximumFractionDigits: 3 }).format;
  const percent = (value: number) => number(value) + "%";
  return [
    { key: "hp", growthKey: "hpperlevel", label: t.stats.health, format: number },
    { key: "mp", growthKey: "mpperlevel", label: t.stats.mana, format: number },
    { key: "movespeed", label: t.stats.movespeed, format: number },
    { key: "armor", growthKey: "armorperlevel", label: t.stats.armor, format: number },
    { key: "spellblock", growthKey: "spellblockperlevel", label: t.stats.spellblock, format: number },
    { key: "attackdamage", growthKey: "attackdamageperlevel", label: t.stats.attackdamage, format: number },
    // Data Dragon stores attack-speed growth in percentage points already.
    { key: "attackspeed", growthKey: "attackspeedperlevel", label: t.stats.attackspeed, format: number, growthFormat: percent },
    { key: "attackrange", label: t.stats.attackrange, format: number },
    { key: "crit", growthKey: "critperlevel", label: t.stats.crit, format: percent },
    { key: "hpregen", growthKey: "hpregenperlevel", label: t.stats.hpregen, format: number },
    { key: "mpregen", growthKey: "mpregenperlevel", label: t.stats.mpregen, format: number },
  ];
}

export const SKILL_LETTERS = ["Q", "W", "E", "R"] as const;
