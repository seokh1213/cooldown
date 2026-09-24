/**
 * 질문에서 상성 의도를 읽어낸다
 *
 * "오공으로 럼블 상대할 때" 처럼 챔피언 둘이 나오면 상성 조언으로 보고 컨텍스트를 붙인다.
 * 그렇지 않으면 페르소나만으로 답하게 둔다.
 *
 * 어느 쪽이 나이고 어느 쪽이 상대인지는 조사로 가른다. 한국어에서 "A로 B를" 은 거의 항상
 * A 가 내 챔피언이다. 조사가 없으면 먼저 나온 쪽을 나로 본다.
 */
import type { ChampionCard } from "../../../scripts/llm/lib/facts";
import { findChampion, type AdvisorData } from "./context";

export type Lane = "top" | "jungle" | "mid" | "bot" | "support";

const LANE_WORDS: Array<[RegExp, Lane]> = [
  [/탑|top|위쪽/i, "top"],
  [/정글|jungle|jg/i, "jungle"],
  [/미드|mid|중앙/i, "mid"],
  [/바텀|바텀|원딜|adc|bot/i, "bot"],
  [/서폿|서포터|support|sup/i, "support"],
];

/** 내 챔피언임을 알리는 조사·표현 */
const MINE_MARKER = /(으로|로)\s*$|(을|를)?\s*(플레이|픽|골라|하는데|하고)/;
/** 상대임을 알리는 조사·표현 */
const ENEMY_MARKER = /(을|를)\s*(상대|맞상대|어떻게|이길|카운터)|상대(가|는|로)?\s*$|vs|대\s*$/i;

export interface MatchupIntent {
  me: ChampionCard;
  enemy: ChampionCard;
  lane?: Lane;
}

interface Mention {
  card: ChampionCard;
  index: number;
  /** 이름 바로 뒤에 붙은 조사와 서술 */
  tail: string;
}

/**
 * 문장에서 챔피언 언급을 모은다.
 *
 * 이름이 긴 쪽을 먼저 맞춰야 한다. "미스 포츈" 을 "포츈" 으로 자르거나
 * "리 신" 을 놓치면 엉뚱한 상성이 된다.
 */
/**
 * 줄임말 후보를 만든다.
 *
 * 사람들은 "말파이트" 를 "말파", "트위스티드 페이트" 를 "트페" 라고 부른다.
 * 이름에서 기계적으로 만들 수 있는 것만 여기서 만든다.
 *   접두사    한글 이름에서 세 글자 이상만(모데카이저 → 모데카). 두 글자는 만들지 않는다.
 *   머리글자  트위스티드 페이트 → 트페
 *
 * 두 글자 접두사는 일상 낱말과 너무 자주 겹쳤다. 374문항에서 "모르겠어" 가 모르가나,
 * "아무것도" 가 아무무, "밀리니까" 가 밀리오, "기다리는" 이 다리우스로 잡혔다. 실제로
 * 쓰는 두 글자 별명(말파·모데)은 사람이 검토한 별명 사전(knowledge/champion-aliases.json)이 맡는다.
 * 영어·중국어 이름에서는 접두사를 만들지 않는다 — "Co" 가 Could 에서 Corki 로, "符文" 이
 * 룬(符文) 질문에서 라이즈(符文法师)로 잡혔다.
 *
 * 다른 챔피언과 겹치는 줄임말은 쓰지 않는다. "리" 는 리 신·리븐·릴리아를 모두 가리켜
 * 어느 쪽인지 정할 수 없다.
 */
