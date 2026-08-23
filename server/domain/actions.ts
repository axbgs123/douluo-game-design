import { randomUUID } from "node:crypto";
import type { ConditionLabel, HuntingStage, NarrativeEntry, SoulRingView, TaskView } from "../../shared/game.js";
import { CANON_CHARACTERS, FACTIONS, SOUL_BEASTS, locationById, soulBeastById } from "../data/world.js";
import type { ActionResolution, StoredGame } from "./model.js";
import { createRandom, integer, pick } from "./random.js";
import { advanceWorldTime, buildKnownFigures, buildMapHierarchy, buildMapView, inferLocationId, recordCanonInfluence, recordIntelligence, revealNpc } from "./world.js";
import { toThirdPersonNarrative } from "./narrative.js";
import { guardActionByStoryRules, recordStoryConsequence, sanitizeNarrativeSuggestions, selectNarrativeRules } from "./story-rules.js";
import { formatSoulCoins } from "../../shared/currency.js";

interface DifficultyRules {
  training: number;
  money: number;
  safety: number;
  information: number;
  resourceCost: number;
  npcVigilance: number;
}

const DIFFICULTY_RULES: Record<StoredGame["view"]["difficulty"], DifficultyRules> = {
  爽: { training: 1.35, money: 1.35, safety: 0.22, information: 1.3, resourceCost: .72, npcVigilance: -12 },
  简单: { training: 1.15, money: 1.15, safety: 0.12, information: 1.15, resourceCost: .88, npcVigilance: -5 },
  标准: { training: 1, money: 1, safety: 0, information: 1, resourceCost: 1, npcVigilance: 0 },
  困难: { training: 0.9, money: 0.9, safety: -0.08, information: 0.85, resourceCost: 1.2, npcVigilance: 8 },
  地狱: { training: 0.82, money: 0.8, safety: -0.16, information: 0.7, resourceCost: 1.45, npcVigilance: 16 },
};

const RING_LIMITS = [0, 423, 764, 1760, 5000, 12000, 25000, 50000, 100000, 100000];
const PHYSIQUE_BONUS: Record<string, number> = { 普通: 0, 优秀: 90, 顶尖: 180 };

function entry(kind: NarrativeEntry["kind"], text: string): NarrativeEntry {
  return { id: randomUUID(), kind, text, createdAt: new Date().toISOString() };
}

function actionRandom(game: StoredGame): () => number {
  return createRandom(`${game.view.seed}:action:${game.actionIndex}`);
}

function speedMinutes(game: StoredGame, standard: number, fast: number): number {
  return game.view.speed === "高速" ? fast : standard;
}

function fatigueLabel(points: number): string {
  if (points < 20) return "轻松";
  if (points < 45) return "略有疲劳";
  if (points < 70) return "疲惫";
  if (points < 90) return "非常疲惫";
  return "接近极限";
}

function conditionLabel(health: number, fatigue: number): ConditionLabel {
  if (health <= 0) return "死亡";
  if (health < 20) return "濒死";
  if (health < 45) return "重伤";
  if (health < 75) return "轻伤";
  if (fatigue >= 70) return "疲惫";
  return "良好";
}

function syncCharacterState(game: StoredGame): void {
  const character = game.view.character;
  if (!character) return;
  game.world.healthPoints = Math.max(0, Math.min(100, game.world.healthPoints));
  game.world.fatiguePoints = Math.max(0, Math.min(100, game.world.fatiguePoints));
  if (game.world.healthPoints <= 0 && tryResurrection(game)) game.world.healthPoints = Math.max(18, game.world.healthPoints);
  character.condition = conditionLabel(game.world.healthPoints, game.world.fatiguePoints);
  character.fatigue = fatigueLabel(game.world.fatiguePoints);
  character.cultivationProgress = cultivationLabel(game);
  game.view.runProgress.highestSoulRank = Math.max(game.view.runProgress.highestSoulRank, character.soulRank);
  game.view.runProgress.discoveries = game.world.metrics.discoveries;
  game.view.runProgress.relationshipsBuilt = game.world.metrics.relationshipsBuilt;
  game.view.runProgress.historicalImpact = game.world.metrics.historicalImpact;
  game.view.runProgress.completedHunts = game.world.metrics.completedHunts;
  character.personalityTraits = currentPersonalityTraits(game);
  if (character.condition === "死亡") {
    game.view.status = "ended";
    game.view.runProgress.ending = "死亡";
  } else if (character.soulRank >= 99) {
    game.view.status = "ended";
    game.view.runProgress.ending = "走到百级门前";
  }
}

function currentPersonalityTraits(game: StoredGame): string[] {
  const scores = game.personalityProfile.scores;
  const traits = [
    scores.courage >= 2 ? "敢于冒险" : scores.courage <= -2 ? "谨慎避险" : "审慎",
    scores.empathy >= 2 ? "重情" : scores.empathy <= -2 ? "冷硬" : "克制",
    scores.integrity >= 2 ? "守诺" : scores.integrity <= -2 ? "结果优先" : "务实",
    scores.patience >= 2 ? "谋定后动" : scores.patience <= -2 ? "行动急切" : "耐心尚可",
    scores.ambition >= 2 ? "求强" : scores.ambition <= -2 ? "安于稳健" : "有所追求",
  ];
  return [...new Set(traits)].slice(0, 4);
}

function relationDimensions(strength = 10, hostile = false) {
  return { closeness: hostile ? -strength : strength, trust: hostile ? -strength : Math.round(strength * .8), respect: Math.round(strength * .45), sharedInterest: 0, vigilance: hostile ? strength : 5, hostility: hostile ? strength : 0, favorDebt: 0, identityKnowledge: Math.min(100, strength + 10) };
}

function recordPlayerRelation(game: StoredGame, relation: StoredGame["view"]["relations"][number], reason: string, delta: Partial<NonNullable<StoredGame["view"]["relations"][number]["dimensions"]>>): void {
  relation.dimensions ??= relationDimensions(relation.strength, relation.category === "敌对");
  const changes: string[] = [];
  for (const [key, value] of Object.entries(delta)) {
    const field = key as keyof typeof relation.dimensions;
    relation.dimensions[field] = Math.max(-100, Math.min(100, relation.dimensions[field] + (value ?? 0)));
    if (value) changes.push(`${key}${value > 0 ? "+" : ""}${value}`);
  }
  relation.history ??= [];
  relation.history.push({ date: `原作 ${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日`, reason, changes: changes.join("、") || "仅记录事件" });
  relation.history = relation.history.slice(-30);
  relation.strength = Math.max(0, Math.min(100, Math.round((relation.dimensions.closeness + relation.dimensions.trust + relation.dimensions.respect - relation.dimensions.hostility) / 3)));
}

function itemWeight(item: string): number {
  if (/魂导器|戒指|腰带|钱袋|钥匙|令|纸|册|药|草|丹/.test(item)) return 0.5;
  if (/锤|甲|长枪|大剑|矿|内丹|魂骨/.test(item)) return 4;
  if (/干粮|绳|行囊|包/.test(item)) return 1.5;
  return 1;
}

function syncInventoryAndEconomy(game: StoredGame): void {
  const character = game.view.character;
  if (!character) return;
  const storageSoulTool = game.view.inventory.some((item) => /储物魂导器|储物戒|二十四桥明月夜/.test(item));
  const physique = character.abilityDescriptors.physique === "顶尖" ? 12 : character.abilityDescriptors.physique === "优秀" ? 6 : 0;
  const capacity = 18 + physique + (storageSoulTool ? 80 : 0);
  const used = Math.round(game.view.inventory.reduce((sum, item) => sum + itemWeight(item), 0) * 10) / 10;
  game.view.inventoryLoad = { used, capacity, state: used > capacity ? "超载" : used > capacity * .82 ? "沉重" : used > capacity * .5 ? "适中" : "轻便", storage: game.view.inventoryLoad?.storage ?? [] };
  game.view.economy.cash = character.coins;
}

function tryResurrection(game: StoredGame): boolean {
  const character = game.view.character;
  if (!character) return false;
  const soulText = [character.martialSoul.name, character.martialSoul.description, ...character.soulRings.flatMap((ring) => [ring.skillName, ring.skillDescription])].join(" ");
  const systemText = character.specialSystem ? [character.specialSystem.name, ...character.specialSystem.abilities].join(" ") : "";
  const closeExecutor = game.view.relations.find((item) => (item.strength ?? 0) >= 70 && /亲属|师友|同伴/.test(item.category ?? "") && /信任|亲近|生死|挚爱|师徒/.test(`${item.relation}${item.impression}`));
  const strongFaction = game.view.affiliations.find((item) => /昊天宗|七宝琉璃宗|武魂殿|蓝电霸王龙宗|海神岛|隐世/.test(item.name) && /重视|核心|长老|亲传|继承/.test(`${item.role}${item.reputation}`));
  const hasBodyMedium = character.injuries.some((item) => /魂魄|灵魂/.test(item)) || game.view.inventory.some((item) => /相思断肠红|生命之水|生灵之金|完整躯体/.test(item));
  const requiredRelics = game.view.inventory.filter((item) => /万年圣魂草|九品参王|水晶血龙参|上古灵兽内丹|十万年魂骨|神级生命/.test(item));
  const selfRevival = character.soulRank >= 70 && character.soulRings.length >= 7 && /涅槃|不死|九命|轮回|重生/.test(soulText);
  const systemRevival = character.soulRank >= 50 && /复活|涅槃|回魂|重生|不死/.test(systemText) && (Number(character.specialSystem?.progress.match(/\d+/)?.[0] ?? 0) >= 70);
  const assistedRevival = Boolean(closeExecutor && strongFaction && hasBodyMedium && requiredRelics.length >= 3 && character.soulRank >= 60);
  if (!selfRevival && !systemRevival && !assistedRevival) return false;

  const conditions: string[] = [];
  const costs: string[] = [];
  let source = "";
  if (selfRevival) {
    source = `${character.martialSoul.name}的高阶复生魂技`;
    const lostRing = character.soulRings.pop();
    if (lostRing) costs.push(`永久失去第${lostRing.index}魂环“${lostRing.skillName}”`);
    conditions.push("死亡时魂环仍完整保存灵魂印记", "武魂与魂技已经成长到本地规则可承载的层级");
  } else if (systemRevival) {
    source = `${character.specialSystem!.name}的复生能力`;
    character.specialSystem!.progress = "0%";
    character.specialSystem!.abilities = character.specialSystem!.abilities.filter((ability) => !/复活|涅槃|回魂|重生|不死/.test(ability));
    costs.push("复生能力退回未觉醒状态");
    conditions.push("独立体系已经完成复生能力所需的成长", "魂魄没有在死亡瞬间彻底消散");
  } else {
    source = "仿照十万年魂兽魂体合一的复生仪式";
    for (const relic of requiredRelics.slice(0, 3)) {
      const index = game.view.inventory.indexOf(relic);
      if (index >= 0) game.view.inventory.splice(index, 1);
      costs.push(`消耗${relic}`);
    }
    conditions.push("魂魄或灵魂印记得到保存", "躯体具备生命根基", "三种万年以上复生材料齐备", `${closeExecutor!.name}愿意主持仪式`, `${strongFaction!.name}提供场地与强者支持`);
    closeExecutor!.impression = "为复生付出巨大代价，此后关系中留下无法轻易偿清的人情";
    closeExecutor!.strength = Math.max(35, (closeExecutor!.strength ?? 70) - 20);
    costs.push(`欠下${closeExecutor!.name}无法用魂币偿还的人情`);
  }
  game.world.resurrectionCount += 1;
  game.world.healthPoints = 22;
  game.world.fatiguePoints = 95;
  const rankLoss = Math.max(10, Math.min(20, 10 + game.world.resurrectionCount * 2));
  character.soulRank = Math.max(1, character.soulRank - rankLoss);
  game.world.trainingPoints = 0;
  character.injuries.push("复生后遗留的魂魄裂伤", "复生造成的永久根基亏损");
  costs.push(`魂力永久倒退${rankLoss}级`, "留下魂魄裂伤与根基亏损");
  game.world.deviation += 12 + game.world.resurrectionCount * 4;
  game.world.metrics.historicalImpact += 5;
  game.world.resurrectionRecords.push({ targetId: "player", source, conditions, costs, year: game.view.worldTime?.year ?? 0, day: game.view.worldTime?.day ?? 1 });
  game.view.narrative.push(entry("system", `死亡没有成为终点。${source}完成了一次复生；${costs.join("，")}。`));
  return true;
}

function cultivationThreshold(rank: number): number {
  return 80 + rank * 6;
}

function cultivationLabel(game: StoredGame): string {
  const rank = game.view.character?.soulRank ?? 0;
  if (rank > 0 && rank % 10 === 0 && (game.view.character?.soulRings.length ?? 0) < Math.floor(rank / 10)) return "等待魂环";
  const ratio = game.world.trainingPoints / cultivationThreshold(rank);
  if (ratio < 0.2) return "刚刚起步";
  if (ratio < 0.5) return "稳步积累";
  if (ratio < 0.8) return "接近突破";
  return "瓶颈松动";
}

function ensureTask(game: StoredGame, task: TaskView): void {
  const id = task.id ?? task.title;
  if (!game.view.tasks.some((item) => (item.id ?? item.title) === id && item.status !== "完成")) game.view.tasks.push(task);
}

