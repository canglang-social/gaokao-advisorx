import { NextResponse } from 'next/server';
import { createAiClient, type ChatMessage } from '../../../lib/ai';
import { normalizeProfile } from '../../../lib/profile/defaults';
import { getDarkHorses, getRecommendations, getRepository } from '../../../lib/services/advisor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/chat — body: { messages, profile? } → AI 顾问回复 (含已知背景上下文). */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const messages: ChatMessage[] = Array.isArray(body?.messages)
      ? body.messages
          .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
          .map((m: any) => ({ role: m.role, content: String(m.content) }))
      : [];

    let context = undefined;
    if (body?.profile) {
      const profile = normalizeProfile(body.profile);
      const repo = getRepository();
      const [match, darkHorses] = await Promise.all([
        getRecommendations(repo, profile),
        getDarkHorses(repo, { province: profile.province, track: profile.track }),
      ]);
      context = { profile, match, darkHorses };
    }

    const ai = createAiClient();
    const reply = await ai.chat(messages, context);
    return NextResponse.json({ reply, provider: ai.provider });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'chat failed' }, { status: 500 });
  }
}
