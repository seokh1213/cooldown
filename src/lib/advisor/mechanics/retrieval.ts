/** 승인 규칙은 효과와 발동 조건을 함께 조회한다. */
import type { Rule, Ability, Topic } from "./types";
import { normalizeMechanicQuestion, questionState, type QuestionState } from "./question";
import { matchesNumericCondition } from "./conditions";
export type { Topic } from "./types";
export const TOPICS = [
  ["resource", /(?:마나|기력|분노|자원|쿨|재사용).*(?:돌려|반환|회복|환급)|(?:스킬|구체).*(?:폭발|터뜨)/i, ["resource_change", "damage", "cooldown_change"]],
  ["cooldown", /(?:쿨|재사용\s*대기).*(?:줄어|줄이|감소|초기화)/i, ["cooldown_change"]],
  ["activation", /(?:켜|켠|활성화).*(?:계속|유지|동안)|(?:끄면|꺼지면)/i, []],
  ["mark", /(?:구체|표식).*(?:붙|부착|대상)|어떤\s*대상/i, ["mark"]],
  ["control_resistance", /CC.*(?:막|무시|저항)|(?:기절|속박|이동\s*불가).*(?:막|무시|저항)/i, ["other"]],
  ["conversion", /(?:체력|주문력).*(?:템|전환|변환|치환|공격력|바뀌|늘|얼마)|(?:기본|성장|추가)\s*체력.*(?:바뀌|늘|공격력)|체력.*(?:추가되|전환되)|(?:체력|주문력)\s*\d.*(?:이면|짜리|템|받으면)/i, ["stat_conversion"]],
  ["shield", /보호막|쉴드|실드/i, ["shield"]],
  ["summon", /소환|(?:정령|영혼).*(?:나오|생겨|생기|풀려|제령)/i, ["summon"]],
  ["movement", /이속|이동\s*속도|취소|한\s*대|1\s*대|두\s*발|두\s*대|두\s*번째/i, ["movement", "attack_followup"]],
  ["control", /군중\s*제어|CC|속박|기절|에어본|띄우|밀치|넉백|공포|매혹/i, ["crowd_control"]],
  ["heal", /회복|재생|체젠|피가\s*차|시야.*(?:보이|없)|성소|통.*(?:줍|밟|먹)/i, ["heal"]],
  ["stats", /스탯|능력치|빼앗|훔친/i, ["stat_modifier"]],
  ["stack", /중첩|스택|처치|죽이면|먹으면|죽으면|부활/i, ["resource_change", "stat_modifier", "revive"]],
] as const;

export function questionTopic(question: string): Topic | undefined { return TOPICS.find(([, cue]) => cue.test(question))?.[0]; }
function grams(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
  return new Set(Array.from({ length: Math.max(0, words.length - 1) }, (_, i) => words.slice(i, i + 2)));
}
function ruleText(rule: Rule): string {
  return [rule.trigger.event, ...rule.effects.map(e => e.text), ...rule.conditions.map(c => c.value.kind === "text" ? c.value.value : ""),
    ...rule.evidence.map(e => e.quote)].join(" ");
}
export function ruleMatchesTopic(rule: Rule, topic: Topic): boolean {
  const wanted = TOPICS.find(([name]) => name === topic)?.[2] as readonly string[] | undefined;
  return (wanted?.some(kind => rule.effects.some(effect => effect.kind === kind)) ?? false)
    || topic === "movement" && rule.effects.some(effect => effect.statTo === "moveSpeed")
    || topic === "heal" && rule.effects.some(effect => ["stat_modifier", "other"].includes(effect.kind) && /체력\s*재생|회복/.test(ruleText(rule)))
    || topic === "heal" && rule.effects.some(effect => effect.kind === "cooldown_change" && /회복|성소/.test(ruleText(rule)))
    || topic === "shield" && /보호막|쉴드/.test(ruleText(rule));
}

function percentageReferences(ability: Ability, question: string): Rule[] {
  const values = [...question.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|퍼센트|프로)/g)].map(match => Number(match[1]));
  const refs = new Set(ability.job.numbers.filter(number => number.percent && values.includes(number.value)).map(number => number.id));
  return ability.draft.rules.filter(rule => rule.effects.some(effect => effect.parameters.some(parameter => parameter.numberRefs.some(ref => refs.has(ref)))));
}

