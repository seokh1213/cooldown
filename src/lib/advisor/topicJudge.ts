/**
 * 주제 판정기의 질문 꼴 — 질문이 어느 갈래와 어느 관점을 묻는가
 *
 * `noteSelect` 는 한국어 낱말 표로 갈래를 골랐다(`TOPIC_PATTERNS`). 질문 갈래
 * (`routeAsk`)가 그랬듯 영어·중국어에서는 거의 아무것도 못 가린다. 같은 판정기(`judge.ts`)에
 * 헤드만 하나 더 붙여 세 언어에서 고르게 가린다.
 *
 * **학습한 글자와 한 글자도 다르면 안 된다.** 학습 자료(`scripts/llm/build-topic-train.ts`)와
 * 이 파일이 같은 문구를 쓴다.
 */
import type { NoteCategory, NotePerspective } from "./noteSelect";

export type TopicLabel = NoteCategory | "general";

export const TOPIC_INSTRUCTIONS = "Which part of the game is this question about?";
export const PERSPECTIVE_INSTRUCTIONS = "Does the user play this champion, or play against it?";

/** 순서가 곧 선택지 순서다. 헤드는 이 순서로 배웠다. */
export const TOPIC_CRITERIA: Record<TopicLabel, string> = {
  combo: "Ability combos, the order to press abilities, trading patterns",
  laning: "The laning phase: early levels, harass, trades in lane, waves and farming",
  teamfight: "Teamfights and group skirmishes",
  phase: "Power over the game: early, mid and late game, scaling, objectives and macro",
  "situational-item": "Items, build, runes, or which stats and resistances to buy",
  "escape-window": "When to engage or all-in, and when the opponent's escape is down",
  skill: "How one ability works or how to use a specific ability",
  general: "General tips with no specific part of the game",
};

export const PERSPECTIVE_CRITERIA: Record<NotePerspective, string> = {
  playing: "The user plays this champion",
  against: "The user plays against this champion",
  both: "Not stated",
};

export const TOPIC_LABELS = Object.keys(TOPIC_CRITERIA) as TopicLabel[];
export const PERSPECTIVE_LABELS = Object.keys(PERSPECTIVE_CRITERIA) as NotePerspective[];

/**
 * 판정기 질문. 앱은 주제만 묻는다.
 *
 * 관점 헤드도 함께 학습했지만 쓰지 않는다. 손으로 쓴 시험 69문항에서 규칙이 모를 때
 * 판정기를 따르게 하니 맞힌 수는 늘었지만(영어 7→13) **반대편 입장으로 답하는** 오답도
 * 늘었다(중국어 0→5). 모를 때 양쪽을 다 보여 주는 규칙 쪽이 안전하다. 학습 자료의
 * 관점 말투가 실제 말투로 옮겨 가지 못한 것이 원인이라 자료를 넓혀 다시 잰다.
 */
export function topicQuestions(championCount: number, withPerspective = false) {
  const options = <T extends string>(criteria: Record<T, string>) =>
    (Object.entries(criteria) as Array<[T, string]>).map(([name, description]) => ({ name, description }));
  return [
    { instructions: TOPIC_INSTRUCTIONS, options: options(TOPIC_CRITERIA) },
    ...(withPerspective && championCount === 1 ? [{ instructions: PERSPECTIVE_INSTRUCTIONS, options: options(PERSPECTIVE_CRITERIA) }] : []),
  ];
}

/** 확률에서 고른다. */
export function topicFromJudge(topicProbs: number[], perspectiveProbs?: number[]): { topic: TopicLabel; perspective?: NotePerspective } {
  const topic = TOPIC_LABELS[topicProbs.indexOf(Math.max(...topicProbs))];
  const perspective = perspectiveProbs ? PERSPECTIVE_LABELS[perspectiveProbs.indexOf(Math.max(...perspectiveProbs))] : undefined;
  return { topic, perspective };
}

/**
 * 질문에 갈래를 못 박는 낱말이 있으면 그것을 따른다. 없으면 undefined(판정기에 맡긴다).
 *
 * 판정기는 챔피언 하나인 문항 72개에서 64개를 맞혔지만 **상성 문항 24개에서는 14개**였다.
 * "가렌으로 다리우스 있는 한타 어떻게 해?" 를 라인전으로, "리븐으로 레넥톤 라인전 어떻게
 * 해?" 를 한타로 갈랐다. 낱말이 그대로 적혀 있는데도 틀린다. 그래서 뜻이 하나뿐인 낱말만
 * 골라 판정기 앞에 둔다. `TOPIC_PATTERNS`(노트 고르기용)처럼 넓게 잡지 않는다 — "들어가",
 * "라인" 같은 말은 다른 뜻으로도 쓰여 여기서는 뺐다.
 *
 * 순서가 곧 우선순위다. 상대 스킬을 슬롯으로 집은 질문("피오라 W 어떻게 빼")이 맨 앞이다.
 */
const TOPIC_WORDS: Array<[RegExp, TopicLabel]> = [
  [/한타|팀\s*파이트|teamfight|team fight|团战/i, "teamfight"],
  [/라인전|laning|对线/i, "laning"],
  [/아이템|템\s|템$|뭐\s*(사|가|올려)|빌드|\bbuild\b|\bitems?\b|what (should I|to) buy|出装|装备/i, "situational-item"],
  [/콤보|연계|\bcombo\b|连招/i, "combo"],
  [/후반|중반|late game|mid game|scal(e|ing)|后期|中期/i, "phase"],
  [/초반|early game|前期/i, "laning"],
  [/언제\s*(들어가|물|진입|이니시|올인)|진입\s*타이밍|when (can|should|do) I (go in|engage|all[- ]?in|jump)|什么时候(进|切|开)/i, "escape-window"],
];

export function topicFromWords(question: string, names: string[] = []): TopicLabel | undefined {
  // "피오라 W 어떻게 빼" — 챔피언 이름 바로 뒤의 슬롯. 스킬 하나를 묻는 것이다.
  for (const name of names) {
    if (new RegExp(`${name}\\s*(의\\s*)?[QWER](?![A-Za-z])|${name}\\s*(궁|궁극기|패시브)`).test(question)) return "skill";
  }
  return TOPIC_WORDS.find(([pattern]) => pattern.test(question))?.[1];
}
