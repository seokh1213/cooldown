import { fetchJson } from "../io/json";
import type { Champion } from "../../../../src/domain/game/types";

type CDragonRecord = Record<string, unknown>;

function modifiableValue(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const baseValue = (value as CDragonRecord).baseValue;
  return typeof baseValue === "number" && Number.isFinite(baseValue)
    ? baseValue
    : undefined;
}

export function mergeCDragonChampionStats(
  champion: Champion,
  source: Record<string, unknown>,
): Champion {
  const root = Object.entries(source).find(([key, value]) =>
    key.endsWith("/CharacterRecords/Root") && typeof value === "object" && value !== null
  )?.[1] as CDragonRecord | undefined;
  const attackDamagePerLevel = modifiableValue(root?.damagePerLevelModifiable);
  if (attackDamagePerLevel === undefined) return champion;
  return {
    ...champion,
    stats: {
      ...champion.stats,
      attackdamageperlevel: attackDamagePerLevel,
    },
  };
}

export async function fetchCDragonChampion(
  championId: string,
  cdragonVersion: string,
): Promise<Record<string, unknown>> {
  const sourceId = championId.toLowerCase();
  const url =
    `https://raw.communitydragon.org/${cdragonVersion}/game/data/characters/` +
    `${sourceId}/${sourceId}.bin.json`;
  // 재시도가 있는 공용 헬퍼를 쓴다. raw fetch 로 두면 ECONNRESET 한 번에
  // 전체 생성이 죽는다 (CI 실패 사례 2026-09-04).
  try {
    return await fetchJson<Record<string, unknown>>(url);
  } catch (error) {
    throw new Error(
      `[CD] ${championId} missing from ${cdragonVersion}: ${(error as Error).message}`,
    );
  }
}

/** 스킬 사거리. 랭크마다 같으면 한 숫자로 접는다. */
export type AbilityCastRange = number | number[];

const ACTIVE_SLOTS = ["Q", "W", "E", "R"] as const;
type ActiveSlot = (typeof ACTIVE_SLOTS)[number];

/**
 * 사거리로 보이지 않는 값.
 *
 * BIN 은 "사거리 제한 없음" 을 큰 수로 적는다. 아리 Q·럭스 R 은 castRange 25000 이고 실제 거리는
 * castRangeDisplayOverride(970·3340)에 있다. 표시값이 없는데 10000 이상이면 투사체 사거리가 따로
 * 있거나(트위스티드 페이트 Q castRange 10000, 실제 1450) 전역(카서스 R 10000·애쉬 R 25000)이라
 * 숫자로 내면 틀린 답이 된다. 실제 사거리 중 가장 긴 것은 판테온·트위스티드 페이트 R 5500 이다.
 * 50 미만은 자기 자신에게 쓰는 스킬이다(가렌 W 0, 니달리 R·녹턴 W 20).
 */
function isCastRange(value: number): boolean {
  return Number.isFinite(value) && value >= 50 && value < 10000;
}

function rankValues(value: unknown, maxRank: number): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const numbers = value.map(Number);
  // BIN 배열은 0번이 랭크 0 자리다(녹턴 R [2500, 2500, 3250, 4000, …] → 2500/3250/4000)
  const ranks = numbers.length > maxRank ? numbers.slice(1, maxRank + 1) : numbers;
  return ranks.length > 0 ? ranks : undefined;
}

/**
 * 스킬 하나의 사거리. 게임 툴팁이 보이는 castRangeDisplayOverride 를 먼저, 없으면 castRange.
 *   제드 W  castRange 700, 표시값 650 → 650
 *   제드 R  castRange 625            → 625
 *   잔나 W  표시값 -1(표시 안 함)     → castRange 550
 * castRange 가 아예 없는 스킬은 비운다. DDragon 은 이 자리에 기본값 400 을 채워 트린다미어 R·애쉬 Q 같은
 * 자기 강화 스킬도 사거리 400 이 되었다(16.19 에서 29스킬).
 */
export function spellCastRange(spell: unknown, maxRank: number): AbilityCastRange | undefined {
  if (typeof spell !== "object" || spell === null) return undefined;
  const record = spell as CDragonRecord;
  const display = rankValues(record.castRangeDisplayOverride, maxRank);
  const ranks = display && display.some((value) => value > 0) ? display : rankValues(record.castRange, maxRank);
  if (!ranks || !ranks.every(isCastRange)) return undefined;
  const rounded = ranks.map((value) => Math.round(value));
  return rounded.every((value) => value === rounded[0]) ? rounded[0] : rounded;
}

/**
 * 챔피언 BIN 에서 Q·W·E·R 의 사거리.
 *
 * 기본 스킬 넷은 루트(`Characters/<Name>/CharacterRecords/Root`)의 `spells` 가 슬롯 순서로 가리킨다
 * (`Characters/Zed/Spells/ZedRAbility/ZedR`). 같은 폴더에 투사체·보조 스킬(ZedQMissile 등)이 섞여 있어
 * 이름으로 고르면 안 된다. `spells` 가 없으면 `spellNames`(`ZedRAbility/ZedR`)를 경로 끝으로 맞춘다.
 */
export function extractAbilityCastRanges(
  source: Record<string, unknown>,
  maxRanks: Partial<Record<ActiveSlot, number>> = {},
): Partial<Record<ActiveSlot, AbilityCastRange>> {
  const root = Object.entries(source).find(([key, value]) =>
    key.endsWith("/CharacterRecords/Root") && typeof value === "object" && value !== null
  )?.[1] as CDragonRecord | undefined;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  const paths = strings(root?.spells);
  const names = strings(root?.spellNames);
  const out: Partial<Record<ActiveSlot, AbilityCastRange>> = {};
  ACTIVE_SLOTS.forEach((slot, index) => {
    const name = names[index];
    const path = paths[index] ?? (name ? Object.keys(source).find((key) => key.endsWith(`/${name}`)) : undefined);
    const object = path ? source[path] : undefined;
    const spell = typeof object === "object" && object !== null ? (object as CDragonRecord).mSpell : undefined;
    const range = spellCastRange(spell, maxRanks[slot] ?? (slot === "R" ? 3 : 5));
    if (range !== undefined) out[slot] = range;
  });
  return out;
}