export function selectRules(ability: Ability, question: string, topic?: Topic, context: { championMentions?: readonly string[]; state?: QuestionState; followup?: boolean } = {}): Rule[] {
  question = normalizeMechanicQuestion(question);
  const wanted = TOPICS.find(([name]) => name === topic)?.[2] as readonly string[] | undefined;
  const names = ability.job.facts.name as { en?: string; ko?: string } | undefined;
  const withoutNames = [...(context.championMentions ?? []), names?.en, names?.ko].filter((name): name is string => Boolean(name))
    .reduce((text, name) => text.split(name).join(""), question);
  const query = grams(withoutNames.replace(/어떻게|뭐야|무슨|패시브|스킬|어때|할까|알려줘/g, ""));
  const state = context.state ?? questionState(question);
  const hits = state.hitCount;
  const scored = ability.draft.rules.map((rule, index) => {
    const terms = grams(ruleText(rule));
    const lexical = [...query].filter(term => terms.has(term)).length;
    const kind = Boolean(topic && ruleMatchesTopic(rule, topic));
    return { rule, index, score: lexical + (kind ? 30 : 0), kind };
  });
  if (topic === "activation") {
    const active = scored.filter(item => item.rule.conditions.some(condition => condition.field === "activation"
      && condition.value.kind === "boolean"));
    if (active.length) return active.map(item => item.rule);
  }
  // 부활 효과의 선행 조건을 함께 보여야 즉시 부활과 치명적 피해 후 부활을 구분할 수 있다.
  if (/부활/.test(question) && ability.draft.rules.some(rule => rule.effects.some(effect => effect.kind === "revive"))) {
    return ability.draft.rules;
  }
  if (topic === "conversion" && /\d\s*%/.test(question)) {
    const percentages = [...question.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(match => Number(match[1]));
    const refs = new Set(ability.job.numbers.filter(number => number.percent && percentages.includes(number.value)).map(number => number.id));
    const linked = scored.filter(item => item.kind || item.rule.effects.some(effect => effect.parameters.some(parameter => parameter.numberRefs.some(ref => refs.has(ref)))));
    if (linked.some(item => item.kind) && linked.length > 1) return linked.map(item => item.rule);
  }
  if (/추가\s*공격|두\s*번째|탄환/.test(question) && /퍼센트|물리|피해|대미지/.test(question)) {
    const damage = scored.filter(item => item.rule.trigger.event === "followup_attack" && item.rule.effects.some(effect => effect.kind === "damage"));
    if (damage.length) return damage.map(item => item.rule);
  }
  if (hits !== undefined && (!topic || topic === "shield" || topic === "movement" && !/취소|이속|이동\s*속도|움직/.test(question))) {
    const hitRules = scored.filter(item => item.rule.conditions.some(condition => condition.field === "hit_count"));
    const shieldAndDamage = ["shield", "damage"].every(kind => hitRules.some(item => item.rule.effects.some(effect => effect.kind === kind)));
    const reached = hitRules.some(item => item.rule.conditions.some(condition => condition.field === "hit_count"
      && matchesNumericCondition(condition, ability.job, hits) === true));
    if (hitRules.length && (topic === "movement" ? !state.followupStatus && (reached || context.followup) : shieldAndDamage)) return hitRules.slice(0, 3).map(item => item.rule);
  }
  if (!topic && hits === undefined && /설명|소개|어떻게\s*(?:돼|되)|켜|꺼|계속|활성화|비활성화/.test(question)) return ability.draft.rules;
  const enemy = /적\s*챔피언.*(?:밟|줍|먹)/.test(question) ? scored.filter(item => item.rule.trigger.subject === "enemy") : [];
  const filtered = enemy.length ? enemy : scored.filter(item => wanted && scored.some(row => row.kind) ? item.kind : item.score >= 2);
  // 룰 단위를 보존한다. 개별 효과만 떼면 대상·발동 조건을 잃는다.
  const chosen = filtered.sort((a, b) => b.score - a.score).slice(0, 3);
  const rules = chosen.sort((a, b) => a.index - b.index).map(item => item.rule);
  // 부활의 결과만 설명하면 앞선 치명 피해·보호 효과 조건을 빠뜨린다.
  if (rules.some(rule => rule.effects.some(effect => effect.kind === "revive"))) return ability.draft.rules;
  return topic === "conversion" ? [...new Set([...rules, ...percentageReferences(ability, question)])] : rules;
}
