/** 알아본 능력치와 자료에 있는 능력치는 다르다. 없는 수치를 챔피언 오타나 운용 노트로 대신하지 않는다. */
import type { Language } from "@/i18n";
import { aliasAt } from "@/lib/knowledge/searchAliases";
import { buildItemCard } from "./context";
import type { AnswerPlan, PlanContext } from "./planTypes";
import type { ResolvedQuestion } from "./resolvedQuestion";

interface UnavailableStat {
  names: Record<Language, string>;
  aliases: string[];
}
const STATS: UnavailableStat[] = [
  { names: { ko_KR: "마나 재생", en_US: "Mana regeneration", zh_CN: "法力回复" },
    aliases: ["마젠", "마나 재생", "마나재생", "마나 회복", "마나회복", "mana regen", "mp5", "法力回复"] },
  { names: { ko_KR: "주문력", en_US: "Ability power", zh_CN: "法术强度" },
    aliases: ["AP", "주문력", "ability power", "法术强度"] },
  { names: { ko_KR: "생명력 흡수", en_US: "Life steal", zh_CN: "生命偷取" },
    aliases: ["피흡", "흡혈", "생명력 흡수", "생명력흡수", "life steal", "lifesteal", "生命偷取"] },
  { names: { ko_KR: "모든 피해 흡혈", en_US: "Omnivamp", zh_CN: "全能吸血" },
    aliases: ["모든 피해 흡혈", "모든피해흡혈", "옴니뱀프", "omnivamp", "全能吸血"] },
];

function findStat(question: string): UnavailableStat | undefined {
  // 긴 명칭부터 읽어 '모든 피해 흡혈'을 일반 흡혈로 줄이지 않는다.
  return STATS.map(stat => ({ stat, length: Math.max(0, ...stat.aliases.filter(alias => aliasAt(question, alias) >= 0).map(alias => alias.length)) }))
    .filter(hit => hit.length > 0).sort((a, b) => b.length - a.length)[0]?.stat;
}

export function unavailableStatName(question: string): string | undefined {
  return findStat(question)?.names.ko_KR;
}

const QUALIFIED = /아이템|템|빌드|추천|룬|스킬|패시브|궁|계수|상대|공략|어떻게|쿨|사거리|피해량|소모|\b(?:items?|build|runes?|skills?|passive|ult|ratio|cooldown|range|cost|damage|recommend|counter|how)\b|装备|符文|技能|被动|推荐|怎么/i;

/** 스킬·아이템·운용 질문은 기존 자료 경로로 보낸다. 기본 수치 조회에만 범위를 알린다. */
export function unavailableStatPlan(resolved: ResolvedQuestion, ctx: PlanContext): AnswerPlan | undefined {
  if (!ctx.data || resolved.slot || QUALIFIED.test(resolved.text) || buildItemCard(ctx.data, resolved.text)) return undefined;
  const stat = findStat(resolved.text);
  if (!stat) return undefined;
  const name = stat.names[ctx.lang];
  const text = ctx.lang === "ko_KR" ? `${name} 항목은 알아봤지만, 현재 챔피언 기본 능력치 자료에 해당 수치가 없습니다. 아이템·스킬에 따른 값도 계산하지 않습니다.`
    : ctx.lang === "en_US" ? `I recognized ${name}, but its value is not in the current base champion stats. Item and ability contributions are not calculated.`
      : `已识别${name}，但当前英雄基础属性资料没有该数值，也不计算装备和技能的加成。`;
  return { type: "code", answer: { kind: "text", text } };
}
