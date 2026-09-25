import type { ChampionCard } from "../../../scripts/llm/lib/facts";

/**
 * 질문이 무엇을 묻는지 **모델에게** 가리게 한다
 *
 * 지금까지는 한국어 낱말 목록이 이 일을 했다. `상대|맞붙|만나면|카운터…` 같은 표를
 * 늘려 가며 맞췄는데, 언어가 늘면 그 표를 언어 수만큼 다시 써야 한다. 실제로 세
 * 언어로 재 보니 이미 무너져 있었다.
 *
 *          한국어   영어   중국어
 *   규칙     5/6    1/6    1/6
 *   0.8B     2/6    3/6    3/6
 *   4B       6/6    4/6    6/6
 *
 * 영어·중국어 사용자에게는 규칙이 거의 아무것도 못 가린다. 반면 4B 는 세 언어에서
 * 고르게 맞힌다. 그래서 모델이 있으면 모델이 가르고, 없을 때만 규칙이 돈다.
 *
 * 프롬프트에 **한국어 낱말을 적지 않는다.** 갈래 이름과 뜻풀이만 영어로 두면 어느
 * 언어로 물어도 같은 규칙이 돈다. 이 파일이 늘어나야 할 까닭이 생기면 그것은
 * 갈래가 늘었을 때이지 언어가 늘었을 때가 아니다.
 */

/**
 * 질문이 겨냥하는 것. 화면이 어떤 카드를 지을지 정한다.
 *
 * 4B(생성으로 가름)와 route-v2 는 앞의 다섯만 쓴다. 판정기는 "그 밖" 을 sub-v1 으로 다섯으로 더 나눈다 — 이어 묻기에서
 * "방어력 올려?"(아이템, 앞 상성의 이어 묻기)와 "항복 몇 분부터?"(게임 규칙, 새 질문)를 가르려면 둘이 한
 * 갈래여서는 안 됐다.
 */
export type AskKind = "matchup" | "guide" | "skills" | "spellStat" | "other" | "item" | "rune" | "spell" | "game" | "chat";

const KINDS: AskKind[] = ["matchup", "guide", "skills", "spellStat", "other"];

/**
 * 갈래와 시점을 한 번에 묻는다.
 *
 * 둘을 따로 물으면 왕복이 두 번이다. 상성일 때만 시점이 필요하므로 한 줄에 담아
 * 받는다. 답은 `kind|champion` 꼴이고, 상성이 아니면 뒤쪽이 비어 온다.
 */
export function routePrompt(names: string[]): string {
  /*
   * 문구를 두 번 다듬었다. 처음 판본에서 4B 가 둘을 틀렸는데 둘 다 문구 탓이었다.
   *   "럼블 상대법 알려줘"  → matchup (챔피언이 하나뿐인데)
   *   "What does Conqueror do" → spellStat (정복자는 룬인데)
   * 그래서 matchup 에 "두 이름이 다 나와야 한다" 를 못 박고, other 에 룬·아이템은
   * 이름이 나와도 other 라고 적었다.
   */
  return [
    "Classify a League of Legends question. The user may write in any language.",
    "",
    "Labels:",
    `  matchup   — the user plays one champion INTO another. Requires TWO champion names (${names.length} named here).`,
    "  guide     — how to beat or handle ONE champion, when the user has not said which champion they play",
    "  skills    — what a champion's abilities are, an overview of the kit",
    "  spellStat — one number about one champion ability (cooldown, cost, ratio, damage, range)",
    "  other     — items, runes, summoner spells, game rules, small talk. A rune or item name is still other.",
    "",
    names.length === 2
      ? `If and only if the label is matchup, also name which of these the user plays: ${names.join(", ")}`
      : "",
    "",
    "Reply with one line: label|champion",
    "Leave champion empty when the label is not matchup. No explanation.",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface AskRoute {
  kind: AskKind;
  /** 상성일 때 사용자가 잡은 챔피언. 모델이 못 고르면 비어 있다. */
  mine?: ChampionCard;
}

/**
 * 모델이 돌려준 한 줄을 읽는다.
 *
 * 라벨을 그대로 안 쓰고 살을 붙여 오는 일이 잦아서(`label: matchup`) 포함 여부로
 * 본다. 아무 라벨도 없으면 읽지 못한 것으로 치고 `undefined` 를 돌려준다 —
 * 부르는 쪽이 규칙으로 되돌아간다.
 */
export function parseRoute(reply: string, champions: ChampionCard[]): AskRoute | undefined {
  const lower = reply.toLowerCase();
  // `spellStat` 이 `skills` 보다 먼저 걸려야 한다. 둘 다 들어 있으면 더 좁은 쪽이 맞다.
  const kind = KINDS.find((label) => lower.includes(label.toLowerCase()));
  if (!kind) return undefined;
  /*
   * 상성은 이름이 둘 나와야 성립한다. 자료가 정하는 제약이지 말이 정하는 것이 아니다.
   *
   * "럼블 상대법 알려줘" 처럼 이름이 하나뿐인 물음에 모델이 matchup 을 내놓는 일이
   * 있었다. 문구로 못 박아 봐도 그대로였다. 화면도 어차피 둘이어야 상성 카드를 짓기
   * 때문에, 여기서 한 챔피언 공략으로 내려 둔다.
   */
  if (kind === "matchup" && champions.length < 2) return { kind: "guide" };
  const mine = champions.find((card) => reply.includes(card.name));
  return { kind, mine };
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
 * 상성은 이름이 둘 나와야 성립한다는 제약은 `parseRoute` 와 같게 둔다.
 */
export function routeFromJudge(kindProbs: number[], mineProbs: number[] | undefined, champions: ChampionCard[]): AskRoute {
  const kind = KINDS[kindProbs.indexOf(Math.max(...kindProbs))];
  if (kind === "matchup" && champions.length < 2) return { kind: "guide" };
  if (kind !== "matchup" || !mineProbs) return { kind };
  return { kind, mine: champions[mineProbs.indexOf(Math.max(...mineProbs))] };
}
