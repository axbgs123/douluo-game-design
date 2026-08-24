import type { CandidateRarity } from "../../shared/game.js";
import type { MartialSoulTemplate } from "../domain/model.js";

type Core = { name: string; category: string; route: string; tags: string[] };

const ASPECTS = [
  ["青岚", "风"], ["赤曜", "火"], ["玄霜", "冰"], ["苍雷", "雷"], ["碧潮", "水"], ["厚土", "土"],
  ["金辉", "光明"], ["墨影", "暗影"], ["星痕", "星辰"], ["月魄", "精神"], ["空鸣", "空间"], ["灵木", "生命"],
  ["毒翡", "毒"], ["岩甲", "防御"], ["迅羽", "敏攻"], ["镇岳", "力量"], ["雾隐", "隐匿"], ["回春", "治疗"],
] as const;

const CORES: Core[] = [
  { name: "猎隼", category: "兽武魂", route: "高速俯冲、视野与追踪", tags: ["飞行", "敏攻"] },
  { name: "角鹿", category: "兽武魂", route: "位移、感知与团队增益", tags: ["辅助", "感知"] },
  { name: "牙狼", category: "兽武魂", route: "持续追猎与协同围攻", tags: ["强攻", "兽"] },
  { name: "甲熊", category: "兽武魂", route: "正面承伤与近身压制", tags: ["防御", "力量"] },
  { name: "灵狐", category: "兽武魂", route: "幻觉、潜行与精神扰动", tags: ["精神", "控制"] },
  { name: "鳞蟒", category: "兽武魂", route: "缠绕、毒性与范围控制", tags: ["控制", "毒"] },
  { name: "战槊", category: "器武魂", route: "穿透、冲阵与中距离压制", tags: ["强攻", "枪"] },
  { name: "折弓", category: "器武魂", route: "蓄力远射、标记与牵制", tags: ["远程", "敏攻"] },
  { name: "纹盾", category: "器武魂", route: "格挡、反震与阵地守护", tags: ["防御", "守护"] },
  { name: "灵琴", category: "器武魂", route: "音律控制、增幅与精神安抚", tags: ["辅助", "控制", "乐器"] },
  { name: "药炉", category: "器武魂", route: "药性提炼、恢复与毒理辨识", tags: ["治疗", "辅助", "药师"] },
  { name: "阵盘", category: "器武魂", route: "区域封锁、侦测与团队增幅", tags: ["控制", "辅助"] },
  { name: "藤萝", category: "植物武魂", route: "束缚、汲取与地形塑造", tags: ["控制", "植物"] },
  { name: "灵芝", category: "植物武魂", route: "恢复、净化与药力增幅", tags: ["治疗", "辅助", "植物"] },
  { name: "荆棘", category: "植物武魂", route: "反伤、缠绕与持续消耗", tags: ["控制", "防御", "植物"] },
  { name: "魂眸", category: "本体武魂", route: "观察、精神冲击与弱点解析", tags: ["精神", "控制", "本体"] },
  { name: "灵骨", category: "本体武魂", route: "体魄强化、承载与爆发", tags: ["力量", "防御", "本体"] },
  { name: "心音", category: "本体武魂", route: "情绪感知、鼓舞与精神共鸣", tags: ["辅助", "精神", "本体"] },
  { name: "云团", category: "元素武魂", route: "遮蔽、位移与范围牵制", tags: ["元素", "控制"] },
  { name: "晶砂", category: "元素武魂", route: "塑形、护壁与磨蚀", tags: ["元素", "防御"] },
  { name: "光轮", category: "元素武魂", route: "远程切割、照明与净化", tags: ["元素", "光明"] },
  { name: "影灯", category: "器武魂", route: "侦察、误导与魂力遮蔽", tags: ["精神", "隐匿", "辅助"] },
  { name: "灵米", category: "食物系器武魂", route: "体力恢复、耐力与行军补给", tags: ["食物", "辅助", "后勤"] },
  { name: "蜜酿", category: "食物系器武魂", route: "魂力恢复、情绪稳定与解毒", tags: ["食物", "治疗", "辅助"] },
];

const GRADES: CandidateRarity[] = ["平凡", "优秀", "优秀", "稀有", "稀有", "传奇"];
const PROFILE: Record<CandidateRarity, { rarity: number; range: [number, number] }> = {
  平凡: { rarity: 15, range: [0, 5] }, 优秀: { rarity: 9, range: [2, 7] }, 稀有: { rarity: 4.5, range: [4, 9] },
  传奇: { rarity: 1.1, range: [6, 10] }, 神话: { rarity: .18, range: [8, 10] },
};

export const ORIGINAL_MARTIAL_SOULS: MartialSoulTemplate[] = ASPECTS.flatMap(([aspect, affinity], aspectIndex) =>
  CORES.map((core, coreIndex) => {
    const grade = GRADES[(aspectIndex * 5 + coreIndex * 3) % GRADES.length];
    const profile = PROFILE[grade];
    const name = `${aspect}${core.name}`;
    return {
      id: `original-${aspectIndex + 1}-${coreIndex + 1}`,
      name,
      category: core.category,
      description: `${affinity}特性与${core.name}形态稳定融合，适合发展${core.route}；强度仍取决于先天魂力、魂环选择与长期训练。`,
      rarity: profile.rarity,
      soulPowerRange: profile.range,
      omens: [`靠近${affinity}气息浓郁的环境时，${name}的轮廓会短暂浮现`, `练习${core.route.split("、")[0]}时，魂力运转比同龄人更顺畅`],
      sourceEra: "原创",
      grade,
      affinityTags: [affinity, ...core.tags],
    };
  }),
);
