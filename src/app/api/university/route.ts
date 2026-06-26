import { NextResponse } from 'next/server';
import type { Track } from '../../../lib/domain/types';
import { getRepository, searchUniversities } from '../../../lib/services/advisor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/university?q=山东大学&province=山东&track=综合 — 院校投档线查询. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q') || '';
    const province = url.searchParams.get('province') || undefined;
    const track = (url.searchParams.get('track') as Track) || undefined;
    const hits = await searchUniversities(getRepository(), { q, province, track });
    return NextResponse.json({ hits });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'search failed' }, { status: 500 });
  }
}
