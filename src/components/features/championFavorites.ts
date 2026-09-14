export function partitionFavoriteChampions<T extends { id: string }>(
  champions: readonly T[],
  favoriteIds: ReadonlySet<string>,
): { favorites: T[]; others: T[] } {
  const favorites: T[] = [];
  const others: T[] = [];

  champions.forEach((champion) => {
    (favoriteIds.has(champion.id) ? favorites : others).push(champion);
  });

  return { favorites, others };
}
