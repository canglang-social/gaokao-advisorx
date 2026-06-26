import type { Recommendation } from '../domain/matching';
import { INDUSTRY_TRENDS } from './prompt';
import type {
  AiClient,
  ApplicationPlan,
  ChatContext,
  ChatMessage,
  PlanGenInput,
  PlanItem,
  PlanStyle,
} from './types';

/**
 * MOCK AI CLIENT.
 *
 * Deterministic, no network/key. Produces three complete plans by recombining the
 * matching-engine tiers, plus a contextual chat reply. Replace with the Anthropic
 * client (set AI_PROVIDER=anthropic) for real LLM reasoning — see docs/MOCKS.md.
 */
export class MockAiClient implements AiClient {
  readonly provider = 'mock';

  async generatePlans(input: PlanGenInput): Promise<ApplicationPlan[]> {
    const { match } = input;
    const reach = match.tiers.reach;
    const matchT = match.tiers.match;
    const safety = match.tiers.safety;

    const toItem = (r: Recommendation): PlanItem => {
      const major = r.matchedMajors.find((m) => m.subjectFit) ?? r.matchedMajors[0];
      return {
        tier: r.tier,
        universityName: r.universityName,
        recommendedMajor: major?.name,
        note: `预测线${r.predictedScore}、录取概率约${Math.round(r.admitProbability * 100)}%。${
          r.reasons[0] ?? ''
        }`,
      };
    };

    const trendNote = (recs: Recommendation[]): string => {
      const cats = new Set<string>();
      recs.forEach((r) => r.matchedMajors.forEach((m) => cats.add(m.category)));
      return [...cats]
        .map((c) => INDUSTRY_TRENDS[c])
        .filter(Boolean)
        .slice(0, 2)
        .join(' ');
    };

    const build = (
      style: PlanStyle,
      picks: { reach: number; match: number; safety: number },
      summary: string,
    ): ApplicationPlan => {
      const items = [
        ...reach.slice(0, picks.reach),
        ...matchT.slice(0, picks.match),
        ...safety.slice(0, picks.safety),
      ].map(toItem);
      return {
        name: `${style}志愿方案`,
        style,
        summary,
        items,
        rationale: `${summary} ${trendNote([...reach, ...matchT, ...safety])}`,
        risks: buildRisks(style, items),
      };
    };

    return [
      build('稳妥型', { reach: 1, match: 3, safety: 3 }, '以稳保为主，确保录取、降低滑档风险。'),
      build('均衡型', { reach: 2, match: 3, safety: 2 }, '冲稳保梯度均衡，兼顾上限与安全。'),
      build('冲刺型', { reach: 3, match: 3, safety: 1 }, '冲刺更高平台，博取更好学校/专业。'),
    ];
  }

  async chat(messages: ChatMessage[], context?: ChatContext): Promise<string> {
    const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const p = context?.profile;
    const lines: string[] = [];

    lines.push('（本回复由本地模拟顾问生成；配置 ANTHROPIC_API_KEY 后可启用真实 AI。）');

    if (/风险|冲|保底|稳/.test(last)) {
      lines.push(
        '关于风险偏好：如果你更怕滑档，建议“保”档放 3 所以上、且全部服从调剂；如果愿意博一把，可把“冲”档加到 3 所，但前两志愿要敢冲。',
      );
    }
    if (/专业|就业|前景|行业/.test(last)) {
      const cat = /计算机|电子|通信|芯片|软件/.test(last)
        ? '工学'
        : /医/.test(last)
          ? '医学'
          : /金融|经济/.test(last)
            ? '经济学'
            : '工学';
      lines.push(`关于专业方向：${INDUSTRY_TRENDS[cat] ?? INDUSTRY_TRENDS['工学']}`);
    }
    if (p) {
      const top = context?.match?.tiers.match
        .slice(0, 3)
        .map((r) => r.universityName)
        .join('、');
      lines.push(
        `结合你的情况（${p.province}·${p.track}，分数${p.score}，位次${
          context?.match?.studentRank ?? '未知'
        }），当前“稳”档可重点看：${top || '请先完善资料'}。`,
      );
    }
    lines.push(
      '请告诉我：1) 你更看重就业还是城市还是学校名气？2) 风险偏好（保守/平衡/激进）？我据此给出稳妥型/均衡型/冲刺型完整方案。',
    );
    return lines.join('\n\n');
  }
}

function buildRisks(style: PlanStyle, items: PlanItem[]): string[] {
  const risks: string[] = [];
  if (style === '冲刺型') {
    risks.push('冲刺院校录取概率偏低，务必服从专业调剂，避免退档。');
    risks.push('若“冲”档过多，可能被调剂到冷门专业，需评估转专业难度。');
  }
  if (style === '稳妥型') {
    risks.push('上限相对受限，可能错过更好平台的机会。');
  }
  if (style === '均衡型') {
    risks.push('梯度需拉开，相邻志愿分差过小会浪费志愿名额。');
  }
  if (items.length < 4) risks.push('当前候选数量偏少（数据/分数限制），建议放宽地域或完善资料。');
  risks.push('预测线基于历史数据，今年存在波动风险，仅供参考。');
  return risks;
}
