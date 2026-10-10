import { ChampionSpell } from "@/domain/game/types";
import { Value } from "../calculations/contracts";
import { CommunityDragonSpellData, ParseResult } from "../contracts";
import { applyFormulaToValue } from "../data/dataValueUtils";
import { valueToTooltipString } from "../formatting/valueFormatter";

/**
 * 스킬 단축키를 가리키는 토큰.
 *
 * 게임 안에서는 실제 키 설정을 읽어 표시하지만 정적 데이터에는 없다.
 * 기본 스킬 스크립트 이름은 슬롯 문자로 끝나므로(EkkoW) 거기서 가져온다.
 */
export function replaceHotKey(parseResult: ParseResult): string | null {
  if (parseResult.variable.toLowerCase() !== "hotkey") return null;
  const match = /[qwer]$/i.exec(parseResult.spellRef ?? "");
  return match ? match[0].toUpperCase() : null;
}

/**
 * DDragon 스킬 객체에 그대로 들어 있는 값을 가리키는 토큰
 * - cost      → costBurn ("40", "40/35/30/25/20")
 * - maxammo   → maxammo ("2"). -1 은 충전형이 아니라는 뜻이라 제외
 *
 * 계산식이나 DataValues 에는 없고 DDragon 원본에만 있는 값들이다.
 */
export function replaceSpellField(
  parseResult: ParseResult,
  spell: ChampionSpell
): string | null {
  const name = parseResult.variable.toLowerCase();

  const raw =
    name === "cost"
      ? spell.costBurn
      : name === "maxammo"
        ? spell.maxammo
        : null;

  if (!raw) return null;
  if (name === "maxammo" && raw.trim() === "-1") return null;

  const nums = raw
    .split("/")
    .map((s) => Number.parseFloat(s))
    .filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return null;

  const value: Value = nums.length === 1 ? nums[0] : nums;
  return valueToTooltipString(applyFormulaToValue(value, parseResult));
}

/**
 * `spell.<이름>:` 접두사가 가리키는 스킬 데이터 찾기
 * - 접두사가 없으면 undefined (호출부에서 현재 스킬 데이터를 쓴다)
 * - 자기 자신을 가리키면 현재 데이터
 * - 그 외에는 siblings 맵에서 찾는다
 */
export function resolveSpellRefData(
  spellRef: string | undefined,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData
): CommunityDragonSpellData | undefined {
  if (!spellRef) return undefined;
  if (spell.id && spell.id.toLowerCase() === spellRef) {
    return communityDragonData;
  }
  const siblings = communityDragonData?.siblings;
  if (!siblings) return undefined;
  if (siblings[spellRef]) return siblings[spellRef];
  // 형제 맵의 키는 BIN 에 적힌 대소문자를 그대로 쓴다 (ApheliosCalibrumQ).
  // 참조 토큰은 소문자로 정규화되어 오므로 대소문자를 무시하고 다시 찾는다.
  const key = Object.keys(siblings).find(
    (candidate) => candidate.toLowerCase() === spellRef
  );
  return key ? siblings[key] : undefined;
}

export function replaceSpellMetadata(
  parseResult: ParseResult,
  spell: ChampionSpell
): string | null {
  const field = parseResult.variable.toLowerCase();
  const rawValues = field === "cooldown"
    ? spell.cooldown
    : field === "cost"
      ? spell.cost
      : undefined;
  if (!rawValues) return null;

  const values = rawValues.map(Number).filter(Number.isFinite);
  if (values.length === 0) return null;

  const value: Value = values.length === 1 ? values[0] : values;
  return valueToTooltipString(applyFormulaToValue(value, parseResult));
}

/**
 * effectBurn 배열(e1, e2, e3, ...)을 이용한 변수 치환
 * - e1 → effectBurn[1], e4 → effectBurn[4] 등
 * - effectBurn 은 Community Dragon 데이터가 우선이고, 없으면 Data Dragon(spell.effectBurn) 사용
 * - "25/30/35/40/45" 같이 "/" 로 구분된 값은 레벨별 값으로 처리
 */
export function replaceEffectBurn(
  parseResult: ParseResult,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData
): string | null {
  const varName = parseResult.variable;
  // 같은 스킬을 가리킬 때는 e4 로 줄여 쓰지만, 다른 스킬을 가리키는
  // `{{ spell.KhazixQ:Effect4Amount }}` 는 원래 이름을 그대로 쓴다.
  const match = /^(?:e|effect)(\d+)(?:amount)?$/i.exec(varName);
  if (!match) return null;

  const index = Number.parseInt(match[1], 10);
  if (!Number.isFinite(index) || index <= 0) return null;

  const effectBurnSource =
    communityDragonData?.effectBurn ?? spell.effectBurn;
  if (!effectBurnSource) return null;

  const raw = effectBurnSource[index];
  if (!raw) return null;

  // "80/100/120" → [80, 100, 120]
  // "0.5" → 0.5
  let value: Value;
  if (raw.includes("/")) {
    const nums = raw
      .split("/")
      .map((s) => Number.parseFloat(s))
      .filter((v) => !Number.isNaN(v));

    if (nums.length === 0) return null;
    // CDragon 값은 사용하지 않는 상위 랭크까지 들고 있다. 스킬 랭크 수로 자른다.
    const ranked =
      nums.length > spell.maxrank ? nums.slice(0, spell.maxrank) : nums;
    value = ranked.length === 1 ? ranked[0] : ranked;
  } else {
    const num = Number.parseFloat(raw);
    if (Number.isNaN(num)) return null;
    value = num;
  }

  const withFormula = applyFormulaToValue(value, parseResult);
  return valueToTooltipString(withFormula);
}
