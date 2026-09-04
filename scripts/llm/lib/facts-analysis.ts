import type { ChampionAbility } from "./data";
import type { DamageType, ScalingProfile, SpellFact } from "./facts";
import { round } from "./text";

const EFFECT_RULES: Array<[RegExp, string]> = [
  [/마법 저항력[^.]{0,30}?감소/, "적 마법 저항력 감소"],
  [/방어력[^.]{0,30}?감소/, "적 방어력 감소"],
  [/방어력 관통|마법 관통/, "관통"],
  [/둔화/, "둔화"],
  [/기절/, "기절"],
  [/공중으로|띄워/, "에어본"],
  [/침묵/, "침묵"],
  [/속박/, "속박"],
  [/도발/, "도발"],
  [/매혹/, "매혹"],
  [/공포/, "공포"],
  [/억제/, "억제"],
  [/밀쳐|밀어내|끌어당|끌고 옵|잡아당|끌려가|끌어옵|끌어당김/, "강제 이동(넉백/끌기)"],
  [/보호막/, "보호막"],
  [/체력을? 회복|회복합니다|회복시|치유합/, "회복"],
  [/치유 효과[^.]{0,10}감소|치유 감소|고통스러운 상처/, "치유 감소"],
  [/은신|투명 상태|모습을 감/, "은신"],
  [/돌진|도약|뛰어|순간이동|이동합니다|날아/, "이동기"],
  [/최대 체력의|최대 체력에 비례/, "최대 체력 비례 피해"],
  [/잃은 체력/, "잃은 체력 비례"],
  [/고정 피해/, "고정 피해"],
  [/처형|즉시 처치/, "처형"],
  [/강인함/, "강인함"],
  [/무적|피해를 받지 않|피해를 입지 않/, "피해 면역"],
  [/받는 모든 공격[^.]{0,20}막|막아낸 다음|모든 공격과 이동 불가|회피하고|빗나가게/, "공격 무효화"],
  [/투사체를 (막|파괴)|막아냅|차단/, "투사체 차단"],
  [/공격 속도[^.]{0,12}증가/, "공격 속도 증가"],
  [/이동 속도[^.]{0,12}증가/, "이동 속도 증가"],
  [/분신|복제/, "분신"],
  // "감소 효과가 50% 증가" 같은 문장을 배제하기 위해 창 안에 '감' 이 없어야 함
  [/마법 저항력[^.감]{0,12}증가/, "자기 마법 저항력 증가"],
  [/(?<!마법 저항력[^.]{0,12})방어력[^.감]{0,12}증가/, "자기 방어력 증가"],
  [/기본 공격[^.]{0,20}(추가|강화)/, "기본 공격 강화"],
  [/재사용 대기시간[^.]{0,15}초기화/, "쿨타임 초기화"],
  [/광역|주변 적|범위 내/, "광역"],
];

export function detectDamageTypes(text: string): DamageType[] {
  const types: DamageType[] = [];
  if (/물리 피해/.test(text)) types.push("물리");
  if (/마법 피해/.test(text)) types.push("마법");
  if (/고정 피해/.test(text)) types.push("고정");
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
    const max = Math.max(...term.coefficientsByRank.filter((n) => Number.isFinite(n)), 0);
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

export function detectEffects(text: string): string[] {
  const found: string[] = [];
  const sentences = splitSentences(text);
  for (const [re, label] of EFFECT_RULES) {
    if (found.includes(label)) continue;
    if (!re.test(text)) continue;
    if (!CHAMPION_RELEVANT_TAGS.has(label)) {
      found.push(label);
      continue;
    }
    // 챔피언에게 유효한 문장에서 나온 경우만 인정한다
    const validSentence = sentences.some((s) => re.test(s) && !isMinionOnly(s));
    if (validSentence) found.push(label);
  }
  return found;
}

