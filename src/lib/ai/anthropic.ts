import Anthropic from '@anthropic-ai/sdk';
import { ADVISOR_SYSTEM_PROMPT, buildChatContextBlock, buildPlanUserPrompt } from './prompt';
import { parsePlans } from './util';
import type {
  AiClient,
  ApplicationPlan,
  ChatContext,
  ChatMessage,
  PlanGenInput,
} from './types';

/**
 * Real Anthropic-backed AI client. Selected when AI_PROVIDER=anthropic and
 * ANTHROPIC_API_KEY is set. Uses the configured model (default claude-opus-4-8)
 * with adaptive thinking. Params are passed loosely-typed so the call survives
 * SDK version drift around newer fields (thinking/effort).
 */
export class AnthropicAiClient implements AiClient {
  readonly provider = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  private async createText(system: string, messages: ChatMessage[]): Promise<string> {
    const res: any = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system,
      thinking: { type: 'adaptive' },
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    } as any);
    const text = (res.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();
    return text;
  }

  async generatePlans(input: PlanGenInput): Promise<ApplicationPlan[]> {
    const text = await this.createText(ADVISOR_SYSTEM_PROMPT, [
      { role: 'user', content: buildPlanUserPrompt(input) },
    ]);
    return parsePlans(text);
  }

  async chat(messages: ChatMessage[], context?: ChatContext): Promise<string> {
    const system = ADVISOR_SYSTEM_PROMPT + buildChatContextBlock(context);
    const safe = messages.length > 0 ? messages : [{ role: 'user' as const, content: '你好' }];
    return this.createText(system, safe);
  }
}
