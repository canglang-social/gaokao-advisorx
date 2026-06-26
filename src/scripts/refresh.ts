/**
 * Run the data-collection pipeline once (manual refresh). Usage: pnpm refresh
 */
import { createFetcher } from '../lib/data/fetchers';
import { runPipeline } from '../lib/data/pipeline';
import { createRepository } from '../lib/data/stores';

async function main() {
  const repo = createRepository();
  const result = await runPipeline(repo, createFetcher(), 'manual');
  console.log('[refresh] done:', JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('[refresh] failed:', err);
  process.exit(1);
});
