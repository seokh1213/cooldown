import type { ChampionCard } from "@/lib/knowledge/facts";
import { isSpellFocusWord } from "./spellFocus";

import { editDistance, toJamo } from "./textDistance";
export { editDistance } from "./textDistance";

/** 질문에서 챔피언 이름으로 보일 만한 한글 덩어리. */
function hangulTokens(text: string): string[] {
  return [...new Set(text.match(/[가-힣]{2,7}/g) ?? [])];
}

/** 게임 어휘. 챔피언 이름 오타 후보에서 뺀다. 데이터가 아니라 질문에 쓰이는 낱말이다. */
const INTENT_WORD =
  /^(스킬|스탯|능력치?|효과|계수|사거리|궁극기?|패시브|기본|공격|방어|체력|마나|이속|공속|아이템|템트리|소환사|주문|라인전?|정글|미드|탑|바텀|봇|원딜|서폿|서포터|상대|카운터|챔피언|챔프|레벨|설명|비교)/;

/**
 * 질문에 흔히 나오는 두 음절 기능어. 이름 오타로 보지 않는다.
 * "누가 더 높아" 의 "누가" 는 누누와 거리 1 이지만 챔피언이 아니다. 첫 음절 규칙만으로는
 * 두 음절 이름(누누·나미·자야…)과 두 음절 기능어의 충돌을 다 못 막는다.
 */
const FUNCTION_WORDS = new Set([
  "누가", "누구", "누군", "뭐야", "뭐가", "뭔데", "뭐냐", "뭐지", "어디", "언제", "얼마", "어떤", "어느",
  "제일", "가장", "설명", "비교", "차이", "상대", "대비", "대해", "해줘", "알려", "정도", "이랑", "하고",
  "그리고", "중에", "레벨", "쿨감", "쿨은", "쿨이", "얼마나", "몇초",
  // 이어 묻는 말의 첫머리. "그럼 한타 때는?" 의 "그럼" 이 그웬(거리 1)으로 고쳐져 상성 대화가 끊겼다.
  "그럼", "그러면", "그럼요", "근데", "그런데", "그래서", "그건", "그게", "그거", "이건", "이거", "저건",
  "만약", "차라리", "반대로", "방금", "혹시", "아니", "아니면", "그냥", "나는", "내가", "제가", "저는",
  // 일상 낱말. "오늘 날씨 어때" 의 "오늘" 이 오른·오공 오타로 잡혔다.
  "오늘", "내일", "어제", "요즘", "지금", "날씨", "진짜", "정말",
  // 흔한 동사 활용. "바위게 언제 나와?" 의 "나와" 가 나르·나미 오타로 잡혔다.
  "나와", "나와요", "나옴", "나오면", "나오는", "나올", "나가", "나감", "나가면", "나갔", "나갈", "사면", "팔면", "써야", "가야",
  "올라", "올라가", "올라감", "올라와", "올라간", "올라요", "오르면", "직접", "소리", "나를", "타는", "세짐", "피감", "마법", "신발", "조건", "조건이",
  "바뀜", "바뀌", "가능", "마리", "오름", "신고", "요정", "가면", "직후",
  // 값을 묻는 말. 질문 끝의 "가격" 이 가렌(거리 1)으로 고쳐져 "피오라 굶주린 히드라 가격" 이 아이템 가격까지 못 갔다.
  "가격", "가격은", "가격이", "가격좀",
  // 이어 묻는 말에 흔한 낱말이 이름과 거리 1 이었다: 그런→그웬, 나서는→나서스, 자꾸→자야, 사야→자야
  "그런", "그럴", "그렇게", "나서", "나서는", "나서도", "자꾸", "사야", "해야", "가야", "봐야", "써야", "서야", "돼야",
]);

