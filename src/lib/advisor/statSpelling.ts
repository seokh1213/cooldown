import type { StatName } from "@/lib/knowledge/facts";
import { editDistance, toJamo } from "./textDistance";

const terms: Array<[StatName, string[]]> = [
  ["health", ["체력", "생명력", "피통", "health"]],
  ["healthRegen", ["체력재생", "체력회복", "체젠", "healthregeneration", "hpregen"]],
  ["armor", ["방어력", "아머", "armor", "armour"]],
  ["magicResist", ["마법저항력", "마저", "마방", "magicresistance"]],
  ["attackDamage", ["공격력", "attackdamage"]],
  ["attackSpeed", ["공격속도", "공속", "attackspeed"]],
  ["moveSpeed", ["이동속도", "이속", "movementspeed"]],
];
const dictionary = terms.flatMap(([field, words]) => words.map(word => ({ field, word, jamo: toJamo(word) })));
const cache = new Map<string, Array<{ field: StatName; index: number; end: number }>>();

/** 사전의 정상 표기에서 자모 한 개가 다른 후보만 사용한다. 모호한 항목은 확정하지 않는다. */
export function statSpelling(question: string) {
  const previous = cache.get(question);
  if (previous) return previous;
  const chars = question.toLowerCase().split("").flatMap((char, index) => /\s/.test(char) ? [] : [{ char, index }]);
  const text = chars.map(entry => entry.char).join("");
  const matches: Array<{ field: StatName; index: number; end: number }> = [];
  for (let start = 0; start < text.length; start++) {
    const candidates: Array<{ field: StatName; length: number }> = [];
    for (const term of dictionary) for (const length of [term.word.length - 1, term.word.length, term.word.length + 1]) {
      if (length < 2 || start + length > text.length) continue;
      const word = text.slice(start, start + length);
      if (!/^[가-힣a-z]+$/.test(word)) continue;
      if (/^[가-힣]{2}$/.test(term.word) && /\s/.test(question.slice(chars[start].index, chars[start + length - 1].index + 1))) continue;
      if (term.field === "health" && /^(?:생명력|health)/.test(word)
        && /^(?:\s*흡수|\s*steal)/i.test(question.slice(chars[start + length - 1].index + 1))) continue;
      if (/[a-z]/.test(term.word) && (/[a-z]/.test(question[chars[start].index - 1] ?? "")
        || /[a-z]/.test(question[chars[start + length - 1].index + 1] ?? ""))) continue;
      const expanded = toJamo(word);
      if (Math.abs(expanded.length - term.jamo.length) > 1) continue;
      if (editDistance(expanded, term.jamo) !== 1 || 1 / term.jamo.length > 0.2) continue;
      candidates.push({ field: term.field, length });
    }
    const longest = Math.max(0, ...candidates.map(candidate => candidate.length));
    const best = candidates.filter(candidate => candidate.length === longest);
    if (new Set(best.map(candidate => candidate.field)).size !== 1) continue;
    matches.push({ field: best[0].field, index: chars[start].index, end: chars[start + longest - 1].index + 1 });
  }
  if (cache.size >= 1024) cache.delete(cache.keys().next().value!);
  cache.set(question, matches);
  return matches;
}
