import type { MetaSummonHeirloomView } from "../../shared/game.js";

export type MetaHeirloomDefinition = Omit<MetaSummonHeirloomView, "duplicate"> & { drawWeight: number };

export const META_HEIRLOOMS: MetaHeirloomDefinition[] = [
  { id: "heirloom-field-notes", name: "猎魂手记", rarity: "紫色", description: "新一局首次调查魂兽踪迹时，额外保留一条可靠生态线索。", drawWeight: 16 },
  { id: "heirloom-worn-map", name: "旧大陆行图", rarity: "紫色", description: "新一局首次远行前，会标出一条较安全但不免费的路线。", drawWeight: 16 },
  { id: "heirloom-meditation-bead", name: "静心木珠", rarity: "紫色", description: "新一局第一次因修炼积累疲劳时，略微缓和精神负担。", drawWeight: 15 },
  { id: "heirloom-trade-token", name: "商路信牌", rarity: "紫色", description: "新一局首次进行正规交易时，更容易问到真实市价。", drawWeight: 14 },
  { id: "heirloom-sect-letter", name: "无署名荐书", rarity: "紫色", description: "新一局首次拜访宗门时，获得一次说明来意的正式机会，不保证录取。", drawWeight: 13 },
  { id: "heirloom-soul-lamp", name: "温魂灯芯", rarity: "金色", description: "濒临精神崩溃时稳定一次意识，但不能复活或免除伤势。", drawWeight: 5 },
  { id: "heirloom-ring-ruler", name: "魂环量尺", rarity: "金色", description: "吸收魂环前给出承载风险区间，仍需玩家自己取舍。", drawWeight: 5 },
  { id: "heirloom-oath-seal", name: "守诺印泥", rarity: "金色", description: "双方自愿立约后记录原话，能核对违约，不能强迫守约。", drawWeight: 4.5 },
  { id: "heirloom-forge-core", name: "百炼炉心", rarity: "金色", description: "保留一次失败锻造中的关键材料性质，不能凭空补回材料。", drawWeight: 4 },
  { id: "heirloom-star-compass", name: "星痕罗盘", rarity: "金色", description: "每局一次，在已到过的地点间指出最强烈的异常方向。", drawWeight: 3.5 },
  { id: "heirloom-causal-thread", name: "因果残线", rarity: "红色", description: "重大抉择后可回看一次被忽略的前因，但不会改写已经发生的结果。", drawWeight: 0.8 },
  { id: "heirloom-time-anchor", name: "岁月锚钉", rarity: "红色", description: "每局一次保存关键节点的完整记忆；它不倒流时间，只防止线索被遗忘。", drawWeight: 0.6 },
];
