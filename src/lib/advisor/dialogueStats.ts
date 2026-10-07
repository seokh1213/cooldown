/** 능력치의 항목·대상·레벨을 독립적으로 갱신하고 실제 카드 값으로 답한다. */
import type { ChampionCard, StatName } from "@/lib/knowledge/facts";
import { buildCompareAnswer } from "./answer";
import { buildItemCard, detectSlot } from "./context";
import { askedRules } from "./questionDocs";
import { findGameMeta } from "./gameMeta";
import { asksMatchupHelp } from "./askWords";
import { isBasicAttackMechanicQuestion } from "./basicAttackQuestion";
import type { AnswerPlan, PlanContext } from "./planTypes";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { DialogueMemory } from "./dialogueState";
import { asksAllStats, detectStats, excludedStats, statFields, validStatFields, explicitStatLevel, isStatLevel, type ChampionStatQuery } from "./statQuery";
import { addsSelection } from "./selectionWords";
import { statTargets } from "./dialogueStatSelection";
import { correctNames } from "./championNames";
import { championFreeText, resolveQuestion } from "./resolvedQuestion";
import { CROWD_CONTROL } from "@/lib/knowledge/crowdControl";
import { questionState } from "./mechanics/question";

const OTHER_QUERY = /스킬|패시브|궁(?=[\s을은이의으로에만도]|$)|쿨|사거리|피해량|계수|(?<!얼)마나|소모|아이템|룬|회복\s*물약|가속|랭크|(?<![A-Za-z])[PQWER](?![A-Za-z])|\b(?:ability|abilities|skill|passive|ult|cooldown|range|ratio|mana|item|rune|haste|rank)\b|技能|被动|冷却|射程|法力|装备|符文/i;
const ADVICE = /상대법|상대할|카운터|싸우|싸워|교환|진입|템|빌드|추천|올려|사면|사야|맞춰|무빙\s*팁|어떻게\s*(?:싸|버|이|피|굴)|\b(?:counter|fight|engage|build|recommend|buy)\b|how.*\b(?:survive|play|respond|deal with)\b|怎么打|出装|出护甲|出魔抗|推荐/i;
const HEALING = /회복량|재생량|\b(?:regen|regeneration|recovery)\b|回复量|恢复量/i;
const STAT_CONTEXT = /스탯|능력치|기본|스킬\s*말고|패시브\s*말고|\b(?:base|stats?)\b|基础|属性/i;
type StatResolution = ChampionStatQuery | { kind: "unsupportedStatLevel"; level: number } | { kind: "emptyStatSelection" };

export function isBaseStatQuestion(resolved: ResolvedQuestion): boolean {
  const question = championFreeText(resolved).replace(/(?:스킬|패시브)\s*말고/g, "");
  const lower = question.toLowerCase();
  const withoutLevel = question.replace(/\d+\s*(?:레벨|렙|level|lv\.?|급|级)|(?:level|lv\.?)\s*\d+/gi, "");
  const quantities = questionState(withoutLevel);
  if (quantities.amount || quantities.invalidAmount || quantities.followupStatus || quantities.hitCount !== undefined) return false;
  if (Object.values(CROWD_CONTROL).some(control => control.labels.some(label => lower.includes(label.split("(")[0].trim().toLowerCase())))) return false;
  if (/평타|기본\s*공격(?!력)|\bbasic\s*attack\b|普攻/i.test(question) && !detectStats(question).length) return false;
  if (resolved.requestIntent?.scope === "skills" && !detectStats(question).length) return false;
  return !resolved.matchup && !detectSlot(question) && !OTHER_QUERY.test(question) && !ADVICE.test(question)
    && !asksMatchupHelp(question) && !isBasicAttackMechanicQuestion(question)
    && !/뜻|원리|메커니즘|적용|관통|치명|한타|피해|전환|변환|치환|바뀌|바뀜|초과|한계|제한|meaning|mechanic|penetration|lethality|convert|\bcap\b|limit|how.*work|原理|是什么|穿透|暴击|转换|转化|上限/i.test(question);
}

