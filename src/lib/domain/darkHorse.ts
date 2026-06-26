import type {
  AdmissionLine,
  Freshness,
  Track,
  University,
} from './types';
import { computeFreshness, freshnessBadge } from '../data/freshness';

export interface DarkHorse {
  universityId: string;
  universityName: string;
  city: string;
  province: string;
  tags: string[];
  track: Track;
  latestYear: number;
  latestScore: number;
  /** Score change over the available window (latest - earliest). Negative = 下行. */
  trend: number;
  /** Naive next-year prediction (latest + half of the per-year trend). */
  predictedScore: number;
  /** A heuristic 0..100 "黑马指数". Higher = stronger value/under-pricing signal. */
  darkHorseIndex: number;
  rationale: string;
  freshness: Freshness & { badge: ReturnType<typeof freshnessBadge> };
}

export interface DarkHorseOptions {
  currentYear: number;
  staleAfterDays: number;
  now?: Date;
  limit?: number;
}

/**
 * 黑马预测 (dark-horse prediction).
 *
 * Heuristic: among prestigious schools (985/211/双一流), surface those whose
 * 投档线 is trending down and/or whose line is low relative to prestige (often
 * because the city is less attractive). These are "good school attainable at a
 * relatively low score" candidates.
 *
 * PURELY HEURISTIC — the UI must show the 预测有风险 disclaimer alongside output.
 */
export function predictDarkHorses(
  universities: University[],
  admissionLinesForCombo: AdmissionLine[], // already filtered to one province + track
  opts: DarkHorseOptions,
): DarkHorse[] {
  const track = admissionLinesForCombo[0]?.track ?? '物理';
  const out: DarkHorse[] = [];

  for (const uni of universities) {
    const prestigious =
      uni.tags.includes('985') || uni.tags.includes('211') || uni.tags.includes('双一流');
    if (!prestigious) continue;

    const lines = admissionLinesForCombo
      .filter((l) => l.universityId === uni.id)
      .sort((a, b) => a.year - b.year);
    if (lines.length < 2) continue;

    const earliest = lines[0];
    const latest = lines[lines.length - 1];
    const years = latest.year - earliest.year || 1;
    const trend = latest.minScore - earliest.minScore;
    const trendPerYear = trend / years;
    const predictedScore = Math.round(latest.minScore + trendPerYear * 0.5);

    // Index: falling lines (negative trend) and prestige-in-weaker-city both add value.
    let index = 0;
    if (trend < 0) index += Math.min(40, -trend * 4); // each falling point counts
    if (uni.tags.includes('985')) index += 30;
    else if (uni.tags.includes('211') || uni.tags.includes('双一流')) index += 18;
    if (uni.cityTier >= 2) index += 20; // weaker city → underpriced
    index = Math.min(100, Math.round(index));

    // Only surface genuine candidates: either a clear downtrend or prestige-in-weaker-city.
    const isCandidate = trend <= -3 || (uni.tags.includes('985') && uni.cityTier >= 2);
    if (!isCandidate) continue;

    const fresh = computeFreshness(latest, opts);
    const tierTag = uni.tags.includes('985') ? '985' : '211/双一流';
    const cityNote = uni.cityTier >= 2 ? `地处${uni.city}，区位压低分数线` : '';
    const trendNote =
      trend < 0 ? `近年投档线下行约 ${-trend} 分` : '分数相对其层次偏低';
    out.push({
      universityId: uni.id,
      universityName: uni.name,
      city: uni.city,
      province: uni.province,
      tags: uni.tags,
      track,
      latestYear: latest.year,
      latestScore: latest.minScore,
      trend,
      predictedScore,
      darkHorseIndex: index,
      rationale: `${tierTag}名校，${[cityNote, trendNote].filter(Boolean).join('，')}，疑似“低分高校”机会。`,
      freshness: { ...fresh, badge: freshnessBadge(fresh) },
    });
  }

  out.sort((a, b) => b.darkHorseIndex - a.darkHorseIndex);
  return out.slice(0, opts.limit ?? 5);
}

export const DARK_HORSE_DISCLAIMER = '预测有风险,仅供参考,不可轻信。';
