/**
 * Seed the store from the mock data source. Idempotent (upserts by natural key).
 * Usage: pnpm seed
 */
import { createFetcher } from '../lib/data/fetchers';
import { runPipeline } from '../lib/data/pipeline';
import { createRepository } from '../lib/data/stores';

async function main() {
  const repo = createRepository();
  const result = await runPipeline(repo, createFetcher(), 'seed');
  console.log('[seed] done:', JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
