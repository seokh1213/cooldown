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
} from "../../types/combatNormalized";
import type {
  ChampionAbility,
  ChampionRecord,
  RiotChampionMeta,
  WikiChampionMeta,
} from "./sourceRecords";
import { formatLevels, round, stripHtml } from "./text";
import { detectDamageTypes, detectEffects } from "./facts-analysis";
import { abilityCausesDash, championMovesItself } from "./facts-movement";
import { buildScalingProfile, detectRatios, ratiosFromSimulation } from "./facts-ratios";
import type { SpellCrowdControl } from "./crowdControl";
import type { SpellTicks } from "./abilityTicks";

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
  /** 원본의 레벨당 성장치. 공격 속도는 %, 실제 증가량에는 레벨 성장 곡선이 적용된다. */
  perLevel?: number;
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
  forms?: SpellFormFact[];
  slot: ChampionSpellSlot;
  name: string;
  /** 한 줄 요약 (있을 때) */
  summary?: string;
  /** 툴팁 평문 (HTML 제거) */
  text: string;
  cooldown?: string;
  /** 1레벨(첫 랭크) 쿨타임 초 — 교전 창 계산용 */
  cooldownRank1?: number;
  /** 충전형 스킬의 재충전 시간. 이때 cooldown 은 연속 시전 간격(보통 0.5초)이다. */
  recharge?: string;
  maxCharges?: number;
  cost?: string;
  /**
   * 시전 사거리. 랭크마다 다르면 배열(녹턴 R 2500/3250/4000). 자기 시전·전역 스킬은 없다.
   * CDragon BIN 에서 받은 값이다(`npm run llm:fetch-ranges`). 챔피언 자료의 DDragon range 는
   * castRange 가 없는 스킬에 기본값 400 을 채우고 제한 없음을 25000 으로 적어 쓰지 않는다.
   */
  range?: number | number[];
  damageTypes: DamageType[];
  effects: string[];
  crowdControl?: SpellCrowdControl;
  ticks?: SpellTicks;
  /** 툴팁에서 뽑은 계수 (스탯 → 최대 % 값). 예: { "주문력": 105, "추가 공격력": 50 } */
  ratios: Record<string, number>;
}

