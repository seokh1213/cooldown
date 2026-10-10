import { withoutNumbers } from "../text/tooltip-sentences";

/**
 * 저항 감소는 **적의 저항이 줄 때만** 센다.
 *
 * "방어력 … 감소" 를 그대로 잡았더니 자기 쪽 문장까지 걸렸다. 태그가 붙은 19개 중
 * 셋이 틀렸다.
 *
 *   아무무 E  "받는 물리 피해가 (3% 추가 방어력) … 감소합니다"   자기 피해 감소
 *   크산테 Q  "추가 방어력 및 마법 저항력만큼 … 시전 시간 감소"   자기 저항이 계수
 *   크산테 R  "추가 방어력이 85% … 감소"                      자기 저항이 줄어듦
 *
 * 가르는 표시는 "추가 방어력/마법 저항력"(자기 스탯을 계수나 대상으로 쓰는 꼴)과
 * "받는"(자기가 받는 피해) 이다. 맞게 붙은 열여섯은 전부 "대상의", "적은", "챔피언은"
 * 처럼 상대를 가리키고 그 표시가 없다.
 */
const SELF_RESIST = /추가 (방어력|마법 저항력)|받는/;

/**
 * 한 문장 안에서 낱말과 낱말 사이.
 *
 * 여기서 쓰는 창은 전부 `[^.]{0,n}` 이었다. 마침표를 문장 끝으로 보고 문장을 넘지
 * 않겠다는 뜻인데, 툴팁의 수치는 **소수점을 쓴다**. 레넥톤 E 의 "방어력을
 * 25/27.5/30/32.5/35% 감소시킵니다" 는 27.5 의 점에서 창이 끊겨 저항 감소를
 * 통째로 놓쳤다. 숫자 사이의 점은 문장 끝이 아니므로 지나가게 한다.
 */
export const GAP = "(?:[^.]|\\.(?=\\d))";

/**
 * 위와 같되 줄어드는 말을 막는다.
 *
 * 징크스 Q 의 "추가 공격 속도는 10% 느려지지만 사거리는 … 증가합니다" 가 공격
 * 속도 증가로 잡혔다. 뒷절의 "증가" 가 창 안에 들어온 탓이다. 창 안에 "감·느·줄"
 * 이 있으면 방향이 반대이거나 다른 대상의 이야기다.
 */
export const GAP_UP = "(?:[^.감느줄]|\\.(?=\\d))";

/*
 * 주어를 보지 않아 생긴 오독들. 전부 "그 문장이 무엇을 말하는가" 를 한 번 더 본다.
 *
 *   회복            "마나를 회복합니다"(브랜드 P, 카서스 E, 흐웨이 W) 가 체력 회복으로
 *   최대 체력 비례   "최대 체력의 …를 회복"(가렌 P) 이 최대 체력 비례 **피해** 로
 *   잃은 체력 비례   "잃은 체력에 비례해 회복"(카르마 R) 이 피해로
 *   은신            "은신 상태가 아닌 적을 드러냅니다"(다이애나 Q) 가 은신으로
 */

/**
 * 남이 나에게 걸어 주는 것을 조건으로 적은 문장.
 *
 * 루시안 P 는 "아군이 루시안에게 직접 **회복 또는 보호막 효과를 부여하거나** …
 * 권총이 과충전 상태가 됩니다" 다. 루시안이 회복시키거나 보호막을 주는 것이 아니라
 * 남이 해 줬을 때 켜지는 조건이다.
 */
const GIVEN_BY_OTHER = /(회복|보호막)[^.]{0,15}효과를 (부여|받)/;

/**
 * 체력을 돌려주는가.
 *
 * "회복" 만 보면 마나 회복(제이스 W, 노틸러스 Q)과 소모값 반환(올라프 E)이 걸리고,
 * "되돌" 까지 보면 구체가 되돌아가는 문장(오리아나 P)과 방패가 되돌아오는 문장
 * (뽀삐 P)까지 걸린다. **체력이라고 적혀 있을 때만** 센다.
 */
export function healsHealth(sentence: string): boolean {
  if (GIVEN_BY_OTHER.test(sentence)) return false;
  if (!/회복|치유/.test(sentence)) return false;
  if (/체력/.test(sentence)) return true;
  // 렝가 W 는 "5초 동안 입은 피해의 50%를 회복합니다" 라고만 적는다. 돌려받는 것이
  // 체력이라는 말이 없지만 피해를 되돌리는 문장이므로 체력이다. 다른 자원을 말하는
  // 문장은 그 자원 이름이 적혀 있으니 그것으로 가른다.
  return /피해/.test(sentence) && !/마나|기력|분노|에너지/.test(sentence);
}

