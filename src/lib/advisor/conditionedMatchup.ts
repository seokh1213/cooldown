/** 기존 답과 대안 노트가 같은 실행 조건 검사를 거치게 한다. 새 게임 행동을 작성하지 않는다. */
import type { Language } from "@/i18n";
import { selectPlaybook } from "@/lib/knowledge/playbookCore";
import type { ChampionCard } from "@/lib/knowledge/facts";
import type { AdvisorData } from "./context";
import type { ScenarioCondition } from "./dialogueState";
import { adviceUnit, actionEligible, selectExecutableText, type AdviceUnit } from "./adviceActions";
import { checkedMatchupText } from "./matchupFactCheck";
import { labelSlots } from "./slotLabels";
import { askedSlot, noteOrder } from "./noteSelect";

export interface ConditionedRequest {
  mine: ChampionCard; enemy: ChampionCard; question: string;
  conditions?: ScenarioCondition[]; focus?: string;
  continuation?: "explain" | "advance"; shownTopics?: readonly string[];
}
interface Candidate extends AdviceUnit { topic: string; score: number; side: "mine" | "enemy" }
export interface ConditionedText { text: string; rejected: number; alternatives: number; topics: string[]; abstained: boolean }
const TOPIC: Record<string, string> = { skill: "watch", "escape-window": "escape", "situational-item": "build" };

export function conditionCaption(conditions: readonly ScenarioCondition[], lang: Language): string {
  if (!conditions.length) return "";
  const text = conditions.map(c => lang === "en_US" ? `${c.owner === "mine" ? "My" : "Enemy"} ${c.slot} ${c.status === "down" ? "on cooldown" : "available"}`
    : lang === "zh_CN" ? `${c.owner === "mine" ? "我的" : "对面"} ${c.slot} ${c.status === "down" ? "冷却中" : "可用"}`
    : `${c.owner === "mine" ? "내" : "상대"} ${c.slot} ${c.status === "down" ? "재사용 대기 중" : "사용 가능"}`).join(" · ");
  return `${lang === "en_US" ? "Your stated conditions" : lang === "zh_CN" ? "你提供的条件" : "말씀하신 조건"}: ${text}.`;
}

function alternatives(data: AdvisorData, lang: Language, request: ConditionedRequest): Candidate[] {
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
    if (!text || text !== source) return []; // 문단 일부를 지우면 선행 조건이 떨어질 수 있다.
    const unit = adviceUnit(text, { ...request, defaultOwner: side });
    if (!actionEligible(unit, request.conditions ?? [])) return [];
    const rank = order.indexOf(entry.category);
    const score = (rank >= 0 ? Math.max(0, 8 - rank * 2) : 0) + (side === "mine" ? 2 : 0)
      + (entry.category === request.focus ? 10 : 0)
      + (slot && new RegExp(`(?:^|[^A-Za-z])${slot}(?![A-Za-z])`).test(text) ? 2 : 0)
      + (unit.requirements.some(r => r.owner === "mine") ? 2 : 0)
      + (/범위 밖|물러|파밍|피하|피합|미니언을 사이/.test(text) ? 3 : 0);
    return [{ ...unit, topic, score, side }];
  })).sort((a, b) => b.score - a.score);
}

/** 조건을 만족하는 원문만 표시한다. 실시간 스킬 상태를 추측하지 않는다. */
export function conditionMatchupText(data: AdvisorData, lang: Language, request: ConditionedRequest, baseline: string): ConditionedText {
  const conditions = request.conditions ?? [];
  if (!conditions.some(c => c.status === "down")) return { text: baseline, rejected: 0, alternatives: 0, topics: [], abstained: false };
  const selected = selectExecutableText(baseline, request, conditions);
  if (!selected.rejected) return { ...selected, alternatives: 0, topics: [], abstained: false };
  const caption = conditionCaption(conditions, lang);
  const safe = selected.text.split(/\n\s*\n/).filter(block => block !== caption && !/^(?:말씀하신 조건|Your stated conditions|你提供的条件):/.test(block));
  const candidates = alternatives(data, lang, request).filter(c => !safe.some(block => block.includes(c.text)));
  const hasAdvice = safe.some(block => !/^\*\*(?:아이템|Items|装备)/.test(block));
  const picked = hasAdvice ? [] : (["mine", "enemy"] as const).flatMap(side => {
    const candidate = candidates.find(c => c.side === side);
    return candidate ? [candidate] : [];
  });
  const advice = [...safe, ...picked.map(c => `**${request[c.side].name}**\n${labelSlots(c.text, [request.mine, request.enemy])}`)].join("\n\n");
  const unavailable = lang === "en_US" ? "I couldn't find a supported action for these conditions. I can't recommend a combo that needs an ability you said is unavailable."
    : lang === "zh_CN" ? "这些条件下没有找到有依据的行动建议，不能推荐需要已说明不可用技能的连招。"
    : "현재 조건에서 추천할 행동을 근거 자료에서 찾지 못했어요. 없다고 말씀하신 스킬이 필요한 콤보는 추천하기 어렵습니다.";
  return { text: `${caption}\n\n${advice || unavailable}`, rejected: selected.rejected, alternatives: picked.length,
    topics: picked.map(c => c.topic), abstained: !advice };
}
