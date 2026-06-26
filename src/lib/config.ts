/**
 * Centralized runtime configuration, read from environment variables with safe
 * defaults so the app runs out-of-the-box with zero setup (`pnpm dev`).
 */

export type AiProvider = 'mock' | 'anthropic' | 'deepseek';
export type DbDriver = 'json' | 'memory' | 'sqlite';
export type DataSource = 'mock' | 'real';

export interface AppConfig {
  aiProvider: AiProvider;
  anthropicApiKey: string | null;
  anthropicModel: string;
  deepseekApiKey: string | null;
  deepseekModel: string;
  deepseekBaseUrl: string;
  dbDriver: DbDriver;
  staleAfterDays: number;
  currentYear: number;
  /** Which DataFetcher to use for the collection pipeline. */
  dataSource: DataSource;
  /** Directory the RealFetcher reads downloaded official files (CSV/...) from. */
  dataSourceDir: string;
}

function num(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function getConfig(): AppConfig {
  const provider = (process.env.AI_PROVIDER as AiProvider) || 'mock';
  const aiProvider: AiProvider =
    provider === 'anthropic' || provider === 'deepseek' ? provider : 'mock';
  return {
    aiProvider,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
    anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || null,
    deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    dbDriver: (process.env.DB_DRIVER as DbDriver) || 'json',
    staleAfterDays: num(process.env.DATA_STALE_AFTER_DAYS, 30),
    currentYear: num(process.env.CURRENT_YEAR, 2025),
    dataSource: process.env.DATA_SOURCE === 'real' ? 'real' : 'mock',
    dataSourceDir: process.env.DATA_SOURCE_DIR || 'data/sources',
  };
}
