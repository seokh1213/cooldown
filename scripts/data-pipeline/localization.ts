export { DATA_LOCALES } from "../../src/data/contracts/staticData";
export type { DataLocale } from "../../src/data/contracts/staticData";

export interface StringTable {
  entries?: Record<string, string>;
}

export function lookupString(
  table: StringTable,
  key: string | undefined
): string | undefined {
  if (!key || !table.entries) return undefined;
  return table.entries[key.toLowerCase()] ?? table.entries[key];
}

export function toParserTemplate(template: string): string {
  return template.replace(/@([^@]+)@/g, "{{ $1 }}");
}

/**
 * `{{Prefix@token@Suffix}}` 형태의 동적 문자열 참조.
 *
 * 클라이언트가 런타임 상태(@token@)로 문자열 키를 조립해 고르는 구조다.
 * 예) `{{Spell_SyndraW_Damage@f3@}}` → 진화 전이면 ...Damage0, 후면 ...Damage1
 */
const DYNAMIC_REFERENCE = /\{\{\s*([A-Za-z0-9_]*)@([^@{}]+)@([A-Za-z0-9_]*)\s*}}/g;

/** 해석하지 못한 동적 참조에 남기는 토큰. 파서가 "?" 로 렌더한다 */
function unresolvedToken(prefix: string, token: string, suffix: string): string {
  return `{{ dynamic:${prefix}${token}${suffix} }}`;
}

/**
 * 동적 참조가 가리킬 수 있는 번호 후보를 찾는다.
 * 키가 대소문자 구분 없이 저장돼 있어 소문자로 맞춰 비교한다.
 */
function findVariants(
  table: StringTable,
  prefix: string,
  suffix: string
): string[] {
  const entries = table.entries;
  if (!entries) return [];
  const head = prefix.toLowerCase();
  const tail = suffix.toLowerCase();

  return Object.keys(entries)
    .filter((key) => key.startsWith(head) && key.endsWith(tail))
    .map((key) => key.slice(head.length, key.length - tail.length))
    .filter((part) => /^\d+$/.test(part))
    .sort();
}

/**
 * 동적 참조를 펼친다.
 *
 * 후보가 정확히 0/1 두 개면 "기본 상태 / 강화 상태" 이진 분기라서 0번을 쓴다.
 * (신드라 W 진화 전 피해, 카르마 E 만트라 전 효과)
 * 후보가 셋 이상이면 서로 배타적인 선택지라 하나를 고르면 틀린 정보가 된다.
 * (아펠리오스의 무기별 문구) 이 경우 미해석으로 남겨 "?" 로 노출한다.
 */
function expandDynamicReferences(template: string, table: StringTable): string {
  return template.replace(
    DYNAMIC_REFERENCE,
    (_raw, prefix: string, token: string, suffix: string) => {
      const variants = findVariants(table, prefix, suffix);

      // 기본 / 강화 이진 분기는 기본 상태(0번)를 쓴다.
      // 신드라 W 진화 전 피해, 카르마 E 만트라 전 효과가 여기 해당한다.
      if (variants.length === 2 && variants[0] === "0") {
        const base = lookupString(table, `${prefix}0${suffix}`);
        if (base) return base;
      }

      // 선택지가 여럿이면 하나를 고를 수 없다. 대신 전부 이어 붙인다.
      // 아펠리오스 무기 5종, 케인 형태별 문구가 여기 해당한다.
      // 각 항목이 무기·형태 이름으로 시작해서 나열해도 읽힌다.
      if (variants.length >= 2) {
        // 형태가 달라도 문장이 같은 경우가 있다(케인 기본/그림자 암살자).
        // 그대로 이으면 같은 문단이 두 번 나오므로 중복은 걷어낸다.
        const blocks = [
          ...new Set(
            variants
              .filter((variant) => variant !== "0")
              .map((variant) => lookupString(table, `${prefix}${variant}${suffix}`))
              .filter((block): block is string => Boolean(block)),
          ),
        ];
        if (blocks.length >= 2) return blocks.join("<br><br>");
        if (blocks.length === 1) return blocks[0];
      }

      return unresolvedToken(prefix, token, suffix);
    }
  );
}

export function expandStringReferences(
  template: string,
  table: StringTable
): string {
  let result = template;

  for (let depth = 0; depth < 5; depth += 1) {
    let changed = false;

    // 동적 참조를 먼저 처리한다. 그대로 두면 @token@ 이 {{ }} 로 바뀌면서
    // 중첩 블록이 되어 문장에서 통째로 사라진다.
    const expanded = expandDynamicReferences(result, table);
    if (expanded !== result) {
      result = expanded;
      changed = true;
    }

    result = result.replace(
      /@([^@]+)@|\{\{([^}]+)}}/g,
      (token, atKey: string | undefined, braceKey: string | undefined) => {
      const key = atKey ?? braceKey;
      const replacement = lookupString(table, key?.trim());
      if (!replacement || replacement === token) return token;
      changed = true;
      return replacement;
      }
    );
    if (!changed) break;
  }

  return result;
}
