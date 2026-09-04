import { ChampionSpell } from "@/types";
import {
  CommunityDragonSpellData,
  ParseResult,
  TooltipLocale,
  Value,
} from "./types";
import { parseExpression } from "./expressionParser";
import { replaceData } from "./dataValueHandler";
import { replaceCalculateData } from "./spellCalculationHandler";
import { applyFormulaToValue } from "./dataValueUtils";
import { valueToTooltipString } from "./valueUtils";
import {
  applyNumericPrecision,
  normalizeOperators,
  removeNestedVariableBlocks,
  stripUnsupportedSpellPlaceholders,
} from "./variableTextUtils";

/**
 * 값을 채울 수 없는 자리에 남기는 표시.
 *
 * fN 토큰처럼 인게임 실시간 상태라서 정적 데이터에 값이 없는 경우가 있다.
 * 빈 문자열로 지우면 "방어력()", "추가 공격력 /100" 처럼 문장이 깨지므로
 * 자리를 남겨 "인게임에서 확인" 이라는 뜻을 전달한다.
 */
const UNRESOLVED_MARK = "?";

interface VariableReplacementResult {
  text: string;
  unresolvedTokens: string[];
}

function replaceVariableTokens(
  text: string,
  spell: ChampionSpell,
  communityDragonData: CommunityDragonSpellData | undefined,
  lang: TooltipLocale
): VariableReplacementResult {
  const variableRegex = /\{\{([^}]+)}}/g;
  const unresolvedTokens = new Set<string>();

  const replaced = text.replace(variableRegex, (_match, variableName) => {
    const trimmedVar = String(variableName).trim();

    // 특수 변수 처리 (spellmodifierdescriptionappend, Spell_*_Tooltip 등)
    if (
      trimmedVar === "spellmodifierdescriptionappend" ||
      trimmedVar.includes("gamemodeinteger") ||
      (trimmedVar.includes("Spell_") && trimmedVar.includes("Tooltip"))
    ) {
      return "";
    }

    // rcooldownreduction.0*100 처럼 ".소수점자릿수"를 가진 변수 처리
    // - baseName: rcooldownreduction
    // - precision: 0
    // - tail: "*100"
    let effectiveVar = trimmedVar;
    let precision: number | undefined;

    const precisionMatch =
      /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\.(\d+))(.*)$/.exec(trimmedVar);
    if (precisionMatch) {
      const [, baseName, precisionStr, tail] = precisionMatch;
      const parsedPrecision = Number.parseInt(precisionStr, 10);
      if (Number.isFinite(parsedPrecision)) {
        precision = parsedPrecision;
        effectiveVar = `${baseName}${tail}`; // ".0" 를 제거한 표현식으로 치환
      }
    }

    const replacement = replaceVariable(
      effectiveVar,
      spell,
      communityDragonData,
      lang
    );

    if (replacement !== null) {
      return precision !== undefined
        ? applyNumericPrecision(replacement, precision)
        : replacement;
    }

    unresolvedTokens.add(trimmedVar);
    return UNRESOLVED_MARK;
  });

  return {
    text: replaced,
    unresolvedTokens: [...unresolvedTokens].sort(),
  };
}

/**
 * 변수 치환 이후 남은 플레이스홀더/공백 정리
 * - 남은 {{ }}, %, 아이콘 토큰 제거
 * - 연속 공백 정리 (개행은 유지)
 */
