import type { CandidateRarity, MartialSoulRarity } from "./game.js";

export const MARTIAL_SOUL_NAME_UPGRADES: Record<string, string> = {
  霜戈: "玄霜破军戈",
  星痕书: "周天星痕书",
  噬影血藤: "九幽噬影血藤",
};

const NORMAL_SOUL_GRADES: Record<string, CandidateRarity> = {
  蓝银草: "平凡", 百锻锤: "平凡", 青灰隼: "平凡", 岩背龟: "平凡", 方孔铜钱: "平凡", 黑木弓: "平凡",
  墨纹竹: "优秀", 听风藤: "优秀", 铁脊长枪: "优秀", 灰月狼: "优秀", 踏云鹿: "优秀", 铁臂螳螂: "优秀", 沙耳狐: "优秀", 赤棘藤: "优秀",
  明心镜: "稀有", 灵眸: "稀有", 缚魂丝: "稀有", 青纹药鼎: "稀有", 眠心莲: "稀有", 骨纹: "稀有", 灵音: "稀有",
  周天星痕书: "传奇", 七宝琉璃塔: "传奇", 蓝电霸王龙: "传奇", 昊天锤: "传奇", 鎏金天鹅: "传奇", 无字命册: "传奇",
  玄霜破军戈: "神话", 太玄剑胎: "神话", 九幽噬影血藤: "神话",
};

const META_GRADE: Record<MartialSoulRarity, CandidateRarity> = {
  白色: "平凡", 蓝色: "优秀", 紫色: "稀有", 金色: "传奇", 红色: "神话", 七彩: "神话",
};

export function normalizeMartialSoulName(name: string): string {
  return MARTIAL_SOUL_NAME_UPGRADES[name] ?? name;
}

export function martialSoulGrade(name: string, metaRarity?: MartialSoulRarity, maximumSoulPower = 0): CandidateRarity {
  if (metaRarity) return META_GRADE[metaRarity];
  const normalized = normalizeMartialSoulName(name);
  return NORMAL_SOUL_GRADES[normalized]
    ?? (maximumSoulPower >= 10 ? "传奇" : maximumSoulPower >= 9 ? "稀有" : maximumSoulPower >= 7 ? "优秀" : "平凡");
}

export const MARTIAL_SOUL_GRADE_ORDER: CandidateRarity[] = ["平凡", "优秀", "稀有", "传奇", "神话"];
