'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudentProfile, SubjectScheme, Track } from '../lib/domain/types';
import type { MatchResult, Recommendation } from '../lib/domain/matching';
import { DEFAULT_PROFILE } from '../lib/profile/defaults';

const PROVINCES = ['河北', '山东', '四川', '北京', '上海', '广东', '江苏', '浙江', '湖北'];
const SCHEME_TRACKS: Record<SubjectScheme, Track[]> = {
  '3+1+2': ['物理', '历史'],
  '3+3': ['综合'],
  traditional: ['理科', '文科'],
};
/** Each province's 选科模式, so picking a province sets a valid 科类 automatically. */
const PROVINCE_SCHEME: Record<string, SubjectScheme> = {
  山东: '3+3',
  北京: '3+3',
  上海: '3+3',
  浙江: '3+3',
  河北: '3+1+2',
  广东: '3+1+2',
  江苏: '3+1+2',
  湖北: '3+1+2',
  四川: 'traditional', // 样本数据按传统文理建模
};
const SUBJECT_OPTIONS = ['物理', '化学', '生物', '政治', '历史', '地理', '技术'];
const INTEREST_OPTIONS = [
  '计算机',
  '人工智能',
  '电子信息',
  '通信',
  '金融',
  '医学',
  '法学',
  '机械',
  '材料',
  '食品',
  '化学',
  '大气科学',
];
const REGIONS = ['华东', '华北', '华南', '华中', '西南', '西北', '东北'];
const TIER_META = [
  { key: 'reach', label: '冲', cls: 'tier-reach', desc: '有挑战，建议服从调剂' },
  { key: 'match', label: '稳', cls: 'tier-match', desc: '分数匹配，志愿中坚' },
  { key: 'safety', label: '保', cls: 'tier-safety', desc: '录取概率高，确保有学上' },
] as const;

