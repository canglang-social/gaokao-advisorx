/**
 * Major-name matching that understands 大类 (broad categories).
 *
 * The 投档表 lists specific majors (会计学, 人工智能, ...). A student often types a
 * 大类 (财会类, 计算机类). This maps each 大类 to representative keywords and matches
 * if any keyword is a substring of the major name — plus plain substring matching
 * for specific majors. EDIT/EXTEND the keyword lists freely.
 */
export const MAJOR_CATEGORY_KEYWORDS: Record<string, string[]> = {
  财会类: ['会计', '财务', '审计', '财政', '税'],
  财经类: ['经济', '金融', '会计', '财务', '贸易', '税', '保险', '投资'],
  经济类: ['经济', '金融', '贸易', '财政'],
  金融类: ['金融', '银行', '保险', '投资', '财富'],
  管理类: ['管理', '工商', '人力资源', '市场营销', '物流', '电子商务', '行政'],
  计算机类: ['计算机', '软件', '人工智能', '数据', '网络空间', '信息安全', '智能'],
  电子信息类: ['电子', '通信', '信息工程', '集成电路', '微电子', '光电'],
  自动化类: ['自动化', '控制', '机器人', '测控'],
  机械类: ['机械', '车辆', '能源', '动力', '材料成型'],
  土木类: ['土木', '建筑环境', '给排水', '工程管理', '道路桥梁'],
  建筑类: ['建筑', '城乡规划', '风景园林'],
  医学类: ['临床', '医学', '口腔', '麻醉', '影像', '预防', '中医', '针灸'],
  药学类: ['药学', '制药', '药物'],
  护理类: ['护理'],
  法学类: ['法学', '法律', '知识产权', '侦查'],
  文学类: ['汉语言', '文学', '编辑出版'],
  新闻传播类: ['新闻', '传播', '广播', '广告', '新媒体'],
  外语类: ['英语', '日语', '德语', '法语', '翻译', '外国语', '西班牙', '俄语', '朝鲜语', '阿拉伯', '语'],
  教育类: ['教育', '师范', '学前', '心理'],
  数学类: ['数学', '统计'],
  物理类: ['物理'],
  化学类: ['化学', '化工'],
  生物类: ['生物', '生命科学'],
  农林类: ['农学', '林学', '园艺', '植物', '动物', '食品', '水产', '农业'],
  设计类: ['设计', '美术', '视觉传达', '工业设计', '数字媒体'],
};

/**
 * 高收费/中外合作类专业的识别。这类专业（中外合作办学、校企合作、较高收费等）
 * 投档线通常虚低、学费昂贵，默认应从"院校最低线"与意向专业匹配中排除。
 */
const HIGH_COST_MARKERS = ['中外合作', '合作办学', '校企合作', '较高收费', '高收费', '高学费'];

export function isHighCostMajor(name: string): boolean {
  return HIGH_COST_MARKERS.some((k) => name.includes(k));
}

/** Expand a dream-major term into match keywords (itself if not a known 大类). */
export function expandDreamMajor(dreamMajor: string): string[] {
  const t = dreamMajor.trim();
  if (!t) return [];
  if (MAJOR_CATEGORY_KEYWORDS[t]) return MAJOR_CATEGORY_KEYWORDS[t];
  // Tolerate "财会" / "财会类专业" forms of a known 大类.
  for (const [cat, kws] of Object.entries(MAJOR_CATEGORY_KEYWORDS)) {
    const base = cat.replace(/类$/, '');
    if (t === base || t === cat || (base.length >= 2 && t.startsWith(base))) return kws;
  }
  return [t];
}

/** True if a dream major (specific or 大类) matches a concrete major name. */
export function majorNameMatches(dreamMajor: string, majorName: string): boolean {
  const dm = dreamMajor.trim();
  const mn = majorName.trim();
  if (!dm || !mn) return false;
  if (mn.includes(dm) || dm.includes(mn)) return true;
  return expandDreamMajor(dm).some((kw) => mn.includes(kw));
}

/** Find the first (dreamMajor, majorName) pair that matches, for display/reasons. */
export function findMatchingMajor(
  dreamMajors: string[],
  majorNames: string[],
): { dream: string; major: string } | undefined {
  for (const dm of dreamMajors) {
    for (const mn of majorNames) {
      if (majorNameMatches(dm, mn)) return { dream: dm, major: mn };
    }
  }
  return undefined;
}
