/** 명시적인 조회와 최근 조회의 생략을 해석한다. 수치 계산은 카드의 값으로만 한다. */
import type { ChampionCard, SpellFact } from "@/lib/knowledge/facts";
import { buildCompareAnswer, buildSpellAnswer, type AdvisorAnswer } from "./answer";
import { buildItemCard, detectSlot } from "./context";
import { resolveQuestion, type QuestionInput } from "./resolvedQuestion";
import { askedRules } from "./questionDocs";
import { asksWholeKit, asksSkillHandling, asksMatchup, asksReason, asksScenarioAdvice } from "./askWords";
import type { AnswerPlan, PlanContext } from "./plan";
import { inferredSpellFocus, numericConditions, type DialogueMemory } from "./dialogueState";
import { resolveDialogueRule, isPenetrationRule } from "./dialogueRules";
import { josa } from "@/lib/knowledge/text";

export interface FactResolution {
  plan?: AnswerPlan;
  pending?: DialogueMemory["pending"];
  numeric?: DialogueMemory["numeric"];
  relation?: "penetration";
}
const RETURN = /아까|앞서|다시|그대로|같은\s*조건|earlier|same|回到|之前/i;
const QUERY = /사거리|범위|range|射程|쿨|몇\s*초|마나|소모|계수|설명|효과|말한|기준|비교|돌아(?!왔|가)|cooldown|cost|ratio|冷却|耗蓝|比较/i;
const round = (value: number) => Number(value.toFixed(2)).toString();

function numberList(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const values = value.split("/").map(Number);
  return values.every(v => Number.isFinite(v) && v >= 0) ? values : undefined;
}

function adjustedCooldown(spell: SpellFact, numeric: DialogueMemory["numeric"]) {
  const all = numberList(spell.recharge ?? spell.cooldown);
  if (!all) return undefined;
  if (numeric?.rank !== undefined && numeric.rank > all.length && all.length !== 1) return undefined;
  const base = numeric?.rank ? [all[Math.min(numeric.rank - 1, all.length - 1)]] : all;
  const haste = numeric?.haste ?? 0;
  if (!Number.isFinite(haste) || haste < 0 || haste > 500) return undefined;
  return { base, value: base.map(v => round(v * 100 / (100 + haste))).join("/") };
}

function withCalculation(answer: AdvisorAnswer, numeric: DialogueMemory["numeric"]): AdvisorAnswer {
  if (!numeric || answer.kind !== "spell") return answer;
  const adjusted = adjustedCooldown(answer.spell, numeric);
  if (!adjusted) return answer;
  const rank = numeric.rank ? `스킬 ${numeric.rank}랭크` : "스킬 랭크 순서";
  const haste = numeric.haste === undefined ? "" : ` · 가속 ${numeric.haste}`;
  const label = answer.spell.recharge ? "재충전 대기시간" : "재사용 대기시간";
  return {
    ...answer, focus: "cooldown", headline: { label: `${rank}${haste} 기준 ${label}`, value: `${adjusted.value}초` },
    facts: [{ label: "기본 대기시간", value: `${adjusted.base.join("/")}초` }, ...answer.facts.filter(f => !f.label.includes("대기시간"))],
  };
}

function comparison(cards: ChampionCard[], slot: string, request: { question: string; focus?: string; numeric: DialogueMemory["numeric"] }, ctx: PlanContext): AdvisorAnswer {
  const { numeric, focus, question } = request;
  const answer = buildCompareAnswer(cards, question, slot, { lang: ctx.lang });
  if (answer.kind !== "compare" || focus !== "cooldown" || !numeric) return answer;
  const values = cards.map(card => {
    const spell = card.spells.find(s => s.slot === slot);
    return spell ? adjustedCooldown(spell, numeric)?.value : undefined;
  });
  if (values.some(v => v === undefined)) return answer;
  const label = `${slot}${numeric.rank ? ` · 스킬 ${numeric.rank}랭크` : " · 스킬 랭크 순서"}${numeric.haste === undefined ? "" : ` · 가속 ${numeric.haste}`} 기준 대기시간`;
  return { ...answer, headline: { label, value: cards.map((c, i) => `${c.name} ${values[i]}초`).join(" · ") }, rows: answer.rows.map(row => row.hit ? { ...row, values: values.map(v => `${v}초`) } : row) };
}

