import type { DamageType } from "./contracts";
import { isMinionOnly, splitSentences, withoutNumbers } from "../text/tooltip-sentences";
import {
  amplifiedByFollowUp,
  appliesEffect,
  appliesMark,
  CROWD_CONTROL_TAGS,
  gainsAttackDamage,
  gainsCrit,
  gainsResist,
  gainsStealth,
  GAP,
  GAP_UP,
  grantsImmunity,
  growsWithStacks,
  healsHealth,
  inCondition,
  NOT_APPLIED,
  revives,
  scalesDamage,
  shredsEnemy,
} from "./effectPredicates";

const EFFECT_RULES: Array<[RegExp, string]> = [
  [/__MAGIC_SHRED__/, "적 마법 저항력 감소"],
  [/__ARMOR_SHRED__/, "적 방어력 감소"],
  // 툴팁은 "방어구 관통력" 이라고 적는다. "방어력 관통" 만 보면 다리우스 E,
  // 판테온 R, 닐라 Q 처럼 관통을 주는 스킬을 통째로 놓친다.
  [new RegExp(`(방어구|방어력|물리|마법|주문) 관통력?${GAP_UP}{0,20}(증가|상승|얻|획득)`), "관통"],
  [/둔화/, "둔화"],
  [/기절/, "기절"],
  // "공중으로" 만으로는 잡으면 안 된다. 도끼가 튀거나(드레이븐 Q) 본인이 도약하는(자야 R,
  // 판테온 R, 세트 R) 문장까지 적을 띄우는 것으로 읽힌다.
  // 적을 띄우는 서술은 "띄우/띄웁/띄워" 이고, 당하는 쪽 시점의 "공중에 뜹니다"(람머스 R, 오공 R)도 세다.
  [/띄[우웁워운웠]|공중에 뜨|공중에 뜹/, "에어본"],
  [/침묵/, "침묵"],
  [/속박/, "속박"],
  [/도발/, "도발"],
  [/매혹/, "매혹"],
  [/공포/, "공포"],
  // 말자하 R 은 "적 챔피언을 제압해" 라고 적는다. 억제와 같은 것이다. 다만 케인 P 의
  // "라아스트를 제압하려고 합니다" 는 배경 설명이라 "하려" 가 붙은 것은 세지 않는다.
  [/억제|제압(?!하려)/, "억제"],
  // 활용형이 갈린다. 그라가스 R 은 "밀어냅니다" 라 어간 "밀어내" 로는 안 걸린다.
  [/밀쳐|밀어[내냅냈]|끌어당|끌고 옵|잡아당|끌려가|끌어옵|끌어당김/, "강제 이동(넉백/끌기)"],
  [/보호막(?![^.]{0,15}효과를 (부여|받))/, "보호막"],
  [/__HEAL__/, "회복"],
  [new RegExp(`치유 효과${GAP}{0,10}감소|치유 감소|고통스러운 상처`), "치유 감소"],
  [/__STEALTH__/, "은신"],
  // **움직이는 것이 챔피언인지 봐야 한다.** 이 판정은 아래 championMovesItself 가 맡는다.
  // 여기 목록에 걸리기만 해서는 안 된다. "적에게 날아가는 여우불", "매를 날려 보내",
  // "아군이 쓰레쉬에게 돌진합니다" 가 전부 이동기로 잡혔었다.
  [/__NEVER__/, "이동기"],
  [/__MAXHP_DAMAGE__/, "최대 체력 비례 피해"],
  [/__MISSINGHP__/, "잃은 체력 비례"],
  [/고정 피해/, "고정 피해"],
  // 아우렐리온 솔 E 는 "최대 체력이 … 미만인 적은 즉사합니다" 라고 적는다. 같은 말이다.
  [/처형|즉시 처치|즉사/, "처형"],
  [/강인함/, "강인함"],
  [/__IMMUNE__/, "피해 면역"],
  // 쉔 W 는 "결계 안의 아군 챔피언에 대한 기본 공격이 차단됩니다" 다. 투사체가 아니라 평타를 막는다.
  [/받는 모든 공격[^.]{0,20}막|막아낸 다음|모든 공격과 이동 불가|회피하고|빗나가게|기본 공격이 차단/, "공격 무효화"],
  // 브라움 E 는 "투사체를 가로막아" 라고 적는다. 그 스킬의 본체가 이것이다.
  // 사이에 부사가 낀다. 사미라 W 는 "투사체를 **모두** 파괴합니다" 다.
  // "투사체" 없이 "차단" 만 보면 안 된다. 그레이브즈 W 의 "시야가 차단", 녹턴 R 의 "시야 공유를
  // 차단" 이 투사체 차단으로 잡혔다. 시비르 E(스킬을 막아냄)는 보정(spell-effects.json)이 붙인다.
  [/투사체[^.]{0,12}(막|파괴|가로막|차단)/, "투사체 차단"],
  // 툴팁은 "증가" 로만 적지 않는다. 애쉬 Q 는 "오르며", 피오라 E 는 "상승합니다" 다.
  [new RegExp(`공격 속도${GAP_UP}{0,12}(증가|상승|오르|올라|얻)`), "공격 속도 증가"],
  [new RegExp(`이동 속도${GAP_UP}{0,12}(증가|상승|오르|올라|얻)`), "이동 속도 증가"],
  [/분신|복제/, "분신"],
  // 아래 둘은 gainsResist 가 문장 단위로 가른다
  [/__MR_GAIN__/, "자기 마법 저항력 증가"],
  [/__ARMOR_GAIN__/, "자기 방어력 증가"],
  // 아래 셋도 문장 단위로 가른다
  [/__AD_GAIN__/, "자기 공격력 증가"],
  [/__CRIT__/, "치명타"],
  [/__REVIVE__/, "부활"],
  [/__FOLLOWUP__/, "연계 강화"],
  [/__MARK__/, "표식 부여"],
  [/__STACK__/, "성장 스택"],
  [/__EMPOWER__/, "스킬 강화"],
  [new RegExp(`(공격 )?사거리${GAP_UP}{0,14}(증가|늘어|늘리|길어|상승)`), "사거리 증가"],
  [new RegExp(`(?<!추가 )주문력${GAP_UP}{0,14}(증가|상승|얻|획득)`), "자기 주문력 증가"],
  // 시바나 Q 처럼 "기본 공격 적중 시 … 피해를 입히고" 로만 적는 것도, 애쉬 Q 처럼
  // "강화된 기본 공격은" 이라고 앞에서 꾸미는 것도 평타 강화다.
  [
    /기본 공격[^.]{0,20}(추가|강화)|기본 공격[^.]{0,6}적중 시[^.]{0,30}피해|강화[^.]{0,6}기본 공격/,
    "기본 공격 강화",
  ],
  [/재사용 대기시간[^.]{0,15}초기화/, "쿨타임 초기화"],
  // 닐라 Q 는 "원뿔 범위를 공격", "경로상의 모든 적을 공격" 으로만 적는다. 다만
  // "모든 적" 이 동작의 대상일 때만 센다. 그웬 W 의 "모든 적(포탑 제외)으로부터
  // 대상으로 지정될 수 없는 상태" 는 광역 공격이 아니라 대상 지정 차단이다.
  [/광역|주변 적|범위 내|모든 적[이을에]|원뿔 범위/, "광역"],
];

