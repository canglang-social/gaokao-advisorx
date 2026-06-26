import type {
  AdmissionLine,
  EnvironmentNote,
  FacultyNote,
  Freshness,
  Major,
  RankTable,
  RiskTier,
  StudentProfile,
  TransferPolicy,
  University,
} from './types';
import { computeFreshness, freshnessBadge } from '../data/freshness';
import { scoreToRank } from './rankConversion';
import { isHighCostMajor, majorNameMatches } from './majorMatch';

/** Tier thresholds in score points (studentScore - predictedLine). Tunable. */
export const TIER_THRESHOLDS = {
  /** diff below this → too far out of reach, dropped from results. */
  reachFloor: -18,
  /** reach/match boundary. */
  matchFrom: 3,
  /** match/safety boundary. */
  safetyFrom: 20,
};

export interface MatchedMajor {
  name: string;
  category: string;
  facultyStrength: string;
  employmentOutlook: string;
  transferDifficulty: TransferPolicy['difficulty'];
  /** True when the major's required subjects are all in the student's 选科. */
  subjectFit: boolean;
}

/** The student's intended major matched to a concrete program at this school. */
export interface TargetMajor {
  /** The 意向专业 term the student typed (specific or 大类). */
  dream: string;
  /** The concrete program at this school it matched (e.g. 会计学). */
  name: string;
  /** That program's own 投档最低分 — what the tier is based on. */
  minScore: number;
  minRank?: number;
}

export interface Recommendation {
  universityId: string;
  universityName: string;
  city: string;
  province: string;
  cityTier: 1 | 2 | 3;
  region: string;
  tags: string[];
  tier: RiskTier;
  /** Predicted 投档线: the target-major's line when 意向专业 is set, else the school's. */
  predictedScore: number;
  /** Set when 意向专业 matched a program here; the tier reflects this program's line. */
  targetMajor?: TargetMajor;
  studentScore: number;
  scoreDiff: number;
  studentRank: number | null;
  lineRank: number | null;
  admitProbability: number; // 0..1
  faculty: FacultyNote;
  environment: EnvironmentNote;
  transfer: TransferPolicy;
  matchedMajors: MatchedMajor[];
  freshness: Freshness & { badge: ReturnType<typeof freshnessBadge> };
  reasons: string[];
  /** Ordering bonus from geography/dream/major-fit preferences (does not change tier). */
  preferenceBonus: number;
  /** The admission-line record the prediction is based on (for transparency). */
  basedOn: { year: number; minScore: number; minRank?: number; source: string };
}

export interface MatchResult {
  tiers: { reach: Recommendation[]; match: Recommendation[]; safety: Recommendation[] };
  usedYear: number | null;
  studentRank: number | null;
  dataGaps: string[];
  /** Pre-cap counts per tier (set by the service when results are capped for display). */
  tierCounts?: { reach: number; match: number; safety: number };
}

export interface MatchInputs {
  profile: StudentProfile;
  universities: University[];
  majors: Major[];
  /** Admission lines already filtered to the applicant's province + track (any year). */
  admissionLines: AdmissionLine[];
  /** Current-year rank table for the applicant's province + track (optional). */
  rankTable?: RankTable;
}

export interface MatchOptions {
  currentYear: number;
  staleAfterDays: number;
  now?: Date;
}

/** Logistic admit-probability from score gap. k controls steepness. */
function probabilityFromDiff(diff: number, k = 8): number {
  const p = 1 / (1 + Math.exp(-diff / k));
  return Math.round(p * 1000) / 1000;
}

function tierForDiff(diff: number): RiskTier | null {
  if (diff < TIER_THRESHOLDS.reachFloor) return null; // out of realistic range
  if (diff < TIER_THRESHOLDS.matchFrom) return 'reach';
  if (diff < TIER_THRESHOLDS.safetyFrom) return 'match';
  return 'safety';
}

function latestLine(lines: AdmissionLine[]): AdmissionLine | undefined {
  if (lines.length === 0) return undefined;
  return [...lines].sort((a, b) => b.year - a.year)[0];
}

