import type {
  AdmissionLine,
  Major,
  ProvincialScoreLine,
  RankTable,
  Track,
  University,
} from '../../domain/types';
import { scoreToRank } from '../../domain/rankConversion';
import type { DataFetcher } from './types';

/**
 * MOCK DATA SOURCE.
 *
 * Returns realistic but fabricated sample data so the whole pipeline (dedup,
 * freshness, persistence, matching, AI) is exercised end-to-end without network
 * access. Every value below is illustrative only — see docs/MOCKS.md for the real
 * sources that should replace this fetcher.
 *
 * `lastUpdatedAt` is stamped at fetch time, so re-running the pipeline refreshes
 * timestamps (current-year rows look fresh; prior-year rows are flagged 往年数据).
 */

const SUPPORTED_COMBOS: Array<{ province: string; track: Track }> = [
  { province: '河北', track: '物理' },
  { province: '山东', track: '综合' },
  { province: '四川', track: '理科' },
];

/** Cross-province score offset relative to the 河北·物理 baseline (mock heuristic). */
const PROVINCE_OFFSET: Record<string, number> = { 河北: 0, 山东: 5, 四川: 18 };

const YEARS = [2023, 2024, 2025];

/** 河北·物理 2025 校线 baseline + trend. `down` = 投档线下行 → potential 黑马. */
const BASELINE: Array<{ id: string; score2025: number; trend: 'down' | 'flat' }> = [
  { id: 'tsinghua', score2025: 695, trend: 'flat' },
  { id: 'sjtu', score2025: 678, trend: 'flat' },
  { id: 'zju', score2025: 668, trend: 'flat' },
  { id: 'hust', score2025: 648, trend: 'flat' },
  { id: 'uestc', score2025: 642, trend: 'flat' },
  { id: 'whu', score2025: 640, trend: 'flat' },
  { id: 'bupt', score2025: 636, trend: 'flat' },
  { id: 'szu', score2025: 600, trend: 'flat' },
  { id: 'hit', score2025: 615, trend: 'down' }, // 985, 地处东北 → 黑马
  { id: 'xidian', score2025: 612, trend: 'flat' },
  { id: 'suda', score2025: 605, trend: 'flat' },
  { id: 'lzu', score2025: 588, trend: 'down' }, // 985, 地处西北 → 黑马
  { id: 'zzu', score2025: 580, trend: 'flat' },
  { id: 'ncu', score2025: 575, trend: 'down' }, // 211/双一流 → 黑马
];

function nowIso(): string {
  return new Date().toISOString();
}

