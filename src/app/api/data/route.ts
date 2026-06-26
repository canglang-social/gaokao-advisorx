import { NextResponse } from 'next/server';
import { getConfig } from '../../../lib/config';
import { computeFreshness, freshnessBadge } from '../../../lib/data/freshness';
import { ensureData, getRepository } from '../../../lib/services/advisor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/data — dataset meta + provincial lines with freshness badges (数据面板). */
export async function GET() {
  try {
    const cfg = getConfig();
    const repo = getRepository();
    await ensureData(repo);
    const snap = await repo.load();
    const opts = { currentYear: cfg.currentYear, staleAfterDays: cfg.staleAfterDays };
    const provincialLines = snap.provincialLines
      .map((l) => {
        const f = computeFreshness(l, opts);
        return { ...l, freshness: { ...f, badge: freshnessBadge(f) } };
      })
      .sort((a, b) => b.year - a.year || a.province.localeCompare(b.province));
    return NextResponse.json({
      meta: snap.meta,
      currentYear: cfg.currentYear,
      provincialLines,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'data failed' }, { status: 500 });
  }
}