const STORAGE_KEY = 'gaokao-profile-v1';

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export default function HomePage() {
  const [profile, setProfile] = useState<StudentProfile>(DEFAULT_PROFILE);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted profile once (local persistence requirement).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  const runMatch = useCallback(async (p: StudentProfile) => {
    setLoading(true);
    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: p }),
      });
      const json = await res.json();
      setResult(json.result ?? null);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reactive: any profile edit persists + re-runs matching (debounced).
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runMatch(profile), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [profile, loaded, runMatch]);

  const update = (patch: Partial<StudentProfile>) => setProfile((prev) => ({ ...prev, ...patch }));

  const trackOptions = SCHEME_TRACKS[profile.subjectScheme];

  return (
    <div className="grid">
      <section className="panel">
        <h2>学生信息</h2>
        <p className="muted">任意修改都会即时刷新右侧的“冲/稳/保”推荐。</p>

        <div className="row">
          <label className="field">
            <span>省份</span>
            <select
              value={profile.province}
              onChange={(e) => {
                const province = e.target.value;
                // Auto-pick the correct 选科模式 + 科类 for the province so you never
                // land on an empty combo (e.g. 山东 is 3+3 综合, not 物理/历史).
                const scheme = PROVINCE_SCHEME[province];
                if (scheme) {
                  update({ province, subjectScheme: scheme, track: SCHEME_TRACKS[scheme][0] });
                } else {
                  update({ province });
                }
              }}
            >
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                  {['河北', '山东', '四川'].includes(p) ? '' : '（暂无样本数据）'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>所在城市（选填，供 AI 参考）</span>
            <input
              value={profile.city ?? ''}
              placeholder="如 济南；不影响冲稳保排名"
              onChange={(e) => update({ city: e.target.value })}
            />
          </label>
        </div>

        <div className="row">
          <label className="field">
            <span>选科模式</span>
            <select
              value={profile.subjectScheme}
              onChange={(e) => {
                const scheme = e.target.value as SubjectScheme;
                update({ subjectScheme: scheme, track: SCHEME_TRACKS[scheme][0] });
              }}
            >
              <option value="3+1+2">新高考 3+1+2</option>
              <option value="3+3">新高考 3+3</option>
              <option value="traditional">传统文理</option>
            </select>
          </label>
          <label className="field">
            <span>科类 / 首选</span>
            <select value={profile.track} onChange={(e) => update({ track: e.target.value as Track })}>
              {trackOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>选科组合</span>
          <div className="chips">
            {SUBJECT_OPTIONS.map((s) => (
              <span
                key={s}
                className={`chip ${profile.subjects.includes(s) ? 'on' : ''}`}
                onClick={() => update({ subjects: toggle(profile.subjects, s) })}
              >
                {s}
              </span>
            ))}
          </div>
        </label>

        <div className="row">
          <label className="field">
            <span>高考分数</span>
            <input
              type="number"
              value={profile.score}
              onChange={(e) => update({ score: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>位次（可选）</span>
            <input
              type="number"
              placeholder="留空则按分数估算"
              value={profile.rank ?? ''}
              onChange={(e) =>
                update({ rank: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </label>
        </div>

        <label className="field">
          <span>兴趣方向（可多选；或输入自定义后回车）</span>
          <div className="chips">
            {[...new Set([...INTEREST_OPTIONS, ...profile.interests])].map((s) => (
              <span
                key={s}
                className={`chip ${profile.interests.includes(s) ? 'on' : ''}`}
                onClick={() => update({ interests: toggle(profile.interests, s) })}
              >
                {s}
              </span>
            ))}
          </div>
          <input
            style={{ marginTop: 6 }}
            placeholder="输入自定义兴趣后回车，如 法学、临床医学"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const v = e.currentTarget.value.trim();
                if (v && !profile.interests.includes(v)) {
                  update({ interests: [...profile.interests, v] });
                }
                e.currentTarget.value = '';
              }
            }}
          />
        </label>

        <label className="field">
          <span>意向院校（逗号分隔）</span>
          <input
            value={profile.dreamUniversities.join('，')}
            onChange={(e) =>
              update({ dreamUniversities: e.target.value.split(/[，,]/).map((s) => s.trim()).filter(Boolean) })
            }
          />
        </label>
        <label className="field">
          <span>意向专业（逗号分隔）</span>
          <input
            value={profile.dreamMajors.join('，')}
            onChange={(e) =>
              update({ dreamMajors: e.target.value.split(/[，,]/).map((s) => s.trim()).filter(Boolean) })
            }
          />
        </label>

        <label className="field">
          <span>偏好地区</span>
          <div className="chips">
            {REGIONS.map((r) => (
              <span
                key={r}
                className={`chip ${profile.preferredRegions.includes(r) ? 'on' : ''}`}
                onClick={() => update({ preferredRegions: toggle(profile.preferredRegions, r) })}
              >
                {r}
              </span>
            ))}
          </div>
        </label>

        <label className="field">
          <span>偏好城市层级</span>
          <div className="chips">
            {[1, 2, 3].map((t) => (
              <span
                key={t}
                className={`chip ${profile.preferredCityTiers.includes(t as 1 | 2 | 3) ? 'on' : ''}`}
                onClick={() =>
                  update({ preferredCityTiers: toggle(profile.preferredCityTiers, t as 1 | 2 | 3) })
                }
              >
                {t === 1 ? '一线/新一线' : t === 2 ? '二线' : '三线及以下'}
              </span>
            ))}
          </div>
        </label>

        <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            style={{ width: 'auto', marginTop: 3 }}
            checked={profile.includeHighCost === true}
            onChange={(e) => update({ includeHighCost: e.target.checked })}
          />
          <span style={{ margin: 0 }}>
            包含中外合作 / 高收费专业
            <br />
            <span className="muted" style={{ fontSize: 12 }}>
              这类专业分数虚低但学费昂贵（每年数万元），默认已排除
            </span>
          </span>
        </label>

        <label className="field">
          <span>其他个人想法</span>
          <textarea
            value={profile.notes ?? ''}
            onChange={(e) => update({ notes: e.target.value })}
            placeholder="例如：更看重就业 / 想去大城市 / 能接受调剂…"
          />
        </label>
      </section>

      <section className="panel">
        <ResultsView result={result} loading={loading} />
      </section>
    </div>
  );
}

function ResultsView({ result, loading }: { result: MatchResult | null; loading: boolean }) {
  const total = useMemo(
    () =>
      result ? result.tiers.reach.length + result.tiers.match.length + result.tiers.safety.length : 0,
    [result],
  );

  return (
    <>
      <h2>
        推荐结果 {loading && <span className="muted">· 计算中…</span>}
      </h2>
      {result && (
        <p className="muted">
          基于 {result.usedYear ?? '—'} 年数据 · 估算位次 {result.studentRank ?? '未知'} · 共 {total} 所院校
        </p>
      )}
      {result && result.dataGaps.length > 0 && (
        <div className="disclaimer" style={{ fontWeight: 400 }}>
          ⚠️ 数据提示：{result.dataGaps.slice(0, 3).join('；')}
        </div>
      )}
      {!result && !loading && <p className="muted">请在左侧填写信息。</p>}
      {result && total === 0 && !loading && (
        <p className="muted">当前分数/省份在样本库中暂无匹配院校，可调整分数或更换有数据的省份（河北/山东/四川）。</p>
      )}

      {result &&
        TIER_META.map((t) => {
          const recs = result.tiers[t.key];
          if (recs.length === 0) return null;
          const total = result.tierCounts?.[t.key] ?? recs.length;
          const capped = total > recs.length;
          return (
            <div key={t.key}>
              <div className="tier-head">
                <span className={`tier-pill ${t.cls}`}>{t.label}</span>
                <strong>
                  {t.label}（{capped ? `${recs.length} / 共 ${total}` : recs.length}）
                </strong>
                <span className="muted">{t.desc}</span>
              </div>
              {capped && (
                <p className="muted" style={{ margin: '0 0 8px' }}>
                  仅显示离你分数最近的前 {recs.length} 所；想查具体某校用「院校查询」。
                </p>
              )}
              {recs.map((r) => (
                <RecCard key={r.universityId} r={r} />
              ))}
            </div>
          );
        })}
    </>
  );
}

function RecCard({ r }: { r: Recommendation }) {
  return (
    <div className="card">
      <div className="top">
        <div>
          <span className="uni">{r.universityName}</span>{' '}
          <span className="loc">
            {r.city} · {r.region}
          </span>
        </div>
        <span className={`badge ${r.freshness.badge.level}`}>{r.freshness.badge.label}</span>
      </div>
      <div className="tags">
        {r.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
      {r.targetMajor && (
        <div className="majors fit" style={{ margin: '4px 0' }}>
          🎯 按你的意向专业「{r.targetMajor.name}」的投档线评估（非全校最低线）
        </div>
      )}
      <div className="metrics">
        <span>
          {r.targetMajor ? '专业线' : '预测线'} <b>{r.predictedScore}</b> · 你 <b>{r.studentScore}</b>（
          {r.scoreDiff >= 0 ? '+' : ''}
          {r.scoreDiff}）
        </span>
        <span>
          位次 <b>{r.studentRank ?? '—'}</b> / 线 <b>{r.lineRank ?? '—'}</b>
        </span>
        <span className="prob" style={{ color: 'var(--accent)' }}>
          录取概率 {Math.round(r.admitProbability * 100)}%
        </span>
        <span className="muted">转专业：{transferLabel(r.transfer.difficulty)}</span>
      </div>
      <ul className="reasons">
        {r.reasons.slice(0, 3).map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
      {(r.faculty.summary || r.environment.dormitory) && (
        <div className="majors">
          {r.faculty.summary && <>师资：{r.faculty.summary} </>}
          {r.environment.dormitory && <>· 宿舍：{r.environment.dormitory}</>}
        </div>
      )}
      {r.matchedMajors.length > 0 && (
        <div className="majors">
          专业（{r.matchedMajors.length}）：
          {r.matchedMajors.slice(0, 8).map((m, i) => (
            <span key={i}>
              {i > 0 ? '、' : ''}
              {m.name}
            </span>
          ))}
          {r.matchedMajors.length > 8 ? ` 等 ${r.matchedMajors.length} 个` : ''}
        </div>
      )}
    </div>
  );
}

function transferLabel(d: string): string {
  return { easy: '容易', moderate: '一般', hard: '较难', restricted: '受限' }[d] ?? d;
}
