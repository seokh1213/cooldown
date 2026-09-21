import type { ChampionAbility } from "./data";
import type { DamageType, ScalingProfile, SpellFact } from "./facts";
import { round } from "./text";

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
const GAP = "(?:[^.]|\\.(?=\\d))";

/**
 * 위와 같되 줄어드는 말을 막는다.
 *
 * 징크스 Q 의 "추가 공격 속도는 10% 느려지지만 사거리는 … 증가합니다" 가 공격
 * 속도 증가로 잡혔다. 뒷절의 "증가" 가 창 안에 들어온 탓이다. 창 안에 "감·느·줄"
 * 이 있으면 방향이 반대이거나 다른 대상의 이야기다.
 */
const GAP_UP = "(?:[^.감느줄]|\\.(?=\\d))";

/**
 * 주어를 보지 않아 생긴 오독들. 전부 "그 문장이 무엇을 말하는가" 를 한 번 더 본다.
 *
 *   회복            "마나를 회복합니다"(브랜드 P, 카서스 E, 흐웨이 W) 가 체력 회복으로
 *   최대 체력 비례   "최대 체력의 …를 회복"(가렌 P) 이 최대 체력 비례 **피해** 로
 *   잃은 체력 비례   "잃은 체력에 비례해 회복"(카르마 R) 이 피해로
 *   은신            "은신 상태가 아닌 적을 드러냅니다"(다이애나 Q) 가 은신으로
 */
/**
 * 체력을 돌려주는가.
 *
 * "회복" 만 보면 마나 회복(제이스 W, 노틸러스 Q)과 소모값 반환(올라프 E)이 걸리고,
 * "되돌" 까지 보면 구체가 되돌아가는 문장(오리아나 P)과 방패가 되돌아오는 문장
 * (뽀삐 P)까지 걸린다. **체력이라고 적혀 있을 때만** 센다.
 */
/**
 * 남이 나에게 걸어 주는 것을 조건으로 적은 문장.
 *
 * 루시안 P 는 "아군이 루시안에게 직접 **회복 또는 보호막 효과를 부여하거나** …
 * 권총이 과충전 상태가 됩니다" 다. 루시안이 회복시키거나 보호막을 주는 것이 아니라
 * 남이 해 줬을 때 켜지는 조건이다.
 */
const GIVEN_BY_OTHER = /(회복|보호막)[^.]{0,15}효과를 (부여|받)/;

function healsHealth(sentence: string): boolean {
  if (GIVEN_BY_OTHER.test(sentence)) return false;
  if (!/회복|치유/.test(sentence)) return false;
  if (/체력/.test(sentence)) return true;
  // 렝가 W 는 "5초 동안 입은 피해의 50%를 회복합니다" 라고만 적는다. 돌려받는 것이
  // 체력이라는 말이 없지만 피해를 되돌리는 문장이므로 체력이다. 다른 자원을 말하는
  // 문장은 그 자원 이름이 적혀 있으니 그것으로 가른다.
  return /피해/.test(sentence) && !/마나|기력|분노|에너지/.test(sentence);
}

/** 체력 비례 표현이 피해를 말하는가, 회복을 말하는가. */
function scalesDamage(sentence: string): boolean {
  return /피해/.test(sentence) && !/회복|치유|보호막/.test(sentence);
}

/**
 * 그 효과를 **거는가**. 면역이거나 계산 설명이면 아니다.
 *
 *   마스터 이 R  "모든 둔화 효과에 대해 면역이 됩니다"      → 둔화
 *   카타리나 R   "물리 피해는 공격 속도에 비례해 증가"        → 공격 속도 증가
 *   멜 W        "마법 관통력이 적용되기 전 능력치를 기준으로"  → 관통
 */