function buildReasons(
  uni: University,
  diff: number,
  tier: RiskTier,
  matchedMajors: MatchedMajor[],
): string[] {
  const reasons: string[] = [];
  if (uni.tags.includes('985')) reasons.push('985 院校，平台与保研/就业认可度高。');
  else if (uni.tags.includes('211')) reasons.push('211/双一流，行业认可度较好。');

  // 性价比 / 黑马 hint: strong tags but a non-first-tier city tends to depress the line.
  // Guarded on a known city so schools imported without location metadata read cleanly.
  if (uni.city && (uni.tags.includes('985') || uni.tags.includes('211')) && uni.cityTier >= 2) {
    reasons.push(`${uni.city}地理位置压低了分数线，性价比突出。`);
  }
  if (uni.city && uni.cityTier === 1)
    reasons.push(`${uni.city}地处一线/新一线，实习与就业机会多。`);

  if (tier === 'reach') reasons.push('属于冲刺档：录取有一定风险，建议服从调剂。');
  if (tier === 'match') reasons.push('属于稳妥档：分数较为匹配，是志愿表的中坚。');
  if (tier === 'safety') reasons.push('属于保底档：录取概率高，确保有学上。');

  if (uni.transfer.difficulty === 'easy')
    reasons.push('转专业政策宽松，入学后调整空间大。');
  else if (uni.transfer.difficulty === 'hard' || uni.transfer.difficulty === 'restricted')
    reasons.push('转专业较难，建议直接报考心仪专业。');

  const fitMajor = matchedMajors.find((m) => m.subjectFit);
  if (fitMajor) reasons.push(`王牌专业「${fitMajor.name}」就业前景：${fitMajor.employmentOutlook}`);

  return reasons;
}

function preferenceBonus(profile: StudentProfile, uni: University, majors: Major[]): number {
  let bonus = 0;
  if (profile.preferredRegions.includes(uni.region)) bonus += 8;
  if (profile.preferredCityTiers.includes(uni.cityTier)) bonus += 6;
  if (profile.dreamUniversities.some((d) => uni.name.includes(d) || d.includes(uni.name)))
    bonus += 20;
  // Dream major: supports 大类 (e.g. 财会类 → 会计学/财务管理) via majorNameMatches.
  const majorNames = majors.map((m) => m.name);
  if (profile.dreamMajors.some((dm) => majorNames.some((mn) => majorNameMatches(dm, mn))))
    bonus += 10;
  // Interest/major overlap (also 大类-aware).
  for (const interest of profile.interests) {
    if (majorNames.some((mn) => majorNameMatches(interest, mn))) {
      bonus += 3;
      break;
    }
  }
  return bonus;
}

/**
 * Core matching: rank universities into 冲/稳/保 tiers for the given profile.
 * Pure — all data is passed in, the clock is injectable.
 */
