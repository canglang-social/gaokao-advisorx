import { describe, it, expect } from 'vitest';
import { majorNameMatches, findMatchingMajor, isHighCostMajor } from '../lib/domain/majorMatch';
import { extractShandongMajors } from '../lib/data/parsers/shandongAdmissionXls';

describe('majorNameMatches (大类-aware)', () => {
  it('matches a 大类 against concrete majors', () => {
    expect(majorNameMatches('财会类', '会计学')).toBe(true);
    expect(majorNameMatches('财会类', '财务管理')).toBe(true);
    expect(majorNameMatches('计算机类', '软件工程')).toBe(true);
    expect(majorNameMatches('电子信息类', '通信工程')).toBe(true);
    expect(majorNameMatches('医学类', '临床医学')).toBe(true);
  });
  it('does not match unrelated majors', () => {
    expect(majorNameMatches('财会类', '机械工程')).toBe(false);
    expect(majorNameMatches('医学类', '法学')).toBe(false);
  });
  it('still does plain substring for specific majors', () => {
    expect(majorNameMatches('会计学', '会计学(注册会计师方向)')).toBe(true);
    expect(majorNameMatches('英语', '商务英语')).toBe(true);
  });
  it('findMatchingMajor returns the first hit with both terms', () => {
    expect(findMatchingMajor(['财会类'], ['法学', '财务管理'])).toEqual({
      dream: '财会类',
      major: '财务管理',
    });
    expect(findMatchingMajor(['机械类'], ['法学', '会计学'])).toBeUndefined();
  });
});

describe('isHighCostMajor', () => {
  it('flags 中外合作 / 校企合作 / 较高收费 programs', () => {
    expect(isHighCostMajor('葡萄与葡萄酒工程(中外合作办学)')).toBe(true);
    expect(isHighCostMajor('计算机科学与技术(校企合作)')).toBe(true);
    expect(isHighCostMajor('金融学(较高收费)')).toBe(true);
  });
  it('does not flag normal programs', () => {
    expect(isHighCostMajor('会计学')).toBe(false);
    expect(isHighCostMajor('国际经济与贸易')).toBe(false); // 国际 is not a marker
  });
});

describe('extractShandongMajors', () => {
  const rows: any[][] = [
    ['标题'],
    ['专业代号及名称', '院校代号及名称', '投档计划数', '最低位次'],
    ['E1法学', 'A002中国人民大学', 8, 731],
    ['N1人工智能', 'A002中国人民大学', 4, 542],
    ['N1人工智能', 'A002中国人民大学', 2, 600], // dup → keep the LARGER 位次 (easiest)
    ['0G阿拉伯语', 'A068天津外国语大学', 1, 53902],
    ['XX某专业', '无代号院校', 1, 1], // no school code → skipped
  ];
  it('strips the 专业代号, keeps the easiest (largest) 位次, skips codeless schools', () => {
    const m = extractShandongMajors(rows);
    expect(m).toEqual([
      { schoolCode: 'A002', majorName: '法学', minRank: 731 },
      { schoolCode: 'A002', majorName: '人工智能', minRank: 600 },
      { schoolCode: 'A068', majorName: '阿拉伯语', minRank: 53902 },
    ]);
  });
});
