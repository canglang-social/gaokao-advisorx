import type {
  AdmissionLine,
  DataSnapshot,
  Major,
  PipelineMeta,
  ProvincialScoreLine,
  RankTable,
  Track,
  University,
} from '../domain/types';

/**
 * The swappable persistence seam. Implementations: JSON file, in-memory, (future) SQLite.
 * This is the single boundary the rest of the app depends on for storage.
 */
export interface DataStore {
  read(): Promise<DataSnapshot>;
  write(snapshot: DataSnapshot): Promise<void>;
}

export function emptyMeta(): PipelineMeta {
  return {
    lastRunAt: null,
    lastRunSource: null,
    counts: {
      provincialLines: 0,
      rankTables: 0,
      universities: 0,
      majors: 0,
      admissionLines: 0,
    },
  };
}

export function emptySnapshot(): DataSnapshot {
  return {
    provincialLines: [],
    rankTables: [],
    universities: [],
    majors: [],
    admissionLines: [],
    meta: emptyMeta(),
  };
}

/**
 * Repository / DAO. Wraps a DataStore and exposes typed queries + upserts.
 * Query logic lives here once, independent of the underlying driver.
 */
export class Repository {
  constructor(private store: DataStore) {}

  load(): Promise<DataSnapshot> {
    return this.store.read();
  }

  save(snapshot: DataSnapshot): Promise<void> {
    return this.store.write(snapshot);
  }

  async getMeta(): Promise<PipelineMeta> {
    return (await this.store.read()).meta;
  }

  async getUniversities(): Promise<University[]> {
    return (await this.store.read()).universities;
  }

  async getUniversity(id: string): Promise<University | undefined> {
    return (await this.store.read()).universities.find((u) => u.id === id);
  }

  async getMajors(filter?: { universityId?: string }): Promise<Major[]> {
    const majors = (await this.store.read()).majors;
    if (!filter?.universityId) return majors;
    return majors.filter((m) => m.universityId === filter.universityId);
  }

  async getProvincialLines(filter?: {
    province?: string;
    year?: number;
    track?: Track;
  }): Promise<ProvincialScoreLine[]> {
    let rows = (await this.store.read()).provincialLines;
    if (filter?.province) rows = rows.filter((r) => r.province === filter.province);
    if (filter?.year !== undefined) rows = rows.filter((r) => r.year === filter.year);
    if (filter?.track) rows = rows.filter((r) => r.track === filter.track);
    return rows;
  }

  async getRankTables(filter?: {
    province?: string;
    year?: number;
    track?: Track;
  }): Promise<RankTable[]> {
    let rows = (await this.store.read()).rankTables;
    if (filter?.province) rows = rows.filter((r) => r.province === filter.province);
    if (filter?.year !== undefined) rows = rows.filter((r) => r.year === filter.year);
    if (filter?.track) rows = rows.filter((r) => r.track === filter.track);
    return rows;
  }

  async getAdmissionLines(filter?: {
    province?: string;
    universityId?: string;
    year?: number;
    track?: Track;
  }): Promise<AdmissionLine[]> {
    let rows = (await this.store.read()).admissionLines;
    if (filter?.province) rows = rows.filter((r) => r.province === filter.province);
    if (filter?.universityId) rows = rows.filter((r) => r.universityId === filter.universityId);
    if (filter?.year !== undefined) rows = rows.filter((r) => r.year === filter.year);
    if (filter?.track) rows = rows.filter((r) => r.track === filter.track);
    return rows;
  }
}