export function matchUniversities(inputs: MatchInputs, opts: MatchOptions): MatchResult {
  const { profile, universities, majors, admissionLines, rankTable } = inputs;
  const dataGaps: string[] = [];

  const studentRank =
    profile.rank ?? scoreToRank(profile.score, rankTable) ?? null;
  if (!rankTable && profile.rank === undefined) {
    dataGaps.push(`缺少 ${profile.province}·${profile.track} 当年一分一段表，位次为估算/缺失。`);
  }

  // Pre-group by universityId once (O(N)) — avoids O(U×N) scans at real-data scale
  // (1140 schools × thousands of lines/majors per /api/match request).
  const linesByUni = new Map<string, AdmissionLine[]>();
  for (const l of admissionLines) {
    const arr = linesByUni.get(l.universityId);
    if (arr) arr.push(l);
    else linesByUni.set(l.universityId, [l]);
  }
  const majorsByUni = new Map<string, Major[]>();
  for (const m of majors) {
    const arr = majorsByUni.get(m.universityId);
    if (arr) arr.push(m);
    else majorsByUni.set(m.universityId, [m]);
  }

  const recs: Recommendation[] = [];
  let usedYear: number | null = null;
  let schoolsWithLines = 0;

  for (const uni of universities) {
    const uniLines = linesByUni.get(uni.id) ?? [];
    const line = latestLine(uniLines);
    // A university with no line for this combo simply isn't recruiting here — that
    // is normal at real-data scale, not a per-school "gap". We only flag the case
    // where the WHOLE combo has no data (handled after the loop).
    if (!line) continue;
    schoolsWithLines++;
    usedYear = usedYear === null ? line.year : Math.max(usedYear, line.year);

    const allMajors = majorsByUni.get(uni.id) ?? [];
    // Exclude 中外合作/高收费 programs (cheap line, expensive tuition) unless opted in —
    // otherwise a school's "lowest line" / a matched major can be a pricey coop program.
    const includeHighCost = profile.includeHighCost === true;
    const uniMajors = includeHighCost ? allMajors : allMajors.filter((m) => !isHighCostMajor(m.name));

    // School's representative line = lowest-line *eligible* program (so coop programs
    // don't make the school look cheaper/easier). Fall back to the aggregated line
    // when there's no per-program line data (e.g. sample provinces).
    let baseScore = line.minScore;
    let baseRank: number | null = line.minRank ?? null;
    const priced = uniMajors.filter((m) => m.minScore !== undefined);
    if (priced.length > 0) {
      const lowest = priced.reduce((a, b) => ((a.minScore as number) <= (b.minScore as number) ? a : b));
      baseScore = lowest.minScore as number;
      baseRank = lowest.minRank ?? null;
    }

    // Dream-major-aware tiering: if the student wants specific majors and this school
    // offers a matching (eligible) program WITH its own line, evaluate by THAT program's
    // line — not the school's easiest program.
    let targetMajor: TargetMajor | undefined;
    if (profile.dreamMajors.length > 0) {
      let best: { dream: string; major: Major } | undefined;
      for (const m of uniMajors) {
        if (m.minScore === undefined) continue;
        const dream = profile.dreamMajors.find((d) => majorNameMatches(d, m.name));
        if (!dream) continue;
        if (!best || m.minScore < (best.major.minScore as number)) best = { dream, major: m };
      }
      if (best) {
        targetMajor = {
          dream: best.dream,
          name: best.major.name,
          minScore: best.major.minScore as number,
          minRank: best.major.minRank,
        };
      }
    }

    // Predict by the target major's line when present, else the school's eligible line.
    const predictedScore = targetMajor ? targetMajor.minScore : baseScore;
    const scoreDiff = profile.score - predictedScore;
    const tier = tierForDiff(scoreDiff);
    if (!tier) continue;

    const lineRank = (targetMajor?.minRank ?? baseRank) ?? null;
    // Probability primarily from score gap; nudged by rank when both are available.
    let probability = probabilityFromDiff(scoreDiff);
    if (studentRank !== null && lineRank !== null) {
      // Better (smaller) student rank than the line → safer.
      const rankProb = studentRank <= lineRank ? 0.75 : 0.35;
      probability = Math.round((probability * 0.6 + rankProb * 0.4) * 1000) / 1000;
    }

    const matchedMajors: MatchedMajor[] = uniMajors.map((m) => ({
      name: m.name,
      category: m.category,
      facultyStrength: m.facultyStrength,
      employmentOutlook: m.employmentOutlook,
      transferDifficulty: uni.transfer.difficulty,
      subjectFit:
        m.requiredSubjects.length === 0 ||
        m.requiredSubjects.every((s) => profile.subjects.includes(s)),
    }));

    const reasons = buildReasons(uni, scoreDiff, tier, matchedMajors);
    if (targetMajor) {
      reasons.unshift(
        `意向「${targetMajor.dream}」→ 专业「${targetMajor.name}」投档线 ${targetMajor.minScore}（位次${
          targetMajor.minRank ?? '—'
        }）`,
      );
    }

    const fresh = computeFreshness(line, opts);
    recs.push({
      universityId: uni.id,
      universityName: uni.name,
      city: uni.city,
      province: uni.province,
      cityTier: uni.cityTier,
      region: uni.region,
      tags: uni.tags,
      tier,
      predictedScore,
      targetMajor,
      studentScore: profile.score,
      scoreDiff,
      studentRank,
      lineRank,
      admitProbability: probability,
      faculty: uni.faculty,
      environment: uni.environment,
      transfer: uni.transfer,
      matchedMajors,
      freshness: { ...fresh, badge: freshnessBadge(fresh) },
      reasons,
      preferenceBonus: preferenceBonus(profile, uni, uniMajors),
      basedOn: {
        year: line.year,
        minScore: line.minScore,
        minRank: line.minRank,
        source: line.source,
      },
    });
  }

  if (schoolsWithLines === 0) {
    dataGaps.push(`暂无 ${profile.province}·${profile.track} 的院校投档线数据。`);
  }

  // Order within each tier by "closest to your score first" (best school at each risk
  // level), with preference as a boost. NOT by probability — that wrongly surfaced the
  // lowest-line (worst) safety schools first and buried good ones under the display cap.
  const orderKey = (r: Recommendation) => -Math.abs(r.scoreDiff) + r.preferenceBonus * 2;
  const byTier = (t: RiskTier) =>
    recs.filter((r) => r.tier === t).sort((a, b) => orderKey(b) - orderKey(a));

  return {
    tiers: { reach: byTier('reach'), match: byTier('match'), safety: byTier('safety') },
    usedYear,
    studentRank,
    dataGaps: [...new Set(dataGaps)],
  };
}
