export const DATA_LOCALES = ["ko_KR", "en_US", "zh_CN"] as const;

export type DataLocale = (typeof DATA_LOCALES)[number];

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

export function expandStringReferences(
  template: string,
  table: StringTable
): string {
  let result = template;

  for (let depth = 0; depth < 5; depth += 1) {
    let changed = false;
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
