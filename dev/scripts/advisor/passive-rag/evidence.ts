/** 질문 문형별 정답 문장을 고르지 않고, 챔피언의 전체 스킬에서 의미 검색한다. */
import type { ChampionCard } from "../../../../src/domain/knowledge/cards/contracts";
import type { AdvisorData } from "../../../../src/features/advisor/retrieval/context";
import { detectChampionMentions } from "../../../../src/features/advisor/understanding/champions/intent";

export interface SpellDoc { id: string; champion: string; slot: string; text: string }
export interface RagState { champion?: string; questions: string[] }
export const SYSTEM = "자료에 근거해 현재 질문에 직접 답하는 한국어 1~2문장만 쓰세요. 대상, 추가/기본 능력치, 횟수, 취소, 대상 조건, 부정을 보존하세요. 숫자는 자료에 있는 것만 쓰되 명시적으로 요청한 단순 계산은 할 수 있습니다. 자료로 확인할 수 없으면 '근거에서 확인할 수 없어요.'라고 답하세요. 요약이 본문보다 조건을 더 구체적으로 명시하면 요약의 조건을 따르세요. 스킬 목록, 아이템 추천, 인사말은 쓰지 마세요.";

export function spellDocs(card: ChampionCard): SpellDoc[] {
  return card.spells.map(spell => ({ id: `${card.id}:${spell.slot}`, champion: card.id, slot: spell.slot,
    text: `${card.name} ${spell.slot} ${spell.name}\n요약: ${spell.summary ?? ""}\n본문: ${spell.text}` }));
}

export function nextRagState(data: AdvisorData, state: RagState, question: string): RagState {
  const mentions = detectChampionMentions(data, question);
  if (mentions.length > 1) return { questions: [] };
  const champion = mentions[0]?.card.id ?? state.champion;
  const changed = champion !== state.champion;
  return { champion, questions: [...(changed ? [] : state.questions), question].slice(-3) };
}

export function searchText(state: RagState, name: string): string {
  return `${name} ${state.questions.join(" ")}`;
}

export function prompt(state: RagState, name: string, docs: readonly SpellDoc[]): string {
  return `대화의 챔피언: ${name}\n이전 질문: ${state.questions.slice(0, -1).join(" / ") || "없음"}\n현재 질문: ${state.questions.at(-1)}\n근거:\n${docs.map(doc => `[${doc.id}]\n${doc.text}`).join("\n\n")}`;
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  const dot = a.reduce((sum, value, i) => sum + value * b[i], 0);
  const norm = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0) * b.reduce((sum, value) => sum + value * value, 0));
  return norm ? dot / norm : 0;
}

export function rankDocs(docs: readonly SpellDoc[], embeddings: readonly number[][], query: readonly number[]) {
  return docs.map((doc, i) => ({ doc, score: cosine(query, embeddings[i]) })).sort((a, b) => b.score - a.score);
}
