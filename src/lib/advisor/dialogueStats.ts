/** 능력치의 항목·대상·레벨을 독립적으로 갱신하고 실제 카드 값으로 답한다. */
import type { ChampionCard } from "@/lib/knowledge/facts";
import { buildCompareAnswer } from "./answer";
import { buildItemCard } from "./context";
import { askedRules } from "./questionDocs";
import { findGameMeta } from "./gameMeta";
import { asksMatchupHelp } from "./askWords";
import type { AnswerPlan, PlanContext } from "./planTypes";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { DialogueMemory } from "./dialogueState";
import { detectStat, explicitStatLevel, isStatLevel, STAT_QUERY_TERMS, type ChampionStatQuery } from "./statQuery";

const OTHER_QUERY = /스킬|패시브|궁|쿨|사거리|피해량|계수|마나|소모|아이템|회복\s*물약|가속|랭크|(?<![A-Za-z])[PQWER](?![A-Za-z])|\b(?:ability|abilities|skill|passive|ult|cooldown|range|ratio|mana|item|haste|rank)\b|技能|被动|冷却|射程|法力|装备/i;
const ADVICE = /상대법|상대할|카운터|싸우|싸워|교환|진입|템|빌드|추천|올려|사면|사야|맞춰|어떻게\s*(?:싸|버|이|피|굴)|\b(?:counter|fight|engage|build|recommend|buy)\b|how.*\b(?:survive|play|respond|deal with)\b|怎么打|出装|推荐/i;
const HEALING = /회복량|재생량|\b(?:regen|regeneration|recovery)\b|回复量|恢复量/i;
const STAT_CONTEXT = /스탯|능력치|기본|스킬\s*말고|패시브\s*말고|\b(?:base|stats?)\b|基础|属性/i;
const GROUP = /둘|모두|전부|양쪽|비교|\b(?:both|all|compare)\b|两个|全部|比较/i;
type StatResolution = ChampionStatQuery | { kind: "unsupportedStatLevel"; level: number };

function targets(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): ChampionCard[] {
  const from = (ids: readonly string[]) => ids.map(id => ctx.data!.cardById.get(id)).filter((card): card is ChampionCard => Boolean(card));
  const prior = memory.active === "stat" ? memory.stat?.champions
    : memory.active === "champion" && memory.champion ? [memory.champion]
    : memory.active === "compare" ? memory.compared
      : memory.active === "spell" ? memory.compared ?? (memory.spell ? [memory.spell.champion] : [])
        : memory.active === "matchup" && memory.matchup ? [memory.matchup.mine, memory.matchup.enemy] : undefined;
  if (resolved.champions.length) {
    const ids = resolved.champions.map(card => card.id);
    return ids.length === 1 && GROUP.test(resolved.text) && prior ? from([...new Set([...prior, ...ids])]) : resolved.champions;
  }
  if (memory.matchup && /상대|\benemy\b|对面/i.test(resolved.text)) return from([memory.matchup.enemy]);
  if (memory.matchup && /내\s*(?:스탯|능력치|체력|방어력|공격력)|\bmy\b|我的/i.test(resolved.text)) return from([memory.matchup.mine]);
  return from(prior?.length ? prior : ctx.championIds);
}

/** 이름만 줄이거나 레벨만 바꾼 후속 질문에도 나머지 조회 조건을 보존한다. */
export function resolveStatQuery(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): StatResolution | undefined {
  const question = resolved.text.replace(/(?:스킬|패시브)\s*말고/g, "");
  if (!ctx.data || resolved.matchup || OTHER_QUERY.test(question) || ADVICE.test(question) || asksMatchupHelp(question)) return undefined;
  if (/뜻|원리|메커니즘|적용|meaning|mechanic|how.*work|原理|是什么/i.test(question)) return undefined;
  const cards = targets(resolved, memory, ctx);
  if (!cards.length || cards.some(card => card.spells.some(spell => spell.name.length > 1 && question.includes(spell.name)))) return undefined;
  if (buildItemCard(ctx.data, question) || findGameMeta(question) || askedRules(ctx.data, question).some(rule => rule.subject !== "gameplay")) return undefined;
  const continuing = memory.active === "stat" || memory.active === "compare" && Boolean(memory.stat);
  const level = explicitStatLevel(question);
  const healingStat = HEALING.test(question) && (continuing || STAT_CONTEXT.test(question));
  const field = healingStat ? "healthRegen" : detectStat(question)
    ?? (continuing && (level !== undefined || resolved.champions.length && /만|only|只/i.test(question)) ? memory.stat?.field : undefined);
  if (!field) return undefined;
  // 회복 효과/치유 여부는 스킬 질문이다. 기본 능력치 맥락에서만 재생 수치로 해석한다.
  if (field === "healthRegen" && !continuing && !STAT_CONTEXT.test(question) && /스킬|패시브|효과|있어|있나|있니|\b(?:heal|effect)\b/i.test(question)) return undefined;
  if (level !== undefined && !isStatLevel(level)) return { kind: "unsupportedStatLevel", level };
  return { kind: "championStat", champions: cards.map(card => card.id), field,
    level: level ?? (continuing ? memory.stat?.level : undefined) ?? 1 };
}

export function dialogueStatPlan(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): AnswerPlan | undefined {
  const query = resolveStatQuery(resolved, memory, ctx);
  if (!query || !ctx.data) return undefined;
  if (query.kind === "unsupportedStatLevel") {
    const text = ctx.lang === "ko_KR" ? `${query.level}레벨 능력치는 현재 자료에 없습니다. 1·6·11·18레벨 값을 조회할 수 있습니다.`
      : ctx.lang === "en_US" ? `Level ${query.level} stats are not in the current data. Available levels: 1, 6, 11, 18.`
        : `当前资料没有${query.level}级属性。可查询等级：1、6、11、18。`;
    return { type: "code", answer: { kind: "text", text } };
  }
  return statPlanForQuery(query, resolved, ctx);
}

/** 검증한 조회를 기존 카드와 문장으로 조립한다. 실험 판정도 같은 경로를 사용한다. */
export function statPlanForQuery(query: ChampionStatQuery, resolved: ResolvedQuestion, ctx: PlanContext): AnswerPlan | undefined {
  if (!ctx.data || !isStatLevel(query.level) || !Object.prototype.hasOwnProperty.call(STAT_QUERY_TERMS, query.field) || !query.champions.length) return undefined;
  const cards = query.champions.map(id => ctx.data!.cardById.get(id));
  const present = cards.filter((card): card is ChampionCard => Boolean(card));
  if (present.length !== query.champions.length) return undefined;
  const answer = buildCompareAnswer(present, resolved.text, undefined, { lang: ctx.lang, statQuery: query });
  if (answer.kind !== "compare") return undefined;
  const hit = answer.rows.find(row => row.hit);
  if (present.length > 1) return { type: "card", answer };
  return { type: "card", answer: { kind: "champion", card: present[0], statQuery: query,
    headline: { label: `${present[0].name} ${answer.headline?.label ?? hit?.label ?? ""}`, value: hit?.values[0] || "—" } } };
}
