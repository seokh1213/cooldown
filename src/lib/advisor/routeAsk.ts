import type { ChampionCard } from "@/lib/knowledge/facts";

/**
 * 질문이 무엇을 묻는지 판정기(kev 헤드)로 가른다
 *
 * 한국어 낱말 목록으로 가르던 때는 세 언어에서 한국어 5/6, 영어 1/6, 중국어 1/6 이었다. 판정기 문구는
 * **한국어 낱말을 적지 않고** 영어 갈래 이름과 뜻풀이만 둔다. 어느 언어로 물어도 같은 문구가 돈다.
 * 이 파일이 늘어야 할 까닭은 갈래가 늘 때이지 언어가 늘 때가 아니다.
 */

/**
 * 질문이 겨냥하는 것. 화면이 어떤 카드를 지을지 정한다.
 *
 * 예전 판정기(route-v2)는 앞의 다섯만 쓰고 "그 밖" 을 sub-v1 으로 다섯으로 더 나눴다. kev 는 아홉 칸을 한 번에 가른다. 이어 묻기에서
 * "방어력 올려?"(아이템, 앞 상성의 이어 묻기)와 "항복 몇 분부터?"(게임 규칙, 새 질문)를 가르려면 둘이 한
 * 갈래여서는 안 됐다.
 */
export type AskKind = "matchup" | "guide" | "skills" | "spellStat" | "other" | "item" | "rune" | "spell" | "game" | "chat";

const KINDS: AskKind[] = ["matchup", "guide", "skills", "spellStat", "other"];

export interface AskRoute {
  kind: AskKind;
  /** 상성일 때 사용자가 잡은 챔피언. 모델이 못 고르면 비어 있다. */
  mine?: ChampionCard;
}

/*
 * 판정기(`judge.ts`)로 가를 때의 질문 꼴.
 *
 * 생성 모델 없이 0.8B 의 속내에 판정 헤드를 붙여 가른다. 세 언어 큰 세트 374문항에서
 * 0.8B 생성 183, 4B 생성 310, 판정기(route-v2) 302 — 문형 보정까지 더하면 322 였다.
 * 처음 헤드(route-v1, 합성 851건)는 294 였고, 학습 자료를 1,449건으로 넓혀 올렸다.
 *
 * **학습한 글자와 한 글자도 다르면 안 된다.** 헤드는 이 문구를 읽은 속내로 배웠다.
 * 문구를 고치면 헤드를 다시 학습해야 한다.
 */
export const JUDGE_KIND_INSTRUCTIONS = "What is this League of Legends question asking for?";
export const JUDGE_MINE_INSTRUCTIONS = "Which champion does the user play? (The other one is the opponent.)";

export const JUDGE_KIND_CRITERIA: Record<"matchup" | "guide" | "skills" | "spellStat" | "other", string> = {
  matchup: "The user plays one named champion against another named champion (two champions named)",
  guide: "How to beat or handle one champion, without saying which champion the user plays",
  skills: "What a champion's abilities are; an overview of the kit",
  spellStat: "One number about one champion ability: cooldown, cost, ratio, damage or range",
  other: "Items, runes, summoner spells, objectives, game rules or small talk",
};

/**
 * "그 밖" 을 한 번 더 가르는 판정기(sub-v1)의 질문 꼴. route-v2 가 other 를 고른 질문에만 묻는다.
 *
 * 한 헤드로 아홉 갈래를 가르게 하면(route-v3) 챔피언 네 갈래까지 흔들렸다(route-large 374: 앱 보정 포함
 * 321 → 278). 원본 모델 위의 작은 헤드에게는 둘로 나눠 묻는 편이 낫다. 순서가 곧 선택지 순서다
 * (`scripts/llm/kev-agent/b3/` 의 SUB 와 같다). 학습 자료는 그 밖 258문항을 사람이 다시 붙인 것과
 * 게임 메타 틀 문장이다. dev 27/33.
 */
export const JUDGE_SUB_INSTRUCTIONS = "What kind of League of Legends question is this?";
export const JUDGE_SUB_CRITERIA: Record<"item" | "rune" | "spell" | "game" | "chat", string> = {
  item: "Items: what to buy, what an item does, its price or who builds it",
  rune: "Runes: which to take, what a rune does or how it works",
  spell: "Summoner spells such as Flash, Ignite, Smite, Teleport: when to take them, cooldown, how they work",
  game: "Game rules and meta: objectives and their timers, gold, surrender, remake, ranked and dodging, champion or skin prices, the client",
  chat: "Greetings, thanks, feelings or small talk, not a game question",
};

/**
 * kev LoRA(B3) 판정기의 갈래 — 아홉 칸을 한 번에 묻는다. B3 가 이 문구로 배웠다(`scripts/llm/kev-agent/b3/build_b3.py` KIND3).
 * 원본 모델 위 헤드는 아홉 칸을 한 번에 가르면 챔피언 갈래가 흔들려(route-v3, 321 → 278) 두 단계로 나눴지만,
 * LoRA 는 한 번에 가른다(route-large 374 판정기만 316, 챔피언 4갈래가 헤드보다 높다).
 */
export const JUDGE_KIND9_CRITERIA: Record<Exclude<AskKind, "other">, string> = {
  matchup: JUDGE_KIND_CRITERIA.matchup,
  guide: JUDGE_KIND_CRITERIA.guide,
  skills: JUDGE_KIND_CRITERIA.skills,
  spellStat: JUDGE_KIND_CRITERIA.spellStat,
  ...JUDGE_SUB_CRITERIA,
};

/** 아홉 칸 판정에서 갈래와 내 챔피언을 정한다. 상성은 이름이 둘이어야 한다(`routeFromJudge` 와 같은 제약). */
export function routeFromKind9(kindProbs: number[], mineProbs: number[] | undefined, champions: ChampionCard[]): AskRoute {
  const kinds = Object.keys(JUDGE_KIND9_CRITERIA) as AskKind[];
  const kind = kinds[kindProbs.indexOf(Math.max(...kindProbs))];
  if (kind === "matchup" && champions.length < 2) return { kind: "guide" };
  if (kind !== "matchup" || !mineProbs) return { kind };
  return { kind, mine: champions[mineProbs.indexOf(Math.max(...mineProbs))] };
}

export function subFromJudge(probs: number[]): AskKind {
  const kinds = Object.keys(JUDGE_SUB_CRITERIA) as AskKind[];
  return kinds[probs.indexOf(Math.max(...probs))];
}

export function judgeRouteState(question: string, names: string[]): string {
  return names.length ? `Question: ${question}\nChampions named: ${names.join(", ")}` : `Question: ${question}`;
}

/**
 * 판정기가 낸 확률로 갈래와 내 챔피언을 정한다.
 *
 * 상성은 이름이 둘 나와야 성립한다. "럼블 상대법 알려줘" 처럼 이름이 하나뿐인 물음은 한 챔피언 공략으로 내린다.
 */
export function routeFromJudge(kindProbs: number[], mineProbs: number[] | undefined, champions: ChampionCard[]): AskRoute {
  const kind = KINDS[kindProbs.indexOf(Math.max(...kindProbs))];
  if (kind === "matchup" && champions.length < 2) return { kind: "guide" };
  if (kind !== "matchup" || !mineProbs) return { kind };
  return { kind, mine: champions[mineProbs.indexOf(Math.max(...mineProbs))] };
}
