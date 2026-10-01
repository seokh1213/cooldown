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

function unavailableReason(request: ConditionedRequest, baseline: string, lang: Language): string {
  const missing = adviceUnit(baseline, request).requirements.flatMap(r => r.owner === "mine"
    ? r.anyOf.filter(slot => request.conditions?.some(c => c.owner === "mine" && c.slot === slot && c.status === "down")) : []);
  const slots = [...new Set(missing)].join("·");
  if (!slots) return "";
  const intent = adviceQuestion(request.question, request).intent;
  const action = intent === "engage" ? "진입" : intent === "combo" ? "콤보" : intent === "trade" ? "딜 교환" : intent === "survive" ? "대응" : "행동";
  return lang === "en_US" ? `The prepared advice needs my ${slots}, which you said is unavailable. I can't recommend that action now.`
    : lang === "zh_CN" ? `已有建议需要我的 ${slots}，但你说这些技能还在冷却，因此现在不能推荐该行动。`
    : `내 ${slots} 스킬이 필요한 ${josa(action, "을/를")} 지금 추천할 수 없어요.`;
}

function alternativeText(candidate: Candidate, request: ConditionedRequest, lang: Language): string {
  const controls = controlLabels(candidate, request, request.conditions ?? []);
  const means = controls.length ? lang === "en_US" ? `Crowd control referred to here: ${controls.join(" / ")}.`
    : lang === "zh_CN" ? `这里提到的控制技能：${controls.join(" / ")}。`
    : `이 조언에서 말하는 군중 제어 수단: ${controls.join(" / ")}.` : "";
  return [`**${request[candidate.side].name}**`, means, labelSlots(candidate.text, [request.mine, request.enemy])].filter(Boolean).join("\n");
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
  const unavailable = lang === "en_US" ? "I couldn't find a supported action for these conditions. I can't recommend a combo that needs an ability you said is unavailable."
    : lang === "zh_CN" ? "这些条件下没有找到有依据的行动建议，不能推荐需要已说明不可用技能的连招。"
    : "현재 조건에서 추천할 행동을 근거 자료에서 찾지 못했어요. 없다고 말씀하신 스킬이 필요한 콤보는 추천하기 어렵습니다.";
  const target = targeted ? `${request.enemy.name} ${query.target!.slot}` : "";
  const gap = target ? lang === "en_US" ? `I couldn't find another supported response to ${target} under these conditions.`
    : lang === "zh_CN" ? `这些条件下没有找到针对 ${target} 的其他有依据的应对。`
    : `현재 조건에서 ${target}에 대응할 다른 행동은 근거 자료에서 찾지 못했어요.` : unavailable;
  // 대안이 있으면 그 행동부터 답한다. 답을 못 찾았을 때만 필요한 스킬의 부재를 설명한다.
  const reason = selected.rejected && !advice ? unavailableReason(request, baseline, lang) : "";
  return { text: [reason, advice || gap].filter(Boolean).join("\n\n"), rejected: selected.rejected, alternatives: picked.length,
    topics: picked.map(c => c.topic), abstained: !advice,
    retainedBlocks: selected.keptBlocks.filter((_, i) => safe.includes(selected.text.split(/\n\s*\n/)[i])) };
}