const UNIVERSITIES: Omit<University, 'lastUpdatedAt'>[] = [
  {
    id: 'tsinghua',
    name: '清华大学',
    city: '北京',
    province: '北京',
    cityTier: 1,
    region: '华北',
    tags: ['985', '211', '双一流', 'C9'],
    faculty: {
      summary: '院士与长江学者云集，理工科学科评估几乎全部 A+。',
      keyDisciplines: ['计算机科学与技术', '电子信息', '机械工程'],
      rating: 'A+',
    },
    environment: {
      campus: '校园开阔、设施一流，紧邻中关村。',
      teaching: '教学资源顶尖，科研机会丰富。',
      dormitory: '本科多为四人间，条件良好。',
    },
    transfer: { difficulty: 'hard', policy: '转专业需高绩点+考核，竞争激烈。' },
  },
  {
    id: 'sjtu',
    name: '上海交通大学',
    city: '上海',
    province: '上海',
    cityTier: 1,
    region: '华东',
    tags: ['985', '211', '双一流', 'C9'],
    faculty: {
      summary: '工科与医学双强，师资力量雄厚。',
      keyDisciplines: ['船舶与海洋工程', '临床医学', '电子信息'],
      rating: 'A+',
    },
    environment: {
      campus: '闵行校区面积大，地处上海就业近水楼台。',
      teaching: '工科实践与产业结合紧密。',
      dormitory: '四人间为主，部分老校区条件一般。',
    },
    transfer: { difficulty: 'moderate', policy: '设有转专业通道，需满足绩点要求。' },
  },
  {
    id: 'zju',
    name: '浙江大学',
    city: '杭州',
    province: '浙江',
    cityTier: 1,
    region: '华东',
    tags: ['985', '211', '双一流', 'C9'],
    faculty: {
      summary: '学科门类齐全，综合实力强，互联网产业资源丰富。',
      keyDisciplines: ['计算机科学与技术', '控制科学', '光学工程'],
      rating: 'A+',
    },
    environment: {
      campus: '紫金港校区现代化，杭州互联网氛围浓。',
      teaching: '大类招生，培养灵活。',
      dormitory: '新校区四人间，条件优。',
    },
    transfer: { difficulty: 'easy', policy: '大类分流+转专业政策宽松，机会多。' },
  },
  {
    id: 'hust',
    name: '华中科技大学',
    city: '武汉',
    province: '湖北',
    cityTier: 1,
    region: '华中',
    tags: ['985', '211', '双一流'],
    faculty: {
      summary: '工科与医学并重，光电与机械实力突出。',
      keyDisciplines: ['光学工程', '机械工程', '临床医学'],
      rating: 'A',
    },
    environment: {
      campus: '校园绿化极好，有“森林大学”之称。',
      teaching: '工科务实，校招企业多。',
      dormitory: '多为四人间，条件中上。',
    },
    transfer: { difficulty: 'moderate', policy: '转专业需考核，热门专业名额有限。' },
  },
  {
    id: 'uestc',
    name: '电子科技大学',
    city: '成都',
    province: '四川',
    cityTier: 1,
    region: '西南',
    tags: ['985', '211', '双一流'],
    faculty: {
      summary: '电子信息领域全国顶尖，行业认可度高。',
      keyDisciplines: ['电子科学与技术', '信息与通信工程'],
      rating: 'A+',
    },
    environment: {
      campus: '沙河+清水河两校区，成都生活舒适。',
      teaching: '与华为、中兴等深度合作。',
      dormitory: '清水河校区四人间，条件好。',
    },
    transfer: { difficulty: 'moderate', policy: '电子类内部转专业相对容易。' },
  },
  {
    id: 'whu',
    name: '武汉大学',
    city: '武汉',
    province: '湖北',
    cityTier: 1,
    region: '华中',
    tags: ['985', '211', '双一流'],
    faculty: {
      summary: '文理工医综合，测绘遥感世界一流。',
      keyDisciplines: ['测绘科学与技术', '法学', '计算机科学与技术'],
      rating: 'A',
    },
    environment: {
      campus: '号称“中国最美大学”，樱花闻名。',
      teaching: '综合性强，学科选择面广。',
      dormitory: '老校区部分宿舍较旧，差异较大。',
    },
    transfer: { difficulty: 'moderate', policy: '有转专业机会，需笔试面试。' },
  },
  {
    id: 'bupt',
    name: '北京邮电大学',
    city: '北京',
    province: '北京',
    cityTier: 1,
    region: '华北',
    tags: ['211', '双一流'],
    faculty: {
      summary: '信息通信领域“黄埔军校”，就业极强。',
      keyDisciplines: ['信息与通信工程', '计算机科学与技术'],
      rating: 'A+',
    },
    environment: {
      campus: '本部校区不大，但地处北京就业近。',
      teaching: 'ICT 行业校招资源顶级。',
      dormitory: '本部宿舍偏紧张，沙河校区较新。',
    },
    transfer: { difficulty: 'hard', policy: '热门专业转入门槛高。' },
  },
  {
    id: 'szu',
    name: '深圳大学',
    city: '深圳',
    province: '广东',
    cityTier: 1,
    region: '华南',
    tags: ['双一流培育', '省重点'],
    faculty: {
      summary: '非 985/211，但地处深圳、财力雄厚、上升势头猛。',
      keyDisciplines: ['计算机科学与技术', '建筑学', '光学工程'],
      rating: 'B+',
    },
    environment: {
      campus: '校园现代、设施豪华，腾讯等名企就在身边。',
      teaching: '与深圳产业结合紧密，实习便利。',
      dormitory: '宿舍条件全国领先，部分带空调独卫。',
    },
    transfer: { difficulty: 'easy', policy: '转专业政策较为开放。' },
  },
  {
    id: 'hit',
    name: '哈尔滨工业大学',
    city: '哈尔滨',
    province: '黑龙江',
    cityTier: 2,
    region: '东北',
    tags: ['985', '211', '双一流', 'C9'],
    faculty: {
      summary: '航天与工科王牌，C9 名校，性价比高（地理位置压低分数线）。',
      keyDisciplines: ['航空宇航科学与技术', '材料科学与工程', '控制科学'],
      rating: 'A+',
    },
    environment: {
      campus: '校风严谨扎实，冬季寒冷。',
      teaching: '工科训练硬核，航天系统就业对口。',
      dormitory: '宿舍条件中等，有暖气。',
    },
    transfer: { difficulty: 'moderate', policy: '大类培养，转专业需绩点。' },
  },
  {
    id: 'xidian',
    name: '西安电子科技大学',
    city: '西安',
    province: '陕西',
    cityTier: 2,
    region: '西北',
    tags: ['211', '双一流'],
    faculty: {
      summary: '电子信息与通信强校，与电子科大并称“两电一邮”。',
      keyDisciplines: ['信息与通信工程', '电子科学与技术'],
      rating: 'A+',
    },
    environment: {
      campus: '南校区较新，西安生活成本低。',
      teaching: '电子类就业强，行业认可度高。',
      dormitory: '南校区四人间，条件较好。',
    },
    transfer: { difficulty: 'moderate', policy: '电子信息大类内部流动较易。' },
  },
  {
    id: 'suda',
    name: '苏州大学',
    city: '苏州',
    province: '江苏',
    cityTier: 1,
    region: '华东',
    tags: ['211', '双一流'],
    faculty: {
      summary: '地方 211 龙头，纺织与材料、医学有特色。',
      keyDisciplines: ['材料科学与工程', '纺织科学与工程', '临床医学'],
      rating: 'B+',
    },
    environment: {
      campus: '独墅湖校区漂亮，苏州经济发达。',
      teaching: '长三角实习就业便利。',
      dormitory: '新校区四人间，条件好。',
    },
    transfer: { difficulty: 'easy', policy: '转专业机会较多。' },
  },
  {
    id: 'lzu',
    name: '兰州大学',
    city: '兰州',
    province: '甘肃',
    cityTier: 3,
    region: '西北',
    tags: ['985', '211', '双一流'],
    faculty: {
      summary: '老牌 985，化学与大气科学顶尖，因地处西北分数被低估（性价比之王）。',
      keyDisciplines: ['化学', '大气科学', '草学'],
      rating: 'A',
    },
    environment: {
      campus: '校风朴实，气候干燥，生活成本低。',
      teaching: '基础学科扎实，保研出国比例可观。',
      dormitory: '宿舍条件一般，老校区偏旧。',
    },
    transfer: { difficulty: 'easy', policy: '转专业相对宽松。' },
  },
  {
    id: 'zzu',
    name: '郑州大学',
    city: '郑州',
    province: '河南',
    cityTier: 2,
    region: '华中',
    tags: ['211', '双一流'],
    faculty: {
      summary: '河南唯一 211，规模大、招生多，本地就业认可度高。',
      keyDisciplines: ['材料科学与工程', '临床医学', '化学'],
      rating: 'B',
    },
    environment: {
      campus: '主校区超大，设施较新。',
      teaching: '综合性强，省内资源集中。',
      dormitory: '四人间为主，条件中等。',
    },
    transfer: { difficulty: 'moderate', policy: '设转专业考核，名额有限。' },
  },
  {
    id: 'ncu',
    name: '南昌大学',
    city: '南昌',
    province: '江西',
    cityTier: 2,
    region: '华中',
    tags: ['211', '双一流'],
    faculty: {
      summary: '江西龙头 211，食品科学全国领先，分数性价比突出。',
      keyDisciplines: ['食品科学与工程', '材料科学与工程'],
      rating: 'B+',
    },
    environment: {
      campus: '前湖校区大而新，环境优美。',
      teaching: '省内就业资源集中。',
      dormitory: '四人间，条件中上。',
    },
    transfer: { difficulty: 'easy', policy: '转专业政策开放，机会较多。' },
  },
];

