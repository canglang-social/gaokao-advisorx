import { describe, it, expect } from 'vitest';
import { extractShandongRankBuckets } from '../lib/data/parsers/shandongRankXls';

/**
 * Mirrors the real 山东 一分一段表 .xls layout (verified against the 2025 file):
 * title row, two header rows, then [score, 全体本段, 全体累计, 物理本段, 物理累计, ...].
 * The extractor must take col 0 (score) + col 2 (全体累计 → 综合 位次) and skip headers.
 */
describe('extractShandongRankBuckets', () => {
  const rows: any[][] = [
    ['2025年夏季高考文化成绩一分一段表'],
    ['分数段', '全体', null, '选考物理', null],
    [null, '本段人数', '累计人数', '本段人数', '累计人数'],
    [692, 7, 54, 7, 54],
    [691, 14, 68, 14, 68],
    [600, 698, 25061, 200, 17358],
    [150, 84, 681127, 21, 305884],
  ];

  it('extracts score + 全体累计人数, skipping header rows', () => {
    const b = extractShandongRankBuckets(rows);
    expect(b.length).toBe(4); // 4 numeric data rows, 3 header rows skipped
    expect(b[0]).toEqual({ score: 692, cumulativeRank: 54 });
    expect(b.find((x) => x.score === 600)).toEqual({ score: 600, cumulativeRank: 25061 });
    expect(b[b.length - 1]).toEqual({ score: 150, cumulativeRank: 681127 });
  });

  it('returns buckets sorted by score descending (best first)', () => {
    const b = extractShandongRankBuckets(rows);
    for (let i = 1; i < b.length; i++) expect(b[i - 1].score).toBeGreaterThan(b[i].score);
  });

  it('ignores rows with non-numeric or non-positive score/rank', () => {
    const b = extractShandongRankBuckets([
      ['x', 'y', 'z'],
      [0, 1, 100],
      [600, 1, 0],
      [620, 5, 14000],
    ]);
    expect(b).toEqual([{ score: 620, cumulativeRank: 14000 }]);
  });
});
