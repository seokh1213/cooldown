/** 기존 답과 대안 노트가 같은 실행 조건 검사를 거치게 한다. 새 게임 행동을 작성하지 않는다. */
import type { Language } from "@/i18n";
import { selectPlaybook, HARD_CC } from "@/lib/knowledge/playbookCore";
import { josa } from "@/lib/knowledge/text";
import type { ChampionCard } from "@/lib/knowledge/facts";
import type { AdvisorData } from "./context";
import type { ScenarioCondition } from "./dialogueState";
import { adviceUnit, actionEligible, controlLabels, mentionsAbility, selectExecutableText, type AdviceUnit } from "./adviceActions";
import { checkedMatchupText, checkMatchupFacts, evidenceSentences } from "./matchupFactCheck";
import { labelSlots } from "./slotLabels";
import { askedSlot, noteOrder } from "./noteSelect";
import { adviceQuestion, relevantAdvice, type AdviceQuestion } from "./adviceRelevance";

export interface ConditionedRequest {
  mine: ChampionCard; enemy: ChampionCard; question: string;
  conditions?: ScenarioCondition[]; focus?: string;
  continuation?: "explain" | "advance"; shownTopics?: readonly string[];
}
interface Candidate extends AdviceUnit { topic: string; score: number; side: "mine" | "enemy" }
export interface ConditionedText { text: string; rejected: number; alternatives: number; topics: string[]; abstained: boolean; retainedBlocks?: number[] }
const TOPIC: Record<string, string> = { skill: "watch", "escape-window": "escape", "situational-item": "build" };

function alternatives(data: AdvisorData, lang: Language, request: ConditionedRequest, query: AdviceQuestion = adviceQuestion(request.question, request)): Candidate[] {
  const selected = selectPlaybook(data.playbooks, request.mine, request.enemy);
  const practical = request.conditions?.some(c => c.owner === "mine" && c.status === "down")
    ? ["laning", "escape-window", "skill", "combo", "teamfight", "phase"] : noteOrder(request.question);
  const order = request.focus && request.focus !== "general" ? [request.focus, ...practical] : practical;
  const slot = askedSlot(request.question);
  return (["mine", "enemy"] as const).flatMap(side => (side === "mine" ? selected.mine : selected.vsEnemy).flatMap(entry => {
    if (!["skill", "combo", "laning", "escape-window", "teamfight", "phase"].includes(entry.category)) return [];
    if (["teamfight", "phase", "laning"].includes(request.focus ?? "") && entry.category !== request.focus) return [];
    if (entry.id?.includes("passive") && !/패시브|passive|被动/i.test(request.question)) return [];
    const topic = TOPIC[entry.category] ?? entry.category;
    if (request.continuation === "advance" && request.shownTopics?.includes(topic)) return [];
    const source = lang === "ko_KR" ? entry.text : entry.id ? data.noteTranslations?.[entry.id] : undefined;
    if (!source) return [];
    const text = checkedMatchupText(source, [request.mine, request.enemy]);
    if (!text || text !== source && (checkMatchupFacts(source, [request.mine, request.enemy]).some(issue => issue.reason !== "unsupported-guarantee")
      || !text.startsWith(evidenceSentences(source)[0]))) return []; // 선행 조건은 남기고 근거 없는 결론만 뺀다.
    if (!relevantAdvice(text, entry.category, side, query)) return [];
    const unit = adviceUnit(text, { ...request, defaultOwner: side });
    if (!actionEligible(unit, request.conditions ?? [])) return [];
    const engageAbility = unit.requirements.some(r => r.owner === "mine" && r.anyOf.some(slot =>
      request.mine.spells.find(s => s.slot === slot)?.effects.some(effect => ["이동기", ...HARD_CC].includes(effect))));
    if (query.intent === "engage" && !engageAbility && !/진입을 미루|들어가지|do not engage|不要进场/i.test(text)) return [];
    const rank = order.indexOf(entry.category);
    const score = (rank >= 0 ? Math.max(0, 8 - rank * 2) : 0) + (side === "mine" ? 2 : 0)
      + (entry.category === request.focus ? 10 : 0)
      + (slot && new RegExp(`(?:^|[^A-Za-z])${slot}(?![A-Za-z])`).test(text) ? 2 : 0)
      + (unit.requirements.some(r => r.owner === "mine") ? 2 : 0)
      + (/범위 밖|물러|파밍|피하|피합|미니언을 사이/.test(text) ? 3 : 0)
      + (query.intent === "engage" && engageAbility ? 8 : 0);
    return [{ ...unit, topic, score, side }];
  })).sort((a, b) => b.score - a.score);
}

