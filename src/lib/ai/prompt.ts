import type { ChatContext, PlanGenInput } from './types';

/** Industry/technology outlook notes by major category (张雪峰-style, employment-aware). */
export const INDUSTRY_TRENDS: Record<string, string> = {
  工学: '工科整体就业面广；电子/计算机/集成电路受 AI 与芯片自主可控拉动，需求旺盛。',
  理学: '理学基础学科考研/出国深造为主，直接就业面相对窄，建议规划升学路径。',
  医学: '医学就业稳定但学制长、规培辛苦，临床需读到硕博才有竞争力。',
  经济学: '金融行业头部集中、门槛抬高，需名校+实习背景，普通院校就业一般。',
  法学: '法学需通过法考且头部效应明显，建议冲名校或结合公考路径。',
  农学: '农学冷门但国家政策支持，部分方向（食品/生物）就业改善。',
};

/** Shared advisor persona used by both plan generation and chat. */
export const ADVISOR_SYSTEM_PROMPT = `你是一名资深高考志愿填报顾问，风格务实、就业导向，类似张雪峰：
- 优先考虑专业的就业前景、行业趋势与城市资源，而非只看学校名气。
- 善用“冲/稳/保”分层策略控制风险，强调服从调剂与梯度合理。
- 关注师资、转专业难度、校园环境等落地信息。
- 对“黑马”机会保持理性：明确提示预测有风险、仅供参考。
- 回答使用简体中文，结论先行、条理清晰、避免空话。`;

export function buildPlanUserPrompt(input: PlanGenInput): string {
  const { profile, match, darkHorses } = input;
  const tierLine = (name: string, recs: typeof match.tiers.reach) =>
    `${name}: ${recs
      .slice(0, 6)
      .map(
        (r) =>
          `${r.universityName}(预测线${r.predictedScore}/概率${Math.round(r.admitProbability * 100)}%)`,
      )
      .join('、') || '（暂无）'}`;

  return `学生信息：
省份=${profile.province}${profile.city ? ` 所在城市=${profile.city}` : ''} 选科模式=${profile.subjectScheme} 科类=${profile.track}
选科=${profile.subjects.join('/') || '未填'} 分数=${profile.score} 位次=${
    match.studentRank ?? '未知'
  }
兴趣=${profile.interests.join('、') || '未填'}
意向院校=${profile.dreamUniversities.join('、') || '未填'} 意向专业=${
    profile.dreamMajors.join('、') || '未填'
  }
地域偏好=城市层级${profile.preferredCityTiers.join('/') || '不限'} 地区${
    profile.preferredRegions.join('/') || '不限'
  }
补充想法=${profile.notes || '无'}

候选院校（按概率排序，基于 ${match.usedYear ?? '最新'} 年数据）：
${tierLine('冲', match.tiers.reach)}
${tierLine('稳', match.tiers.match)}
${tierLine('保', match.tiers.safety)}

黑马参考：${darkHorses.map((d) => `${d.universityName}(指数${d.darkHorseIndex})`).join('、') || '无'}

请基于以上信息，生成 3 套完整志愿方案：稳妥型、均衡型、冲刺型。
每套包含：name、style、summary、items(含 tier/universityName/recommendedMajor/note)、rationale、risks(数组)。
只输出 JSON 数组，不要额外文字。`;
}

export function buildChatContextBlock(context?: ChatContext): string {
  if (!context?.profile) return '';
  const p = context.profile;
  const top = context.match?.tiers.match
    .slice(0, 3)
    .map((r) => r.universityName)
    .join('、');
  return `\n[已知学生背景] ${p.province}${p.city ? `·${p.city}` : ''}·${p.track} 分数${p.score} 位次${
    context.match?.studentRank ?? '未知'
  }；兴趣：${p.interests.join('、') || '未填'}；稳妥候选：${top || '暂无'}。`;
}
