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
function healsHealth(sentence: string): boolean {
  if (!/회복|치유/.test(sentence)) return false;
  return /체력/.test(sentence);
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
function withoutNumbers(sentence: string): string {
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
 * 자기 저항이 오르는가.
 *
 * "증가" 만 보면 람머스 W 의 "방어력을 (…) 마법 저항력을 (…) 얻고" 를 놓친다.
 * 다만 "방어구 관통력을 얻습니다" 는 저항이 아니라 관통이므로 창 안에 관통이
 * 들어오면 버린다.
 */
function gainsResist(sentence: string, word: "방어력" | "마법 저항력"): boolean {
  const pattern = new RegExp(`${word}[^.감]{0,12}?(증가|얻|획득|훔[치칩침쳐친칠])`);
  const span = pattern.exec(withoutNumbers(sentence))?.[0];
  if (!span) return false;
  return !/관통/.test(span);
}

const EFFECT_RULES: Array<[RegExp, string]> = [
  [/__MAGIC_SHRED__/, "적 마법 저항력 감소"],
  [/__ARMOR_SHRED__/, "적 방어력 감소"],
  [/방어력 관통|마법 관통/, "관통"],
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
  [/억제/, "억제"],
  [/밀쳐|밀어내|끌어당|끌고 옵|잡아당|끌려가|끌어옵|끌어당김/, "강제 이동(넉백/끌기)"],
  [/보호막/, "보호막"],
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
  [/처형|즉시 처치/, "처형"],
  [/강인함/, "강인함"],
  [/__IMMUNE__/, "피해 면역"],
  [/받는 모든 공격[^.]{0,20}막|막아낸 다음|모든 공격과 이동 불가|회피하고|빗나가게/, "공격 무효화"],
  [/투사체를 (막|파괴)|막아냅|차단/, "투사체 차단"],
  [new RegExp(`공격 속도${GAP}{0,12}증가`), "공격 속도 증가"],
  [new RegExp(`이동 속도${GAP}{0,12}증가`), "이동 속도 증가"],
  [/분신|복제/, "분신"],
  // 아래 둘은 gainsResist 가 문장 단위로 가른다
  [/__MR_GAIN__/, "자기 마법 저항력 증가"],
  [/__ARMOR_GAIN__/, "자기 방어력 증가"],
  [/기본 공격[^.]{0,20}(추가|강화)/, "기본 공격 강화"],
  [/재사용 대기시간[^.]{0,15}초기화/, "쿨타임 초기화"],
  [/광역|주변 적|범위 내/, "광역"],
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
    splitSentences(text).some((sentence) => {
      if (isMinionOnly(sentence)) return false;
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
  const mentionsChampion = /챔피언|적에게|적을|적이|대상/.test(sentence);
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
 * 스킬 이름이 효과로 읽히는 것을 막는다.
 *
 * 카직스 R 본문의 "공포 감지" 와 킨드레드 P 본문의 "차오르는 공포" 가 공포 효과로
 * 잡혔다. 둘 다 그 챔피언의 다른 스킬 이름이다. 이름은 효과가 아니므로 지우고 본다.
 */
export function detectEffects(text: string, skillNames: string[] = []): string[] {
  const found: string[] = [];
  const cleaned = skillNames
    .filter((name) => name.length >= 2)
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
    if (!re.test(cleaned)) continue;
    if (!NOT_APPLIED.some(([name]) => name === label)) {
      if (!CHAMPION_RELEVANT_TAGS.has(label)) {
        found.push(label);
        continue;
      }
    }
    // 챔피언에게 유효한 문장에서 나온 경우만 인정한다
    const validSentence = sentences.some((s) => re.test(s) && !isMinionOnly(s) && appliesEffect(label, s));
    if (validSentence) found.push(label);
  }
  return found;
}
