/** CC 종류 조회와 쿨/피해/운용 질문을 구분한다. */
export function asksCrowdControl(question: string): boolean {
  if (/쿨|재사용|사거리|계수|피해량|둔화율|지속시간|몇\s*초|얼마나|cooldown|range|ratio|damage|duration|冷却|射程|伤害/i.test(question)) return false;
  return /(?:하드|소프트)\s*(?:CC|씨씨)?|군중\s*제어|\bcc\b|기절|속박|에어본|제압|억제|침묵|매혹|공포|도발|수면|졸음|변이|실명|시야\s*축소|정지|고정|광란|crowd\s*control|\b(stun|root|suppression|stasis|charm|fear|polymorph|ground)\b|控制|眩晕|禁锢|压制/i.test(question);
}
