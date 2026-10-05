export const STATS = { health: "체력", healthRegen: "체력 재생", armor: "방어력", magicResist: "마법 저항력", attackDamage: "공격력", attackSpeed: "공격 속도", moveSpeed: "이동 속도" };

export function valueAtLevel(scalar, level, field) {
  if (scalar.valuesByLevel?.[level - 1] !== undefined) return scalar.valuesByLevel[level - 1];
  const n = level - 1;
  const growth = scalar.perLevel * n * (0.7025 + 0.0175 * n);
  const value = field === "attackSpeed" ? scalar.base * (1 + growth / 100) : scalar.base + growth;
  return Math.round(value * 100) / 100;
}

export function rankedChampions(champions, selection) {
  const query = selection.search.toLocaleLowerCase();
  const all = champions.filter(champion => champion.stats[selection.stat])
    .map(champion => ({ ...champion, value: valueAtLevel(champion.stats[selection.stat], selection.level, selection.stat) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ko"));
  let rank = 0;
  return all.map((champion, index) => {
    if (index === 0 || all[index - 1].value !== champion.value) rank = index + 1;
    return { ...champion, rank };
  }).filter(champion => (!selection.role || champion.roles.includes(selection.role))
    && (!query || champion.name.includes(query) || champion.id.toLocaleLowerCase().includes(query)));
}
