import { getConfig } from '../config';
import { createFetcher } from '../data/fetchers';
import { computeFreshness, freshnessBadge } from '../data/freshness';
import { runPipeline } from '../data/pipeline';
import { createRepository } from '../data/stores';
import type { Repository } from '../data/repository';
import { predictDarkHorses, type DarkHorse } from '../domain/darkHorse';
import { matchUniversities, type MatchResult } from '../domain/matching';
import type { Freshness, StudentProfile, TransferPolicy, Track } from '../domain/types';

/** Default fallback profile (used by dark-horse banner when no profile is set). */
export const DEFAULT_DARK_HORSE_COMBO = { province: '河北', track: '物理' as Track };

let seededOnce = false;

/**
 * Ensure the store has data. On first run (empty store) this seeds it via the
 * pipeline so `pnpm dev` works with zero manual setup. Idempotent within a process.
 */
export async function ensureData(repo: Repository): Promise<void> {
  if (seededOnce) return;
  const meta = await repo.getMeta();
  if (meta.lastRunAt === null) {
    await runPipeline(repo, createFetcher(), 'seed');
  }
  seededOnce = true;
}

/** Shared repository instance for the app runtime. */
export function getRepository(): Repository {
  return createRepository();
}

/**
 * Compute 冲/稳/保 recommendations for a profile.
 *
 * `limitPerTier` caps each tier (real datasets can yield 1000+ safety schools —
 * the engine already sorts by fit, so we keep the top N). Set to 0 for no cap.
 */
export async function getRecommendations(
  repo: Repository,
  profile: StudentProfile,
  limitPerTier = 40,
): Promise<MatchResult> {
  const cfg = getConfig();
  await ensureData(repo);
  const snapshot = await repo.load();
  const admissionLines = snapshot.admissionLines.filter(
    (l) => l.province === profile.province && l.track === profile.track,
  );
  const rankTable = snapshot.rankTables.find(
    (t) => t.province === profile.province && t.track === profile.track && t.year === cfg.currentYear,
  );
  const result = matchUniversities(
    {
      profile,
      universities: snapshot.universities,
      majors: snapshot.majors,
      admissionLines,
      rankTable,
    },
    { currentYear: cfg.currentYear, staleAfterDays: cfg.staleAfterDays },
  );

  // Record pre-cap counts so the UI can show "前40 / 共N" and point to 院校查询.
  result.tierCounts = {
    reach: result.tiers.reach.length,
    match: result.tiers.match.length,
    safety: result.tiers.safety.length,
  };
  if (limitPerTier > 0) {
    result.tiers = {
      reach: result.tiers.reach.slice(0, limitPerTier),
      match: result.tiers.match.slice(0, limitPerTier),
      safety: result.tiers.safety.slice(0, limitPerTier),
    };
  }
  return result;
}

/** Compute the 黑马 list for a province/track (defaults to the profile's combo). */
export async function getDarkHorses(
  repo: Repository,
  combo?: { province: string; track: Track },
  limit = 5,
): Promise<DarkHorse[]> {
  const cfg = getConfig();
  await ensureData(repo);
  const snapshot = await repo.load();
  const target = combo ?? DEFAULT_DARK_HORSE_COMBO;
  let lines = snapshot.admissionLines.filter(
    (l) => l.province === target.province && l.track === target.track,
  );
  // Fall back to the default combo if the requested one has no data.
  if (lines.length === 0) {
    lines = snapshot.admissionLines.filter(
      (l) =>
        l.province === DEFAULT_DARK_HORSE_COMBO.province &&
        l.track === DEFAULT_DARK_HORSE_COMBO.track,
    );
  }
  return predictDarkHorses(snapshot.universities, lines, {
    currentYear: cfg.currentYear,
    staleAfterDays: cfg.staleAfterDays,
    limit,
  });
}

export interface UniversityLineRow {
  year: number;
  minScore: number;
  minRank?: number;
  source: string;
  freshness: Freshness & { badge: ReturnType<typeof freshnessBadge> };
}

export interface UniversitySearchHit {
  id: string;
  name: string;
  city: string;
  province: string;
  region: string;
  tags: string[];
  transfer: TransferPolicy;
  /** Admission lines for the queried applicant province + track, newest year first. */
  lines: UniversityLineRow[];
  /** Major names offered (for display); may be empty. */
  majors: string[];
  majorCount: number;
}

/**
 * Look up universities by name and return their 投档线 for a given applicant
 * province + track (default 山东·综合). This is the "search a school's score" path.
 */
export async function searchUniversities(
  repo: Repository,
  opts: { q: string; province?: string; track?: Track; limit?: number },
): Promise<UniversitySearchHit[]> {
  const cfg = getConfig();
  await ensureData(repo);
  const q = opts.q.trim();
  if (!q) return [];
  const province = opts.province ?? '山东';
  const track = opts.track ?? '综合';
  const limit = opts.limit ?? 30;
  const fopts = { currentYear: cfg.currentYear, staleAfterDays: cfg.staleAfterDays };

  const snap = await repo.load();
  const matches = snap.universities.filter((u) => u.name.includes(q)).slice(0, limit);

  return matches.map((u) => {
    const lines = snap.admissionLines
      .filter((l) => l.universityId === u.id && l.province === province && l.track === track)
      .sort((a, b) => b.year - a.year)
      .map((l) => {
        const f = computeFreshness(l, fopts);
        return {
          year: l.year,
          minScore: l.minScore,
          minRank: l.minRank,
          source: l.source,
          freshness: { ...f, badge: freshnessBadge(f) },
        };
      });
    const majors = snap.majors.filter((m) => m.universityId === u.id).map((m) => m.name);
    return {
      id: u.id,
      name: u.name,
      city: u.city,
      province: u.province,
      region: u.region,
      tags: u.tags,
      transfer: u.transfer,
      lines,
      majors,
      majorCount: majors.length,
    };
  });
}
