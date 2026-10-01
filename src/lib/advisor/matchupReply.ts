/** 상성 답 은행과 검증 노트를 공통 경로로 조립한다. */
import type { Language } from "@/i18n";
import type { ChampionCard } from "@/lib/knowledge/facts";
import type { AdvisorData } from "./context";
import { buildCompareAnswer, type AdvisorAnswer } from "./answer";
import { matchupNotes } from "./playbookNotes";
import { loadPrecomputed, precomputedDigest, precomputedMore, precomputedFocus } from "./precomputed";
import type { ScenarioCondition } from "./dialogueState";
import { digestSections } from "./prose";
import { labelSlots } from "./slotLabels";

interface MatchupRequest {
  question: string;
  mine: ChampionCard;
  enemy: ChampionCard;
  focus?: string;
  more?: boolean;
  scope?: "digest" | "topic";
  conditions?: ScenarioCondition[];
}

export async function buildMatchupReply(data: AdvisorData, lang: Language, request: MatchupRequest): Promise<AdvisorAnswer> {
  const { mine, enemy, question, focus } = request;
  const notes = matchupNotes(data, mine, enemy, lang);
  if (notes.plan && focus) notes.plan.focus = focus;
  if (notes.plan) notes.plan.question = question;
  const answer = buildCompareAnswer([mine, enemy], question, undefined, { matchup: true, notes, lang });
  if (answer.kind !== "compare") return answer;
  answer.more = request.more || undefined;
  const pair = (await loadPrecomputed(data.patch, mine.id, lang))?.pairs[enemy.id];
  if (pair) {
    // "더 자세히"·주제 없는 조언 요청(focus general)은 처음 답에 싣지 않은 칸이다. precomputedFocus 는 general 을 "조심할 것" 하나로 받아
    // 첫 답과 같은 칸을 되풀이했다("팁 좀 줘", "tips" — 2026-10-01 브라우저 시험).
    const restOnly = request.more && (!focus || focus === "general") && !request.conditions?.length;
    answer.precomputed = restOnly
      ? precomputedMore(pair, focus, [mine, enemy], lang) ?? precomputedDigest(pair, focus, [mine, enemy], lang)
      : request.scope === "topic"
      ? precomputedFocus(pair, { focus, reason: request.more, conditions: request.conditions }, [mine, enemy], lang)
      : (request.more ? precomputedMore : precomputedDigest)(pair, focus, [mine, enemy], lang);
  }
  if (!answer.precomputed && request.scope === "topic" && focus && focus !== "general") {
    const sections = digestSections(answer, lang, "focus-cue-all");
    const picked = request.more ? sections.slice(0, 2) : sections.slice(0, 1);
    answer.precomputed = picked.filter(section => section.lines.length).map(section => `**${section.title}**\n${labelSlots(section.lines.join(" "), answer.cards)}`).join("\n\n") || undefined;
  }
  return answer;
}