function trainingResolution(game: StoredGame, action = ""): ActionResolution {
  const character = game.view.character;
  if (!character) return impossible("还没有可修炼的角色状态。");
  const expectedRings = Math.floor(character.soulRank / 10);
  if (character.soulRank > 0 && character.soulRank % 10 === 0 && character.soulRings.length < expectedRings) {
    startHuntNeed(game);
    return {
      intent: "修炼",
      minutes: 30,
      ruleSummary: `魂力停在 ${character.soulRank} 级瓶颈，继续冥想不能突破，需要第 ${expectedRings} 魂环。`,
      fallbackNarrative: `魂力在经脉里走了一圈，最后还是堵在原处。我又试了两次，胸口发闷，等级一点没动。现在缺的是第 ${expectedRings} 魂环。`,
      suggestions: ["调查适合的魂兽", "找人推荐猎魂目标", "准备猎魂物资"],
    };
  }

  const random = actionRandom(game);
  const rules = DIFFICULTY_RULES[game.view.difficulty];
  const longYear = /闭关.*年|修炼.*年/.test(action);
  const longMonth = /闭关.*月|修炼.*月/.test(action);
  const toBottleneck = /直到.*瓶颈|到下个瓶颈|修炼到.*级/.test(action);
  const nextBottleneck = character.soulRank >= 90 ? 99 : Math.ceil((character.soulRank + 1) / 10) * 10;
  const requiredToBottleneck = Array.from({ length: Math.max(0, nextBottleneck - character.soulRank) }, (_, index) => cultivationThreshold(character.soulRank + index)).reduce((sum, value) => sum + value, 0) - game.world.trainingPoints + 8;
  const minutes = toBottleneck ? (game.view.speed === "高速" ? 30 : 180) * 1440 : longYear ? 360 * 1440 : longMonth ? 30 * 1440 : speedMinutes(game, 180, 10080);
  const baseGain = toBottleneck ? Math.max(30, requiredToBottleneck) : longYear ? integer(random, 900, 1250) : longMonth ? integer(random, 110, 180) : game.view.speed === "高速" ? integer(random, 34, 52) : integer(random, 8, 15);
  const personalityBonus = game.personalityProfile.scores.patience > 1 ? 1.12 : 1;
  const fatiguePenalty = game.world.fatiguePoints >= 70 ? 0.55 : game.world.fatiguePoints >= 45 ? 0.78 : 1;
  const specialBonus = 1 + (character.specialSystem?.abilities.length ?? 0) * 0.04;
  const gain = Math.max(1, Math.round(baseGain * rules.training * personalityBonus * fatiguePenalty * specialBonus));
  game.world.trainingPoints += gain;
  game.world.fatiguePoints += toBottleneck || longYear || longMonth ? 45 : game.view.speed === "高速" ? 32 : 12;

  const before = character.soulRank;
  let levels = 0;
  while (game.world.trainingPoints >= cultivationThreshold(character.soulRank) && character.soulRank < 99) {
    game.world.trainingPoints -= cultivationThreshold(character.soulRank);
    character.soulRank += 1;
    levels += 1;
    if (character.soulRank % 10 === 0) break;
  }

  const systemMessages: string[] = [];
  if (levels > 0) systemMessages.push(`魂力提升 · ${before} → ${character.soulRank} 级`);
  if (character.soulRank > 0 && character.soulRank % 10 === 0) {
    startHuntNeed(game);
    systemMessages.push(`瓶颈 · 需要第 ${Math.floor(character.soulRank / 10)} 魂环`);
  }
  return {
    intent: "修炼",
    minutes,
    ruleSummary: `完成修炼，获得 ${gain} 点内部修炼进度，魂力 ${before === character.soulRank ? "未升级" : `提升到 ${character.soulRank} 级`}，疲劳增加。`,
    fallbackNarrative: levels > 0
      ? `窗外换过几次光。我把最后一轮魂力运完，堵了许久的地方忽然松开，呼吸也跟着顺了。再测时，魂力已经到了 ${character.soulRank} 级。腿麻得厉害，我扶着墙才站稳。`
      : `我坐到腿脚发麻，魂力一遍遍从胸口沉到掌心。中途散过几次，只好重新来。结束时等级没变，控制倒比开始时稳了一些。`,
    suggestions: character.soulRank % 10 === 0 ? ["调查魂兽", "找导师商量", "整理猎魂物资"] : ["休息", "记录修炼问题", "修炼到下个瓶颈"],
    systemMessages,
  };
}

function restResolution(game: StoredGame): ActionResolution {
  const minutes = speedMinutes(game, 480, 1440);
  const before = game.world.fatiguePoints;
  game.world.fatiguePoints -= game.view.speed === "高速" ? 65 : 45;
  if (game.world.healthPoints < 80) game.world.healthPoints += game.view.speed === "高速" ? 18 : 8;
  return {
    intent: "休息",
    minutes,
    ruleSummary: `休息 ${minutes} 分钟，疲劳由 ${before} 降低，轻度伤势得到恢复。`,
    fallbackNarrative: "我把门闩好，连外衣都没脱就躺了下去。醒来时嘴里发干，屋外的声音已经换了一拨。肩背还酸，脑子总算清醒了。",
    suggestions: ["吃点东西", "查看当前计划", "继续行动"],
  };
}

function findTravelTarget(game: StoredGame, action: string) {
  return game.view.map.find((location) => location.id !== game.view.locationId && (action.includes(location.name) || action.includes(location.id)));
}

function travelResolution(game: StoredGame, action: string): ActionResolution {
  syncInventoryAndEconomy(game);
  if (game.view.inventoryLoad.state === "超载") return impossible(`随身物品${game.view.inventoryLoad.used}/${game.view.inventoryLoad.capacity}负重，已经无法正常赶路。`, ["把物品存入住处", "租用马车", "丢弃或出售普通物品"]);
  const target = findTravelTarget(game, action);
  if (!target) {
    const reachable = game.view.map.filter((location) => location.travelMinutes > 0).map((location) => location.name).join("、");
    return impossible(reachable ? `没有确认目的地。当前可直接前往 ${reachable}。` : "没有找到可直接到达的地点。", ["查看地图", "打听路线", "留在原地"]);
  }
  if (target.travelMinutes < 0) return impossible(`${target.name} 不能从当前位置直接到达。`, ["查看地图", "先去中转地点", "打听路线"]);
  const random = actionRandom(game);
  const minutes = game.view.speed === "高速" ? Math.max(30, Math.round(target.travelMinutes * 0.7)) : target.travelMinutes;
  const origin = game.view.location ?? "原地";
  game.view.locationId = target.id;
  game.view.location = target.name;
  if (!game.world.discoveredLocations.includes(target.id)) {
    game.world.discoveredLocations.push(target.id);
    game.world.metrics.discoveries += 1;
  }
  recordIntelligence(game, { subjectType: "地点", subjectId: target.id, title: target.name, detail: `主角亲自抵达${target.name}，确认了入口、道路与当前治安状况。`, source: "亲历", confidence: 100, status: "确定" });
  game.world.fatiguePoints += Math.min(35, Math.ceil(minutes / 240));
  const danger = locationById(target.id)?.danger;
  const encounter = ["高", "禁区"].includes(danger ?? "") && random() < 0.28;
  if (encounter) {
    game.world.healthPoints -= integer(random, 4, 14);
    game.view.inventory = game.view.inventory.filter((item, index) => !(item === "半日干粮" && index === game.view.inventory.indexOf("半日干粮")));
  }
  game.view.map = buildMapView(game);
  game.view.mapHierarchy = buildMapHierarchy(game);
  return {
    intent: "旅行",
    minutes,
    ruleSummary: `从${origin}前往${target.name}，耗时 ${minutes} 分钟。${encounter ? "途中遭遇危险，损失少量健康和补给。" : "途中无重大事件。"}`,
    fallbackNarrative: encounter
      ? `路走到一半，灌木里猛地窜出一道黑影。我跌进沟里才躲开，手肘擦破了一片，干粮也丢了。等周围安静下来，我没再停，天色变化前赶到了${target.name}。`
      : `我背上布包离开${origin}。路上歇了两次，鞋里进的沙倒了又进。最后一段路走得慢，抬头看见${target.name}的标志时，腿已经发沉。`,
    suggestions: ["观察周围", "找住处休息", "打听当地消息"],
  };
}

function generateRecommendations(game: StoredGame): void {
  const character = game.view.character;
  if (!character) return;
  const ringIndex = Math.floor(character.soulRank / 10);
  const limit = RING_LIMITS[Math.min(ringIndex, RING_LIMITS.length - 1)] ?? 423;
  const random = actionRandom(game);
  const category = character.martialSoul.category;
  const candidates = SOUL_BEASTS
    .filter((beast) => beast.ageRange[0] <= limit * 1.8)
    .map((beast) => ({ beast, fit: beast.attributes.some((attribute) => category.includes(attribute) || character.martialSoul.description.includes(attribute)) ? 2 : 1, roll: random() }))
    .sort((left, right) => right.fit - left.fit || right.roll - left.roll)
    .slice(0, 3);
  const rules = DIFFICULTY_RULES[game.view.difficulty];
  game.view.hunting = {
    stage: "调查",
    ringIndex,
    recommendations: candidates.map(({ beast, fit }) => {
      const estimateMax = Math.min(beast.ageRange[1], Math.round(limit * (0.85 + random() * 0.35)));
      const uncertainty = rules.information < 0.8 ? "年限难以确认" : `${Math.max(beast.ageRange[0], Math.round(estimateMax * 0.65))}—${estimateMax} 年`;
      return {
        beastId: beast.id,
        name: beast.name,
        estimatedYears: uncertainty,
        risk: beast.danger >= 4 ? "高" : beast.danger === 3 ? "中" : "低",
        fit: fit === 2 ? "属性较合适" : "需要进一步判断",
        source: game.view.relations.length ? game.view.relations[0].name : "当地猎魂向导",
      };
    }),
    preparation: [],
    trailProgress: "尚未出发",
  };
}

function startHuntNeed(game: StoredGame): void {
  const ringIndex = Math.floor((game.view.character?.soulRank ?? 10) / 10);
  if (!game.view.hunting || game.view.hunting.stage === "完成") {
    game.view.hunting = { stage: "需求", ringIndex, recommendations: [], preparation: [], trailProgress: "尚未调查" };
    game.world.flags.huntOriginLocation = game.view.locationId ?? "notting-city";
  }
  ensureTask(game, { id: `ring-${ringIndex}`, title: `获得第 ${ringIndex} 魂环`, kind: "修炼需求", detail: "完成调查、准备、旅行、追踪、战斗、吸收和后果。", status: "进行中" });
}

function selectRecommendedBeast(game: StoredGame, action: string): boolean {
  const hunting = game.view.hunting;
  if (!hunting) return false;
  let recommendation = hunting.recommendations.find((item) => action.includes(item.name));
  const number = action.match(/第\s*([123一二三])/)?.[1];
  if (!recommendation && number) {
    const index = { "1": 0, "一": 0, "2": 1, "二": 1, "3": 2, "三": 2 }[number];
    if (index !== undefined) recommendation = hunting.recommendations[index];
  }
  if (!recommendation) return false;
  const beast = soulBeastById(recommendation.beastId);
  if (!beast) return false;
  const random = actionRandom(game);
  const limit = RING_LIMITS[Math.min(hunting.ringIndex, RING_LIMITS.length - 1)] ?? 423;
  hunting.targetBeastId = beast.id;
  hunting.targetName = beast.name;
  hunting.targetYears = Math.max(beast.ageRange[0], Math.min(beast.ageRange[1], Math.round(limit * (0.72 + random() * 0.38))));
  hunting.locationId = beast.habitats[0];
  const huntTask = game.view.tasks.find((task) => task.id === `ring-${hunting.ringIndex}`);
  if (huntTask) huntTask.destinationId = hunting.locationId;
  hunting.stage = "准备";
  hunting.trailProgress = "目标已确定";
  return true;
}

function nonLethalRingResolution(game: StoredGame, action: string): ActionResolution {
  const hunting = game.view.hunting;
  if (!hunting?.targetBeastId) return impossible("还没有锁定能够交流、救助或承载传承的魂兽目标。", ["调查魂兽", "选择目标", "寻找残魂线索"]);
  const beast = soulBeastById(hunting.targetBeastId);
  if (!beast) return impossible("目标资料不足，无法建立非猎杀方案。", ["继续调查", "核对目标", "寻找魂兽学者"]);
  const bondKey = `huntBond:${beast.id}`;
  if (/救助|治疗|交流|沟通|交换|取得信任/.test(action) && !/献祭|融合|转化|传承/.test(action)) {
    const bond = Number(game.world.flags[bondKey] ?? 0) + 1;
    game.world.flags[bondKey] = bond;
    game.world.fatiguePoints += 8;
    return { intent: "非猎杀接触", minutes: speedMinutes(game, 180, 720), ruleSummary: `尝试在不猎杀的前提下接触${beast.name}；目前形成${bond}条可验证的信任或利益基础，尚未自动获得魂环。`, fallbackNarrative: `我没有追着它的要害逼近，只把能表明来意的东西放在地上，再往后退。它没有立刻接受，也没有像第一次那样直接攻击。`, suggestions: bond >= 3 ? ["询问它是否有未完成的遗愿", "寻找魂体承载方法", "继续保持距离沟通"] : ["再次帮助它", "观察它真正需要什么", "准备随时撤退"] };
  }
  const bond = Number(game.world.flags[bondKey] ?? 0);
  const remnantIndex = game.view.inventory.findIndex((item) => /魂兽残魂|魂兽遗愿|残魂传承/.test(item));
  const remnantPath = remnantIndex >= 0 && Boolean(game.view.character?.specialSystem) && /残魂|传承|转化|融合/.test(action);
  const sacrificePath = (hunting.targetYears ?? 0) >= 100000 && bond >= 3 && /献祭|自愿融合/.test(action);
  if (!remnantPath && !sacrificePath) return impossible("非猎杀魂环需要真实的灵魂承载、长期信任、魂兽自愿和可执行的转化方法，当前条件没有闭合。", ["继续建立信任", "寻找残魂承载材料", "研究魂环与灵魂的关系"]);
  if (remnantPath) game.view.inventory.splice(remnantIndex, 1);
  game.world.flags.nonLethalRing = remnantPath ? "残魂传承" : "魂兽自愿献祭";
  hunting.stage = "吸收";
  hunting.trailProgress = remnantPath ? "残魂与武魂建立承载" : "魂兽自愿保留灵魂印记";
  return { intent: "非猎杀魂环", minutes: speedMinutes(game, 240, 720), ruleSummary: `${remnantPath ? "魂兽残魂传承" : `${beast.name}自愿献祭`}满足当前承载条件，进入吸收阶段；结果仍要接受身体、精神与年限判定。`, fallbackNarrative: remnantPath ? `残魂没有顺从地钻进武魂。我把它留下的执念、自己的魂力和承载材料一点点对齐，直到那团散乱的光不再往外崩。` : `${beast.name}没有倒下。它把选择表达得很清楚，魂力从身体外侧慢慢剥离，留下的目光仍然清醒。这不是我能替它作出的决定。`, suggestions: ["开始吸收", "让同行者维持警戒", "最后检查精神状态"] };
}

function huntResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character;
  if (!character) return impossible("角色尚未觉醒。");
  const activeHunt = game.view.hunting && game.view.hunting.stage !== "完成";
  const requiredRingIndex = Math.floor(character.soulRank / 10);
  if (!activeHunt && (character.soulRank === 0 || character.soulRank % 10 !== 0 || character.soulRings.length >= requiredRingIndex)) {
    return impossible(`当前魂力 ${character.soulRank} 级，还没有新的魂环瓶颈。`, ["继续修炼", "研究魂兽资料", "检查当前魂环"]);
  }
  startHuntNeed(game);
  const hunting = game.view.hunting!;
  const stage = hunting.stage;

  if (stage === "需求") {
    generateRecommendations(game);
    return {
      intent: "猎魂调查",
      minutes: speedMinutes(game, 180, 1440),
      ruleSummary: `为第 ${hunting.ringIndex} 魂环调查候选目标，获得 ${game.view.hunting?.recommendations.length ?? 0} 条带来源的推荐。`,
      fallbackNarrative: "我跑了武魂分殿、药铺和两家旅店。说法不完全一样，有人想卖货，也有人只是照着旧经验讲。把重复的部分抄下来后，纸上剩了三个名字。",
      suggestions: game.view.hunting!.recommendations.map((item, index) => `选择第 ${index + 1} 个目标：${item.name}`),
    };
  }

  if (stage === "调查") {
    if (!selectRecommendedBeast(game, action)) {
      return {
        intent: "猎魂选定目标",
        minutes: 20,
        ruleSummary: "没有从现有推荐中确认目标。",
        fallbackNarrative: "我把三份情报又对了一遍，还是没在纸上落下最后一笔。目标不定，药、路线和帮手都没法算。",
        suggestions: hunting.recommendations.map((item, index) => `选择第 ${index + 1} 个目标：${item.name}`),
      };
    }
    return {
      intent: "猎魂选定目标",
      minutes: 30,
      ruleSummary: `选定 ${hunting.targetName}，估算年限 ${hunting.targetYears} 年，进入准备阶段。`,
      fallbackNarrative: `我在${hunting.targetName}的名字下画了一道线。情报里还有互相矛盾的地方，可路线和习性已经能对上。接下来要准备解毒、绳索和退路。`,
      suggestions: ["购买猎魂补给", "寻找同行者", "检查武魂与目标的适配"],
    };
  }

  if (stage === "准备") return prepareHunt(game, action);
  if (stage === "旅行") return huntTravel(game);
  if (stage === "追踪") return trackBeast(game);
  if (stage === "战斗") return combatResolution(game, action);
  if (stage === "吸收") return absorbRing(game);
  if (stage === "后果") return finishHunt(game);
  return {
    intent: "猎魂",
    minutes: 10,
    ruleSummary: "本次猎魂已经完成。",
    fallbackNarrative: "这次猎魂的账已经结清。用掉的东西回不来，得到的魂环也确实留在了身上。",
    suggestions: ["休息养伤", "检查魂技", "继续修炼"],
  };
}

function prepareHunt(game: StoredGame, action: string): ActionResolution {
  const hunting = game.view.hunting!;
  const additions: string[] = [];
  const character = game.view.character!;
  if (/买|购买|药|补给|绳|食物/.test(action)) {
    const cost = Math.min(character.coins, 8);
    character.coins -= cost;
    if (!game.view.inventory.includes("止血散")) game.view.inventory.push("止血散");
    if (!game.view.inventory.includes("猎魂绳")) game.view.inventory.push("猎魂绳");
    additions.push("止血散", "猎魂绳");
  }
  if (/同伴|导师|帮手|组队/.test(action) && game.view.relations.length) additions.push(`同行者：${game.view.relations[0].name}`);
  if (/检查|适配|资料|研究/.test(action)) additions.push("目标习性笔记");
  if (!additions.length) additions.push("简易路线图");
  for (const addition of additions) if (!hunting.preparation.includes(addition)) hunting.preparation.push(addition);
  const ready = hunting.preparation.length >= 2 || game.view.speed === "高速";
  if (ready) hunting.stage = "旅行";
  return {
    intent: "猎魂准备",
    minutes: speedMinutes(game, 120, 720),
    ruleSummary: `新增准备：${additions.join("、")}。准备度 ${hunting.preparation.length} 项。${ready ? "可以出发。" : "仍建议补充准备。"}`,
    fallbackNarrative: `东西一样样摆在桌上。我把绳结重新打过，药包塞进最顺手的位置。钱花得有点心疼，真进了森林，少一件都可能要命。`,
    suggestions: ready ? ["出发猎魂", "再找一名同行者", "最后检查补给"] : ["购买猎魂补给", "寻找同行者", "研究目标习性"],
  };
}

function huntTravel(game: StoredGame): ActionResolution {
  const hunting = game.view.hunting!;
  const destination = locationById(hunting.locationId ?? "soul-hunting-forest") ?? locationById("soul-hunting-forest")!;
  game.view.locationId = destination.id;
  game.view.location = destination.name;
  if (!game.world.discoveredLocations.includes(destination.id)) game.world.discoveredLocations.push(destination.id);
  game.world.fatiguePoints += 18;
  hunting.stage = "追踪";
  hunting.trailProgress = "抵达栖息地";
  game.view.map = buildMapView(game);
  return {
    intent: "猎魂旅行",
    minutes: speedMinutes(game, 720, 2880),
    ruleSummary: `抵达 ${destination.name}，进入追踪阶段，疲劳增加。`,
    fallbackNarrative: `林子里的路比地图上弯得多。最后一段几乎没有路，我用短刀拨开灌木，鞋袜全被露水打湿。${destination.name}到了，附近还没看见${hunting.targetName}。`,
    suggestions: ["寻找足迹", "先扎营休息", "检查附近环境"],
  };
}

function trackBeast(game: StoredGame): ActionResolution {
  const hunting = game.view.hunting!;
  const random = actionRandom(game);
  const perception = game.view.character?.abilityDescriptors.perception === "顶尖" ? 0.22 : game.view.character?.abilityDescriptors.perception === "优秀" ? 0.1 : 0;
  const fatiguePenalty = game.world.fatiguePoints > 70 ? 0.2 : 0;
  const success = random() < 0.72 + perception - fatiguePenalty;
  game.world.fatiguePoints += 10;
  if (success) {
    hunting.stage = "战斗";
    hunting.trailProgress = "已锁定目标";
    const beast = soulBeastById(hunting.targetBeastId ?? "");
    game.view.combat = {
      id: randomUUID(),
      enemyName: hunting.targetName ?? "魂兽",
      enemyPower: `${hunting.targetYears ?? "未知"} 年`,
      round: 0,
      playerCondition: game.view.character?.condition ?? "良好",
      enemyCondition: "完好",
      distance: "中距离",
      escaped: false,
    };
    game.world.flags.combatEnemyHp = 65 + (beast?.danger ?? 2) * 12;
  }
  return {
    intent: "猎魂追踪",
    minutes: speedMinutes(game, 180, 720),
    ruleSummary: success ? `成功锁定 ${hunting.targetName}，战斗开始。` : "追踪失败，消耗时间和体力，目标仍在附近。",
    fallbackNarrative: success
      ? `断枝上的汁液还没干。我顺着压倒的草往前摸，没走多远就听见了粗重的呼吸。${hunting.targetName}在背风处，离我不到三十步。`
      : "脚印绕进一片乱石后断了。我蹲下来翻了半天，只找到一撮不确定是不是目标留下的毛。天色往下沉，只能重新找。",
    suggestions: success ? ["先观察弱点", "用武魂试探", "让同行者限制目标"] : ["换方向继续追踪", "休息后再找", "检查目标习性笔记"],
  };
}

function combatResolution(game: StoredGame, action: string): ActionResolution {
  const combat = game.view.combat;
  const hunting = game.view.hunting;
  if (!combat || !hunting) return impossible("当前没有可结算的战斗。");
  const random = actionRandom(game);
  combat.round += 1;
  let enemyHp = Number(game.world.flags.combatEnemyHp ?? 80);
  const beast = soulBeastById(hunting.targetBeastId ?? "");
  const danger = beast?.danger ?? 2;
  const character = game.view.character!;
  const playerPower = character.soulRank * 2 + character.soulRings.length * 12 + (character.abilityDescriptors.physique === "顶尖" ? 12 : character.abilityDescriptors.physique === "优秀" ? 6 : 0);
  const prepared = hunting.preparation.length * 5;
  const defend = /防御|闪避|拉开|退/.test(action);
  const observe = /观察|试探|弱点/.test(action);
  const flee = /逃|撤|离开战斗/.test(action);

  if (flee) {
    const escaped = random() < 0.55 + (observe ? 0.15 : 0);
    if (escaped) {
      combat.escaped = true;
      game.view.combat = undefined;
      hunting.stage = "追踪";
      hunting.trailProgress = "目标逃离，需重新追踪";
      return {
        intent: "战斗撤退",
        minutes: 20,
        ruleSummary: "成功脱离战斗，目标未被击败。",
        fallbackNarrative: "我把最后一点距离让了出去，转身钻进两棵树之间。身后的动静追了几十步才停。肺里像塞了火，至少命还在。",
        suggestions: ["处理伤势", "重新追踪", "放弃这个目标"],
      };
    }
  }

  const attackBase = integer(random, 10, 22) + Math.round(playerPower * 0.32) + prepared;
  const damage = observe ? Math.round(attackBase * 0.55) : defend ? Math.round(attackBase * 0.7) : attackBase;
  enemyHp -= damage;
  const enemyAttack = Math.max(2, integer(random, 5, 15) + danger * 4 + Math.round((hunting.targetYears ?? 100) / 180) - Math.round(playerPower * 0.14) - (defend ? 12 : 0));
  if (enemyHp > 0) game.world.healthPoints -= enemyAttack;
  game.world.fatiguePoints += 8 + danger;
  game.world.flags.combatEnemyHp = enemyHp;
  combat.enemyCondition = enemyHp <= 0 ? "失去战斗能力" : enemyHp < 30 ? "重伤" : enemyHp < 60 ? "受伤" : "完好";
  combat.playerCondition = conditionLabel(game.world.healthPoints, game.world.fatiguePoints);

  if (game.world.healthPoints <= 0) {
    game.view.status = "ended";
    game.view.runProgress.ending = `死于${combat.enemyName}的猎魂战斗`;
  } else if (enemyHp <= 0) {
    hunting.stage = "吸收";
    hunting.trailProgress = "目标已被击败";
    game.view.combat = undefined;
    game.world.metrics.battlesWon += 1;
  }

  return {
    intent: "战斗",
    minutes: 10,
    ruleSummary: `第 ${combat.round} 回合，玩家造成 ${damage} 点内部伤害，承受 ${enemyHp > 0 ? enemyAttack : 0} 点内部伤害。敌方状态 ${combat.enemyCondition}，玩家状态 ${combat.playerCondition}。`,
    fallbackNarrative: enemyHp <= 0
      ? `我抓住它转身的空当，把最后一下送了进去。${combat.enemyName}撞断一根矮树，挣了几下，不再起来。魂环从尸身上浮出时，我的手还在抖。`
      : `我这一击打中了，反震也顺着手臂顶回来。${combat.enemyName}吃痛后更凶，爪风擦过肩头，衣料当场裂开。我往后退了两步，没敢低头看伤口。`,
    suggestions: enemyHp <= 0 ? ["检查自身状态", "开始吸收魂环", "让同行者警戒"] : ["观察它的下一步", "集中攻击弱点", "防御并拉开距离"],
    conditionAfter: combat.playerCondition,
  };
}

function ringColor(years: number): string {
  if (years < 100) return "白";
  if (years < 1000) return "黄";
  if (years < 10000) return "紫";
  if (years < 100000) return "黑";
  return "红";
}