/** Two representative majors per university (display + 选科 filter + 转专业). */
const MAJORS: Record<string, Array<Omit<Major, 'id' | 'universityId' | 'lastUpdatedAt'>>> = {
  tsinghua: [
    {
      name: '计算机科学与技术',
      category: '工学',
      facultyStrength: '学科评估 A+，姚班/智班顶尖。',
      employmentOutlook: '人工智能/互联网大厂首选，薪资天花板。',
      requiredSubjects: ['物理'],
    },
    {
      name: '电子信息类',
      category: '工学',
      facultyStrength: '电子工程系实力顶尖。',
      employmentOutlook: '芯片、通信、AI 硬件需求旺盛。',
      requiredSubjects: ['物理'],
    },
  ],
  sjtu: [
    {
      name: '临床医学（八年制）',
      category: '医学',
      facultyStrength: '附属瑞金/仁济医院，临床资源顶尖。',
      employmentOutlook: '长学制直博，三甲医院就业。',
      requiredSubjects: ['物理'],
    },
    {
      name: '电子信息类',
      category: '工学',
      facultyStrength: '信息学院师资强。',
      employmentOutlook: '上海集成电路与互联网产业旺。',
      requiredSubjects: ['物理'],
    },
  ],
  zju: [
    {
      name: '计算机科学与技术',
      category: '工学',
      facultyStrength: 'CS 学科评估 A+。',
      employmentOutlook: '阿里系/互联网就业极强。',
      requiredSubjects: ['物理'],
    },
    {
      name: '工科试验班',
      category: '工学',
      facultyStrength: '大类培养，转专业灵活。',
      employmentOutlook: '分流面广，深造率高。',
      requiredSubjects: ['物理'],
    },
  ],
  hust: [
    {
      name: '光电信息科学与工程',
      category: '工学',
      facultyStrength: '武汉光电国家研究中心支撑。',
      employmentOutlook: '光通信、激光、显示行业需求大。',
      requiredSubjects: ['物理'],
    },
    {
      name: '临床医学',
      category: '医学',
      facultyStrength: '同济医学院实力强。',
      employmentOutlook: '三甲医院就业稳定。',
      requiredSubjects: ['物理'],
    },
  ],
  uestc: [
    {
      name: '电子科学与技术',
      category: '工学',
      facultyStrength: '电子信息全国第一梯队。',
      employmentOutlook: '芯片/通信对口就业，行业认可度极高。',
      requiredSubjects: ['物理'],
    },
    {
      name: '计算机科学与技术',
      category: '工学',
      facultyStrength: '软硬结合培养。',
      employmentOutlook: '成渝电子产业带就业旺。',
      requiredSubjects: ['物理'],
    },
  ],
  whu: [
    {
      name: '遥感科学与技术',
      category: '工学',
      facultyStrength: '测绘遥感世界第一。',
      employmentOutlook: '北斗、地理信息、自动驾驶感知。',
      requiredSubjects: ['物理'],
    },
    {
      name: '法学',
      category: '法学',
      facultyStrength: '法学院老牌强势。',
      employmentOutlook: '法检、律所、公务员路径清晰。',
      requiredSubjects: [],
    },
  ],
  bupt: [
    {
      name: '通信工程',
      category: '工学',
      facultyStrength: '信通学科 A+。',
      employmentOutlook: '运营商、华为中兴、互联网通信岗。',
      requiredSubjects: ['物理'],
    },
    {
      name: '计算机科学与技术',
      category: '工学',
      facultyStrength: '校招资源顶级。',
      employmentOutlook: '北京互联网大厂对口。',
      requiredSubjects: ['物理'],
    },
  ],
  szu: [
    {
      name: '计算机科学与技术',
      category: '工学',
      facultyStrength: '腾讯创始团队母校，产业联系强。',
      employmentOutlook: '深圳大厂实习就业便利。',
      requiredSubjects: ['物理'],
    },
    {
      name: '建筑学',
      category: '工学',
      facultyStrength: '建筑学院有特色。',
      employmentOutlook: '粤港澳大湾区建设需求。',
      requiredSubjects: ['物理'],
    },
  ],
  hit: [
    {
      name: '飞行器设计与工程',
      category: '工学',
      facultyStrength: '航天王牌，国防系统对口。',
      employmentOutlook: '航天院所、军工就业稳定体面。',
      requiredSubjects: ['物理'],
    },
    {
      name: '计算机科学与技术',
      category: '工学',
      facultyStrength: 'CS 实力强，性价比高。',
      employmentOutlook: '深圳校区+大厂校招通道。',
      requiredSubjects: ['物理'],
    },
  ],
  xidian: [
    {
      name: '通信工程',
      category: '工学',
      facultyStrength: '“两电一邮”，信通 A+。',
      employmentOutlook: '电子通信行业认可度极高。',
      requiredSubjects: ['物理'],
    },
    {
      name: '集成电路设计与集成系统',
      category: '工学',
      facultyStrength: '微电子学院实力强。',
      employmentOutlook: '芯片产业紧缺人才。',
      requiredSubjects: ['物理'],
    },
  ],
  suda: [
    {
      name: '材料科学与工程',
      category: '工学',
      facultyStrength: '材料学科有 ESI 优势。',
      employmentOutlook: '长三角制造业就业。',
      requiredSubjects: ['物理'],
    },
    {
      name: '临床医学',
      category: '医学',
      facultyStrength: '苏大附一院支撑。',
      employmentOutlook: '江苏医疗系统就业。',
      requiredSubjects: ['物理'],
    },
  ],
  lzu: [
    {
      name: '化学',
      category: '理学',
      facultyStrength: '化学学科 A，基础研究强。',
      employmentOutlook: '保研深造率高，科研路径好。',
      requiredSubjects: ['物理'],
    },
    {
      name: '大气科学',
      category: '理学',
      facultyStrength: '大气科学全国领先。',
      employmentOutlook: '气象系统、环境领域对口。',
      requiredSubjects: ['物理'],
    },
  ],
  zzu: [
    {
      name: '临床医学',
      category: '医学',
      facultyStrength: '附属医院体量大。',
      employmentOutlook: '河南医疗系统认可度高。',
      requiredSubjects: ['物理'],
    },
    {
      name: '材料科学与工程',
      category: '工学',
      facultyStrength: '有国家重点实验室。',
      employmentOutlook: '本地制造业就业。',
      requiredSubjects: ['物理'],
    },
  ],
  ncu: [
    {
      name: '食品科学与工程',
      category: '工学',
      facultyStrength: '食品学科全国领先，有院士团队。',
      employmentOutlook: '食品行业龙头企业对口。',
      requiredSubjects: ['物理'],
    },
    {
      name: '材料科学与工程',
      category: '工学',
      facultyStrength: '材料学科有特色。',
      employmentOutlook: '长珠闽就业辐射。',
      requiredSubjects: ['物理'],
    },
  ],
};

