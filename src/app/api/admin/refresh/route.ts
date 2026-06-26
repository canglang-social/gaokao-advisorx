import { NextResponse } from 'next/server';
import { createFetcher } from '../../../../lib/data/fetchers';
import { runPipeline } from '../../../../lib/data/pipeline';
import { getRepository } from '../../../../lib/services/advisor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/admin/refresh — manually trigger the data-collection pipeline. */
export async function POST() {
  try {
    const result = await runPipeline(getRepository(), createFetcher(), 'manual');
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'refresh failed' }, { status: 500 });
  }
}
