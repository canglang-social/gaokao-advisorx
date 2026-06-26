import { getConfig } from '../config';
import { AnthropicAiClient } from './anthropic';
import { DeepSeekAiClient } from './deepseek';
import { MockAiClient } from './mock';
import type { AiClient } from './types';

/**
 * Construct the configured AI client. Falls back to the mock (with a warning) when
 * a provider is selected but its API key is missing, so the app never hard-fails.
 */
export function createAiClient(): AiClient {
  const cfg = getConfig();
  if (cfg.aiProvider === 'anthropic') {
    if (!cfg.anthropicApiKey) {
      console.warn('[ai] AI_PROVIDER=anthropic but ANTHROPIC_API_KEY missing — using mock client.');
      return new MockAiClient();
    }
    return new AnthropicAiClient(cfg.anthropicApiKey, cfg.anthropicModel);
  }
  if (cfg.aiProvider === 'deepseek') {
    if (!cfg.deepseekApiKey) {
      console.warn('[ai] AI_PROVIDER=deepseek but DEEPSEEK_API_KEY missing — using mock client.');
      return new MockAiClient();
    }
    return new DeepSeekAiClient(cfg.deepseekApiKey, cfg.deepseekModel, cfg.deepseekBaseUrl);
  }
  return new MockAiClient();
}

export * from './types';
