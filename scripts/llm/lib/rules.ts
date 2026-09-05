/**
 * 룬·소환사 주문 판정 규칙
 *
 * 툴팁이 담지 못하는 발동 조건과 예외를 위키에서 모은 것이다.
 * 정복자 툴팁은 "기본 공격 또는 스킬로" 라고만 적혀 있지만 실제로는 소환사 주문도 중첩을 준다.
 * 그 차이 때문에 실제로 틀린 답을 냈다. 그래서 별도 계층으로 둔다.
 *
 * 파일 읽기는 로더 쪽에 있고 여기에는 선택과 서술만 둔다. 브라우저에서도 쓴다.
 */

export type RuleSubject = "rune" | "summoner";

export interface RuleNotes {
  name: string;
  page: string;
  subject: RuleSubject;
  /** 위키 원문 (영어). 번역이 틀렸을 때 대조용으로 남긴다. */
  notes: string[];
  /** 한국어 번역. `npm run llm:translate-rules` 가 채운다. */
  notesKo?: string[];
}

export type RuleIndex = Map<string, RuleNotes>;

export function indexRules(rules: RuleNotes[]): RuleIndex {
  return new Map(rules.map((r) => [r.name, r]));
}

/**
 * 문장에 언급된 룬·주문의 규칙을 찾는다.
 *
 * 이름이 긴 쪽을 먼저 맞춘다. "정복자" 와 "치명적 속도" 처럼 겹치는 이름은 없지만,
 * "점화" 가 "점화의 성물" 같은 이름 안에 들어갈 수 있다.
 */
export function findMentionedRules(index: RuleIndex, text: string, limit = 3): RuleNotes[] {
  const names = [...index.keys()].sort((a, b) => b.length - a.length);
  const found: RuleNotes[] = [];
  const taken: Array<[number, number]> = [];
  for (const name of names) {
    if (found.length >= limit) break;
    if (name.length < 2) continue;
    const at = text.indexOf(name);
    if (at < 0) continue;
    if (taken.some(([s, e]) => at < e && at + name.length > s)) continue;
    taken.push([at, at + name.length]);
    found.push(index.get(name)!);
  }
  return found;
}

/**
 * 질문에 직접 답하는 줄만 골라낸다.
 *
 * 규칙 원문이 영어라 소형 모델이 통째로 읽으면 반대로 답한다. 실제로 "점화는 정복자 스택에
 * 포함되지 않습니다" 라고 틀리게 답했다. 정복자 블록에 있는 "will not stack from these effects"
 * 쪽에 끌린 것이다.
 *
 * 그래서 **여러 규칙이 서로를 언급한 줄**을 따로 뽑아 맨 앞에 세운다.
 * "점화가 정복자 스택을 주는가" 의 답은 두 이름이 함께 나오는 줄에 있다.
 */
export function crossReferences(rules: RuleNotes[]): string[] {
  if (rules.length < 2) return [];
  const pages = rules.map((r) => r.page);
  const koreanNames = rules.map((r) => r.name);
  const hits: string[] = [];
  for (const rule of rules) {
    const otherEnglish = pages.filter((p) => p !== rule.page);
    const otherKorean = koreanNames.filter((n) => n !== rule.name);
    rule.notes.forEach((note, i) => {
      const ko = rule.notesKo?.[i];
      // 판정은 원문으로 하고 화면에는 번역을 낸다. 번역에서 이름이 달라져도 놓치지 않는다.
      const matched =
        otherEnglish.some((o) => note.includes(o)) ||
        (ko ? otherKorean.some((o) => ko.includes(o)) : false);
      if (matched) hits.push(ko ?? note);
    });
  }
  return [...new Set(hits)];
}

/**
 * 이름이 본문에만 나오는 규칙도 끌어온다.
 *
 * "감전은 소환사 주문으로 발동되나" 는 감전 문서가 아니라 점화 문서에 답이 있다.
 * 헤더만 보고 찾으면 놓친다.
 */
export function findRulesMentioning(index: RuleIndex, names: string[], limit = 2): RuleNotes[] {
  const english = names
    .map((n) => index.get(n)?.page)
    .filter((p): p is string => Boolean(p));
  if (!english.length) return [];
  const out: RuleNotes[] = [];
  for (const rule of index.values()) {
    if (out.length >= limit) break;
    if (english.includes(rule.page)) continue;
    if (rule.notes.some((n) => english.some((e) => n.includes(e)))) out.push(rule);
  }
  return out;
}

/**
 * 한 줄을 본문과 하위 항목으로 나눠 계층을 살린다.
 *
 * 수집 단계에서 하위 항목을 괄호로 이어 붙였는데, 그대로 두면 앞 문장의 조건과 멀어진다.
 * "…중첩되지 않습니다. (펫의 기본 공격 피해)" 를 보고 모델이 "펫으로 중첩된다" 고 뒤집었다.
 * 들여쓴 줄로 내려 부정 바로 아래에 붙인다.
 */
function renderNote(note: string): string[] {
  const parts = note.split(/\s\(/);
  const head = parts[0].trim();
  const children = parts.slice(1).map((p) => p.replace(/\)\s*$/, "").trim());
  if (!children.length) return [`  - ${head}`];
  return [`  - ${head}`, ...children.map((c) => `      · ${c}`)];
}

