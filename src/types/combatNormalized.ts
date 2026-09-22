import type {
  FormulaPart,
  StatContribution,
} from "./combatStats";
import type { StaticDataMetadata } from "@/data/contracts/staticData";

export type NormalizedEntityType =
  | "champion"
  | "item"
  | "rune"
  | "statShard";

export interface NormalizedEntityBase {
  id: string;
  type: NormalizedEntityType;
  /**
   * 이 엔티티의 표시용 이름
   * - 파일 단위로 lang 이 구분되므로, 현재 파일의 언어에 해당하는 문자열만 담는다.
   */
  name: string;
  iconPath?: string;
}

export interface LevelScaledScalar {
  base: number;
  perLevel: number;
  valuesByLevel?: number[];
}

export interface ChampionBaseStats {
  health: LevelScaledScalar;
  healthRegen: LevelScaledScalar;
  mana?: LevelScaledScalar;
  manaRegen?: LevelScaledScalar;
  energy?: LevelScaledScalar;
  energyRegen?: LevelScaledScalar;
  attackDamage: LevelScaledScalar;
  attackSpeed: LevelScaledScalar;
  armor: LevelScaledScalar;
  magicResist: LevelScaledScalar;
  moveSpeed: LevelScaledScalar;
  attackRange: LevelScaledScalar;
}

export type ChampionSpellSlot = "P" | "Q" | "W" | "E" | "R";

export interface NormalizedSpellScaling {
  id: string;
  labelEn: string;
  labelKo: string;
  parts: FormulaPart[];
  damageType?: "physical" | "magical" | "true" | "mixed" | "none";
}

export interface NormalizedSpell {
  slot: ChampionSpellSlot;
  key: string;
  /**
   * 스킬 이름 (현재 lang 기준)
   */
  name: string;
  /**
   * 로컬라이즈된 툴팁/설명 (HTML 포함 가능)
   */
  tooltip: string;
  cooldowns?: number[];
  costs?: number[];
  scalings: NormalizedSpellScaling[];
}

export interface NormalizedChampion extends NormalizedEntityBase {
  type: "champion";
  baseStats: ChampionBaseStats;
  baseStatContributions: StatContribution[];
  spells: Record<ChampionSpellSlot, NormalizedSpell>;
}

export type ItemEffectKind =
  | "passive"
  | "mythicPassive"
  | "active"
  | "aura";

export interface NormalizedItemEffect {
  id: string;
  kind: ItemEffectKind;
  /**
   * 효과 이름 (현재 lang 기준)
   */
  name: string;
  /**
   * 효과 설명 (현재 lang 기준, HTML 포함 가능)
   */
  description: string;
  stats?: StatContribution[];
  formulas?: Record<string, FormulaPart[]>;
  conditions?: string[];
  unresolved?: boolean;
  cooldownSeconds?: number;
  damage?: NormalizedDamageEffect;
  healthDamage?: {
    damageType: "physical" | "magical" | "true";
    health: "current";
    melee: number;
    ranged: number;
  };
}

export interface NormalizedItem extends NormalizedEntityBase {
  type: "item";
  name: string;
  description?: string;
  statDescriptions?: string[];
  price: number;
  priceTotal: number;
  tags: string[];
  /**
   * 상점에서 통하는 별칭. Data Dragon 의 `colloq` 를 갈라 담는다.
   *
   * 리엇이 로케일마다 직접 채워 둔 값이라 번역이 필요 없다. 성격은 언어마다 다르다 —
   * 한국어는 별명("똥신", "요부", "자벨"), 영어는 약어("bf", "dshield"), 중국어는
   * 병음과 그 이니셜("sdzx", "xnfh") 이다. 중국어 이니셜은 한국어 초성 검색과 같은
   * 장치라 같은 규칙으로 걸린다.
   *
   * 868개 중 한국어 151개, 중국어 148개, 영어 67개에 값이 있다.
   */
  aliases?: string[];
  buildsFrom: string[];
  buildsInto: string[];
  requiredChampion?: string;
  requiredAlly?: string;
  stats: StatContribution[];
  effects: NormalizedItemEffect[];
  damageEffects?: NormalizedDamageEffect[];
  /**
   * 선택적 상점/맵 메타데이터
   * - 기존 Data Dragon/CDragon 필드를 정규화하여 담은 확장 포인트
   * - 존재하지 않을 수도 있으므로 모두 optional
   */
  purchasable?: boolean;
  inStore?: boolean;
  displayInItemSets?: boolean;
  /**
   * 소환사의 협곡(맵 ID 11)에서 사용 가능한 아이템인지 여부
   * - 이전 item.maps["11"] 정보를 단일 boolean 으로 정규화
   */
  availableOnMap11?: boolean;
}

export interface NormalizedRune extends NormalizedEntityBase {
  type: "rune";
  pathId: number;
  slotIndex: number;
  stats: StatContribution[];
  effects?: NormalizedItemEffect[];
  damageEffects: NormalizedDamageEffect[];
  /**
   * 로컬라이즈된 툴팁/설명 (HTML 포함 가능, 현재 lang 기준)
   */
  tooltip?: string;
}

export interface NormalizedStatShard extends NormalizedEntityBase {
  type: "statShard";
  rowIndex: number;
  columnIndex: number;
  stats: StatContribution[];
}

export interface NormalizedItemDataFile extends StaticDataMetadata {
  items: NormalizedItem[];
}

export interface NormalizedRuneDataFile extends StaticDataMetadata {
  runes: NormalizedRune[];
  statShards: NormalizedStatShard[];
}

export interface NormalizedSummonerSpell {
  id: string;
  /**
   * 내부 키 (DDragon의 spell key 또는 식별자)
   */
  key: string;
  /**
   * 소환사 주문 이름 (현재 lang 기준)
   */
  name: string;
  /**
   * 로컬라이즈된 툴팁/설명 (HTML 포함 가능, 현재 lang 기준)
   */
  tooltip: string;
  cooldown: number[];
  /**
   * DDragon 이미지 파일명 (예: SummonerFlash.png)
   */
  iconPath: string;
  /**
   * 사용 가능한 게임 모드 (예: CLASSIC 등)
   */
  modes: string[];
  damageEffects: NormalizedDamageEffect[];
}

export interface NormalizedDamageEffect {
  id: string;
  damageType: "physical" | "magical" | "true";
  target: "champion" | "nonChampion";
  valuesByLevel: number[];
  scalings?: NormalizedDamageScaling[];
  durationSeconds?: number;
  conditions?: string[];
}

export interface NormalizedDamageScaling {
  stat: "baseAttackDamage" | "attackDamage" | "abilityPower" | "targetMaxHealth";
  coefficient: number;
}

export interface NormalizedSummonerDataFile extends StaticDataMetadata {
  spells: NormalizedSummonerSpell[];
}
