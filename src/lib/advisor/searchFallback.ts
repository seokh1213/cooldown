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
import { aliasesOf } from "../../../scripts/llm/lib/searchAliases";
import { gameMetaDocs } from "./gameMeta";
import { ruleLines, ruleName } from "../../../scripts/llm/lib/rules";

export interface SearchDoc {
  /** 검색 문서 id(`rule:점화`). 하이브리드 검색이 벡터 점수와 맞춘다 */
  id?: string;
  kind: "rule" | "mechanics" | "meta";
  title: string;
  text: string;
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
    docs.push({ kind: "rule", title: ruleName(rule, lang), text: ruleLines(rule, lang).join("\n") });
  }
  for (const section of data.mechanics) {
    docs.push({ kind: "mechanics", title: section.title, text: section.text });
  }
  return docs;
}

/** 조사를 떼야 "미니언을" 과 "미니언" 이 만난다. */
const PARTICLE = /(은|는|이|가|을|를|의|에|에서|으로|로|과|와|도|만|이나|나)$/;

function tokenize(query: string): string[] {
  const terms = query
    .split(/[\s,.·?!"'()[\]]+/)
    .map((term) => term.replace(PARTICLE, ""))
    .filter((term) => term.length >= 2);
  return [...new Set(terms)];
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
  const terms = tokenize(query);
  if (terms.length === 0 || docs.length === 0) return [];

  const idf = terms.map((term) => {
    const df = docs.filter((doc) => doc.title.includes(term) || doc.text.includes(term)).length;
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
        const tf = occurrences(doc.text, term) + occurrences(doc.title, term) * TITLE_WEIGHT;
        if (tf === 0) return;
        const norm = K1 * (1 - B + (B * lengths[index]) / average);
        score += idf[i] * ((tf * (K1 + 1)) / (tf + norm));
      });
      return { doc, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}

export const SEARCH_QUERY_SYSTEM = `너는 리그 오브 레전드 자료를 찾는 검색어를 만든다.
사용자가 줄임말이나 은어로 물으면 게임 안의 정식 용어로 바꿔라.
예: "cs" 는 미니언을 처치해 얻는 점수이므로 "미니언 파밍 골드" 로 바꾼다.
게임에 실제로 있는 말만 써라. 없는 말을 지어내지 마라.
검색어 한 줄만 출력한다. 질문에 답하지 마라. 설명하지 마라.`;

export function buildQueryPrompt(question: string, tried: string[]): string {
  if (tried.length === 0) return question;
  return [
    `질문: ${question}`,
    `이미 써 본 검색어: ${tried.join(", ")}`,
    "아무것도 찾지 못했다. 완전히 다른 낱말로 검색어를 하나 만들어라.",
  ].join("\n");
}

/**
 * 모델이 뱉은 글에서 검색어만 추린다.
 *
 * 시키는 대로 안 할 때가 있다. 검색어 자리에 답을 쓰거나("럼블 E 는 …깎지 않습니다"),
 * `검색어: ` 를 앞에 붙이거나, 따옴표로 감싼다. 어차피 낱말 단위로 쪼개 쓰므로
 * 겉을 벗기고 길이만 자른다.
 */
export function extractQuery(text: string): string {
  const line = text.trim().split("\n").find((candidate) => candidate.trim().length > 0) ?? "";
  return line
    .replace(/^\s*(검색어|질의|query)\s*[:：]\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .slice(0, 60);
}

/**
 * 문서에서 질문에 걸리는 문장만 고른다.
 *
 * 앞머리부터 잘라 쓰면 안 된다. 미니언 문서는 1,296자인데 답인 "파밍: 미니언에 막타를
 * 넣어 골드와 경험치를 얻는 것" 이 886자 지점에 있었다. 700자에서 자르니 그 줄이
 * 사라졌고, 모델은 문서를 받고도 "자료에 없습니다" 라고 답했다.
 *
 * 문서 한 줄이 한 문장이므로 줄 단위로 고르고, 원래 순서로 되돌려 잇는다.
 */
function selectLines(text: string, terms: string[], limit: number): string {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length <= limit) return lines.join("\n");

  const ranked = lines
    .map((line, index) => ({
      index,
      line,
      score: terms.filter((term) => line.includes(term)).length,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index);

  return ranked.map((entry) => entry.line).join("\n");
}

/** 한 문서에서 실을 줄 수. 셋을 실어도 프롬프트가 길어지지 않을 만큼만 둔다. */
const LINES_PER_DOC = 8;

/**
 * 찾은 자료를 프롬프트에 실을 글로 만든다.
 *
 * 셋 다 싣는다. 어느 것이 답인지는 모델이 고른다. 하나만 싣고 그것이 틀리면
 * 모델은 틀린 자료로 답할 수밖에 없다.
 *
 * 프롬프트가 6,000자에 가까워지면 브라우저 런타임이 정렬 오류로 죽는다. 그래서
 * 문서마다 줄 수를 묶어 둔다.
 */
/**
 * 찾은 자료를 모델 없이 그대로 보인다 — 가벼운 모델(0.8B)은 글을 쓰지 않는다.
 *
 * 검색 길에서 0.8B 가 자료를 읽고 답을 쓰게 두었더니, 이어 묻기가 잘못 흘러든 "정글이 자꾸 탑으로 오는데 그럴 땐?" 에
 * "정글은 탑으로 오지 않습니다. 게임 내에서 탑은 플레이어의 캐릭터이며 …" 를 지어냈다. 자료 문장 중 질문 낱말이
 * 든 것만 옮긴다. 1위가 틀릴 수 있어(정답은 상위 3위 안에 8/8) 두 문서까지 싣는다. 걸리는 문장이 없으면 undefined.
 */
/**
 * 제목을 가리키는 낱말인가. 영어 기능어는 빼고, 영문은 낱말 경계로(대소문자 무시) 본다.
 *
 * 예전에는 "the" 도 제목 낱말로 쳐서 "the rune that gives bonus damage after you dash" 가 "Walk on **the** water" 로,
 * "that precision rune …" 이 "Press **the** Attack" 으로 갔다(이름 없는 질문 720문항 중 영어 40건).
 */
const ENGLISH_FUNCTION_WORDS = new Set(
  "the that this what which when where does did how why who with from for you your are was were can could should would and but not its it's into onto about after before still then than them they their there here have has had get got give gives just like also only very much many more most some any all each every one two three is be been being do doing to of in on at by as or if so up out off my me mine i we us our".split(" "),
);
function titleMentions(title: string, term: string): boolean {
  if (/^[A-Za-z0-9'-]+$/.test(term)) {
    const word = term.toLowerCase();
    if (word.length < 3 || ENGLISH_FUNCTION_WORDS.has(word)) return false;
    return new RegExp(`(?<![a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(title.toLowerCase());
  }
  return title.includes(term);
}

export function hitsToAnswer(hits: SearchHit[], question: string, maxDocs = 2, maxLines = 3): string | undefined {
  const terms = tokenize(question);
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

export function searchContext(hits: SearchHit[], patch: string, query: string): string {
  const terms = tokenize(query);
  return [
    "아래는 질문과 관련해 찾은 자료다.",
    "",
    // 질문의 말과 자료의 말을 잇는 다리다. 이것이 없으면 "cs가 뭐야?" 에 파밍 설명을
    // 실어 줘도 "'cs' 에 대한 설명이 없습니다" 라고 답한다.
    //
    // 다만 문장으로 주면 안 된다. `아래는 "미니언 파밍 골드" 로 찾은 자료다` 라고 썼더니
    // 모델이 그것을 출처 이름으로 읽고 "CS는 **미니언 파밍 골드에서** 미니언에 막타를
    // 넣어…" 라고 답했다. 낱말만 늘어놓아 답에 그대로 실리지 않게 한다.
    `질문에 쓴 말과 자료에 적힌 말이 다를 수 있다. 이 질문은 ${terms.join(", ")} 와 같은 뜻이다.`,
    // 이 두 줄이 없으면 자료를 주고도 "정보가 없습니다" 가 나온다.
    //
    // "cs 어떻게 늘려?" 에 미니언 문서를 실어 줬더니 그 안에 "파밍: 미니언에 막타를 넣어
    // 골드와 경험치를 얻는 것" 이 있는데도 모른다고 답했다. 검색할 때는 제가 cs 를
    // 파밍으로 풀어 놓고, 답할 때는 자료에서 "CS" 라는 글자를 찾다가 없다고 한 것이다.
    // 그래서 말이 다를 수 있다는 것을 답하는 자리에서 다시 일러 준다.
    "뜻이 같으면 그 내용으로 답해라. 자료에 정말 없는 것만 모른다고 해라.",
    "찾은 검색어를 답에 쓰지 마라. 자료에 적힌 말로 답해라.",
    "",
    hits
      .map((hit) => `### ${hit.doc.title}\n${selectLines(hit.doc.text, terms, LINES_PER_DOC)}`)
      .join("\n\n"),
    "",
    `패치 ${patch} 기준이다.`,
  ].join("\n");
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
    docs.push({ id: `rule:${rule.name}`, kind: "rule", title: ruleName(rule, lang), text: ruleLines(rule, lang).join("\n") });
  }
  for (const section of data.mechanics) docs.push({ id: `mech:${section.id}`, kind: "mechanics", title: section.title, text: section.text });
  for (const fact of gameMetaDocs(lang)) docs.push({ ...fact, kind: "meta" });
  return withAliases ? docs.map((doc) => ({ ...doc, text: `${doc.text}\n${aliasesOf(doc.id).join(" ")}` })) : docs;
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