const NOT_APPLIED: Array<[string, RegExp]> = [
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
const CC_LABELS = new Set([
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

function inCondition(label: string, sentence: string, re: RegExp): boolean {
  if (!CC_LABELS.has(label)) return false;
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

function appliesEffect(label: string, sentence: string): boolean {
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

function grantsImmunity(sentence: string): boolean {
  if (!/무적|피해를 받지 않|피해를 입지 않/.test(sentence)) return false;
  if (/무적/.test(sentence)) return true;
  return !IMMUNE_CONDITION.test(sentence);
}

/** 은신을 얻는가. 은신을 깨거나 드러내는 문장은 제외한다. */
function gainsStealth(sentence: string): boolean {
  if (!/은신|투명 상태|모습을 감/.test(sentence)) return false;
  return !/드러|해제|아닌|밝혀|감지|보입니다/.test(sentence);
}

/**
 * 수치 표기를 지운다.
 *
 * 한국어 툴팁은 "A와 B를 얻습니다" 처럼 동사가 절 끝에 온다. 그 사이에 괄호 계수와
 * 등급별 수치가 끼면 낱말 거리가 수십 자로 벌어진다.
 *
 *   람머스 W  "방어력을 (35.1/44/… + (30/…% 방어력)), 마법 저항력을 (…) 얻고"
 *   브라이어 Q "방어력 및 마법 저항력을 10/12.5/15/17.5/20% 감소시킵니다"
 *
 * 창을 넓히면 상관없는 뒷절까지 들어온다. 재기 전에 수치를 지워 낱말만 남긴다.
 */
export function withoutNumbers(sentence: string): string {
  return sentence.replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, " ").replace(/[\d.,/~%\s]{2,}/g, " ");
}

function shredsEnemy(text: string, word: "방어력" | "마법 저항력"): boolean {
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

function gainsAttackDamage(sentence: string): boolean {
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
function gainsCrit(sentence: string): boolean {
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

function appliesMark(sentence: string): boolean {
  return MARKS.test(sentence);
}

/**
 * 시간이 지날수록 영구히 세지는가.
 *
 * 베이가 P 의 "극악 1중첩당 주문력이 1 증가", 나서스 Q 의 중첩, 신드라·스몰더·
 * 빅토르의 스택이 모두 같은 말이다. 상성 판단에서 이것은 한 가지를 뜻한다.
 * **시간을 주면 안 된다.** 무엇이 자라는지(스탯이냐 스킬이냐)는 그다음이다.
 */
function growsWithStacks(sentence: string): boolean {
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

function amplifiedByFollowUp(sentence: string): boolean {
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
function revives(sentence: string): boolean {
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
function gainsResist(sentence: string, word: "방어력" | "마법 저항력"): boolean {
  // 창이 12 자면 나르 P 의 "방어력이 , 마법 저항력이 증가합니다"(수치를 지운 뒤)가
  // 아슬아슬하게 걸리지 않는다. 한국어는 동사가 절 끝에 오므로 조금 넉넉히 본다.
  const pattern = new RegExp(`${word}[^.감]{0,16}?(증가|얻|획득|훔[치칩침쳐친칠])`);
  const span = pattern.exec(withoutNumbers(sentence))?.[0];
  if (!span) return false;
  return !/관통/.test(span);
}

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
  [/받는 모든 공격[^.]{0,20}막|막아낸 다음|모든 공격과 이동 불가|회피하고|빗나가게/, "공격 무효화"],
  // 브라움 E 는 "투사체를 가로막아" 라고 적는다. 그 스킬의 본체가 이것이다.
  // 사이에 부사가 낀다. 사미라 W 는 "투사체를 **모두** 파괴합니다" 다.
  [/투사체를[^.]{0,6}(막|파괴|가로막)|막아냅|차단/, "투사체 차단"],
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

/** "(105% 주문력)", "(50% 추가 공격력)", "최대 체력의 8%" 같은 계수 표기를 스탯별 최대값으로 수집 */
const RATIO_STATS =
  "주문력|추가 공격력|공격력|총 공격력|추가 체력|최대 체력|체력|추가 방어력|방어력|추가 마법 저항력|마법 저항력|추가 공격 속도";
const RATIO_PAREN_RE = new RegExp(`\\((\\d+(?:\\.\\d+)?)% (${RATIO_STATS})\\)`, "g");
const RATIO_MAXHP_RE = /(?:최대|추가) 체력의 ([\d./]+)%/g;

export function detectRatios(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of text.matchAll(RATIO_PAREN_RE)) {
    const value = Number(m[1]);
    const stat = m[2];
    out[stat] = Math.max(out[stat] ?? 0, value);
  }
  for (const m of text.matchAll(RATIO_MAXHP_RE)) {
    // "6/6.5/7/7.5/8" → 최대 랭크 값
    const parts = m[1].split("/").map(Number).filter((n) => !Number.isNaN(n));
    if (parts.length) out["최대 체력"] = Math.max(out["최대 체력"] ?? 0, parts[parts.length - 1]);
  }
  return out;
}

/**
 * 시뮬레이션 항(structured terms)에서 계수를 뽑는다.
 * 툴팁 정규식보다 정확하므로 값이 있으면 이쪽을 우선한다.
 */
const SIM_STAT_LABEL: Record<string, string> = {
  abilityPower: "주문력",
  bonusAttackDamage: "추가 공격력",
  totalAttackDamage: "공격력",
  bonusHealth: "추가 체력",
  maxHealth: "최대 체력",
  bonusArmor: "추가 방어력",
  armor: "방어력",
  bonusMagicResist: "추가 마법 저항력",
  magicResist: "마법 저항력",
};

export function ratiosFromSimulation(ability: ChampionAbility): Record<string, number> {
  const out: Record<string, number> = {};
  const terms = ability.simulation?.primary?.terms ?? [];
  for (const term of terms) {
    const label = SIM_STAT_LABEL[term.stat];
    if (!label) continue;
    const values = term.coefficientsByRankAndLevel?.flat() ??
      term.coefficientsByLevel ??
      term.coefficientsByRank ??
      [];
    const max = Math.max(...values.filter((n) => Number.isFinite(n)), 0);
    if (max <= 0) continue;
    out[label] = Math.max(out[label] ?? 0, round(max * 100, 1));
  }
  return out;
}

export function buildScalingProfile(spells: SpellFact[]): ScalingProfile {
  let apSpells = 0;
  let adSpells = 0;
  let healthSpells = 0;
  for (const s of spells) {
    const keys = Object.keys(s.ratios);
    if (keys.includes("주문력")) apSpells += 1;
    if (keys.some((k) => /공격력/.test(k))) adSpells += 1;
    if (keys.some((k) => /체력/.test(k))) healthSpells += 1;
  }
  let primary: ScalingProfile["primary"] = "없음";
  if (apSpells === 0 && adSpells === 0) primary = healthSpells > 0 ? "체력" : "없음";
  else if (apSpells >= adSpells * 2) primary = "AP";
  else if (adSpells >= apSpells * 2) primary = "AD";
  else primary = "혼합";
  return { apSpells, adSpells, healthSpells, primary };
}

/**
 * 군중 제어 태그는 문장 단위로 판정한다.
 *
 * 예: 아트록스 R "근처 미니언이 3초 동안 공포에 떨게 하고" — 챔피언에게 걸리는 공포가 아니다.
 * 대상이 미니언·몬스터로 한정된 문장에서 나온 군중 제어는 상성 판단에서 제외한다.
 */
const CHAMPION_RELEVANT_TAGS = new Set([
  "기절",
  "에어본",
  "침묵",
  "속박",
  "도발",
  "매혹",
  "공포",
  "억제",
  "강제 이동(넉백/끌기)",
  "둔화",
]);

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=니다\.?)\s+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isMinionOnly(sentence: string): boolean {
  const mentionsMinion = /미니언|몬스터/.test(sentence);
  // 복수형을 빠뜨리면 안 된다. 클레드 E 의 "경로 상에 있는 적들에게 … 물리 피해를
  // 입히고, 미니언과 작은 몬스터를 …" 가 통째로 미니언 전용으로 걸러져 피해 유형이
  // 사라졌다. 이 판정은 회복·체력 비례·은신·피해 면역이 모두 함께 쓴다.
  const mentionsChampion = /챔피언|적들|적에게|적을|적이|대상/.test(sentence);
  return mentionsMinion && !mentionsChampion;
}

/**
 * 이 스킬로 움직이는 것이 챔피언 자신인가.
 *
 * **낱말만 보면 안 된다.** "적에게 날아가는 여우불"(아리 W), "매를 날려 보내"(애쉬 E),
 * "아군이 쓰레쉬에게 돌진합니다"(쓰레쉬 W) 가 전부 이동기로 잡혀 있었다. 그 탓에
 * "상대는 이동기가 없어 접근하면 이탈이 어렵다" 라는 근거가 반대로 나갔다.
 *
 * 그래서 **주어를 본다.** 챔피언 이름이 주격으로 나오는 문장에서 자기 이동 동사가 나와야 한다.
 * 앞에 다른 주어가 있으면 그쪽이 움직이는 것이다.
 */
// 어간 뒤 활용형을 요구한다. 관형형(-는)은 남의 동작을 꾸미는 말이라 뺀다.
// "돌진 도중"(야스오 Q)은 명사, "돌진하는 적을 막습니다"(뽀삐 W)는 남의 돌진이다.
const SELF_MOVE_VERBS =
  /돌진[하해합했한](?!는)|돌격[하해합했한](?!는)|도약[하해합했한](?!는)|도약\s?후|비행하(?!는)|활공하(?!는)|하늘을 날|미끄러지|몸을 날[려립]|순간이동|순간적으로 이동|뒤로 밀려|쪽으로 끌려|향해 끌려/;
// 주격(이/가)뿐 아니라 주제(은/는)도 주어 자리다.
const OTHER_SUBJECT = /(아군|적|대상|미니언|몬스터|소환수|랜턴|이 스킬|챔피언)[이가은는]\s/g;

/**
 * 이 스킬로 **누군가가** 돌진하는가.
 *
 * `이동기` 와 묻는 것이 다르다. 쓰레쉬 W 어둠의 통로는 쓰레쉬가 아니라 아군이 돌진하지만,
 * 그 돌진은 뽀삐 W 굳건한 태세로 막힌다. 시전자가 움직이느냐(이탈·진입 판단)와
 * 돌진 판정이 생기느냐(차단 가능 여부)는 별개 질문이라 태그를 나눈다.
 *
 * 한계: 리엇 내부의 대시 판정이 아니라 한국어 툴팁 서술을 본다. 툴팁이 "돌진" 이라
 * 쓰지 않는 이동기(아크샨 E 갈고리)는 잡지 못한다.
 */
const DASH_VERBS = /돌진[하해합했한]|돌격[하해합했한]|도약[하해합했한]|도약\s?후|뛰어[오올]|몸을 날[려립]/;
// "돌진하는 적을 막습니다"(뽀삐 W) 는 남의 돌진을 막는 쪽이라 제 스킬의 돌진이 아니다.
const DASH_REACTION = /돌진하는[^.]{0,20}(막|차단|저지|멈추)/;

export function abilityCausesDash(text: string): boolean {
  return splitSentences(text).some(
    (sentence) => DASH_VERBS.test(sentence) && !DASH_REACTION.test(sentence),
  );
}

/** 당하는 쪽이 반드시 적히는 피동 이동. 주어 생략 추정을 적용하지 않는다. */
const PASSIVE_MOVE = /밀려|끌려/;

export function championMovesItself(text: string, championName: string): boolean {
  const escaped = championName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const subject = new RegExp(`${escaped}(?:이|가|은|는)`, "g");
  const verbs = new RegExp(SELF_MOVE_VERBS.source, "g");
  for (const sentence of splitSentences(text)) {
    for (const verb of sentence.matchAll(verbs)) {
      const at = verb.index ?? 0;
      // **동사에 가장 가까운 주어가 그 동작의 주체다.**
      // 쓰레쉬 W 는 "쓰레쉬가 ... 아군이 ... 돌진합니다" 라 등장 순서만 봐서는 틀린다.
      const lastBefore = (re: RegExp): number => {
        let best = -1;
        for (const m of sentence.matchAll(re)) {
          const i = m.index ?? 0;
          if (i < at && i > best) best = i;
        }
        return best;
      };
      const mine = lastBefore(subject);
      const other = lastBefore(OTHER_SUBJECT);
      // 한국어 툴팁은 시전자가 주어면 생략한다("대상을 뚫고 돌진하여" — 야스오 E).
      // 단, 피동으로 밀리거나 끌려가는 서술은 당하는 쪽이 반드시 적혀 있으므로
      // 주어가 없다고 시전자로 보면 안 된다. 능동 이동 동사에만 생략을 인정한다.
      if (mine < 0 && other < 0) {
        if (PASSIVE_MOVE.test(verb[0])) continue;
        return true;
      }
      if (mine < 0) continue;
      if (other > mine) continue;
      return true;
    }
  }
  return false;
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
    // 아래 넷은 표가 아니라 문장 판정으로 가른다. 주어와 대상을 봐야 한다.
    if (label === "적 마법 저항력 감소" || label === "적 방어력 감소") {
      const word = label === "적 마법 저항력 감소" ? "마법 저항력" : "방어력";
      if (sentences.some((sentence) => !isMinionOnly(sentence) && shredsEnemy(sentence, word))) found.push(label);
      continue;
    }
    if (label === "자기 마법 저항력 증가" || label === "자기 방어력 증가") {
      const word = label === "자기 마법 저항력 증가" ? "마법 저항력" : "방어력";
      if (sentences.some((sentence) => gainsResist(sentence, word))) found.push(label);
      continue;
    }
    if (label === "자기 공격력 증가") {
      if (sentences.some((sentence) => !isMinionOnly(sentence) && gainsAttackDamage(sentence))) found.push(label);
      continue;
    }
    if (label === "치명타") {
      if (sentences.some((sentence) => gainsCrit(sentence))) found.push(label);
      continue;
    }
    if (label === "부활") {
      if (sentences.some((sentence) => revives(sentence))) found.push(label);
      continue;
    }
    if (label === "연계 강화") {
      if (sentences.some((sentence) => !isMinionOnly(sentence) && amplifiedByFollowUp(sentence))) found.push(label);
      continue;
    }
    if (label === "표식 부여") {
      if (sentences.some((sentence) => appliesMark(sentence))) found.push(label);
      continue;
    }
    if (label === "성장 스택") {
      if (sentences.some((sentence) => growsWithStacks(sentence))) found.push(label);
      continue;
    }
    if (label === "스킬 강화") {
      // 영구히 자라는 것과 한동안만 세지는 것은 다른 이야기다. 둘 다 걸리면
      // 영구 쪽이 이긴다. 스몰더 P 처럼 쌓은 것이 곧 강화인 경우가 그렇다.
      if (found.includes("성장 스택")) continue;
      if (sentences.some((sentence) => /스킬(을|이) 강화/.test(sentence))) found.push(label);
      continue;
    }
    if (label === "회복") {
      if (sentences.some((sentence) => !isMinionOnly(sentence) && healsHealth(sentence))) found.push(label);
      continue;
    }
    if (label === "최대 체력 비례 피해") {
      if (sentences.some((s2) => !isMinionOnly(s2) && /최대 체력의|최대 체력에 비례/.test(s2) && scalesDamage(s2))) found.push(label);
      continue;
    }
    if (label === "잃은 체력 비례") {
      if (sentences.some((s2) => !isMinionOnly(s2) && /잃은 체력/.test(s2) && scalesDamage(s2))) found.push(label);
      continue;
    }
    if (label === "은신") {
      if (sentences.some((sentence) => !isMinionOnly(sentence) && gainsStealth(sentence))) found.push(label);
      continue;
    }
    if (label === "피해 면역") {
      if (sentences.some((sentence) => !isMinionOnly(sentence) && grantsImmunity(sentence))) found.push(label);
      continue;
    }
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
      continue;
    if (!NOT_APPLIED.some(([name]) => name === label)) {
      if (!CHAMPION_RELEVANT_TAGS.has(label)) {
        found.push(label);
        continue;
      }
    }
    // 챔피언에게 유효한 문장에서 나온 경우만 인정한다
    const validSentence = sentences.some(
      (s) =>
        re.test(withoutNumbers(s)) &&
        !isMinionOnly(s) &&
        appliesEffect(label, s) &&
        !inCondition(label, s, re),
    );
    if (validSentence) found.push(label);
  }
  return found;
}
