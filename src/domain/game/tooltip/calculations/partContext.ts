import type { ChampionSpell } from "@/domain/game/types";
import type { CommunityDragonSpellData, DroppedCalculation, TooltipLocale } from "../contracts";
import type { CalcResult, Value } from "./contracts";

/**
 * DataValue 이름 → 값.
 * optional 이면 없어도 진단에 남기지 않는다 (구조 판별용 시험 조회, 게임이 0 으로 읽는 빈 이름).
 */
export type DataValueEvaluator = (
  name: string,
  options?: { optional?: boolean },
) => Value | null;

export interface EvaluatorContext {
  spell: ChampionSpell;
  data: CommunityDragonSpellData;
  lang: TooltipLocale;
  evaluateDataValue: DataValueEvaluator;
  /** 다른 계산식 참조용 */
  evaluateCalculation: (key: string, visited: Set<string>) => CalcResult;
  /**
   * 값을 버린 자리를 알린다 (툴팁 진단용).
   * key 를 비우면 지금 평가 중인 계산식 키가 채워진다.
   */
  reportDrop?: (entry: Omit<DroppedCalculation, "key"> & { key?: string }) => void;
}
