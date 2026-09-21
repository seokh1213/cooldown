/**
 * 운용 노트의 문장 끝을 한다체에서 합니다체로 옮긴다
 *
 * 노트 9,359문장이 전부 한다체다. 이 글이 해설 프롬프트에 그대로 실리는데,
 * 모델은 지시문보다 눈앞의 자료 문체를 따라간다. 16답 중 15답이 합니다체를 버리고
 * 한다체로 샜다. 프롬프트 맨 끝에 문체 규칙을 한 번 더 넣어 봤더니 16/16 으로
 * 오히려 나빠졌다. 지시로 이길 수 없으면 재료를 고치는 편이 맞다.
 *
 * 바꾸는 것은 **문장 끝** 뿐이다. 연결형(~하고, ~하면, ~므로)은 두 문체가 같다.
 */

const HANGUL_BASE = 0xac00;
const JONG_COUNT = 28;
/** 종성 인덱스: 없음 0, ㄴ 4, ㅂ 17 */
const JONG_NONE = 0;
const JONG_N = 4;
const JONG_B = 17;

function isHangulSyllable(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= HANGUL_BASE && code <= 0xd7a3;
}

function finalIndex(ch: string): number {
  return ((ch.codePointAt(0) ?? 0) - HANGUL_BASE) % JONG_COUNT;
}

function withFinal(ch: string, jong: number): string {
  const offset = (ch.codePointAt(0) ?? 0) - HANGUL_BASE;
  return String.fromCodePoint(HANGUL_BASE + offset - (offset % JONG_COUNT) + jong);
}

/**
 * 바꾸지 않는 꼬리.
 *
 * "~하자", "~해라" 같은 다른 서법이거나, 고유명사·인용이 끝에 온 경우다.
 * 여기서는 평서형 `~다` 만 다룬다.
 */
const ALREADY_POLITE = /(십시오|세요|해요)$/;

/**
 * 이미 합니다체로 끝났는가.
 *
 * `니다` 로만 보면 "아니다" 가 걸린다. 합니다체는 `습니다` 이거나 앞 음절에 ㅂ 받침이
 * 있는 `~ㅂ니다` 뿐이므로 거기까지 본다.
 */
function isPolite(tail: string): boolean {
  if (ALREADY_POLITE.test(tail)) return true;
  if (tail.endsWith("습니다")) return true;
  if (!tail.endsWith("니다") || tail.length < 3) return false;
  const before = tail[tail.length - 3];
  return isHangulSyllable(before) && finalIndex(before) === JONG_B;
}

/**
 * 받침 없이 끝나는 **서술어** 어간.
 *
 * 한다체에서 동사는 `~ㄴ다`·`~는다` 로 끝나므로(진다·린다·른다), 받침 없이 끝나는 것은
 * 형용사와 지정사뿐이다. 실제 노트에서 나온 것만 담는다. 여기 없으면 명사로 본다.
 */
const VOWEL_STEM_PREDICATE = /(하|이|아니|크|세|싸|시|아프|고프|나쁘|바쁘|예쁘|슬프|기쁘)$/;

/**
 * 한 문장의 끝을 합니다체로 바꾼다. 평서형 `~다` 로 끝나지 않으면 그대로 둔다.
 *
 * 규칙은 셋이다.
 *   `~는다`  자음 어간 동사(먹는다) → `~습니다`
 *   `~ㄴ다`  모음 어간 동사(한다·간다·준다) → 종성 ㄴ 을 ㅂ 으로 바꾸고 `니다`
 *   `~다`    형용사·지정사(있다·크다·이다) → 받침이 있으면 `습니다`, 없으면 ㅂ 받침 + `니다`
 */
export function toPoliteSentence(sentence: string): string {
  const match = /^(.*?)([가-힣]{1,4})([.!?]*)$/s.exec(sentence);
  if (!match) return sentence;
  const [, head, tail, punct] = match;
  if (isPolite(tail)) return sentence;
  if (!tail.endsWith("다")) return sentence;

  const body = tail.slice(0, -1);
  // `String.prototype.at` 은 쓰지 않는다. 이 파일은 브라우저 번들에도 실리는데
  // 그쪽 lib 목표가 더 낮아 컴파일이 막힌다.
  const last = body.length > 0 ? body[body.length - 1] : undefined;
  // "콤보는 Q → E다" 처럼 한글이 아닌 것(슬롯 글자·숫자) 뒤에 붙은 `다` 는
  // 명사 뒤의 지정사다. "E입니다" 가 된다.
  if (!last || !isHangulSyllable(last)) return `${head}${body}입니다${punct}`;

  // 먹는다 → 먹습니다
  if (last === "는" && body.length >= 2) {
    return `${head}${body.slice(0, -1)}습니다${punct}`;
  }

  const jong = finalIndex(last);
  // 한다 → 합니다, 간다 → 갑니다, 준다 → 줍니다
  if (jong === JONG_N) {
    return `${head}${body.slice(0, -1)}${withFinal(last, JONG_B)}니다${punct}`;
  }
  if (jong === JONG_NONE) {
    // 받침 없는 어간은 둘로 갈린다.
    //   서술어      약하다 → 약합니다, 것이다 → 것입니다, 크다 → 큽니다
    //   명사 + 다   순서다 → 순서입니다 (순서이다 의 준말이다)
    // 명사 쪽에 ㅂ 을 붙이면 "순섭니다" 가 되어 말이 되지 않는다.
    if (VOWEL_STEM_PREDICATE.test(body)) {
      return `${head}${body.slice(0, -1)}${withFinal(last, JONG_B)}니다${punct}`;
    }
    return `${head}${body}입니다${punct}`;
  }
  // 있다 → 있습니다, 없다 → 없습니다, 낫다 → 낫습니다
  return `${head}${body}습니다${punct}`;
}

/** 여러 문장으로 된 글 전체. 문장 경계마다 끝을 바꾼다. */
export function toPoliteText(text: string): string {
  return text
    .split(/(?<=[.!?])(\s+)/)
    .map((part, index) => (index % 2 === 1 ? part : toPoliteSentence(part)))
    .join("");
}