function resolveTargets(question: string, named: ChampionCard[], memory: DialogueMemory, ctx: PlanContext): ChampionCard[] {
  const data = ctx.data!;
  const from = (ids: string[]) => ids.map(id => data.cardById.get(id)).filter((card): card is ChampionCard => Boolean(card));
  if (/둘|둘\s*중|비교|both|compare|两个|比较/i.test(question) && named.length < 2) {
    const prior = memory.compared ?? (named.length && memory.spell ? [memory.spell.champion]
      : memory.matchup ? [memory.matchup.mine, memory.matchup.enemy] : memory.spell ? [memory.spell.champion] : []);
    return from([...new Set([...prior, ...named.map(c => c.id)])]);
  }
  if (named.length) return named;
  if (memory.matchup && /상대|enemy|对面/i.test(question)) return from([memory.matchup.enemy]);
  if (memory.matchup && /내\s*[QWER]|내\s*궁|\bmy\b|我的/i.test(question)) return from([memory.matchup.mine]);
  if (memory.compared && (memory.active === "compare" || memory.active === "spell")) return from(memory.compared);
  if (memory.active === "stat" && memory.stat) return from(memory.stat.champions);
  if (memory.active === "champion" && memory.champion) return from([memory.champion]);
  if (memory.spell && (memory.active === "spell" || RETURN.test(question))) return from([memory.spell.champion]);
  if (memory.pending) return from(memory.pending.candidates);
  if (memory.active === "matchup" && memory.matchup) return from([memory.matchup.mine, memory.matchup.enemy]);
  return from([...ctx.championIds]);
}

function hasteFormula(question: string, memory: DialogueMemory): FactResolution | undefined {
  const numeric = numericConditions(question, undefined);
  const haste = numeric?.haste;
  if (haste === undefined || haste > 500 || asksScenarioAdvice(question)) return undefined;
  const base = /(?:기본\s*)?쿨타임\s*(?:이|은)?\s*(\d+(?:\.\d+)?)\s*초|\b(\d+(?:\.\d+)?)\s*second.*cooldown/i.exec(question);
  if (base) {
    const seconds = Number(base[1] ?? base[2]);
    const final = round(seconds * 100 / (100 + haste));
    return { plan: { type: "code", answer: { kind: "text", text: `기본 ${seconds}초에 스킬 가속 ${haste}이면 ${final}초입니다. ${seconds} × 100 / (100 + ${haste}) = ${final}초로 계산합니다.` } } };
  }
  if (memory.active === "spell" && /얼마|몇|줄어|줄|same|같은/i.test(question)) return undefined;
  if (detectSlot(question)) return undefined;
  return { plan: { type: "code", answer: { kind: "text", text: `스킬 가속 ${haste}이면 쿨타임이 ${round(haste * 100 / (100 + haste))}% 줄어듭니다. 최종 쿨타임은 기본 쿨타임 × 100 / (100 + ${haste})입니다.` } } };
}

function explicitEntity(question: string, memory: DialogueMemory, ctx: PlanContext): FactResolution | undefined {
  const data = ctx.data!;
  const item = buildItemCard(data, question, memory.active === "item" && /그거|그\s*아이템|효과|가격|골드/.test(question) ? memory.item : undefined);
  if (item) return { plan: { type: "card", answer: item } };
  return undefined;
}

function penetrationAnswer(answer: AdvisorAnswer, question: string, memory: DialogueMemory, ctx: PlanContext): FactResolution | undefined {
  const carries = memory.spell?.relation === "penetration" && !QUERY.test(question);
  const follows = isPenetrationRule(memory.rule) && /적용|평타|기본\s*공격/.test(question);
  if (!carries && !follows) return undefined;
  const source = ctx.data!.mechanics.find(m => m.id === "저항과-피해-감소");
  if (!source?.text.includes("방어력은 물리 피해")) return undefined;
  if (answer.kind !== "spell") return undefined;
  const damage = answer.spell.damageTypes;
  const text = damage.length === 1 && damage[0] === "물리" ? "물리 피해이므로 물리 관통력과 방어구 관통력이 적용됩니다."
    : damage.length === 1 && damage[0] === "고정" ? "고정 피해이므로 물리 관통력이나 방어구 관통력으로 피해가 늘어나지 않습니다." : undefined;
  return text ? { plan: { type: "card", answer: { ...answer, headline: undefined, highlighted: [`${answer.championName} ${answer.spell.slot} ${josa(answer.spell.name, "은/는")} ${text}`] } }, relation: "penetration" } : undefined;
}