function absorbRing(game: StoredGame): ActionResolution {
  const hunting = game.view.hunting!;
  const character = game.view.character!;
  const beast = soulBeastById(hunting.targetBeastId ?? "");
  if (!beast) return impossible("魂兽数据缺失，无法吸收。");
  const random = actionRandom(game);
  const nonLethalSource = typeof game.world.flags.nonLethalRing === "string" ? String(game.world.flags.nonLethalRing) : undefined;
  const years = hunting.targetYears ?? beast.ageRange[0];
  const ringIndex = hunting.ringIndex;
  const baseLimit = RING_LIMITS[Math.min(ringIndex, RING_LIMITS.length - 1)] ?? 423;
  const physique = (PHYSIQUE_BONUS[character.abilityDescriptors.physique] ?? 0) + Number(game.world.flags.legacyFoundation ?? 0) * 45;
  const healthFactor = game.world.healthPoints / 100;
  const fatigueFactor = 1 - game.world.fatiguePoints / 180;
  const effectiveLimit = Math.max(80, (baseLimit + physique) * healthFactor * fatigueFactor);
  const overRatio = years / effectiveLimit;
  const rules = DIFFICULTY_RULES[game.view.difficulty];
  const successChance = Math.max(0.03, Math.min(0.98, 1.12 - Math.max(0, overRatio - 0.75) * 0.9 + rules.safety));
  const success = random() < successChance;
  hunting.absorptionRisk = overRatio <= 0.8 ? "低" : overRatio <= 1.05 ? "中" : overRatio <= 1.35 ? "高" : "致命";

  if (!success) {
    const severe = overRatio > 1.3 || random() > 0.55 + rules.safety;
    const loss = severe ? integer(random, 45, 85) : integer(random, 18, 40);
    game.world.healthPoints -= loss;
    game.world.fatiguePoints += 30;
    character.injuries.push(severe ? "魂力冲击造成的经脉损伤" : "魂环反噬造成的内伤");
    hunting.result = severe ? "吸收失败，伤势严重" : "吸收失败，魂环消散";
    if (game.world.healthPoints <= 0) {
      game.view.status = "ended";
      game.view.runProgress.ending = "魂环吸收失败死亡";
    } else {
      hunting.stage = "后果";
    }
    return {
      intent: "吸收魂环",
      minutes: speedMinutes(game, 120, 360),
      ruleSummary: `吸收失败。目标 ${years} 年，有效承载约 ${Math.round(effectiveLimit)} 年，风险 ${hunting.absorptionRisk}，健康损失 ${loss}。`,
      fallbackNarrative: severe
        ? "魂环刚入体就失去了控制。热流顶进胸口，我连第一轮都没撑完，喉咙里全是血腥味。醒来时魂环已经散了，手指还在不受控制地发抖。"
        : "魂力冲了几轮，始终没能稳下来。最后那圈光从我身上剥开，散进空气里。我趴在地上缓了很久，胸口每次起伏都疼。",
      suggestions: game.view.status === "ended" ? [] : ["立刻处理伤势", "返回聚居地", "检查是否留下后遗症"],
    };
  }

  const skillBase = pick(random, beast.possibleSkills);
  const skillName = `${character.martialSoul.name}·${skillBase}`;
  const ring: SoulRingView = {
    index: ringIndex,
    beastId: beast.id,
    beastName: beast.name,
    years,
    color: ringColor(years),
    skillName,
    skillDescription: `${beast.attributes.join("、")}属性与${character.martialSoul.name}结合形成的${skillBase}能力。${nonLethalSource ? `来源为${nonLethalSource}，保留了明确的灵魂因果记录。` : ""}`,
  };
  character.soulRings.push(ring);
  if (character.soulRank === ringIndex * 10) character.soulRank += 1;
  game.world.healthPoints -= Math.max(0, Math.round(overRatio * 14));
  game.world.fatiguePoints += 28;
  hunting.stage = "后果";
  hunting.result = `吸收成功，获得 ${skillName}`;
  game.world.metrics.discoveries += 1;
  delete game.world.flags.nonLethalRing;
  return {
    intent: "吸收魂环",
    minutes: speedMinutes(game, 120, 360),
    ruleSummary: `成功吸收 ${years} 年${beast.name}魂环，获得魂技 ${skillName}，魂力 ${character.soulRank} 级。`,
    fallbackNarrative: nonLethalSource ? `最难受的那一阵过去后，散乱的灵魂力量终于沿着武魂收拢。${ring.color}色魂环停在脚下，它的来历没有被这次融合抹去。${skillName}的用法随魂力一同浮现。` : `最难受的那一阵过去后，体内的力量终于沿着同一个方向转起来。${ring.color}色魂环停在脚下，${skillName}的用法随魂力一同浮进脑海。我睁眼时，天已经偏了。`,
    suggestions: ["测试新魂技", "处理疲劳和伤势", "收拾物资返回"],
    systemMessages: [`魂环 · ${ring.color}色 · ${beast.name} · ${years} 年`, `魂技 · ${skillName}`],
  };
}

function finishHunt(game: StoredGame): ActionResolution {
  const hunting = game.view.hunting!;
  hunting.stage = "完成";
  game.world.metrics.completedHunts += 1;
  const task = game.view.tasks.find((item) => item.id === `ring-${hunting.ringIndex}` || item.id === "first-ring");
  if (task) task.status = "完成";
  const returnLocationId = String(game.world.flags.huntOriginLocation ?? "notting-city");
  const returnLocation = locationById(returnLocationId) ?? locationById("notting-city")!;
  game.view.locationId = returnLocation.id;
  game.view.location = returnLocation.name;
  if (!game.world.discoveredLocations.includes(returnLocation.id)) game.world.discoveredLocations.push(returnLocation.id);
  game.view.map = buildMapView(game);
  return {
    intent: "猎魂后果",
    minutes: speedMinutes(game, 720, 2880),
    ruleSummary: `完成第 ${hunting.ringIndex} 次猎魂后果结算并返回聚居地。`,
    fallbackNarrative: "回城后，我先把剩下的药和钱摊开数了一遍。少了不少东西，伤也没好全。魂环还在，闭上眼就能感觉到那一圈力量。",
    suggestions: ["休息养伤", "测试魂技", "继续修炼"],
    systemMessages: [`猎魂完成 · 第 ${hunting.ringIndex} 魂环`],
  };
}

function conversationResolution(game: StoredGame, action: string): ActionResolution {
  const mentioned = CANON_CHARACTERS.find((character) => action.includes(character.name) || character.aliases.some((alias) => action.includes(alias)));
  let detail = "对方只回答了愿意说的部分。";
  const systemMessages: string[] = [];
  if (mentioned) {
    const npc = game.world.npcs[mentioned.id];
    if (npc?.locationId === game.view.locationId) {
      revealNpc(game, mentioned.id);
      npc.dispositionToPlayer += 2;
      npc.memoryOfPlayer.push(`${game.view.worldTime?.year ?? 0}年在${game.view.location ?? "此地"}与玩家交谈`);
      npc.memoryOfPlayer = npc.memoryOfPlayer.slice(-12);
      if (!game.view.relations.some((relation) => relation.id === npc.id)) {
        const factionName = FACTIONS.find((faction) => mentioned.factionIds.includes(faction.id))?.name;
        game.view.relations.push({ id: npc.id, name: npc.name, relation: "初识", impression: "仍在观察主角", faction: factionName, lastSeen: game.view.location, strength: 10, category: "师友", dimensions: relationDimensions(10), history: [{ date: `原作 ${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日`, reason: `在${game.view.location ?? "此地"}第一次当面交谈`, changes: "建立初识" }] });
        game.world.metrics.relationshipsBuilt += 1;
      } else {
        const relation = game.view.relations.find((item) => item.id === npc.id)!;
        relation.impression = npc.dispositionToPlayer >= 20 ? "愿意信任主角处理一些私事" : npc.dispositionToPlayer >= 10 ? "记得主角，也愿意多说几句" : "仍在观察主角";
        relation.relation = npc.dispositionToPlayer >= 20 ? "信任" : npc.dispositionToPlayer >= 10 ? "熟识" : relation.relation;
        relation.lastSeen = game.view.location;
        relation.strength = Math.min(100, (relation.strength ?? 8) + 8);
        recordPlayerRelation(game, relation, `${npc.name}与主角当面交谈，依据对话内容继续判断`, { trust: 3, closeness: 2, identityKnowledge: 4, vigilance: -1 });
      }
      game.world.deviation += Math.max(1, Math.floor(mentioned.importance / 2));
      recordCanonInfluence(game, { source: "当面交谈", description: `与${mentioned.name}当面交谈`, affectedNpcIds: [mentioned.id], affectedFactionIds: mentioned.factionIds, strength: Math.max(1, mentioned.importance - 2) });
      detail = `与 ${mentioned.name} 当面交谈，建立初步关系。`;
      systemMessages.push(`人物记录 · ${mentioned.name}`);
      recordIntelligence(game, { subjectType: "人物", subjectId: mentioned.id, title: mentioned.name, detail: `${mentioned.name}亲口谈及当前话题；其措辞可能保留私心，但见面地点已经确认。`, source: `当面交谈 · ${mentioned.name}`, confidence: 88, status: "确定" });
    } else {
      revealNpc(game, mentioned.id);
      detail = `打听到关于 ${mentioned.name} 的传闻，无法确认全部真实性。`;
      recordIntelligence(game, { subjectType: "人物", subjectId: mentioned.id, title: mentioned.name, detail: `有人提到${mentioned.name}，但说法未经本人或第二来源核实。`, source: `${game.view.location ?? "当地"}传闻`, confidence: 38, status: "传闻" });
    }
  }
  return {
    intent: "交谈",
    minutes: 20,
    ruleSummary: detail,
    fallbackNarrative: mentioned
      ? `我问到${mentioned.name}时，对方先看了看周围。话说得不多，真假也掺在一起。我把能互相对上的那几句记住，剩下的没急着信。`
      : "我把问题问了。对方手里的活没停，只挑了几句能说的答。再追问时，他摇头，说自己也只是听来的。",
    suggestions: ["追问消息来源", "换个话题", "把情报记下来"],
    systemMessages,
  };
}

function investigateResolution(game: StoredGame, action: string): ActionResolution {
  const random = actionRandom(game);
  const localNpc = Object.values(game.world.npcs).find((npc) => npc.locationId === game.view.locationId && !npc.knownToPlayer && random() < 0.45);
  const systemMessages: string[] = [];
  if (localNpc) {
    revealNpc(game, localNpc.id);
    systemMessages.push(`线索人物 · ${localNpc.name}`);
    recordIntelligence(game, { subjectType: "人物", subjectId: localNpc.id, title: localNpc.name, detail: `在旧登记与当地说法中找到能够互相印证的活动痕迹。`, source: "实地调查与登记记录", confidence: Math.round(62 * DIFFICULTY_RULES[game.view.difficulty].information), status: "推测" });
  } else {
    recordIntelligence(game, { subjectType: "地点", subjectId: game.view.locationId ?? "unknown", title: game.view.location ?? "当前位置", detail: "核对了路线、常用物价和近期治安；尚未发现足以确认的重要秘密。", source: "实地调查", confidence: Math.round(75 * DIFFICULTY_RULES[game.view.difficulty].information), status: "确定" });
  }
  const investigationCount = Number(game.world.flags.personalInvestigations ?? 0) + 1;
  game.world.flags.personalInvestigations = investigationCount;
  const selected = game.hiddenCandidates.find((candidate) => candidate.public.id === game.view.selectedCandidateId);
  const giftRevealed = Boolean(selected?.hiddenGift && !game.view.character?.revealedGift && investigationCount >= 3 && /身世|梦|征兆|胎记|异象|武魂|自己|传承/.test(action));
  if (giftRevealed && game.view.character && selected?.hiddenGift) {
    game.view.character.revealedGift = selected.hiddenGift;
    game.view.character.specialSystem = createSpecialSystem(selected.hiddenGift);
    game.world.metrics.discoveries += 2;
    systemMessages.push(`隐秘传承 · ${selected.hiddenGift}`);
  }
  game.world.metrics.discoveries += 1;
  return {
    intent: "调查",
    minutes: speedMinutes(game, 120, 720),
    ruleSummary: giftRevealed ? `反复调查后确认自身隐藏着${selected?.hiddenGift}，目前仍未完全激活。` : localNpc ? `调查获得关于 ${localNpc.name} 的可验证线索。` : "调查补充了当前地点的信息，没有发现重要人物。",
    fallbackNarrative: giftRevealed
      ? `这已经是我第三次把旧线索摆在一起。那道一直说不清的感觉终于有了轮廓：${selected?.hiddenGift}。它没有立刻给我力量，只留下一个能继续追查和修炼的入口。`
      : localNpc
      ? `我顺着几个重复出现的说法找过去，最后在一张旧登记上看见了${localNpc.name}的名字。墨迹不新，至少能证明这人确实来过。`
      : "我沿着附近走了一圈，问了三个人。能对上的只有路线、价钱和最近的治安，没挖出什么大秘密。",
    suggestions: giftRevealed ? ["尝试感应这份传承", "记录触发条件", "暂时保守秘密"] : localNpc ? [`打听${localNpc.name}`, "核对线索日期", "查看世界记录"] : ["换个地点调查", "找当地老人", "检查地图"],
    systemMessages,
  };
}

function createSpecialSystem(name: string) {
  const resourceHint = /丹|炼/.test(name) ? "需要药材、矿料与反复试错" : /剑/.test(name) ? "需要实战、兵器与安静参悟" : /因果/.test(name) ? "需要经历关键选择并承担反噬" : "需要在魂力成长中逐步唤醒";
  return { name, stage: "初次感应", progress: "刚刚起步", abilities: [] as string[], resourceHint };
}

function specialSystemResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character!;
  if (!character.specialSystem) return impossible("我还没有确认任何独立修行体系。", ["调查自己的身世", "研究武魂异象", "继续魂力修炼"]);
  const random = actionRandom(game);
  const system = character.specialSystem;
  const key = "specialSystemProgress";
  let progress = Number(game.world.flags[key] ?? 0);
  const resourceReady = /炼丹|炼器/.test(action) ? game.view.inventory.some((item) => /药|矿|铁|草/.test(item)) : true;
  const gain = resourceReady ? integer(random, 7, 14) : integer(random, 2, 5);
  progress = Math.min(100, progress + gain);
  game.world.flags[key] = progress;
  const unlocks: string[] = [];
  const stages = progress >= 100 ? ["融入自身", "圆满"] : progress >= 70 ? ["稳定运转", "精深"] : progress >= 35 ? ["掌握门径", "熟练"] : ["初次感应", "刚刚起步"];
  system.stage = stages[0]; system.progress = `${stages[1]} · ${progress}%`;
  const possible = /丹/.test(system.name) ? ["辨药", "基础炼制", "药性调和"] : /剑/.test(system.name) ? ["剑势感应", "基础剑诀", "以魂御剑"] : /因果/.test(system.name) ? ["危险预感", "因果留痕", "代价转移"] : /至尊骨/.test(system.name) ? ["骨纹感应", "体魄淬炼", "魂力增幅"] : ["异界吐纳", "力量转化", "双体系协调"];
  for (const [threshold, ability] of [[20, possible[0]], [50, possible[1]], [85, possible[2]]] as Array<[number, string]>) {
    if (progress >= threshold && !system.abilities.includes(ability)) { system.abilities.push(ability); unlocks.push(ability); }
  }
  if (/炼丹/.test(action) && resourceReady && progress >= 35) {
    const materialIndex = game.view.inventory.findIndex((item) => /药|草/.test(item));
    if (materialIndex >= 0) game.view.inventory.splice(materialIndex, 1);
    game.view.inventory.push(random() < 0.7 ? "粗制回气丹" : "炼坏的药渣");
  }
  game.world.fatiguePoints += 14;
  return {
    intent: "特殊体系修行", minutes: speedMinutes(game, 240, 4320),
    ruleSummary: `${system.name}进度增加 ${gain}，当前 ${progress}%。${unlocks.length ? `领悟${unlocks.join("、")}。` : "没有越过新的领悟节点。"}`,
    fallbackNarrative: `那股与魂力不太一样的力量又动了一次。我照着已经摸清的路线慢慢推，走到一半还是散了。停下来时手心全是汗，至少有几处脉络比上次清楚。`,
    suggestions: unlocks.length ? ["试用新能力", "记录力量变化", "检查两套体系是否冲突"] : ["寻找需要的材料", "继续参悟", "请可信的人护法"],
    systemMessages: unlocks.map((item) => `特殊能力 · ${item}`),
  };
}

