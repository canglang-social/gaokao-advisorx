/**
 * Start the daily scheduled data-collection job and keep the process alive.
 * Usage: pnpm scheduler            (default cron: 03:00 daily)
 *        pnpm scheduler "EXPR"     (custom cron string, e.g. every 2 minutes for a demo)
 *
 * Set DEMO_RUN_NOW=1 to also run the pipeline once immediately on startup.
 */
import { createFetcher } from '../lib/data/fetchers';
import { runPipeline } from '../lib/data/pipeline';
import { startScheduler } from '../lib/data/scheduler';
import { createRepository } from '../lib/data/stores';

async function main() {
  const cronExpr = process.argv[2] || '0 3 * * *';

  if (process.env.DEMO_RUN_NOW === '1') {
    const result = await runPipeline(createRepository(), createFetcher(), 'manual');
    console.log('[scheduler] startup run:', JSON.stringify(result.stats));
  }

  startScheduler(cronExpr);
  console.log('[scheduler] running. Press Ctrl+C to stop.');

  // Keep the process alive.
  process.stdin.resume();
}

main().catch((err) => {
  console.error('[scheduler] failed to start:', err);
  process.exit(1);
});