/** 이름 뒤에 오는 말. 이것이 붙어야 두세 글자 낱말을 이름 오타로 본다(`suggestChampions`). */
const CHAMPION_SLOT_AFTER =
  /^\s*(?:으로|로|이랑|랑|하고|한테|에게|를|을|은|는|이|가|의)?\s*(?:\d+\s*(?:레벨|렙)|체력|방어력|마법\s*저항력|마저|공격력|이동\s*속도|이속|스탯|능력치|vs|상대|카운터|스킬|패시브|궁|콤보|공략|룬|템|빌드|어때|어떻게|잡|이기|이길|할\s*때|하면|중|비교|[QWERPqwerp](?![A-Za-z])|[?？!.~]*$)/;
/** 이름 앞에 오는 말. 다른 이름과 잇는 말이 앞에 오면 이름 자리다("말파이트랑 럼베 중"). */
const CHAMPION_SLOT_BEFORE = /(?:랑|이랑|하고|vs|와|과|로|으로)\s*$/i;

/**
 * 챔피언을 하나도 못 찾았을 때, 한 글자 틀린 이름이 있는지 본다.
 *
 * "럼미 E 마저" 는 럼블이다. 지금은 못 찾으면 검색 폴백으로 흘러가 헛답을 냈다.
 * 거리 1 까지만 본다. 2 부터는 "애쉬" 가 "애니" 도 되고 "아리" 도 되어 못 믿는다.
 *
 * **첫 음절이 어떤 이름의 첫 음절과 같아야 한다.** 이 조건이 없으면 "뭐야" 가 "자야" 로
 * 잡힌다 — 두 음절 일반어와 두 음절 이름은 거리 1 로 자주 부딪힌다. 오타는 첫 글자에서
 * 잘 나지 않으므로 이 하나로 충돌 공간이 크게 준다(뭐·쿨·점·정·쇼·와 로 시작하는
 * 챔피언은 없다).
 *
 * 이미 찾은 챔피언(`known`)은 후보에서 뺀다. "말파이트랑 럼베" 에서 "말파이트랑" 은
 * 말파이트와 거리 1 이지만 오타가 아니라 조사가 붙은 것이고, 진짜 오타는 "럼베" 다.
 *
 * 후보를 돌려주고, 하나만 남을 때 바로 갈지 물을지는 화면이 정한다.
 */
