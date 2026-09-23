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
