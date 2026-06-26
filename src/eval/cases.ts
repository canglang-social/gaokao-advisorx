/**
 * Versioned evaluation dataset (v1).
 *
 * Each case pairs a (student profile + question/property) with an assertion over
 * the engine's output. Covers: multiple provinces, score bands, risk framings,
 * edge cases (压线 / 数据缺失 / 顶尖分数), dark-horse detection, and retrieval
 * grounding for the data module.
 */
import type { DataSnapshot, StudentProfile, Track } from '../lib/domain/types';
import type { MatchResult, Recommendation } from '../lib/domain/matching';
import type { DarkHorse } from '../lib/domain/darkHorse';
import { scoreToRank } from '../lib/domain/rankConversion';
import { DEFAULT_PROFILE } from '../lib/profile/defaults';

export const EVAL_DATASET_VERSION = 'v1';

export interface EvalContext {
  snapshot: DataSnapshot;
  currentYear: number;
  match: (profile: StudentProfile) => MatchResult;
  darkHorses: (combo?: { province: string; track: Track }) => DarkHorse[];
}

export interface EvalCase {
  id: string;
  category: 'recommend' | 'retrieval' | 'darkhorse';
  description: string;
  profile?: StudentProfile;
  question?: string;
  assert: (ctx: EvalContext) => { pass: boolean; detail: string };
}

function mkProfile(p: Partial<StudentProfile>): StudentProfile {
  return { ...DEFAULT_PROFILE, ...p };
}

/** Find a recommendation across all tiers by university name. */
function findRec(m: MatchResult, name: string): Recommendation | undefined {
  return [...m.tiers.reach, ...m.tiers.match, ...m.tiers.safety].find(
    (r) => r.universityName === name,
  );
}
function total(m: MatchResult): number {
  return m.tiers.reach.length + m.tiers.match.length + m.tiers.safety.length;
}
function ok(detail: string) {
  return { pass: true, detail };
}
function bad(detail: string) {
  return { pass: false, detail };
}

