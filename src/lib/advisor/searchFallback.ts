/**
 * 개체가 안 잡힌 질문을 모델이 만든 검색어로 찾는다
 *
 * 라우터는 챔피언·아이템·규칙 이름을 **글자로** 찾는다. 이름이 나오면 정확하지만,
 * 이름이 안 나오면 자료 없이 모델에게 넘어간다. 열에 셋이 그렇게 나갔다.
 *
 * 그 구간에서 모자란 것은 롤 지식이 아니라 **낱말**이었다.
 *   cs 어떻게 늘려?    미니언 문서에 "파밍: 미니언에 막타를 넣어 골드와 경험치를 얻는 것"
 *   와드 어디에 박아?  와드 문서에 "설치" 로 적혀 있다
 * 답은 이미 있는데 질문의 말과 자료의 말이 달라 못 만났다.
 *
 * 재 보니 일이 이렇게 갈렸다.
 *   모델이 잘함  은어 풀이. "cs" → "미니언 파밍 골드", "박아" → "설치 위치"
 *   모델이 망침  개체 이름. "트페" → 트리스타나, "말파 W" → 말파 Q
 * 그래서 **개체 판단은 주지 않고 검색어 만들기만 맡긴다.** 개체가 잡힌 질문은
 * 여기까지 오지도 않는다.
 *
 * 의미 검색(임베딩)을 쓰면 한 문항을 더 맞혔지만 모델을 1.2GB 더 받아야 한다.
 * 웹에서 2.97GB 위에 얹을 값이 아니라서 글자 검색으로 간다.
 */
import type { AdvisorData } from "./context";
import { aliasesOf } from "@/lib/knowledge/searchAliases";
import { asksPrice, gameMetaDocs } from "./gameMeta";
import { ruleLines, ruleName } from "@/lib/knowledge/rules";
import { matchesMechanicsQuestion, type MechanicsSection } from "@/lib/knowledge/mechanics";
import { searchTerms } from "./searchTerms";
import { htmlToText } from "./answerText";

export interface SearchDoc {
  /** 검색 문서 id(`rule:점화`). 하이브리드 검색이 벡터 점수와 맞춘다 */
  id?: string;
  kind: "rule" | "mechanics" | "meta";
  title: string;
  text: string;
  questionGroups?: string[][];
  tags?: string[];
}

function mechanicsDoc(section: MechanicsSection, lang: string): SearchDoc & { id: string } {
  const localized = lang === "en_US" || lang === "zh_CN" ? section.localized?.[lang] : undefined;
  return { id: `mech:${section.id}`, kind: "mechanics", title: localized?.title ?? section.title,
    text: localized?.text ?? section.text, questionGroups: section.questionGroups, tags: section.tags };
}

export interface SearchHit {
  doc: SearchDoc;
  score: number;
}

/**
 * 찾을 자료를 모은다.
 *
 * 스킬과 아이템은 넣지 않는다. 둘 다 이 경로에 **오기 전에** 이름으로 걸러지므로
 * 여기 온 질문에는 그 이름이 없다. 재 보니 아이템 800건을 섞으면 규칙 70건이 수적으로
 * 밀려서, "와드 위치 추천" 이 와드 문서 대신 아이템 "시야 와드" 를 물어 왔다.
 */
export function buildSearchCorpus(data: AdvisorData, lang = "ko_KR"): SearchDoc[] {
  const docs: SearchDoc[] = [];
  // 화면 언어의 이름·본문으로 찾는다. 한국어 이름만 두었더니 영어·중국어 질문이 규칙을 하나도 못 찾았다.
  for (const rule of new Set(data.ruleIndex.values())) {
    docs.push(ruleDoc(data, rule, lang));
  }
  for (const section of data.mechanics) {
    docs.push(mechanicsDoc(section, lang));
  }
  return docs;
}

function tokenize(query: string): string[] {
  return searchTerms(query);
}

