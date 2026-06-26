/**
 * Location metadata (city / province / region / cityTier) for well-known 985/211
 * universities, used to enrich real schools parsed from 投档表 (which carry names
 * only). Public, stable knowledge.
 *
 * Matching is EXACT by name (not prefix): a clean "北京大学" matches, but a suffixed
 * "哈尔滨工业大学(深圳)" or "山东大学(中外合作办学)" does NOT — because parentheses can
 * mean a different-city campus (深圳/威海) OR just an enrollment category, and we
 * must never assign a wrong city. Unmatched schools simply get no location (the UI
 * and matching degrade gracefully). EDIT/EXTEND freely; the user verifies.
 *
 * cityTier: 1 = 一线/新一线, 2 = 二线, 3 = 三线及以下 (approximate, commonly-used tiers).
 */
import { tagsForSchool } from './universityTags';

type CityMeta = { province: string; region: string; cityTier: 1 | 2 | 3 };

const CITY_META: Record<string, CityMeta> = {
  北京: { province: '北京', region: '华北', cityTier: 1 },
  天津: { province: '天津', region: '华北', cityTier: 1 },
  石家庄: { province: '河北', region: '华北', cityTier: 2 },
  太原: { province: '山西', region: '华北', cityTier: 2 },
  呼和浩特: { province: '内蒙古', region: '华北', cityTier: 3 },
  沈阳: { province: '辽宁', region: '东北', cityTier: 1 },
  大连: { province: '辽宁', region: '东北', cityTier: 1 },
  长春: { province: '吉林', region: '东北', cityTier: 2 },
  延吉: { province: '吉林', region: '东北', cityTier: 3 },
  哈尔滨: { province: '黑龙江', region: '东北', cityTier: 2 },
  上海: { province: '上海', region: '华东', cityTier: 1 },
  南京: { province: '江苏', region: '华东', cityTier: 1 },
  苏州: { province: '江苏', region: '华东', cityTier: 1 },
  无锡: { province: '江苏', region: '华东', cityTier: 2 },
  徐州: { province: '江苏', region: '华东', cityTier: 2 },
  杭州: { province: '浙江', region: '华东', cityTier: 1 },
  合肥: { province: '安徽', region: '华东', cityTier: 1 },
  福州: { province: '福建', region: '华东', cityTier: 2 },
  厦门: { province: '福建', region: '华东', cityTier: 2 },
  南昌: { province: '江西', region: '华中', cityTier: 2 },
  济南: { province: '山东', region: '华东', cityTier: 1 },
  青岛: { province: '山东', region: '华东', cityTier: 1 },
  郑州: { province: '河南', region: '华中', cityTier: 1 },
  武汉: { province: '湖北', region: '华中', cityTier: 1 },
  长沙: { province: '湖南', region: '华中', cityTier: 1 },
  广州: { province: '广东', region: '华南', cityTier: 1 },
  深圳: { province: '广东', region: '华南', cityTier: 1 },
  南宁: { province: '广西', region: '华南', cityTier: 2 },
  海口: { province: '海南', region: '华南', cityTier: 2 },
  重庆: { province: '重庆', region: '西南', cityTier: 1 },
  成都: { province: '四川', region: '西南', cityTier: 1 },
  雅安: { province: '四川', region: '西南', cityTier: 3 },
  贵阳: { province: '贵州', region: '西南', cityTier: 2 },
  昆明: { province: '云南', region: '西南', cityTier: 2 },
  拉萨: { province: '西藏', region: '西南', cityTier: 3 },
  西安: { province: '陕西', region: '西北', cityTier: 1 },
  杨凌: { province: '陕西', region: '西北', cityTier: 3 },
  兰州: { province: '甘肃', region: '西北', cityTier: 3 },
  西宁: { province: '青海', region: '西北', cityTier: 3 },
  银川: { province: '宁夏', region: '西北', cityTier: 3 },
  乌鲁木齐: { province: '新疆', region: '西北', cityTier: 2 },
  石河子: { province: '新疆', region: '西北', cityTier: 3 },
};

