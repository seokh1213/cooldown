/** 상성 답 은행과 검증 노트를 공통 경로로 조립한다. */
import type { Language } from "@/i18n";
import type { ChampionCard } from "@/lib/knowledge/facts";
import type { AdvisorData } from "./context";
import { buildCompareAnswer, type AdvisorAnswer } from "./answer";
import { matchupNotes } from "./playbookNotes";
import { loadPrecomputed, selectPrecomputed, type PrecomputedPair } from "./precomputed";
import type { ScenarioCondition } from "./dialogueState";
import { answerProse, digestSections } from "./prose";
import { checkedMatchupText } from "./matchupFactCheck";
import { labelSlots } from "./slotLabels";
import { conditionMatchupText } from "./conditionedMatchup";

interface MatchupRequest {
  question: string;
  mine: ChampionCard;
  enemy: ChampionCard;
  focus?: string;
  more?: boolean;
  continuation?: "explain" | "advance";
  shownTopics?: readonly string[];
  scope?: "digest" | "topic";
  conditions?: ScenarioCondition[];
}

export interface MatchupReply { answer: AdvisorAnswer; topics: string[] }

/** 이어서 보여준 첫 주제를 다음 이유 질문의 대상으로 삼는다. */
export function focusOfMatchupTopic(topic: string): string {
  return ({ watch: "skill", build: "situational-item", fight: "general", escape: "escape-window" } as Record<string, string>)[topic] ?? topic;
}

function exhaustedText(lang: Language): string {
  return lang === "en_US" ? "I've shown all the available advice for this matchup. Which topic would you like to revisit?"
    : lang === "zh_CN" ? "这个对局现有的建议已经全部讲过了。你想再看哪个主题？"
    : "이 상성의 조언은 모두 보여드렸어요. 라인전·아이템·콤보 중 다시 보고 싶은 주제를 알려주세요.";
}

/** 은행과 노트 모두 같은 진행 상태를 사용한다. 실제로 고른 칸만 기록한다. */
export function selectMatchupReply(answer: AdvisorAnswer, pair: PrecomputedPair | undefined, request: MatchupRequest, lang: Language): MatchupReply {
  if (answer.kind !== "compare") return { answer, topics: [] };
  const mode = request.continuation ?? (request.more ? "explain" : request.scope === "topic" ? "topic" : "digest");
  if (pair) {
    const selected = selectPrecomputed(pair, { focus: request.focus, mode, conditions: request.conditions, shownTopics: request.shownTopics }, answer.cards, lang);
    if (selected.text) return { answer: { ...answer, precomputed: selected.text }, topics: selected.topics };
    if (mode === "advance") return { answer: { kind: "text", text: exhaustedText(lang) }, topics: [] };
  }
  const sections = digestSections(answer, lang, "cue-all-general").map(section => ({ ...section, lines: section.lines.map(line => checkedMatchupText(line, answer.cards)).filter(Boolean) })).filter(section => section.lines.length);
  const picked = mode === "advance" ? sections.filter(section => !request.shownTopics?.includes(section.key)).slice(0, 3)
    : mode === "explain" ? sections.slice(0, 2) : request.focus && request.focus !== "general" ? sections.slice(0, 1) : sections;
  if (!picked.length && mode === "advance") return { answer: { kind: "text", text: exhaustedText(lang) }, topics: [] };
  const text = picked.map(section => `**${section.title}**\n${labelSlots(section.lines.join(" "), answer.cards)}`).join("\n\n");
  return { answer: { ...answer, precomputed: text || undefined }, topics: picked.map(section => section.key) };
}

/** 조건 검사 전 은행·노트의 근거 본문을 조립한다. 평가의 비교 기준도 이 함수를 쓴다. */
export function composeMatchupEvidence(data: AdvisorData, lang: Language, request: MatchupRequest, pair?: PrecomputedPair): MatchupReply {
  const { mine, enemy, question, focus } = request;
  const notes = matchupNotes(data, mine, enemy, lang);
  if (notes.plan && focus) notes.plan.focus = focus;
  if (notes.plan) notes.plan.question = question;
  const answer = buildCompareAnswer([mine, enemy], question, undefined, { matchup: true, notes, lang });
  if (answer.kind === "compare") {
    answer.more = request.more || undefined;
    answer.statQuery = undefined;
  }
  return selectMatchupReply(answer, pair, request, lang);
}

/** 은행·노트 조립의 최종 답 모두 같은 실행 조건 검사를 거친다. */
export function composeMatchupReply(data: AdvisorData, lang: Language, request: MatchupRequest, pair?: PrecomputedPair): MatchupReply {
  const reply = composeMatchupEvidence(data, lang, request, pair);
  if (reply.answer.kind !== "compare") return reply;
  const text = reply.answer.precomputed ?? answerProse(reply.answer, lang);
  const checked = conditionMatchupText(data, lang, request, text);
  if (checked.text === text) return reply;
  const blocks = text.split(/\n\s*\n/).filter(block => block.startsWith("**"));
  const blockIndices = text.split(/\n\s*\n/).flatMap((block, i) => block.startsWith("**") ? [i] : []);
  const topics = reply.topics.filter((_, i) => blocks[i] && (checked.retainedBlocks?.includes(blockIndices[i]) || checked.text.includes(blocks[i])));
  return { answer: { ...reply.answer, precomputed: checked.text }, topics: [...new Set([...topics, ...checked.topics])] };
}

export async function buildMatchupReply(data: AdvisorData, lang: Language, request: MatchupRequest): Promise<MatchupReply> {
  const pair = (await loadPrecomputed(data.patch, request.mine.id, lang))?.pairs[request.enemy.id];
  return composeMatchupReply(data, lang, request, pair);
}
