/** 갈래·주제·대화 흐름은 각각 학습한 판정 헤드를 사용한다. */

/*
 * 판정 헤드(`public/models/judge/<이름>.{json,bin}`). 판정마다 헤드가 다르다.
 *
 * 처음엔 kev-b3e 하나가 갈래(아홉 칸)·주제·대화 흐름을 다 골랐다. 대화 흐름에 lookup 칸을 더하며 그 한 헤드를 다시 배우게 했더니
 * 손대지 않은 주제 판정이 흔들렸다 — 대화 270턴 A 가 240 → 234. 판정마다 헤드를 따로 두니 237(흐름은 새 문구로, 갈래·주제는 제
 * 자료 그대로). 헤드 파일이 없으면 `judge` 가 거절하고 오프라인 판정기(`useAskAdvisor`)가 받는다. 오프라인 판정기는 헤드 이름을 보지 않는다.
 */
/** 갈래(아홉 칸)와 내 챔피언(`judgeRoute`) */
export const ROUTE_HEAD = "kev-b3e-route";

/** 주제와 관점(`judgeTopic`·`matchupTopic`) */
export const TOPIC_HEAD = "kev-b3e-topic";

/** 상성 대화의 흐름(일곱 칸, lookup 포함 — `continueMatchup`) */
export const ACT_HEAD = "kev-b3e-act";

/** 세 판정을 한 헤드로 하던 때의 이름. 앱은 더 쓰지 않고 옛 측정 도구(`scripts/llm/kev-agent/eval-b3.ts`)가 기본값으로 남겨 둔다 */
export const KEV_HEAD = "kev-b3e";
