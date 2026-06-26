import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  AdmissionLine,
  Major,
  ProvincialScoreLine,
  RankTable,
  Track,
  University,
} from '../../domain/types';
import type { DataFetcher } from './types';

/**
 * REAL DATA SOURCE (scaffold).
 *
 * Reads downloaded official files from `dataSourceDir` (default `data/sources/`)
 * and maps them into domain records. v0 ships ONE worked example —
 * `provincial-lines.csv` → ProvincialScoreLine — to demonstrate the full path
 * (parse → normalize → natural-key id → timestamp). The other collections are
 * intentionally left as TODO stubs returning [] so you can fill them in
 * incrementally (one province / one collection at a time).
 *
 * How to extend a collection:
 *   1. Download the official file (CSV/Excel/PDF) into `data/sources/`.
 *   2. Parse it (CSV via the helper below; Excel via `xlsx`; PDF via `pdf-parse`;
 *      HTML tables via `cheerio` — add the dep when you need it).
 *   3. Map each row to the domain type, set a natural-key `id`, `year`, and
 *      `lastUpdatedAt = new Date().toISOString()`.
 *
 * ⚠️ Compliance: only ingest official / authorized data; respect robots.txt and
 * each province's data-use terms; rate-limit and cache any network fetches.
 */
export class RealFetcher implements DataFetcher {
  readonly name = 'real';
  private dir: string;

  constructor(dataSourceDir = 'data/sources') {
    this.dir = path.isAbsolute(dataSourceDir)
      ? dataSourceDir
      : path.join(process.cwd(), dataSourceDir);
  }

  /** WORKED EXAMPLE: 各省批次线 from `provincial-lines.csv`. */
  async fetchProvincialLines(): Promise<ProvincialScoreLine[]> {
    const rows = await this.readCsv('provincial-lines.csv');
    if (rows.length === 0) {
      console.warn(
        `[RealFetcher] no provincial-lines.csv in ${this.dir} — returning []. ` +
          `Drop the official file there to ingest real 批次线.`,
      );
      return [];
    }
    const now = new Date().toISOString();
    return rows.map((r) => {
      const province = String(r.province ?? '').trim();
      const year = Number(r.year);
      const track = String(r.track ?? '').trim() as Track;
      const batch = String(r.batch ?? '').trim();
      return {
        id: `${province}:${year}:${track}:${batch}`,
        province,
        year,
        track,
        batch,
        minScore: Number(r.minScore),
        source: String(r.source ?? 'real:csv').trim(),
        lastUpdatedAt: now,
      } satisfies ProvincialScoreLine;
    });
  }

  /**
   * WORKED EXAMPLE: 一分一段表 from `rank-tables.csv` in LONG format
   * (one row per score bucket), grouped into RankTable by province/year/track.
   */
  async fetchRankTables(): Promise<RankTable[]> {
    const rows = await this.readCsv('rank-tables.csv');
    const now = new Date().toISOString();
    const byKey = new Map<string, RankTable>();
    for (const r of rows) {
      const province = String(r.province ?? '').trim();
      const year = Number(r.year);
      const track = String(r.track ?? '').trim() as Track;
      const id = `${province}:${year}:${track}`;
      let table = byKey.get(id);
      if (!table) {
        table = {
          id,
          province,
          year,
          track,
          buckets: [],
          source: String(r.source ?? 'real:csv').trim(),
          lastUpdatedAt: now,
        };
        byKey.set(id, table);
      }
      table.buckets.push({ score: Number(r.score), cumulativeRank: Number(r.cumulativeRank) });
    }
    // Buckets sorted descending by score (best first) for the conversion helper.
    for (const t of byKey.values()) t.buckets.sort((a, b) => b.score - a.score);
    return [...byKey.values()];
  }

