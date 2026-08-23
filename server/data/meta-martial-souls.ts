import type { MartialSoulRarity } from "../../shared/game.js";
import type { MartialSoulTemplate } from "../domain/model.js";

export interface MetaMartialSoulDefinition extends MartialSoulTemplate {
  metaRarity: MartialSoulRarity;
  growthRoutes: string[];
  drawWeight: number;
}

const soul = (
  id: string, name: string, category: string, metaRarity: MartialSoulRarity,
  description: string, soulPowerRange: [number, number], growthRoutes: string[], drawWeight: number,
): MetaMartialSoulDefinition => ({
  id, name, category, metaRarity, description, soulPowerRange, growthRoutes, drawWeight,
  sourceEra: "局外",
  rarity: drawWeight,
  omens: [`靠近与${name}相合的环境时，魂力会出现轻微共鸣`, `梦中曾短暂看见${name}的轮廓`],
});

export const META_MARTIAL_SOULS: MetaMartialSoulDefinition[] = [
  soul("white-stone-shield", "河纹石盾", "器武魂", "白色", "结构朴素、根基稳定的防御武魂。", [1, 5], ["纯防御", "反震", "阵地守护"], 70),
  soul("white-reed", "风芦", "植物", "白色", "常见芦草的变异种，擅长感知气流。", [1, 5], ["风感", "缠绕", "轻身辅助"], 70),
  soul("white-hound", "灰脊犬", "兽武魂", "白色", "嗅觉与追踪突出，正面上限普通。", [1, 5], ["追踪", "协同", "近战撕咬"], 70),
  soul("white-needle", "穿布针", "器武魂", "白色", "细小但精准，适合走控制与暗器路线。", [1, 5], ["精准", "魂力丝线", "破绽打击"], 70),
  soul("blue-frost-bow", "凝霜短弓", "器武魂", "蓝色", "能在箭矢上附着缓慢积累的寒意。", [3, 7], ["寒矢", "远程控制", "冰爆"], 34),
  soul("blue-shadow-cat", "夜行影猫", "兽武魂", "蓝色", "擅长低光环境和短距爆发。", [3, 7], ["潜行", "敏攻", "暗影分身"], 34),
  soul("blue-mist-orchid", "雾心兰", "植物", "蓝色", "花雾可遮蔽感知并缓慢安抚精神。", [3, 7], ["雾场", "精神辅助", "幻觉控制"], 34),
  soul("blue-bronze-bell", "镇魂铜铃", "器武魂", "蓝色", "铃音对精神与魂力节奏有干扰效果。", [3, 8], ["音波", "精神防护", "群体节奏"], 32),
  soul("blue-ironbone", "铁骨", "本体武魂", "蓝色", "让骨骼随锻炼持续强化，成长扎实。", [3, 8], ["炼体", "抗震", "骨甲"], 32),
  soul("purple-thunder-vine", "雷狱藤", "植物", "紫色", "藤蔓能储存雷电并在接触时释放。", [5, 9], ["雷缚", "雷电领域", "吞噬雷霆"], 16),
  soul("purple-star-compass", "星轨罗盘", "器武魂", "紫色", "可记录目标气息与空间方向。", [5, 9], ["追踪定位", "轨迹预判", "短距空间锚"], 16),
  soul("purple-jade-fox", "九窍玉狐", "兽武魂", "紫色", "精神、变化与智慧兼具的狐类武魂。", [5, 9], ["幻术", "精神魅惑", "九窍蜕变"], 14),
  soul("purple-blood-cauldron", "血髓炉", "器武魂", "紫色", "能淬炼气血，也容易走向掠夺。", [5, 9], ["气血炼体", "疗伤", "吞噬邪路"], 12),
  soul("purple-void-eye", "虚痕之瞳", "本体武魂", "紫色", "能看见魂力流动留下的短暂痕迹。", [5, 10], ["魂力视界", "弱点洞察", "空间裂痕"], 11),
  soul("gold-sun-crow", "大日金乌", "兽武魂", "金色", "携带太阳真火意象的顶级飞行兽武魂。", [7, 10], ["太阳真火", "极速飞行", "大日领域"], 5.2),
  soul("gold-moon-wheel", "太阴月轮", "器武魂", "金色", "寒月凝成的轮刃，兼有精神与冰寒。", [7, 10], ["月刃", "太阴寒气", "月相领域"], 5.2),
  soul("gold-kirin", "瑞麟", "兽武魂", "金色", "兼具力量、元素亲和与祥瑞感知。", [7, 10], ["五行亲和", "瑞兆辅助", "麒麟真身"], 4.8),
  soul("gold-heaven-book", "天衍书", "器武魂", "金色", "书页会记录已理解的规则，无法凭空给出答案。", [7, 10], ["推演", "能力复刻解析", "规则领域"], 4.5),
  soul("gold-phoenix", "涅槃火凤", "兽武魂", "金色", "拥有强大火焰与一次次蜕变的潜力。", [7, 10], ["凤火", "涅槃恢复", "凤凰领域"], 4.5),
  soul("gold-world-tree", "小世界树", "植物", "金色", "幼苗阶段极弱，但能随环境与魂环形成生态。", [6, 10], ["生命辅助", "元素枝系", "领域生态"], 4.3),
  soul("red-chaos-hammer", "混沌重锤", "器武魂", "红色", "能在反复锻造与战斗中吸收材料特性，初生时仍只是一柄沉重铁锤。", [8, 10], ["极致力量", "材料熔炼", "混沌锻界"], 0.9),
  soul("red-twelve-wing", "十二翼圣光天使", "兽武魂", "红色", "神圣、飞行与净化潜力极高，也会引起武魂殿最高层注意。", [9, 10], ["圣光", "天使领域", "审判神性"], 0.72),
  soul("red-devouring-kun", "吞天鲲", "兽武魂", "红色", "以吞噬能量成长，但承载与消化始终限制上限。", [8, 10], ["吞噬", "空间胃囊", "鲲鹏蜕变"], 0.78),
  soul("red-time-clock", "岁月古钟", "器武魂", "红色", "只能影响极短时间感知，越级使用会反噬寿命。", [8, 10], ["迟缓", "时间感知", "岁月领域"], 0.65),
  soul("red-chaos-lotus", "混沌青莲", "植物", "红色", "能调和多种相容力量，成长所需资源极其庞大。", [8, 10], ["净化", "体系调和", "混沌领域"], 0.62),
  soul("red-supreme-bone", "至尊骨", "本体武魂", "红色", "胸骨孕育天赋宝术的本体武魂，需要长期温养而非开局无敌。", [8, 10], ["骨文", "天赋宝术", "重瞳共鸣"], 0.58),
  soul("red-xuanyuan", "轩辕剑", "器武魂", "红色", "承载人道与剑道意象的古剑武魂，必须通过功德、选择与战斗逐层复苏。", [8, 10], ["剑道", "人道气运", "圣剑领域"], 0.5),
  soul("red-nine-dragon", "九龙神火罩", "器武魂", "红色", "初期只能唤出一缕龙形火，九火齐聚需要漫长成长。", [8, 10], ["龙火", "封困", "九火领域"], 0.48),
  soul("rainbow-ancestral-dragon", "祖龙", "兽武魂", "七彩", "龙族源流意象在斗罗规则下形成的武魂。幼年只显一枚逆鳞，每次进化都要承受血脉天劫。", [9, 10], ["万龙威压", "祖龙真身", "龙族规则"], 0.09),
  soul("rainbow-creation-lotus", "创世青莲", "植物", "七彩", "并非现成神位，而是一株必须吸收世界规则才能展开莲瓣的幼莲。", [9, 10], ["造化生机", "规则莲瓣", "创世领域"], 0.07),
  soul("rainbow-pangu-axe", "盘古斧影", "器武魂", "七彩", "只是一道受世界压制的开天意象，初期连完整斧形都无法维持。", [9, 10], ["极致破甲", "空间切割", "开天真意"], 0.05),
  soul("rainbow-dao-body", "先天道体", "本体武魂", "七彩", "对相容修炼体系有极高理解力，但力量仍必须逐级修炼。", [9, 10], ["万法亲和", "悟道", "道域"], 0.04),
];

export function metaSoulById(id: string): MetaMartialSoulDefinition | undefined {
  return META_MARTIAL_SOULS.find((item) => item.id === id);
}
