import type { RiskTier, StudentProfile } from '../domain/types';
import type { MatchResult } from '../domain/matching';
import type { DarkHorse } from '../domain/darkHorse';

export interface PlanItem {
  tier: RiskTier;
  universityName: string;
  recommendedMajor?: string;
  note: string;
}

export type PlanStyle = '稳妥型' | '均衡型' | '冲刺型';

export interface ApplicationPlan {
  name: string;
  style: PlanStyle;
  summary: string;
  items: PlanItem[];
  rationale: string;
  risks: string[];
}

export interface PlanGenInput {
  profile: StudentProfile;
  match: MatchResult;
  darkHorses: DarkHorse[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  profile?: StudentProfile;
  match?: MatchResult;
  darkHorses?: DarkHorse[];
}

/**
 * The LLM seam. Both the mock and the real Anthropic client implement this, and
 * everything downstream depends only on the interface — the API key/config is
 * fully swappable behind it.
 */
export interface AiClient {
  readonly provider: string;
  generatePlans(input: PlanGenInput): Promise<ApplicationPlan[]>;
  chat(messages: ChatMessage[], context?: ChatContext): Promise<string>;
}
