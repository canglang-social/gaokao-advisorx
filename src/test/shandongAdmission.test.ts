import { describe, it, expect } from 'vitest';
import {
  aggregateShandongSchools,
  isShandongSchoolCode,
} from '../lib/data/parsers/shandongAdmissionXls';

/**
 * Mirrors the real 山东 投档情况表 layout:
 * [专业(组)名称, "A001北京大学", 投档计划数, 最低位次]. The aggregator groups by
 * school code and takes the LARGEST 最低位次 (the easiest program = the school's
 * lowest line), skipping title/header rows and entries without a school code.
 */
describe('aggregateShandongSchools', () => {
  const rows: any[][] = [
    ['山东省2025年普通类常规批第1次志愿投档情况表'],
    ['专业代号及名称', '院校代号及名称', '投档计划数', '最低位次'],
    ['17文科试验班类', 'A001北京大学', 22, 178],
    ['56理科试验班类', 'A001北京大学', 50, 138], // same school → minRank = max(178,138)
    ['E1法学', 'A002中国人民大学', 8, 731],
    ['XX某专业', '无代号院校', 1, 500], // no leading code → skipped
  ];

  it('groups by school code and keeps the easiest (largest) 位次', () => {
    const agg = aggregateShandongSchools(rows);
    expect(agg.length).toBe(2);
    const pku = agg.find((s) => s.schoolCode === 'A001')!;
    expect(pku.schoolName).toBe('北京大学');
    expect(pku.minRank).toBe(178);
    expect(pku.programCount).toBe(2);
  });

  it('sorts best schools (smallest 位次) first', () => {
    const agg = aggregateShandongSchools(rows);
    expect(agg[0].schoolCode).toBe('A001'); // 178 < 731
    expect(agg[1].schoolCode).toBe('A002');
  });

  it('recognizes school codes for idempotent re-parsing', () => {
    expect(isShandongSchoolCode('A001')).toBe(true);
    expect(isShandongSchoolCode('B012')).toBe(true);
    expect(isShandongSchoolCode('tsinghua')).toBe(false);
  });
});