export function suggestChampions(
  question: string,
  cards: ChampionCard[],
  nicknames: Map<string, ChampionCard>,
  known: ReadonlySet<string> = new Set(),
  /**
   * 이 길이보다 짧은 낱말은 오타로 보지 않는다. 상성 대화를 이어 가는 중에는 3 을 준다 — 이어 묻는 말의
   * 두 글자 낱말("나아", "사야", "자꾸")은 아무 이름과도 거리 1 이라 대화를 끊었다.
   */
  minLength = 1,
  /**
   * 게임 낱말인가(게임 메타 낱말·룬·주문 이름·은어). 이름 오타로 보지 않는다. "바론 버프 몇 초 가?" 의 "바론" 이 바드·바이 후보로
   * 잡혀 "'바론' 챔피언을 찾지 못했습니다" 라고 되물었다. 자료를 쥔 쪽이 넘긴다.
   */
  isGameWord?: (token: string) => boolean,
): { original: string; candidates: ChampionCard[] } | undefined {
  const names: Array<[string, ChampionCard]> = [];
  for (const card of cards) {
    names.push([card.name, card]);
    const compact = card.name.replace(/\s+/g, "");
    if (compact !== card.name) names.push([compact, card]);
  }
  for (const [nick, card] of nicknames) names.push([nick, card]);
  const initials = new Set(names.map(([name]) => name[0]));

  for (const token of hangulTokens(question)) {
    /*
     * 이미 이름을 둘 찾았으면 두 글자 낱말은 오타로 보지 않는다. 상성 질문은 그것으로 성립하고,
     * 두 글자는 아무 이름과도 가깝다. "잭스 상대로 피오라 할 때 탑 갱 오는 정글이 녹턴이면?" 의
     * "오는" 이 오른·오공 후보로 잡혀 상성 답 대신 "'오는' 챔피언을 찾지 못했습니다" 가 떴다.
     */
    if (known.size >= 2 && token.length <= 2) continue;
    // "럼미 E" 처럼 스킬 키가 바로 붙은 낱말은 짧아도 이름이다(상성 대화 중에는 minLength 3 이라 놓쳤다)
    if (token.length < minLength && !new RegExp(`${token}\\s*[QWERqwer](?![A-Za-z])`).test(question)) continue;
    // 첫 글자가 어느 이름과도 안 맞아도 버리지 않는다. 그 첫 글자 자체가 오타일 수
    // 있다("재이스" 의 재). 대신 음절 단계에서만 첫 글자를 맞추고, 자모 단계는 푼다.
    const initialKnown = initials.has(token[0]);
    if (FUNCTION_WORDS.has(token)) continue;
    if (isGameWord?.(token)) continue;
    /*
     * 세 글자 이하는 챔피언을 묻는 문맥일 때만 오타로 본다. 두세 글자 낱말은 일상어와 이름이 너무 가깝다 — 챔피언 이름 없는
     * 질문 3,174개에서 271개(8.5%)가 오타 후보를 냈다("마법 저항력" → 마스터 이, "스킬 가속" → 가렌, "타워" → 타릭, "조건이" → 조이).
     * 뒤에 스킬 키·"상대법"·"으로"·"어떻게" 같은 말이 붙어야 이름 자리다("갈렌 상대법", "럼미 E", "재이스 궁").
     */
    const at = question.indexOf(token);
    if (token.length <= 3 && !CHAMPION_SLOT_AFTER.test(question.slice(at + token.length)) && !CHAMPION_SLOT_BEFORE.test(question.slice(0, at))) continue;
    // 두 글자 아래는 아무 이름과도 가까워서 첫 글자마저 틀리면 짚을 근거가 없다.
    if (!initialKnown && token.length < 3) continue;
    // 의도 어휘("스킬", "쿨타임", "체력"…)는 이름이 아니다. "스킬" 이 줄임말 "스카"(스카너) 와
    // 거리 1 이라 후보로 잡혔다.
    // 효과 낱말도 이름이 아니다. "럼블 E 마저" 의 "마저" 가 마오카이·마스터 이 후보로
    // 잡혀 "'마저' 챔피언을 찾지 못했습니다" 라고 되물었다. 표를 새로 만들지 않고
    // 이미 있는 별칭표를 그대로 본다.
    if (INTENT_WORD.test(token) || isSpellFocusWord(token)) continue;
    // 그 자체가 이름이면 오타가 아니다. "오공 Q 쿨타임" 의 오공이 오른·오리아나 후보로 잡혔다.
    if (names.some(([name]) => name === token)) continue;
    /*
     * 후보를 두 갈래로 모아 **자모 거리로 함께 줄 세운다.**
     *
     *   음절 갈래  첫 글자를 고정하고 거리 1. 촘촘하고 헛짚음이 적다.
     *   자모 갈래  첫 글자를 풀고 길이 대비 비율로 자른다. 첫 글자가 틀린 오타를 잡는다.
     *
     * 음절 갈래를 먼저 찾았다고 바로 내보내면 안 된다. "갈렌" 이 별칭 "갈리"(갈리오)와
     * 음절 거리 1 이라 먼저 걸리는데, 정답 "가렌" 은 자모 거리 1 로 더 가깝다.
     * 둘을 합쳐 자모 거리로 줄 세우면 가까운 쪽이 앞에 온다.
     */
    const tokenJamo = toJamo(token);
    const scored = new Map<string, { card: ChampionCard; distance: number }>();
    const consider = (card: ChampionCard, nameJamo: string) => {
      const distance = editDistance(tokenJamo, nameJamo);
      const prev = scored.get(card.id);
      if (!prev || distance < prev.distance) scored.set(card.id, { card, distance });
    };

    for (const [name, card] of names) {
      if (known.has(card.id)) continue;
      const nameJamo = toJamo(name);

      // 음절 갈래
      if (
        initialKnown &&
        name[0] === token[0] &&
        !(token.length <= 2 && name.length !== token.length) &&
        Math.abs(name.length - token.length) <= 1 &&
        editDistance(token, name) === 1
      ) {
        consider(card, nameJamo);
        continue;
      }

      // 자모 갈래
      if (Math.abs(nameJamo.length - tokenJamo.length) > 3) continue;
      const distance = editDistance(tokenJamo, nameJamo);
      if (distance === 0) continue;
      if (distance / Math.max(nameJamo.length, tokenJamo.length) > 0.25) continue;
      consider(card, nameJamo);
    }

    if (scored.size > 0) {
      const ranked = [...scored.values()].sort((a, b) => a.distance - b.distance);
      return { original: token, candidates: ranked.map((entry) => entry.card) };
    }
  }
  return suggestLatinChampion(question, cards, known, isGameWord);
}

