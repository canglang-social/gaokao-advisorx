/**
 * Real-data verification harness for 山东 (the "is our result right?" check).
 *
 * Unlike `pnpm eval` (engine logic on mock data), this validates the REAL pipeline:
 *   raw official file → parse → CSV → store → matching.
 *
 * Three layers:
 *   A. ANCHORS   — hardcoded OFFICIAL values you can personally verify on sdzk.cn.
 *                  If a parser/data drift breaks faithfulness, these fail.
 *   B. INTEGRITY — invariants that must hold for any correct dataset
 *                  (monotonic 一分一段, referential integrity, valid ranges).
 *   C. ENGINE    — sanity of tiers/probabilities on the real data.
 *
 * Ground truth for A is the official 山东省教育招生考试院 (sdzk.cn) 2025 data.
 * Outcome truth ("did the student actually get in") needs post-admission tracking.
 *
 * Usage: pnpm verify
 */
import { RealFetcher } from '../lib/data/fetchers/realSource';
import { runPipeline } from '../lib/data/pipeline';
import { MemoryStore } from '../lib/data/stores';
import { Repository } from '../lib/data/repository';
import { matchUniversities, type Recommendation } from '../lib/domain/matching';
import type { StudentProfile } from '../lib/domain/types';

/**
 * OFFICIAL ANCHORS — 山东 2025 普通类(综合). Verify these yourself at sdzk.cn:
 *   一分一段表: https://www.sdzk.cn  (2025年夏季高考文化成绩一分一段表, 全体累计人数)
 *   分数线:     普通类 特殊类型 521 / 一段 441 / 二段 150
 * If you find a discrepancy, the data is wrong — fix the source, not the test.
 */
const ANCHOR_RANK: Array<[score: number, cumulative: number]> = [
  [692, 54],
  [650, 3621],
  [600, 25061],
  [550, 82928],
  [150, 681127],
];
const ANCHOR_LINES: Array<[batch: string, score: number]> = [
  ['特殊类型招生控制线', 521],
  ['一段线', 441],
  ['二段线', 150],
];

let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function mkProfile(score: number): StudentProfile {
  return {
    province: '山东', track: '综合', subjectScheme: '3+3', subjects: [],
    score, interests: [], dreamUniversities: [], dreamMajors: [],
    preferredCityTiers: [], preferredRegions: [],
  };
}

