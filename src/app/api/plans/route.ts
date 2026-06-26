import { NextResponse } from 'next/server';
import { createAiClient } from '../../../lib/ai';
import { normalizeProfile } from '../../../lib/profile/defaults';
import { getDarkHorses, getRecommendations, getRepository } from '../../../lib/services/advisor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/plans — body: { profile } → 多套完整志愿方案 (稳妥/均衡/冲刺). */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const profile = normalizeProfile(body?.profile);
    const repo = getRepository();
    const [match, darkHorses] = await Promise.all([
      getRecommendations(repo, profile),
      getDarkHorses(repo, { province: profile.province, track: profile.track }),
    ]);
    const ai = createAiClient();
    let plans;
    try {
      plans = await ai.generatePlans({ profile, match, darkHorses });
    } catch (err: any) {
      return NextResponse.json(
        { error: `方案生成失败：${err?.message ?? err}`, provider: ai.provider },
        { status: 502 },
      );
    }
    return NextResponse.json({ plans, provider: ai.provider });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'plans failed' }, { status: 500 });
  }
}
