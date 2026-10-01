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
    answer.precomputed = request.scope === "topic"
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