/**
 * 영어 이름과 한 글자 차이인 흔한 말. 오타로 보지 않는다("driven" ↔ Draven, "rubble" ↔ Rumble, "mastery" ↔ Master Yi).
 * 아이템·룬·규칙 이름에 든 낱말("Berserker's Greaves" ↔ Graves)은 부르는 쪽이 `isGameWord` 로 거른다.
 */
const LATIN_NEAR_WORDS = new Set(["driven", "grander", "salons", "talons", "shacks", "stains", "rubble", "mastery", "mastered", "greaves", "river", "rivers"]);

/** 한 글자 넣기·빼기·바꾸기와 **이웃 두 글자 자리 바꿈**을 모두 1 로 센다(yasou ↔ yasuo). */
function typoDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** 영어 이름 뒤·앞의 챔피언 문맥 */
const LATIN_SLOT_AFTER = /^'?s?\s*(?:kit|combo|build|builds|matchup|counter|counters|guide|abilities|ability|passive|ult|ultimate|runes?|items?|mid|top|jungle|jg|adc|support|supp|main|vs|into|[qwerp](?![a-z]))/;
const LATIN_SLOT_BEFORE = /(?:\bvs\.?|\binto|\bagainst|\bplay(?:ing)?|\bas|\bbeat|\bcounter)\s*$/;

/**
 * 영어 이름 오타("aatrx" → Aatrox). 여섯 글자 이상 이름만 한 글자 차이까지 본다 — 넷·다섯 글자 이름은 흔한 영단어와
 * 한 글자 차이인 것이 많다(Sett·set, Yone·one, Zeri·zero, Rell·tell).
 */
function suggestLatinChampion(
  question: string,
  cards: ChampionCard[],
  known: ReadonlySet<string>,
  isGameWord?: (token: string) => boolean,
): { original: string; candidates: ChampionCard[] } | undefined {
  const tokens = [...new Set((question.match(/[A-Za-z']{5,}/g) ?? []).map((token) => token.toLowerCase().replace(/'/g, "")))];
  if (!tokens.length) return undefined;
  const names = cards.map((card) => ({ card, name: card.id.toLowerCase() })).filter(({ name }) => name.length >= 4);
  const lower = question.toLowerCase();
  for (const token of tokens) {
    if (LATIN_NEAR_WORDS.has(token) || isGameWord?.(token) || names.some(({ name }) => name === token)) continue;
    // 넷·다섯 글자 이름은 챔피언 문맥이 있을 때만("yasou mid", "vs olaff"). "set" ↔ Sett, "one" ↔ Yone 같은 흔한 말이 많다.
    const at = lower.indexOf(token);
    const inContext = LATIN_SLOT_AFTER.test(lower.slice(at + token.length)) || LATIN_SLOT_BEFORE.test(lower.slice(0, at));
    const found = names.filter(
      ({ card, name }) =>
        !known.has(card.id) && (name.length >= 6 || inContext) && Math.abs(name.length - token.length) <= 1 && typoDistance(token, name) === 1,
    );
    if (found.length) return { original: token, candidates: found.map(({ card }) => card) };
  }
  return undefined;
}
