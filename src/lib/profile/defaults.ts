import type { StudentProfile, SubjectScheme, Track } from '../domain/types';

/** A reasonable starter profile so the form and matching show results immediately. */
export const DEFAULT_PROFILE: StudentProfile = {
  province: '河北',
  city: '石家庄',
  subjectScheme: '3+1+2',
  track: '物理',
  subjects: ['物理', '化学', '生物'],
  score: 615,
  rank: undefined,
  interests: ['计算机', '人工智能'],
  dreamUniversities: ['哈尔滨工业大学'],
  dreamMajors: ['计算机科学与技术'],
  preferredCityTiers: [1, 2],
  preferredRegions: ['华东', '华北'],
  climate: '不限',
  includeHighCost: false,
  notes: '希望就业好、能去大厂，能接受非一线城市但要 985/211。',
};

const SCHEMES: SubjectScheme[] = ['3+3', '3+1+2', 'traditional'];
const TRACKS: Track[] = ['物理', '历史', '理科', '文科', '综合'];

/** Coerce arbitrary input into a valid StudentProfile (API boundary hardening). */
export function normalizeProfile(input: any): StudentProfile {
  const d = DEFAULT_PROFILE;
  const asStrArray = (v: any, fallback: string[]): string[] =>
    Array.isArray(v) ? v.map(String).filter((s) => s.trim().length > 0) : fallback;
  const score = Number(input?.score);
  const rank = input?.rank === undefined || input?.rank === null ? undefined : Number(input.rank);

  return {
    province: typeof input?.province === 'string' && input.province ? input.province : d.province,
    city: typeof input?.city === 'string' ? input.city : d.city,
    subjectScheme: SCHEMES.includes(input?.subjectScheme) ? input.subjectScheme : d.subjectScheme,
    track: TRACKS.includes(input?.track) ? input.track : d.track,
    subjects: asStrArray(input?.subjects, d.subjects),
    score: Number.isFinite(score) ? Math.max(0, Math.min(750, score)) : d.score,
    rank: rank !== undefined && Number.isFinite(rank) ? Math.max(1, rank) : undefined,
    interests: asStrArray(input?.interests, []),
    dreamUniversities: asStrArray(input?.dreamUniversities, []),
    dreamMajors: asStrArray(input?.dreamMajors, []),
    preferredCityTiers: Array.isArray(input?.preferredCityTiers)
      ? input.preferredCityTiers
          .map((n: any) => Number(n))
          .filter((n: number) => [1, 2, 3].includes(n))
      : d.preferredCityTiers,
    preferredRegions: asStrArray(input?.preferredRegions, []),
    climate: typeof input?.climate === 'string' ? input.climate : d.climate,
    includeHighCost: input?.includeHighCost === true,
    notes: typeof input?.notes === 'string' ? input.notes : '',
  };
}
