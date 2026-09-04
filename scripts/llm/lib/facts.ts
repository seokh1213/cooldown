/**
 * 챔피언 "사실 카드(fact card)" 생성
 *
 * 정규화 데이터(스탯/스킬 툴팁)에서 LLM 이 바로 쓸 수 있는 파생 사실을 계산한다.
 * - 레벨별 스탯 + 전체 챔피언 대비 백분위/등급 ("마법 저항력: 매우 낮음")
 * - 스킬별 피해 유형, 효과 태그 (마법 저항력 감소, 둔화, 보호막 …)
 * - 챔피언 단위 피해 프로필 (주 피해 유형)
 *
 * 여기서 만드는 값은 전부 데이터에서 결정적으로 도출되므로 LLM 이 지어낼 여지를 줄인다.
 */
import type {
  ChampionSpellSlot,
  LevelScaledScalar,
} from "../../../src/types/combatNormalized";
import type { ChampionAbility, ChampionRecord } from "./data";
import { formatLevels, round, stripHtml } from "./text";

export type StatName =
  | "health"
  | "armor"
  | "magicResist"
  | "attackDamage"
  | "attackSpeed"
  | "moveSpeed"
  | "healthRegen";

export type StatGrade = "매우 낮음" | "낮음" | "보통" | "높음" | "매우 높음";

export interface StatSnapshot {
  lv1: number;
  lv6: number;
  lv11: number;
  lv18: number;
  /** 0(최저) ~ 100(최고) 백분위, 레벨 1 기준 */
  percentileLv1: number;
  percentileLv18: number;
  gradeLv1: StatGrade;
  gradeLv18: StatGrade;
}

export type DamageType = "물리" | "마법" | "고정";

export interface SpellFact {
  slot: ChampionSpellSlot;
  name: string;
  /** 한 줄 요약 (있을 때) */
  summary?: string;
  /** 툴팁 평문 (HTML 제거) */
  text: string;
  cooldown?: string;
  /** 1레벨(첫 랭크) 쿨타임 초 — 교전 창 계산용 */
  cooldownRank1?: number;
  cost?: string;
  damageTypes: DamageType[];
  effects: string[];
  /** 툴팁에서 뽑은 계수 (스탯 → 최대 % 값). 예: { "주문력": 105, "추가 공격력": 50 } */
  ratios: Record<string, number>;
}

export interface ScalingProfile {
  /** 주문력 계수가 있는 스킬 수 */
  apSpells: number;
  /** 공격력/추가 공격력 계수가 있는 스킬 수 */
  adSpells: number;
  /** 체력 계수(최대/추가 체력)가 있는 스킬 수 */
  healthSpells: number;
  primary: "AP" | "AD" | "혼합" | "체력" | "없음";
}

export interface ChampionCard {
  id: string;
  name: string;
  title?: string;
  roleTags: string[];
  resource?: string;
  rangeType: "근접" | "원거리";
  attackRange: number;
  stats: Record<StatName, StatSnapshot>;
  damageProfile: {
    physical: number;
    magical: number;
    trueDamage: number;
    primary: "물리" | "마법" | "혼합";
  };
  scalingProfile: ScalingProfile;
  /** 챔피언 전체에서 발견된 효과 태그 (중복 제거) */
  mechanics: string[];
  spells: SpellFact[];
}

/** LoL 성장 공식: base + growth × (L−1) × (0.7025 + 0.0175 × (L−1)) */
export function statAtLevel(scalar: LevelScaledScalar, level: number): number {
  if (scalar.valuesByLevel && scalar.valuesByLevel[level - 1] !== undefined) {
    return scalar.valuesByLevel[level - 1];
  }
  const n = level - 1;
  return scalar.base + scalar.perLevel * n * (0.7025 + 0.0175 * n);
}

/** 공격 속도는 base × (1 + growth%/100 × 성장계수) */
function attackSpeedAtLevel(scalar: LevelScaledScalar, level: number): number {
  const n = level - 1;
  return scalar.base * (1 + (scalar.perLevel / 100) * n * (0.7025 + 0.0175 * n));
}

const STAT_NAMES: StatName[] = [
  "health",
  "armor",
  "magicResist",
  "attackDamage",
  "attackSpeed",
  "moveSpeed",
  "healthRegen",
];

function valueOf(champ: ChampionRecord, stat: StatName, level: number): number {
  const scalar = champ.baseStats[stat];
  if (stat === "attackSpeed") return attackSpeedAtLevel(scalar, level);
  return statAtLevel(scalar, level);
}

function toGrade(percentile: number): StatGrade {
  if (percentile < 15) return "매우 낮음";
  if (percentile < 35) return "낮음";
  if (percentile < 65) return "보통";
  if (percentile < 85) return "높음";
  return "매우 높음";
}

