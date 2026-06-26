import type { Freshness } from '../domain/types';

/**
 * Compute freshness metadata for a record from its `year` and `lastUpdatedAt`.
 * Pure function (clock injected) so it is deterministic in tests/eval.
 */
export function computeFreshness(
  record: { year: number; lastUpdatedAt: string },
  opts: { currentYear: number; staleAfterDays: number; now?: Date },
): Freshness {
  const now = opts.now ?? new Date();
  const updated = new Date(record.lastUpdatedAt);
  const ageMs = now.getTime() - updated.getTime();
  const ageDays = Math.max(0, Math.floor(ageMs / 86_400_000));
  return {
    priorYear: record.year < opts.currentYear,
    stale: ageDays > opts.staleAfterDays,
    ageDays,
  };
}

/** Human-readable freshness badge text (Simplified Chinese, for the UI). */
export function freshnessBadge(f: Freshness): { label: string; level: 'ok' | 'warn' | 'danger' } {
  if (f.priorYear) return { label: '往年数据', level: 'danger' };
  if (f.stale) return { label: `已 ${f.ageDays} 天未更新`, level: 'warn' };
  return { label: '数据较新', level: 'ok' };
}
