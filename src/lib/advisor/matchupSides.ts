/**
 * 둘 중 누가 **내 챔피언**인지 가린다.
 *
 * 예전에는 문장에 먼저 나온 쪽을 내 챔피언으로 삼았다. "오공으로 럼블" 은 맞지만
 * 상대를 먼저 말하면 통째로 뒤집힌다. 열 문장으로 재 보니 넷만 맞았다.
 *
 *   럼블 상대로 오공 하는데 어려워       → 럼블이 내 챔피언이 됐다
 *   야스오 상대로 말파이트 괜찮아?       → 야스오가 내 챔피언이 됐다
 *   제드 상대하는 럭스 공략              → 제드가 내 챔피언이 됐다
 *
 * 한국어는 그 자리를 **조사가** 표시한다. `-으로/로` 는 내가 잡은 쪽이고,
 * 이름 뒤의 `상대`·`전`·`vs`·`카운터` 는 맞은편이다. 어순은 마지막에만 본다.
 *
 * `상대로` 는 `-로` 로 끝나지만 내 쪽이 아니다. 앞이 `상대` 면 세지 않는다.
 */
const PLAYS = /(?<!상대)(으로|로)(\s|$)/;
const FACES = /^\s*(을|를|이|가|은|는|와|과|랑|이랑)?\s*(상대|전에서|전\s|vs|카운터|맞상대)/i;
/*
 * 이름 **앞**의 표지는 주격일 때만 센다.
 *
 * "상대가 럼블인데" 는 럼블이 맞은편이라는 뜻이다. 그런데 `로` 까지 세었더니
 * "럼블 상대로 오공" 에서 오공 앞의 "상대로" 가 걸려 오공도 맞은편이 되었다.
 * 그 "상대로" 는 앞에 있는 럼블의 표지이지 오공의 것이 아니다. 둘 다 -2 가 되어
 * 차이가 0 이 되고 어순으로 떨어졌다.
 */
const FACED_BEFORE = /(상대|맞상대)\s*(가|는|이)\s*$/;

export interface MatchupSides<T> {
  sides: [T, T];
  /**
   * 조사가 실제로 갈라 주었는가.
   *
   * 거짓이면 어순으로 떨어진 것이라 믿을 것이 못 된다. 스무 문항으로 재 보니 규칙이
   * 틀린 넷이 모두 이 자리였다("럼블 만났는데 나 오공", "상대 제드, 나 럭스").
   * 부르는 쪽은 이 값을 보고 모델에게 넘길지 정한다.
   */
  confident: boolean;
}

export function matchupSides<T extends { name: string }>(question: string, found: T[]): [T, T] {
  return matchupSidesDetailed(question, found).sides;
}

export function matchupSidesDetailed<T extends { name: string }>(question: string, found: T[]): MatchupSides<T> {
  const [first, second] = found;
  if (found.length < 2) return { sides: [first, second], confident: false };
  const score = (card: T): number => {
    const at = question.indexOf(card.name);
    if (at < 0) return 0;
    const after = question.slice(at + card.name.length);
    const before = question.slice(0, at);
    let value = 0;
    if (PLAYS.test(after.slice(0, 4))) value += 2;
    if (FACES.test(after)) value -= 2;
    if (FACED_BEFORE.test(before)) value -= 2;
    return value;
  };
  const gap = score(first) - score(second);
  // 조사가 갈라 주지 않으면 어순으로 간다. 그 편이 맞는 경우가 더 많았다.
  if (gap < 0) return { sides: [second, first], confident: true };
  return { sides: [first, second], confident: gap > 0 };
}

