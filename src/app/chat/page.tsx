'use client';

import { useEffect, useRef, useState } from 'react';
import type { StudentProfile } from '../../lib/domain/types';
import type { DarkHorse } from '../../lib/domain/darkHorse';
import type { ApplicationPlan, ChatMessage } from '../../lib/ai/types';
import { DEFAULT_PROFILE } from '../../lib/profile/defaults';

const STORAGE_KEY = 'gaokao-profile-v1';

export default function ChatPage() {
  const [profile, setProfile] = useState<StudentProfile>(DEFAULT_PROFILE);
  const [darkHorses, setDarkHorses] = useState<DarkHorse[]>([]);
  const [disclaimer, setDisclaimer] = useState('预测有风险,仅供参考,不可轻信。');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [plans, setPlans] = useState<ApplicationPlan[]>([]);
  const [provider, setProvider] = useState<string>('');
  const [planLoading, setPlanLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let p = DEFAULT_PROFILE;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) p = { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    setProfile(p);
    fetch(`/api/darkhorse?province=${encodeURIComponent(p.province)}&track=${encodeURIComponent(p.track)}`)
      .then((r) => r.json())
      .then((j) => {
        setDarkHorses(j.darkHorses ?? []);
        if (j.disclaimer) setDisclaimer(j.disclaimer);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, profile }),
      });
      const json = await res.json();
      setProvider(json.provider ?? '');
      setMessages([...next, { role: 'assistant', content: json.reply ?? json.error ?? '（无回复）' }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: '请求失败，请重试。' }]);
    } finally {
      setSending(false);
    }
  };

  const genPlans = async () => {
    setPlanLoading(true);
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const json = await res.json();
      setProvider(json.provider ?? provider);
      setPlans(json.plans ?? []);
    } catch {
      setPlans([]);
    } finally {
      setPlanLoading(false);
    }
  };

  return (
    <div>
      <section className="darkhorse">
        <h2 style={{ marginTop: 0 }}>🐎 今年黑马预测（{profile.province}·{profile.track}）</h2>
        <div className="disclaimer">{disclaimer}</div>
        {darkHorses.length === 0 && <p className="muted">暂无黑马数据。</p>}
        {darkHorses.map((d) => (
          <div className="dh-item" key={d.universityId}>
            <div>
              <strong>{d.universityName}</strong>{' '}
              <span className="muted">
                {d.tags.join('/')} · {d.city}
              </span>
              <div className="muted">{d.rationale}</div>
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <div className="dh-index">黑马指数 {d.darkHorseIndex}</div>
              <div className="muted">
                最新线 {d.latestScore} → 预测 {d.predictedScore}
              </div>
              <span className={`badge ${d.freshness.badge.level}`}>{d.freshness.badge.label}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="grid">
        <section className="panel">
          <h2>AI 顾问对话 {provider && <span className="muted">· {provider}</span>}</h2>
          <p className="muted">
            告诉我你的兴趣、未来方向和风险偏好，我会结合行业趋势生成多套志愿方案。
          </p>
          <div className="chat" ref={threadRef} style={{ maxHeight: 360, overflowY: 'auto', padding: 4 }}>
            {messages.length === 0 && (
              <div className="msg assistant">
                你好！我可以帮你分析志愿。先聊聊：你更看重<strong>就业、城市还是学校名气</strong>？风险上更想
                <strong>稳一点还是冲一冲</strong>？
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {sending && <div className="msg assistant muted">思考中…</div>}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <input
              value={input}
              placeholder="输入你的想法…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button className="btn" style={{ flex: '0 0 auto' }} onClick={send} disabled={sending}>
              发送
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>完整志愿方案</h2>
          <p className="muted">一键生成稳妥型 / 均衡型 / 冲刺型三套方案（含理由与风险）。</p>
          <button className="btn" onClick={genPlans} disabled={planLoading}>
            {planLoading ? '生成中…' : '生成志愿方案'}
          </button>
          <div style={{ marginTop: 12 }}>
            {plans.map((p, i) => (
              <div className="plan" key={i}>
                <h4>{p.name}</h4>
                <div className="muted">{p.summary}</div>
                <ul>
                  {p.items.map((it, j) => (
                    <li key={j}>
                      <strong>[{tierLabel(it.tier)}]</strong> {it.universityName}
                      {it.recommendedMajor ? ` · ${it.recommendedMajor}` : ''} — {it.note}
                    </li>
                  ))}
                </ul>
                <div className="muted">理由：{p.rationale}</div>
                {p.risks?.map((rk, k) => (
                  <div className="risk" key={k}>
                    ⚠️ {rk}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function tierLabel(t: string): string {
  return { reach: '冲', match: '稳', safety: '保' }[t] ?? t;
}
