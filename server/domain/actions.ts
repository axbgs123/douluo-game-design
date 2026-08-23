import { randomUUID } from "node:crypto";
import type { ConditionLabel, HuntingStage, NarrativeEntry, SoulRingView, TaskView } from "../../shared/game.js";
import { CANON_CHARACTERS, FACTIONS, SOUL_BEASTS, locationById, soulBeastById } from "../data/world.js";
import type { ActionResolution, StoredGame } from "./model.js";
import { createRandom, integer, pick } from "./random.js";
import { advanceWorldTime, buildKnownFigures, buildMapView, inferLocationId, recordCanonInfluence, revealNpc } from "./world.js";
import { toThirdPersonNarrative } from "./narrative.js";
import { guardActionByStoryRules, recordStoryConsequence, sanitizeNarrativeSuggestions, selectNarrativeRules } from "./story-rules.js";
import { formatSoulCoins } from "../../shared/currency.js";

interface DifficultyRules {
  training: number;
  money: number;
  safety: number;
  information: number;
}

const DIFFICULTY_RULES: Record<StoredGame["view"]["difficulty"], DifficultyRules> = {
  爽: { training: 1.35, money: 1.35, safety: 0.22, information: 1.3 },
  简单: { training: 1.15, money: 1.15, safety: 0.12, information: 1.15 },
  标准: { training: 1, money: 1, safety: 0, information: 1 },
  困难: { training: 0.9, money: 0.9, safety: -0.08, information: 0.85 },
  地狱: { training: 0.82, money: 0.8, safety: -0.16, information: 0.7 },
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

function tryResurrection(game: StoredGame): boolean {
  if (game.world.resurrectionCount >= 2) return false;
  const character = game.view.character;
  if (!character) return false;
  const strongAffiliation = game.view.affiliations.some((item) => /宗|武魂殿|学院/.test(item.name) && item.reputation !== "生疏");
  const closeRelations = game.view.relations.filter((item) => /信任|亲近|师徒|生死/.test(`${item.relation}${item.impression}`)).length;
  const special = character.specialSystem && /因果|至尊骨|残魂/.test(character.specialSystem.name);
  const support = (strongAffiliation ? 3 : 0) + Math.min(3, closeRelations) + (special ? 3 : 0) + Math.floor(character.soulRank / 30) + Number(game.world.flags.legacyFoundation ?? 0);
  if (support < 3) return false;
  const random = actionRandom(game);
  const chance = Math.min(0.82, 0.18 + support * 0.08 - game.world.resurrectionCount * 0.18);
  if (random() >= chance) return false;
  game.world.resurrectionCount += 1;
  game.world.healthPoints = 22;
  game.world.fatiguePoints = 95;
  character.injuries.push(strongAffiliation ? "复生代价造成的根基损伤" : "濒死后遗留的魂魄裂伤");
  character.coins = Math.max(0, character.coins - 20);
  game.world.deviation += 8;
  game.world.metrics.historicalImpact += 3;
  game.view.narrative.push(entry("system", `复生 · 第 ${game.world.resurrectionCount} 次 · 已付出永久代价`));
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
  game.world.fatiguePoints += Math.min(35, Math.ceil(minutes / 240));
  const danger = locationById(target.id)?.danger;
  const encounter = ["高", "禁区"].includes(danger ?? "") && random() < 0.28;
  if (encounter) {
    game.world.healthPoints -= integer(random, 4, 14);
    game.view.inventory = game.view.inventory.filter((item, index) => !(item === "半日干粮" && index === game.view.inventory.indexOf("半日干粮")));
  }
  game.view.map = buildMapView(game);
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
    skillDescription: `${beast.attributes.join("、")}属性与${character.martialSoul.name}结合形成的${skillBase}能力。`,
  };
  character.soulRings.push(ring);
  if (character.soulRank === ringIndex * 10) character.soulRank += 1;
  game.world.healthPoints -= Math.max(0, Math.round(overRatio * 14));
  game.world.fatiguePoints += 28;
  hunting.stage = "后果";
  hunting.result = `吸收成功，获得 ${skillName}`;
  game.world.metrics.discoveries += 1;
  return {
    intent: "吸收魂环",
    minutes: speedMinutes(game, 120, 360),
    ruleSummary: `成功吸收 ${years} 年${beast.name}魂环，获得魂技 ${skillName}，魂力 ${character.soulRank} 级。`,
    fallbackNarrative: `最难受的那一阵过去后，体内的力量终于沿着同一个方向转起来。${ring.color}色魂环停在脚下，${skillName}的用法随魂力一同浮进脑海。我睁眼时，天已经偏了。`,
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
        game.view.relations.push({ id: npc.id, name: npc.name, relation: "初识", impression: "仍在观察主角", faction: factionName, lastSeen: game.view.location, strength: 10, category: "师友" });
        game.world.metrics.relationshipsBuilt += 1;
      } else {
        const relation = game.view.relations.find((item) => item.id === npc.id)!;
        relation.impression = npc.dispositionToPlayer >= 20 ? "愿意信任主角处理一些私事" : npc.dispositionToPlayer >= 10 ? "记得主角，也愿意多说几句" : "仍在观察主角";
        relation.relation = npc.dispositionToPlayer >= 20 ? "信任" : npc.dispositionToPlayer >= 10 ? "熟识" : relation.relation;
        relation.lastSeen = game.view.location;
        relation.strength = Math.min(100, (relation.strength ?? 8) + 8);
      }
      game.world.deviation += Math.max(1, Math.floor(mentioned.importance / 2));
      recordCanonInfluence(game, { source: "当面交谈", description: `与${mentioned.name}当面交谈`, affectedNpcIds: [mentioned.id], affectedFactionIds: mentioned.factionIds, strength: Math.max(1, mentioned.importance - 2) });
      detail = `与 ${mentioned.name} 当面交谈，建立初步关系。`;
      systemMessages.push(`人物记录 · ${mentioned.name}`);
    } else {
      revealNpc(game, mentioned.id);
      detail = `打听到关于 ${mentioned.name} 的传闻，无法确认全部真实性。`;
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
  if (existing) { existing.relation = "师徒"; existing.impression = "愿意认真指导，但仍会考察每次选择"; existing.strength = Math.max(45, existing.strength ?? 0); existing.category = "师友"; }
  else game.view.relations.push({ id: mentioned?.id ?? "local-mentor", name: mentorName, relation: "师徒", impression: "愿意先教基础，再看品性", strength: 45, category: "师友" });
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
  for (const relation of game.view.relations) if (/委托|师徒|同伴|亲属/.test(relation.relation)) relation.impression = "知道主角会把答应的事做完";
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
  const cost = item === "基础补给包" ? 10 : 5;
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

function waitResolution(game: StoredGame, action: string): ActionResolution {
  const minutes = /一年/.test(action) ? 360 * 1440 : /月/.test(action) ? 30 * 1440 : /天|一日/.test(action) ? 1440 : 180;
  game.world.fatiguePoints = Math.max(0, game.world.fatiguePoints - Math.min(60, Math.round(minutes / 720)));
  return {
    intent: "快进",
    minutes,
    ruleSummary: `世界时间推进 ${minutes} 分钟；NPC 与历史事件同步模拟。`,
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
  else if (huntingActive && (game.view.hunting?.stage === "战斗" || /猎魂|魂兽|魂环|目标|追踪|出发|准备|吸收|返回/.test(action))) resolution = huntResolution(game, action);
  else if (/参悟|修炼传承|修行剑|炼丹|炼器|特殊体系|异界功法/.test(action)) resolution = specialSystemResolution(game, action);
  else if (/处理|介入|参与|帮助处理|阻止.*恶化|查看新事件/.test(action) && game.world.dynamicEvents.some((item) => item.status === "可介入")) resolution = dynamicEventResolution(game, action);
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
