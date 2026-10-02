/** CC 종류 조회와 쿨/피해/운용 질문을 구분한다. */
export function asksCrowdControl(question: string): boolean {
  if (/쿨|재사용|사거리|계수|피해량|둔화율|지속시간|몇\s*초|얼마나|cooldown|range|ratio|damage|duration|冷却|射程|伤害/i.test(question)) return false;
  return /(?:하드|소프트)\s*(?:CC|씨씨)?|군중\s*제어|\bcc\b|기절|속박|에어본|제압|억제|침묵|매혹|공포|도발|수면|졸음|변이|실명|시야\s*축소|정지|고정|광란|crowd\s*control|\b(stun|root|suppression|stasis|charm|fear|polymorph|ground)\b|控制|眩晕|禁锢|压制/i.test(question);
}

/** 발동 순서 질문은 검증한 단계 설명을 우선한다. 효과 배열의 나열 순서를 시간 순서로 추정하지 않는다. */
export function asksCrowdControlSequence(question: string): boolean {
  const order = /먼저|다음|나중|순서|선후|전후|\b(before|after|first|then|sequence|order)\b|先|随后|然后|顺序/i;
  const effect = /속박|밀치|기절|에어본|제압|수면|졸음|날[아라]|\bcc\b|root|knock|stun|sleep|drows|kick|禁锢|击退|击飞|控制/i;
  return order.test(question) && effect.test(question);
}