function academyResolution(game: StoredGame): ActionResolution {
  const character = game.view.character!;
  if (character.innateSoulPower <= 0) return impossible("学院要求至少能够稳定感应魂力。", ["申请重新检测", "寻找其他修行道路", "打听理论研究者"]);
  const academyNameByLocation: Record<string, string> = {
    "shrek-village": "史莱克学院", "suotuo-city": "索托初级魂师学院", "star-luo-city": "星罗城初级魂师学院",
    "heaven-dou-city": "天斗城初级魂师学院", "spirit-city": "武魂城初级魂师学院", "notting-academy": "诺丁初级魂师学院", "notting-city": "诺丁初级魂师学院",
  };
  const academyName = academyNameByLocation[game.view.locationId ?? ""] ?? `${game.view.location ?? "当地"}初级魂师学堂`;
  if (game.view.affiliations.some((item) => item.name === academyName)) return impossible(`我已经是${academyName}的学员。`, ["参加课程", "寻找导师", "认识同学"]);
  const joinedAt = `${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日`;
  game.view.affiliations.push({ id: `academy-${game.view.locationId}`, name: academyName, role: character.coins < 20 ? "工读生" : "学员", reputation: "新入学", joinedAt });
  game.view.relations.push({ id: `academy-${game.view.locationId}`, name: academyName, relation: "所属学院", impression: "档案刚刚登记", strength: 12, category: "势力" });
  ensureTask(game, { id: "academy-foundation", title: "完成学院基础课程", kind: "计划", detail: "学习魂兽、魂环、冥想和实战基础。", status: "进行中" });
  game.world.deviation += 1;
  return { intent: "加入学院", minutes: 240, ruleSummary: `通过基础审核，成为${academyName}${character.coins < 20 ? "工读生" : "学员"}。`, fallbackNarrative: `登记老师把我的名字抄进册子，又让我按了一次手印。宿舍钥匙比想象中旧，边角磨得发白。今天起，我得按这里的钟声过日子了。`, suggestions: ["去宿舍放下行李", "查看第一堂课", "认识同届学员"], systemMessages: [`身份 · ${academyName} · ${character.coins < 20 ? "工读生" : "学员"}`] };
}

function factionResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character!;
  const localOrganizations: Record<string, string> = {
    "notting-city": "诺丁城魂师互助会", "suotuo-city": "索托城猎魂人行会", "heaven-dou-city": "天斗城自由魂师公所",
    "star-luo-city": "星罗城北区魂师武馆", "spirit-city": "武魂城登记魂师团", "soul-hunting-forest": "猎魂森林向导队",
  };
  const choices = [
    { pattern: /武魂殿/, id: "spirit-hall", name: "武魂殿", rank: 1 }, { pattern: /七宝/, id: "seven-treasure", name: "七宝琉璃宗", rank: 20 },
    { pattern: /蓝电/, id: "blue-lightning", name: "蓝电霸王龙宗", rank: 20 }, { pattern: /昊天/, id: "clear-sky", name: "昊天宗", rank: 40 },
    { pattern: /史莱克/, id: "shrek", name: "史莱克学院", rank: 20 }, { pattern: /宗门|势力|组织|行会|武馆/, id: `local-${game.view.locationId}`, name: localOrganizations[game.view.locationId ?? ""] ?? `${game.view.location ?? "当地"}自由魂师互助队`, rank: 10 },
  ];
  const target = choices.find((item) => item.pattern.test(action)) ?? choices.at(-1)!;
  if (game.view.affiliations.some((item) => item.id === target.id)) return impossible(`我已经加入${target.name}。`, ["申请内部任务", "拜访组织成员", "提升组织声望"]);
  if (character.soulRank < target.rank) return impossible(`${target.name}的公开门槛约为 ${target.rank} 级，我当前的实力还不够。`, ["继续修炼", "寻找举荐人", "先完成外围委托"]);
  game.view.affiliations.push({ id: target.id, name: target.name, role: "外围成员", reputation: "生疏", joinedAt: `${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日` });
  game.view.economy.salary = Math.max(game.view.economy.salary, target.rank >= 40 ? 18 : target.rank >= 20 ? 10 : 5);
  game.view.relations.push({ id: target.id, name: target.name, relation: "所属势力", impression: "尚未建立功劳", strength: 10, category: "势力" });
  game.world.deviation += target.rank >= 40 ? 8 : target.rank >= 20 ? 4 : 2;
  if (!target.id.startsWith("local-")) recordCanonInfluence(game, { source: "加入势力", description: `加入${target.name}`, affectedFactionIds: [target.id], strength: target.rank >= 40 ? 8 : target.rank >= 20 ? 5 : 2 });
  ensureTask(game, { id: `faction-${target.id}`, title: `在${target.name}站稳脚跟`, kind: "计划", detail: "完成组织事务，观察内部关系与规矩。", status: "进行中" });
  return { intent: "加入势力", minutes: 360, ruleSummary: `通过初步审核，成为${target.name}外围成员。`, fallbackNarrative: `负责登记的人问得很细，连家里做什么都记了。我拿到的牌子只够进外院，背面还有一行小字，损坏要赔。`, suggestions: ["领取第一件事务", "打听内部规矩", "认识同批成员"], systemMessages: [`身份 · ${target.name} · 外围成员`] };
}

function mentorResolution(game: StoredGame, action: string): ActionResolution {
  const mentioned = CANON_CHARACTERS.find((item) => action.includes(item.name) || item.aliases.some((alias) => action.includes(alias)));
  const npc = mentioned ? game.world.npcs[mentioned.id] : undefined;
  if (mentioned && npc?.locationId !== game.view.locationId) return impossible(`${mentioned.name}目前不在这里，连当面提出请求的机会都没有。`, [`打听${mentioned.name}的行踪`, "寻找当地导师", "先证明自己的能力"]);
  const mentorName = mentioned?.name ?? `${game.view.location ?? "当地"}散修 ${pick(actionRandom(game), ["顾闻山", "周砺", "林鹤", "沈秋岩"])}`;
  const existing = game.view.relations.find((item) => item.name === mentorName);
  const trust = npc?.dispositionToPlayer ?? (existing ? 8 : 0);
  if (mentioned && trust < 6) {
    npc!.memoryOfPlayer.push("曾经提出拜师，但彼此了解不足");
    return impossible(`${mentorName}没有立刻答应，只让我先证明耐心和判断。`, [`完成${mentorName}关心的事情`, `继续向${mentorName}请教`, "寻找其他导师"]);
  }
  if (existing) { existing.relation = "师徒"; existing.impression = "愿意认真指导，但仍会考察每次选择"; existing.strength = Math.max(45, existing.strength ?? 0); existing.category = "师友"; recordPlayerRelation(game, existing, `${mentorName}接受拜师请求并承担授业责任`, { trust: 12, closeness: 8, respect: 15, identityKnowledge: 10 }); }
  else game.view.relations.push({ id: mentioned?.id ?? "local-mentor", name: mentorName, relation: "师徒", impression: "愿意先教基础，再看品性", strength: 45, category: "师友", dimensions: relationDimensions(45), history: [{ date: `原作 ${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日`, reason: `${mentorName}正式接受拜师请求`, changes: "建立师徒关系" }] });
  game.world.metrics.relationshipsBuilt += 1;
  game.world.deviation += mentioned ? (mentioned.importance ?? 3) * 2 : 1;
  if (mentioned) recordCanonInfluence(game, { source: "建立师徒关系", description: `拜${mentioned.name}为师`, affectedNpcIds: [mentioned.id], affectedFactionIds: mentioned.factionIds, strength: mentioned.importance * 5 });
  ensureTask(game, { id: `mentor-${mentioned?.id ?? "local"}`, title: `完成${mentorName}布置的修行`, kind: "承诺", detail: "按要求练习，并在下次见面时交代结果。", status: "进行中" });
  return { intent: "拜师", minutes: 120, ruleSummary: `${mentorName}接受了师徒关系，并留下第一项修行要求。`, fallbackNarrative: `他没有让我跪太久，伸手把我拉了起来。第一句话也不玄，只让我把每天修炼的时间和失败处一笔笔记清。`, suggestions: ["询问修炼要求", "了解导师的规矩", "开始第一项练习"], systemMessages: [`关系 · ${mentorName} · 师徒`] };
}

function promiseResolution(game: StoredGame, action: string): ActionResolution {
  const title = action.replace(/^(我)?(答应|承诺|保证)/, "").trim().slice(0, 32) || "履行刚刚作出的承诺";
  const id = `promise-${game.actionIndex}`;
  ensureTask(game, { id, title, kind: "承诺", detail: `角色亲口答应了这件事。违背承诺会影响人格与关系。`, status: "进行中" });
  return { intent: "作出承诺", minutes: 10, ruleSummary: `记录新承诺：${title}。`, fallbackNarrative: `话出口后，对面安静了一下。我没再补条件，只把答应的事重复了一遍。`, suggestions: ["立刻准备履约", "确认时间和地点", "记下可能的阻碍"], systemMessages: [`承诺 · ${title}`] };
}

function fulfillPromiseResolution(game: StoredGame, action: string): ActionResolution {
  const promise = game.view.tasks.find((task) => task.kind === "承诺" && task.status === "进行中" && (action.includes(task.title) || /完成承诺|履行承诺/.test(action)));
  if (!promise) return impossible("没有找到与这次行动对应的未完成承诺。", ["查看任务", "说明要履行哪项承诺", "先完成必要准备"]);
  promise.status = "完成";
  game.world.metrics.promisesKept += 1;
  game.personalityProfile.scores.integrity = (game.personalityProfile.scores.integrity ?? 0) + 2;
  for (const relation of game.view.relations) if (/委托|师徒|同伴|亲属/.test(relation.relation)) { relation.impression = "知道主角会把答应的事做完"; recordPlayerRelation(game, relation, `主角完成了承诺“${promise.title}”`, { trust: 8, respect: 3, favorDebt: 1 }); }
  return { intent: "履行承诺", minutes: 180, ruleSummary: `完成承诺：${promise.title}。守诺记录增加。`, fallbackNarrative: `该交的东西、该说的话，我一样没落下。对方接过去后重新数了一遍，才把那张写着约定的纸撕掉。`, suggestions: ["确认有没有后续", "休息", "检查其他计划"], systemMessages: [`承诺完成 · ${promise.title}`] };
}

function academyStudyResolution(game: StoredGame): ActionResolution {
  const academy = game.view.affiliations.find((item) => /学院/.test(item.name));
  if (!academy) return impossible("我还没有正式进入魂师学院。", ["申请入学", "找私人导师", "自己研究基础知识"]);
  const key = "academyCourseProgress";
  const progress = Number(game.world.flags[key] ?? 0) + 1;
  game.world.flags[key] = progress;
  game.world.trainingPoints += 10 + progress * 2;
  game.world.fatiguePoints += 10;
  if (progress >= 3) {
    const task = game.view.tasks.find((item) => item.id === "academy-foundation"); if (task) task.status = "完成";
    academy.role = academy.role === "工读生" ? "正式工读生" : "正式学员";
    academy.reputation = "老师记得名字";
  }
  return { intent: "学院课程", minutes: 240, ruleSummary: `完成第 ${progress} 次基础课程，获得修炼与魂兽知识积累。`, fallbackNarrative: `黑板上的魂兽骨骼画得有点歪，老师讲到年限判断时敲了三次桌子。我把最容易认错的几处抄在页角，墨水蹭到了袖口。`, suggestions: progress >= 3 ? ["参加实战课", "找老师问问题", "认识同学"] : ["复习课堂笔记", "参加下一堂课", "去图书室核对"] };
}

