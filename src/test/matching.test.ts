import { describe, it, expect } from 'vitest';
import { matchUniversities, TIER_THRESHOLDS, type MatchInputs } from '../lib/domain/matching';
import type {
  AdmissionLine,
  Major,
  RankTable,
  StudentProfile,
  University,
} from '../lib/domain/types';

const NOW = new Date('2025-07-01T00:00:00Z');
const OPTS = { currentYear: 2025, staleAfterDays: 30, now: NOW };

function uni(id: string, over: Partial<University> = {}): University {
  return {
    id,
    name: id.toUpperCase(),
    city: '某市',
    province: '某省',
    cityTier: 2,
    region: '华东',
    tags: ['985'],
    faculty: { summary: '', keyDisciplines: [] },
    environment: { campus: '', teaching: '', dormitory: '' },
    transfer: { difficulty: 'moderate', policy: '' },
    lastUpdatedAt: NOW.toISOString(),
    ...over,
  };
}

function line(uniId: string, minScore: number, minRank?: number): AdmissionLine {
  return {
    id: `${uniId}:_:河北:2025:物理`,
    universityId: uniId,
    province: '河北',
    track: '物理',
    year: 2025,
    minScore,
    minRank,
    source: 'test',
    lastUpdatedAt: NOW.toISOString(),
  };
}

function major(
  uniId: string,
  name: string,
  requiredSubjects: string[],
  line?: { minScore: number; minRank?: number },
): Major {
  return {
    id: `${uniId}:${name}`,
    universityId: uniId,
    name,
    category: '工学',
    facultyStrength: '强',
    employmentOutlook: '好',
    requiredSubjects,
    minScore: line?.minScore,
    minRank: line?.minRank,
    lastUpdatedAt: NOW.toISOString(),
  };
}

const RANK_TABLE: RankTable = {
  id: '河北:2025:物理',
  province: '河北',
  track: '物理',
  year: 2025,
  buckets: [
    { score: 700, cumulativeRank: 100 },
    { score: 650, cumulativeRank: 5000 },
    { score: 600, cumulativeRank: 25000 },
    { score: 550, cumulativeRank: 80000 },
  ],
  source: 'test',
  lastUpdatedAt: NOW.toISOString(),
};

function baseProfile(score: number, over: Partial<StudentProfile> = {}): StudentProfile {
  return {
    province: '河北',
    track: '物理',
    subjectScheme: '3+1+2',
    subjects: ['物理', '化学', '生物'],
    score,
    interests: [],
    dreamUniversities: [],
    dreamMajors: [],
    preferredCityTiers: [],
    preferredRegions: [],
    ...over,
  };
}

function inputs(profile: StudentProfile): MatchInputs {
  return {
    profile,
    universities: [uni('a'), uni('b'), uni('c')],
    majors: [major('a', '计算机', ['物理']), major('b', '法学', [])],
    admissionLines: [line('a', 600, 25000), line('b', 580, 35000), line('c', 640, 6000)],
    rankTable: RANK_TABLE,
  };
}