/**
 * 이 스킬이 **입히는** 피해 유형. 받는 피해는 세지 않는다.
 *
 * "받는 물리 피해가 감소합니다"(갈리오 W, 아무무 E) 가 물리 피해를 입히는 것으로
 * 읽혔다. 갈리오 W 는 마법 피해만 입히는데 물리·마법 둘 다로 적혀 있었다.
 */
const TAKEN_DAMAGE = /받는[^.]{0,20}$/;

export function detectDamageTypes(text: string): DamageType[] {
  const types: DamageType[] = [];
  // 미니언·몬스터에게만 들어가는 피해는 챔피언 상대 피해 유형이 아니다. 누누 Q 의
  // 고정 피해가 그렇다. 그대로 두면 "저항이 값을 못 한다" 는 반대 조언이 나온다.
  const deals = (word: string) =>
    splitSentences(text).some((raw) => {
      if (isMinionOnly(raw)) return false;
      // "받는" 과의 거리를 잴 때도 수치를 지운다. 이렐리아 W 의 "받는 물리 피해가
      // ((40 ~ 70) + (8% 주문력)), 마법 피해가 …" 는 계수가 창 밖으로 밀어내
      // 뒷말인 "마법 피해" 가 입히는 피해로 읽혔다.
      const sentence = withoutNumbers(raw);
      const at = sentence.indexOf(`${word} 피해`);
      return at >= 0 && !TAKEN_DAMAGE.test(sentence.slice(0, at));
    });
  if (deals("물리")) types.push("물리");
  if (deals("마법")) types.push("마법");
  if (deals("고정")) types.push("고정");
  return types;
}

/**
 * 효과 이름을 그대로 쓰는 스킬 이름. 지우면 본문의 진짜 효과까지 사라진다.
 *
 * 피들스틱 Q 의 이름이 **"공포"** 다. 이름을 지우는 규칙이 본문의 "공포에
 * 빠트리고" 까지 통째로 지워서, 피들스틱은 다섯 스킬 전부 공포 태그가 없었다.
 * 이름과 효과어가 겹치면 지우지 않고 그대로 둔다. 그 경우 이름이 효과로 읽히는
 * 것은 어차피 참이다.
 */
const EFFECT_WORDS =
  /^(공포|침묵|속박|도발|매혹|기절|억제|둔화|처형|광역|회복|보호막|은신|분신|강인함|관통|돌진|환생|부활|변신)$/;