function dynamicEventResolution(game: StoredGame, action: string): ActionResolution {
  const event = game.world.dynamicEvents.find((item) => item.status === "可介入" && (item.locationId === game.view.locationId || action.includes(item.title)));
  if (!event) return impossible("眼下没有我能直接介入的公开事件。", ["查看世界消息", "调查本地传闻", "前往事件地点"]);
  if (/拒绝|不接受|回绝/.test(action)) {
    event.status = "已解决";
    event.outcome = "玩家明确拒绝介入。";
    const task = game.view.tasks.find((item) => item.id === event.id); if (task) task.status = "失败";
    for (const id of event.participantIds) {
      const npc = game.world.npcs[id]; if (!npc) continue;
      npc.memoryOfPlayer.push(`玩家明确拒绝了“${event.title}”`);
      const relation = game.view.relations.find((item) => item.id === id);
      if (relation) recordPlayerRelation(game, relation, `主角拒绝${event.title}`, { trust: -2, sharedInterest: -4, vigilance: 2 });
    }
    return { intent: "拒绝人物请求", minutes: 10, ruleSummary: `明确拒绝${event.title}；相关人物会依据自身目标记住这次答复。`, fallbackNarrative: `他把条件说完后没有催。我把拒绝的话讲清楚，没有留一个能被误解成答应的口子。对面的神色没变，只把原先摊开的东西收了回去。`, suggestions: ["解释拒绝原因", "留意对方后续行动", "继续自己的计划"] };
  }
  if (/调查|打听|观察|查看/.test(action) && !/介入|帮助|阻止|解决/.test(action)) {
    return { intent: "调查世界事件", minutes: 90, ruleSummary: `确认${event.title}的地点、期限和主要风险。`, fallbackNarrative: `我把几种说法分开问了一遍。有人夸大，也有人故意漏话。能互相对上的部分不多，至少地点和最后期限是真的。`, suggestions: [`帮助处理${event.title}`, `阻止${event.title}继续恶化`, "寻找参与者核对"] };
  }
  const random = actionRandom(game);
  const power = (game.view.character?.soulRank ?? 0) + game.view.relations.length * 2 + game.view.affiliations.length * 3;
  const success = random() < Math.min(0.9, 0.42 + power / 120 + (game.personalityProfile.scores.patience ?? 0) * 0.025);
  event.status = "已解决";
  event.outcome = success ? "玩家的介入改变了结果。" : "介入失败，事情以更糟的方式收场。";
  const task = game.view.tasks.find((item) => item.id === event.id); if (task) task.status = success ? "完成" : "失败";
  const impact = event.stakes * (success ? 3 : 2);
  game.world.deviation += impact;
  game.world.metrics.historicalImpact += impact;
  const affectedFactions = [...new Set(event.participantIds.flatMap((id) => CANON_CHARACTERS.find((character) => character.id === id)?.factionIds ?? []))];
  if (event.participantIds.length || affectedFactions.length) recordCanonInfluence(game, { source: "介入事件", description: `介入${event.title}`, affectedNpcIds: event.participantIds, affectedFactionIds: affectedFactions, strength: impact });
  if (!success) { game.world.healthPoints -= event.stakes * 4; game.view.character!.reputation = "惹上麻烦"; }
  else game.view.character!.reputation = event.stakes >= 4 ? "当地知名" : "略有名声";
  for (const id of event.participantIds) {
    const npc = game.world.npcs[id]; if (!npc) continue;
    npc.dispositionToPlayer += success ? event.stakes * 2 : -event.stakes;
    npc.memoryOfPlayer.push(`${game.view.worldTime?.year ?? 0}年，玩家介入${event.title}，结果${success ? "成功" : "失败"}`);
    npc.memoryOfPlayer = npc.memoryOfPlayer.slice(-12);
  }
  for (const relation of game.view.relations.filter((item) => event.participantIds.includes(item.id ?? ""))) recordPlayerRelation(game, relation, `共同经历${event.title}并看到主角${success ? "承担后果" : "介入失败"}`, success ? { trust: event.stakes * 2, respect: event.stakes, favorDebt: event.stakes } : { trust: -event.stakes, vigilance: event.stakes * 2 });
  if (success) for (const affiliation of game.view.affiliations) affiliation.reputation = event.stakes >= 4 ? "受到重视" : "有过贡献";
  return { intent: "介入世界事件", minutes: 360, ruleSummary: `${event.title}${success ? "处理成功" : "处理失败"}，世界偏差增加 ${impact}。`, fallbackNarrative: success ? `事情收尾时，天已经暗了。没人鼓掌，几个当事人只是反复清点损失。原先要发生的结果被我硬生生推开了一截。` : `我没能兜住局面。人群散开后，地上还留着踩烂的纸和一只断扣子。该担的后果没有因为我的好心少半分。`, suggestions: success ? ["检查事件留下的线索", "与当事人谈谈", "留意后续影响"] : ["处理伤势和损失", "向受影响的人解释", "调查失败原因"], systemMessages: [`世界偏差 · +${impact}`, `事件${success ? "解决" : "失败"} · ${event.title}`] };
}

function npcConflictResolution(game: StoredGame, action: string): ActionResolution {
  const definition = CANON_CHARACTERS.find((item) => action.includes(item.name) || item.aliases.some((alias) => action.includes(alias)));
  if (!definition) return impossible("没有确认攻击目标。", ["观察目标", "调查对方实力", "暂时退开"]);
  const npc = game.world.npcs[definition.id];
  if (!npc?.alive) return impossible(`${definition.name}已经不在可战斗状态。`, ["确认消息", "调查遗留影响", "离开"]);
  if (npc.locationId !== game.view.locationId) return impossible(`${definition.name}不在这里。`, [`打听${definition.name}的行踪`, "放弃攻击", "寻找其他办法"]);
  const estimatedNpcPower = npc.soulRank ?? (/封号|超级|绝世/.test(npc.powerTier) ? 92 : /魂斗罗/.test(npc.powerTier) ? 82 : /魂圣/.test(npc.powerTier) ? 72 : 45);
  const playerPower = (game.view.character?.soulRank ?? 0) + (game.view.character?.soulRings.length ?? 0) * 2 + game.view.affiliations.length;
  const random = actionRandom(game);
  const prepared = /偷袭|下毒|埋伏|准备/.test(action) ? 10 : 0;
  const successChance = Math.max(0.01, Math.min(0.9, 0.42 + (playerPower + prepared - estimatedNpcPower) / 55));
  const success = random() < successChance;
  const lethal = /杀|刺杀|致命|不留活口/.test(action);
  if (success && lethal) {
    npc.alive = false;
    npc.currentGoal = "死亡后留下的事务尚未结束";
    npc.memoryOfPlayer.push("玩家直接造成了这次死亡");
    const impact = definition.importance * 20;
    game.world.deviation += impact;
    game.world.metrics.historicalImpact += impact;
    recordCanonInfluence(game, { source: "直接冲突", description: `直接造成${definition.name}死亡`, affectedNpcIds: [definition.id], affectedFactionIds: definition.factionIds, strength: impact });
    game.view.character!.reputation = "被多方追查";
    return { intent: "袭击重要人物", minutes: 40, ruleSummary: `${definition.name}死亡，世界偏差增加 ${impact}，所属势力将作出反应。`, fallbackNarrative: `最后一下落下去后，周围反而安静了。我没时间确认第二遍，远处已经有人喊他的名字。撤离路线还能用，原先的生活大概回不去了。`, suggestions: ["立刻撤离", "清理能够追查的线索", "观察相关势力反应"], systemMessages: [`重要人物死亡 · ${definition.name}`, `世界偏差 · +${impact}`] };
  }
  const harm = Math.max(8, Math.round((estimatedNpcPower - playerPower) * 0.9) + integer(random, 5, 18));
  game.world.healthPoints -= harm;
  npc.dispositionToPlayer -= 35;
  npc.memoryOfPlayer.push("玩家曾经主动袭击自己");
  game.view.character!.injuries.push(harm >= 40 ? "强者反击造成的重伤" : "冲突中留下的外伤");
  game.world.deviation += definition.importance * 2;
  recordCanonInfluence(game, { source: "直接冲突", description: `主动袭击${definition.name}`, affectedNpcIds: [definition.id], affectedFactionIds: definition.factionIds, strength: definition.importance * 3 });
  return { intent: "袭击重要人物", minutes: 20, ruleSummary: `袭击${definition.name}失败，受到 ${harm} 点内部伤害，对方已经记住这次敌意。`, fallbackNarrative: `我才动，他就已经转过身。下一瞬胸口像被重锤砸中，脚底擦着地面退了很远。想好的后手只来得及用一半，他看我的眼神已经彻底变了。`, suggestions: ["设法脱身", "处理伤势", "准备面对追查"] };
}

function workResolution(game: StoredGame): ActionResolution {
  const random = actionRandom(game);
  const earned = Math.max(1, Math.round(integer(random, 3, 8) * DIFFICULTY_RULES[game.view.difficulty].money));
  game.view.character!.coins += earned;
  game.world.fatiguePoints += 15;
  return {
    intent: "工作",
    minutes: speedMinutes(game, 360, 1440),
    ruleSummary: `完成临时工作，获得 ${formatSoulCoins(earned)}，疲劳增加。`,
    fallbackNarrative: `活不难，就是一遍遍搬东西。收工时掌心磨红了一块，管事把${formatSoulCoins(earned)}倒进我手里，当面数清。`,
    suggestions: ["购买补给", "回去休息", "继续工作"],
  };
}

function buyResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character!;
  const item = /药/.test(action) ? "止血散" : /食|干粮/.test(action) ? "两日干粮" : /绳/.test(action) ? "猎魂绳" : "基础补给包";
  const cost = Math.max(1, Math.round((item === "基础补给包" ? 10 : 5) * DIFFICULTY_RULES[game.view.difficulty].resourceCost));
  if (character.coins < cost) return impossible(`购买${item}需要${formatSoulCoins(cost)}，当前只有${formatSoulCoins(character.coins)}。`, ["找临时工作", "换便宜的东西", "离开商店"]);
  character.coins -= cost;
  game.view.inventory.push(item);
  return {
    intent: "购买",
    minutes: 20,
    ruleSummary: `花费${formatSoulCoins(cost)}，获得${item}。`,
    fallbackNarrative: `我把魂币在柜台上排开。老板数完，收走${formatSoulCoins(cost)}，把${item}推了过来。我拆开看过一遍才塞进包里。`,
    suggestions: ["继续采购", "整理背包", "离开商店"],
  };
}

function economyResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character!;
  const economy = game.view.economy;
  if (/完成.*悬赏|交付.*悬赏/.test(action)) {
    const task = game.view.tasks.find((item) => item.kind === "悬赏" && item.status === "进行中");
    if (!task) return impossible("当前没有能够交付的悬赏记录。", ["查看任务", "接受悬赏", "核对委托人"]);
    const proof = game.world.actionLedger.some((item) => task.title.includes(item.action) || item.action.includes(task.title.replace(/^完成/, "")));
    if (!proof) return impossible("行动记录中没有足以证明悬赏目标已经完成的因果链。", ["完成悬赏要求", "收集证明", "向委托人核对条件"]);
    const reward = Number(task.detail.match(/报酬(\d+)金魂币/)?.[1] ?? 20);
    character.coins += reward; task.status = "完成";
    return { intent: "交付悬赏", minutes: 60, ruleSummary: `凭行动记录和证据交付${task.title}，获得${formatSoulCoins(reward)}。`, fallbackNarrative: `委托人没有只听主角描述。他把证物、日期和两名见证人的口供都核过，才解开钱袋的绳结。`, suggestions: ["核对报酬", "处理悬赏后果", "寻找下一项工作"] };
  }
  if (/接受.*悬赏|领取.*悬赏/.test(action)) {
    const reward = 15 + game.view.character!.soulRank * 2;
    const title = `完成${game.view.location ?? "当地"}公开悬赏`;
    ensureTask(game, { id: `bounty-${game.actionIndex}`, title, kind: "悬赏", detail: `调查并解决当地公告中的目标；报酬${reward}金魂币，只有完成任务本身才支付。`, status: "进行中", destinationId: game.view.locationId });
    return { intent: "接受悬赏", minutes: 20, ruleSummary: `记录悬赏条件与${formatSoulCoins(reward)}报酬，尚未获得奖励。`, fallbackNarrative: `主角把告示从头读到尾，尤其看了失败责任和验收凭证。接下这件事只多了一份义务，钱要等真的做完才有。`, suggestions: ["调查悬赏目标", "准备所需物资", "确认验收方式"] };
  }
  if (/发布.*悬赏/.test(action)) {
    const reward = Math.min(character.coins, Math.max(10, Number(action.match(/\d+/)?.[0] ?? 20)));
    if (reward < 10) return impossible("发布公开悬赏至少要先交付十枚金魂币或等价担保。", ["筹集赏金", "缩小委托范围", "改为私下请托"]);
    character.coins -= reward;
    return { intent: "发布悬赏", minutes: 60, ruleSummary: `向当地委托机构预付${formatSoulCoins(reward)}，发布具名悬赏；接取者与传播范围将受当地关系影响。`, fallbackNarrative: `赏金先封进柜上的木匣，告示才盖章。管事把不肯承担的风险逐条划掉，剩下的内容没有最初设想得那么万能。`, suggestions: ["观察接取者", "补充可靠情报", "准备验收条件"] };
  }
  if (/存入|存钱/.test(action)) {
    const amount = Math.max(1, Math.min(character.coins, Number(action.match(/\d+/)?.[0] ?? character.coins)));
    if (amount <= 0) return impossible("身上没有可以存入的钱。", ["找工作", "查看账目", "离开钱庄"]);
    character.coins -= amount; economy.bankBalance += amount;
    return { intent: "钱庄存款", minutes: 30, ruleSummary: `在当地钱庄存入${formatSoulCoins(amount)}，取得具名凭据。`, fallbackNarrative: `柜上把魂币称了两遍，又让我在存据上按印。纸上的数和柜台收走的数对得上，我才把凭据折好。`, suggestions: ["收好存据", "打听借贷条件", "离开钱庄"] };
  }
  if (/取出|取钱/.test(action)) {
    const amount = Math.max(1, Math.min(economy.bankBalance, Number(action.match(/\d+/)?.[0] ?? economy.bankBalance)));
    if (amount <= 0) return impossible("钱庄账户里没有可取余额。", ["查看账目", "找工作", "离开钱庄"]);
    economy.bankBalance -= amount; character.coins += amount;
    return { intent: "钱庄取款", minutes: 30, ruleSummary: `凭具名存据取出${formatSoulCoins(amount)}。`, fallbackNarrative: `掌柜把存据对着灯看过，才从柜后取钱。魂币落在盘里叮当作响，我数清后收进贴身袋。`, suggestions: ["购买物资", "收好余款", "离开钱庄"] };
  }
  if (/借贷|借钱|贷款/.test(action)) {
    const trust = game.view.relations.reduce((sum, item) => sum + Math.max(0, item.dimensions?.trust ?? item.strength ?? 0), 0);
    const amount = Math.min(120, 15 + Math.floor(trust / 20) + game.view.affiliations.length * 20);
    economy.debt += amount + Math.ceil(amount * .2); character.coins += amount;
    ensureTask(game, { id: `debt-${game.actionIndex}`, title: `偿还${formatSoulCoins(economy.debt)}债务`, kind: "承诺", detail: "逾期会影响担保人、钱庄声望与后续借贷。", status: "进行中" });
    return { intent: "借贷", minutes: 60, ruleSummary: `凭身份与担保借到${formatSoulCoins(amount)}，应还${formatSoulCoins(amount + Math.ceil(amount * .2))}。`, fallbackNarrative: `契据念得很慢，利息那一行又念了一遍。钱拿到手时，我的名字和担保关系也一起留在了账本里。`, suggestions: ["记录还款期限", "只购买必要物资", "寻找稳定收入"] };
  }
  if (/还债|偿还/.test(action)) {
    const amount = Math.min(character.coins, economy.debt);
    if (!amount) return impossible("当前没有可偿还的钱或未结债务。", ["查看账目", "找工作", "安排收入"]);
    character.coins -= amount; economy.debt -= amount;
    if (!economy.debt) { const task = game.view.tasks.find((item) => item.id?.startsWith("debt-") && item.status === "进行中"); if (task) task.status = "完成"; }
    return { intent: "偿还债务", minutes: 30, ruleSummary: `偿还${formatSoulCoins(amount)}，剩余债务${formatSoulCoins(economy.debt)}。`, fallbackNarrative: `魂币一枚枚推过去，账房在每一栏旁盖了小印。债没有因为还了一部分就消失，至少数字确实少了。`, suggestions: economy.debt ? ["继续安排收入", "核对到期日", "暂缓非必要花费"] : ["取回结清凭证", "恢复正常采购", "离开钱庄"] };
  }
  if (/黑市/.test(action)) {
    const known = game.view.relations.some((item) => /黑市|地下|掮客/.test(`${item.name}${item.faction ?? ""}`)) || /黑市|地下/.test(game.view.character!.originName);
    if (!known) return impossible("主角没有可靠引路人，贸然寻找黑市只会先暴露自己的意图。", ["打听地下掮客", "调查不记名交易", "先建立本地关系"]);
    economy.blackMarketAccess = true;
    return { intent: "黑市交易", minutes: 120, ruleSummary: "通过可信引路人确认一处不记名交易入口；价格更高，赃物与钓鱼风险并存。", fallbackNarrative: `引路人换了两次方向，最后只指了一扇没有招牌的门。里面没人问真名，桌上的东西也没有一件写着来路。`, suggestions: ["只询价不购买", "调查货物来源", "使用化名交易"] };
  }
  if (/经营|开店|商铺|生意/.test(action)) {
    const investment = Math.min(character.coins, 50);
    if (investment < 20) return impossible("开业所需押金、货物和地方关系还不够。", ["积攒魂币", "寻找合伙人", "先摆摊试卖"]);
    character.coins -= investment; economy.business = economy.business ?? `${game.view.location ?? "当地"}的小型商铺`;
    return { intent: "商业经营", minutes: speedMinutes(game, 720, 4320), ruleSummary: `向${economy.business}投入${formatSoulCoins(investment)}，完成一轮进货、销售与损耗结算。`, fallbackNarrative: `账面上的进项看着不少，扣掉摊位、损耗和请人搬货的钱，真正留下的没有那么漂亮。我把卖不动的货单独圈了出来。`, suggestions: ["调整货物", "调查当地需求", "核对账目"] };
  }
  return impossible("这项经济行动缺少明确对象或数额。", ["说明存取或借贷数额", "查看魂币", "寻找当地钱庄"]);
}

