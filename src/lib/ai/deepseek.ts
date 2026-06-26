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
 * DeepSeek-backed AI client. Selected when AI_PROVIDER=deepseek and DEEPSEEK_API_KEY
 * is set. DeepSeek's API is OpenAI-compatible, so we call it over plain fetch (no SDK).
 * Default model `deepseek-chat` (V3); use `deepseek-reasoner` (R1) for deeper reasoning.
 */
export class DeepSeekAiClient implements AiClient {
  readonly provider = 'deepseek';

  constructor(
    private apiKey: string,
    private model: string,
    private baseUrl: string,
  ) {}

  private async createText(system: string, messages: ChatMessage[]): Promise<string> {
    // deepseek-reasoner (R1) ignores/​rejects sampling params and reasons slowly,
    // so omit temperature and allow a longer timeout for it.
    const isReasoner = /reasoner/i.test(this.model);
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: false,
    };
    if (!isReasoner) body.temperature = 0.7;

    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(isReasoner ? 240_000 : 120_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`DeepSeek API ${res.status}: ${body.slice(0, 300)}`);
    }
    const json: any = await res.json();
    return String(json?.choices?.[0]?.message?.content ?? '').trim();
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