/** 한국어는 띄어쓰기로 낱말이 안 갈린다("미니언에" "미니언을"). 부분 문자열로 센다. */
function occurrences(haystack: string, needle: string): number {
  let found = 0;
  let at = haystack.indexOf(needle);
  while (at >= 0) {
    found += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return found;
}

const K1 = 1.2;
const B = 0.75;
/** 제목에 있는 말은 본문에 있는 말보다 그 문서를 잘 가리킨다. */
const TITLE_WEIGHT = 3;

/**
 * BM25 로 찾는다.
 *
 * 낱말이 몇 문서에 나오는지로 나누고(idf), 문서 길이로 보정한다. 길이 보정이 없으면
 * 긴 문서가 흔한 말을 전부 품어서 이긴다.
 *
 * **점수로 맞고 틀림을 가르지 않는다.** 실제 검색어로 재 보니 맞은 것이 0.344,
 * 틀린 것이 0.620 으로 갈라지지 않았다. 대신 정답은 상위 3위 안에 8/8 로 들어왔다.
 * 그래서 문턱을 두지 않고 셋을 그대로 모델에게 넘겨 고르게 한다.
 */
export function lexicalSearch(docs: SearchDoc[], query: string, top = 3): SearchHit[] {
  docs = docs.filter(doc => matchesMechanicsQuestion(doc, query));
  const normalized = docs.map(doc => ({ title: searchTerms(doc.title).join(" "), text: searchTerms(doc.text).join(" ") }));
  const terms = tokenize(query);
  if (terms.length === 0 || docs.length === 0) return [];

  const idf = terms.map((term) => {
    const df = normalized.filter((doc) => doc.title.includes(term) || doc.text.includes(term)).length;
    return df === 0 ? 0 : Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
  });
  if (idf.every((weight) => weight === 0)) return [];

  const lengths = docs.map((doc) => doc.text.length);
  const average = lengths.reduce((sum, length) => sum + length, 0) / docs.length;

  return docs
    .map((doc, index) => {
      let score = 0;
      terms.forEach((term, i) => {
        if (idf[i] === 0) return;
        const tf = occurrences(normalized[index].text, term) + occurrences(normalized[index].title, term) * TITLE_WEIGHT;
        if (tf === 0) return;
        const norm = K1 * (1 - B + (B * lengths[index]) / average);
        score += idf[i] * ((tf * (K1 + 1)) / (tf + norm));
      });
      return { doc, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => Number(titleMentions(query.toLowerCase(), b.doc.title.toLowerCase()))
      - Number(titleMentions(query.toLowerCase(), a.doc.title.toLowerCase())) || b.score - a.score)
    .slice(0, top);
}

/**
 * 제목을 가리키는 낱말인가. 영어 기능어는 빼고, 영문은 낱말 경계로(대소문자 무시) 본다.
 *
 * 예전에는 "the" 도 제목 낱말로 쳐서 "the rune that gives bonus damage after you dash" 가 "Walk on **the** water" 로,
 * "that precision rune …" 이 "Press **the** Attack" 으로 갔다(이름 없는 질문 720문항 중 영어 40건).
 */
const ENGLISH_FUNCTION_WORDS = new Set(
  "the that this what which when where does did how why who with from for you your are was were can could should would and but not its it's into onto about after before still then than them they their there here have has had get got give gives just like also only very much many more most some any all each every one two three is be been being do doing to of in on at by as or if so up out off back my me mine i we us our".split(" "),
);
function titleMentions(title: string, term: string): boolean {
  if (/^[A-Za-z0-9'-]+$/.test(term)) {
    const word = term.toLowerCase();
    if (word.length < 3 || ENGLISH_FUNCTION_WORDS.has(word)) return false;
    return new RegExp(`(?<![a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(title.toLowerCase());
  }
  return title.includes(term);
}

export function mentionsSearchDocument(doc: Pick<SearchDoc, "title" | "text">, question: string): boolean {
  return tokenize(question).some(term => searchTerms(`${doc.title} ${doc.text}`).includes(term));
}

/**
 * 찾은 자료를 모델 없이 그대로 보인다 — 모델은 카드 없는 답을 쓰지 않는다.
 *
 * 검색 길에서 0.8B 가 자료를 읽고 답을 쓰게 두었더니, 이어 묻기가 잘못 흘러든 "정글이 자꾸 탑으로 오는데 그럴 땐?" 에
 * "정글은 탑으로 오지 않습니다. 게임 내에서 탑은 플레이어의 캐릭터이며 …" 를 지어냈다. 자료 문장 중 질문 낱말이
 * 든 것만 옮긴다. 1위가 틀릴 수 있어(정답은 상위 3위 안에 8/8) 두 문서까지 싣는다. 걸리는 문장이 없으면 undefined.
 */
export function hitsToAnswer(hits: SearchHit[], question: string, maxDocs = 2, maxLines = 3): string | undefined {
  if (/포션|물약|potion|药水/i.test(question) && asksPrice(question)) return undefined;
  const terms = question.split(/[\s,.·?!"'()[\]]+/).map(term => term.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|과|와|도|만|이나|나)$/, "")).filter(term => term.length >= 2);
  const parts: string[] = [];
  for (const hit of hits) {
    // 제목에 질문 낱말이 있는 문서만. "정글이 자꾸 탑으로 오는데" 가 "정글" 한 낱말로 기민한 발놀림(정글 식물)을 끌어왔다.
    if (!terms.some((term) => titleMentions(hit.doc.title, term))) continue;
    const lines = hit.doc.text
      .split(/\n+/)
      .map((line) => line.replace(/^[-*#>\s]+/, "").trim())
      .filter((line) => line.length >= 8 && !line.startsWith("|") && !line.startsWith("```"))
      .filter((line) => terms.some((term) => line.includes(term)));
    if (!lines.length) continue;
    parts.push(`**${hit.doc.title}**\n${lines.slice(0, maxLines).join("\n")}`);
    if (parts.length >= maxDocs) break;
  }
  return parts.length ? parts.join("\n\n") : undefined;
}

/** 낱말로 걸린 문서와 그것을 찾은 단계. 앱의 이름 없는 질문 순서(룬·주문 이름·은어 → 게임 메타 낱말 → 게임 원리 낱말)와 같다. */
export interface LexicalHit {
  id: string;
  step: "rule" | "meta" | "mech";
}

/** 검색 문서 하나. 문서 벡터(`doc-vectors`)와 같은 id·제목·본문. */
export interface RetrievalDoc {
  id: string;
  kind: "rule" | "mechanics" | "meta";
  title: string;
  text: string;
}

/**
 * 이름 없는 질문의 검색 문서 — 규칙 70 · 게임 원리 9 · 게임 메타 21. 문서 벡터를 만든 목록과 같아야 한다
 * (`scripts/llm/vector-search/corpus.ts dump` 가 이것을 쓴다). `withAliases` 면 본문 끝에 은어를 붙인다(BM25 용).
 */
export function buildRetrievalDocs(data: AdvisorData, lang: string, withAliases = false): RetrievalDoc[] {
  const docs: RetrievalDoc[] = [];
  for (const rule of new Set(data.ruleIndex.values())) {
    docs.push(ruleDoc(data, rule, lang));
  }
  for (const section of data.mechanics) docs.push(mechanicsDoc(section, lang));
  for (const fact of gameMetaDocs(lang)) docs.push({ ...fact, kind: "meta" });
  return withAliases ? docs.map((doc) => ({ ...doc, text: `${doc.text}\n${aliasesOf(doc.id).join(" ")}` })) : docs;
}

function ruleDoc(data: AdvisorData, rule: import("@/lib/knowledge/rules").RuleNotes, lang: string): RetrievalDoc {
  const names = [rule.name, rule.nameEn, rule.nameZh];
  const core = rule.subject === "rune" ? data.runes?.find(entry => names.includes(entry.name))
    : rule.subject === "summoner" ? data.summoners?.find(entry => names.includes(entry.name) && entry.modes?.includes("CLASSIC")) : undefined;
  const text = [core ? htmlToText(core.tooltip ?? "") : undefined, ...ruleLines(rule, lang)].filter(Boolean).join("\n");
  return { id: `rule:${rule.name}`, kind: "rule", title: ruleName(rule, lang), text };
}

/** 이름이 생략된 효과 설명은 기본 툴팁과 예외 규칙을 함께 검색한다. */
export function descriptiveRuleHit(data: AdvisorData, question: string): LexicalHit | undefined {
  const rune = /룬|키스톤|\brune\b|\bkeystone\b|符文|基石/i.test(question);
  const summoner = /스펠|소환사\s*주문|summoner|召唤师技能/i.test(question) && !rune;
  if (!rune && !summoner) return undefined;
  const historical = /예전|옛날|삭제|과거|\b(?:old|former|removed|historical)\b|以前|过去|旧|曾经/i.test(question);
  const schools: Array<[RegExp, number]> = [[/지배|domination|主宰/i, 8100], [/정밀|precision|精密/i, 8000], [/결의|resolve|坚决/i, 8400], [/마법\s*(?:룬|핵심)|sorcery|巫术/i, 8200], [/영감|inspiration|启迪/i, 8300]];
  const path = schools.find(([pattern]) => pattern.test(question))?.[1];
  const candidates = new Set([...data.ruleIndex.values()].filter(rule => {
    if (rune ? rule.subject !== "rune" : rule.subject !== "summoner") return false;
    const names = [rule.name, rule.nameEn, rule.nameZh];
    const primary = (rune ? data.runes : data.summoners)?.find(entry => names.includes(entry.name));
    if (!historical && !primary) return false;
    return !rune || path === undefined || Boolean(data.runes?.some(entry => names.includes(entry.name) && entry.pathId === path));
  }).map(rule => `rule:${rule.name}`));
  const docs = buildRetrievalDocs(data, data.locale ?? "ko_KR").filter(doc => candidates.has(doc.id));
  const coreDocs = docs.map(doc => {
    const rule = data.ruleIndex.get(doc.id.slice(5))!;
    const names = [rule.name, rule.nameEn, rule.nameZh];
    const core = [...(data.runes ?? []), ...(data.summoners ?? [])].find(entry => names.includes(entry.name));
    return { ...doc, text: core ? htmlToText(core.tooltip ?? "") : doc.text };
  });
  const description = question.split(/[,，—]|\s[-–]\s/)[0];
  const specific = searchTerms(description).filter(term => !["rune", "summoner", "domination", "precision", "sorcery", "resolve", "inspiration"].includes(term)).join(" ");
  const coreHits = new Map(lexicalSearch(coreDocs, specific, docs.length).map(hit => [hit.doc.id!, hit.score]));
  const queryTerms = new Set(searchTerms(specific));
  const matches = (terms: string[], term: string) => terms.some(word => word === term || /[가-힣\u3400-\u9fff]/.test(term) && word.startsWith(term));
  const coreMatches = new Map(coreDocs.map(doc => [doc.id, [...queryTerms].filter(term => matches(searchTerms(doc.text), term)).length]));
  const hits = lexicalSearch(docs, specific, docs.length).map(hit => ({ ...hit,
    score: ((coreHits.get(hit.doc.id!) ?? 0) + hit.score * .15) * Math.max(1, coreMatches.get(hit.doc.id!) ?? 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 2);
  const first = hits[0];
  if (!first || hits[1] && first.score < hits[1].score * 1.15) return undefined;
  const terms = searchTerms(question).filter(term => !["rune", "summoner", "domination", "precision", "sorcery", "resolve", "inspiration"].includes(term));
  const body = searchTerms(first.doc.text);
  const matched = terms.filter(term => matches(body, term)).length;
  if (matched < 2 && !(path !== undefined && matched === 1 && (coreMatches.get(first.doc.id!) ?? 0) === 1
    && (!hits[1] || first.score >= hits[1].score * 1.3))) return undefined;
  return { id: first.doc.id!, step: "rule" };
}

/**
 * 하이브리드 검색 — 문서마다 벡터 코사인과 낱말 점수를 한 점수로 합친다.
 *
 *   점수 = 코사인 + 0.05 · BM25(질문 안 1위 = 1) + (이름·은어 0.5 · 게임 메타 0.1 · 게임 원리 0.1) · (낱말 단계가 가리킨 문서)
 *   답   1위 ≥ 0.43          후보   답이 없고 1위 ≥ 0.35 이면 상위 3건을 "혹시 이 자료를?" 으로
 *
 * 벡터는 바꿔 말한 질문에 강하고 이름·은어를 그대로 넣은 짧은 질문에 약했다("cs가 뭐야?" 가 문턱 밑, "PTA 포탑에도 터져?" 는
 * 집중 공격이 22위). 낱말은 그 반대다. 값은 시험 세트의 dev 절반에서 골랐고(이름 넣은 질문 22개 퇴보 금지), 평가는 나머지로:
 *
 *   맞음 · 틀린 자료          시험 test 절반 355   실제에 가까운 44   이름 넣은 22
 *   낱말만(예전 앱)           212 · 31             24 · 15            22 · 0
 *   벡터만                    288 · 31             28 · 10            11 · 1
 *   규칙으로 고르기            296 · 38             26 · 14            22 · 0
 *   이 합산(메타 0.05)        299 · 32             26 · 14            22 · 0
 *   이 합산(메타 0.1)         298 · 33             26 · 15            26 · 0 (+ 바론 등장 4문항)
 * 메타 0.05 에서 "바론 몇 분에 나와?" 가 협곡의 전령으로 갔다 — 전령 본문에 "20분에 그 자리에 내셔 남작이 나옵니다" 가 있어 벡터가
 * 전령을 1위로 둔다. 흔한 질문이라 한 문항씩을 내주고 0.1 로 올렸다.
 * 후보 제시(0.35)는 답하지 못한 것 중 test 14 · 실제 2 를 살리고, 답 없는 질문 test 9 · 실제 3 에 후보를 띄운다.
 * research/llm-evals/vector-search/hybrid_score.py
 */
export const HYBRID = { bm25: 0.05, lexical: { rule: 0.5, meta: 0.1, mech: 0.1 }, answer: 0.43, suggest: 0.35 } as const;

export function hybridSearch(
  vector: Array<{ id: string; score: number }>,
  bm25: SearchHit[],
  lexical: LexicalHit | undefined,
): { answer?: string; related?: string[] } {
  const bmById = new Map(bm25.map((hit) => [(hit.doc as SearchDoc & { id?: string }).id ?? hit.doc.title, hit.score]));
  const bmMax = Math.max(0, ...bmById.values());
  const ranked = vector
    .map(({ id, score }) => ({
      id,
      score:
        score +
        (bmMax > 0 ? (HYBRID.bm25 * (bmById.get(id) ?? 0)) / bmMax : 0) +
        (lexical && lexical.id === id ? HYBRID.lexical[lexical.step] : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top) return {};
  if (top.score >= HYBRID.answer) return { answer: top.id };
  if (top.score >= HYBRID.suggest) return { related: ranked.slice(0, 3).map((doc) => doc.id) };
  return {};
}
