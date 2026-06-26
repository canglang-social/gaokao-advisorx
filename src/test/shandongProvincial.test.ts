import { describe, it, expect } from 'vitest';
import { extractShandongProvincialLines } from '../lib/data/parsers/shandongProvincialPdf';
import { tagsForSchool } from '../lib/data/reference/universityTags';
import { metaForSchool } from '../lib/data/reference/universityMeta';

// Mirrors the PDF text order: 普通类 control lines appear BEFORE 艺术类 综合分,
// so first-match must pick 普通类 (441/150), not 艺术类 (566/428).
const PDF_TEXT = `山东省 2025 年夏季高考 各类别分数线
一、普通类
分 数
特殊类型招生控制线 521
一段线 441
二段线 150
（艺术类）综合分
一段线 566
二段线 428`;

describe('extractShandongProvincialLines', () => {
  it('extracts the 普通类 control lines (not 艺术类)', () => {
    const rows = extractShandongProvincialLines(PDF_TEXT, 2025);
    const byBatch = Object.fromEntries(rows.map((r) => [r.batch, r.minScore]));
    expect(byBatch['特殊类型招生控制线']).toBe(521);
    expect(byBatch['一段线']).toBe(441); // not 566
    expect(byBatch['二段线']).toBe(150); // not 428
    expect(rows.every((r) => r.province === '山东' && r.track === '综合' && r.year === 2025)).toBe(true);
  });
});

describe('tagsForSchool', () => {
  it('tags 985 / 211 / 双非 correctly', () => {
    expect(tagsForSchool('北京大学')).toBe('985|211|双一流');
    expect(tagsForSchool('山东大学')).toBe('985|211|双一流');
    expect(tagsForSchool('北京邮电大学')).toBe('211|双一流');
    expect(tagsForSchool('暨南大学')).toBe('211|双一流');
    expect(tagsForSchool('某民办学院')).toBe('');
  });
  it('matches campus variants by prefix', () => {
    expect(tagsForSchool('山东大学(威海)')).toBe('985|211|双一流');
    expect(tagsForSchool('哈尔滨工业大学(深圳)')).toBe('985|211|双一流');
    expect(tagsForSchool('中国石油大学(华东)')).toBe('211|双一流');
  });
});

describe('metaForSchool', () => {
  it('resolves location for exact-name 985/211 schools', () => {
    expect(metaForSchool('北京大学')).toEqual({
      tags: '985|211|双一流', city: '北京', province: '北京', region: '华北', cityTier: 1,
    });
    expect(metaForSchool('兰州大学')).toMatchObject({ city: '兰州', region: '西北', cityTier: 3 });
    expect(metaForSchool('北京邮电大学')).toMatchObject({ city: '北京', tags: '211|双一流' });
  });
  it('keeps the tag but omits city for branch campuses (exact match, never guesses)', () => {
    const m = metaForSchool('哈尔滨工业大学(深圳)');
    expect(m.tags).toBe('985|211|双一流'); // tier still inherited
    expect(m.city).toBe(''); // never assign a wrong city to a 深圳 campus
  });
  it('returns empty location for unknown schools', () => {
    expect(metaForSchool('某民办学院')).toEqual({
      tags: '', city: '', province: '', region: '', cityTier: '',
    });
  });
});
