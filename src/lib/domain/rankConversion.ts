import type { RankTable } from './types';

/**
 * Convert a raw score to an approximate 位次 (provincial rank) using a 一分一段
 * style bucket table. Linear interpolation between adjacent buckets.
 *
 * Buckets are {score, cumulativeRank} where cumulativeRank = number of candidates
 * scoring at-or-above `score` (so higher score → smaller/better rank).
 *
 * Returns `null` when no table is available (caller falls back to score-only logic).
 */
export function scoreToRank(score: number, table: RankTable | undefined): number | null {
  if (!table || table.buckets.length === 0) return null;
  // Sort descending by score (best first).
  const b = [...table.buckets].sort((x, y) => y.score - x.score);

  if (score >= b[0].score) return b[0].cumulativeRank;
  const last = b[b.length - 1];
  if (score <= last.score) return last.cumulativeRank;

  for (let i = 0; i < b.length - 1; i++) {
    const hi = b[i];
    const lo = b[i + 1];
    if (score <= hi.score && score >= lo.score) {
      const span = hi.score - lo.score || 1;
      const t = (hi.score - score) / span; // 0 at hi, 1 at lo
      const rank = hi.cumulativeRank + t * (lo.cumulativeRank - hi.cumulativeRank);
      return Math.round(rank);
    }
  }
  return last.cumulativeRank;
}

/** Inverse: approximate the score that corresponds to a given rank. */
export function rankToScore(rank: number, table: RankTable | undefined): number | null {
  if (!table || table.buckets.length === 0) return null;
  const b = [...table.buckets].sort((x, y) => x.cumulativeRank - y.cumulativeRank);
  if (rank <= b[0].cumulativeRank) return b[0].score;
  const last = b[b.length - 1];
  if (rank >= last.cumulativeRank) return last.score;
  for (let i = 0; i < b.length - 1; i++) {
    const lo = b[i];
    const hi = b[i + 1];
    if (rank >= lo.cumulativeRank && rank <= hi.cumulativeRank) {
      const span = hi.cumulativeRank - lo.cumulativeRank || 1;
      const t = (rank - lo.cumulativeRank) / span;
      return Math.round(lo.score + t * (hi.score - lo.score));
    }
  }
  return last.score;
}