function unavailableText(request: ConditionedRequest, baseline: string, query: AdviceQuestion, lang: Language): string {
  const missing = adviceUnit(baseline, request).requirements.flatMap(r => r.owner === "mine"
    ? r.anyOf.filter(slot => request.conditions?.some(c => c.owner === "mine" && c.slot === slot && c.status === "down")) : []);
  const slots = [...new Set(missing)].join("·");
  const target = query.target?.owner === "enemy" && request.continuation !== "advance" ? `${request.enemy.name} ${query.target.slot}` : "";
  const intent = query.intent;
  const action = intent === "engage" ? "진입" : intent === "combo" ? "콤보" : intent === "trade" ? "딜 교환" : "대응";
  return lang === "en_US" ? `${slots ? `Without your ${slots}, ` : ""}I can't yet confirm another ${target ? `response to ${target}` : "option"}.`
    : lang === "zh_CN" ? `${slots ? `你的 ${slots} 不可用时，` : ""}暂时无法确认${target ? `应对 ${target} 的` : ""}其他办法。`
    : `${slots ? `내 ${slots} 없이 ` : ""}${target ? `${target}에 대응할 다른` : action} 방법은 아직 확인하지 못했어요.`;
}

function alternativeText(candidate: Candidate, request: ConditionedRequest, lang: Language): string {
  const controls = controlLabels(candidate, request, request.conditions ?? []);
  let text = labelSlots(candidate.text, [request.mine, request.enemy]);
  if (controls.length) {
    const label = controls.join(lang === "en_US" ? " or " : lang === "zh_CN" ? "或" : " 또는 ");
    text = lang === "en_US" ? text.replace(/((?:apply|use) )crowd control/gi, (_, verb: string) => verb + label)
      : lang === "zh_CN" ? text.replace(/((?:用(?:你的|己方|自身)?|施加)\s*)控制/g, (_, verb: string) => verb + label)
      : text.replace(/군중\s*제어를(?=\s*(?:걸|넣|사용))/g, josa(label, "을/를")).replace(/CC로(?=\s*(?:끊|막))/g, josa(label, "로/으로"));
  }
  return [`**${request[candidate.side].name}**`, text].join("\n");
}

/** 조건을 만족하는 원문만 표시한다. 실시간 스킬 상태를 추측하지 않는다. */
export function conditionMatchupText(data: AdvisorData, lang: Language, request: ConditionedRequest, baseline: string): ConditionedText {
  const conditions = request.conditions ?? [];
  const query = adviceQuestion(request.question, request);
  const targeted = query.target?.owner === "enemy" && request.continuation !== "advance";
  if (!conditions.some(c => c.status === "down") && !targeted) return { text: baseline, rejected: 0, alternatives: 0, topics: [], abstained: false };
  const selected = selectExecutableText(baseline, request, conditions);
  if (!selected.rejected && !targeted) return { ...selected, alternatives: 0, topics: [], abstained: false, retainedBlocks: selected.keptBlocks };
  const safe = selected.text.split(/\n\s*\n/).filter(block => block.trim() && !/^(?:말씀하신 조건|Your stated conditions|你提供的条件):/.test(block))
    .filter(block => !targeted || mentionsAbility(block, { ...request, defaultOwner: block.startsWith(`**${request.mine.name}**`) ? "mine" : "enemy" }, query.target!));
  let candidates = alternatives(data, lang, request).filter(c => !safe.some(block => block.includes(c.text)));
  const defensive = !targeted && query.intent === "engage" && !candidates.length;
  if (defensive) candidates = alternatives(data, lang, request, { intent: "survive" })
    .filter(c => !/진입|개시|붙은 직후|engage|进场|开团/i.test(c.text));
  const hasAdvice = safe.some(block => !/^\*\*(?:아이템|Items|装备)/.test(block));
  const picked = hasAdvice ? [] : (["mine", "enemy"] as const).flatMap(side => {
    const candidate = candidates.find(c => c.side === side);
    return candidate ? [candidate] : [];
  });
  const defensiveLabel = lang === "en_US" ? "**Defense and spacing**" : lang === "zh_CN" ? "**防守和距离管理**" : "**방어·거리 관리**";
  const advice = [...safe, ...(defensive && picked.length ? [defensiveLabel] : []), ...picked.map(c => alternativeText(c, request, lang))].join("\n\n");
  return { text: advice || unavailableText(request, baseline, query, lang), rejected: selected.rejected, alternatives: picked.length,
    topics: picked.map(c => c.topic), abstained: !advice,
    retainedBlocks: selected.keptBlocks.filter((_, i) => safe.includes(selected.text.split(/\n\s*\n/)[i])) };
}
