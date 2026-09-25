/**
 * 대화 상태 — 이어 묻기를 모델이 아니라 코드가 기억한다
 *
 * 0.8B 에게 대화 이력을 넣으면 맥락을 못 쥔다. 98대화 270턴(`research/llm-evals/kev-agent/`)에서 이력을
 * 넣은 판정은 10점 환산 1.0~1.3 이었다 — 내 챔피언과 상대를 뒤바꾸고("아트록스 vs 아트록스"), 앞 쌍을
 * 새 질문에 끌고 왔다. 지금 앱(턴마다 따로)은 이름 없는 이어 묻기를 하나도 못 받았다(0/112).
 *
 * 그래서 모델에게 기억시키지 않는다. 방금 답한 상성(내 챔피언·상대)을 코드가 들고 있고, 새 말이 그
 * 상성과 어떤 관계인지만 판정기가 고른다(`ACT_*`). 판정기가 없으면 규칙으로 가른다: 아이템·룬·게임
 * 규칙 이름이 있으면 새 질문, 없으면 이어 묻기. 규칙만으로 3.8 → 7.0 이었다.
 *
 * **학습한 글자와 한 글자도 다르면 안 된다.** `scripts/llm/kev-agent/b3/build_b3.py` 와 같은 문구다.
 */
import type { ChampionCard } from "../../../scripts/llm/lib/facts";
import type { AdvisorAnswer } from "./answer";

export type Act = "followup" | "more" | "enemy" | "mine" | "flip" | "new";

export const ACT_INSTRUCTIONS = "What is the new message?";

/** 순서가 곧 선택지 순서다. 헤드는 이 순서로 배웠다. */
export function actCriteria(mine: string, enemy: string): Record<Act, string> {
  return {
    followup: `Asks more about playing ${mine} against ${enemy}: another topic, a timing or a situation`,
    more: "Wants more detail or the reason behind the last answer",
    enemy: `Still plays ${mine} but now asks about facing a different champion`,
    mine: `Now plays a different champion against ${enemy}`,
    flip: `Asks from ${enemy}'s side: how ${enemy} should play against ${mine}`,
    new: "A new question not about this matchup: an item, rune, summoner spell, game rule, another champion's abilities or numbers, or small talk",
  };
}

export const ACT_LABELS = Object.keys(actCriteria("", "")) as Act[];

export function actState(mine: string, enemy: string, message: string, named?: string): string {
  const state = `Earlier in this chat the user asked how to play ${mine} against ${enemy}.\nNew message: ${message}`;
  return named ? `${state}\nChampion named in the new message: ${named}` : state;
}

export function actQuestion(mine: string, enemy: string) {
  return {
    instructions: ACT_INSTRUCTIONS,
    options: Object.entries(actCriteria(mine, enemy)).map(([name, description]) => ({ name, description })),
  };
}

export function actFromProbs(probs: number[]): Act {
  return ACT_LABELS[probs.indexOf(Math.max(...probs))];
}

/** 방금 다룬 상성. 대화에서 가장 최근의 챔피언 답이 상성 답일 때만 있다. */
export interface MatchupState<T = ChampionCard> {
  mine: T;
  enemy: T;
}