/** 체력 비례 표현이 피해를 말하는가, 회복을 말하는가. */
export function scalesDamage(sentence: string): boolean {
  return /피해/.test(sentence) && !/회복|치유|보호막/.test(sentence);
}

/**
 * 그 효과를 **거는가**. 면역이거나 계산 설명이면 아니다.
 *
 *   마스터 이 R  "모든 둔화 효과에 대해 면역이 됩니다"      → 둔화
 *   카타리나 R   "물리 피해는 공격 속도에 비례해 증가"        → 공격 속도 증가
 *   멜 W        "마법 관통력이 적용되기 전 능력치를 기준으로"  → 관통
 */
export const NOT_APPLIED: Array<[string, RegExp]> = [
  ["둔화", /둔화[^.]{0,12}(면역|저항|해제|제거)/],
  ["기절", /기절[^.]{0,12}(면역|저항|해제|제거)/],
  ["공격 속도 증가", /공격 속도에 비례/],
  ["관통", /관통력이 적용|관통력을 무시|관통력을 기준/],
];

/**
 * 군중 제어가 **조건**으로 적힌 문장.
 *
 * 알리스타 P 는 "적 챔피언을 기절시키거나, 공중으로 띄워 올리거나, 뒤로
 * 밀어내거나, 적이 죽을 때마다 중첩을 얻습니다" 다. 기절·에어본·넉백은 P 가 거는
 * 것이 아니라 다른 스킬로 그렇게 했을 때 P 가 반응하는 조건이다.
 *
 * "거나" 만 보면 안 된다. 그 어미는 조건뿐 아니라 **선택지**도 잇는다. 질리언 E 의
 * "적 챔피언을 둔화시키거나 아군 챔피언의 이동 속도를 높입니다" 와 크산테 W 의
 * "더는 적을 뒤로 밀어내거나 기절시키지 않습니다" 가 그렇게 지워졌다. 그래서
 * 문장에 방아쇠 표시("때마다", "…면")가 함께 있을 때만 조건으로 본다.
 */
const TRIGGER = /때마다|하면|되면|으면|[을를이가]\s*\S*면\s/;

/** 군중 제어 효과 태그. 조건 판정과 미니언 한정 문장 판정이 함께 쓰고, 상성 주장(`claims.ts`)은 여기서 둔화를 뺀다. */
export const CROWD_CONTROL_TAGS: ReadonlySet<string> = new Set([
  "기절",
  "에어본",
  "강제 이동(넉백/끌기)",
  "침묵",
  "속박",
  "도발",
  "매혹",
  "공포",
  "억제",
  "둔화",
]);

/**
 * 이미 그 효과에 걸린 대상을 가리키는 말. 거는 것이 아니라 고르는 것이다.
 *
 * 아리 W 는 "여우불은 **매혹에 적중한** 챔피언, 아리가 공격한 적, 이외 챔피언
 * 순으로 공격합니다" 다. 우선순위를 말할 뿐 W 가 매혹을 걸지는 않는다.
 */
const ALREADY_AFFECTED = /^(된|에 적중|당한|에 걸린|상태)/;

export function inCondition(label: string, sentence: string, re: RegExp): boolean {
  if (!CROWD_CONTROL_TAGS.has(label)) return false;
  const trigger = TRIGGER.test(sentence);
  const found = new RegExp(re.source, "g");
  let any = false;
  for (const match of sentence.matchAll(found)) {
    any = true;
    const after = sentence.slice((match.index ?? 0) + match[0].length);
    if (ALREADY_AFFECTED.test(after)) continue;
    // 조건 어미가 바로 뒤에 없으면 그 자리는 실제로 거는 것이다.
    if (trigger && /^[^.]{0,8}(거나|때마다)/.test(after)) continue;
    return false;
  }
  return any;
}

export function appliesEffect(label: string, sentence: string): boolean {
  const rule = NOT_APPLIED.find(([name]) => name === label);
  return !rule || !rule[1].test(sentence);
}

/**
 * 피해를 안 받는 상태가 되는가.
 *
 * "피해를 입지 않으**면** 보호막이 생긴다"(말파이트 P, 세주아니 P, 갈리오 W…)는
 * 면역이 아니라 **조건**이다. 열다섯 중 여덟이 이 꼴이었다. 뒤에 오는 어미로 가른다.
 */
const IMMUNE_CONDITION = /(피해를 입지 않|피해를 받지 않)(으면|면|고|거나)/;

export function grantsImmunity(sentence: string): boolean {
  if (!/무적|피해를 받지 않|피해를 입지 않/.test(sentence)) return false;
  if (/무적/.test(sentence)) return true;
  return !IMMUNE_CONDITION.test(sentence);
}

