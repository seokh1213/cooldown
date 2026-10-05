import type { Language } from "@/i18n";
import { translations } from "@/i18n/translations";
import type { ChampionCard } from "@/lib/knowledge/facts";
import { spellSummary } from "./answer";
import { translateRange, translateStat } from "./promptLocale";
import { ALL_CHAMPION_STATS } from "./statQuery";

/** 자료의 기본 수치와 스킬 요약을 빠뜨리지 않고 대화에도 보여준다. */
export function overviewProse(card: ChampionCard, lang: Language): string {
  const words = translations[lang];
  const roles = card.roleTags.map(role => words.championProfile.roleNames[role.toLowerCase()]);
  const header = [card.name, ...roles, translateRange(card.riot?.attackType ?? card.rangeType, lang)].filter(Boolean).join(" · ");
  const lines = ALL_CHAMPION_STATS.flatMap(field => card.stats[field] ? [`- ${translateStat(field, lang)}: ${card.stats[field].lv1}`] : []);
  const statsTitle = lang === "ko_KR" ? "기본 능력치 (1레벨)" : lang === "en_US" ? "Base stats (level 1)" : "基础属性（1级）";
  const skillLines = card.spells.map(spell => `- **${spell.slot} ${spell.name}:** ${spellSummary(spell)}`);
  return [header, `**${statsTitle}**\n${lines.join("\n")}`, `**${words.advisor.card.skills}**\n${skillLines.join("\n")}`].join("\n\n");
}