/**
 * 이름이 셋 이상 나온 상성 질문에서 맞붙는 둘을 고른다.
 *
 * "오공으로 럼블 상대할 때 아이번 정글이면 아이템 뭐 가?" 의 아이번은 맞상대가 아니라 곁들인
 * 말이다. 그런 이름은 앞(12자 안)이나 바로 뒤(3자 안)에 자리 낱말(정글·서폿·jungler·打野 …)이
 * 붙는다. 뒤를 넓게 보면 띄어 쓰지 않는 중국어에서 다음 이름의 자리 낱말까지 잡는다. 그것을 빼고
 * 남은 앞의 둘을 쓴다. 둘이 안 남으면 undefined — 셋을 한꺼번에 견주는 질문일 수 있다.
 *
 * 판정기에 "누가 맞상대인가" 를 물어도 봤다. 이름 둘로만 배운 헤드라 12문항에서 내 챔피언
 * 6, 맞상대 1 이었다. 자리 낱말 규칙은 12문항을 다 맞혔다.
 */
const ROLE_WORDS = /정글|서폿|서포터|원딜|바텀|미드|support|supp|jungler|jungle|\bjg\b|\bmid\b|\badc\b|打野|辅助|中单|下路/i;

export function matchupPair<T>(question: string, found: T[], names: (card: T) => string[]): [T, T] | undefined {
  if (found.length < 3) return found.length === 2 ? [found[0], found[1]] : undefined;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const side = (card: T) => {
    const alt = names(card).filter((name) => name.length >= 2).map(escape).join("|");
    if (!alt) return false;
    const re = new RegExp(`(.{0,12})(?:${alt})(.{0,3})`, "gi");
    for (const m of question.matchAll(re)) if (ROLE_WORDS.test(m[1]) || ROLE_WORDS.test(m[2])) return true;
    return false;
  };
  const kept = found.filter((card) => !side(card));
  return kept.length >= 2 ? [kept[0], kept[1]] : undefined;
}

/**
 * 영어·중국어 문형으로 내 챔피언을 가른다. 문형이 안 걸리면 undefined.
 *
 * 한국어는 조사가 가르지만(`matchupSidesDetailed`) 영어·중국어에는 조사가 없다.
 * 판정기(`judge.ts`)가 시점을 12문항 중 9개만 맞혔고, 틀린 셋이 모두 이 문형이었다 —
 * "Playing Darius into Sett", "I'm Jax against Teemo", "我用武器大师对线迅捷斥候".
 * 이런 문장은 낱말이 시점을 정해 주므로 판정보다 규칙이 확실하다.
 *
 * `names` 는 챔피언마다 알아볼 이름들(화면 언어 이름과 다른 언어 이름).
 */
export function matchupSidesByPhrase<T>(question: string, found: [T, T], names: (card: T) => string[]): T | undefined {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const score = (card: T): number => {
    const alt = names(card).filter((name) => name.length >= 2).map(escape).join("|");
    if (!alt) return 0;
    const name = `(?:${alt})`;
    const mine = [
      new RegExp(`\\b(?:play|playing|plays|as|main|maining|on|i'?m|i am)\\s+(?:a\\s+|an\\s+)?${name}`, "i"),
      new RegExp(`${name}\\s+(?:into|vs\\.?|versus|against)\\s`, "i"),
      new RegExp(`我(?:用|玩|拿|是|选)\\s*${name}`),
      new RegExp(`${name}\\s*(?:打|对线|对上|对)`),
    ];
    const enemy = [
      new RegExp(`\\b(?:into|against|vs\\.?|versus|facing)\\s+(?:a\\s+|an\\s+)?${name}`, "i"),
      new RegExp(`${name}\\s+is\\s+(?:the\\s+|my\\s+)?(?:enemy|opponent|lane opponent)`, "i"),
      new RegExp(`(?:打|对线|对上|对付|碰到|遇到)\\s*${name}`),
    ];
    return (mine.some((re) => re.test(question)) ? 2 : 0) - (enemy.some((re) => re.test(question)) ? 2 : 0);
  };
  const [a, b] = found;
  const gap = score(a) - score(b);
  if (gap > 0) return a;
  if (gap < 0) return b;
  return undefined;
}