/** 이름만 줄이거나 레벨만 바꾼 후속 질문에도 나머지 조회 조건을 보존한다. */
export function resolveStatQuery(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext, inferredField?: StatName): StatResolution | undefined {
  if (asksAllStats(resolved.text)) return undefined;
  const question = championFreeText(resolved).replace(/(?:스킬|패시브)\s*말고/g, "");
  if (resolved.requestIntent?.scope === "overview" && /소개|프로필|개요|챔피언.{0,8}대해|profile|overview|基本资料/i.test(question)) return undefined;
  if (!ctx.data || !isBaseStatQuestion(resolved)) return undefined;
  if (!STAT_CONTEXT.test(question) && /추가\s*체력|비축|회복(?:돼|되|해)|받으면|충족|충전|bonus health|stored health|recover|额外生命|储存|恢复/i.test(question)) return undefined;
  const corrected = correctNames(resolved.text, ctx.data);
  const selection = corrected.changes.length ? resolveQuestion(corrected.text, ctx.data) : resolved;
  const cards = statTargets(selection, memory, ctx);
  if (cards.some(card => card.spells.some(spell => spell.name.length > 1 && question.includes(spell.name)))) return undefined;
  if (buildItemCard(ctx.data, question) || findGameMeta(question)
    || askedRules(ctx.data, question).some(rule => rule.subject !== "gameplay")) return undefined;
  const continuing = memory.active === "stat" || Boolean(memory.stat) && memory.active === "compare";
  if (HEALING.test(question) && !continuing && !STAT_CONTEXT.test(question) && !detectStats(question).length) return undefined;
  const level = explicitStatLevel(question);
  const healingStat = HEALING.test(question) && (continuing || STAT_CONTEXT.test(question));
  const excluded = excludedStats(question);
  let fields = inferredField ? [inferredField] : detectStats(question);
  if (!fields.length && /정보|특징|소개|\b(?:profile|overview|introduce)\b|介绍/i.test(question)) return undefined;
  if (!fields.length && healingStat) fields = ["healthRegen"];
  if (continuing && memory.stat && addsSelection(question)) fields = [...new Set([...statFields(memory.stat), ...fields])];
  if (!fields.length && continuing && memory.stat && (level !== undefined || resolved.champions.length || excluded.length)) fields = statFields(memory.stat);
  fields = fields.filter(field => !excluded.includes(field));
  if (continuing && memory.stat && (!cards.length || !fields.length) && (excluded.length || resolved.champions.length)) return { kind: "emptyStatSelection" };
  const field = fields[0];
  if (!field || !cards.length) return undefined;
  // 회복 효과/치유 여부는 스킬 질문이다. 기본 능력치 맥락에서만 재생 수치로 해석한다.
  if (field === "healthRegen" && !continuing && !STAT_CONTEXT.test(question) && /스킬|패시브|효과|있어|있나|있니|\b(?:heal|effect)\b/i.test(question)) return undefined;
  if (level !== undefined && !isStatLevel(level)) return { kind: "unsupportedStatLevel", level };
  return { kind: "championStat", champions: cards.map(card => card.id), field, ...(fields.length > 1 ? { fields } : {}),
    level: level ?? (continuing ? memory.stat?.level : undefined) ?? 1 };
}

export function dialogueStatPlan(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): AnswerPlan | undefined {
  const query = resolveStatQuery(resolved, memory, ctx);
  if (!query || !ctx.data) return undefined;
  if (query.kind === "emptyStatSelection") {
    const text = ctx.lang === "ko_KR" ? "조회할 대상이나 항목이 남지 않았어요. 예: ‘오공 체력’, ‘아리 마저’처럼 다시 알려 주세요."
      : ctx.lang === "en_US" ? "No targets or stats remain. Try ‘Wukong health’ or ‘Ahri magic resist’."
        : "没有剩余的英雄或属性，请重新指定，例如‘孙悟空生命值’。";
    return { type: "code", answer: { kind: "text", text } };
  }
  if (query.kind === "unsupportedStatLevel") {
    return unsupportedStatLevelPlan(query.level, ctx);
  }
  return statPlanForQuery(query, resolved, ctx);
}

export function unsupportedStatLevelPlan(level: number, ctx: PlanContext): AnswerPlan {
  const text = ctx.lang === "ko_KR" ? `${level}레벨 능력치는 현재 자료에 없습니다. 1·6·11·18레벨 값을 조회할 수 있습니다.`
    : ctx.lang === "en_US" ? `Level ${level} stats are not in the current data. Available levels: 1, 6, 11, 18.`
      : `当前资料没有${level}级属性。可查询等级：1、6、11、18。`;
  return { type: "code", answer: { kind: "text", text } };
}

/** 검증한 조회를 기존 카드와 문장으로 조립한다. 실험 판정도 같은 경로를 사용한다. */
export function statPlanForQuery(query: ChampionStatQuery, resolved: ResolvedQuestion, ctx: PlanContext): AnswerPlan | undefined {
  if (!ctx.data || !isStatLevel(query.level) || !validStatFields(query) || !query.champions.length) return undefined;
  const cards = query.champions.map(id => ctx.data!.cardById.get(id));
  const present = cards.filter((card): card is ChampionCard => Boolean(card));
  if (present.length !== query.champions.length) return undefined;
  const answer = buildCompareAnswer(present, resolved.text, undefined, { lang: ctx.lang, statQuery: query });
  if (answer.kind !== "compare") return undefined;
  const hit = answer.rows.find(row => row.hit);
  if (present.length > 1 || statFields(query).length > 1) return { type: "card", answer };
  return { type: "card", answer: { kind: "champion", card: present[0], statQuery: query,
    headline: { label: `${present[0].name} ${answer.headline?.label ?? hit?.label ?? ""}`, value: hit?.values[0] || "—" } } };
}
