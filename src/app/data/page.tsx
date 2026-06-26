'use client';

import { useCallback, useEffect, useState } from 'react';

interface DataResp {
  meta: any;
  currentYear: number;
  provincialLines: Array<{
    id: string;
    province: string;
    year: number;
    track: string;
    batch: string;
    minScore: number;
    lastUpdatedAt: string;
    freshness: { badge: { label: string; level: string } };
  }>;
}

export default function DataPage() {
  const [data, setData] = useState<DataResp | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([
      fetch('/api/data').then((r) => r.json()),
      fetch('/api/admin/status').then((r) => r.json()),
    ]);
    setData(d);
    setStatus(s);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/admin/refresh', { method: 'POST' });
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <section className="panel">
        <h2>数据采集状态</h2>
        <p className="muted">
          每日定时任务（node-cron）会重新采集并更新数据；下方为最近一次运行结果。v0 的“网络抓取”为模拟数据，但调度、去重、新鲜度标记均为真实逻辑。
        </p>
        {status && (
          <div className="kpi">
            <div className="box">
              <span className="muted">最近运行</span>
              <b style={{ fontSize: 14 }}>
                {status.meta?.lastRunAt ? new Date(status.meta.lastRunAt).toLocaleString('zh-CN') : '—'}
              </b>
              <span className="muted">来源：{status.meta?.lastRunSource ?? '—'}</span>
            </div>
            <div className="box">
              <span className="muted">记录数（带年份）</span>
              <b>{status.freshness?.total ?? '—'}</b>
            </div>
            <div className="box">
              <span className="muted">往年数据</span>
              <b style={{ color: 'var(--danger)' }}>{status.freshness?.priorYear ?? '—'}</b>
            </div>
            <div className="box">
              <span className="muted">陈旧数据</span>
              <b style={{ color: 'var(--warn)' }}>{status.freshness?.stale ?? '—'}</b>
            </div>
            <div className="box">
              <span className="muted">AI / DB</span>
              <b style={{ fontSize: 14 }}>
                {status.aiProvider} / {status.dbDriver}
              </b>
            </div>
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <button className="btn" onClick={refresh} disabled={refreshing}>
            {refreshing ? '更新中…' : '立即更新数据'}
          </button>
          <span className="muted" style={{ marginLeft: 10 }}>
            命令行：<code>pnpm refresh</code> 单次更新，<code>pnpm scheduler</code> 启动定时任务。
          </span>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <h2>各省批次线（含新鲜度）</h2>
        {data && (
          <table className="data">
            <thead>
              <tr>
                <th>省份</th>
                <th>年份</th>
                <th>科类</th>
                <th>批次</th>
                <th>控制线</th>
                <th>更新</th>
                <th>新鲜度</th>
              </tr>
            </thead>
            <tbody>
              {data.provincialLines.map((l) => (
                <tr key={l.id}>
                  <td>{l.province}</td>
                  <td>{l.year}</td>
                  <td>{l.track}</td>
                  <td>{l.batch}</td>
                  <td>
                    <b>{l.minScore}</b>
                  </td>
                  <td className="muted">{new Date(l.lastUpdatedAt).toLocaleDateString('zh-CN')}</td>
                  <td>
                    <span className={`badge ${l.freshness.badge.level}`}>
                      {l.freshness.badge.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