export function resolveDialogueFact(input: QuestionInput, memory: DialogueMemory, ctx: PlanContext): FactResolution | undefined {
  if (!ctx.data || ctx.lang !== "ko_KR") return undefined;
  const resolved = resolveQuestion(input, ctx.data);
  const question = resolved.text;
  const formula = hasteFormula(question, memory);
  if (formula) return formula;
  const rule = resolveDialogueRule(question, ctx);
  if (rule) return { plan: rule };
  const entity = explicitEntity(question, memory, ctx);
  if (entity) return entity;
  // 룬·주문은 knowledgePlans의 공통 계획으로 넘긴다. 최근 스킬의 생략으로 읽지 않는다.
  if (askedRules(ctx.data, question).some(rule => rule.subject !== "gameplay")) return undefined;
  if (memory.active === "matchup" && !QUERY.test(question) && (asksMatchup(question) || asksReason(question) || /정정|사실.*[QWER]|빠지면/.test(question))) return undefined;
  if (asksScenarioAdvice(question) || asksSkillHandling(question) || asksWholeKit(question)) return undefined;
  const numeric = numericConditions(question, memory.numeric);
  const named = resolved.champions;
  // 여러 이름의 전체 조회를 이전에 물었던 단일 슬롯으로 좁히지 않는다.
  if (named.length > 1 && !resolved.slot) return undefined;
  const slot = resolved.slot ?? memory.pending?.slot ?? ((memory.active === "spell" && (QUERY.test(question) || numeric !== undefined)) ? memory.spell?.slot : undefined);
  if (!slot && /그\s*스킬|그거.*쿨|that (ability|skill)|那个技能/i.test(question) && !named.length) return { pending: { slot: "?", focus: inferredSpellFocus(question, memory), candidates: [] } };
  if (!slot || (!QUERY.test(question) && !resolved.slot && JSON.stringify(numeric) === JSON.stringify(memory.numeric))) return undefined;
  const cards = resolveTargets(question, named, memory, ctx);
  if (!cards.length) return { pending: { slot, focus: inferredSpellFocus(question, memory), candidates: [] } };
  const shared = /그대로|같은\s*조건|same/i.test(question) || memory.active === "spell";
  const applied = shared || /가속|랭크|레벨/.test(question) ? numeric : undefined;
  const focus = inferredSpellFocus(question, memory);
  const focusedQuestion = `${question} ${focus === "cooldown" ? "쿨타임" : focus === "cost" ? "마나 소모" : focus === "range" ? "사거리" : ""}`;
  if (cards.length > 1) {
    const selected = named.length > 1 || memory.active === "compare" || memory.active === "stat" || memory.active === "spell" && Boolean(memory.compared);
    return {
      plan: { type: "card", answer: comparison(cards, slot, { question: focusedQuestion, focus, numeric: applied }, ctx) }, numeric: applied,
      pending: selected ? undefined : { slot, focus, candidates: cards.map(c => c.id) },
    };
  }
  const [card] = cards;
  const spell = card.spells.find(s => s.slot === slot);
  if (!spell) return undefined;
  let answer = buildSpellAnswer(card, spell, focusedQuestion, ctx.lang);
  const related = penetrationAnswer(answer, question, memory, ctx);
  if (related) return related;
  answer = focus === "cooldown" ? withCalculation(answer, applied) : answer;
  if (answer.kind === "spell" && focus === "cost" && !spell.cost) {
    const passive = card.spells.find(s => s.slot === "P");
    const resource = /스킬을 사용할 때마다 열기/.test(passive?.text ?? "") ? " 스킬을 사용할 때마다 열기를 얻습니다." : "";
    answer = { ...answer, focus: "cost", highlighted: [`${card.name} ${slot} ${spell.name}의 마나 소모량은 아직 확인할 수 없어요.${resource}`] };
  }
  return { plan: { type: "card", answer }, numeric: applied };
}
