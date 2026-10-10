import type { RetrievalDoc } from "../application/searchFallback";

const compact = (text: string) => text.replace(/\s+/g, "").toLowerCase();
const QUANTITY = /\d+(?:\.\d+)?(?:\s*[~～–-]\s*\d+(?:\.\d+)?)?\s*(?:%|퍼센트|초|분|시간|골드)/g;
const ASK_WORDS = /^(몇|얼마|얼마나|비율|퍼센트|시간|초|분|골드|문서|자료|설명|알려|되어|나와|적혀)/;

function requestedUnit(question: string): string | undefined {
  if (/비율|퍼센트|몇\s*%/.test(question)) return "%";
  if (/몇\s*초/.test(question)) return "초";
  if (/몇\s*분/.test(question)) return "분";
  if (/몇\s*시간/.test(question)) return "시간";
  if (/얼마|몇/.test(question) && /골드/.test(question)) return "골드";
  return undefined;
}

function questionAnchors(question: string, title: string): string[] {
  const text = question.replace(title, "");
  return [...new Set((text.match(/[가-힣0-9.]+/g) ?? [])
    .filter(word => !ASK_WORDS.test(word))
    .map(word => word.replace(/(?:에서는|에서|으로|마다|까지|부터|이라면|라면|인가요|인가|이야|야|은|는|이|가|을|를|의|에)$/, ""))
    .filter(word => word.length >= 2 || /\d/.test(word)))];
}

/** 한 줄에서 질문의 명시적 속성과 단위가 모두 일치할 때만 짧은 답을 허용한다. */
export function numericField(question: string, document: RetrievalDoc): { value: string; evidence: string } | undefined {
  const unit = requestedUnit(question), anchors = questionAnchors(question, document.title);
  if (!unit || anchors.length < 2) return undefined;
  const lines = document.text.split("\n").filter(line => anchors.every(anchor => compact(line).includes(compact(anchor))));
  const matches = lines.flatMap(line => (line.match(QUANTITY) ?? [])
    .filter(value => value.endsWith(unit) || unit === "%" && value.endsWith("퍼센트"))
    .map(value => ({ value, evidence: line.trim() })));
  // 같은 속성에 값이 둘이면 조건을 확정할 수 없어 원래 근거를 보여 준다.
  if (matches.length !== 1) return undefined;
  return matches[0];
}

export function verifiedNumeric(candidate: string, question: string, document: RetrievalDoc) {
  const field = numericField(question, document), scalar = candidate.trim();
  const quantities = scalar.match(QUANTITY);
  if (quantities?.length !== 1 || compact(quantities[0]) !== compact(scalar)
    || !field || compact(field.value) !== compact(scalar)) return undefined;
  return field;
}

function grams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
  return new Set(Array.from({ length: Math.max(0, normalized.length - 1) }, (_, i) => normalized.slice(i, i + 2)));
}

/** 학습·평가와 같은 질문 기반 문서 제한. 정답 위치를 사용하지 않는다. */
export function numericContext(document: string, question: string, budget = 1300): string {
  if (document.length <= budget) return document;
  const [heading, ...body] = document.split("\n"), title = heading.slice(0, Math.min(100, budget / 4));
  const lines = body.filter(line => line.trim()), terms = grams(question.replace(title, ""));
  const vocabulary = lines.map(grams), counts = new Map<string, number>();
  for (const words of vocabulary) for (const term of words) counts.set(term, (counts.get(term) ?? 0) + 1);
  const ranked = vocabulary.map((words, index) => ({ index, score: [...terms]
    .filter(term => words.has(term)).reduce((score, term) => score + Math.log(1 + lines.length / counts.get(term)!), 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  let remaining = budget - title.length - 1;
  const selected: number[] = [];
  for (const { index } of ranked) {
    if (lines[index].length + 1 > remaining) continue;
    selected.push(index); remaining -= lines[index].length + 1;
  }
  return selected.length ? `${title}\n${selected.sort((a, b) => a - b).map(index => lines[index]).join("\n")}` : document.slice(0, budget);
}