function buildNicknames(cards: ChampionCard[]): Map<string, ChampionCard> {
  const owners = new Map<string, ChampionCard[]>();
  const add = (key: string, card: ChampionCard) => {
    if (key.length < 2) return;
    const list = owners.get(key);
    if (list) list.push(card);
    else owners.set(key, [card]);
  };

  for (const card of cards) {
    if (!/[가-힣]/.test(card.name)) continue;
    const compact = card.name.replace(/\s+/g, "");
    for (let length = 3; length < compact.length; length += 1) {
      add(compact.slice(0, length), card);
    }
    const words = card.name.split(/\s+/).filter(Boolean);
    if (words.length > 1) add(words.map((w) => w[0]).join(""), card);
  }

  const unique = new Map<string, ChampionCard>();
  for (const [key, list] of owners) {
    // 정식 이름과 겹치는 줄임말은 쓰지 않는다. 이름 쪽이 먼저 잡혀야 한다.
    if (list.length === 1 && !cards.some((c) => c.name.replace(/\s+/g, "") === key)) {
      unique.set(key, list[0]);
    }
  }
  return unique;
}

/**
 * 문장에서 이름 하나를 찾는다. 글자 체계마다 규칙이 다르다.
 *
 *   영문   대소문자를 가리지 않고 낱말 경계로만. 띄어쓰기·아포스트로피·점은 있어도 없어도 된다
 *          ("cho gath", "chogath", "Cho'Gath"). 영어 화면에서 "vs zed as ahri" 가 소문자라
 *          통째로 빠졌었다(374문항 중 영어 46%).
 *   한 글자 한글  렐·진·퀸. 그냥 찾으면 "진짜" 에 걸리므로 앞이 한글이 아니고 뒤가 공백·조사·
 *          문장부호일 때만 이름으로 본다.
 *   그 밖  그대로 찾는다(한글·한자는 낱말 경계가 없다).
 *
 *   한글 별명  wordStart 면 낱말 앞머리에서만("나 아트인데", "딩거 포탑"). 정식 이름은 어디서든.
 *
 * 돌려주는 것은 [시작, 길이] 다. 못 찾으면 undefined.
 */
/** 짧은 한글 이름 뒤에 올 수 있는 것: 공백·문장부호·끝·조사, 그리고 이름 다음에 흔히 붙는 말. */
const HANGUL_NAME_END =
  "\\s|[,.?!~/·]|$|[A-Za-z0-9]|으로|로|이|가|은|는|을|를|랑|이랑|과|와|의|도|만|한테|에게|상대|전|vs|하|해|했|할|잡|픽|인|이야|야|라|궁|패시브|스킬|카운터|대처|공략";

