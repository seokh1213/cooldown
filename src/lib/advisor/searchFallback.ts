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

export interface SearchDoc {
  kind: "rule" | "mechanics";
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
export function buildSearchCorpus(data: AdvisorData): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const rule of data.ruleIndex.values()) {
    const lines = rule.notesKo?.length === rule.notes.length ? rule.notesKo : rule.notes;
    docs.push({ kind: "rule", title: rule.name, text: lines.join("\n") });
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
