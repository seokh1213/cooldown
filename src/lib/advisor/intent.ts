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
function findMentions(data: AdvisorData, text: string): Mention[] {
  const names = data.cards
    .map((c) => ({ card: c, name: c.name }))
    .sort((a, b) => b.name.length - a.name.length);

  const mentions: Mention[] = [];
  const taken: Array<[number, number]> = [];
  for (const { card, name } of names) {
    if (name.length < 2) continue;
    const index = text.indexOf(name);
    if (index < 0) continue;
    // 이미 잡힌 구간과 겹치면 건너뛴다 (긴 이름이 먼저 잡혔다는 뜻)
    if (taken.some(([s, e]) => index < e && index + name.length > s)) continue;
    taken.push([index, index + name.length]);
    mentions.push({
      card,
      index,
      tail: text.slice(index + name.length, index + name.length + 12),
    });
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