  /** WORKED EXAMPLE: 院校库 from `universities.csv`. List fields use `|` separators. */
  async fetchUniversities(): Promise<University[]> {
    const rows = await this.readCsv('universities.csv');
    const now = new Date().toISOString();
    return rows.map((r) => {
      const tier = Number(r.cityTier);
      return {
        id: String(r.id ?? '').trim(),
        name: String(r.name ?? '').trim(),
        city: String(r.city ?? '').trim(),
        province: String(r.province ?? '').trim(),
        cityTier: (tier === 1 || tier === 2 || tier === 3 ? tier : 3) as 1 | 2 | 3,
        region: String(r.region ?? '').trim(),
        tags: splitList(r.tags),
        faculty: {
          summary: String(r.facultySummary ?? '').trim(),
          keyDisciplines: splitList(r.keyDisciplines),
          rating: r.facultyRating?.trim() || undefined,
        },
        environment: {
          campus: String(r.envCampus ?? '').trim(),
          teaching: String(r.envTeaching ?? '').trim(),
          dormitory: String(r.envDormitory ?? '').trim(),
        },
        transfer: {
          difficulty: normalizeDifficulty(r.transferDifficulty),
          policy: String(r.transferPolicy ?? '').trim(),
        },
        lastUpdatedAt: now,
      } satisfies University;
    });
  }

  /** WORKED EXAMPLE: 专业 from `majors.csv`. requiredSubjects uses `|` separators. */
  async fetchMajors(): Promise<Major[]> {
    const rows = await this.readCsv('majors.csv');
    const now = new Date().toISOString();
    return rows.map((r) => {
      const universityId = String(r.universityId ?? '').trim();
      const name = String(r.name ?? '').trim();
      const minScore = r.minScore?.trim();
      const minRank = r.minRank?.trim();
      return {
        id: `${universityId}:${name}`,
        universityId,
        name,
        category: String(r.category ?? '').trim(),
        facultyStrength: String(r.facultyStrength ?? '').trim(),
        employmentOutlook: String(r.employmentOutlook ?? '').trim(),
        requiredSubjects: splitList(r.requiredSubjects),
        minScore: minScore ? Number(minScore) : undefined,
        minRank: minRank ? Number(minRank) : undefined,
        lastUpdatedAt: now,
      } satisfies Major;
    });
  }

  /** WORKED EXAMPLE: 院校投档线 from `admission-lines.csv` (university-level). */
  async fetchAdmissionLines(): Promise<AdmissionLine[]> {
    const rows = await this.readCsv('admission-lines.csv');
    const now = new Date().toISOString();
    return rows.map((r) => {
      const universityId = String(r.universityId ?? '').trim();
      const province = String(r.province ?? '').trim();
      const year = Number(r.year);
      const track = String(r.track ?? '').trim() as Track;
      const rank = r.minRank?.trim();
      return {
        id: `${universityId}:_:${province}:${year}:${track}`,
        universityId,
        province,
        year,
        track,
        minScore: Number(r.minScore),
        minRank: rank ? Number(rank) : undefined,
        source: String(r.source ?? 'real:csv').trim(),
        lastUpdatedAt: now,
      } satisfies AdmissionLine;
    });
  }

  /** Read a CSV file from the source dir into row objects keyed by header. */
  private async readCsv(file: string): Promise<Record<string, string>[]> {
    let raw: string;
    try {
      raw = await fs.readFile(path.join(this.dir, file), 'utf8');
    } catch (err: any) {
      if (err?.code === 'ENOENT') return [];
      throw err;
    }
    return parseCsv(raw);
  }
}

/** Split a `|`-separated list cell into a trimmed string array. */
function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Map a free-text transfer-difficulty cell to the domain enum (defaults to moderate). */
function normalizeDifficulty(
  value: string | undefined,
): 'easy' | 'moderate' | 'hard' | 'restricted' {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'easy' || v === 'moderate' || v === 'hard' || v === 'restricted') return v;
  return 'moderate';
}

/**
 * Minimal RFC-4180-ish CSV parser (handles quoted fields, embedded commas,
 * escaped quotes, CRLF, BOM). Good enough for official tabular exports; swap for
 * a library if you hit exotic files.
 */
export function parseCsv(input: string): Record<string, string>[] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
  }

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? '').trim();
    });
    return obj;
  });
}