function buildRankTables(updatedAt: string): RankTable[] {
  const def: Array<{ province: string; track: Track; scores: number[]; ranks: number[] }> = [
    {
      province: '河北',
      track: '物理',
      scores: [700, 680, 660, 640, 620, 600, 580, 560, 540, 520, 500, 480, 460, 445],
      ranks: [
        60, 520, 2100, 6200, 14000, 26500, 42000, 62000, 88000, 120000, 158000, 205000, 262000,
        330000,
      ],
    },
    {
      province: '山东',
      track: '综合',
      scores: [700, 680, 660, 640, 620, 600, 580, 560, 540, 520, 500, 480, 460, 444],
      ranks: [
        120, 900, 3000, 8000, 17000, 31000, 49000, 71000, 99000, 135000, 178000, 228000, 288000,
        360000,
      ],
    },
    {
      province: '四川',
      track: '理科',
      scores: [700, 680, 660, 640, 620, 600, 580, 560, 540, 525],
      ranks: [200, 1100, 3500, 9000, 19000, 34000, 53000, 78000, 110000, 150000],
    },
  ];
  // Current-year (2025) tables; plus a prior-year (2024) table for 河北·物理.
  const tables: RankTable[] = def.map((d) => ({
    id: `${d.province}:2025:${d.track}`,
    province: d.province,
    year: 2025,
    track: d.track,
    buckets: d.scores.map((score, i) => ({ score, cumulativeRank: d.ranks[i] })),
    source: 'mock://yifenyiduan/2025',
    lastUpdatedAt: updatedAt,
  }));
  const hb = def[0];
  tables.push({
    id: `河北:2024:物理`,
    province: '河北',
    year: 2024,
    track: '物理',
    buckets: hb.scores.map((score, i) => ({
      score,
      cumulativeRank: Math.round(hb.ranks[i] * 0.97),
    })),
    source: 'mock://yifenyiduan/2024',
    lastUpdatedAt: updatedAt,
  });
  return tables;
}