/** 값 배열 안에서 value 의 백분위(0~100) */
function percentileOf(value: number, all: number[]): number {
  if (all.length <= 1) return 50;
  const lower = all.filter((v) => v < value).length;
  const equal = all.filter((v) => v === value).length;
  // 동률은 중앙값 처리
  return round(((lower + (equal - 1) / 2) / (all.length - 1)) * 100, 1);
}

// ---------------------------------------------------------------------------
// 툴팁 텍스트 → 효과 태그 (한국어 툴팁 기준)
// ---------------------------------------------------------------------------
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

function detectDamageTypes(text: string): DamageType[] {
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

function detectRatios(text: string): Record<string, number> {
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

function ratiosFromSimulation(ability: ChampionAbility): Record<string, number> {
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

function buildScalingProfile(spells: SpellFact[]): ScalingProfile {
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

function detectEffects(text: string): string[] {
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

const SLOTS: ChampionSpellSlot[] = ["P", "Q", "W", "E", "R"];

export interface ChampionCardBuilder {
  build(championId: string): ChampionCard | undefined;
  buildAll(): ChampionCard[];
  find(query: string): ChampionRecord | undefined;
}

export function createChampionCardBuilder(champions: ChampionRecord[]): ChampionCardBuilder {
  // 스탯별 전체 분포를 미리 계산 (백분위용)
  const distributions = new Map<string, number[]>();
  for (const stat of STAT_NAMES) {
    for (const level of [1, 18]) {
      distributions.set(
        `${stat}:${level}`,
        champions.map((c) => valueOf(c, stat, level)),
      );
    }
  }

  const buildStats = (champ: ChampionRecord): Record<StatName, StatSnapshot> => {
    const out = {} as Record<StatName, StatSnapshot>;
    for (const stat of STAT_NAMES) {
      const lv1 = valueOf(champ, stat, 1);
      const lv18 = valueOf(champ, stat, 18);
      const p1 = percentileOf(lv1, distributions.get(`${stat}:1`) ?? []);
      const p18 = percentileOf(lv18, distributions.get(`${stat}:18`) ?? []);
      out[stat] = {
        lv1: round(lv1),
        lv6: round(valueOf(champ, stat, 6)),
        lv11: round(valueOf(champ, stat, 11)),
        lv18: round(lv18),
        percentileLv1: p1,
        percentileLv18: p18,
        gradeLv1: toGrade(p1),
        gradeLv18: toGrade(p18),
      };
    }
    return out;
  };

  const build = (championId: string): ChampionCard | undefined => {
    const champ = champions.find((c) => c.id === championId);
    if (!champ) return undefined;

    const spells: SpellFact[] = SLOTS.filter((slot) => champ.abilities?.[slot]).map((slot) => {
      const ability = champ.abilities[slot] as ChampionAbility;
      const text = stripHtml(ability.bodyHtml);
      const summary = ability.summary ? stripHtml(ability.summary) : undefined;
      return {
        slot,
        name: ability.name,
        summary,
        text,
        cooldown: formatLevels(ability.cooldownSeconds),
        cooldownRank1: ability.cooldownSeconds?.[0],
        cost: formatLevels(ability.cost?.values),
        damageTypes: detectDamageTypes(text),
        effects: detectEffects(text),
        // 계수는 시뮬레이션 항(구조화된 값)을 우선하고, 없으면 툴팁 표기에서 뽑는다
        ratios: { ...detectRatios(text), ...ratiosFromSimulation(ability) },
      };
    });

    let physical = 0;
    let magical = 0;
    let trueDamage = 0;
    for (const s of spells) {
      if (s.damageTypes.includes("물리")) physical += 1;
      if (s.damageTypes.includes("마법")) magical += 1;
      if (s.damageTypes.includes("고정")) trueDamage += 1;
    }
    const roleTags = champ.tags ?? [];
    // 기본 공격 의존 역할은 물리 가중
    if (roleTags.includes("Marksman")) physical += 2;
    if (roleTags.includes("Mage")) magical += 1;
    let primary: ChampionCard["damageProfile"]["primary"] = "혼합";
    if (physical >= magical * 2) primary = "물리";
    else if (magical >= physical * 2) primary = "마법";

    const mechanics = Array.from(new Set(spells.flatMap((s) => s.effects)));

    return {
      id: champ.id,
      name: champ.name,
      title: champ.title,
      roleTags,
      // 자원 이름은 스킬 비용 표기에서 얻는다 (예: 마나, 기력, 열기)
      resource: SLOTS.map((slot) => champ.abilities?.[slot]?.cost?.resource).find(Boolean),
      rangeType: champ.baseStats.attackRange.base >= 300 ? "원거리" : "근접",
      attackRange: champ.baseStats.attackRange.base,
      stats: buildStats(champ),
      damageProfile: { physical, magical, trueDamage, primary },
      scalingProfile: buildScalingProfile(spells),
      mechanics,
      spells,
    };
  };

  const find = (query: string): ChampionRecord | undefined => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    return (
      champions.find((c) => c.id.toLowerCase() === q) ??
      champions.find((c) => c.name.replace(/\s+/g, "").toLowerCase() === q) ??
      champions.find((c) => c.name.replace(/\s+/g, "").toLowerCase().includes(q)) ??
      champions.find((c) => c.id.toLowerCase().includes(q))
    );
  };

  return {
    build,
    buildAll: () => champions.map((c) => build(c.id)).filter((c): c is ChampionCard => !!c),
    find,
  };
}

// ---------------------------------------------------------------------------
// 카드 → 프롬프트용 평문
// ---------------------------------------------------------------------------
const STAT_LABEL: Record<StatName, string> = {
  health: "체력",
  armor: "방어력",
  magicResist: "마법 저항력",
  attackDamage: "공격력",
  attackSpeed: "공격 속도",
  moveSpeed: "이동 속도",
  healthRegen: "체력 재생",
};

export interface CardTextOptions {
  /** 스킬 툴팁 전문 포함 여부 (false 면 요약 + 태그만) */
  includeSpellText?: boolean;
  /** 툴팁 전문 최대 길이 */
  spellTextMax?: number;
  /**
   * 스킬 서술 수준
   * - full: 요약 + 상세(툴팁 전문)
   * - summary: 요약만
   * - meta: 슬롯·이름·쿨타임·피해 유형·계수·효과 태그만 (한 줄)
   */
  spellDetail?: "full" | "summary" | "meta";
}

export function championCardToText(card: ChampionCard, opts: CardTextOptions = {}): string {
  const {
    includeSpellText = true,
    spellTextMax = 420,
    spellDetail = includeSpellText ? "full" : "summary",
  } = opts;
  const lines: string[] = [];
  lines.push(
    `${card.name}${card.title ? ` (${card.title})` : ""} — 역할: ${card.roleTags.join("/") || "미상"}, ${card.rangeType}(사거리 ${card.attackRange}), 자원: ${card.resource ?? "없음"}`,
  );
  lines.push(
    `주 피해 유형: ${card.damageProfile.primary} (물리 스킬 ${card.damageProfile.physical}, 마법 스킬 ${card.damageProfile.magical}, 고정 ${card.damageProfile.trueDamage})`,
  );
  const sp = card.scalingProfile;
  lines.push(
    `계수 프로필: ${sp.primary} (주문력 계수 스킬 ${sp.apSpells}, 공격력 계수 스킬 ${sp.adSpells}, 체력 계수 스킬 ${sp.healthSpells})`,
  );
  const statOrder: StatName[] = ["health", "armor", "magicResist", "attackDamage", "moveSpeed"];
  for (const stat of statOrder) {
    const s = card.stats[stat];
    const rank =
      s.percentileLv1 < 50
        ? `하위 ${Math.max(1, round(s.percentileLv1, 0))}%`
        : `상위 ${Math.max(1, round(100 - s.percentileLv1, 0))}%`;
    lines.push(
      `- ${STAT_LABEL[stat]}: 1레벨 ${s.lv1} [${s.gradeLv1}, 전체 챔피언 중 ${rank}] → 18레벨 ${s.lv18} [${s.gradeLv18}]`,
    );
  }
  if (card.mechanics.length) lines.push(`보유 효과: ${card.mechanics.join(", ")}`);
  lines.push("스킬:");
  for (const sp of card.spells) {
    const meta: string[] = [];
    if (sp.cooldown) meta.push(`쿨 ${sp.cooldown}초`);
    if (sp.cost && sp.cost !== "0") meta.push(`비용 ${sp.cost}`);
    if (sp.damageTypes.length) meta.push(`${sp.damageTypes.join("+")} 피해`);
    const ratioText = Object.entries(sp.ratios)
      .map(([stat, v]) => `${stat} ${v}%`)
      .join(", ");
    if (ratioText) meta.push(`계수: ${ratioText}`);
    if (sp.effects.length) meta.push(`효과: ${sp.effects.join(", ")}`);
    lines.push(`- ${sp.slot} ${sp.name}${meta.length ? ` (${meta.join("; ")})` : ""}`);
    if (spellDetail === "meta") continue;
    const summaryIsBody = !!sp.summary && sp.summary === sp.text;
    if (sp.summary && !summaryIsBody) lines.push(`  요약: ${sp.summary}`);
    if ((spellDetail === "full" || summaryIsBody) && sp.text) {
      const body = sp.text.length > spellTextMax ? `${sp.text.slice(0, spellTextMax)}…` : sp.text;
      lines.push(`  상세: ${body}`);
    }
  }
  // 공식 allytips/enemytips 는 정적 데이터에서 제거되었으므로 지식 계층(knowledge/)이 대신한다
  return lines.join("\n");
}