function locate(text: string, name: string, wordStart = false, isAlias = false): [number, number] | undefined {
  if (/^[ -~]+$/.test(name)) {
    const chunks = name.split(/[\s'.]+/).filter(Boolean).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!chunks.length) return undefined;
    const found = new RegExp(`(?<![A-Za-z])${chunks.join("[\\s'.]*")}(?![A-Za-z])`, "i").exec(text);
    return found ? [found.index, found[0].length] : undefined;
  }
  // 한 글자 이름(렐·진·퀸)과 두 글자 이름(오른·아리)은 앞뒤 경계를 모두 본다.
  // "진짜" 의 진, "오른쪽" 의 오른, "메아리" 의 아리가 이름으로 잡혔다.
  if (/^[가-힣]$/.test(name) || (wordStart && /^[가-힣]{2}$/.test(name) && !isAlias)) {
    const found = new RegExp(`(?<![가-힣])${name}(?=${HANGUL_NAME_END})`).exec(text);
    return found ? [found.index, name.length] : undefined;
  }
  // 한글 별명·줄임말은 낱말 앞머리에서만 찾는다. "그레"(그레이브즈)가 "업그레이드" 에서 잡혔다.
  if (wordStart && /^[가-힣]/.test(name)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = new RegExp(`(?<![가-힣])${escaped}`).exec(text);
    return found ? [found.index, name.length] : undefined;
  }
  const index = text.indexOf(name);
  return index >= 0 ? [index, name.length] : undefined;
}

let nicknameCache: { cards: ChampionCard[]; map: Map<string, ChampionCard> } | null = null;

export function nicknames(cards: ChampionCard[]): Map<string, ChampionCard> {
  if (nicknameCache?.cards !== cards) {
    nicknameCache = { cards, map: buildNicknames(cards) };
  }
  return nicknameCache.map;
}

/**
 * 줄임말이 들어 있는 흔한 말. 이름 앞 두 글자를 줄임말로 받으므로 "아이템" 의 "아이" 가
 * 아이번이 됐다. "오공으로 럼블 상대할 때 아이템 뭐 가?" 가 챔피언 셋을 부른 질문이 되어
 * 상성 답으로 가지 못했다. 게임에서 흔히 쓰는 말과 아이템 이름을 가린 뒤에 줄임말을 찾는다.
 */
const COMMON_WORDS = ["아이템", "템트리", "다이아", "카이팅", "회오리", "밀리"];

let itemNameCache: { items: unknown; names: string[] } | null = null;

function maskCommonWords(text: string, data: AdvisorData): string {
  if (itemNameCache?.items !== data.items) {
    const names = (data.items ?? []).map((item) => item.name).filter((name): name is string => !!name && name.length >= 3);
    itemNameCache = { items: data.items, names: [...new Set(names)].sort((a, b) => b.length - a.length) };
  }
  let out = text;
  for (const word of [...itemNameCache.names, ...COMMON_WORDS]) {
    if (out.includes(word)) out = out.split(word).join("□".repeat(word.length));
  }
  return out;
}

function findMentions(data: AdvisorData, text: string): Mention[] {
  const mentions: Mention[] = [];
  const taken: Array<[number, number]> = [];
  const take = (card: ChampionCard, at: [number, number] | undefined): boolean => {
    if (!at) return false;
    const [index, length] = at;
    // 이미 잡힌 구간과 겹치면 건너뛴다 (긴 이름이 먼저 잡혔다는 뜻)
    if (taken.some(([s, e]) => index < e && index + length > s)) return false;
    taken.push([index, index + length]);
    mentions.push({ card, index, tail: text.slice(index + length, index + length + 12) });
    return true;
  };

  // 1. 화면 언어의 정식 이름. 긴 이름부터 — "미스 포츈" 을 "포츈" 으로 자르지 않게.
  //    "리 신" 을 "리신" 이라 붙여 쓰는 경우가 흔하다. 공백 없는 형태도 정식 이름으로 본다.
  const names = [...data.cards].sort((a, b) => b.name.length - a.name.length);
  for (const card of names) {
    const compact = card.name.replace(/\s+/g, "");
    // 두 글자 한글 이름(오른·아리)은 낱말 앞머리에서만. "오른쪽" 이 오른, "메아리" 가 아리로 잡혔다.
    const short = /^[가-힣]{2}$/.test(card.name);
    take(card, locate(text, card.name, short) ?? (compact !== card.name ? locate(text, compact) : undefined));
  }

  // 2. 줄임말. 긴 줄임말이 더 구체적이라 먼저 맞춘다. 낱말 앞머리에서만 찾고, 흔한 말과
  //    아이템 이름은 가린 뒤에 찾는다 — "아이템" 은 앞머리가 "아이"(아이번)라 앞머리 규칙만으로는
  //    못 막는다(`maskCommonWords`). 가려도 글자 수는 그대로라 위치는 원문과 같다.
  const masked = maskCommonWords(text, data);
  const nickEntries = [...nicknames(data.cards)].sort((a, b) => b[0].length - a[0].length);
  for (const [nick, card] of nickEntries) {
    if (mentions.some((m) => m.card.id === card.id)) continue;
    take(card, locate(masked, nick, true, true));
  }

  /*
   * 3. 다른 언어 이름·중국어 음역 이름·별명(champion-names.json).
   *
   * 한국어 화면에서 "How do I play Yasuo into Malphite?" 가 챔피언 없음으로 빠졌다.
   */
  const aliasEntries = [...(data.aliases ?? new Map<string, string[]>())]
    .flatMap(([id, list]) => list.map((alias) => ({ id, alias })))
    .filter(({ alias }) => alias.length >= 2)
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const { id, alias } of aliasEntries) {
    if (mentions.some((m) => m.card.id === id)) continue;
    const card = data.cardById.get(id);
    if (card) take(card, locate(text, alias, true, true));
  }

  return mentions.sort((a, b) => a.index - b.index);
}

function detectLane(text: string): Lane | undefined {
  for (const [re, lane] of LANE_WORDS) if (re.test(text)) return lane;
  return undefined;
}

export function detectMatchup(data: AdvisorData, text: string): MatchupIntent | undefined {
  const mentions = findMentions(data, text);
  if (mentions.length < 2) return undefined;

  // 조사로 역할을 가른다
  let me = mentions[0];
  let enemy = mentions[1];
  const first = mentions[0];
  const second = mentions[1];
  if (ENEMY_MARKER.test(first.tail) && !ENEMY_MARKER.test(second.tail)) {
    me = second;
    enemy = first;
  } else if (MINE_MARKER.test(second.tail) && !MINE_MARKER.test(first.tail)) {
    me = second;
    enemy = first;
  }
  if (me.card.id === enemy.card.id) return undefined;

  return { me: me.card, enemy: enemy.card, lane: detectLane(text) };
}

/** 챔피언이 하나만 나왔을 때 그 카드를 돌려준다. 단일 챔피언 질문에 쓴다. */
export function detectSingleChampion(
  data: AdvisorData,
  text: string,
): ChampionCard | undefined {
  const mentions = findMentions(data, text);
  if (mentions.length !== 1) return undefined;
  return mentions[0].card;
}

/**
 * 질문에 나온 챔피언을 모두 돌려준다.
 *
 * 한 명일 때만 자료를 붙이면 "럼블 마법저항력 1렙에 몇이고 오공은 몇이야" 가
 * 빈손으로 나간다. 자료 양이 문제이므로 수만 제한한다.
 */
export function detectChampions(
  data: AdvisorData,
  text: string,
  limit = 3,
): ChampionCard[] {
  return findMentions(data, text)
    .slice(0, limit)
    .map((mention) => mention.card);
}

/**
 * "카운터가 뭐야", "누구를 골라야 해" 처럼 **상대 챔피언을 골라 달라는** 질문인지.
 *
 * 이 질문은 상성별 통계가 있어야 답할 수 있어 다른 자료를 붙인다.
 */
const COUNTER_ASK = /카운터|counter|천적|누구.{0,4}(골라|픽|해야)|어떤\s*챔피언.{0,8}(골라|픽|해야|좋)|상대로.{0,6}(뭐|누구|어떤)/i;

export function asksForCounter(text: string): boolean {
  return COUNTER_ASK.test(text);
}

/** 사용자가 챔피언 이름만 적었을 때를 위한 보조 (예: "오공 럼블") */
export function looksLikeChampionQuery(data: AdvisorData, text: string): boolean {
  return Boolean(findChampion(data, text.trim()));
}

/**
 * 도우미 자신에 대한 질문인가.
 *
 * "넌 누구야" 를 자료 검색으로 흘려보냈더니 모델이 아무 검색어나 만들어 내고
 * 화면에 "찾은 자료: 와드" 가 붙었다. 자기소개는 자료로 답할 것이 아니다.
 *
 * 점수로 거르는 방법은 이미 막혀 있다 — `lexicalSearch` 주석에 적힌 대로 맞은 것이
 * 0.344, 틀린 것이 0.620 이라 문턱이 둘을 못 가른다. 그래서 질문 쪽에서 가른다.
 *
 * **표를 늘리지 않는다.** 모델 이름(gpt·claude…)이나 "서버에서 도냐" 같은 변형까지
 * 적어 두면 유행 따라 계속 고쳐야 한다. 2인칭과 "누구/뭐" 가 붙은 꼴 하나만 본다.
 * 나머지 변형은 모델이 페르소나로 답한다 — 애초에 답을 알고 있다.
 */
const HELPER_ASK = /(넌|너는|너|당신|네가|니가)\s*(누구|뭐야|뭐니|무엇)|(who|what)\s+are\s+you|你是[谁什]/i;

export function asksAboutHelper(question: string): boolean {
  return HELPER_ASK.test(question);
}
