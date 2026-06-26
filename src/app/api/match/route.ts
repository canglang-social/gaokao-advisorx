import { NextResponse } from 'next/server';
import { normalizeProfile } from '../../../lib/profile/defaults';
import { getRecommendations, getRepository } from '../../../lib/services/advisor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/match — body: { profile } → 冲/稳/保 推荐结果. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const profile = normalizeProfile(body?.profile);
    const result = await getRecommendations(getRepository(), profile);
    return NextResponse.json({ profile, result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'match failed' }, { status: 500 });
  }
}