export interface SpellFormFact extends Omit<SpellFact, "forms"> {
  key: "A" | "B";
  label: string;
  id: string;
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
  /** 라이엇 공식 분류 (수집돼 있으면) */
  riot?: {
    /** 주 특성 (내구성, 결투가, 전투 개시 …) */
    tagPrimary?: string;
    tagSecondary?: string;
    /** 물리 | 마법 | 혼합 */
    damageType?: "물리" | "마법" | "혼합";
    attackType?: "근접" | "원거리";
    playstyle?: RiotChampionMeta["playstyle"];
  };
  /** LoL Wiki 분류 (하위 클래스와 포지션) */
  wiki?: {
    heroType?: string;
    altType?: string;
    /** Juggernaut, Diver, Skirmisher, Vanguard, Warden, Battlemage, Burst, Artillery, Assassin, Enchanter, Catcher, Marksman, Specialist */
    subclass?: string;
    subclasses: string[];
    positions: string[];
  };
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
const SLOTS: ChampionSpellSlot[] = ["P", "Q", "W", "E", "R"];

export interface ChampionCardBuilder {
  build(championId: string): ChampionCard | undefined;
  buildAll(): ChampionCard[];
  find(query: string): ChampionRecord | undefined;
}

const RIOT_DAMAGE_LABEL: Record<string, "물리" | "마법" | "혼합"> = {
  kPhysical: "물리",
  kMagic: "마법",
  kMixed: "혼합",
};

/**
 * 대시 태그를 정한다.
 *
 * `이동기` 는 시전자가 스스로 움직이는가 — 이탈·진입을 판단할 때 쓴다.
 * `돌진` 은 돌진 판정이 생기는가 — 뽀삐 W 굳건한 태세로 막히는지를 판단할 때 쓴다.
 * 쓰레쉬 W 는 아군이 움직이므로 `돌진` 만 붙는다.
 */
function dashTags(
  wiki: { dash: boolean; self: boolean } | undefined,
  text: string,
  championName: string,
): string[] {
  if (wiki) {
    return wiki.self ? ["이동기", "돌진"] : ["돌진"];
  }
  return [
    ...(championMovesItself(text, championName) ? ["이동기"] : []),
    ...(abilityCausesDash(text) ? ["돌진"] : []),
  ];
}

/** knowledge/spell-effects.json 의 보정 한 건. 보정을 두는 이유는 scripts/llm/lib/spellOverrides.ts 머리말에 있다. */
export interface SpellOverride {
  /** 더할 효과 태그 */
  add?: string[];
  /** 잘못 붙은 것을 뺀다. 규칙을 못 고칠 때의 마지막 수단이다. */
  remove?: string[];
  /** 피해 유형. 툴팁이 유형을 안 밝힌 스킬에만 쓴다. */
  damageTypes?: DamageType[];
  /**
   * 사람이 보고 **정말 비어 있다**고 확인한 자리.
   *
   * 신드라 Q 처럼 단일 대상 피해만 주는 스킬은 태그가 없는 것이 맞다. 그것을
   * 적어 두지 않으면 다음 점검 때 같은 자리를 또 묻게 된다. 이 표시가 있으면
   * 구멍 목록에서 빠진다.
   */
  confirmedEmpty?: boolean;
  /**
   * 피해를 입히지 않는다고 확인한 자리.
   *
   * 클레드 P 의 "기본 공격은 감소한 피해를 입힙니다" 는 평타 이야기이고, 라이즈 R 의
   * "과부하 사용 시 추가 피해" 는 Q 의 피해다. 스스로 내는 피해가 아니므로 유형이
   * 비어 있는 것이 맞다.
   */
  confirmedNoDamage?: boolean;
  /** 툴팁으로는 왜 안 나오는가 */
  why: string;
  /** 무엇을 보고 적었는가 */
  source: string;
  /**
   * 적을 때 본 툴팁의 지문.
   *
   * 보정은 **그때 그 문구**를 보고 적은 것이다. 챔피언이 리워크되면 문구가 통째로
   * 바뀌는데, 보정은 그대로 남아 조용히 틀린 값을 얹는다. 규칙으로 뽑는 태그는
   * 새 문구에서 다시 도출되므로 저절로 따라가지만 이쪽은 그러지 못한다.
   *
   * **수치를 지우고** 찍는다. 그러지 않으면 밸런스 판올림마다 전부 어긋난 것으로
   * 나와 아무도 안 보게 된다. 계수와 등급별 수치가 바뀌는 것은 다시 볼 일이 아니고,
   * 문구가 바뀌는 것만 다시 볼 일이다.
   */
  textDigest?: string;
}

/** 키는 `<ChampionId>:<슬롯>` 이다. 예: `Annie:W` */
export type SpellOverrides = Record<string, SpellOverride>;

/**
 * 도출된 태그에 보정을 얹는다. 중복은 합치고 순서는 도출분을 앞에 둔다.
 *
 * 보정은 **도출 뒤에** 얹는다. 규칙이 나중에 그 값을 잡게 되면 보정은 아무 일도
 * 하지 않으므로, 규칙을 고칠 때 보정을 같이 지울 필요가 없다.
 */
function applyEffectOverride(derived: string[], override: SpellOverride | undefined): string[] {
  if (!override) return derived;
  const removed = new Set(override.remove ?? []);
  const kept = derived.filter((tag) => !removed.has(tag));
  const added = (override.add ?? []).filter((tag) => !kept.includes(tag) && !removed.has(tag));
  return [...kept, ...added];
}

/** 유형을 못 밝힌 스킬에만 보정을 쓴다. 툴팁이 말한 것을 덮지 않는다. */
function applyDamageTypeOverride(
  derived: DamageType[],
  override: SpellOverride | undefined,
): DamageType[] {
  if (!override?.damageTypes || derived.length > 0) return derived;
  return override.damageTypes;
}

function buildSpellForms(ability: ChampionAbility): SpellFormFact[] | undefined {
  if (!ability.forms?.length) return undefined;
  return ability.forms.map(form => {
    const text = stripHtml(form.bodyHtml);
    // 탄환 재충전과 연속 시전 쿨은 원문에서 서로 다른 값이다.
    const recharge = text.match(/재장전 대기시간\s+([\d./]+)초/)
      ?? text.match(/([\d./]+)s\s+Ammo Recharge/i)
      ?? text.match(/([\d./]+)秒充能时间/);
    return {
      key: form.key, label: form.label, id: form.id, slot: ability.slot, name: form.name, text,
      cooldown: formatLevels(form.cooldownSeconds), cooldownRank1: form.cooldownSeconds[0],
      recharge: recharge?.[1], damageTypes: detectDamageTypes(text), effects: detectEffects(text),
      ratios: detectRatios(text),
    };
  });
}

export function createChampionCardBuilder(
  champions: ChampionRecord[],
  riotMeta: Map<string, RiotChampionMeta> = new Map(),
  wikiMeta: Map<string, WikiChampionMeta> = new Map(),
  /** 위키에서 받은 대시 판정. `"Yasuo:E"` → `{ dash, self }` */
  dashes: Record<string, { dash: boolean; self: boolean }> = {},
  /**
   * 툴팁이 말하지 않는 것을 사람이 채운 값. `"Annie:W"` → `{ add, why, source }`
   *
   * 파일을 읽어 오는 일은 **부르는 쪽**이 한다. 이 모듈은 브라우저에서도 쓰이므로
   * `fs` 를 알면 안 된다. 대시 판정을 넘겨받는 것과 같은 방식이다.
   */
  overrides: SpellOverrides = {},
  /** CDragon BIN 에서 받은 시전 사거리. `"Zed:R"` → 625. 파일 읽기는 대시 판정처럼 부르는 쪽이 한다. */
  ranges: Record<string, number | number[]> = {},
): ChampionCardBuilder {
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
        perLevel: champ.baseStats[stat].perLevel,
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
        forms: buildSpellForms(ability),
        name: ability.name,
        summary,
        text,
        cooldown: formatLevels(ability.cooldownSeconds),
        cooldownRank1: ability.cooldownSeconds?.[0],
        recharge: formatLevels(ability.rechargeSeconds),
        maxCharges: ability.maxCharges,
        cost: formatLevels(ability.cost?.values),
        range: ranges[`${champ.id}:${slot}`],
        damageTypes: applyDamageTypeOverride(detectDamageTypes(text), overrides[`${champ.id}:${slot}`]),
        // 이동기와 돌진은 규칙표로 잡지 않는다.
        //
        // **위키 판정을 먼저 쓴다.** LoL Wiki 는 대시를 `{{tip|dash}}` 로 표시하므로
        // 낱말을 추정할 필요가 없고, 누가 움직이는지도 영어 원문에서 가릴 수 있다.
        // 한국어 툴팁 정규식으로는 "아군이 쓰레쉬에게 돌진합니다"(쓰레쉬 W, 아군이 이동)와
        // "돌진하는 적을 막습니다"(뽀삐 W, 남의 돌진)를 끝내 못 갈랐다.
        //
        // 위키에 없는 챔피언(출시 직후)만 툴팁 추정으로 내려간다.
        effects: applyEffectOverride(
          [
            // 이 챔피언의 다른 스킬 이름은 지우고 본다. "공포 감지" 가 공포로 잡혔다.
            ...detectEffects(text, Object.values(champ.abilities).map((other) => other?.name ?? "")),
            ...dashTags(dashes[`${champ.id}:${ability.slot}`], text, champ.name),
          ],
          overrides[`${champ.id}:${slot}`],
        ),
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
    const meta = riotMeta.get(champ.id);
    const wiki = wikiMeta.get(champ.id);
    // 역할 태그는 라이엇 메타(순서 있는 roles)를 우선한다
    const roleTags = (meta?.roles?.length ? meta.roles : champ.tags ?? []).map(
      (r) => r.charAt(0).toUpperCase() + r.slice(1),
    );
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
      wiki: wiki
        ? {
            heroType: wiki.heroType,
            altType: wiki.altType,
            subclass: wiki.subclasses[0],
            subclasses: wiki.subclasses,
            positions: wiki.positions,
          }
        : undefined,
      riot: meta
        ? {
            tagPrimary: meta.tagPrimary,
            tagSecondary: meta.tagSecondary,
            damageType: meta.damageType ? RIOT_DAMAGE_LABEL[meta.damageType] : undefined,
            attackType: meta.attackType === "ranged" ? "원거리" : meta.attackType === "melee" ? "근접" : undefined,
            playstyle: meta.playstyle,
          }
        : undefined,
      // 사거리 판정은 라이엇 attackType 을 우선하고, 없으면 사거리 수치로 본다
      rangeType:
        meta?.attackType === "ranged"
          ? "원거리"
          : meta?.attackType === "melee"
            ? "근접"
            : champ.baseStats.attackRange.base >= 300
              ? "원거리"
              : "근접",
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
  const classLine = card.wiki
    ? `${card.wiki.heroType ?? "?"}${card.wiki.altType ? `/${card.wiki.altType}` : ""}${card.wiki.subclass ? ` · ${card.wiki.subclass}` : ""}`
    : card.roleTags.join("/") || "미상";
  lines.push(
    `${card.name}${card.title ? ` (${card.title})` : ""} — 클래스: ${classLine}, ${card.rangeType}(사거리 ${card.attackRange}), 자원: ${card.resource ?? "없음"}${card.wiki?.positions.length ? `, 주 포지션: ${card.wiki.positions.join("/")}` : ""}`,
  );
  if (card.riot?.tagPrimary) {
    lines.push(
      `라이엇 특성: ${card.riot.tagPrimary}${card.riot.tagSecondary ? `, ${card.riot.tagSecondary}` : ""}${card.riot.playstyle ? ` (피해 ${card.riot.playstyle.damage}, 내구도 ${card.riot.playstyle.durability}, 군중 제어 ${card.riot.playstyle.crowdControl}, 기동력 ${card.riot.playstyle.mobility}, 유틸 ${card.riot.playstyle.utility} — 각 0~3)` : ""}`,
    );
  }
  // 피해 유형은 라이엇 분류를 우선한다. 툴팁 집계는 참고 수치로만 남긴다.
  lines.push(
    card.riot?.damageType
      ? `주 피해 유형: ${card.riot.damageType} (라이엇 분류; 툴팁 집계는 물리 스킬 ${card.damageProfile.physical}, 마법 스킬 ${card.damageProfile.magical}, 고정 ${card.damageProfile.trueDamage})`
      : `주 피해 유형: ${card.damageProfile.primary} (물리 스킬 ${card.damageProfile.physical}, 마법 스킬 ${card.damageProfile.magical}, 고정 ${card.damageProfile.trueDamage})`,
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
    if (sp.recharge) meta.push(`재충전 ${sp.recharge}초${sp.maxCharges ? ` (${sp.maxCharges}회 충전)` : ""}`);
    else if (sp.cooldown) meta.push(`쿨 ${sp.cooldown}초`);
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
