import { getConfig, type DataSource } from '../../config';
import type { DataFetcher } from './types';
import { MockFetcher } from './mockSource';
import { RealFetcher } from './realSource';

/**
 * Construct the configured data source. This is the single swap point for the
 * collection pipeline: set DATA_SOURCE=real to ingest real downloaded files,
 * otherwise the mock sample source is used (default).
 *
 * Eval and unit tests intentionally bypass this and instantiate Mock/Stub
 * fetchers directly, to stay deterministic regardless of environment.
 */
export function createFetcher(source?: DataSource): DataFetcher {
  const cfg = getConfig();
  const s = source ?? cfg.dataSource;
  return s === 'real' ? new RealFetcher(cfg.dataSourceDir) : new MockFetcher();
}

export { MockFetcher } from './mockSource';
export { RealFetcher } from './realSource';
export type { DataFetcher } from './types';
