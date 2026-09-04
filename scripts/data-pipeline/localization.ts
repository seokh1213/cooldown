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
