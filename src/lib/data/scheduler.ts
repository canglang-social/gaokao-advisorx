import cron, { type ScheduledTask } from 'node-cron';
import { createFetcher } from './fetchers';
import { runPipeline } from './pipeline';
import { createRepository } from './stores';

/**
 * Daily scheduled data-collection job.
 *
 * The scheduler, pipeline, dedup and freshness logic are all real; the network
 * fetcher is chosen by config (DATA_SOURCE: mock | real) via `createFetcher()`.
 *
 * Default cadence: every day at 03:00. Override with the CRON arg.
 */
export function startScheduler(cronExpr = '0 3 * * *'): ScheduledTask {
  const repo = createRepository();
  const fetcher = createFetcher();

  const task = cron.schedule(cronExpr, async () => {
    const startedAt = new Date().toISOString();
    try {
      const result = await runPipeline(repo, fetcher, 'scheduled');
      // Observable log line for ops.
      console.log(
        `[scheduler] ${startedAt} → pipeline ok: ` +
          `received=${result.stats.received} inserted=${result.stats.inserted} ` +
          `updated=${result.stats.updated} dupSkipped=${result.stats.duplicatesSkipped} ` +
          `priorYear=${result.freshness.priorYear} stale=${result.freshness.stale}`,
      );
    } catch (err) {
      console.error(`[scheduler] ${startedAt} → pipeline FAILED:`, err);
    }
  });

  console.log(`[scheduler] started with cron "${cronExpr}" (source=${fetcher.name})`);
  return task;
}
