import type { MartialSoulRarity } from "./game.js";

export type HeirloomEffectKind = "huntIntel" | "travelGuide" | "trainingCalm" | "tradeInsight" | "factionIntroduction" | "mentalRescue" | "ringAssessment" | "promiseWitness" | "craftSalvage" | "anomalyCompass" | "causalReview" | "memoryAnchor";

export interface HeirloomDefinition {
  id: string;
  name: string;
  rarity: Extract<MartialSoulRarity, "紫色" | "金色" | "红色">;
  description: string;
  effect: string;
  trigger: string;
  effectKind: HeirloomEffectKind;
  actionCommand?: string;
  maxUses: number;
  drawWeight: number;
  summonable: boolean;
}

export const HEIRLOOMS: HeirloomDefinition[] = [
  { id: "heirloom-field-notes", name: "猎魂手记", rarity: "紫色", description: "几代猎魂人补写过的薄册，页角沾着已经发黑的树脂。", effect: "每局最多3次，猎魂调查额外获得高可信生态情报，发现进度+5。", trigger: "调查魂兽或推进猎魂追踪", effectKind: "huntIntel", maxUses: 3, drawWeight: 16, summonable: true },
  { id: "heirloom-worn-map", name: "旧大陆行图", rarity: "紫色", description: "边角磨白的行路图，只画已经有人走过的道路。", effect: "每局最多3次，普通旅行耗时降低70%；仍需路费并照常承受途中危险。", trigger: "完成正常旅行", effectKind: "travelGuide", maxUses: 3, drawWeight: 16, summonable: true },
  { id: "heirloom-meditation-bead", name: "静心木珠", rarity: "紫色", description: "木珠没有魂力波动，握久了能让呼吸慢下来。", effect: "每局最多3次，修炼或训练后疲劳降低50点并恢复15点健康；不能越过魂环瓶颈。", trigger: "完成修炼或训练", effectKind: "trainingCalm", maxUses: 3, drawWeight: 15, summonable: true },
  { id: "heirloom-trade-token", name: "商路信牌", rarity: "紫色", description: "旧商队留下的铜牌，部分正规商铺仍认上面的防伪刻痕。", effect: "每局最多3次，正规交易或询价后返还30枚金魂币，并留下真实市价记录。", trigger: "正规交易或询价", effectKind: "tradeInsight", maxUses: 3, drawWeight: 14, summonable: true },
  { id: "heirloom-sect-letter", name: "无署名荐书", rarity: "紫色", description: "没有落款的旧荐书，纸张和格式足以换来一次正式问话。", effect: "每局最多2次，学院或势力申请必定进入正式面谈，接待者敬重+50、信任+25；仍不保证录取。", trigger: "申请学院或加入势力", effectKind: "factionIntroduction", maxUses: 2, drawWeight: 13, summonable: true },
  { id: "heirloom-soul-lamp", name: "温魂灯芯", rarity: "金色", description: "一截始终温热的灯芯，只有精神濒临崩溃时才会亮。", effect: "每局最多2次，疲劳达到50点后立刻降低80点并恢复30点健康；不能复活。", trigger: "行动后疲劳达到50点", effectKind: "mentalRescue", maxUses: 2, drawWeight: 5, summonable: true },
  { id: "heirloom-ring-ruler", name: "魂环量尺", rarity: "金色", description: "刻度并不漂亮，却记录了许多失败吸收留下的修正。", effect: "每局最多2次，吸收魂环时有效承载上限提高75%，并公开修正后的风险；仍可能失败或受伤。", trigger: "开始吸收魂环", effectKind: "ringAssessment", maxUses: 2, drawWeight: 5, summonable: true },
  { id: "heirloom-oath-seal", name: "守诺印泥", rarity: "金色", description: "印泥只认双方自愿按下的手印，不认口头胁迫。", effect: "每局最多2次，有效承诺获得额外履约凭据；承诺对象对主角信任+35。", trigger: "作出有效承诺", effectKind: "promiseWitness", maxUses: 2, drawWeight: 4.5, summonable: true },
  { id: "heirloom-forge-core", name: "百炼炉心", rarity: "金色", description: "从废炉中取出的暗红炉心，仍记得材料崩裂前的温度。", effect: "每局最多2次，制作或锻造失败时返还4份回收材料，并把失败转化为15点职业进度。", trigger: "制作、锻造或炼制失败", effectKind: "craftSalvage", maxUses: 2, drawWeight: 4, summonable: true },
  { id: "heirloom-star-compass", name: "星痕罗盘", rarity: "金色", description: "指针不会指北，却能把一条已经走通的路压缩到最短。", effect: "每局最多2次，为下一次普通旅行规划捷径，使其耗时降低85%；不能用于跨星球航行。", trigger: "玩家主动使用后完成一次普通旅行", effectKind: "anomalyCompass", actionCommand: "使用星痕罗盘规划捷径", maxUses: 2, drawWeight: 3.5, summonable: true },
  { id: "heirloom-causal-thread", name: "因果残线", rarity: "红色", description: "一根几乎看不见的细线，能替持有者截住一次已经逼近的坏结果。", effect: "每局一次，下一次非死亡失败后将健康恢复至满值、疲劳清零并移除最近两项伤势；不能逆转死亡或胜负。", trigger: "玩家主动使用后遭遇一次非死亡失败", effectKind: "causalReview", actionCommand: "使用因果残线护住下一次失败", maxUses: 1, drawWeight: 0.8, summonable: true },
  { id: "heirloom-time-anchor", name: "岁月锚钉", rarity: "红色", description: "钉身布满日期刻痕，握住时能让一小段时间变得格外充裕。", effect: "每局一次，接下来5次非战斗行动耗时降低80%，并写入长期记忆；不能影响战斗、年龄或原作年份。", trigger: "玩家主动使用", effectKind: "memoryAnchor", actionCommand: "使用岁月锚钉固定五次行动", maxUses: 1, drawWeight: 0.6, summonable: true },
  { id: "heirloom-old-hunt-notes", name: "旧猎魂笔记", rarity: "紫色", description: "上一世留下的猎魂记录，纸上只有已经亲自验证过的路线。", effect: "每局最多3次，猎魂调查额外获得高可信生态情报，发现进度+5。", trigger: "调查魂兽或推进猎魂追踪", effectKind: "huntIntel", maxUses: 3, drawWeight: 0, summonable: false },
];

export function heirloomByName(name?: string): HeirloomDefinition | undefined {
  return HEIRLOOMS.find((item) => item.name === name);
}