export const EVAL_CASES: EvalCase[] = [
  // ── Recommendation cases ─────────────────────────────────────────────────────
  {
    id: 'R1-hebei-high-660',
    category: 'recommend',
    description: '河北物理 660 分 → 冲/稳/保三档均非空，上海交通大学应在“冲”。',
    profile: mkProfile({ province: '河北', track: '物理', score: 660 }),
    question: '高分段三档梯度是否合理？',
    assert: (ctx) => {
      const m = ctx.match(ctx_profile('R1'));
      const sjtu = findRec(m, '上海交通大学');
      const nonEmpty = m.tiers.reach.length && m.tiers.match.length && m.tiers.safety.length;
      if (!nonEmpty) return bad(`存在空档: ${JSON.stringify(tierCounts(m))}`);
      if (sjtu?.tier !== 'reach') return bad(`上交档位=${sjtu?.tier ?? '缺失'}（期望 reach）`);
      return ok(`三档非空且上交=冲 (${JSON.stringify(tierCounts(m))})`);
    },
  },
  {
    id: 'R2-hebei-620-tiers',
    category: 'recommend',
    description: '河北物理 620 分 → 哈工大=稳、兰州大学=保、北邮出现在“冲”。',
    profile: mkProfile({ province: '河北', track: '物理', score: 620, dreamUniversities: [] }),
    question: '中高分段院校分档是否正确？',
    assert: (ctx) => {
      const m = ctx.match(mkProfile({ province: '河北', track: '物理', score: 620, dreamUniversities: [] }));
      const hit = findRec(m, '哈尔滨工业大学');
      const lzu = findRec(m, '兰州大学');
      const bupt = findRec(m, '北京邮电大学');
      if (hit?.tier !== 'match') return bad(`哈工大档位=${hit?.tier}`);
      if (lzu?.tier !== 'safety') return bad(`兰大档位=${lzu?.tier}`);
      if (bupt?.tier !== 'reach') return bad(`北邮档位=${bupt?.tier}`);
      return ok('哈工大=稳, 兰大=保, 北邮=冲');
    },
  },
  {
    id: 'R3-hebei-top-700',
    category: 'recommend',
    description: '河北物理 700 分（顶尖）→ 清华在“稳”，“冲”档为空，稳/保非空。',
    profile: mkProfile({ province: '河北', track: '物理', score: 700 }),
    question: '极高分如何分档（边界情形）？',
    assert: (ctx) => {
      const m = ctx.match(mkProfile({ province: '河北', track: '物理', score: 700 }));
      const thu = findRec(m, '清华大学');
      if (m.tiers.reach.length !== 0) return bad(`冲档应为空，实际 ${m.tiers.reach.length}`);
      if (!m.tiers.match.length || !m.tiers.safety.length) return bad('稳/保不应为空');
      if (thu?.tier !== 'match') return bad(`清华档位=${thu?.tier}`);
      return ok('清华=稳, 冲空, 稳/保非空');
    },
  },
  {
    id: 'R4-hebei-underline-450',
    category: 'recommend',
    description: '河北物理 450 分（压线/远低于库内院校）→ 三档均空，优雅返回。',
    profile: mkProfile({ province: '河北', track: '物理', score: 450 }),
    question: '压线/超低分是否优雅处理（边界）？',
    assert: (ctx) => {
      const m = ctx.match(mkProfile({ province: '河北', track: '物理', score: 450 }));
      if (total(m) !== 0) return bad(`期望空结果，实际 ${total(m)}`);
      return ok('低分→三档为空（无越界推荐）');
    },
  },
  {
    id: 'R5-shandong-625',
    category: 'recommend',
    description: '山东综合 625 分 → 三档非空，位次可被换算（一分一段表存在）。',
    profile: mkProfile({ province: '山东', track: '综合', subjectScheme: '3+3', score: 625 }),
    question: '换省份（山东 3+3）是否正常出结果且有位次？',
    assert: (ctx) => {
      const m = ctx.match(
        mkProfile({ province: '山东', track: '综合', subjectScheme: '3+3', score: 625 }),
      );
      if (!m.tiers.reach.length || !m.tiers.match.length || !m.tiers.safety.length)
        return bad(`三档应非空: ${JSON.stringify(tierCounts(m))}`);
      if (m.studentRank === null) return bad('位次应被换算，实际为 null');
      return ok(`三档非空且位次=${m.studentRank}`);
    },
  },
  {
    id: 'R6-sichuan-640',
    category: 'recommend',
    description: '四川理科 640 分 → 三档非空，武汉大学应出现在“冲”。',
    profile: mkProfile({ province: '四川', track: '理科', subjectScheme: 'traditional', score: 640 }),
    question: '换省份（四川传统理科）是否正常？',
    assert: (ctx) => {
      const m = ctx.match(
        mkProfile({ province: '四川', track: '理科', subjectScheme: 'traditional', score: 640 }),
      );
      const whu = findRec(m, '武汉大学');
      if (!m.tiers.reach.length || !m.tiers.match.length || !m.tiers.safety.length)
        return bad(`三档应非空: ${JSON.stringify(tierCounts(m))}`);
      if (whu?.tier !== 'reach') return bad(`武大档位=${whu?.tier}`);
      return ok('四川理科三档非空且武大=冲');
    },
  },
  {
    id: 'R7-dream-boost-order',
    category: 'recommend',
    description: '意向院校加权：620 分且梦校=哈工大 → 哈工大排在“稳”档首位。',
    profile: mkProfile({
      province: '河北',
      track: '物理',
      score: 620,
      dreamUniversities: ['哈尔滨工业大学'],
    }),
    question: '地域/梦校偏好是否影响排序（不改档位）？',
    assert: (ctx) => {
      const m = ctx.match(
        mkProfile({
          province: '河北',
          track: '物理',
          score: 620,
          dreamUniversities: ['哈尔滨工业大学'],
        }),
      );
      const first = m.tiers.match[0]?.universityName;
      if (first !== '哈尔滨工业大学') return bad(`稳档首位=${first}（期望哈工大）`);
      return ok('梦校加权使哈工大排“稳”档首位');
    },
  },
  {
    id: 'R8-subject-fit',
    category: 'recommend',
    description: '选科匹配：选了物理/化学/生物 → 推荐中存在“选科匹配”的王牌专业。',
    profile: mkProfile({ province: '河北', track: '物理', score: 620 }),
    question: '是否标注选科匹配的专业？',
    assert: (ctx) => {
      const m = ctx.match(mkProfile({ province: '河北', track: '物理', score: 620 }));
      const hasFit = [...m.tiers.reach, ...m.tiers.match, ...m.tiers.safety].some((r) =>
        r.matchedMajors.some((mm) => mm.subjectFit),
      );
      return hasFit ? ok('存在选科匹配专业') : bad('未发现任何选科匹配专业');
    },
  },
  {
    id: 'R9-probability-monotonic',
    category: 'recommend',
    description: '单调性：同一院校在更高分下录取概率不低于更低分。',
    profile: mkProfile({ province: '河北', track: '物理', score: 640 }),
    question: '录取概率是否随分数单调？',
    assert: (ctx) => {
      const hi = findRec(ctx.match(mkProfile({ province: '河北', track: '物理', score: 640 })), '哈尔滨工业大学');
      const lo = findRec(ctx.match(mkProfile({ province: '河北', track: '物理', score: 600 })), '哈尔滨工业大学');
      if (!hi || !lo) return bad('两次匹配中哈工大缺失');
      if (hi.admitProbability < lo.admitProbability)
        return bad(`概率非单调: 高分${hi.admitProbability} < 低分${lo.admitProbability}`);
      return ok(`概率单调: 640→${hi.admitProbability} ≥ 600→${lo.admitProbability}`);
    },
  },
  {
    id: 'R10-missing-province-data',
    category: 'recommend',
    description: '数据缺失边界：广东物理（库中无投档线）→ 三档空且产生 dataGaps 提示。',
    profile: mkProfile({ province: '广东', track: '物理', score: 620 }),
    question: '缺数据省份是否优雅降级并提示？',
    assert: (ctx) => {
      const m = ctx.match(mkProfile({ province: '广东', track: '物理', score: 620 }));
      if (total(m) !== 0) return bad('无数据省份不应产生推荐');
      if (m.dataGaps.length === 0) return bad('应给出 dataGaps 提示');
      return ok(`空结果 + ${m.dataGaps.length} 条数据缺口提示`);
    },
  },

  // ── Dark-horse cases ─────────────────────────────────────────────────────────
  {
    id: 'D1-darkhorse-hit',
    category: 'darkhorse',
    description: '黑马：河北物理黑马列表应包含哈尔滨工业大学（985+下行）。',
    question: '是否识别出下行的 985 黑马？',
    assert: (ctx) => {
      const list = ctx.darkHorses({ province: '河北', track: '物理' });
      const hit = list.find((d) => d.universityName === '哈尔滨工业大学');
      return hit && hit.darkHorseIndex > 0
        ? ok(`命中哈工大, 指数=${hit.darkHorseIndex}`)
        : bad('未识别哈工大为黑马');
    },
  },
  {
    id: 'D2-darkhorse-lzu-ncu',
    category: 'darkhorse',
    description: '黑马：兰州大学与南昌大学（下行趋势）应入选。',
    question: '多个下行院校是否都被识别？',
    assert: (ctx) => {
      const names = ctx.darkHorses({ province: '河北', track: '物理' }).map((d) => d.universityName);
      const has = names.includes('兰州大学') && names.includes('南昌大学');
      return has ? ok('兰大、南昌大学均入选') : bad(`缺失，当前=${names.join('/')}`);
    },
  },
  {
    id: 'D3-darkhorse-prediction',
    category: 'darkhorse',
    description: '黑马预测：下行院校的预测线应不高于最新投档线，且带 freshness 徽章。',
    question: '预测与新鲜度元数据是否完整？',
    assert: (ctx) => {
      const hit = ctx
        .darkHorses({ province: '河北', track: '物理' })
        .find((d) => d.universityName === '哈尔滨工业大学');
      if (!hit) return bad('哈工大缺失');
      if (hit.predictedScore > hit.latestScore)
        return bad(`预测线${hit.predictedScore} > 最新${hit.latestScore}`);
      if (!hit.freshness?.badge) return bad('缺少 freshness 徽章');
      return ok(`预测线${hit.predictedScore} ≤ 最新${hit.latestScore}, 徽章=${hit.freshness.badge.label}`);
    },
  },
  {
    id: 'D4-darkhorse-excludes-nonkey',
    category: 'darkhorse',
    description: '黑马应排除非 985/211/双一流院校（深圳大学不应入选）。',
    question: '是否仅在重点院校中筛选？',
    assert: (ctx) => {
      const names = ctx.darkHorses({ province: '河北', track: '物理' }).map((d) => d.universityName);
      return names.includes('深圳大学') ? bad('误把深大列为黑马') : ok('正确排除深大（非重点标签）');
    },
  },

  // ── Retrieval-grounding cases (data module) ──────────────────────────────────
  {
    id: 'T1-provincial-2025-hebei',
    category: 'retrieval',
    description: '检索：河北·物理·2025·本科批控制线 = 445。',
    question: '当年批次线检索是否准确？',
    assert: (ctx) => {
      const r = ctx.snapshot.provincialLines.find((l) => l.id === '河北:2025:物理:本科批');
      return r?.minScore === 445 ? ok('445 ✓') : bad(`实际=${r?.minScore}`);
    },
  },
  {
    id: 'T2-provincial-prioryear-flag',
    category: 'retrieval',
    description: '新鲜度：河北·物理·2023 本科批应被标记为往年数据，分数=439。',
    question: '往年数据是否被正确标记？',
    assert: (ctx) => {
      const r = ctx.snapshot.provincialLines.find((l) => l.id === '河北:2023:物理:本科批');
      if (r?.minScore !== 439) return bad(`分数=${r?.minScore}`);
      if (r.year >= ctx.currentYear) return bad('年份未早于当前年');
      return ok('439 且年份<当前年（往年数据）');
    },
  },
  {
    id: 'T3-provincial-shandong',
    category: 'retrieval',
    description: '检索：山东·综合·2025·一段线 = 438。',
    question: '多省份批次线检索？',
    assert: (ctx) => {
      const r = ctx.snapshot.provincialLines.find((l) => l.id === '山东:2025:综合:一段线');
      return r?.minScore === 438 ? ok('438 ✓') : bad(`实际=${r?.minScore}`);
    },
  },
  {
    id: 'T4-provincial-sichuan',
    category: 'retrieval',
    description: '检索：四川·理科·2025·本科一批 = 525。',
    question: '传统文理批次线检索？',
    assert: (ctx) => {
      const r = ctx.snapshot.provincialLines.find((l) => l.id === '四川:2025:理科:本科一批');
      return r?.minScore === 525 ? ok('525 ✓') : bad(`实际=${r?.minScore}`);
    },
  },
  {
    id: 'T5-counts',
    category: 'retrieval',
    description: '数据完整性：院校=14 所，专业=28 个。',
    question: '种子数据规模是否正确？',
    assert: (ctx) => {
      const u = ctx.snapshot.universities.length;
      const mj = ctx.snapshot.majors.length;
      return u === 14 && mj === 28 ? ok('14 校 / 28 专业') : bad(`校=${u}, 专业=${mj}`);
    },
  },
  {
    id: 'T6-admission-latest-rank',
    category: 'retrieval',
    description: '检索：清华·河北物理 最新投档线年份=2025 且含最低位次。',
    question: '最新投档线与位次是否可检索？',
    assert: (ctx) => {
      const lines = ctx.snapshot.admissionLines
        .filter((l) => l.universityId === 'tsinghua' && l.province === '河北' && l.track === '物理')
        .sort((a, b) => b.year - a.year);
      const latest = lines[0];
      if (latest?.year !== 2025) return bad(`最新年份=${latest?.year}`);
      if (!(latest.minRank && latest.minRank > 0)) return bad('缺少最低位次');
      return ok(`2025 年, 位次=${latest.minRank}`);
    },
  },
  {
    id: 'T7-rank-conversion',
    category: 'retrieval',
    description: '位次换算：河北物理 2025，620 分应换算到约 14000 名（[12000,16000]）。',
    question: 'score→位次 换算是否合理？',
    assert: (ctx) => {
      const table = ctx.snapshot.rankTables.find((t) => t.id === '河北:2025:物理');
      const rank = scoreToRank(620, table);
      if (rank === null) return bad('换算返回 null');
      return rank >= 12000 && rank <= 16000 ? ok(`620→${rank} 名`) : bad(`620→${rank}（超出区间）`);
    },
  },
  {
    id: 'T8-freshness-current',
    category: 'retrieval',
    description: '新鲜度：当年（2025）记录在刚采集后应为“数据较新”（非 stale、非往年）。',
    question: '当年数据新鲜度标记是否正确？',
    assert: (ctx) => {
      const r = ctx.snapshot.provincialLines.find((l) => l.id === '河北:2025:物理:本科批');
      if (!r) return bad('记录缺失');
      const ageMs = Date.now() - new Date(r.lastUpdatedAt).getTime();
      const fresh = ageMs < 2 * 86_400_000 && r.year >= ctx.currentYear;
      return fresh ? ok('当年数据、刚采集→较新') : bad(`year=${r.year}, ageMs=${ageMs}`);
    },
  },
];

// Helpers reused above. (Defined after the array to keep the dataset readable.)
function tierCounts(m: MatchResult) {
  return { 冲: m.tiers.reach.length, 稳: m.tiers.match.length, 保: m.tiers.safety.length };
}

/** R1 profile accessor (kept inline to avoid recomputing in the assert). */
function ctx_profile(_id: string): StudentProfile {
  return mkProfile({ province: '河北', track: '物理', score: 660 });
}