/** 은신을 얻는가. 은신을 깨거나 드러내는 문장은 제외한다. */
export function gainsStealth(sentence: string): boolean {
  if (!/은신|투명 상태|모습을 감/.test(sentence)) return false;
  return !/드러|해제|아닌|밝혀|감지|보입니다/.test(sentence);
}

export function shredsEnemy(text: string, word: "방어력" | "마법 저항력"): boolean {
  // "감소" 만 보면 코그모 Q 의 "낮춥니다" 와 렐 P 의 "훔칩니다" 를 놓친다. 셋 다
  // 적의 저항이 줄어드는 같은 말이다. 훔치는 쪽은 그만큼 자기 저항이 늘기도 하므로
  // 아래 gainsResist 도 같은 동사를 본다.
  const pattern = new RegExp(`[^.]{0,60}${word}[^.]{0,30}?(감소|낮[추춥춤출]|훔[치칩침쳐친칠])`);
  const span = pattern.exec(withoutNumbers(text))?.[0];
  return Boolean(span) && !SELF_RESIST.test(span as string);
}

/**
 * 자기 공격력이 오르는가.
 *
 * 저항과 같은 꼴이라 같은 방식으로 본다. 다만 둘을 가려야 한다. 잔나 E 는
 * "**대상은** … 공격력을 얻습니다" 라 아군에게 주는 것이고, 트런들 Q 는 "트런들의
 * 공격력이 증가하며 **적의** 공격력은 감소합니다" 라 한 문장에 둘이 같이 있다.
 */
const OTHER_AD = /대상은|아군|적의 공격력/;

export function gainsAttackDamage(sentence: string): boolean {
  const clean = withoutNumbers(sentence);
  // 계수로 쓰인 "추가 공격력" 은 오르는 것이 아니다.
  // 사일러스 R 은 "공격력 **계수**를 주문력 계수로 전환해 … 총 공격력**당** 주문력을
  // 얻습니다" 다. 공격력을 계수로 쓸 뿐 공격력이 오르지는 않는다.
  if (/공격력 계수|공격력당/.test(clean)) return false;
  const pattern = /(?<!추가 )공격력[^.감]{0,16}?(증가|상승|얻|획득)/;
  const span = pattern.exec(clean)?.[0];
  if (!span) return false;
  if (/사거리|속도|계수|전환/.test(span)) return false;
  return !OTHER_AD.test(clean.slice(0, clean.indexOf(span) + span.length));
}

/**
 * 치명타 확률이 오르는가.
 *
 * "기본 공격이 (100% + (100% 치명타 확률))의 피해" (애쉬 P) 처럼 계산식에 쓰인 것은
 * 오르는 것이 아니다. 괄호를 지우고 보면 갈린다.
 */
export function gainsCrit(sentence: string): boolean {
  const clean = withoutNumbers(sentence);
  // 유미 Q 의 "단짝의 치명타 확률에 따라 증가" 는 남의 확률을 계수로 쓰는 말이다.
  if (/치명타 확률에 (따라|비례)|치명타 확률\)/.test(clean)) return false;
  if (/치명타 확률[^.감]{0,16}?(증가|상승|오르|얻)/.test(clean)) return true;
  // 유나라 P 의 "치명타가 추가 마법 피해를 입힙니다" 도 치명타를 축으로 쓰는 말이다.
  // 다만 애쉬 P 는 "치명타는 추가 피해를 **가하지 않는** 대신" 이라 뜻이 반대다.
  if (/치명타[가는이][^.]{0,30}(하지 않|입히지 않)/.test(clean)) return false;
  return /치명타[가는이][^.]{0,20}(추가|증폭)/.test(clean);
}

/**
 * 표식을 **거는** 스킬인가.
 *
 * 연계는 두 쪽으로 갈린다. 르블랑 Q 와 레오나 P 는 표식을 **남기는** 쪽이고,
 * 애니비아 E 는 그 조건이 이미 붙어 있을 때 **세지는** 쪽이다. 상대하는 사람이
 * 할 일이 정반대다 — 앞엣것은 첫 스킬을 피하는 것이고, 뒤엣것은 걸린 채로 서
 * 있지 않는 것이다. 한 이름으로 묶으면 그 구분이 사라진다.
 *
 * "표식을 남긴 챔피언을 우선 공격합니다"(아크샨 E)는 거는 것이 아니라 쓰는 쪽이다.
 * 어미로 가른다.
 */
const MARKS = /(표식|인장|낙인|각인)을 (남깁|남기고|남기며|남긴 뒤|부여|새깁|찍)/;

