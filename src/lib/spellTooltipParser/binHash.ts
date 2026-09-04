/**
 * Riot BIN 이 이름을 지운 자리에 남기는 해시 표기.
 *
 * 일부 계산식·DataValue 는 이름 대신 `{6c540a3a}` 같은 해시로만 실려 온다.
 * 툴팁 쪽에는 원래 이름(ExecuteTooltipCalc)이 그대로 남아 있으므로,
 * 이름을 같은 방식으로 해싱해 맞춰보면 찾을 수 있다.
 *
 * 해시는 소문자 문자열에 대한 FNV-1a 32비트다.
 */
export function binHashKey(name: string): string {
  let hash = 0x811c9dc5;
  const lower = name.toLowerCase();
  for (let index = 0; index < lower.length; index += 1) {
    hash ^= lower.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `{${hash.toString(16).padStart(8, "0")}}`;
}