function buildProvincialLines(updatedAt: string): ProvincialScoreLine[] {
  const rows: Array<Omit<ProvincialScoreLine, 'id' | 'lastUpdatedAt'>> = [
    { province: '河北', year: 2023, track: '物理', batch: '本科批', minScore: 439, source: 'mock' },
    { province: '河北', year: 2024, track: '物理', batch: '本科批', minScore: 448, source: 'mock' },
    { province: '河北', year: 2025, track: '物理', batch: '本科批', minScore: 445, source: 'mock' },
    { province: '河北', year: 2023, track: '历史', batch: '本科批', minScore: 430, source: 'mock' },
    { province: '河北', year: 2024, track: '历史', batch: '本科批', minScore: 449, source: 'mock' },
    { province: '河北', year: 2025, track: '历史', batch: '本科批', minScore: 448, source: 'mock' },
    {
      province: '河北',
      year: 2025,
      track: '物理',
      batch: '特殊类型招生控制线',
      minScore: 518,
      source: 'mock',
    },
    { province: '山东', year: 2023, track: '综合', batch: '一段线', minScore: 443, source: 'mock' },
    { province: '山东', year: 2024, track: '综合', batch: '一段线', minScore: 444, source: 'mock' },
    { province: '山东', year: 2025, track: '综合', batch: '一段线', minScore: 438, source: 'mock' },
    {
      province: '四川',
      year: 2023,
      track: '理科',
      batch: '本科一批',
      minScore: 520,
      source: 'mock',
    },
    {
      province: '四川',
      year: 2024,
      track: '理科',
      batch: '本科一批',
      minScore: 539,
      source: 'mock',
    },
    {
      province: '四川',
      year: 2025,
      track: '理科',
      batch: '本科一批',
      minScore: 525,
      source: 'mock',
    },
    {
      province: '四川',
      year: 2025,
      track: '文科',
      batch: '本科一批',
      minScore: 530,
      source: 'mock',
    },
  ];
  return rows.map((r) => ({
    ...r,
    id: `${r.province}:${r.year}:${r.track}:${r.batch}`,
    lastUpdatedAt: updatedAt,
  }));
}

