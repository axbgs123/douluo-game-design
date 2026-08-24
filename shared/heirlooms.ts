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
  drawWeight: number;
  summonable: boolean;
}

export const HEIRLOOMS: HeirloomDefinition[] = [
  { id: "heirloom-field-notes", name: "猎魂手记", rarity: "紫色", description: "几代猎魂人补写过的薄册，页角沾着已经发黑的树脂。", effect: "本局第一次调查魂兽或追踪猎魂目标时，额外取得一条可靠生态线索并增加一次发现。", trigger: "首次调查魂兽或推进猎魂追踪", effectKind: "huntIntel", drawWeight: 16, summonable: true },
  { id: "heirloom-worn-map", name: "旧大陆行图", rarity: "紫色", description: "边角磨白的行路图，只画已经有人走过的道路。", effect: "本局第一次正常旅行耗时降低15%，同时标记这条路线已核验；不会免除路费和危险。", trigger: "首次正常旅行", effectKind: "travelGuide", drawWeight: 16, summonable: true },
  { id: "heirloom-meditation-bead", name: "静心木珠", rarity: "紫色", description: "木珠没有魂力波动，握久了能让呼吸慢下来。", effect: "本局第一次修炼结束时减少10点疲劳，不能突破等级或魂环瓶颈。", trigger: "首次完成修炼", effectKind: "trainingCalm", drawWeight: 15, summonable: true },
  { id: "heirloom-trade-token", name: "商路信牌", rarity: "紫色", description: "旧商队留下的铜牌，部分正规商铺仍认上面的防伪刻痕。", effect: "本局第一次正规交易或询价后返还2枚金魂币，并把真实市价写入判定记录。", trigger: "首次正规交易或询价", effectKind: "tradeInsight", drawWeight: 14, summonable: true },
  { id: "heirloom-sect-letter", name: "无署名荐书", rarity: "紫色", description: "没有落款的旧荐书，纸张和格式足以换来一次正式问话。", effect: "本局第一次申请学院或加入势力时，获得正式陈述机会，相关接待者敬重提高10；不保证录取。", trigger: "首次申请学院或加入势力", effectKind: "factionIntroduction", drawWeight: 13, summonable: true },
  { id: "heirloom-soul-lamp", name: "温魂灯芯", rarity: "金色", description: "一截始终温热的灯芯，只有精神濒临崩溃时才会亮。", effect: "本局第一次行动后疲劳达到80点时，立刻降低25点疲劳；不能复活或免除伤势。", trigger: "首次达到重度精神疲劳", effectKind: "mentalRescue", drawWeight: 5, summonable: true },
  { id: "heirloom-ring-ruler", name: "魂环量尺", rarity: "金色", description: "刻度并不漂亮，却记录了许多失败吸收留下的修正。", effect: "本局第一次进入猎魂或吸收评估时，公开当前魂环承载风险与缺失条件。", trigger: "首次猎魂或魂环吸收评估", effectKind: "ringAssessment", drawWeight: 5, summonable: true },
  { id: "heirloom-oath-seal", name: "守诺印泥", rarity: "金色", description: "印泥只认双方自愿按下的手印，不认口头胁迫。", effect: "本局第一次作出承诺时，将原话、对象和日期写入证据，日后履约判定获得一条额外证明。", trigger: "首次作出有效承诺", effectKind: "promiseWitness", drawWeight: 4.5, summonable: true },
  { id: "heirloom-forge-core", name: "百炼炉心", rarity: "金色", description: "从废炉中取出的暗红炉心，仍记得材料崩裂前的温度。", effect: "本局第一次制作或锻造失败时，返还一份回收材料，并记录失败原因。", trigger: "首次制作或锻造失败", effectKind: "craftSalvage", drawWeight: 4, summonable: true },
  { id: "heirloom-star-compass", name: "星痕罗盘", rarity: "金色", description: "指针不会指北，只会朝已经到访地点中最异常的一处偏转。", effect: "每局一次，从已发现地点中指出一个异常方向并生成可调查线索。", trigger: "玩家主动使用", effectKind: "anomalyCompass", actionCommand: "使用星痕罗盘寻找异常", drawWeight: 3.5, summonable: true },
  { id: "heirloom-causal-thread", name: "因果残线", rarity: "红色", description: "一根几乎看不见的细线，会在重大结果之后缠住最容易漏看的前因。", effect: "每局一次，回看最近三项行动记录，指出一条已经发生但容易忽略的直接前因；不会改写结果。", trigger: "玩家主动使用且已有行动记录", effectKind: "causalReview", actionCommand: "使用因果残线回看前因", drawWeight: 0.8, summonable: true },
  { id: "heirloom-time-anchor", name: "岁月锚钉", rarity: "红色", description: "钉身布满日期刻痕，握住时能把眼前细节压进长期记忆。", effect: "每局一次，把当前地点、时间、目标与未决事项写入故事手记，防止后续叙事遗忘；不会倒流时间。", trigger: "玩家主动使用", effectKind: "memoryAnchor", actionCommand: "使用岁月锚钉记录当前节点", drawWeight: 0.6, summonable: true },
  { id: "heirloom-old-hunt-notes", name: "旧猎魂笔记", rarity: "紫色", description: "上一世留下的猎魂记录，纸上只有已经亲自验证过的路线。", effect: "本局第一次调查魂兽或追踪猎魂目标时，额外取得一条可靠生态线索并增加一次发现。", trigger: "首次调查魂兽或推进猎魂追踪", effectKind: "huntIntel", drawWeight: 0, summonable: false },
];

export function heirloomByName(name?: string): HeirloomDefinition | undefined {
  return HEIRLOOMS.find((item) => item.name === name);
}