export function matchupStateOf(answers: Array<AdvisorAnswer | undefined>): MatchupState | undefined {
  for (let i = answers.length - 1; i >= 0; i -= 1) {
    const answer = answers[i];
    if (!answer) continue;
    if (answer.kind === "compare" && answer.matchup && answer.cards.length >= 2) return { mine: answer.cards[0], enemy: answer.cards[1] };
    // 챔피언을 다룬 다른 답이 더 최근이면 상성 맥락은 끝났다
    if (answer.kind === "compare" || answer.kind === "champion" || answer.kind === "spell") return undefined;
  }
  return undefined;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 새로 나온 이름이 내 챔피언 자리인지 상대 자리인지 문형이 못 박으면 그것을 돌려준다.
 *
 * 판정기는 둘을 자주 바꿔 골랐다(손으로 쓴 시험 60문항에서 상대 바꾸기 6개 중 4개를 내 챔피언으로).
 * 조사·전치사가 분명하면 판정기보다 먼저다. 한국어 조사가 상성 시점을 9/10 맞힌 것과 같은 까닭이다.
 */
export function sideOfNewName(question: string, names: string[]): "mine" | "enemy" | undefined {
  for (const name of names.filter((n) => n.length >= 1)) {
    const n = escape(name);
    const mine = [
      new RegExp(`${n}\\s*(으로|로)(?![가-힣])|${n}\\s*(으로|로)\\s*(하|바꾸|가|상대|는|해)|${n}\\s*(하면|잡으면|골라|픽하|로 바꿨)|내가\\s*${n}`),
      new RegExp(`\\b(as|play|playing|pick|picked|picking|go|switch(ed)? to|swap(ped)? to|with)\\s+${n}\\b`, "i"),
      new RegExp(`(?<!对面\\s*)(用|玩|拿|换成|换|我是)\\s*${n}`),
    ];
    const enemy = [
      new RegExp(`${n}\\s*(을|를)?\\s*(만나|상대|한테|에게|는|은)(?![가-힣])|${n}\\s*(을|를)?\\s*(만나|상대|한테|에게)|상대가\\s*${n}`),
      new RegExp(`\\b(vs\\.?|versus|against|into|face|facing|fight|get|meet|if it'?s|laning (vs|against))\\s+${n}\\b`, "i"),
      new RegExp(`(对面|遇到|碰到|对上|对线|打|对)\\s*(换成)?\\s*${n}`),
    ];
    const isMine = mine.some((re) => re.test(question));
    const isEnemy = enemy.some((re) => re.test(question));
    if (isMine && !isEnemy) return "mine";
    if (isEnemy && !isMine) return "enemy";
  }
  return undefined;
}

/**
 * 판정기가 없을 때(모델을 받지 않은 기기) 쓰는 문형. 판정기가 있어도 문형이 분명하면 그것이 먼저다.
 *
 *   flip   "다리우스 입장에서는?", "반대로", "from Darius's side", "反过来"
 *   more   "왜?", "더 자세히", "풀어서", "why", "explain", "为什么", "详细"
 */
const FLIP_WORDS = /입장에서|입장이면|쪽에서는|반대로|반대 입장|거꾸로|\bfrom \S+('s)? side\b|\bthe other way\b|\breverse\b|\bflip( it)?\b|反过来|那一方|那边怎么/i;
const MORE_WORDS = /^(왜|왜요|왜\?)|더 자세히|자세히|풀어서|이유가|무슨 말|^\s*why\b|\bwhy is that\b|\btell me more\b|\bmore detail|\bexplain\b|\bbreak (that|it) down\b|为什么|为啥|详细|具体点|再多讲|什么意思|讲细/i;
/**
 * 게임 규칙·메타 낱말. 이런 말이면 앞 상성과 상관없는 새 질문이다(아이템·룬 이름은 자료가 따로 가른다).
 * 챔피언 가격·항복·다시하기·랭크·스킨 … 판정기 sub-v1 의 game 갈래와 같은 영역이다.
 */
const GAME_WORDS =
  /항복|서렌|조기 항복|닷지|다시하기|리메이크|승점|\bLP\b|승급|티어|듀오|정수|RP|챔피언 가격|챔프 가격|가격 얼마|스킨|환불|몇 분에 나와|몇 분부터|등장 시간|젠 시간|리젠|\bsurrender\b|\bff\b|\bremake\b|\bdodg|\branked\b|\bpromos?\b|blue essence|\bBE\b|\bskins?\b|\bspawns?\b|respawn|投降|重开|秒退|胜点|排位|蓝色精粹|精粹|皮肤|退款|刷新|几分钟/i;

export function actFromWords(question: string): Act | undefined {
  if (FLIP_WORDS.test(question)) return "flip";
  if (MORE_WORDS.test(question)) return "more";
  if (GAME_WORDS.test(question)) return "new";
  return undefined;
}

export type TurnPlan<T> = { kind: "matchup"; mine: T; enemy: T; act: Act } | { kind: "pass" };

/**
 * 이번 말을 앞 상성에 이어 받을지 정한다. `pass` 면 지금까지의 경로(턴마다 따로)로 간다.
 *
 * @param named   이번 말에서 찾은 챔피언
 * @param entity  아이템·룬·소환사 주문·게임 규칙 이름이 있는가(있으면 새 질문이다)
 * @param act     판정기가 고른 것. 없으면 규칙으로 가른다
 * @param side    새 이름의 자리를 문형이 못 박았으면 그것(`sideOfNewName`). 판정기보다 먼저다
 * @param alone   이번 말을 따로 가른 갈래(route 판정). 새 이름의 스킬·수치·아이템 질문이면 앞 쌍에 붙이지 않는다
 *
 * 이름 없는 말에서 판정기의 "new" 는 따르지 않는다. 손으로 쓴 시험에서 이어 묻기 15개 중 8개를 새 질문으로
 * 보냈다("궁극기 언제 아껴야 해", "점멸 대신 방어막 들어도 돼?"). 새 질문은 `entity`(아이템·규칙 이름,
 * 판정기의 게임 규칙·잡담 갈래)가 가르고, 판정기는 "더 자세히"·"입장 뒤집기" 를 알아보는 데만 쓴다.
 */
export function planTurn<T extends { id: string }>(
  state: MatchupState<T> | undefined,
  named: T[],
  entity: boolean,
  act?: Act,
  side?: "mine" | "enemy",
  alone?: string,
): TurnPlan<T> {
  if (!state || named.length >= 2) return { kind: "pass" };
  const { mine, enemy } = state;
  const keep = (a: Act): TurnPlan<T> => ({ kind: "matchup", mine, enemy, act: a });
  if (named.length === 0) {
    if (entity) return { kind: "pass" };
    if (act === "flip") return { kind: "matchup", mine: enemy, enemy: mine, act };
    // 이름 없이 enemy·mine 을 고르면 바꿀 챔피언이 없다. 같은 상성의 이어 묻기로 받는다.
    return keep(act === "more" ? "more" : "followup");
  }
  const [other] = named;
  if (other.id === mine.id || other.id === enemy.id) {
    // "피오라 W 어떻게 빼", "피오라 입장에서는?" — 같은 두 챔피언
    if (act === "flip" && other.id === enemy.id) return { kind: "matchup", mine: enemy, enemy: mine, act };
    if (act === "new") return { kind: "pass" };
    return keep(act === "more" ? "more" : "followup");
  }
  // 새 이름 하나. 문형이 자리를 못 박으면 그것이 먼저다. 판정기가 새 질문이라 했어도 문형을 따른다.
  if (side === "enemy") return { kind: "matchup", mine, enemy: other, act: "enemy" };
  if (side === "mine") return { kind: "matchup", mine: other, enemy, act: "mine" };
  // "드레이븐 E 사거리", "릴리아 궁 마나" — 따로 가르면 스킬·수치 질문이다. 그 챔피언 자체를 묻는다.
  if (alone && !["guide", "matchup"].includes(alone)) return { kind: "pass" };
  // "아칼리 언제 들어가야 돼" — 공략 질문이면 판정기, 판정기가 없으면 상대를 바꾼 것으로 본다(앞 쌍의 내 챔피언 그대로).
  const seat = act === "enemy" || act === "mine" ? act : act === "new" ? undefined : alone ? "enemy" : undefined;
  if (seat === "enemy") return { kind: "matchup", mine, enemy: other, act: "enemy" };
  if (seat === "mine") return { kind: "matchup", mine: other, enemy, act: "mine" };
  return { kind: "pass" };
}