async function main() {
  console.log('\n山东真实数据校验 (ground truth: 山东省教育招生考试院 sdzk.cn 2025)\n');

  const repo = new Repository(new MemoryStore());
  await runPipeline(repo, new RealFetcher('data/sources'), 'manual');
  const snap = await repo.load();

  const rankTable = snap.rankTables.find((t) => t.id === '山东:2025:综合');
  const sdLines = snap.provincialLines.filter((l) => l.province === '山东' && l.track === '综合');
  const sdAdm = snap.admissionLines.filter((l) => l.province === '山东' && l.track === '综合');
  const uniById = new Map(snap.universities.map((u) => [u.id, u]));

  // ── A. ANCHORS (official, user-verifiable) ───────────────────────────────────
  console.log('— A. 官方锚点 (可在 sdzk.cn 自行核对) —');
  check('一分一段表存在', !!rankTable);
  for (const [score, cum] of ANCHOR_RANK) {
    const b = rankTable?.buckets.find((x) => x.score === score);
    check(`一分一段 ${score}分→累计`, b?.cumulativeRank === cum, `期望${cum}, 实际${b?.cumulativeRank}`);
  }
  for (const [batch, score] of ANCHOR_LINES) {
    const l = sdLines.find((x) => x.batch === batch);
    check(`分数线 ${batch}`, l?.minScore === score, `期望${score}, 实际${l?.minScore}`);
  }

  // ── B. INTEGRITY invariants ──────────────────────────────────────────────────
  console.log('\n— B. 数据完整性 —');
  // 一分一段 strictly monotonic: higher score ⇒ strictly smaller cumulative rank.
  const buckets = [...(rankTable?.buckets ?? [])].sort((a, b) => b.score - a.score);
  let mono = buckets.length > 400;
  for (let i = 1; i < buckets.length; i++) {
    if (!(buckets[i].cumulativeRank > buckets[i - 1].cumulativeRank)) mono = false;
  }
  check('一分一段单调 (分↓⇒位次↑)', mono, `${buckets.length} 段`);

  check('院校数量充足', snap.universities.length >= 1000, `${snap.universities.length} 所`);
  check('投档线数量充足', sdAdm.length >= 1000, `${sdAdm.length} 条`);

  const maxCum = buckets[buckets.length - 1]?.cumulativeRank ?? Infinity;
  const orphan = sdAdm.filter((l) => !uniById.has(l.universityId));
  check('投档线均关联到存在院校 (无孤儿)', orphan.length === 0, `孤儿 ${orphan.length}`);
  const badScore = sdAdm.filter((l) => !(l.minScore >= 150 && l.minScore <= 750));
  check('投档最低分在 [150,750]', badScore.length === 0, `越界 ${badScore.length}`);
  const badRank = sdAdm.filter((l) => l.minRank !== undefined && !(l.minRank >= 1 && l.minRank <= maxCum));
  check('投档最低位次在 [1, 总人数]', badRank.length === 0, `越界 ${badRank.length}`);

  // CONVERSION consistency: minScore must equal rankToScore(minRank) on the real table.
  let convOk = 0;
  let convBad = 0;
  for (const l of sdAdm.slice(0, 200)) {
    if (l.minRank === undefined) continue;
    const expected = rankToScoreLocal(l.minRank, buckets);
    if (expected !== null && Math.abs(expected - l.minScore) <= 1) convOk++;
    else convBad++;
  }
  check('位次→分数换算自洽 (抽样200)', convBad === 0, `通过${convOk} 异常${convBad}`);

  // ── C. ENGINE sanity on real data ────────────────────────────────────────────
  console.log('\n— C. 引擎合理性 (真实数据) —');
  // Pick a real school with a mid-range line to test tier movement + monotonic prob.
  const target = sdAdm
    .filter((l) => l.minScore >= 580 && l.minScore <= 600)
    .sort((a, b) => a.minScore - b.minScore)[0];
  if (!target) {
    check('找到测试用院校', false);
  } else {
    const L = target.minScore;
    const findRec = (score: number): Recommendation | undefined => {
      const m = matchUniversities(
        { profile: mkProfile(score), universities: snap.universities, majors: snap.majors, admissionLines: sdAdm, rankTable },
        { currentYear: 2025, staleAfterDays: 30 },
      );
      return [...m.tiers.reach, ...m.tiers.match, ...m.tiers.safety].find(
        (r) => r.universityId === target.universityId,
      );
    };
    const atLine = findRec(L);
    const above = findRec(L + 12);
    const well = findRec(L + 35);
    const uniName = uniById.get(target.universityId)?.name;
    check('线上同分→冲档', atLine?.tier === 'reach', `${uniName}@${L} → ${atLine?.tier}`);
    check('高 12 分→稳档', above?.tier === 'match', `→ ${above?.tier}`);
    check('高 35 分→保档', well?.tier === 'safety', `→ ${well?.tier}`);
    check(
      '录取概率随分数单调',
      (atLine?.admitProbability ?? 0) <= (above?.admitProbability ?? 0) &&
        (above?.admitProbability ?? 0) <= (well?.admitProbability ?? 0),
      `${atLine?.admitProbability}→${above?.admitProbability}→${well?.admitProbability}`,
    );
  }
  // Cap applied via service is separate; here assert tiers are sorted by fit.
  const m600 = matchUniversities(
    { profile: mkProfile(600), universities: snap.universities, majors: snap.majors, admissionLines: sdAdm, rankTable },
    { currentYear: 2025, staleAfterDays: 30 },
  );
  const sortedDesc = (recs: Recommendation[]) =>
    recs.every((r, i) => i === 0 || recs[i - 1].admitProbability + recs[i - 1].preferenceBonus / 100 >= r.admitProbability + r.preferenceBonus / 100 - 1e-6);
  check('稳档按匹配度排序', sortedDesc(m600.tiers.match));

  // ── Spot-check printout for human eyeballing against sdzk.cn ──────────────────
  console.log('\n— 人工抽查 (对照官方投档表) —');
  for (const name of ['北京大学', '山东大学', '中国海洋大学', '青岛大学', '济南大学']) {
    const line = sdAdm
      .map((l) => ({ l, u: uniById.get(l.universityId) }))
      .find((x) => x.u?.name === name);
    if (line) {
      console.log(`  ${name}: 最低投档线≈${line.l.minScore}分 / 位次${line.l.minRank}  [${line.u?.tags.join('/') || '双非'}]`);
    }
  }

  const total = pass + failures.length;
  console.log(`\n总计: ${pass}/${total} 通过`);
  if (failures.length) {
    console.error('\n失败:');
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log('真实山东数据校验通过 ✓\n');
}

/** Local rank→score over sorted-desc buckets (mirrors rankConversion, no table object). */
function rankToScoreLocal(rank: number, bucketsDesc: { score: number; cumulativeRank: number }[]): number | null {
  if (bucketsDesc.length === 0) return null;
  const asc = [...bucketsDesc].sort((a, b) => a.cumulativeRank - b.cumulativeRank);
  if (rank <= asc[0].cumulativeRank) return asc[0].score;
  const last = asc[asc.length - 1];
  if (rank >= last.cumulativeRank) return last.score;
  for (let i = 0; i < asc.length - 1; i++) {
    const lo = asc[i];
    const hi = asc[i + 1];
    if (rank >= lo.cumulativeRank && rank <= hi.cumulativeRank) {
      const span = hi.cumulativeRank - lo.cumulativeRank || 1;
      const t = (rank - lo.cumulativeRank) / span;
      return Math.round(lo.score + t * (hi.score - lo.score));
    }
  }
  return last.score;
}

main().catch((err) => {
  console.error('[verify] crashed:', err);
  process.exit(1);
});
