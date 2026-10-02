/** 대화 계획의 근거 문장을 조립한다. 이 단계는 새로운 게임 지식을 생성하지 않는다. */
import type { Language } from "@/i18n";
import { ruleLines } from "@/lib/knowledge/rules";
import type { AdvisorAnswer } from "./answer";
import type { AdvisorData } from "./context";
import type { AnswerPlan } from "./plan";
import { answerProse } from "./prose";
import { buildMatchupReply, focusOfMatchupTopic } from "./matchupReply";
import type { DialoguePlan } from "./dialoguePlanner";
import type { DialogueMemory } from "./dialogueState";

export interface DialogueReply {
  answer?: AdvisorAnswer;
  text: string;
  /** 검사에 통과한 요약. 원래 카드·본문·기억을 대체하지 않는다. */
  summary?: string;
  memory: DialogueMemory;
  notice?: string;
  related?: Array<{ id: string; title: string }>;
  respond?: Extract<AnswerPlan, { type: "respond" }>;
}

export function dialogueAnswerText(answer: AdvisorAnswer, lang: Language): string {
  if (answer.kind === "text") return answer.text;
  if (answer.kind === "rule") return (answer.highlighted.length ? answer.highlighted : ruleLines(answer.rule, lang)).join("\n");
  const prose = answerProse(answer, lang);
  if (answer.kind === "compare" && !prose) return answer.rows.map(row => `${row.label}: ${answer.cards.map((card, i) => `${card.name} ${row.values[i] || "—"}`).join(" · ")}`).join("\n");
  if (answer.kind === "item" && !answer.askedPrice && answer.effects.length) return `${prose}\n${answer.effects.map(e => e.text).filter(Boolean).join("\n")}`;
  return prose;
}

interface ReplyDependencies { matchup: typeof buildMatchupReply }
async function partReply(part: DialoguePlan["parts"][number], options: { data: AdvisorData | null; lang: Language; memory: DialogueMemory; deps: ReplyDependencies }): Promise<Omit<DialogueReply, "memory">> {
  const { plan, question } = part;
  const { data, lang, memory } = options;
  if (plan.type === "respond") return { text: "", respond: plan };
  if (plan.type === "retry") throw new Error("대화 계획은 오타 재시도를 먼저 풀어야 합니다");
  if (!data) throw new Error("자료 답변에는 준비된 자료가 필요합니다");
  if (plan.type === "matchup") {
    const { answer, topics } = await options.deps.matchup(data, lang, { question, mine: plan.mine, enemy: plan.enemy, focus: plan.focus, more: plan.more, continuation: plan.continuation, shownTopics: memory.matchup?.shownTopics, scope: "topic", conditions: memory.conditions });
    if (memory.matchup?.mine === plan.mine.id && memory.matchup.enemy === plan.enemy.id) {
      memory.matchup.shownTopics = [...new Set([...(memory.matchup.shownTopics ?? []), ...topics])];
      if (plan.continuation === "advance" && topics.length) memory.matchup.focus = focusOfMatchupTopic(topics[0]);
    }
    return { answer, text: dialogueAnswerText(answer, lang), notice: plan.notice };
  }
  const answer = plan.answer;
  if (typeof answer === "string") return { text: answer, notice: plan.notice, related: plan.type === "code" ? plan.related : undefined };
  return { answer, text: dialogueAnswerText(answer, lang), notice: plan.notice };
}

export async function assembleDialogueReply(dialogue: DialoguePlan, data: AdvisorData | null, lang: Language, deps: ReplyDependencies = { matchup: buildMatchupReply }): Promise<DialogueReply> {
  const memory = structuredClone(dialogue.memory);
  const replies: Array<Omit<DialogueReply, "memory">> = [];
  for (const part of dialogue.parts) replies.push(await partReply(part, { data, lang, memory, deps }));
  const unavailable = lang === "en_US" ? "I can't yet confirm this part." : lang === "zh_CN" ? "这部分暂时无法确认。" : "이 부분은 아직 확인할 수 없어요.";
  const text = replies.map((r, i) => r.text || (replies.length > 1 ? `${dialogue.parts[i].question}\n${unavailable}` : "")).filter(Boolean).join("\n\n");
  if (dialogue.clarification) return { text: [text, dialogue.clarification].filter(Boolean).join("\n\n"), memory };
  memory.lastReply = { question: dialogue.parts.map(p => p.question).join(" / "), text, focus: memory.matchup?.focus };
  if (replies.length === 1) return { ...replies[0], memory };
  return { text, memory };
}
