import { describe, it, expect } from 'vitest';
import { runPipeline } from '../lib/data/pipeline';
import { MemoryStore } from '../lib/data/stores';
import { Repository } from '../lib/data/repository';
import type { DataFetcher } from '../lib/data/fetchers/types';
import type {
  AdmissionLine,
  Major,
  ProvincialScoreLine,
  RankTable,
  University,
} from '../lib/domain/types';

/** Deterministic stub source: includes a within-batch duplicate and a prior-year row. */
class StubFetcher implements DataFetcher {
  readonly name = 'stub';

  async fetchProvincialLines(): Promise<ProvincialScoreLine[]> {
    const now = new Date().toISOString();
    const p2025: ProvincialScoreLine = {
      id: '河北:2025:物理:本科批',
      province: '河北',
      year: 2025,
      track: '物理',
      batch: '本科批',
      minScore: 445,
      source: 'stub',
      lastUpdatedAt: now,
    };
    const p2024: ProvincialScoreLine = { ...p2025, id: '河北:2024:物理:本科批', year: 2024, minScore: 448 };
    // Duplicate id of p2025 (newer) — must be deduped within the batch.
    const dup: ProvincialScoreLine = { ...p2025, minScore: 446 };
    return [p2025, p2024, dup];
  }

  async fetchRankTables(): Promise<RankTable[]> {
    return [
      {
        id: '河北:2025:物理',
        province: '河北',
        year: 2025,
        track: '物理',
        buckets: [{ score: 600, cumulativeRank: 25000 }],
        source: 'stub',
        lastUpdatedAt: new Date().toISOString(),
      },
    ];
  }

  async fetchUniversities(): Promise<University[]> {
    return [
      {
        id: 'u1',
        name: 'U1',
        city: 'C',
        province: 'P',
        cityTier: 1,
        region: '华东',
        tags: ['985'],
        faculty: { summary: '', keyDisciplines: [] },
        environment: { campus: '', teaching: '', dormitory: '' },
        transfer: { difficulty: 'easy', policy: '' },
        lastUpdatedAt: new Date().toISOString(),
      },
    ];
  }

  async fetchMajors(): Promise<Major[]> {
    return [
      {
        id: 'u1:m',
        universityId: 'u1',
        name: '计算机',
        category: '工学',
        facultyStrength: '',
        employmentOutlook: '',
        requiredSubjects: ['物理'],
        lastUpdatedAt: new Date().toISOString(),
      },
    ];
  }

  async fetchAdmissionLines(): Promise<AdmissionLine[]> {
    return [
      {
        id: 'u1:_:河北:2025:物理',
        universityId: 'u1',
        province: '河北',
        track: '物理',
        year: 2025,
        minScore: 600,
        source: 'stub',
        lastUpdatedAt: new Date().toISOString(),
      },
    ];
  }
}

describe('runPipeline', () => {
  it('inserts, dedups within batch, and tags freshness on first run', async () => {
    const repo = new Repository(new MemoryStore());
    const result = await runPipeline(repo, new StubFetcher(), 'seed');

    // 3 provincial received, but one is a within-batch duplicate → 2 unique stored.
    const snap = await repo.load();
    expect(snap.provincialLines.length).toBe(2);
    expect(result.stats.duplicatesSkipped).toBe(1);
    expect(result.stats.inserted).toBe(6); // 2 prov + 1 rank + 1 uni + 1 major + 1 admission
    // Freshness: exactly the 2024 provincial line is prior-year.
    expect(result.freshness.priorYear).toBe(1);
    // Meta is recorded for observability.
    expect(snap.meta.lastRunAt).not.toBeNull();
    expect(snap.meta.lastRunSource).toBe('seed');
    expect(snap.meta.counts.universities).toBe(1);
  });

  it('is idempotent: a second run updates instead of inserting', async () => {
    const repo = new Repository(new MemoryStore());
    await runPipeline(repo, new StubFetcher(), 'seed');
    const second = await runPipeline(repo, new StubFetcher(), 'scheduled');

    expect(second.stats.inserted).toBe(0);
    expect(second.stats.updated).toBe(6);
    const snap = await repo.load();
    expect(snap.provincialLines.length).toBe(2); // no growth
    expect(snap.meta.lastRunSource).toBe('scheduled');
  });
});
