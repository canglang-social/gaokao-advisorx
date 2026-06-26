import type { DataSnapshot } from '../domain/types';
import { getConfig } from '../config';
import { computeFreshness } from './freshness';
import type { DataFetcher } from './fetchers/types';
import type { Repository } from './repository';

interface MergeStats {
  received: number;
  inserted: number;
  updated: number;
  duplicatesSkipped: number;
}

/**
 * Merge an incoming batch into an existing collection, keyed by natural-key `id`.
 * - Within the incoming batch, duplicate ids collapse to the newest lastUpdatedAt.
 * - Against the existing store, a matching id is an UPDATE, otherwise an INSERT.
 */
function mergeById<T extends { id: string; lastUpdatedAt: string }>(
  existing: T[],
  incoming: T[],
): { merged: T[]; stats: MergeStats } {
  const deduped = new Map<string, T>();
  let duplicatesSkipped = 0;
  for (const rec of incoming) {
    const prev = deduped.get(rec.id);
    if (!prev) {
      deduped.set(rec.id, rec);
    } else {
      duplicatesSkipped++;
      if (new Date(rec.lastUpdatedAt) >= new Date(prev.lastUpdatedAt)) deduped.set(rec.id, rec);
    }
  }

  const byId = new Map(existing.map((r) => [r.id, r]));
  let inserted = 0;
  let updated = 0;
  for (const [id, rec] of deduped) {
    if (byId.has(id)) updated++;
    else inserted++;
    byId.set(id, rec);
  }

  return {
    merged: [...byId.values()],
    stats: { received: incoming.length, inserted, updated, duplicatesSkipped },
  };
}

function addStats(a: MergeStats, b: MergeStats): MergeStats {
  return {
    received: a.received + b.received,
    inserted: a.inserted + b.inserted,
    updated: a.updated + b.updated,
    duplicatesSkipped: a.duplicatesSkipped + b.duplicatesSkipped,
  };
}

export interface PipelineResult {
  source: 'seed' | 'scheduled' | 'manual';
  finishedAt: string;
  stats: MergeStats;
  /** Freshness summary across the resulting dataset (the real "freshness tagging"). */
  freshness: { total: number; priorYear: number; stale: number };
}

/**
 * Run the full data-collection pipeline: fetch every collection from the source,
 * dedup + upsert into the repository, recompute freshness, and persist. Returns
 * observable stats so the scheduler/API can report what happened.
 */
export async function runPipeline(
  repo: Repository,
  fetcher: DataFetcher,
  source: 'seed' | 'scheduled' | 'manual',
): Promise<PipelineResult> {
  const cfg = getConfig();
  const snapshot = await repo.load();

  const [provincialLines, rankTables, universities, majors, admissionLines] = await Promise.all([
    fetcher.fetchProvincialLines(),
    fetcher.fetchRankTables(),
    fetcher.fetchUniversities(),
    fetcher.fetchMajors(),
    fetcher.fetchAdmissionLines(),
  ]);

  const m1 = mergeById(snapshot.provincialLines, provincialLines);
  const m2 = mergeById(snapshot.rankTables, rankTables);
  const m3 = mergeById(snapshot.universities, universities);
  const m4 = mergeById(snapshot.majors, majors);
  const m5 = mergeById(snapshot.admissionLines, admissionLines);

  const stats = [m1, m2, m3, m4, m5]
    .map((m) => m.stats)
    .reduce(addStats, { received: 0, inserted: 0, updated: 0, duplicatesSkipped: 0 });

  const next: DataSnapshot = {
    provincialLines: m1.merged,
    rankTables: m2.merged,
    universities: m3.merged,
    majors: m4.merged,
    admissionLines: m5.merged,
    meta: snapshot.meta,
  };

  // Freshness tagging: compute over every dated record (lines have year+lastUpdatedAt).
  const dated = [...next.provincialLines, ...next.rankTables, ...next.admissionLines];
  let priorYear = 0;
  let stale = 0;
  for (const r of dated) {
    const f = computeFreshness(r, {
      currentYear: cfg.currentYear,
      staleAfterDays: cfg.staleAfterDays,
    });
    if (f.priorYear) priorYear++;
    if (f.stale) stale++;
  }

  const finishedAt = new Date().toISOString();
  next.meta = {
    lastRunAt: finishedAt,
    lastRunSource: source,
    counts: {
      provincialLines: next.provincialLines.length,
      rankTables: next.rankTables.length,
      universities: next.universities.length,
      majors: next.majors.length,
      admissionLines: next.admissionLines.length,
    },
    lastRunStats: stats,
  };

  await repo.save(next);

  return {
    source,
    finishedAt,
    stats,
    freshness: { total: dated.length, priorYear, stale },
  };
}
