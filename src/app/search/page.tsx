'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface LineRow {
  year: number;
  minScore: number;
  minRank?: number;
  freshness: { badge: { label: string; level: string } };
}
interface Hit {
  id: string;
  name: string;
  city: string;
  region: string;
  tags: string[];
  transfer: { difficulty: string; policy: string };
  lines: LineRow[];
  majors: string[];
  majorCount: number;
}

const PROV_TRACKS: Record<string, string[]> = {
  山东: ['综合'],
  河北: ['物理', '历史'],
  四川: ['理科', '文科'],
};
const transferLabel = (d: string) =>
  ({ easy: '容易', moderate: '一般', hard: '较难', restricted: '受限' })[d] ?? d;

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [province, setProvince] = useState('山东');
  const [track, setTrack] = useState('综合');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    async (query: string, prov: string, trk: string) => {
      if (!query.trim()) {
        setHits([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `/api/university?q=${encodeURIComponent(query)}&province=${encodeURIComponent(prov)}&track=${encodeURIComponent(trk)}`,
        );
        const json = await res.json();
        setHits(json.hits ?? []);
        setSearched(true);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => run(q, province, track), 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, province, track, run]);

  return (
    <div>
      <section className="panel">
        <h2>院校查询</h2>
        <p className="muted">输入院校名称，查看它在某省份/科类的历年投档线与位次。</p>
        <div className="row">
          <label className="field" style={{ flex: 2 }}>
            <span>院校名称</span>
            <input
              value={q}
              autoFocus
              placeholder="如 山东大学 / 海洋 / 师范"
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="field">
            <span>考生省份</span>
            <select
              value={province}
              onChange={(e) => {
                const p = e.target.value;
                setProvince(p);
                setTrack(PROV_TRACKS[p][0]);
              }}
            >
              {Object.keys(PROV_TRACKS).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>科类</span>
            <select value={track} onChange={(e) => setTrack(e.target.value)}>
              {PROV_TRACKS[province].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && <p className="muted">查询中…</p>}
        {!loading && searched && hits.length === 0 && (
          <p className="muted">
            未找到「{q}」。可换关键词，或确认该省份/科类有数据（目前真实数据为山东·综合）。
          </p>
        )}
        {!loading && !searched && <p className="muted">输入院校名称开始查询。</p>}

        {hits.map((h) => (
          <div className="card" key={h.id}>
            <div className="top">
              <div>
                <span className="uni">{h.name}</span>{' '}
                <span className="loc">
                  {h.city || '—'} · {h.region || '—'}
                </span>
              </div>
              <span className="muted">转专业：{transferLabel(h.transfer.difficulty)}</span>
            </div>
            <div className="tags">
              {h.tags.length ? (
                h.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))
              ) : (
                <span className="tag">普通院校</span>
              )}
            </div>

            {h.lines.length > 0 ? (
              <table className="data" style={{ margin: '6px 0' }}>
                <thead>
                  <tr>
                    <th>年份</th>
                    <th>投档最低分</th>
                    <th>最低位次</th>
                    <th>新鲜度</th>
                  </tr>
                </thead>
                <tbody>
                  {h.lines.map((l) => (
                    <tr key={l.year}>
                      <td>{l.year}</td>
                      <td>
                        <b>{l.minScore}</b>
                      </td>
                      <td>{l.minRank ?? '—'}</td>
                      <td>
                        <span className={`badge ${l.freshness.badge.level}`}>
                          {l.freshness.badge.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">该校在 {province}·{track} 暂无投档线数据。</p>
            )}

            {h.majorCount > 0 && (
              <div className="majors">
                招生专业（{h.majorCount}）：{h.majors.slice(0, 10).join('、')}
                {h.majorCount > 10 ? ` 等 ${h.majorCount} 个` : ''}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
