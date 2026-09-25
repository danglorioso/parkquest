/**
 * Turns a visit's position in a user's rank_key-ordered list into a 0-10
 * display score, Beli-style — top ranks cluster near 9-10 rather than
 * spreading linearly, so a #1-of-40 reads closer to a #1-of-4 than a plain
 * linear scale would. The score is always derived at read time from the
 * sorted list, never stored, so it can never go stale after a reorder.
 *
 * `index` is 0-based position in the array sorted ascending by rank_key
 * (index 0 = favorite). `count` is the length of that ranked list.
 */
export function deriveRankScore(index: number, count: number): number {
  if (count <= 1) return 10;
  const percentile = 1 - index / (count - 1); // 1 = favorite, 0 = least favorite
  const curved = Math.pow(percentile, 0.7); // pushes top ranks up toward 10
  return Math.round(curved * 100) / 10;
}

/** Sorts ranked visits (rank_key present) ascending by rank_key, favorite first. */
export function sortByRankKey<T extends { rank_key: string | null }>(items: T[]): T[] {
  return [...items]
    .filter((item): item is T & { rank_key: string } => item.rank_key !== null)
    .sort((a, b) => (a.rank_key < b.rank_key ? -1 : a.rank_key > b.rank_key ? 1 : 0));
}
