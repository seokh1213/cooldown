/** 대화 계획의 근거 문장을 조립한다. 이 단계는 새로운 게임 지식을 생성하지 않는다. */
import type { Language } from "@/i18n";
import { ruleAnswerText } from "./ruleFocus";
import { answerKey, type AdvisorAnswer } from "./answer";
import type { AdvisorData } from "./context";
import type { AnswerPlan } from "./plan";
import { answerProse } from "./prose";
import { buildMatchupReply, focusOfMatchupTopic } from "./matchupReply";
import type { DialoguePlan } from "./dialoguePlanner";
import type { DialogueMemory } from "./dialogueState";
import type { DialogueTrace } from "./requestContract";
import { requestGuidance } from "./requestGuidance";
import { groupedReply } from "./groupedReply";

export interface DialogueReply {
  answer?: AdvisorAnswer;
  answers?: AdvisorAnswer[];
  text: string;
  /** 검사에 통과한 요약. 원래 카드·본문·기억을 대체하지 않는다. */
  summary?: string;
  memory: DialogueMemory;
  notice?: string;
  related?: Array<{ id: string; title: string }>;
  respond?: Extract<AnswerPlan, { type: "respond" }>;
  trace?: DialogueTrace;
}
export type AnswerDelivery = string | AdvisorAnswer | { text: string; answers: AdvisorAnswer[] };

export function dialogueAnswerText(answer: AdvisorAnswer, lang: Language): string {
  if (answer.kind === "text") return answer.text;
  if (answer.kind === "rule") return ruleAnswerText(answer.rule, answer.highlighted, lang);
  const prose = answerProse(answer, lang);
  if (answer.kind === "compare" && !prose) return answer.rows.map(row => `${row.label}: ${answer.cards.map((card, i) => `${card.name} ${row.values[i] || "—"}`).join(" · ")}`).join("\n");
  if (answer.kind === "item") {
    if (answer.askedPrice) return prose || answer.itemName;
    const facts = answer.stats.map(stat => `${stat.label}: ${stat.value}`).join(" · ");
    const effects = answer.effects.map(effect => effect.text).filter(Boolean).join("\n");
    return [prose || answer.itemName, facts, effects].filter(Boolean).join("\n");
  }
  return prose;
}

interface ReplyDependencies { matchup: typeof buildMatchupReply }
type PartReply = Omit<DialogueReply, "memory"> & { selectedTopics?: string[] };
async function partReply(part: DialoguePlan["parts"][number], options: { data: AdvisorData | null; lang: Language; memory: DialogueMemory; deps: ReplyDependencies }): Promise<PartReply> {
  const { plan, question } = part;
  const { data, lang, memory } = options;
  if (plan.type === "respond") return { text: "", respond: plan };
  if (plan.type === "retry") throw new Error("대화 계획은 오타 재시도를 먼저 풀어야 합니다");
  if (!data) throw new Error("자료 답변에는 준비된 자료가 필요합니다");
  if (plan.type === "matchup") {
    const context = part.matchup ?? { ...memory.matchup, conditions: memory.conditions };
    const { answer, topics } = await options.deps.matchup(data, lang, { question, mine: plan.mine, enemy: plan.enemy, focus: plan.focus, more: plan.more, continuation: plan.continuation, shownTopics: context.shownTopics, scope: "topic", conditions: context.conditions });
    if (answer.kind === "compare" && !answerProse(answer, lang)) {
      return { text: requestGuidance("evidence", lang) };
    }
    const grouped = memory.matchups?.find(pair => pair.mine === plan.mine.id && pair.enemy === plan.enemy.id);
    if (grouped) {
      grouped.shownTopics = [...new Set([...(grouped.shownTopics ?? []), ...topics])];
      if (plan.continuation === "advance" && topics.length) grouped.focus = focusOfMatchupTopic(topics[0]);
    }
    if (memory.matchup?.mine === plan.mine.id && memory.matchup.enemy === plan.enemy.id) {
      memory.matchup.shownTopics = [...new Set([...(memory.matchup.shownTopics ?? []), ...topics])];
      if (plan.continuation === "advance" && topics.length) memory.matchup.focus = focusOfMatchupTopic(topics[0]);
    }
    return { answer, text: dialogueAnswerText(answer, lang), notice: plan.notice, selectedTopics: topics };
  }
  const answer = plan.answer;
  if (typeof answer === "string") return { text: answer, notice: plan.notice,
    answers: plan.type === "code" ? plan.references : undefined,
    related: plan.type === "code" ? plan.related : undefined };
  const text = dialogueAnswerText(answer, lang);
  return text.trim() ? { answer, text, notice: plan.notice } : { text: requestGuidance("evidence", lang), notice: plan.notice };
}

export async function assembleDialogueReply(dialogue: DialoguePlan, data: AdvisorData | null, lang: Language, deps: ReplyDependencies = { matchup: buildMatchupReply }): Promise<DialogueReply> {
  const memory = structuredClone(dialogue.memory);
  const replies: PartReply[] = [];
  for (const part of dialogue.parts) replies.push(await partReply(part, { data, lang, memory, deps }));
  const unavailable = lang === "en_US" ? "I can't yet confirm this part." : lang === "zh_CN" ? "这部分暂时无法确认。" : "이 부분은 아직 확인할 수 없어요.";
  dialogue.trace?.parts.forEach((part, index) => {
    part.topics = replies[index]?.selectedTopics;
  });
  const sections = replies.map((r, i) => {
    const plan = dialogue.parts[i].plan;
    const heading = replies.length > 1 && plan.type === "matchup" ? `### ${plan.mine.name} vs ${plan.enemy.name}` : "";
    return { heading, enemy: plan.type === "matchup" ? plan.enemy.name : undefined,
      text: r.text || (replies.length > 1 ? `${dialogue.parts[i].question}\n${unavailable}` : "") };
  });
  const text = groupedReply(sections, lang);
  if (dialogue.clarification) return { text: [text, dialogue.clarification].filter(Boolean).join("\n\n"), memory, trace: dialogue.trace };
  memory.lastReply = { question: dialogue.parts.map(p => p.question).join(" / "), text, focus: memory.matchup?.focus };
  if (replies.length === 1) return { ...replies[0], memory, trace: dialogue.trace };
  const answers = [...new Map(replies.flatMap(reply => reply.answers ?? (reply.answer ? [reply.answer] : []))
    .map(answer => [answerKey(answer), answer] as const)).values()];
  return { text, answers: answers.length ? answers : undefined, memory, trace: dialogue.trace };
}