/** 표가 아니라 문장 판정으로 가르는 태그. 주어와 대상을 봐야 한다. 한 문장이라도 참이면 그 태그다. */
const SENTENCE_JUDGED = new Map<string, (sentence: string) => boolean>([
  ["적 마법 저항력 감소", (s) => !isMinionOnly(s) && shredsEnemy(s, "마법 저항력")],
  ["적 방어력 감소", (s) => !isMinionOnly(s) && shredsEnemy(s, "방어력")],
  ["자기 마법 저항력 증가", (s) => gainsResist(s, "마법 저항력")],
  ["자기 방어력 증가", (s) => gainsResist(s, "방어력")],
  ["자기 공격력 증가", (s) => !isMinionOnly(s) && gainsAttackDamage(s)],
  ["치명타", (s) => gainsCrit(s)],
  ["부활", (s) => revives(s)],
  ["연계 강화", (s) => !isMinionOnly(s) && amplifiedByFollowUp(s)],
  ["표식 부여", (s) => appliesMark(s)],
  ["성장 스택", (s) => growsWithStacks(s)],
  ["스킬 강화", (s) => /스킬(을|이) 강화/.test(s)],
  ["회복", (s) => !isMinionOnly(s) && healsHealth(s)],
  ["최대 체력 비례 피해", (s) => !isMinionOnly(s) && /최대 체력의|최대 체력에 비례/.test(s) && scalesDamage(s)],
  ["잃은 체력 비례", (s) => !isMinionOnly(s) && /잃은 체력/.test(s) && scalesDamage(s)],
  ["은신", (s) => !isMinionOnly(s) && gainsStealth(s)],
  ["피해 면역", (s) => !isMinionOnly(s) && grantsImmunity(s)],
]);

/** 표(`EFFECT_RULES`)의 정규식으로 가르는 태그가 이 본문에 걸리는가. */
function matchesRule(label: string, re: RegExp, sentences: string[]): boolean {
  // 미니언에게만 걸리는 문장은 챔피언을 상대할 때의 조언이 아니다. 시비르 W 의
  // "체력이 낮은 미니언을 즉시 처치합니다" 가 처형으로 잡혀 "체력을 확보해 처형
  // 구간에서 벗어나라" 는 엉뚱한 말이 나왔다. 전체 본문 대신 문장으로 본다.
  // 수치도 함께 지운다. 피즈 W 의 "다음 기본 공격이 (…)의 마법 피해를 추가로
  // 입힙니다" 는 낱말로는 붙어 있는데 계수가 끼어 창 밖으로 밀려나 있었다.
  if (
    !sentences.some(
      (sentence) =>
        !isMinionOnly(sentence) &&
        re.test(withoutNumbers(sentence)) &&
        !inCondition(label, sentence, re),
    )
  )
    return false;
  /*
   * 군중 제어 태그는 문장 단위로 판정한다.
   *
   * 예: 아트록스 R "근처 미니언이 3초 동안 공포에 떨게 하고" — 챔피언에게 걸리는 공포가 아니다.
   * 대상이 미니언·몬스터로 한정된 문장에서 나온 군중 제어는 상성 판단에서 제외한다.
   */
  if (!NOT_APPLIED.some(([name]) => name === label)) {
    if (!CROWD_CONTROL_TAGS.has(label)) return true;
  }
  // 챔피언에게 유효한 문장에서 나온 경우만 인정한다
  return sentences.some(
    (s) =>
      re.test(withoutNumbers(s)) &&
      !isMinionOnly(s) &&
      appliesEffect(label, s) &&
      !inCondition(label, s, re),
  );
}

/**
 * 스킬 이름이 효과로 읽히는 것을 막는다.
 *
 * 카직스 R 본문의 "공포 감지" 와 킨드레드 P 본문의 "차오르는 공포" 가 공포 효과로
 * 잡혔다. 둘 다 그 챔피언의 다른 스킬 이름이다. 이름은 효과가 아니므로 지우고 본다.
 */
export function detectEffects(text: string, skillNames: string[] = []): string[] {
  const found: string[] = [];
  const cleaned = skillNames
    .filter((name) => name.length >= 2 && !EFFECT_WORDS.test(name.trim()))
    .reduce((acc, name) => acc.split(name).join(" "), text);
  const sentences = splitSentences(cleaned);
  for (const [re, label] of EFFECT_RULES) {
    if (found.includes(label)) continue;
    const judge = SENTENCE_JUDGED.get(label);
    if (judge) {
      // 영구히 자라는 것과 한동안만 세지는 것은 다른 이야기다. 둘 다 걸리면
      // 영구 쪽이 이긴다. 스몰더 P 처럼 쌓은 것이 곧 강화인 경우가 그렇다.
      if (label === "스킬 강화" && found.includes("성장 스택")) continue;
      if (sentences.some(judge)) found.push(label);
      continue;
    }
    if (matchesRule(label, re, sentences)) found.push(label);
  }
  return found;
}
