import type { Language } from "@/shared/i18n/translations";

type Localized = Record<Language, string>;

export interface FormulaEntry {
  id: string;
  /** 이 값에 해당하는 스탯 아이콘 (statIcons 의 이름) */
  icon?: string;
  title: Localized;
  /**
   * 계산식.
   *
   * 한때 "언어와 무관하다" 고 적어 두고 한국어로만 썼다. 식 자체는 언어를 안 타지만
   * 그 안의 낱말은 탄다 — 영어 화면에 "받는 피해 = 원래 피해 × 100 / (100 + 저항력)"
   * 이 그대로 나왔다. 스물여섯 줄 전부 그랬다.
   */
  formula: Localized;
  description: Localized;
  /** 숫자를 넣어 본 예시 */
  example?: Localized;
  /** 한 줄로 합친 식처럼 폭을 다 쓰는 편이 나은 항목 */
  wide?: boolean;
}

export interface FormulaGroup {
  id: string;
  title: Localized;
  entries: FormulaEntry[];
}
