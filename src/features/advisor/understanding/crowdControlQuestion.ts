import type { Cleanser } from "@/domain/knowledge/controlInteractions";
export type { Cleanser } from "@/domain/knowledge/controlInteractions";
export const CLEANSERS: Array<[Cleanser, RegExp]> = [
  ["cleanse", /정화|\bcleanse\b|净化/i],
  ["qss", /수은|장식띠|헤르메스|\bqss\b|quicksilver|mercurial|水银/i],
  ["mikael", /미카엘|mikael|米凯尔/i],
];
export type ControlQuery = "types" | "sequence" | "cleanse" | "tenacity" | "smite";
export const askedCleansers = (question: string): Cleanser[] => CLEANSERS.filter(([, words]) => words.test(question)).map(([method]) => method);
export const mentionsCrowdControl = (question: string): boolean => /(?:하드|소프트)\s*(?:CC|씨씨)?|군중\s*제어|\bcc\b|기절|속박|에어본|제압|억제|침묵|매혹|공포|도발|수면|졸음|변이|실명|시야\s*축소|정지|고정|광란|crowd\s*control|\b(stun|root|suppression|stasis|charm|fear|polymorph|ground|sleep|asleep|drowsy)\b|控制|眩晕|禁锢|压制|睡眠|昏睡|困倦/i.test(question);
export const asksControlDuration = (question: string): boolean => /지속\s*시간|(?:수면|졸음|기절|속박|제압|억제|매혹|공포|도발|침묵|변이|실명)\s*시간|몇\s*초|얼마나\s*(?:오래|동안)|duration|how long|持续\s*时间|睡眠\s*时间|几秒/i.test(question);

/** 수치 조회는 별도 사실 흐름에 맡긴다. 아이템 구매 조언도 해제 판정으로 바꾸지 않는다. */
export function controlQuery(question: string): ControlQuery | undefined {
  if (/업글|업그레이드|upgrade|升级/i.test(question) && /강타|smite|惩戒/i.test(question)) return undefined;
  if (/가격|골드|정수|\b(?:gold|price|cost)\b|多少钱|价格|合成/i.test(question)) return undefined;
  if (/쿨|재사용|사거리|계수|피해량|둔화율|cooldown|\bcd\b|range|ratio|冷却|射程|伤害数值/i.test(question)) return undefined;
  if (/강인함|tenacity|韧性/i.test(question)) return "tenacity";
  if (asksControlDuration(question) || /얼마나/.test(question)) return undefined;
  if (/강타|스마|\bsmite\b|惩戒/i.test(question)) return "smite";
  if ((askedCleansers(question).length || /해제|풀(?:면|리|려|린|렸)|풀어(?!야)|dispel|remove|解除/i.test(question))
    && !/사야|사면|살까|빌드|템트리|구매|rush|buy|build|购买|出装/i.test(question)) return "cleanse";
  if (asksCrowdControlSequence(question)) return "sequence";
  return asksCrowdControl(question) ? "types" : undefined;
}

/** CC 종류 조회와 쿨/피해/운용 질문을 구분한다. */
export function asksCrowdControl(question: string): boolean {
  if (asksControlDuration(question)) return false;
  if (/쿨|재사용|사거리|계수|피해량|둔화율|지속시간|몇\s*초|얼마나|cooldown|range|ratio|damage|duration|冷却|射程|伤害/i.test(question)) return false;
  return mentionsCrowdControl(question);
}

/** 발동 순서 질문은 검증한 단계 설명을 우선한다. 효과 배열의 나열 순서를 시간 순서로 추정하지 않는다. */
export function asksCrowdControlSequence(question: string): boolean {
  const order = /먼저|다음|나중|순서|선후|전후|\b(before|after|first|then|sequence|order)\b|先|随后|然后|顺序/i;
  const effect = /속박|밀치|기절|에어본|제압|수면|졸음|날[아라]|\bcc\b|root|knock|stun|sleep|drows|kick|禁锢|击退|击飞|控制/i;
  return order.test(question) && effect.test(question);
}
