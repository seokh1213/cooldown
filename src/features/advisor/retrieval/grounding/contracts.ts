import type { Language } from "../../../../shared/i18n";

export interface Material {
  /** 이 해설이 쓰인 언어. 말을 찾는 규칙이 언어마다 다르다. */
  lang: Language;
  /** 슬롯 → 그 스킬이 실제로 가진 효과 태그 */
  effectsBySlot: Map<string, Set<string>>;
  /** 스킬 이름 → 슬롯 */
  slotByName: Map<string, string>;
  /** 슬롯 → 툴팁 본문. 태그가 비어도 본문에는 적혀 있는 효과가 많다. */
  textBySlot: Map<string, string>;
  /**
   * 이 챔피언 스킬들의 효과 태그 전체.
   *
   * `key` 는 카드에 적힌 한국어, `surface` 는 모델이 실제로 쓸 그 언어의 말이다.
   * 둘을 갈라 두지 않았을 때는 영어·중국어 해설에서 태그가 **하나도** 안 잡혔다.
   * 카드에는 "둔화" 라고 적혀 있는데 모델은 "slow" 라고 쓰기 때문이다. 짝이 안
   * 맞는 문장이 걸리지 않고 그대로 나갔다.
   */
  allTags: Array<{ key: string; surface: string }>;
  /** 노트 문장. 여기서 온 말은 정의상 옳다. */
  noteSentences: string[];
  /** 카드 첫 줄이 적어 둔 피해 유형과 계수. 여기와 어긋나면 큰 거짓말이다. */
  profiles: Array<{ name: string; damage: string; scaling: string }>;
  /** 스킬 이름 → 그 스킬을 가진 챔피언 이름 */
  ownerByName: Map<string, string>;
  /**
   * 프롬프트가 재료로 실어 준 카드 줄들.
   *
   * 모델이 이것을 답에 그대로 옮겨 적는다. "오공 P 바위 피부: 회복, 분신" 처럼
   * 줄줄이 늘어놓고 마지막에 두 문장을 붙이는 꼴이다. 틀린 말이 아니라서 어느
   * 규칙에도 안 걸렸는데, 카드가 화면에 이미 있으므로 값이 0 이다.
   *
   * 베낀 것과 제대로 쓴 글은 조사로 갈린다. 베끼면 "오공 P 바위 피부: 회복" 처럼
   * 원문 그대로라 어절이 다 겹치고, 제 말로 쓰면 "바위 피부는 회복을 줍니다" 처럼
   * 조사가 붙어 안 겹친다.
   */
  cardLines: string[];
}

export type Verdict = "note" | "card-ok" | "card-wrong" | "unsupported" | "number" | "duplicate" | "boilerplate";

export interface GroundResult {
  text: string;
  /** 걷어낸 문장. 화면에는 안 쓰고 평가에만 쓴다. */
  dropped: Array<{ sentence: string; verdict: Verdict }>;
}