/** School (exact name) → city. Covers 985 + the listed 211. */
const SCHOOL_CITY: Record<string, string> = {
  // 985
  北京大学: '北京', 中国人民大学: '北京', 清华大学: '北京', 北京航空航天大学: '北京',
  北京理工大学: '北京', 中国农业大学: '北京', 北京师范大学: '北京', 中央民族大学: '北京',
  南开大学: '天津', 天津大学: '天津', 大连理工大学: '大连', 东北大学: '沈阳',
  吉林大学: '长春', 哈尔滨工业大学: '哈尔滨', 复旦大学: '上海', 同济大学: '上海',
  上海交通大学: '上海', 华东师范大学: '上海', 南京大学: '南京', 东南大学: '南京',
  浙江大学: '杭州', 中国科学技术大学: '合肥', 厦门大学: '厦门', 山东大学: '济南',
  中国海洋大学: '青岛', 武汉大学: '武汉', 华中科技大学: '武汉', 中南大学: '长沙',
  湖南大学: '长沙', 国防科技大学: '长沙', 中山大学: '广州', 华南理工大学: '广州',
  四川大学: '成都', 重庆大学: '重庆', 电子科技大学: '成都', 西安交通大学: '西安',
  西北工业大学: '西安', 兰州大学: '兰州', 西北农林科技大学: '杨凌',
  // 211 (non-985)
  北京交通大学: '北京', 北京工业大学: '北京', 北京科技大学: '北京', 北京化工大学: '北京',
  北京邮电大学: '北京', 北京林业大学: '北京', 北京中医药大学: '北京', 北京外国语大学: '北京',
  中国传媒大学: '北京', 中央财经大学: '北京', 对外经济贸易大学: '北京', 北京体育大学: '北京',
  中央音乐学院: '北京', 中国政法大学: '北京', 华北电力大学: '北京', 天津医科大学: '天津',
  河北工业大学: '天津', 太原理工大学: '太原', 内蒙古大学: '呼和浩特', 辽宁大学: '沈阳',
  大连海事大学: '大连', 延边大学: '延吉', 东北师范大学: '长春', 哈尔滨工程大学: '哈尔滨',
  东北农业大学: '哈尔滨', 东北林业大学: '哈尔滨', 华东理工大学: '上海', 东华大学: '上海',
  上海财经大学: '上海', 上海大学: '上海', 上海外国语大学: '上海', 海军军医大学: '上海',
  苏州大学: '苏州', 南京航空航天大学: '南京', 南京理工大学: '南京', 中国矿业大学: '徐州',
  河海大学: '南京', 江南大学: '无锡', 南京农业大学: '南京', 中国药科大学: '南京',
  南京师范大学: '南京', 安徽大学: '合肥', 合肥工业大学: '合肥', 福州大学: '福州',
  南昌大学: '南昌', 郑州大学: '郑州', 中国地质大学: '武汉', 武汉理工大学: '武汉',
  华中农业大学: '武汉', 华中师范大学: '武汉', 中南财经政法大学: '武汉', 湖南师范大学: '长沙',
  暨南大学: '广州', 华南师范大学: '广州', 广西大学: '南宁', 海南大学: '海口',
  西南交通大学: '成都', 西南财经大学: '成都', 西南大学: '重庆', 四川农业大学: '雅安',
  贵州大学: '贵阳', 云南大学: '昆明', 西藏大学: '拉萨', 西北大学: '西安',
  西安电子科技大学: '西安', 长安大学: '西安', 陕西师范大学: '西安', 青海大学: '西宁',
  宁夏大学: '银川', 新疆大学: '乌鲁木齐', 石河子大学: '石河子', 空军军医大学: '西安',
  中国石油大学: '青岛',
};

export interface SchoolMeta {
  tags: string;
  city: string;
  province: string;
  region: string;
  cityTier: 1 | 2 | 3 | '';
}

/**
 * Resolve enrichment metadata for a school name. Tags use prefix match (a 985
 * campus inherits the tag); city/location use EXACT match (never guess a campus's
 * city). Unknown fields are returned empty.
 */
export function metaForSchool(name: string): SchoolMeta {
  const n = name.trim();
  const tags = tagsForSchool(n);
  const city = SCHOOL_CITY[n];
  if (city && CITY_META[city]) {
    const c = CITY_META[city];
    return { tags, city, province: c.province, region: c.region, cityTier: c.cityTier };
  }
  return { tags, city: '', province: '', region: '', cityTier: '' };
}