describe('matchUniversities', () => {
  it('classifies tiers by score gap (冲/稳/保)', () => {
    // score 620: a(600)→diff20=safety, b(580)→diff40=safety, c(640)→diff-20=dropped(<reachFloor)
    const m = matchUniversities(inputs(baseProfile(620)), OPTS);
    const aTier = [...m.tiers.safety, ...m.tiers.match, ...m.tiers.reach].find(
      (r) => r.universityId === 'a',
    )?.tier;
    expect(aTier).toBe('safety');
    // c (640) is 20 below → beyond reachFloor → excluded
    const cPresent = [...m.tiers.reach, ...m.tiers.match, ...m.tiers.safety].some(
      (r) => r.universityId === 'c',
    );
    expect(cPresent).toBe(false);
  });

  it('puts a near-but-above line into 冲 (reach)', () => {
    // score 595: a(600)→diff-5=reach
    const m = matchUniversities(inputs(baseProfile(595)), OPTS);
    expect(m.tiers.reach.some((r) => r.universityId === 'a')).toBe(true);
  });

  it('returns empty tiers when the score is far below every line', () => {
    const m = matchUniversities(inputs(baseProfile(400)), OPTS);
    expect(m.tiers.reach.length + m.tiers.match.length + m.tiers.safety.length).toBe(0);
  });

  it('converts score to 位次 via the rank table', () => {
    const m = matchUniversities(inputs(baseProfile(625)), OPTS);
    expect(m.studentRank).not.toBeNull();
    // 625 lies between 650(5000) and 600(25000) → ~15000
    expect(m.studentRank!).toBeGreaterThan(10000);
    expect(m.studentRank!).toBeLessThan(20000);
  });

  it('admit probability is monotonic in score', () => {
    const hi = matchUniversities(inputs(baseProfile(640)), OPTS);
    const lo = matchUniversities(inputs(baseProfile(605)), OPTS);
    const find = (m: ReturnType<typeof matchUniversities>) =>
      [...m.tiers.reach, ...m.tiers.match, ...m.tiers.safety].find((r) => r.universityId === 'a')!;
    expect(find(hi).admitProbability).toBeGreaterThanOrEqual(find(lo).admitProbability);
  });

  it('marks subject-fit majors and applies dream-school preference ordering', () => {
    const m = matchUniversities(
      inputs(baseProfile(620, { dreamUniversities: ['B'] })),
      OPTS,
    );
    const all = [...m.tiers.reach, ...m.tiers.match, ...m.tiers.safety];
    expect(all.some((r) => r.matchedMajors.some((mm) => mm.subjectFit))).toBe(true);
    // B is the dream school (+20 bonus) → first in its tier (safety).
    expect(m.tiers.safety[0]?.universityName).toBe('B');
  });

  it('reports data gaps when no admission lines exist for the combo', () => {
    const empty = matchUniversities(
      { ...inputs(baseProfile(620)), admissionLines: [] },
      OPTS,
    );
    expect(empty.tiers.reach.length + empty.tiers.match.length + empty.tiers.safety.length).toBe(0);
    expect(empty.dataGaps.length).toBeGreaterThan(0);
  });

  it('tiers by the intended major\'s own line, not the school\'s easiest program', () => {
    // School "a": general line 600 (its easiest program, e.g. 园艺), but 会计学 line is 640.
    const data: MatchInputs = {
      profile: baseProfile(630, { dreamMajors: ['会计学'] }),
      universities: [uni('a')],
      majors: [
        major('a', '会计学', [], { minScore: 640, minRank: 5000 }),
        major('a', '园艺', [], { minScore: 600, minRank: 25000 }),
      ],
      admissionLines: [line('a', 600, 25000)],
      rankTable: RANK_TABLE,
    };
    const m = matchUniversities(data, OPTS);
    const rec = [...m.tiers.reach, ...m.tiers.match, ...m.tiers.safety].find(
      (r) => r.universityId === 'a',
    )!;
    expect(rec.targetMajor?.name).toBe('会计学');
    expect(rec.predictedScore).toBe(640); // 会计学 line, NOT the school's 600
    expect(rec.tier).toBe('reach'); // 630 vs 640 → 冲 (without the fix it'd wrongly be 保)
  });

  it('drops a school for an intended major that is out of reach', () => {
    // At 610, 会计学(640) is 30 below reach → school should not appear as a 会计学 option.
    const data: MatchInputs = {
      profile: baseProfile(610, { dreamMajors: ['会计学'] }),
      universities: [uni('a')],
      majors: [major('a', '会计学', [], { minScore: 640, minRank: 5000 })],
      admissionLines: [line('a', 600, 25000)],
      rankTable: RANK_TABLE,
    };
    const m = matchUniversities(data, OPTS);
    const present = [...m.tiers.reach, ...m.tiers.match, ...m.tiers.safety].some(
      (r) => r.universityId === 'a',
    );
    expect(present).toBe(false);
  });

  it('excludes 中外合作/高收费 programs from the school line by default', () => {
    const data = (includeHighCost: boolean): MatchInputs => ({
      profile: baseProfile(590, { includeHighCost }),
      universities: [uni('a')],
      majors: [
        major('a', '计算机科学与技术(中外合作办学)', [], { minScore: 500 }),
        major('a', '计算机科学与技术', [], { minScore: 580 }),
      ],
      admissionLines: [line('a', 500)],
      rankTable: RANK_TABLE,
    });
    const find = (m: ReturnType<typeof matchUniversities>) =>
      [...m.tiers.reach, ...m.tiers.match, ...m.tiers.safety].find((r) => r.universityId === 'a')!;

    // Default (exclude coop): school line = 580 (the affordable program) → 稳.
    const excl = find(matchUniversities(data(false), OPTS));
    expect(excl.predictedScore).toBe(580);
    expect(excl.tier).toBe('match');
    // Opted in: coop 500 counts → school looks much easier → 保.
    const incl = find(matchUniversities(data(true), OPTS));
    expect(incl.predictedScore).toBe(500);
    expect(incl.tier).toBe('safety');
  });

  it('exposes tunable thresholds', () => {
    expect(TIER_THRESHOLDS.matchFrom).toBeLessThan(TIER_THRESHOLDS.safetyFrom);
  });
});
