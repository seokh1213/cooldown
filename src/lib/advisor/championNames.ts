import { resolveQuestion } from "./resolvedQuestion";
import { suggestChampions } from "./championTypo";
import { nicknames } from "./intent";
import { isGameWord } from "./questionDocs";
import type { AdvisorData } from "./context";

const nicknameCache = new WeakMap<AdvisorData, ReturnType<typeof nicknames>>();
export function nicknameMap(data: AdvisorData) {
  let cached = nicknameCache.get(data);
  if (!cached) { cached = nicknames(data.cards); nicknameCache.set(data, cached); }
  return cached;
}

export function correctNames(question: string, data: AdvisorData) {
  const nick = nicknameMap(data);
  let text = question;
  const changes: Array<{ original: string; id: string }> = [];
  const seen = new Set<string>();
  while (!seen.has(text)) {
    seen.add(text);
    const known = new Set(resolveQuestion(text, data).champions.map(card => card.id));
    const suggestion = suggestChampions(text, data.cards, nick, known, 1, token => isGameWord(data, token));
    if (!suggestion || suggestion.candidates.length !== 1) break;
    const card = suggestion.candidates[0];
    changes.push({ original: suggestion.original, id: card.id });
    text = text.replace(suggestion.original, card.name);
  }
  return { text, changes };
}

