import * as XLSX from 'xlsx';
import type { Track } from '../../domain/types';

/**
 * Parser for the 山东省教育招生考试院 "夏季高考文化成绩一分一段表" (.xls).
 *
 * Real sheet layout (verified against the 2025 file):
 *   row 0: title
 *   row 1: group headers  ["分数段","全体",null,"选考物理",null,"选考化学", ...]
 *   row 2: sub-headers     [null,"本段人数","累计人数","本段人数","累计人数", ...]
 *   row 3+: data           [score, 全体本段, 全体累计, 物理本段, 物理累计, ...]
 *
 * For 山东 (3+3 综合) the app's track is 综合, so we take column 0 (分数) and
 * column 2 (全体 累计人数) as the one-score-one-rank mapping. The library reads
 * the actual cells — no numbers are inferred.
 */

export interface RankCsvRow {
  province: string;
  year: number;
  track: Track;
  score: number;
  cumulativeRank: number;
  source: string;
}

/** Pure extractor over array-of-arrays sheet rows (unit-testable without a file). */
export function extractShandongRankBuckets(
  rows: any[][],
): Array<{ score: number; cumulativeRank: number }> {
  const out: Array<{ score: number; cumulativeRank: number }> = [];
  for (const r of rows) {
    const score = r?.[0];
    const cumulative = r?.[2]; // 全体 累计人数 → 综合 位次
    if (
      typeof score === 'number' &&
      typeof cumulative === 'number' &&
      Number.isFinite(score) &&
      Number.isFinite(cumulative) &&
      score > 0 &&
      cumulative > 0
    ) {
      out.push({ score, cumulativeRank: cumulative });
    }
  }
  out.sort((a, b) => b.score - a.score); // best (highest score) first
  return out;
}

/** Read the .xls and return rank-table CSV rows for 山东·综合·<year>. */
export function parseShandongRankXls(
  filePath: string,
  year: number,
  source = 'real:sdzk/一分一段',
): RankCsvRow[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false });
  return extractShandongRankBuckets(rows).map((b) => ({
    province: '山东',
    year,
    track: '综合' as Track,
    score: b.score,
    cumulativeRank: b.cumulativeRank,
    source,
  }));
}
