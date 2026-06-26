import { NextResponse } from 'next/server';
import { getConfig } from '../../../../lib/config';
import { computeFreshness } from '../../../../lib/data/freshness';
import { ensureData, getRepository } from '../../../../lib/services/advisor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/admin/status — pipeline meta + freshness summary (observability). */
export async function GET() {
  try {
    const cfg = getConfig();
    const repo = getRepository();
    await ensureData(repo);
    const snap = await repo.load();
    const opts = { currentYear: cfg.currentYear, staleAfterDays: cfg.staleAfterDays };
    const dated = [...snap.provincialLines, ...snap.rankTables, ...snap.admissionLines];
    let priorYear = 0;
    let stale = 0;
    for (const r of dated) {
      const f = computeFreshness(r, opts);
      if (f.priorYear) priorYear++;
      if (f.stale) stale++;
    }
    return NextResponse.json({
      meta: snap.meta,
      currentYear: cfg.currentYear,
      aiProvider: cfg.aiProvider,
      dbDriver: cfg.dbDriver,
      freshness: { total: dated.length, priorYear, stale },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'status failed' }, { status: 500 });
  }
}
