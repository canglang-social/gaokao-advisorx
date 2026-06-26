/**
 * Eval harness. Seeds an in-memory store from the mock source, then runs the
 * versioned case suite against the real domain logic. Reports pass/fail per case,
 * per-category metrics, and overall quality stats. Exits non-zero on any failure.
 *
 * Usage: pnpm eval
 */
import { getConfig } from '../lib/config';
import { MockFetcher } from '../lib/data/fetchers/mockSource';
import { runPipeline } from '../lib/data/pipeline';
import { MemoryStore } from '../lib/data/stores';
import { Repository } from '../lib/data/repository';
import { predictDarkHorses } from '../lib/domain/darkHorse';
import { matchUniversities } from '../lib/domain/matching';
import type { StudentProfile, Track } from '../lib/domain/types';
import { EVAL_CASES, EVAL_DATASET_VERSION, type EvalContext } from './cases';

async function main() {
  const cfg = getConfig();
  const repo = new Repository(new MemoryStore());
  await runPipeline(repo, new MockFetcher(), 'seed');
  const snapshot = await repo.load();

  const ctx: EvalContext = {
    snapshot,
    currentYear: cfg.currentYear,
    match: (profile: StudentProfile) => {
      const lines = snapshot.admissionLines.filter(
        (l) => l.province === profile.province && l.track === profile.track,
      );
      const rankTable = snapshot.rankTables.find(
        (t) =>
          t.province === profile.province &&
          t.track === profile.track &&
          t.year === cfg.currentYear,
      );
      return matchUniversities(
        { profile, universities: snapshot.universities, majors: snapshot.majors, admissionLines: lines, rankTable },
        { currentYear: cfg.currentYear, staleAfterDays: cfg.staleAfterDays },
      );
    },
    darkHorses: (combo?: { province: string; track: Track }) => {
      const c = combo ?? { province: '河北', track: '物理' as Track };
      const lines = snapshot.admissionLines.filter(
        (l) => l.province === c.province && l.track === c.track,
      );
      return predictDarkHorses(snapshot.universities, lines, {
        currentYear: cfg.currentYear,
        staleAfterDays: cfg.staleAfterDays,
      });
    },
  };

  console.log(`\n高考志愿填报 v0 — 评测数据集 ${EVAL_DATASET_VERSION} (${EVAL_CASES.length} 例)\n`);

  const perCategory: Record<string, { pass: number; total: number }> = {};
  let passed = 0;
  const failures: string[] = [];

  for (const c of EVAL_CASES) {
    perCategory[c.category] ??= { pass: 0, total: 0 };
    perCategory[c.category].total++;
    let result: { pass: boolean; detail: string };
    try {
      result = c.assert(ctx);
    } catch (err: any) {
      result = { pass: false, detail: `抛出异常: ${err?.message ?? err}` };
    }
    if (result.pass) {
      passed++;
      perCategory[c.category].pass++;
      console.log(`  ✅ [${c.category}] ${c.id} — ${result.detail}`);
    } else {
      failures.push(`${c.id}: ${result.detail}`);
      console.log(`  ❌ [${c.category}] ${c.id} — ${result.detail}`);
      console.log(`       说明: ${c.description}`);
    }
  }

  console.log('\n— 分类指标 —');
  for (const [cat, s] of Object.entries(perCategory)) {
    const rate = ((s.pass / s.total) * 100).toFixed(1);
    console.log(`  ${cat}: ${s.pass}/${s.total} (${rate}%)`);
  }

  // Quality metrics beyond pass/fail.
  const sample = ctx.match({
    province: '河北',
    track: '物理',
    score: 620,
    subjectScheme: '3+1+2',
    subjects: ['物理', '化学', '生物'],
    interests: [],
    dreamUniversities: [],
    dreamMajors: [],
    preferredCityTiers: [],
    preferredRegions: [],
  });
  console.log('\n— 质量指标（样例：河北物理 620 分）—');
  console.log(
    `  推荐总数=${sample.tiers.reach.length + sample.tiers.match.length + sample.tiers.safety.length}` +
      ` 冲=${sample.tiers.reach.length} 稳=${sample.tiers.match.length} 保=${sample.tiers.safety.length}` +
      ` 位次=${sample.studentRank}`,
  );

  const overall = ((passed / EVAL_CASES.length) * 100).toFixed(1);
  console.log(`\n总计: ${passed}/${EVAL_CASES.length} 通过 (${overall}%)\n`);

  if (failures.length > 0) {
    console.error('失败用例:');
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[eval] runner crashed:', err);
  process.exit(1);
});
