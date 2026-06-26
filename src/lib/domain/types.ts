/**
 * Core domain types shared across data-collection, storage, matching, API and UI.
 *
 * Every persisted record carries `year` and `lastUpdatedAt` so the UI can surface
 * data freshness and warn on stale / prior-year data (a hard product requirement).
 */

/** 新高考选科模式 — subject scheme. */
export type SubjectScheme = '3+3' | '3+1+2' | 'traditional';

/** Admission track. For 3+1+2 this is the 首选科目 (物理/历史); for traditional 文/理. */
export type Track = '物理' | '历史' | '理科' | '文科' | '综合';

/** Risk tier of a recommendation: 冲 (reach) / 稳 (match) / 保 (safety). */
export type RiskTier = 'reach' | 'match' | 'safety';

export const RISK_TIER_LABEL: Record<RiskTier, string> = {
  reach: '冲',
  match: '稳',
  safety: '保',
};

/** A record annotated with freshness metadata derived from year + lastUpdatedAt. */
export interface Freshness {
  /** True when the record's `year` is older than the configured CURRENT_YEAR. */
  priorYear: boolean;
  /** True when lastUpdatedAt is older than DATA_STALE_AFTER_DAYS. */
  stale: boolean;
  /** Whole days since lastUpdatedAt. */
  ageDays: number;
}

/** 各省批次线 — provincial batch control line for a year/track. */
export interface ProvincialScoreLine {
  /** Natural-key id: `${province}:${year}:${track}:${batch}`. */
  id: string;
  province: string;
  year: number;
  track: Track;
  /** 本科批 / 特殊类型招生控制线 / 专科批 ... */
  batch: string;
  minScore: number;
  source: string;
  lastUpdatedAt: string; // ISO 8601
}

/** 一分一段表 (mocked, coarse buckets) — enables score→位次(rank) conversion. */
export interface RankTable {
  /** Natural-key id: `${province}:${year}:${track}`. */
  id: string;
  province: string;
  year: number;
  track: Track;
  /** Ascending-by-score buckets; cumulativeRank = #candidates at-or-above score. */
  buckets: Array<{ score: number; cumulativeRank: number }>;
  source: string;
  lastUpdatedAt: string;
}

/** 师资 note for a university or one of its departments. */
export interface FacultyNote {
  /** e.g. 院士/长江学者数量, 国家重点学科, 学科评估等级 (A+/A/B...). */
  summary: string;
  keyDisciplines: string[];
  rating?: string;
}

/** 校园 / 教学 / 宿舍环境 note. */
export interface EnvironmentNote {
  campus: string;
  teaching: string;
  dormitory: string;
}

/** 转专业 difficulty/policy. */
export interface TransferPolicy {
  /** easy | moderate | hard | restricted */
  difficulty: 'easy' | 'moderate' | 'hard' | 'restricted';
  policy: string;
}

/** A university (static-ish profile). Majors are stored separately. */
export interface University {
  id: string;
  name: string;
  city: string;
  province: string;
  /** 城市层级: 1 = 一线 / 新一线, 2 = 二线, 3 = 三线及以下. */
  cityTier: 1 | 2 | 3;
  region: string; // 华东/华北/华南/华中/西南/西北/东北
  /** 985 / 211 / 双一流 / 省重点 ... */
  tags: string[];
  faculty: FacultyNote;
  environment: EnvironmentNote;
  transfer: TransferPolicy;
  lastUpdatedAt: string;
}

/** A major / 专业 within a university. */
export interface Major {
  id: string;
  universityId: string;
  name: string;
  category: string; // 工学/理学/经济学/医学 ...
  /** 师资 note specific to the department offering this major. */
  facultyStrength: string;
  /** 就业前景 / 行业趋势 note (employment-aware, 张雪峰-style). */
  employmentOutlook: string;
  /** Allowed first-choice subjects (for 选科 filtering); empty = unrestricted. */
  requiredSubjects: string[];
  /** Program-level 投档最低分 (this 专业's own line); optional. */
  minScore?: number;
  /** Program-level 最低位次; optional. */
  minRank?: number;
  lastUpdatedAt: string;
}

/** 院校(专业)投档线 — admission line, per applicant-province / year / track. */
export interface AdmissionLine {
  /** Natural-key id: `${universityId}:${majorId ?? '_'}:${province}:${year}:${track}`. */
  id: string;
  universityId: string;
  /** Optional: a specific major; null/undefined = university-level 投档线. */
  majorId?: string;
  province: string; // applicant province
  year: number;
  track: Track;
  minScore: number;
  /** 最低位次 (rank); optional — present where the data source provides it. */
  minRank?: number;
  source: string;
  lastUpdatedAt: string;
}

/** Snapshot of the whole mock dataset (the JSON store shape). */
export interface DataSnapshot {
  provincialLines: ProvincialScoreLine[];
  rankTables: RankTable[];
  universities: University[];
  majors: Major[];
  admissionLines: AdmissionLine[];
  meta: PipelineMeta;
}

/** Observability metadata for the data-collection pipeline. */
export interface PipelineMeta {
  lastRunAt: string | null;
  lastRunSource: 'seed' | 'scheduled' | 'manual' | null;
  counts: {
    provincialLines: number;
    rankTables: number;
    universities: number;
    majors: number;
    admissionLines: number;
  };
  /** Per-run dedup/insert stats for the most recent pipeline run. */
  lastRunStats?: {
    received: number;
    inserted: number;
    updated: number;
    duplicatesSkipped: number;
  };
}

/** Student profile (intake form). All fields editable any time; persisted locally. */
export interface StudentProfile {
  province: string;
  city?: string;
  subjectScheme: SubjectScheme;
  track: Track;
  /** Chosen subjects (新高考选科), e.g. ['物理','化学','生物']. */
  subjects: string[];
  score: number;
  /** Optional known 位次 (overrides score→rank conversion when provided). */
  rank?: number;
  interests: string[];
  dreamUniversities: string[];
  dreamMajors: string[];
  /** Geography preferences. */
  preferredCityTiers: Array<1 | 2 | 3>;
  preferredRegions: string[];
  climate?: string;
  /** Include 中外合作/高收费 programs (cheap line, expensive tuition). Default false. */
  includeHighCost?: boolean;
  /** Free-text personal thoughts. */
  notes?: string;
}