export function appliesMark(sentence: string): boolean {
  return MARKS.test(sentence);
}

/**
 * 시간이 지날수록 영구히 세지는가.
 *
 * 베이가 P 의 "극악 1중첩당 주문력이 1 증가", 나서스 Q 의 중첩, 신드라·스몰더·
 * 빅토르의 스택이 모두 같은 말이다. 상성 판단에서 이것은 한 가지를 뜻한다.
 * **시간을 주면 안 된다.** 무엇이 자라는지(스탯이냐 스킬이냐)는 그다음이다.
 */
export function growsWithStacks(sentence: string): boolean {
  if (!/중첩|스택|영구|성장|파편/.test(sentence)) return false;
  // 자라는 말이 하나가 아니다. 빅토르 P 는 "영구적으로 **업그레이드**됩니다" 이고
  // 스몰더 P 는 "중첩은 기본 스킬을 **강화**합니다" 다.
  if (!/증가|강화|늘어|커지|올라|업그레이드|진화/.test(sentence)) return false;
  // 지속시간이나 효과가 잠깐 세지는 것은 성장이 아니다.
  return /중첩당|중첩마다|중첩은|영구|누적|쌓을수록|쌓일수록|쌓일 때마다|획득할 때마다/.test(sentence);
}

/**
 * 다른 스킬이 먼저 걸려야 세지는가.
 *
 * 애니비아 E 는 "적이 **냉각 상태일 경우** 두 배" 이고, 르블랑 Q 는 "**표식이 남은**
 * 적을 스킬로 공격하면 인장이 폭발" 이다. 상성 판단에 그대로 쓰인다 — "Q 를 피하면
 * E 가 절반" 이라는 말이 되기 때문이다.
 *
 * 피해가 커지는 것만 센다. 요릭 E 처럼 표식 쪽으로 빨리 걸어가는 것은 다른 이야기다.
 */
const FOLLOW_UP =
  /상태(일|인|라면|이면)[^.]{0,12}(경우|적|대상)|표식이 (있는|남은|붙은|있으면)|표식이 붙어|중첩된 대상/;

export function amplifiedByFollowUp(sentence: string): boolean {
  if (!FOLLOW_UP.test(sentence)) return false;
  // 세진다는 것이 낱말이 아니라 **수치**로만 적히기도 한다. 애니비아 E 는 "냉각
  // 상태일 경우" 뒤에 그냥 두 배인 수치를 적을 뿐 "증가" 라고 쓰지 않는다. 그래서
  // 피해를 말하는 문장이면 센다. 요릭 E 처럼 표식 쪽으로 빨리 걷는 것은 피해가
  // 없으므로 저절로 빠진다.
  return /피해/.test(sentence);
}

/**
 * 스스로 되살아나는가.
 *
 * 모데카이저 R 의 "대상이 부활할 때까지" 와 시바나 R 의 "부활하기 전까지" 는 남의
 * 부활을 시각으로 쓰는 말이다. 아크샨 W 와 질리언 R 은 아군을 되살리는데, 상대하는
 * 쪽에서는 "죽여도 일어난다" 라는 같은 뜻이라 함께 센다.
 */
export function revives(sentence: string): boolean {
  // 문장째로 보면 안 된다. 사이온 P 는 "처치된 다음 **되살아나** … 하지만
  // **부활한 동안**에는 체력이 떨어집니다" 라 한 문장에 둘이 같이 있다.
  for (const match of sentence.matchAll(/부활|되살아|되살립|환생/g)) {
    const after = sentence.slice((match.index ?? 0) + match[0].length);
    if (!/^(할 때까지|하기 전|한 동안|하면)/.test(after)) return true;
  }
  return false;
}

/**
 * 자기 저항이 오르는가.
 *
 * "증가" 만 보면 람머스 W 의 "방어력을 (…) 마법 저항력을 (…) 얻고" 를 놓친다.
 * 다만 "방어구 관통력을 얻습니다" 는 저항이 아니라 관통이므로 창 안에 관통이
 * 들어오면 버린다.
 */
export function gainsResist(sentence: string, word: "방어력" | "마법 저항력"): boolean {
  // 창이 12 자면 나르 P 의 "방어력이 , 마법 저항력이 증가합니다"(수치를 지운 뒤)가
  // 아슬아슬하게 걸리지 않는다. 한국어는 동사가 절 끝에 오므로 조금 넉넉히 본다.
  const pattern = new RegExp(`${word}[^.감]{0,16}?(증가|얻|획득|훔[치칩침쳐친칠])`);
  const span = pattern.exec(withoutNumbers(sentence))?.[0];
  if (!span) return false;
  return !/관통/.test(span);
}
