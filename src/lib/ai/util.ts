import type { ApplicationPlan } from './types';

/** Extract a JSON array of plans from an LLM response, tolerant of stray prose. */
export function parsePlans(text: string): ApplicationPlan[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 未返回可解析的方案 JSON。');
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as ApplicationPlan[];
  if (!Array.isArray(parsed)) throw new Error('AI 返回的方案格式不正确。');
  return parsed;
}