function professionResolution(game: StoredGame, action: string): ActionResolution {
  const routes = [
    [/炼药|丹药|药剂/, "炼药"], [/锻造|炼器|打造/, "锻造与炼器"], [/魂导器/, "魂导器研究"], [/阵法|阵纹/, "阵法"], [/医术|治疗/, "医术"], [/毒术|制毒/, "毒术"], [/商业|经商/, "商业"], [/驯兽|驯养/, "驯兽"], [/学术|理论|研究魂兽/, "魂师学术"],
  ] as const;
  const name = routes.find(([pattern]) => pattern.test(action))?.[1] ?? "综合研究";
  let profession = game.view.professions.find((item) => item.name === name);
  if (!profession) { profession = { id: name, name, level: "学徒", progress: 0, experiments: 0, failures: 0, knownMethods: [] }; game.view.professions.push(profession); }
  profession.experiments += 1;
  const materialIndex = game.view.inventory.findIndex((item) => /药|草|矿|铁|木|兽皮|毒|魂兽材料|残片/.test(item));
  const hasMaterial = materialIndex >= 0;
  const taught = game.view.relations.some((item) => /导师|师父|老师|医师|铁匠|药师/.test(`${item.relation}${item.name}`));
  const knowledge = profession.progress + (taught ? 18 : 0) + (game.view.character!.specialSystem ? 8 : 0);
  const random = actionRandom(game);
  const success = hasMaterial && random() < Math.min(.88, .28 + knowledge / 140);
  if (hasMaterial) game.view.inventory.splice(materialIndex, 1);
  const gain = hasMaterial ? integer(random, 5, 12) : integer(random, 1, 3);
  profession.progress = Math.min(100, profession.progress + gain);
  if (!success) profession.failures += 1;
  if (profession.progress >= 75) profession.level = "熟练"; else if (profession.progress >= 35) profession.level = "入门";
  const method = success ? `${name}基础法·第${profession.knownMethods.length + 1}式` : undefined;
  if (method && !profession.knownMethods.includes(method)) profession.knownMethods.push(method);
  if (success) game.view.inventory.push(name === "炼药" ? "自制恢复药散" : name === "锻造与炼器" ? "试制魂力工具" : `${name}实验成果`);
  game.world.fatiguePoints += 14;
  return { intent: "生活职业研究", minutes: speedMinutes(game, 240, 1440), ruleSummary: `${name}${success ? "实验成功" : hasMaterial ? "实验失败并记录原因" : "因缺少材料只完成纸面推演"}；熟练进度增加${gain}，材料适配与失败记录均已保存。`, fallbackNarrative: success ? `这一次材料没有在中途失控。成品算不上精致，至少每一步都能在斗罗大陆现有的工具和魂力条件下重做。` : `做到中段时结果就偏了。我没把失败归给运气，把火候、魂力和材料变化逐项记下，剩下的残料已经不能再用。`, suggestions: success ? ["测试成品效果", "记录完整步骤", "请专业人士复核"] : ["寻找合适材料", "请教专业人士", "根据失败记录修改步骤"] };
}

function factionManagementResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character!;
  let faction = game.view.managedFactions[0];
  if (!faction && /建立|创建/.test(action)) {
    if (character.soulRank < 30 && !game.view.affiliations.some((item) => /少主|继承|长老|核心/.test(item.role))) return impossible("当前实力、资金和人脉不足以让一个新势力合法存续。", ["招募可靠同伴", "积累资金", "先在现有势力取得职位"]);
    const name = action.match(/(?:建立|创建)([^，。]{2,12})/)?.[1]?.replace(/宗门|势力$/, "") || `${character.name}建立的组织`;
    faction = { id: `managed-${game.actionIndex}`, name, role: "创建者", members: Math.max(3, game.view.relations.filter((item) => (item.dimensions?.trust ?? item.strength ?? 0) >= 45).length), resources: character.coins, territory: [game.view.location ?? "临时驻地"], departments: ["日常事务"], internalIssues: ["成员来源单一", "收入不稳定"] };
    game.view.managedFactions.push(faction);
    return { intent: "建立势力", minutes: speedMinutes(game, 1440, 4320), ruleSummary: `建立${faction.name}，初始${faction.members}人、驻地为${faction.territory[0]}；内部问题已记录。`, fallbackNarrative: `名字写到纸上不算成立。三个人把能拿出的东西摆在一起，才勉强凑成第一份名册和一处能关门说话的地方。`, suggestions: ["明确组织规矩", "寻找稳定收入", "分配第一批职责"] };
  }
  if (!faction) return impossible("主角目前没有实际掌管的势力。", ["建立组织", "提升现有势力职位", "招募可信同伴"]);
  const cost = /扩建|领地|驻地/.test(action) ? 30 : 10;
  if (character.coins < cost) return impossible(`这项事务至少需要${formatSoulCoins(cost)}作为公开支出。`, ["筹措资金", "缩小计划", "寻找支持者"]);
  character.coins -= cost; faction.resources += Math.round(cost * .6);
  if (/招募/.test(action)) faction.members += Math.max(1, game.view.relations.filter((item) => (item.dimensions?.trust ?? item.strength ?? 0) >= 30).length);
  if (/情报/.test(action) && !faction.departments.includes("情报联络")) faction.departments.push("情报联络");
  if (/教育|培养|学院/.test(action) && !faction.departments.includes("弟子培养")) faction.departments.push("弟子培养");
  if (/外交/.test(action) && !faction.departments.includes("外务外交")) faction.departments.push("外务外交");
  if (/扩建|领地/.test(action)) faction.territory.push(`${game.view.location ?? "当前地区"}的新据点`);
  if (faction.members >= 12) faction.internalIssues = faction.internalIssues.filter((item) => item !== "成员来源单一");
  return { intent: "势力经营", minutes: speedMinutes(game, 480, 2880), ruleSummary: `${faction.name}完成一轮${/招募/.test(action) ? "招募" : /外交/.test(action) ? "外交" : /情报/.test(action) ? "情报建设" : "内部管理"}；成员${faction.members}人，资源账面${faction.resources}。`, fallbackNarrative: `会上没有人只谈理想。谁出钱、谁跑腿、出了事由谁担责，一项项落到纸上。散会时问题少了一个，又多了两个。`, suggestions: ["查看内部问题", "安排稳定收入", "处理成员关系"] };
}

function crimeResolution(game: StoredGame, action: string): ActionResolution {
  const random = actionRandom(game);
  const prepared = /伪装|踩点|销毁|无人|退路/.test(action) ? 18 : 0;
  const skill = (game.view.character?.soulRank ?? 0) + (game.personalityProfile.scores.patience ?? 0) * 3 + prepared;
  const guarded = (/武魂殿|宗门|贵族|金库|重要人物/.test(action) ? 55 : 22) + DIFFICULTY_RULES[game.view.difficulty].npcVigilance;
  const success = random() < Math.max(.05, Math.min(.9, .48 + (skill - guarded) / 100));
  const heat = Math.max(4, guarded - prepared + integer(random, -5, 12));
  const scope = game.view.location ?? "当前地区";
  let reputation = game.view.reputations.find((item) => item.scope === scope && item.publicName === game.view.character!.name);
  if (!reputation) { reputation = { scope, publicName: game.view.character!.name, reputation: "陌生人", heat: 0, source: "当地目击与登记" }; game.view.reputations.push(reputation); }
  reputation.heat = Math.min(100, reputation.heat + heat);
  reputation.reputation = success && prepared ? "身份尚未暴露，但有案件传闻" : "受到治安机构怀疑";
  reputation.source = success && prepared ? "现场痕迹与地下传闻" : "目击、证据与追查";
  game.view.economy.bounty += reputation.heat >= 60 ? 30 : 0;
  if (success) game.view.character!.coins += integer(random, 6, 28); else { game.world.healthPoints -= integer(random, 5, 22); game.view.character!.reputation = "受到本地追查"; }
  return { intent: "违法行动", minutes: 90, ruleSummary: `${success ? "行动达到主要目的" : "行动失败"}；证据、目击与当地警戒使热度增加${heat}。声望与追查只在有传播路径的地区变化。`, fallbackNarrative: success ? `东西到手不等于没有后果。离开时我看见街角有人盯着这边，原先准备的退路还能用，只是不能再照原路回来。` : `事情在最不该出声的地方出了声。守卫比预计来得快，我没拿到想要的东西，撤走时还把一截衣料留在了墙钉上。`, suggestions: ["处理证据与伤势", "暂时离开本地", "调查追查范围"] };
}

function disguiseResolution(game: StoredGame, action: string): ActionResolution {
  const alias = action.match(/(?:化名|自称|假名)[为叫作：: ]*([\u4e00-\u9fa5]{2,8})/)?.[1] ?? `无名旅人${game.view.reputations.length + 1}`;
  const existing = game.view.reputations.find((item) => item.publicName === alias && item.scope === game.view.location);
  if (!existing) game.view.reputations.push({ scope: game.view.location ?? "当前地区", publicName: alias, reputation: "新出现的陌生人", heat: 0, source: "化名与外观伪装" });
  return { intent: "身份伪装", minutes: 45, ruleSummary: `在${game.view.location ?? "当前地区"}启用化名“${alias}”；真实身份与化名声望分别记录，暴露需要证据传播。`, fallbackNarrative: `名字换了，衣服和说话习惯也得一起改。我在门口停了一会儿，把回答籍贯时该说的那套话重新过了一遍。`, suggestions: ["检查伪装破绽", "用化名打听消息", "避免接触认识真身的人"] };
}

function useItemResolution(game: StoredGame, action: string): ActionResolution {
  const index = game.view.inventory.findIndex((item) => action.includes(item) || (action.includes("药") && item.includes("药")) || (action.includes("干粮") && item.includes("干粮")));
  if (index < 0) return impossible("背包里没有对应物品。", ["查看背包", "购买补给", "改用其他办法"]);
  const [item] = game.view.inventory.splice(index, 1);
  if (item.includes("药")) game.world.healthPoints += 18;
  if (item.includes("干粮")) game.world.fatiguePoints -= 12;
  return {
    intent: "使用物品",
    minutes: 10,
    ruleSummary: `使用 ${item}，物品已消耗。`,
    fallbackNarrative: `我把${item}从包底翻出来用掉。效果没有立刻把所有难受都抹掉，至少身体缓过来一点。`,
    suggestions: ["休息", "检查状态", "继续行动"],
  };
}

