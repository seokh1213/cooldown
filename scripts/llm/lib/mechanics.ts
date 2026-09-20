/**
 * 게임 메커니즘 절 색인
 *
 * `docs/lol-fundamentals.md` 는 저항·관통 적용 순서, 고정 피해, 스킬 가속, 치명타,
 * 강인함 같은 **챔피언과 무관한 규칙**을 정리해 둔 문서다. 사람이 쓴 것이라 그대로
 * 답의 근거로 쓸 수 있다.
 *
 * 검색어는 **문서에서 뽑는다.** 손으로 표를 적어 두면 문서가 바뀔 때 따로 고쳐야 하고,
 * 고치는 것을 잊으면 새 절은 영영 검색되지 않는다. 룬·주문 판정이 문서 제목으로
 * 찾아지는 것과 같은 원리로, 여기서도 글쓴이가 이미 표시해 둔 자리를 읽는다.
 *
 *   제목        `## 2. 관통과 감소, 그리고 적용 순서`
 *   표 첫 열    `| 감소(shred) | 대상의 저항 자체를 깎는다 | ...`
 *   굵은 글씨   `**우리 팀 전체**`
 *   코드        `1) 고정 감소 → 2) 비율 감소 → 3) 비율 관통 → 4) 고정 관통(물리 관통력/치사량)`
 *
 * 여러 절에 두루 나오는 말은 그 절을 가리키지 못하므로 뺀다. 이것도 세어서 정한다.
 */

export interface MechanicsSection {
  id: string;
  title: string;
  /** 이 절을 가리키는 말들. 문서에서 뽑는다. */
  keywords: string[];
  text: string;
}

export type MechanicsIndex = MechanicsSection[];

/** 조사·접속사처럼 뜻을 가리지 못하는 말. 길이가 아니라 쓸모로 거른다. */
const STOP_WORDS = new Set([
  "그리고", "또는", "대상", "효과", "범위", "구분", "경우", "때문", "이때", "다만",
  "우리", "전체", "적용", "사용", "기준", "수치", "표기", "참고", "예시", "정도",
]);

interface RawSection {
  heading: string;
  body: string;
}

/**
 * 부록부터는 읽지 않는다.
 *
 * 문서 뒷부분은 게임 지식이 아니라 **이 자료를 만드는 방법**에 대한 기록이다.
 * 그것까지 색인하면 사용자가 "넌 누구야" 라고 물었을 때 자료 이름으로
 * "위키 팁 — 수집했으나 프롬프트에는 넣지 않는다" 가 뜬다. 실제로 그랬다.
 *
 * 어느 절이 메모인지는 **글쓴이가 문서에 표시한다.** 여기에 제목 목록을 적어 두면
 * 문서가 바뀔 때 따로 고쳐야 하고, 고치는 것을 잊으면 또 새어 나간다. 검색어를
 * 문서에서 뽑는 것과 같은 원리다.
 */
function dropAppendix(markdown: string): string {
  const appendix = markdown.search(/^# (?!.*리그 오브 레전드)/m);
  return appendix < 0 ? markdown : markdown.slice(0, appendix);
}

function splitSections(markdown: string): RawSection[] {
  return dropAppendix(markdown)
    .split(/^## /m)
    .slice(1)
    .map((part) => {
      const newline = part.indexOf("\n");
      return {
        heading: (newline < 0 ? part : part.slice(0, newline)).trim(),
        body: newline < 0 ? "" : part.slice(newline + 1).trim(),
      };
    });
}

/** 글쓴이가 표시해 둔 자리에서만 후보를 모은다. 본문 아무 낱말이나 쓰지 않는다. */
function candidateTerms(section: RawSection): string[] {
  const found: string[] = [];

  // 제목: "관통과 감소, 그리고 적용 순서" → 관통, 감소, 적용 순서
  found.push(
    ...section.heading
      .replace(/^\d+(?:-\d+)?\.\s*/, "")
      .split(/[,、]|\s+그리고\s+/)
      .map((part) => part.trim()),
  );

  // 표 첫 열: "| 감소(shred) | ..." → 감소, shred
  for (const row of section.body.matchAll(/^\|\s*([^|]+?)\s*\|/gm)) {
    const cell = row[1].trim();
    if (/^-+$/.test(cell) || !cell) continue;
    found.push(cell.replace(/\([^)]*\)/g, "").trim());
    for (const inner of cell.matchAll(/\(([^)]+)\)/g)) found.push(inner[1].trim());
  }

  // 굵은 글씨와 코드
  for (const bold of section.body.matchAll(/\*\*([^*]+)\*\*/g)) found.push(bold[1].trim());
  for (const code of section.body.matchAll(/`([^`]+)`/g)) found.push(code[1].trim());
  for (const fence of section.body.matchAll(/```[\s\S]*?```/g)) {
    // "1) 고정 감소 → 2) 비율 감소 → ..." 처럼 화살표로 늘어놓은 단계
    for (const step of fence[0].split(/[→\n]/)) {
      const cleaned = step.replace(/^[\s`]*\d+\)\s*/, "").replace(/`/g, "").trim();
      if (cleaned) found.push(cleaned);
    }
  }

  return found
    .flatMap((term) => [term, ...term.split("/").map((part) => part.trim())])
    .map((term) => term.replace(/[()[\]]/g, "").trim())
    .filter((term) => term.length >= 2 && term.length <= 20)
    .filter((term) => !STOP_WORDS.has(term))
    .filter((term) => !/^\d/.test(term))
    // 굵은 글씨가 문장을 통째로 감싼 경우가 있다. 문장은 검색어가 아니다.
    .filter((term) => !/[.。=]|다$|니다$/.test(term))
    .filter((term) => term.split(/\s+/).length <= 3);
}

export function parseMechanics(markdown: string): MechanicsIndex {
  const sections = splitSections(markdown);
  const perSection = sections.map(candidateTerms);

  // 여러 절에 걸쳐 나오는 말은 그 절을 가리키지 못한다.
  const documentFrequency = new Map<string, number>();
  for (const terms of perSection) {
    for (const term of new Set(terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return sections.map((section, index) => ({
    id: section.heading.replace(/^\d+(?:-\d+)?\.\s*/, "").replace(/\s+/g, "-"),
    title: section.heading.replace(/^\d+(?:-\d+)?\.\s*/, ""),
    keywords: [...new Set(perSection[index])]
      .filter((term) => (documentFrequency.get(term) ?? 0) <= 2)
      .sort((a, b) => b.length - a.length),
    text: section.body,
  }));
}

/**
 * 질문에 나온 말로 절을 고른다.
 *
 * 검색어가 길수록 구체적이므로 맞은 말의 길이를 점수로 삼는다.
 * "관통" 하나보다 "물리 관통력" 이 맞은 절이 앞선다.
 */
export function findMechanics(
  index: MechanicsIndex,
  question: string,
  limit = 2,
): MechanicsSection[] {
  const text = question.toLowerCase();
  return index
    .map((section) => ({
      section,
      score: section.keywords
        .filter((word) => text.includes(word.toLowerCase()))
        .reduce((total, word) => total + word.length, 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.section);
}

export function mechanicsToText(sections: MechanicsSection[]): string | undefined {
  if (!sections.length) return undefined;
  return sections.map((s) => `### ${s.title}\n${s.text}`).join("\n\n");
}