/**
 * 프롬프트에 실을 문단. 규칙이 없으면 undefined.
 *
 * **자르지 않는다.** 정복자·점화 질문에서 6건으로 잘랐더니 정작 답이 되는 문장
 * ("점화는 정복자 2중첩을 준다") 이 잘려 나가 "자료에 없습니다" 라고 답했다.
 * 규칙은 한 종당 스무 줄을 넘지 않으므로 전부 싣는 편이 낫다.
 *
 * 질문에 다른 룬이 함께 나오면 서로를 언급한 줄이 답인 경우가 많다.
 * 그래서 함께 언급된 이름이 들어간 줄을 앞으로 올린다.
 */
export function rulesToText(rules: RuleNotes[]): string | undefined {
  if (!rules.length) return undefined;
  const englishNames = rules.map((r) => r.page);
  const crossed = crossReferences(rules);
  const koreanNames = rules.map((r) => r.name);
  const blocks = rules.map((rule) => {
    const others = englishNames.filter((n) => n !== rule.page);
    const otherKorean = koreanNames.filter((n) => n !== rule.name);
    // 번역이 있으면 그것을 싣는다. 소형 모델은 영어 규칙을 한국어 질문에 대응시키지 못한다.
    const lines = rule.notesKo?.length === rule.notes.length ? rule.notesKo : rule.notes;
    const sorted = [...lines].sort((a, b) => {
      const score = (n: string) =>
        others.some((o) => n.includes(o)) || otherKorean.some((o) => n.includes(o)) ? 0 : 1;
      return score(a) - score(b);
    });
    // 하위 항목을 괄호로 이어 붙이면 앞 문장의 부정과 멀어진다.
    // "…중첩되지 않습니다. (펫의 기본 공격 피해)" 를 보고 모델이 "펫으로 중첩된다" 고 뒤집었다.
    // 들여쓴 줄로 내려 부정 바로 아래에 붙인다.
    const notes = sorted.flatMap((n) => renderNote(n));
    // 이름 대응을 헤더에 못 박는다. 규칙 원문이 영어라 "점화 = Ignite" 를 모델이 이어 주지 못하면
    // 답이 눈앞에 있어도 "자료에 없습니다" 라고 답한다. 실제로 그랬다.
    return `[${rule.name} = ${rule.page}]\n${notes.join("\n")}`;
  });
  const allTranslated = rules.every((r) => r.notesKo?.length === r.notes.length);
  const glossary = rules.map((r) => `${r.name} = ${r.page}`).join(", ");
  const head = allTranslated
    ? "[판정 규칙 — 툴팁에 없는 내용입니다. 여기 적힌 것만 근거로 삼으십시오]"
    : "[판정 규칙 — 툴팁에 없는 내용입니다. 여기 적힌 것만 근거로 삼으십시오]\n" +
      `규칙 원문은 영어입니다. 이름 대응: ${glossary}.\n` +
      "영어 문장 안의 이름을 위 대응표로 바꿔 읽고 한국어로 답하십시오.";
  // 서로를 언급한 줄이 대개 답이다. 맨 앞에 따로 세운다.
  const crossBlock = crossed.length
    ? `\n\n[질문에 직접 답하는 줄]\n${crossed.map((n) => `  - ${n}`).join("\n")}`
    : "";
  return `${head}${crossBlock}\n\n${blocks.join("\n\n")}`;
}

/**
 * 화면에 그대로 낼 규칙 답변. **모델을 거치지 않는다.**
 *
 * e2b 는 부정문을 뒤집는다. "정복자는 이러한 효과로 중첩되지 않습니다 · 펫의 기본 공격 피해"
 * 를 보고 "정복자는 펫의 기본 공격으로 중첩됩니다" 라고 답했다. 계층을 살려도 마찬가지였다.
 *
 * 규칙 질문의 답은 규칙문 자체다. 모델이 더할 것이 없고 뒤집을 위험만 있다.
 * 그래서 원문(번역본)을 그대로 낸다. 구조상 틀릴 수가 없다.
 *
 * 다만 순서는 손봐야 한다. "정복자 스택에 점화는 포함되나" 의 답은 정복자 스무 줄 중
 * 한 줄이라, 문서 순서대로 내면 정작 답이 화면 아래로 밀린다.
 * 두 이름이 함께 나오는 줄을 맨 앞에 따로 세운다.
 */
export function buildRuleAnswer(rules: RuleNotes[], patch: string): string | undefined {
  if (!rules.length) return undefined;
  const crossed = crossReferences(rules);
  const blocks = rules.map((rule) => {
    const lines = rule.notesKo?.length === rule.notes.length ? rule.notesKo : rule.notes;
    const body = lines.flatMap((n) => renderNote(n)).join("\n");
    return `## ${rule.name}\n${body}`;
  });
  const answerFirst = crossed.length
    ? [`## 질문에 직접 답하는 줄\n${crossed.flatMap((n) => renderNote(n)).join("\n")}`]
    : [];
  return [
    ...answerFirst,
    ...blocks,
    `_패치 ${patch} 기준 위키(CC BY-SA) 판정 규칙을 그대로 옮긴 것입니다. ` +
      "요약하지 않았으므로 부정과 예외를 그대로 읽어 주십시오._",
  ].join("\n\n");
}