function storageResolution(game: StoredGame, action: string): ActionResolution {
  const taking = /取回|从.*取|拿回/.test(action);
  if (taking) {
    const index = game.view.inventoryLoad.storage.findIndex((item) => action.includes(item));
    if (index < 0) return impossible("住处或已登记仓库中没有对应物品。", ["查看储藏", "整理随身物品", "说明要取出的物品"]);
    const [item] = game.view.inventoryLoad.storage.splice(index, 1); game.view.inventory.push(item);
    return { intent: "取回储物", minutes: 10, ruleSummary: `从当前可用储藏点取回${item}。`, fallbackNarrative: `我打开存物的地方，把${item}翻出来。封口和上次留下的一样，没有被人动过。`, suggestions: ["检查负重", "整理背包", "继续行动"] };
  }
  const index = game.view.inventory.findIndex((item) => action.includes(item));
  if (index < 0) return impossible("没有说明要存放的随身物品，或当前并不持有它。", ["查看背包", "说明物品名称", "暂时不整理"]);
  const [item] = game.view.inventory.splice(index, 1); game.view.inventoryLoad.storage.push(item);
  return { intent: "存放物品", minutes: 10, ruleSummary: `将${item}存放在${game.view.mapHierarchy.buildingName}的储物位置，不再计入随身负重。`, fallbackNarrative: `我给${item}重新包了一层，把它放进不容易受潮的位置。门锁扣上后，又伸手拉了一次。`, suggestions: ["继续整理", "检查储藏清单", "离开住处"] };
}

function waitResolution(game: StoredGame, action: string): ActionResolution {
  const minutes = /一年/.test(action) ? 360 * 1440 : /月/.test(action) ? 30 * 1440 : /天|一日/.test(action) ? 1440 : 180;
  const salaryMonths = Math.floor(minutes / (30 * 1440));
  const salary = salaryMonths * game.view.economy.salary;
  if (salary > 0) game.view.character!.coins += salary;
  game.world.fatiguePoints = Math.max(0, game.world.fatiguePoints - Math.min(60, Math.round(minutes / 720)));
  return {
    intent: "快进",
    minutes,
    ruleSummary: `世界时间推进 ${minutes} 分钟；NPC 与历史事件同步模拟。${salary ? `按当前身份领取${formatSoulCoins(salary)}俸禄。` : ""}`,
    fallbackNarrative: minutes >= 30 * 1440 ? "日子一天天过去。城里的价钱、来往的人和告示都换了几轮，我也不再是刚到这里时的样子。" : "我暂时没做别的事。天色和街上的人声慢慢变了，时间照常往前走。",
    suggestions: ["查看世界消息", "继续修炼", "检查人生计划"],
  };
}

function generalResolution(game: StoredGame): ActionResolution {
  game.world.fatiguePoints += 4;
  return {
    intent: "一般行动",
    minutes: 30,
    ruleSummary: "完成当前能力范围内的一般行动，没有获得确定性奖励。",
    fallbackNarrative: "我照自己的想法试了。能做的部分做完，剩下的卡在条件上。周围没冒出额外的好处，动过的东西还留在原处。",
    suggestions: ["检查结果", "换个办法", "找人帮忙"],
  };
}

function impossible(reason: string, suggestions = ["检查当前状态", "换一个做法", "先做准备"]): ActionResolution {
  return {
    intent: "无法完成",
    minutes: 10,
    ruleSummary: reason,
    fallbackNarrative: `我动手试了一下，很快就停住。${reason}继续硬来只会多添麻烦。`,
    suggestions,
  };
}

function updatePersonality(game: StoredGame, action: string): void {
  const profile = game.personalityProfile;
  const changes: Array<[RegExp, string, number]> = [
    [/救|保护|帮助/, "empathy", 1], [/杀|抢|威胁/, "empathy", -1], [/调查|观察|准备/, "patience", 1],
    [/直接攻击|冲上|硬闯/, "courage", 1], [/承诺|答应/, "integrity", 1], [/拒绝|独自|不服从/, "independence", 1],
  ];
  for (const [pattern, trait, delta] of changes) if (pattern.test(action)) profile.scores[trait] = (profile.scores[trait] ?? 0) + delta;
  profile.evidence ??= [];
  profile.evidence.push({ action: action.slice(0, 120), at: game.view.updatedAt });
  profile.evidence = profile.evidence.slice(-80);
}

export function resolveAction(game: StoredGame, input: string): ActionResolution {
  const action = input.trim();
  if (!game.view.character) return impossible("角色尚未完成觉醒。");
  if (game.view.status === "ended") return impossible("这一局已经结束。");

  let resolution: ActionResolution;
  const guarded = guardActionByStoryRules(game, action);
  const huntingActive = game.view.hunting && game.view.hunting.stage !== "完成";
  if (guarded) resolution = guarded;
  else if (huntingActive && /献祭|自愿融合|交换|救助|治疗魂兽|交流|沟通|取得信任|残魂传承|转化魂环/.test(action)) resolution = nonLethalRingResolution(game, action);
  else if (huntingActive && (game.view.hunting?.stage === "战斗" || /猎魂|魂兽|魂环|目标|追踪|出发|准备|吸收|返回/.test(action))) resolution = huntResolution(game, action);
  else if (/建立|创建|招募|任命|扩建|领地|外交|情报网|经营势力|管理宗门/.test(action) && /宗门|势力|组织|成员|领地|外交|情报/.test(action)) resolution = factionManagementResolution(game, action);
  else if (/存入.*(?:魂币|钱)|存钱|取出.*(?:魂币|钱)|取钱|借贷|借钱|贷款|还债|偿还债务|黑市|开店|商铺|经营生意|悬赏/.test(action)) resolution = economyResolution(game, action);
  else if (/存放|收进仓库|放回住处|取回|从.*取出|拿回/.test(action)) resolution = storageResolution(game, action);
  else if (/化名|伪装身份|假名|自称/.test(action)) resolution = disguiseResolution(game, action);
  else if (/偷窃|盗窃|抢劫|诈骗|绑架|放火|勒索/.test(action)) resolution = crimeResolution(game, action);
  else if (/学习|研究|尝试|实验|制作|改良|炼制|锻造|打造/.test(action) && /炼药|丹药|药剂|锻造|炼器|魂导器|阵法|阵纹|医术|治疗|毒术|制毒|商业|经商|驯兽|驯养|学术|魂兽/.test(action)) resolution = professionResolution(game, action);
  else if (/参悟|修炼传承|修行剑|炼丹|炼器|特殊体系|异界功法/.test(action)) resolution = specialSystemResolution(game, action);
  else if (/处理|介入|参与|帮助处理|阻止.*恶化|查看新事件|拒绝|不接受|回绝/.test(action) && game.world.dynamicEvents.some((item) => item.status === "可介入" && (action.includes(item.title) || item.participantIds.some((id) => action.includes(game.world.npcs[id]?.name ?? "")) || /查看新事件/.test(action)))) resolution = dynamicEventResolution(game, action);
  else if (/完成承诺|履行承诺/.test(action)) resolution = fulfillPromiseResolution(game, action);
  else if (/上课|课程|学院学习|参加实战课/.test(action)) resolution = academyStudyResolution(game);
  else if (/入学|报名.*学院|申请.*学院|成为工读生/.test(action)) resolution = academyResolution(game);
  else if (/加入|投靠|宗门考核/.test(action) && /宗|门|殿|势力|史莱克/.test(action)) resolution = factionResolution(game, action);
  else if (/拜师|收我为徒|请.*指导|寻找导师/.test(action)) resolution = mentorResolution(game, action);
  else if (/^(我)?(答应|承诺|保证)/.test(action)) resolution = promiseResolution(game, action);
  else if (/修炼|冥想|运转|练功|闭关/.test(action)) resolution = trainingResolution(game, action);
  else if (/休息|睡觉|疗伤|恢复/.test(action)) resolution = restResolution(game);
  else if (/使用|服用|吃下|吃掉/.test(action)) resolution = useItemResolution(game, action);
  else if (/购买|买|采购/.test(action)) resolution = buyResolution(game, action);
  else if (/打工|工作|赚钱|干活/.test(action)) resolution = workResolution(game);
  else if (/猎魂|猎取魂环|调查魂兽|获得魂环/.test(action)) resolution = huntResolution(game, action);
  else if (/前往|去往|出发去|旅行到|离开去/.test(action)) resolution = travelResolution(game, action);
  else if (/问|询问|打听|交谈|告诉|拜访/.test(action)) resolution = conversationResolution(game, action);
  else if (/调查|搜索|观察周围|查找|研究/.test(action)) resolution = investigateResolution(game, action);
  else if (/等待|快进|过去一天|过去一月|过去一年|休整一/.test(action)) resolution = waitResolution(game, action);
  else if (/攻击|战斗|防御|闪避|逃跑|弱点/.test(action) && game.view.combat) resolution = combatResolution(game, action);
  else if (/攻击|杀|刺杀|偷袭/.test(action) && CANON_CHARACTERS.some((item) => action.includes(item.name) || item.aliases.some((alias) => action.includes(alias)))) resolution = npcConflictResolution(game, action);
  else if (/攻击|杀|抢|闯入/.test(action)) resolution = impossible("当前缺少明确目标或足够条件，强行行动只会引来警惕。", ["观察目标", "先做准备", "暂时退开"]);
  else resolution = generalResolution(game);

  resolution.appliedRuleIds ??= selectNarrativeRules(game, action, resolution).map((rule) => rule.id);

  const worldMessages = advanceWorldTime(game, resolution.minutes);
  resolution.systemMessages = [...(resolution.systemMessages ?? []), ...worldMessages];
  if (worldMessages.some((message) => /事件|异响|失踪|招募|挑战/.test(message))) resolution.suggestions = ["查看新事件", ...resolution.suggestions].slice(0, 3);
  updatePersonality(game, action);
  syncCharacterState(game);
  syncInventoryAndEconomy(game);
  game.view.updatedAt = new Date().toISOString();
  return resolution;
}

export function applyActionResult(
  game: StoredGame,
  input: string,
  result: ActionResolution,
  narrative: string,
  suggestions: string[],
): void {
  const character = game.view.character;
  const thirdPerson = character ? toThirdPersonNarrative(narrative, character.name, character.gender) : narrative;
  game.view.narrative.push(entry("player", input), entry("narration", thirdPerson));
  for (const message of result.systemMessages ?? []) game.view.narrative.push(entry("system", message));
  game.view.suggestions = sanitizeNarrativeSuggestions(game, suggestions, result.suggestions);
  game.actionIndex += 1;
  game.world.actionLedger.push({ index: game.actionIndex, action: input.slice(0, 180), intent: result.intent, result: result.ruleSummary.slice(0, 220), year: game.view.worldTime?.year ?? 0, day: game.view.worldTime?.day ?? 1 });
  game.world.actionLedger = game.world.actionLedger.slice(-400);
  const objective = game.view.chapterObjective;
  if (objective && !/无法完成|规则阻止/.test(result.intent)) {
    const current = objective.steps.find((step) => step.status === "进行中") ?? objective.steps.find((step) => step.status === "未开始");
    const matches = current && ((current.id === "understand" && /问|询问|打听|请教|了解/.test(input)) || (current.id === "summon" && /召唤|武魂|尝试|测试/.test(input)) || (current.id === "path" && /入学|拜师|加入|宗门|修炼|计划/.test(input)) || (current.id === "recheck" && /检查|重测|调查|阵法|水晶/.test(input)) || (current.id === "alternate" && /锻炼|学习|研究|特殊|功法|体魄/.test(input)) || (current.id === "commit" && /决定|选择|加入|拜师|开始/.test(input)) || (current.id === "train-plan" && /修炼|冥想|训练/.test(input)) || (current.id === "support" && /拜师|同伴|请教|资料/.test(input)) || (current.id === "first-milestone" && /猎魂|魂环|魂兽/.test(input)));
    if (matches && current) {
      current.status = "完成";
      const next = objective.steps.find((step) => step.status === "未开始");
      if (next) next.status = "进行中";
      else game.view.chapterObjective = {
        title: game.view.character && game.view.character.soulRank >= 10 ? "准备完整的第一次猎魂" : "把成长路线推进到第一个瓶颈",
        stakes: "调查、准备和关系会决定这一步是机缘还是伤势。",
        steps: [{ id: "train-plan", text: "确定稳定可重复的修炼方式", status: "进行中" }, { id: "support", text: "找到导师、同伴或可靠资料", status: "未开始" }, { id: "first-milestone", text: "抵达十级并开始调查第一魂环", status: "未开始" }],
      };
    }
  }
  if (!/无法完成|规则阻止/.test(result.intent) && /帮助|阻止|攻击|杀|救|告诉|交谈|承诺|夺取|保护/.test(input)) {
    const npcIds = CANON_CHARACTERS.filter((npc) => input.includes(npc.name) || npc.aliases.some((alias) => input.includes(alias))).map((npc) => npc.id);
    const factionIds = FACTIONS.filter((faction) => input.includes(faction.name)).map((faction) => faction.id);
    if (npcIds.length || factionIds.length) recordCanonInfluence(game, { source: "玩家实际行动", description: input.slice(0, 100), affectedNpcIds: npcIds, affectedFactionIds: factionIds, strength: /杀|救下|摧毁|夺取/.test(input) ? 10 : /加入|拜师|保护|阻止/.test(input) ? 5 : 2 });
  }
  recordStoryConsequence(game, input, result);
  game.view.updatedAt = new Date().toISOString();
}
