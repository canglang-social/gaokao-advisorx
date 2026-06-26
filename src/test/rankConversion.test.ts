import { describe, it, expect } from 'vitest';
import { rankToScore, scoreToRank } from '../lib/domain/rankConversion';
import { computeFreshness } from '../lib/data/freshness';
import type { RankTable } from '../lib/domain/types';

const TABLE: RankTable = {
  id: 't',
  province: '河北',
  year: 2025,
  track: '物理',
  buckets: [
    { score: 700, cumulativeRank: 100 },
    { score: 650, cumulativeRank: 5000 },
    { score: 600, cumulativeRank: 25000 },
    { score: 550, cumulativeRank: 80000 },
  ],
  source: 't',
  lastUpdatedAt: '2025-07-01T00:00:00Z',
};

describe('scoreToRank', () => {
  it('returns null without a table', () => {
    expect(scoreToRank(600, undefined)).toBeNull();
  });
  it('clamps above the top bucket', () => {
    expect(scoreToRank(720, TABLE)).toBe(100);
  });
  it('clamps below the bottom bucket', () => {
    expect(scoreToRank(500, TABLE)).toBe(80000);
  });
  it('interpolates between buckets', () => {
    const r = scoreToRank(625, TABLE); // midpoint of 650(5000)..600(25000) → ~15000
    expect(r).toBeGreaterThan(10000);
    expect(r).toBeLessThan(20000);
  });
  it('rankToScore is an approximate inverse', () => {
    const s = rankToScore(15000, TABLE);
    expect(s).toBeGreaterThan(600);
    expect(s).toBeLessThan(650);
  });
});

describe('computeFreshness', () => {
  const opts = { currentYear: 2025, staleAfterDays: 30, now: new Date('2025-08-01T00:00:00Z') };
  it('flags prior-year records', () => {
    const f = computeFreshness({ year: 2024, lastUpdatedAt: '2025-07-20T00:00:00Z' }, opts);
    expect(f.priorYear).toBe(true);
  });
  it('flags stale records', () => {
    const f = computeFreshness({ year: 2025, lastUpdatedAt: '2025-01-01T00:00:00Z' }, opts);
    expect(f.stale).toBe(true);
    expect(f.priorYear).toBe(false);
  });
  it('treats fresh current-year records as ok', () => {
    const f = computeFreshness({ year: 2025, lastUpdatedAt: '2025-07-25T00:00:00Z' }, opts);
    expect(f.stale).toBe(false);
    expect(f.priorYear).toBe(false);
  });
});