function cleanupPlaceholdersAndIcons(text: string): string {
  let result = text;

  // 치환 후 남은 불완전한 변수 패턴 제거 ({{ 또는 }}만 남은 경우)
  result = result.replace(/\{\{\s*\}/g, ""); // {{ }} 패턴 제거
  result = result.replace(/\}\}/g, ""); // 남은 }} 제거
  result = result.replace(/\{\{/g, ""); // 남은 {{ 제거

  // 아이콘/리소스 플레이스홀더 제거
  // 형식: %{리소스타입}:{이름}%
  // 예: %i:scaleAPen% → "" (토큰만 삭제, 나머지 문장은 유지)
  // - %% 안에 공백이 없고, ":" 콜론이 포함된 경우에만 매칭
  //
  // 토큰만 지우면 앞뒤 공백이 남아 "방어구 관통력 을" 처럼 조사가 떨어진다.
  // 원문이 "관통력 %i:scaleAPen%</armorPen>을" 이라 앞쪽 공백이 아이콘 몫이다.
  // 양쪽이 모두 공백이면 하나만 남기고, 한쪽뿐이면 공백까지 함께 지운다.
  result = result.replace(
    /(\s*)%[^\s:%]+:[^\s%]+%(\s*)/g,
    (_match, before: string, after: string) => (before && after ? " " : "")
  );

  // 아이콘만 들어 있던 괄호는 빈 껍데기로 남는다 ("공격 속도가 12% ()")
  result = result.replace(/\s*\(\s*\)/g, "");

  // 치환 후 남은 "%" 기호가 혼자 있는 경우 제거
  result = result.replace(/\s+%\s+/g, " "); // 공백으로 둘러싸인 % 제거
  // 숫자(또는 미해석 표시)와 붙어 있지 않은 % 만 제거한다
  result = result.replace(/(?<![\d?])\s*%\s*(?![\d?])/g, "");
  // 시작/끝 부분의 % 도, 숫자와 붙어있지 않은 경우에만 제거
  result = result.replace(/^\s*%\s*(?![\d?])/g, ""); // 시작 부분의 단독 % 제거
  result = result.replace(/(?<![\d?])\s*%\s*$/g, ""); // 끝 부분의 단독 % 제거

  // 연속된 공백 정리 (개행 문자는 유지 → <br /> 줄바꿈 보존)
  result = result.replace(/[^\S\r\n]+/g, " ");

  return result;
}

/**
 * 변수 치환 ({{ variable }} 형식)
 * 레벨별 값은 "/" 형식으로 표시
 * HTML 태그 내부의 변수도 치환하되, 태그 구조는 보존
 * @param text 원본 텍스트
 * @param spell 스킬 데이터
 * @param communityDragonData Community Dragon에서 가져온 스킬 데이터 (선택적)
 * @param lang
 * @returns 치환된 텍스트
 */
export function replaceVariables(
  text: string,
  spell?: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  lang: TooltipLocale = "ko_KR"
): string {
  return replaceVariablesWithDiagnostics(
    text,
    spell,
    communityDragonData,
    lang
  ).text;
}

export function replaceVariablesWithDiagnostics(
  text: string,
  spell?: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  lang: TooltipLocale = "ko_KR"
): VariableReplacementResult {
  if (!spell) return { text, unresolvedTokens: [] };

  let result = text;

  // 0. 연산자(+ / ~) 주변 공백 보정
  result = normalizeOperators(result);

  // 1. 중첩 변수 블록 제거
  result = removeNestedVariableBlocks(result);

  // 2. 치환 불가능한 특수 패턴 제거
  result = stripUnsupportedSpellPlaceholders(result);

  // 3. {{ variable }} 토큰 치환
  const replacement = replaceVariableTokens(
    result,
    spell,
    communityDragonData,
    lang
  );
  result = replacement.text;

  // 4. 잔여 플레이스홀더/아이콘/공백 정리
  result = cleanupPlaceholdersAndIcons(result);

  return { text: result, unresolvedTokens: replacement.unresolvedTokens };
}

/**
 * 단일 변수 치환
 * @param trimmedVar 변수명
 * @param spell 스킬 데이터
 * @param communityDragonData Community Dragon 데이터
 * @returns 치환된 문자열 또는 null
 */
export function replaceVariable(
  trimmedVar: string,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  lang: TooltipLocale = "ko_KR"
): string | null {
  const effectAlias = /^Effect(\d+)Amount(.*)$/i.exec(trimmedVar);
  const normalizedVariable = effectAlias
    ? `e${effectAlias[1]}${effectAlias[2]}`
    : /^AmmoRechargeTime(.*)$/i.test(trimmedVar)
      ? trimmedVar.replace(/^AmmoRechargeTime/i, "mAmmoRechargeTime")
      : trimmedVar;
  const parseResult = parseExpression(normalizedVariable);

  const bySpellMetadata = replaceSpellMetadata(parseResult, spell);
  if (bySpellMetadata !== null) return bySpellMetadata;

  // `spell.<이름>:<변수>` 는 값의 출처 스킬이 명시된 형태다.
  // 자기 자신을 가리키면 그대로, 다른 스킬이면 형제 스킬 데이터에서 찾는다.
  const targetData = resolveSpellRefData(parseResult.spellRef, spell, communityDragonData);
  if (parseResult.spellRef && !targetData) {
    return null;
  }
  const data = targetData ?? communityDragonData;

  // 0. 다른 스킬의 단축키를 가리키는 토큰 (에코 R 의 spell.EkkoW:HotKey)
  const byHotKey = replaceHotKey(parseResult);
  if (byHotKey !== null) return byHotKey;

  // 0. effectBurn 기반 eN 변수(e1, e2, e3, ...) 우선 처리
  const byEffectBurn = replaceEffectBurn(parseResult, spell, data);
  if (byEffectBurn !== null) return byEffectBurn;

  // 0.5 DDragon 스킬 자체 필드(cost, maxammo)를 가리키는 토큰
  const bySpellField = replaceSpellField(parseResult, spell);
  if (bySpellField !== null) return bySpellField;

  // 1. DataValues 먼저 시도
  const byData = replaceData(parseResult, spell, data);
  if (byData !== null) return byData;

  // 2. 안 되면 mSpellCalculations
  return replaceCalculateData(parseResult, spell, data, lang);
}

/**
 * 스킬 단축키를 가리키는 토큰.
 *
 * 게임 안에서는 실제 키 설정을 읽어 표시하지만 정적 데이터에는 없다.
 * 기본 스킬 스크립트 이름은 슬롯 문자로 끝나므로(EkkoW) 거기서 가져온다.
 */
function replaceHotKey(parseResult: ParseResult): string | null {
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
function replaceSpellField(
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
function resolveSpellRefData(
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

function replaceSpellMetadata(
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
function replaceEffectBurn(
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
