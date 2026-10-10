import type { FormulaGroup } from "./formulaGroup";
import { MITIGATION_FORMULAS } from "./mitigation";
import { PENETRATION_FORMULAS } from "./penetration";
import { OFFENSE_FORMULAS } from "./offense";
import { SUSTAIN_FORMULAS } from "./sustain";
import { MOVEMENT_FORMULAS } from "./movement";
import { GROWTH_FORMULAS } from "./growth";
import { RECURSIVE_FORMULAS } from "./recursive";

/**
 * 게임 안에서 수치가 실제로 어떻게 계산되는지 적어 두는 표.
 *
 * 스킬 툴팁은 "방어구 관통력 40" 까지만 알려 주고, 그게 피해량에 어떻게
 * 반영되는지는 말해 주지 않는다. 순서·중첩 방식·상한처럼 툴팁 어디에도
 * 안 적혀 있는 시스템 규칙을 모았다.
 *
 * 계산식 자체는 언어와 무관하므로 번역 파일이 아니라 여기 둔다.
 * (i18n 쪽에 넣으면 영어·중국어 문자열이 같아져 번역 누락 검사에 걸린다)
 *
 * 근거는 LoL Fandom 위키 문서와 인게임 데이터다.
 * 패치로 바뀐 항목에는 패치를 함께 적는다.
 */

export const FORMULA_GROUPS: FormulaGroup[] = [
  MITIGATION_FORMULAS,
  PENETRATION_FORMULAS,
  OFFENSE_FORMULAS,
  SUSTAIN_FORMULAS,
  MOVEMENT_FORMULAS,
  GROWTH_FORMULAS,
  RECURSIVE_FORMULAS,
];
