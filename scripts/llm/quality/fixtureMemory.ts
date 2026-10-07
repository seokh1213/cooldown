/** Bind reference-only evaluation seeds to current data; stored user history is never rebound. */
export function fixtureMemory(seed: Record<string, unknown>, patch: string): Record<string, unknown> {
  const copy = structuredClone(seed);
  const allowed = (value: unknown, keys: string[]) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key));
  if (!allowed(copy, ['patch', 'conditions', 'active', 'champion', 'spell', 'stat'])
    || !Array.isArray(copy.conditions) || copy.conditions.length
    || copy.spell && !allowed(copy.spell, ['champion', 'slot', 'focus'])
    || copy.stat && !allowed(copy.stat, ['kind', 'champions', 'field', 'fields', 'level'])) return copy;
  return { ...copy, patch };
}
