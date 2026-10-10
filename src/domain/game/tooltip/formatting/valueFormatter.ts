import { Value } from "../calculations/contracts";
import { isVector } from "../calculations/values";
import { formatNumber } from "./formatters";

/**
 * 값을 툴팁 문자열로 변환
 */
export function valueToTooltipString(value: Value): string {
  if (isVector(value)) {
    const allSame = value.every((v) => v === value[0]);
    return allSame
      ? formatNumber(value[0])
      : value.map((v) => formatNumber(v)).join("/");
  }
  return formatNumber(value);
}
