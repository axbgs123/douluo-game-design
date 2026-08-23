import { randomUUID } from "node:crypto";
import type { ConditionLabel, HuntingStage, NarrativeEntry, SoulRingView, TaskView } from "../../shared/game.js";
import { CANON_CHARACTERS, FACTIONS, SOUL_BEASTS, locationById, soulBeastById } from "../data/world.js";
import type { ActionResolution, StoredGame } from "./model.js";
import { createRandom, integer, pick } from "./random.js";
import { advanceWorldTime, buildKnownFigures, buildMapView, inferLocationId, revealNpc } from "./world.js";

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
  character.condition = conditionLabel(game.world.healthPoints, game.world.fatiguePoints);
  character.fatigue = fatigueLabel(game.world.fatiguePoints);
  character.cultivationProgress = cultivationLabel(game);
  game.view.runProgress.highestSoulRank = Math.max(game.view.runProgress.highestSoulRank, character.soulRank);
  game.view.runProgress.discoveries = game.world.metrics.discoveries;
  game.view.runProgress.relationshipsBuilt = game.world.metrics.relationshipsBuilt;
  game.view.runProgress.historicalImpact = game.world.metrics.historicalImpact;
  game.view.runProgress.completedHunts = game.world.metrics.completedHunts;
  if (character.condition === "死亡") {
    game.view.status = "ended";
    game.view.runProgress.ending = "死亡";
  } else if (character.soulRank >= 99) {
    game.view.status = "ended";
    game.view.runProgress.ending = "走到百级门前";
  }
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

function trainingResolution(game: StoredGame): ActionResolution {
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
  const minutes = speedMinutes(game, 180, 10080);
  const baseGain = game.view.speed === "高速" ? integer(random, 34, 52) : integer(random, 8, 15);
  const personalityBonus = game.personalityProfile.scores.patience > 1 ? 1.12 : 1;
  const fatiguePenalty = game.world.fatiguePoints >= 70 ? 0.55 : game.world.fatiguePoints >= 45 ? 0.78 : 1;
  const gain = Math.max(1, Math.round(baseGain * rules.training * personalityBonus * fatiguePenalty));
  game.world.trainingPoints += gain;
  game.world.fatiguePoints += game.view.speed === "高速" ? 32 : 12;

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
    suggestions: character.soulRank % 10 === 0 ? ["调查魂兽", "找导师商量", "整理猎魂物资"] : ["休息", "记录修炼问题", "继续修炼"],
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
  const physique = PHYSIQUE_BONUS[character.abilityDescriptors.physique] ?? 0;
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
      if (!game.view.relations.some((relation) => relation.id === npc.id)) {
        const factionName = FACTIONS.find((faction) => mentioned.factionIds.includes(faction.id))?.name;
        game.view.relations.push({ id: npc.id, name: npc.name, relation: "初识", impression: "仍在观察我", faction: factionName, lastSeen: game.view.location });
        game.world.metrics.relationshipsBuilt += 1;
      }
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

function workResolution(game: StoredGame): ActionResolution {
  const random = actionRandom(game);
  const earned = Math.max(1, Math.round(integer(random, 3, 8) * DIFFICULTY_RULES[game.view.difficulty].money));
  game.view.character!.coins += earned;
  game.world.fatiguePoints += 15;
  return {
    intent: "工作",
    minutes: speedMinutes(game, 360, 1440),
    ruleSummary: `完成临时工作，获得 ${earned} 枚铜魂币，疲劳增加。`,
    fallbackNarrative: `活不难，就是一遍遍搬东西。收工时掌心磨红了一块，管事把 ${earned} 枚铜魂币倒进我手里，当面数清。`,
    suggestions: ["购买补给", "回去休息", "继续工作"],
  };
}

function buyResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character!;
  const item = /药/.test(action) ? "止血散" : /食|干粮/.test(action) ? "两日干粮" : /绳/.test(action) ? "猎魂绳" : "基础补给包";
  const cost = item === "基础补给包" ? 10 : 5;
  if (character.coins < cost) return impossible(`购买${item}需要 ${cost} 枚铜魂币，当前只有 ${character.coins} 枚。`, ["找临时工作", "换便宜的东西", "离开商店"]);
  character.coins -= cost;
  game.view.inventory.push(item);
  return {
    intent: "购买",
    minutes: 20,
    ruleSummary: `花费 ${cost} 枚铜魂币，获得 ${item}。`,
    fallbackNarrative: `我把钱在柜台上排开。老板数完，收走 ${cost} 枚，把${item}推了过来。我拆开看过一遍才塞进包里。`,
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
  const huntingActive = game.view.hunting && game.view.hunting.stage !== "完成";
  if (huntingActive && (game.view.hunting?.stage === "战斗" || /猎魂|魂兽|魂环|目标|追踪|出发|准备|吸收|返回/.test(action))) resolution = huntResolution(game, action);
  else if (/修炼|冥想|运转|练功/.test(action)) resolution = trainingResolution(game);
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
  else if (/攻击|杀|抢|闯入/.test(action)) resolution = impossible("当前缺少明确目标或足够条件，强行行动只会引来警惕。", ["观察目标", "先做准备", "暂时退开"]);
  else resolution = generalResolution(game);

  const worldMessages = advanceWorldTime(game, resolution.minutes);
  resolution.systemMessages = [...(resolution.systemMessages ?? []), ...worldMessages];
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
  game.view.narrative.push(entry("player", input), entry("narration", narrative));
  for (const message of result.systemMessages ?? []) game.view.narrative.push(entry("system", message));
  game.view.suggestions = suggestions.slice(0, 3);
  game.actionIndex += 1;
  game.view.updatedAt = new Date().toISOString();
}
