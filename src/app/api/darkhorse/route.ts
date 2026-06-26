import { NextResponse } from 'next/server';
import { DARK_HORSE_DISCLAIMER } from '../../../lib/domain/darkHorse';
import type { Track } from '../../../lib/domain/types';
import { getDarkHorses, getRepository } from '../../../lib/services/advisor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/darkhorse?province=河北&track=物理 — 黑马预测列表 + 免责声明. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const province = url.searchParams.get('province') || undefined;
    const track = (url.searchParams.get('track') as Track) || undefined;
    const combo = province && track ? { province, track } : undefined;
    const darkHorses = await getDarkHorses(getRepository(), combo);
    return NextResponse.json({ darkHorses, disclaimer: DARK_HORSE_DISCLAIMER });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'darkhorse failed' }, { status: 500 });
  }
}