function buildAdmissionLines(rankTables: RankTable[], updatedAt: string): AdmissionLine[] {
  const lines: AdmissionLine[] = [];
  for (const base of BASELINE) {
    for (const { province, track } of SUPPORTED_COMBOS) {
      const offset = PROVINCE_OFFSET[province] ?? 0;
      for (const year of YEARS) {
        // Year delta: down-trend schools fall over time → cheaper now (黑马).
        const yearDelta =
          base.trend === 'down'
            ? year === 2023
              ? 10
              : year === 2024
                ? 6
                : 0
            : year === 2023
              ? -2
              : year === 2024
                ? 3
                : 0;
        const minScore = base.score2025 + offset + yearDelta;
        let minRank: number | undefined;
        if (year === 2025) {
          const table = rankTables.find(
            (t) => t.province === province && t.track === track && t.year === 2025,
          );
          const r = scoreToRank(minScore, table);
          if (r !== null) minRank = r;
        }
        lines.push({
          id: `${base.id}:_:${province}:${year}:${track}`,
          universityId: base.id,
          province,
          year,
          track,
          minScore,
          minRank,
          source: 'mock://tourudangxian',
          lastUpdatedAt: updatedAt,
        });
      }
    }
  }
  return lines;
}

export class MockFetcher implements DataFetcher {
  readonly name = 'mock';

  async fetchProvincialLines(): Promise<ProvincialScoreLine[]> {
    return buildProvincialLines(nowIso());
  }

  async fetchRankTables(): Promise<RankTable[]> {
    return buildRankTables(nowIso());
  }

  async fetchUniversities(): Promise<University[]> {
    const updatedAt = nowIso();
    return UNIVERSITIES.map((u) => ({ ...u, lastUpdatedAt: updatedAt }));
  }

  async fetchMajors(): Promise<Major[]> {
    const updatedAt = nowIso();
    const out: Major[] = [];
    for (const [universityId, majors] of Object.entries(MAJORS)) {
      majors.forEach((m, i) => {
        out.push({ ...m, id: `${universityId}:m${i}`, universityId, lastUpdatedAt: updatedAt });
      });
    }
    return out;
  }

  async fetchAdmissionLines(): Promise<AdmissionLine[]> {
    const updatedAt = nowIso();
    return buildAdmissionLines(buildRankTables(updatedAt), updatedAt);
  }
}
