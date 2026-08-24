import { randomUUID } from "node:crypto";
import type { CompanionRole, ConditionLabel, HuntingStage, InstitutionAssignmentView, NarrativeEntry, SoulRingView, TaskView } from "../../shared/game.js";
import { CANON_CHARACTERS, FACTIONS, SOUL_BEASTS, factionActiveAtYear, locationById, soulBeastById } from "../data/world.js";
import type { ActionResolution, StoredGame } from "./model.js";
import { createRandom, integer, pick } from "./random.js";
import { advanceWorldTime, buildKnownFigures, buildMapHierarchy, buildMapView, canDiscoverNpc, inferLocationId, queueSocialRumor, recordCanonInfluence, recordIntelligence, recordMediaCompetition, recordMediaOutletReputation, rememberNpcInteraction, revealNpc } from "./world.js";
import { toThirdPersonNarrative } from "./narrative.js";
import { guardActionByStoryRules, recordStoryConsequence, sanitizeNarrativeSuggestions, selectNarrativeRules } from "./story-rules.js";
import { formatSoulCoins } from "../../shared/currency.js";
import { createSpecialSystemView, goldFingerByName, isGoldFinger } from "../data/gold-fingers.js";
import { heirloomByName } from "../../shared/heirlooms.js";

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
  if (game.world.healthPoints <= 0 && tryResurrection(game)) {
    game.world.healthPoints = Math.max(18, game.world.healthPoints);
    game.view.combat = undefined;
    if (game.view.hunting && game.view.hunting.stage === "战斗") {
      game.view.hunting.stage = "追踪";
      game.view.hunting.trailProgress = "复生后脱离战斗，原目标需要重新追踪";
    }
  }
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

function relationshipOrdinal(game: StoredGame): number {
  return (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1);
}

function relationshipDate(game: StoredGame): string {
  return `原作 ${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日`;
}

function relationshipResolution(game: StoredGame, action: string): ActionResolution {
  const namedCandidates = game.view.relations.filter((relation) => action.includes(relation.name));
  const partnerRelation = game.view.family.partner ? game.view.relations.find((relation) => relation.name === game.view.family.partner?.name) : undefined;
  const candidates = namedCandidates.length === 0 && partnerRelation && /家庭|住所|孩子|生育|收养/.test(action) ? [partnerRelation] : namedCandidates;
  if (candidates.length !== 1) return impossible(candidates.length > 1 ? "这句话同时指向多人，程序不能替我决定关系对象。" : "关系档案里没有能与这句话唯一对应的人。", ["先与对方当面交谈", "明确写出对方姓名", "查看关系明细"]);
  const relation = candidates[0];
  if (["亲属", "敌对", "势力"].includes(relation.category ?? "其他")) return impossible(`${relation.name}当前的关系类别不允许进入伴侣流程。`, ["保持合适边界", "处理现有关系矛盾", "查看关系明细"]);
  const dimensions = relation.dimensions ?? relationDimensions(relation.strength ?? 0);
  relation.dimensions ??= dimensions;
  const npcAge = relation.id ? game.world.npcs[relation.id]?.age : undefined;
  const otherAge = npcAge ?? relation.age;
  const playerAge = game.view.character?.age ?? 0;
  const now = relationshipOrdinal(game);
  const sharedHistory = (relation.history ?? []).filter((item) => /共同|并肩|帮助|救助|支持|训练|战斗|旅行|履约|照料|相处|合作/.test(item.reason));
  const adultRequired = /伴侣|恋爱|心意|求婚|婚姻|结婚|成婚|家庭|孩子|生育|收养|婚礼/.test(action);
  if (adultRequired && (playerAge < 18 || otherAge === undefined || otherAge < 18)) return impossible(otherAge === undefined ? `尚无可靠档案证明${relation.name}已经成年，不能进入成人伴侣流程。` : "双方尚未都达到成年人阶段，不能进入成人伴侣流程。", ["继续正常相处", "积累共同经历", "等待双方成年"]);
  if (dimensions.hostility > 10 || dimensions.vigilance > 45) return impossible(`${relation.name}仍有明显敌意或戒备，不能把单方面指令当作同意。`, [`先化解与${relation.name}的矛盾`, "通过真实行动建立信任", "尊重对方边界"]);

  const isMarriageDiscussion = /讨论.*(?:婚姻|结婚|成婚|婚礼)|求婚/.test(action);
  const isMarriage = /登记结婚|正式结婚|举行婚礼|与.*(?:结婚|成婚)/.test(action) && !isMarriageDiscussion;
  const isFamilyDiscussion = /讨论.*(?:组建家庭|生育|收养|孩子)|商量.*(?:家庭|孩子)/.test(action);
  const isFamilyPreparation = /准备.*(?:家庭住所|共同住所|迎接孩子)|完成.*家庭准备/.test(action);
  const isChildArrival = /迎接.*孩子|收养.*孩子|孩子.*加入家庭|孩子出生/.test(action) && !isFamilyDiscussion && !isFamilyPreparation;
  const isPartnerDiscussion = /讨论.*(?:长期关系|成为伴侣|恋爱)|表达.*心意/.test(action);
  const isPartnerConfirmation = /确认.*(?:伴侣|恋爱)|询问.*愿意成为伴侣|正式成为伴侣/.test(action) && !isPartnerDiscussion;
  const isFriendship = /成为朋友|确认朋友|建立友情/.test(action);
  const family = game.view.family;

  if (isFriendship) {
    if (dimensions.trust < 20 || dimensions.closeness < 20 || sharedHistory.length < 2) return impossible(`友情需要至少两段真实共同经历，且亲近与信任均达到 20；当前共同经历 ${sharedHistory.length} 段、亲近 ${dimensions.closeness}、信任 ${dimensions.trust}。`, [`与${relation.name}共同完成一件事`, `在困难中帮助${relation.name}`, `继续与${relation.name}相处`]);
    relation.lifeStage = dimensions.trust >= 45 && dimensions.closeness >= 45 && sharedHistory.length >= 4 ? "挚友" : "朋友";
    relation.relation = relation.lifeStage;
    recordPlayerRelation(game, relation, `双方依据${sharedHistory.length}段共同经历确认${relation.lifeStage}关系`, { trust: 2, closeness: 2 });
    return { intent: "确认友情", minutes: 30, ruleSummary: `以共同经历确认与${relation.name}的${relation.lifeStage}关系。`, fallbackNarrative: `我和${relation.name}没有靠一句漂亮话跳过过去。我们把一起做过的事说了一遍，最后都承认，这段友情已经有了分量。`, suggestions: [`与${relation.name}共同训练`, `邀请${relation.name}同行`, "查看关系记录"], systemMessages: [`关系阶段 · ${relation.name} · ${relation.lifeStage}`] };
  }

  if (isPartnerDiscussion) {
    if (family.partner && family.partner.name !== relation.name) return impossible(`我已有伴侣${family.partner.name}，不能在未处理现有承诺时建立另一段伴侣关系。`, [`与${family.partner.name}坦诚沟通`, "尊重现有承诺", "暂停关系决定"]);
    if (dimensions.trust < 60 || dimensions.closeness < 60 || sharedHistory.length < 4) return impossible(`讨论长期伴侣关系需要至少四段真实共同经历，且亲近与信任均达到 60；当前共同经历 ${sharedHistory.length} 段、亲近 ${dimensions.closeness}、信任 ${dimensions.trust}。`, [`与${relation.name}共同完成重要经历`, `继续了解${relation.name}的边界`, "不要急于作出承诺"]);
    relation.partnerDiscussedAtOrdinal = now;
    relation.consentEvidence ??= [];
    relation.consentEvidence.push(`${relationshipDate(game)}：主角表达长期关系意向；${relation.name}同意在冷静期后再次明确确认`);
    return { intent: "讨论伴侣关系", minutes: 60, ruleSummary: `${relation.name}只同意进入讨论与冷静期，尚未建立伴侣关系。`, fallbackNarrative: `我把自己的想法说清楚，也把拒绝的余地留给${relation.name}。对方没有被一句话替代回答，只说愿意认真想一段时间，再给我明确答复。`, suggestions: ["等待至少七天", `询问${relation.name}是否愿意成为伴侣`, "继续维持正常相处"], systemMessages: [`关系意向 · ${relation.name} · 等待再次确认`] };
  }

  if (isPartnerConfirmation) {
    if (relation.partnerDiscussedAtOrdinal === undefined) return impossible("还没有经过双方可追溯的关系讨论。", [`与${relation.name}讨论长期关系`, "继续相处", "尊重对方边界"]);
    if (now - relation.partnerDiscussedAtOrdinal < 7) return impossible("冷静期尚未满七天，不能把当下情绪直接写成长期承诺。", ["等待至少七天", "继续正常相处", "暂不推进关系"]);
    if (family.partner && family.partner.name !== relation.name) return impossible(`现有伴侣是${family.partner.name}，关系状态冲突。`);
    const evidence = [...(relation.consentEvidence ?? []), `${relationshipDate(game)}：${relation.name}在无胁迫状态下明确同意成为伴侣`];
    relation.consentEvidence = evidence;
    relation.lifeStage = "伴侣";
    relation.relation = "伴侣";
    family.partner = { relationId: relation.id, name: relation.name, status: "伴侣", establishedAt: relationshipDate(game), establishedAtOrdinal: now, consentEvidence: evidence };
    recordPlayerRelation(game, relation, "双方在冷静期后明确确认伴侣关系", { trust: 3, closeness: 3 });
    return { intent: "确认伴侣", minutes: 60, ruleSummary: `双方在冷静期后明确同意，建立伴侣关系。`, fallbackNarrative: `${relation.name}亲口给出了答复。我又确认了一次这不是压力下的选择。直到双方都说清楚，我们才把这一天记进共同档案。`, suggestions: [`与${relation.name}共同生活一段时间`, "继续积累共同经历", "查看家庭档案"], systemMessages: [`人生关系 · ${relation.name} · 伴侣`] };
  }

  if (isMarriageDiscussion) {
    if (family.partner?.name !== relation.name || family.partner.status !== "伴侣") return impossible("婚姻讨论只能在已经建立并持续一段时间的伴侣关系上进行。", [`先与${relation.name}建立伴侣关系`, "继续共同生活", "查看伴侣记录"]);
    if (now - family.partner.establishedAtOrdinal < 30) return impossible("伴侣关系建立不足三十天，尚缺稳定相处期。", ["等待关系稳定", "共同处理现实事务", "继续积累共同经历"]);
    if (dimensions.trust < 75 || dimensions.closeness < 75 || sharedHistory.length < 6) return impossible(`讨论婚姻需要至少六段共同经历，且亲近与信任均达到 75；当前共同经历 ${sharedHistory.length} 段、亲近 ${dimensions.closeness}、信任 ${dimensions.trust}。`);
    relation.marriageDiscussedAtOrdinal = now;
    relation.consentEvidence ??= [];
    relation.consentEvidence.push(`${relationshipDate(game)}：双方讨论婚姻、居所与责任，${relation.name}同意七天后再次确认`);
    return { intent: "讨论婚姻", minutes: 120, ruleSummary: "双方完成婚姻责任讨论，但尚未登记。", fallbackNarrative: `这次谈的不是仪式，而是住在哪里、如何分担风险，以及谁都可以在最终确认前改变决定。${relation.name}听完后，同意七天后再作正式答复。`, suggestions: ["等待至少七天", `与${relation.name}登记结婚`, "继续核对共同生活安排"], systemMessages: [`婚姻意向 · ${relation.name} · 待再次确认`] };
  }

  if (isMarriage) {
    if (family.partner?.name !== relation.name || family.partner.status !== "伴侣" || relation.marriageDiscussedAtOrdinal === undefined) return impossible("缺少有效伴侣关系或双方婚姻讨论记录，不能直接结婚。", [`与${relation.name}讨论婚姻`, "继续共同生活", "查看同意记录"]);
    if (now - relation.marriageDiscussedAtOrdinal < 7) return impossible("婚姻再次确认的七天冷静期尚未结束。", ["等待至少七天", "继续处理共同生活安排", "允许任一方改变决定"]);
    const evidence = `${relationshipDate(game)}：双方再次明确同意并完成婚姻登记`;
    relation.consentEvidence ??= [];
    relation.consentEvidence.push(evidence);
    relation.lifeStage = "配偶";
    relation.relation = "配偶";
    family.partner = { ...family.partner, status: "配偶", establishedAt: relationshipDate(game), establishedAtOrdinal: now, consentEvidence: [...family.partner.consentEvidence, evidence] };
    family.householdNotes.push(`${relationshipDate(game)}：${game.view.character?.name}与${relation.name}完成婚姻登记`);
    return { intent: "登记婚姻", minutes: 240, ruleSummary: `伴侣关系、共同经历、两次明确同意与冷静期均有记录，婚姻成立。`, fallbackNarrative: `我们又把决定从头确认了一遍。没有人替${relation.name}回答，也没有把过去的相处省略掉。登记落笔后，这段婚姻才真正进入家庭档案。`, suggestions: [`与${relation.name}讨论组建家庭`, "安排共同住所", "查看家庭档案"], systemMessages: [`家庭档案 · 配偶 · ${relation.name}`] };
  }

  if (isFamilyDiscussion) {
    if (family.partner?.name !== relation.name || family.partner.status !== "配偶") return impossible("组建家庭必须由已登记的成年配偶共同讨论。", ["先完成婚姻阶段", "尊重双方选择", "维持现有家庭"]);
    if (now - family.partner.establishedAtOrdinal < 90) return impossible("婚姻建立不足九十天，先经历稳定共同生活再决定。", ["继续共同生活", "处理居所与经济", "等待关系稳定"]);
    family.familyPlan = { agreedAt: relationshipDate(game), agreedAtOrdinal: now, route: "出生或收养", evidence: [`${relationshipDate(game)}：双方明确同意开始家庭计划，保留出生或收养两种路径`] };
    return { intent: "共同家庭计划", minutes: 120, ruleSummary: "双方建立可撤回的家庭计划，尚未产生子女记录。", fallbackNarrative: `我和${relation.name}把责任、风险和两种路径都谈清楚。我们只记下共同计划，没有把愿望写成已经发生的事实。`, suggestions: ["准备共同家庭住所", "储备家庭资金", "等待至少三十天后完成准备"], systemMessages: ["家庭计划 · 双方同意 · 尚在准备"] };
  }

  if (isFamilyPreparation) {
    if (!family.familyPlan) return impossible("尚无双方同意的家庭计划。", [`与${relation.name}讨论组建家庭`, "先稳定共同生活", "暂不推进"]);
    if (now - family.familyPlan.agreedAtOrdinal < 30) return impossible("家庭计划建立不足三十天，准备阶段不能被一句话跳过。", ["等待至少三十天", "准备住所", "积累家庭资金"]);
    if ((game.view.character?.coins ?? 0) < 50) return impossible("当前至少需要五十枚铜魂币作为基础住所与照料储备。", ["继续工作赚钱", "减少非必要支出", "延后家庭计划"]);
    game.view.character!.coins -= 50;
    family.familyPlan.preparedAtOrdinal = now;
    family.familyPlan.evidence.push(`${relationshipDate(game)}：共同住所与基础照料资金准备完成，支出五十枚铜魂币`);
    family.householdNotes.push(`${relationshipDate(game)}：完成家庭住所与照料准备`);
    return { intent: "完成家庭准备", minutes: 1440, ruleSummary: "完成住所与基础资金准备；仍需等待长期计划成熟。", fallbackNarrative: `住所、日常开销和紧急余量都逐项核过。五十枚铜魂币花出去后，档案里第一次有了能承担照料责任的现实证据。`, suggestions: ["等待家庭计划满二百七十天", "继续储备资金", "维持家庭关系"], systemMessages: ["家庭准备 · 已完成"] };
  }

  if (isChildArrival) {
    const plan = family.familyPlan;
    if (!plan?.preparedAtOrdinal) return impossible("尚未完成双方家庭计划与住所准备，不能直接生成子女记录。", ["讨论组建家庭", "完成家庭准备", "暂不推进"]);
    if (now - plan.agreedAtOrdinal < 270) return impossible("家庭计划尚未满二百七十天，不能跳过长期等待与照料准备。", ["等待家庭计划成熟", "继续维持住所与收入", "允许双方重新评估"]);
    const route = /收养/.test(action) ? "收养" as const : "出生" as const;
    const nameMatch = action.match(/名为([^，。\s]{1,8})的孩子/);
    const childName = nameMatch?.[1] ?? `${game.view.character?.name.slice(0, 1) ?? "家"}家孩子${family.children.length + 1}`;
    const evidence = [...plan.evidence, `${relationshipDate(game)}：通过${route}路径，${childName}正式进入家庭档案`];
    family.children.push({ id: randomUUID(), name: childName, joinedAt: relationshipDate(game), route, parentNames: [game.view.character!.name, relation.name], evidence });
    family.householdNotes.push(`${relationshipDate(game)}：${childName}通过${route}加入家庭；记录不附带任何战力继承`);
    delete family.familyPlan;
    return { intent: "建立子女档案", minutes: 1440, ruleSummary: `${childName}通过${route}进入家庭档案；该记录不复制父母武魂、等级或资产。`, fallbackNarrative: `${childName}的名字被写进家庭册。前面的共同决定、等待和现实准备都附在记录后面；这是一段人生关系，不是一份凭空增加力量的奖励。`, suggestions: ["照料孩子的日常生活", "整理家庭档案", "继续承担家庭责任"], systemMessages: [`家庭成员 · ${childName} · ${route}`] };
  }

  return impossible("这条关系行动缺少明确阶段。", [`与${relation.name}讨论长期关系`, `确认与${relation.name}的友情`, "查看关系明细"]);
}

function itemWeight(item: string): number {
  if (/封签货箱/.test(item)) return 6;
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

function recordEconomyTransaction(game: StoredGame, kind: StoredGame["view"]["economy"]["transactions"][number]["kind"], amount: number, counterparty: string, note: string): void {
  const character = game.view.character;
  if (!character || amount <= 0) return;
  game.view.economy.transactions.push({
    id: randomUUID(),
    date: `原作 ${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日`,
    kind,
    amount,
    balance: character.coins,
    counterparty,
    note,
  });
  game.view.economy.transactions = game.view.economy.transactions.slice(-80);
}

type MarketCategory = StoredGame["view"]["economy"]["marketReports"][number]["category"];

function updateMarketReport(game: StoredGame, category: MarketCategory, locationId = game.view.locationId ?? "local", location = locationById(locationId)?.name ?? game.view.location ?? "当地") {
  const locationText = `${location}${locationById(locationId)?.region ?? ""}`;
  let supply = 50;
  let demand = 50;
  const reasons: string[] = [];
  if (category === "药材" && /森林|村|山|冰火|药/.test(locationText)) { supply += 24; reasons.push("临近采集地"); }
  if (category === "粮食" && /村|农|平原|港|海滨/.test(locationText)) { supply += 20; reasons.push("基础产地或运输节点"); }
  if (category === "金属" && /矿|铁匠|锻造|工业|明都|庚辛/.test(locationText)) { supply += 22; reasons.push("临近矿产或加工地"); }
  if (category === "魂导材料") {
    if ((game.view.era ?? 1) === 1) { supply -= 35; demand -= 25; reasons.push("魂导产业尚未形成公开市场"); }
    else if (/明都|日月|史莱克|联邦|城市|城/.test(locationText)) { supply += 15; demand += 22; reasons.push("魂导产业与学院需求集中"); }
  }
  if (/城|学院|宗门|联邦/.test(locationText)) { demand += 14; reasons.push("人口与机构采购集中"); }
  const disruptions = game.world.dynamicEvents.filter((event) => event.status === "可介入" && event.locationId === locationId && /失踪|封锁|袭击|灾|短缺|中断/.test(`${event.title}${event.detail}`));
  if (disruptions.length) { supply -= 12 * disruptions.length; demand += 10 * disruptions.length; reasons.push(`${disruptions.length}项本地事件扰乱运输`); }
  supply = Math.max(5, Math.min(95, supply));
  demand = Math.max(5, Math.min(95, demand));
  const priceIndex = Math.max(65, Math.min(165, Math.round(100 + (demand - supply) * .75)));
  const report = { locationId, location, category, supply, demand, priceIndex, reason: reasons.join("；") || "供需接近平衡", updatedAt: `原作 ${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日` };
  game.view.economy.marketReports = game.view.economy.marketReports.filter((item) => !(item.locationId === locationId && item.category === category));
  game.view.economy.marketReports.push(report);
  game.view.economy.marketReports = game.view.economy.marketReports.slice(-30);
  return report;
}

function worldOrdinal(game: StoredGame): number {
  return (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1);
}

function activeLogisticsContract(game: StoredGame) {
  return game.view.tasks.find((task) => task.kind === "运输合同" && task.status === "进行中" && task.logistics);
}

function recordLogisticsTransit(game: StoredGame, damaged: boolean, evidence: string): void {
  const task = activeLogisticsContract(game);
  if (!task?.logistics) return;
  task.progressEvidence ??= [];
  task.progressEvidence.push(evidence);
  task.progressEvidence = task.progressEvidence.slice(-5);
  if (damaged) task.logistics.cargoIntegrity = Math.max(40, task.logistics.cargoIntegrity - 20);
}

function tryResurrection(game: StoredGame): boolean {
  const character = game.view.character;
  if (!character) return false;
  const activeSoulText = [character.martialSoul.name, character.martialSoul.description, ...character.soulRings.flatMap((ring) => [ring.skillName, ring.skillDescription])].join(" ");
  const systemText = character.specialSystem ? [character.specialSystem.name, ...character.specialSystem.abilities].join(" ") : "";
  const closeExecutor = game.view.relations.find((item) => (item.strength ?? 0) >= 70 && /亲属|师友|同伴/.test(item.category ?? "") && /信任|亲近|生死|挚爱|师徒/.test(`${item.relation}${item.impression}`));
  const strongFaction = game.view.affiliations.find((item) => /昊天宗|七宝琉璃宗|武魂殿|蓝电霸王龙宗|海神岛|隐世/.test(item.name) && /重视|核心|长老|亲传|继承/.test(`${item.role}${item.reputation}`));
  const hasBodyMedium = character.injuries.some((item) => /魂魄|灵魂/.test(item)) || game.view.inventory.some((item) => /相思断肠红|生命之水|生灵之金|完整躯体/.test(item));
  const requiredRelics = game.view.inventory.filter((item) => /万年圣魂草|九品参王|水晶血龙参|上古灵兽内丹|十万年魂骨|神级生命/.test(item));
  const selfRevival = character.soulRank >= 70 && character.soulRings.length >= 7 && /涅槃|不死|九命|轮回|重生/.test(activeSoulText);
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
  if (rank > 0 && (game.view.character?.soulRings.length ?? 0) < Math.floor(rank / 10)) return "等待魂环";
  const ratio = game.world.trainingPoints / cultivationThreshold(rank);
  if (ratio < 0.2) return "刚刚起步";
  if (ratio < 0.5) return "稳步积累";
  if (ratio < 0.8) return "接近突破";
  return "瓶颈松动";
}

function ensureTask(game: StoredGame, task: TaskView): void {
  const id = task.id ?? task.title;
  if (!game.view.tasks.some((item) => (item.id ?? item.title) === id && item.status !== "完成")) game.view.tasks.push({ ...task, createdActionIndex: task.createdActionIndex ?? game.actionIndex, progressEvidence: task.progressEvidence ?? [] });
}

function ensureMartialSoulAccounts(game: StoredGame): void {
  const character = game.view.character;
  if (!character) return;
  character.martialSouls ??= [character.martialSoul];
  character.activeMartialSoulIndex ??= 0;
  character.activeMartialSoulIndex = Math.max(0, Math.min(character.activeMartialSoulIndex, character.martialSouls.length - 1));
  character.soulRingSets ??= [character.soulRings ?? []];
  while (character.soulRingSets.length < character.martialSouls.length) character.soulRingSets.push([]);
  character.martialSoul = character.martialSouls[character.activeMartialSoulIndex];
  character.soulRings = character.soulRingSets[character.activeMartialSoulIndex];
  character.martialSouls.forEach((soul, index) => { soul.cultivationState = index === character.activeMartialSoulIndex ? "主修" : character.soulRingSets[index].length ? "主修" : "未修炼"; });
}

function switchMartialSoulResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character!;
  ensureMartialSoulAccounts(game);
  if (character.martialSouls.length < 2) return impossible("当前只有一个可用武魂，不需要切换。", ["继续修炼", "查看武魂", "研究魂技"]);
  if (game.view.combat || (game.view.hunting && !["需求", "调查", "完成"].includes(game.view.hunting.stage))) return impossible("猎魂或战斗流程尚未结束，不能在结算中途更换主修武魂。", ["完成当前猎魂", "先撤离战斗", "保持当前武魂"]);
  const requested = character.martialSouls.findIndex((soul, index) => index !== character.activeMartialSoulIndex && action.includes(soul.name));
  const nextIndex = requested >= 0 ? requested : (character.activeMartialSoulIndex + 1) % character.martialSouls.length;
  character.activeMartialSoulIndex = nextIndex;
  character.martialSoul = character.martialSouls[nextIndex];
  character.soulRings = character.soulRingSets[nextIndex];
  character.martialSouls.forEach((soul, index) => { soul.cultivationState = index === nextIndex ? "主修" : character.soulRingSets[index].length ? "主修" : "未修炼"; });
  game.view.hunting = undefined;
  return { intent: "切换武魂", minutes: 5, ruleSummary: `当前主修武魂切换为${character.martialSoul.name}；该武魂独立记录${character.soulRings.length}枚魂环。`, fallbackNarrative: `魂力的运行方向慢慢换了。原先显露的武魂收回体内，${character.martialSoul.name}在掌心重新成形；属于它的魂环与魂技没有和另一武魂混在一起。`, suggestions: character.soulRings.length < Math.floor(character.soulRank / 10) ? ["调查适合当前武魂的魂兽", "请导师评估双生武魂风险", "查看当前武魂魂环"] : ["测试当前武魂", "继续修炼", "切换其他武魂"] };
}

function trainingResolution(game: StoredGame, action = ""): ActionResolution {
  const character = game.view.character;
  if (!character) return impossible("还没有可修炼的角色状态。");
  ensureMartialSoulAccounts(game);
  const expectedRings = Math.floor(character.soulRank / 10);
  if (character.soulRank > 0 && character.soulRings.length < expectedRings) {
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
  const systemAbilities = character.specialSystem?.abilities ?? [];
  const effectiveSystemAbilities = isGoldFinger(character.specialSystem?.name) ? systemAbilities.filter((ability) => /强化|增幅|修炼/.test(ability)) : systemAbilities;
  const specialBonus = 1 + effectiveSystemAbilities.length * 0.04;
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
  const character = game.view.character!;
  if (game.view.inventoryLoad.state === "超载") return impossible(`随身物品${game.view.inventoryLoad.used}/${game.view.inventoryLoad.capacity}负重，已经无法正常赶路。`, ["把物品存入住处", "租用马车", "丢弃或出售普通物品"]);
  const target = findTravelTarget(game, action);
  if (!target) {
    const reachable = game.view.map.filter((location) => location.travelMinutes > 0).map((location) => location.name).join("、");
    return impossible(reachable ? `没有确认目的地。当前可直接前往 ${reachable}。` : "没有找到可直接到达的地点。", ["查看地图", "打听路线", "留在原地"]);
  }
  if (target.travelMinutes < 0) return impossible(`${target.name} 不能从当前位置直接到达。`, ["查看地图", "先去中转地点", "打听路线"]);
  const offWorldIds = new Set(["tianluo-planet", "tiandou-planet", "senluo-planet", "elf-planet", "dragon-horse-star", "sky-horse-star"]);
  if (offWorldIds.has(target.id) || offWorldIds.has(game.view.locationId ?? "")) {
    const passengerRoute = (game.view.era ?? 1) === 4 && /船票|客运|航班|民航|搭乘/.test(action) && !["dragon-horse-star", "sky-horse-star"].includes(target.id);
    if (passengerRoute) {
      if (activeLogisticsContract(game)?.logistics?.mode === "星际货运") return impossible("商业货运舱单不能随普通客运船票托带；这份合同必须由已登记星舰实际承运。", [`驾驶星舰前往${target.name}`, "检查星舰补给", "放弃或赔付合同"]);
      const fare = Math.max(80, Math.ceil(target.travelMinutes / 72));
      if (character.coins < fare) return impossible(`联邦客运船票与保险需要${formatSoulCoins(fare)}。`, ["打工筹措船票", "申请学院交通补助", "继续留在当前星球"]);
      character.coins -= fare;
      const origin = game.view.location ?? "当前星球";
      game.view.locationId = target.id;
      game.view.location = target.name;
      if (!game.world.discoveredLocations.includes(target.id)) game.world.discoveredLocations.push(target.id);
      game.view.map = buildMapView(game);
      game.view.mapHierarchy = buildMapHierarchy(game);
      return { intent: "星际客运", minutes: target.travelMinutes, ruleSummary: `支付${formatSoulCoins(fare)}并通过安检，搭乘联邦客运航班从${origin}抵达${target.name}。`, fallbackNarrative: `船票、身份和行李连续核验了三遍。我没有碰驾驶舱，只按客运广播进入固定舱位。跨过漫长航程后，舷窗外的${target.name}才从光点变成完整的世界。`, suggestions: ["确认返程航班", "观察当地环境", "寻找合法住处"] };
    }
    return impossible("跨星球移动必须通过星舰航线结算船员、燃料、物资与舰体风险。", [`驾驶星舰前往${target.name}`, "检查星舰状态", "申请舰队航次"]);
  }
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
  recordLogisticsTransit(game, encounter, `${origin}至${target.name}的在途记录${encounter ? "：遭遇风险，货封受损" : "：路线与货封正常"}`);
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
  ensureMartialSoulAccounts(game);
  const ringIndex = character.soulRings.length + 1;
  const capacityTier = Math.floor(character.soulRank / 10);
  const limit = RING_LIMITS[Math.min(capacityTier, RING_LIMITS.length - 1)] ?? 423;
  const random = actionRandom(game);
  const category = character.martialSoul.category;
  const currentId = game.view.hunting?.locationId ?? game.view.locationId ?? "notting-city";
  const regionalHabitats: Record<string, string[]> = {
    "holy-soul-village": ["soul-hunting-forest"], "notting-city": ["soul-hunting-forest"], "notting-academy": ["soul-hunting-forest"],
    "suotuo-city": ["star-dou-edge"], "shrek-village": ["star-dou-edge"], "heaven-dou-city": ["sunset-forest"], "heaven-royal-academy": ["sunset-forest"],
    "seven-treasure-fort": ["sunset-forest"], "blue-lightning-mountain": ["blue-lightning-mountain", "star-dou-edge"], "star-luo-city": ["star-dou-edge"],
    "skywater-academy": ["extreme-north-edge"], "extreme-north-edge": ["extreme-north-edge"], "extreme-north-core": ["extreme-north-core"],
    "vast-sea-city": ["vast-sea-city", "purple-pearl-island"], "purple-pearl-island": ["purple-pearl-island"], "sea-god-island": ["sea-god-island"], "whale-sea": ["whale-sea"],
    "radiant-city": ["jing-yang-mountains"], "evil-forest": ["evil-forest"], "shrek-city": ["star-dou-reserve"], "blood-god-camp": ["abyss-passage"],
    "senluo-planet": ["senluo-planet"], "elf-planet": ["elf-planet"], "dragon-horse-star": ["dragon-horse-star"], "sky-horse-star": ["sky-horse-star"],
  };
  const habitatIds = new Set([currentId, ...(regionalHabitats[currentId] ?? [])]);
  const candidates = SOUL_BEASTS
    .filter((beast) => beast.ageRange[0] <= limit * 1.8 && beast.habitats.some((habitat) => habitatIds.has(habitat)))
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
  ensureMartialSoulAccounts(game);
  const ringIndex = (game.view.character?.soulRings.length ?? 0) + 1;
  if (!game.view.hunting || game.view.hunting.stage === "完成") {
    game.view.hunting = { stage: "需求", ringIndex, recommendations: [], preparation: [], trailProgress: "尚未调查" };
    game.world.flags.huntOriginLocation = game.view.locationId ?? "notting-city";
  }
  const soulIndex = game.view.character?.activeMartialSoulIndex ?? 0;
  const soulName = game.view.character?.martialSoul.name ?? "当前武魂";
  ensureTask(game, { id: `ring-${soulIndex}-${ringIndex}`, title: `${soulName}获得第 ${ringIndex} 魂环`, kind: "修炼需求", detail: "完成调查、准备、旅行、追踪、战斗、吸收和后果。", status: "进行中" });
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
  const capacityTier = Math.floor((game.view.character?.soulRank ?? 10) / 10);
  const limit = RING_LIMITS[Math.min(capacityTier, RING_LIMITS.length - 1)] ?? 423;
  hunting.targetBeastId = beast.id;
  hunting.targetName = beast.name;
  hunting.targetYears = Math.max(beast.ageRange[0], Math.min(beast.ageRange[1], Math.round(limit * (0.72 + random() * 0.38))));
  hunting.locationId = beast.habitats[0];
  const huntTask = game.view.tasks.find((task) => task.id === `ring-${game.view.character?.activeMartialSoulIndex ?? 0}-${hunting.ringIndex}`);
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
  ensureMartialSoulAccounts(game);
  const activeHunt = game.view.hunting && game.view.hunting.stage !== "完成";
  const requiredRingIndex = Math.floor(character.soulRank / 10);
  if (!activeHunt && (character.soulRank === 0 || character.soulRings.length >= requiredRingIndex)) {
    return impossible(`当前${character.martialSoul.name}已有 ${character.soulRings.length} 枚魂环，魂力 ${character.soulRank} 级，没有空余魂环槽。`, ["继续修炼", "切换其他武魂", "检查当前魂环"]);
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
  if (/出发|启程|开始前往|进入.*(?:森林|栖息地)/.test(action)) {
    if (hunting.preparation.length < 2) return impossible("至少完成两项可核验准备后才能出发猎魂。", ["购买猎魂补给", "寻找同行者", "研究目标习性"]);
    hunting.stage = "旅行";
    return {
      intent: "猎魂出发确认",
      minutes: 30,
      ruleSummary: `确认携带 ${hunting.preparation.length} 项准备并按既定路线出发；未邀请的同行者不会在途中凭空加入。`,
      fallbackNarrative: "我把名单和包裹最后核了一遍。留下的人不会因为一句‘全队’突然出现在路上；已经签下名字的同伴各自背好东西，我们才真正离开。",
      suggestions: ["沿路线进入魂兽栖息地", "核对同行者名单", "检查撤离路线"],
    };
  }
  if (/买|购买|药|补给|绳|食物/.test(action)) {
    const cost = Math.min(character.coins, 8);
    character.coins -= cost;
    if (!game.view.inventory.includes("止血散")) game.view.inventory.push("止血散");
    if (!game.view.inventory.includes("猎魂绳")) game.view.inventory.push("猎魂绳");
    additions.push("止血散", "猎魂绳");
  }
  if (/同伴|导师|帮手|组队|同行/.test(action)) {
    const eligible = game.view.relations.filter((relation) => {
      const trust = relation.dimensions?.trust ?? relation.strength ?? 0;
      if (trust < 30 || relation.category === "敌对" || /敌|仇/.test(relation.relation)) return false;
      const npc = relation.id ? game.world.npcs[relation.id] : undefined;
      return !npc || (npc.alive && npc.locationId === game.view.locationId);
    });
    const companion = eligible.find((relation) => action.includes(relation.name)) ?? eligible[0];
    if (!companion) return impossible("没有找到信任足够、当前同地且愿意承担猎魂风险的同行者。", ["先建立可信关系", "与候选同伴会合", "独自准备并降低目标风险"]);
    if (hunting.preparation.some((item) => item.startsWith(`同行者：${companion.name}（`))) return impossible(`${companion.name}已经在同行名单中，不能用重复邀请叠加战力。`, ["邀请另一名可信同伴", "明确小队战术", "检查猎魂补给"]);
    const profile = `${companion.relation}${companion.impression}${companion.faction ?? ""}`;
    const inferredRole: CompanionRole = /治疗|医师|医术|治愈|辅助系/.test(profile) ? "治疗"
      : /控制系|束缚|冰封|阵法/.test(profile) ? "控制"
        : /防御|护卫|盾|守护/.test(profile) ? "防护"
          : /侦察|斥候|猎人|追踪|敏攻/.test(profile) ? "侦察"
            : /强攻|战士|佣兵|攻击/.test(profile) ? "强攻" : "协同";
    const requestedRole: CompanionRole | undefined = /治疗|医治/.test(action) ? "治疗" : /控制|限制/.test(action) ? "控制" : /防护|掩护|承伤/.test(action) ? "防护" : /侦察|追踪/.test(action) ? "侦察" : /强攻|主攻/.test(action) ? "强攻" : undefined;
    if (requestedRole && inferredRole !== requestedRole) return impossible(`${companion.name}现有关系档案不能证明具备“${requestedRole}”岗位能力。`, [`让${companion.name}按${inferredRole}岗位同行`, "寻找对应职业同伴", "先共同训练并记录能力"]);
    const role = requestedRole ?? inferredRole;
    const readiness = Math.min(90, Math.max(25, Math.round((companion.dimensions?.trust ?? companion.strength ?? 30) * .8)));
    additions.push(`同行者：${companion.name}（${role}·协同${readiness}）`);
  }
  if (/检查|适配|资料|研究/.test(action)) additions.push("目标习性笔记");
  if (!additions.length) additions.push("简易路线图");
  for (const addition of additions) if (!hunting.preparation.includes(addition)) hunting.preparation.push(addition);
  const ready = hunting.preparation.length >= 2 || game.view.speed === "高速";
  return {
    intent: "猎魂准备",
    minutes: speedMinutes(game, 120, 720),
    ruleSummary: `新增准备：${additions.join("、")}。准备度 ${hunting.preparation.length} 项。${ready ? "已经具备出发条件，是否继续补充人员和物资仍由玩家决定。" : "仍建议补充准备。"}`,
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
  const scoutBonus = hunting.preparation.some((item) => /^同行者：.+（侦察·协同\d+）$/.test(item)) ? .12 : 0;
  const success = random() < 0.72 + perception + scoutBonus - fatiguePenalty;
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
      insight: 0,
      guard: 0,
      allies: hunting.preparation.filter((item) => item.startsWith("同行者：")).map((item) => {
        const match = item.match(/^同行者：(.+?)（(?:(强攻|防护|控制|治疗|侦察|协同)·)?协同(\d+)）$/);
        return { name: match?.[1] ?? item.replace("同行者：", ""), role: (match?.[2] ?? "协同") as CompanionRole, readiness: Number(match?.[3] ?? 30), condition: "完好" as const };
      }),
      controlResistance: Math.min(85, 18 + (beast?.danger ?? 2) * 10 + Math.round((hunting.targetYears ?? 100) / 2_000)),
      lastExchange: "刚刚锁定目标，双方都在判断距离。",
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

const COMBAT_COMBOS = [
  { roles: ["控制", "强攻"], name: "锁定爆发", damage: 46, reduction: 8, healing: 0, needsInsight: false },
  { roles: ["侦察", "强攻"], name: "破绽突袭", damage: 58, reduction: 5, healing: 0, needsInsight: true },
  { roles: ["防护", "治疗"], name: "生命防线", damage: 10, reduction: 34, healing: 12, needsInsight: false },
  { roles: ["防护", "控制"], name: "封锁阵线", damage: 22, reduction: 26, healing: 0, needsInsight: false },
  { roles: ["强攻", "防护", "控制"], name: "攻守枢纽", damage: 54, reduction: 24, healing: 0, needsInsight: false },
  { roles: ["防护", "控制", "治疗"], name: "生息铁壁", damage: 18, reduction: 42, healing: 20, needsInsight: false },
  { roles: ["强攻", "控制", "侦察"], name: "猎杀三角", damage: 68, reduction: 10, healing: 0, needsInsight: true },
  { roles: ["强攻", "防护", "控制", "治疗"], name: "四象战阵", damage: 72, reduction: 38, healing: 24, needsInsight: false },
  { roles: ["强攻", "防护", "控制", "侦察"], name: "逐影围猎", damage: 86, reduction: 24, healing: 0, needsInsight: true },
  { roles: ["强攻", "防护", "控制", "治疗", "侦察"], name: "五环协战阵", damage: 100, reduction: 42, healing: 28, needsInsight: false },
  { roles: ["强攻", "强攻", "防护", "控制", "治疗", "侦察"], name: "六芒轮转阵", damage: 118, reduction: 46, healing: 30, needsInsight: true },
  { roles: ["强攻", "强攻", "防护", "防护", "控制", "治疗", "侦察"], name: "七星全域战阵", damage: 130, reduction: 58, healing: 36, needsInsight: false },
] as const;

function combatComboFor(first: CompanionRole, second: CompanionRole) {
  return COMBAT_COMBOS.find((combo) => combo.roles.length === 2 && combo.roles.includes(first as never) && combo.roles.includes(second as never));
}

function combatTacticFor(roles: CompanionRole[]) {
  const roleCounts = (items: readonly CompanionRole[]) => items.reduce<Record<string, number>>((counts, role) => ({ ...counts, [role]: (counts[role] ?? 0) + 1 }), {});
  const actual = roleCounts(roles);
  return COMBAT_COMBOS.find((combo) => {
    if (combo.roles.length !== roles.length) return false;
    const expected = roleCounts(combo.roles);
    return Object.keys({ ...actual, ...expected }).every((role) => actual[role] === expected[role]);
  });
}

function fixedSizeGroups<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  const visit = (start: number, picked: T[]) => {
    if (picked.length === size) {
      groups.push(picked);
      return;
    }
    for (let index = start; index <= items.length - (size - picked.length); index += 1) visit(index + 1, [...picked, items[index]]);
  };
  visit(0, []);
  return groups;
}

function inferredCompanionRole(relation: StoredGame["view"]["relations"][number]): CompanionRole {
  const profile = `${relation.relation}${relation.impression}${relation.faction ?? ""}`;
  return /治疗|医师|医术|治愈|辅助系/.test(profile) ? "治疗"
    : /控制系|束缚|冰封|阵法/.test(profile) ? "控制"
      : /防御|护卫|盾|守护/.test(profile) ? "防护"
        : /侦察|斥候|猎人|追踪|敏攻/.test(profile) ? "侦察"
          : /强攻|战士|佣兵|攻击/.test(profile) ? "强攻" : "协同";
}

function comboTrainingResolution(game: StoredGame, action: string): ActionResolution {
  const relations = game.view.relations.filter((relation) => action.includes(relation.name));
  if (relations.length < 2 || relations.length > 7) return impossible("连携训练必须明确指定二至七名同伴，不能由程序替我挑人或让超编人员共享训练证据。", ["写出全部同伴姓名", "查看关系档案", "先建立可信关系"]);
  for (const relation of relations) {
    const trust = relation.dimensions?.trust ?? relation.strength ?? 0;
    const npc = relation.id ? game.world.npcs[relation.id] : undefined;
    if (trust < 45 || relation.category === "敌对") return impossible(`${relation.name}的信任或关系状态不足以进行高风险连携训练。`, [`继续与${relation.name}建立信任`, "改做普通协同训练", "尊重对方决定"]);
    if (npc && (!npc.alive || npc.locationId !== game.view.locationId)) return impossible(`${relation.name}当前不在同一地点，不能远程生成共同训练证据。`, [`与${relation.name}会合`, "选择同地伙伴", "调整训练日期"]);
  }
  const roles = relations.map(inferredCompanionRole);
  const requested = COMBAT_COMBOS.find((combo) => action.includes(combo.name));
  const combo = combatTacticFor(roles);
  if (!combo || (requested && requested.name !== combo.name)) return impossible(`现有岗位“${roles.join("、")}”不能组成所要求的连携。`, ["核对同伴岗位能力", "选择互补岗位", "训练普通协同"]);
  const names = relations.map((relation) => relation.name).sort();
  const id = `${combo.name}:${names.join(":")}`;
  let training = game.view.comboTrainings.find((item) => item.id === id);
  if (!training) {
    training = { id, name: combo.name, roles: [...combo.roles], companionNames: names, sessions: 0, failures: 0, mastery: 0, evidence: [] };
    game.view.comboTrainings.push(training);
  }
  const exhausted = game.world.fatiguePoints >= 75;
  training.sessions += 1;
  if (exhausted) training.failures += 1;
  const gain = exhausted ? 0 : integer(actionRandom(game), 10, 15);
  training.mastery = Math.min(100, training.mastery + gain);
  const branchByCombo: Record<string, string> = { 锁定爆发: "精准锁链", 破绽突袭: "交叉突进", 生命防线: "轮换救护", 封锁阵线: "双层封锁", 攻守枢纽: "轮转锋线", 生息铁壁: "复苏阵地", 猎杀三角: "交叉猎线", 四象战阵: "四角轮换", 逐影围猎: "双层合围", 五环协战阵: "五点轮替", 六芒轮转阵: "双锋换位", 七星全域战阵: "全域接替" };
  const branchSessions = roles.length >= 5 ? roles.length + 1 : roles.length === 4 ? 5 : roles.length === 3 ? 4 : 3;
  const branchMastery = roles.length === 7 ? 80 : roles.length === 6 ? 70 : roles.length === 5 ? 60 : roles.length === 4 ? 55 : roles.length === 3 ? 45 : 35;
  if (!exhausted && !training.branch && training.sessions >= branchSessions && training.mastery >= branchMastery) training.branch = branchByCombo[training.name];
  const result = exhausted ? "疲劳导致口令和站位失误，只保留失败复盘" : `完成站位、口令与魂力节奏训练，熟练度+${gain}`;
  training.evidence.push({ date: relationshipDate(game), result });
  training.evidence = training.evidence.slice(-20);
  for (const relation of relations) recordPlayerRelation(game, relation, `与${names.filter((name) => name !== relation.name).join("、")}共同训练${combo.name}并记录${exhausted ? "失败复盘" : "岗位配合"}`, exhausted ? { respect: 1 } : { trust: 1, closeness: 1 });
  game.world.fatiguePoints += exhausted ? 8 : roles.length <= 4 ? 16 : 12 + roles.length;
  return { intent: exhausted ? "连携训练复盘" : "连携训练", minutes: speedMinutes(game, 180, 720), ruleSummary: `${names.join("与")}完成第${training.sessions}次${combo.name}训练；熟练度${training.mastery}%${training.branch ? `，解锁分支“${training.branch}”` : ""}。${result}。`, fallbackNarrative: exhausted ? "口令喊到了，人却慢了半步。我们没有把这次失败抹掉，而是把错位、迟疑和体力透支逐项记下来，停止继续硬练。" : `${names.length}个人先把站位拆开走，再把魂力接续压到同一个节拍。每次提前或延误都重新来过，直到${combo.name}不再只是一句口令。`, suggestions: exhausted ? ["休息恢复", "查看失败复盘", "状态恢复后再训练"] : [`继续训练${combo.name}`, "查看连携档案", "进行实战验证"], systemMessages: [`连携训练 · ${combo.name} · ${training.mastery}%${training.branch ? ` · ${training.branch}` : ""}`] };
}

function combatResolution(game: StoredGame, action: string): ActionResolution {
  const combat = game.view.combat;
  const hunting = game.view.hunting;
  if (!combat || !hunting) return impossible("当前没有可结算的战斗。");
  combat.allies ??= [];
  for (const ally of combat.allies) ally.role ??= "协同";
  combat.comboHistory ??= [];
  const comboExecuting = /发动|施展|释放/.test(action) && /连携|合击|组合技|阵型|战阵|围猎/.test(action);
  const comboPreparing = !comboExecuting && /准备|排练|布置/.test(action) && /连携|合击|组合技|阵型|战阵|围猎/.test(action);
  let comboActive: typeof COMBAT_COMBOS[number] | undefined;
  let comboMastery = 0;
  let comboBranch: string | undefined;
  if (comboPreparing) {
    if ((combat.comboCooldownUntilRound ?? 0) > combat.round) return impossible(`连携口令和魂力节奏仍在冷却，要到第 ${combat.comboCooldownUntilRound} 回合后才能重新准备。`, ["采用普通协同", "防守并恢复节奏", "观察敌人动作"]);
    const eligible = combat.allies.filter((ally) => {
      if (ally.condition === "受伤" || ally.readiness < 45 || ally.role === "协同") return false;
      const relation = game.view.relations.find((item) => item.name === ally.name);
      const trust = relation?.dimensions?.trust ?? relation?.strength ?? 0;
      const evidence = `${relation?.relation ?? ""}${relation?.impression ?? ""}${relation?.history?.map((item) => item.reason).join("") ?? ""}`;
      return trust >= 50 && /可靠|信任|共同|训练|战斗|协同|生死/.test(evidence);
    });
    const requestedSize = /七人|七星全域/.test(action) ? 7 : /六人|六芒轮转/.test(action) ? 6 : /五人|五环协战/.test(action) ? 5 : /四人|四象战阵|逐影围猎/.test(action) ? 4 : /阵型|三人|攻守枢纽|生息铁壁|猎杀三角/.test(action) ? 3 : 2;
    const wantsFormation = requestedSize >= 3;
    const size = requestedSize;
    const mentioned = eligible.filter((ally) => action.includes(ally.name));
    const pool = mentioned.length >= size ? mentioned : eligible;
    let selected: { allies: typeof pool; combo: typeof COMBAT_COMBOS[number] } | undefined;
    for (const allies of fixedSizeGroups(pool, size)) {
      const combo = combatTacticFor(allies.map((ally) => ally.role!));
      if (combo && (!combo.needsInsight || (combat.insight ?? 0) >= 1)) {
        selected = { allies, combo };
        break;
      }
    }
    if (!selected) return impossible(`没有${size}名同时满足岗位互补、协同、信任和训练证据的队友；侦察突袭类战术还需要至少一层观察。`, ["先观察敌人", "采用普通协同", "战后与队友共同训练"]);
    const names = selected.allies.map((ally) => ally.name).sort();
    const training = game.view.comboTrainings.find((item) => item.name === selected!.combo.name && [...item.companionNames].sort().join(":") === names.join(":"));
    const minimumMastery = size === 7 ? 55 : size === 6 ? 45 : size === 5 ? 35 : size === 4 ? 25 : 15;
    if (wantsFormation && (!training || training.mastery < minimumMastery)) return impossible(`${size}人阵型必须先由同一组成员完成共同训练并达到 ${minimumMastery}% 熟练度，不能在战斗中临时拼装。`, [`战后共同训练${size}人阵型`, "采用较小规模连携", "普通协同防守"]);
    combat.round += 1;
    for (const ally of selected.allies) ally.readiness = Math.max(0, ally.readiness - 5);
    combat.comboPreparation = { name: selected.combo.name, roles: [...selected.combo.roles], allyNames: selected.allies.map((ally) => ally.name), preparedAtRound: combat.round, expiresAfterRound: combat.round + 2, mastery: training?.mastery ?? 0, branch: training?.branch };
  } else if (comboExecuting) {
    const prepared = combat.comboPreparation;
    if (!prepared) return impossible("还没有完成可核验的连携准备，不能用一句口令直接发动合击。", ["准备多人连携", "采用普通协同", "观察队友位置"]);
    if (combat.round >= prepared.expiresAfterRound) {
      combat.comboPreparation = undefined;
      return impossible("预定站位和魂力节奏已经失效，需要重新准备连携。", ["重新准备多人连携", "采用普通攻击", "防守并重整队形"]);
    }
    const participants = combat.allies.filter((ally) => prepared.allyNames.includes(ally.name));
    if (participants.length !== prepared.allyNames.length || participants.some((ally) => ally.condition === "受伤" || ally.readiness < 20)) {
      combat.comboPreparation = undefined;
      return impossible("准备连携的队友已经受伤或协同储备不足，原定组合无法发动。", ["保护受伤队友", "采用普通协同", "尝试撤退"]);
    }
    comboActive = COMBAT_COMBOS.find((combo) => combo.name === prepared.name);
    if (!comboActive) return impossible("连携记录无法对应已知战术模板。", ["重新准备多人连携", "采用普通协同"]);
    for (const ally of participants) ally.readiness = Math.max(0, ally.readiness - Math.max(10, participants.length * 5));
    comboMastery = prepared.mastery ?? 0;
    comboBranch = prepared.branch;
    combat.comboHistory.push(`第${combat.round + 1}回合：${prepared.allyNames.join("与")}发动${prepared.name}`);
    combat.comboHistory = combat.comboHistory.slice(-8);
    combat.comboPreparation = undefined;
  }
  const random = actionRandom(game);
  if (!comboPreparing) combat.round += 1;
  if (comboActive) {
    const size = comboActive.roles.length;
    const baseCooldown = size >= 5 ? size + 1 : size === 4 ? 5 : size === 3 ? 4 : 3;
    combat.comboCooldownUntilRound = combat.round + baseCooldown - (comboBranch ? 1 : 0);
  }
  if (!comboPreparing && !comboExecuting && combat.comboPreparation && combat.round >= combat.comboPreparation.expiresAfterRound) {
    combat.comboHistory.push(`第${combat.round}回合：${combat.comboPreparation.name}因站位和节奏变化失效`);
    combat.comboHistory = combat.comboHistory.slice(-8);
    combat.comboPreparation = undefined;
  }
  let enemyHp = Number(game.world.flags.combatEnemyHp ?? 80);
  const beast = soulBeastById(hunting.targetBeastId ?? "");
  const danger = beast?.danger ?? 2;
  const character = game.view.character!;
  const activeBattleArmor = /斗铠|着甲/.test(action) ? [...(character.battleArmors ?? [])].filter((armor) => armor.status === "完整").sort((left, right) => right.tier - left.tier)[0] : undefined;
  const armorPower = activeBattleArmor ? activeBattleArmor.tier * 22 + Math.round(activeBattleArmor.compatibility / 5) : 0;
  const activeMecha = /机甲/.test(action) && game.view.mecha?.model && game.view.mecha.condition !== "大修" && (game.view.mecha.energy ?? 0) >= 6 ? game.view.mecha : undefined;
  if (activeMecha) activeMecha.energy = Math.max(0, (activeMecha.energy ?? 0) - 6);
  const mechaPower = activeMecha ? 30 + ["无", "白级", "黄级", "紫级", "黑级"].indexOf(activeMecha.license) * 14 : 0;
  const playerPower = character.soulRank * 2 + character.soulRings.length * 12 + (character.abilityDescriptors.physique === "顶尖" ? 12 : character.abilityDescriptors.physique === "优秀" ? 6 : 0) + armorPower + mechaPower;
  const prepared = hunting.preparation.length * 5;
  const observe = /观察|试探|弱点/.test(action);
  const flee = /逃|撤|离开战斗/.test(action);
  const defend = /防御|格挡|闪避/.test(action);
  const closeDistance = /近身|逼近|贴近/.test(action);
  const openDistance = /拉开|远程|后退/.test(action);
  const reckless = /全力|拼命|不顾防御/.test(action);
  const controlAttempt = /控制|缠绕|束缚|冰封|眩晕|迟缓|定身/.test(action);
  const playerControlSource = character.soulRings.some((ring) => action.includes(ring.skillName) || /控制|缠绕|束缚|冰封|眩晕|迟缓|定身/.test(ring.skillDescription));
  const teamTactic = /配合|协同|夹击|掩护|队友|同伴|连携|合击|组合技/.test(action);
  combat.insight ??= 0;
  combat.guard ??= 0;
  const readyAllies = combat.allies.filter((ally) => ally.condition !== "受伤");
  const controllingAlly = readyAllies.find((ally) => ally.role === "控制" && teamTactic);
  const controlSource = playerControlSource || Boolean(controllingAlly);
  combat.controlResistance ??= Math.min(85, 18 + danger * 10 + Math.round((hunting.targetYears ?? 100) / 2_000));
  if (closeDistance) combat.distance = "近距离";
  if (openDistance) combat.distance = "远距离";

  if (flee) {
    const escaped = random() < Math.min(.92, .32 + (combat.distance === "远距离" ? .28 : 0) + combat.insight * .1 + (observe ? .08 : 0));
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
  if (observe) combat.insight = Math.min(3, combat.insight + 1);
  combat.guard = defend ? Math.min(3, combat.guard + 1) : Math.max(0, combat.guard - 1);
  const usedSoulSkill = character.soulRings.some((ring) => action.includes(ring.skillName));
  const allyPower = readyAllies.reduce((sum, ally) => sum + ally.readiness, 0) / (teamTactic ? 4 : 8);
  const allyAttack = readyAllies.filter((ally) => ally.role === "强攻" || ally.role === "协同").reduce((sum, ally) => sum + ally.readiness, 0) / (teamTactic ? 5 : 12);
  const allyDefense = readyAllies.filter((ally) => ally.role === "防护").reduce((sum, ally) => sum + ally.readiness, 0) / 6;
  const allyScout = readyAllies.filter((ally) => ally.role === "侦察").reduce((sum, ally) => sum + ally.readiness, 0) / 30;
  const controlChance = controlSource ? Math.max(.08, Math.min(.88, .35 + character.soulRank / 180 + combat.insight * .07 - combat.controlResistance / 140)) : 0;
  const controlSucceeded = controlAttempt && controlSource && random() < controlChance;
  if (controlAttempt) {
    combat.controlStatus = !controlSource ? "缺少可验证的控制魂技" : controlSucceeded ? "本回合控制生效" : "目标抵抗成功";
    if (controlSource) combat.controlResistance = Math.min(100, combat.controlResistance + (controlSucceeded ? 16 : 8));
  } else {
    combat.controlStatus = undefined;
  }
  const tacticalBonus = combat.insight * 5 + (usedSoulSkill ? 10 : 0) + allyPower + allyAttack + allyScout * 3;
  const damageMultiplier = controlAttempt ? (controlSucceeded ? .65 : .25) : reckless ? 1.3 : 1;
  const comboDamage = comboActive ? comboActive.damage + Math.round(readyAllies.filter((ally) => combat.comboHistory?.at(-1)?.includes(ally.name)).reduce((sum, ally) => sum + ally.readiness, 0) / 5) + Math.round(comboMastery / 5) + (comboBranch && comboActive.damage >= 20 ? 8 : 0) : 0;
  const damage = comboPreparing || flee || observe ? 0 : defend ? Math.round((attackBase + tacticalBonus) * .35) : Math.round((attackBase + tacticalBonus) * damageMultiplier) + comboDamage;
  enemyHp -= damage;
  const distanceReduction = combat.distance === "远距离" ? 6 : combat.distance === "近距离" ? -4 : 0;
  const observationReduction = observe ? 8 + combat.insight * 2 : 0;
  const guardReduction = defend ? 12 + combat.guard * 3 : 0;
  const equipmentReduction = (activeBattleArmor ? activeBattleArmor.tier * 5 + Math.round(activeBattleArmor.compatibility / 14) : 0) + (activeMecha ? 12 : 0);
  const allyReduction = Math.round(allyPower * .45 + allyDefense);
  const controlReduction = controlSucceeded ? 18 + danger * 2 : 0;
  const enemyAttack = Math.max(2, integer(random, 5, 15) + danger * 4 + Math.round((hunting.targetYears ?? 100) / 180) - Math.round(playerPower * 0.14) - distanceReduction - observationReduction - guardReduction - equipmentReduction - allyReduction - controlReduction - (comboActive?.reduction ?? 0) - Math.round(comboMastery / 10) - (comboBranch && (comboActive?.reduction ?? 0) >= 20 ? 6 : 0) + (reckless ? 8 : 0));
  if (enemyHp > 0) game.world.healthPoints -= enemyAttack;
  if (enemyHp > 0 && combat.allies.length && enemyAttack >= 10 && random() < .18 + danger * .03) {
    const exposedAlly = combat.allies.find((ally) => ally.role === "防护" && ally.condition === "完好") ?? combat.allies.find((ally) => ally.condition === "完好") ?? combat.allies.find((ally) => ally.condition === "疲惫");
    if (exposedAlly) exposedAlly.condition = enemyAttack >= 22 ? "受伤" : "疲惫";
  }
  const healer = readyAllies.find((ally) => ally.role === "治疗" && teamTactic);
  const healed = enemyHp > 0 ? (healer ? Math.max(1, Math.round(healer.readiness / 24)) : 0) + (comboActive?.healing ?? 0) + (comboActive?.healing ? Math.round(comboMastery / 12) + (comboBranch ? 5 : 0) : 0) : 0;
  if (healed) game.world.healthPoints = Math.min(100, game.world.healthPoints + healed);
  game.world.fatiguePoints += 8 + danger + (reckless ? 5 : 0);
  game.world.flags.combatEnemyHp = enemyHp;
  combat.enemyCondition = enemyHp <= 0 ? "失去战斗能力" : enemyHp < 30 ? "重伤" : enemyHp < 60 ? "受伤" : "完好";
  combat.playerCondition = conditionLabel(game.world.healthPoints, game.world.fatiguePoints);
  combat.lastExchange = flee
    ? `撤离失败，承受${enemyAttack}点伤害。`
    : observe
      ? `完成第${combat.insight}层观察，没有冒险出手，承受${enemyAttack}点伤害。`
      : comboPreparing
        ? `${combat.comboPreparation!.allyNames.join("与")}完成${combat.comboPreparation!.name}站位准备，没有冒险出手，承受${enemyAttack}点伤害。`
      : comboActive
        ? `${comboActive.name}发动，造成${damage}点伤害，承受${enemyHp > 0 ? enemyAttack : 0}点伤害。`
      : defend
        ? `以防守反击造成${damage}点伤害，承受${enemyAttack}点伤害。`
        : controlAttempt
          ? `${combat.controlStatus}，造成${damage}点伤害，承受${enemyHp > 0 ? enemyAttack : 0}点伤害。`
          : `${usedSoulSkill ? "魂技命中" : teamTactic && combat.allies.length ? "团队夹击命中" : "攻击命中"}造成${damage}点伤害，承受${enemyHp > 0 ? enemyAttack : 0}点伤害。`;

  if (enemyHp <= 0 && game.world.healthPoints > 0) {
    hunting.stage = "吸收";
    hunting.trailProgress = "目标已被击败";
    game.view.combat = undefined;
    game.world.metrics.battlesWon += 1;
  }

  return {
    intent: "战斗",
    minutes: 10,
    ruleSummary: `第 ${combat.round} 回合，${combat.allies.length ? "玩家与同行者" : "玩家"}造成 ${damage} 点内部伤害，承受 ${enemyHp > 0 ? enemyAttack : 0} 点内部伤害。${comboPreparing ? `已准备连携“${combat.comboPreparation!.name}”${comboMastery ? `（熟练度${comboMastery}%${comboBranch ? `·${comboBranch}` : ""}）` : ""}，最迟在第 ${combat.comboPreparation!.expiresAfterRound} 回合发动。` : ""}${comboActive ? `发动连携“${comboActive.name}”${comboMastery ? `（熟练度${comboMastery}%${comboBranch ? `·${comboBranch}` : ""}）` : ""}，冷却至第 ${combat.comboCooldownUntilRound} 回合。` : ""}${healed ? `${healer ? healer.name : comboActive?.name}治疗恢复${healed}点状态。` : ""}${controlAttempt ? `控制结果：${combat.controlStatus}；当前控制抗性 ${combat.controlResistance}%。` : ""}${combat.allies.length ? `同行者：${combat.allies.map((ally) => `${ally.name}（${ally.role}·协同${ally.readiness}·${ally.condition}）`).join("、")}。` : ""}${activeBattleArmor ? `${activeBattleArmor.title}提供增幅与减伤。` : ""}${activeMecha ? `${activeMecha.model}消耗 6% 能源参战。` : ""}敌方状态 ${combat.enemyCondition}，玩家状态 ${combat.playerCondition}。`,
    fallbackNarrative: enemyHp <= 0
      ? `我抓住它转身的空当，把最后一下送了进去。${combat.enemyName}撞断一根矮树，挣了几下，不再起来。魂环从尸身上浮出时，我的手还在抖。`
      : flee
      ? `我转身找退路时，它已经封住了最短的方向。撤离没成，这一轮只能先扛住追击，再重新判断距离。`
      : observe
      ? `我没有急着出手，只盯着它发力前肩背和脚步的变化。代价是必须在它的攻击下继续保持视线，记下来的规律要下一击才有用。`
      : `我这一击打中了，反震也顺着手臂顶回来。${combat.enemyName}吃痛后更凶，爪风擦过肩头，衣料当场裂开。我往后退了两步，没敢低头看伤口。`,
    suggestions: enemyHp <= 0 ? ["检查自身状态", "开始吸收魂环", "让同行者警戒"] : combat.insight >= 2 ? ["使用魂技攻击已确认弱点", "防御并拉开距离", "寻找机会撤退"] : ["观察它的下一步", "集中攻击弱点", "防御并拉开距离"],
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
  const ringRulerActive = game.view.activeHeirloom?.id === "heirloom-ring-ruler" && game.view.activeHeirloom.remainingUses > 0;
  const effectiveLimit = Math.max(80, (baseLimit + physique) * healthFactor * fatigueFactor * (ringRulerActive ? 1.25 : 1));
  const overRatio = years / effectiveLimit;
  const rules = DIFFICULTY_RULES[game.view.difficulty];
  const successChance = Math.max(0.03, Math.min(0.98, 1.12 - Math.max(0, overRatio - 0.75) * 0.9 + rules.safety));
  const success = random() < successChance;
  hunting.absorptionRisk = overRatio <= 0.8 ? "低" : overRatio <= 1.05 ? "中" : overRatio <= 1.35 ? "高" : "致命";
  if (ringRulerActive) consumeHeirloomUse(game.view.activeHeirloom!);

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
      systemMessages: ringRulerActive ? [`魂环量尺 · 承载上限提高25% · 剩余${game.view.activeHeirloom!.remainingUses}次`] : [],
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
    systemMessages: [`魂环 · ${ring.color}色 · ${beast.name} · ${years} 年`, `魂技 · ${skillName}`, ...(ringRulerActive ? [`魂环量尺 · 承载上限提高25% · 剩余${game.view.activeHeirloom!.remainingUses}次`] : [])],
  };
}

function finishHunt(game: StoredGame): ActionResolution {
  const hunting = game.view.hunting!;
  hunting.stage = "完成";
  game.world.metrics.completedHunts += 1;
  const task = game.view.tasks.find((item) => item.id === `ring-${game.view.character?.activeMartialSoulIndex ?? 0}-${hunting.ringIndex}` || item.id === `ring-${hunting.ringIndex}` || item.id === "first-ring");
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
    const discoverable = canDiscoverNpc(game, mentioned.id);
    if (npc?.alive && npc.currentGoal !== "尚未出生" && npc.locationId === game.view.locationId && discoverable) {
      revealNpc(game, mentioned.id);
      npc.dispositionToPlayer += 2;
      rememberNpcInteraction(game, npc, `${game.view.worldTime?.year ?? 0}年在${game.view.location ?? "此地"}与玩家交谈`);
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
    } else if (discoverable) {
      revealNpc(game, mentioned.id);
      detail = `打听到关于 ${mentioned.name} 的传闻，无法确认全部真实性。`;
      recordIntelligence(game, { subjectType: "人物", subjectId: mentioned.id, title: mentioned.name, detail: `有人提到${mentioned.name}，但说法未经本人或第二来源核实。`, source: `${game.view.location ?? "当地"}传闻`, confidence: 38, status: "传闻" });
    } else {
      detail = `没有找到能证明“${mentioned.name}”是现实人物的可靠记录。`;
    }
  }
  return {
    intent: "交谈",
    minutes: 20,
    ruleSummary: detail,
    fallbackNarrative: mentioned
      ? detail.startsWith("没有找到")
        ? `我问了几处，也翻了能接触到的登记。没人能证明“${mentioned.name}”对应一个真实身份；我没有把猜测当成事实记进人物档案。`
        : `我问到${mentioned.name}时，对方先看了看周围。话说得不多，真假也掺在一起。我把能互相对上的那几句记住，剩下的没急着信。`
      : "我把问题问了。对方手里的活没停，只挑了几句能说的答。再追问时，他摇头，说自己也只是听来的。",
    suggestions: ["追问消息来源", "换个话题", "把情报记下来"],
    systemMessages,
  };
}

const allianceCandidateProfiles = {
  2: { outlet: "魂导公共查证台", stance: "魂导记录复核与公共证据开放", editorName: "苏澄" },
  3: { outlet: "大陆独立事实核验站", stance: "跨城事实核验与来源透明", editorName: "裴真" },
  4: { outlet: "星域公共证据联合站", stance: "跨星区证据互认与责任追踪", editorName: "罗序" },
} as const;

const allianceReplacementProfiles = {
  2: { outlet: "联城魂导证据台", stance: "跨城魂导证据复核与责任留档", editorName: "卓宁" },
  3: { outlet: "联邦公共查证协作社", stance: "公共查证协作与编辑独立签署", editorName: "乔衡" },
  4: { outlet: "星海独立档案节点", stance: "跨星区独立档案与退出责任追踪", editorName: "卫岚" },
} as const;

function mediaResolution(game: StoredGame, action: string): ActionResolution {
  if (game.view.era === 1) return impossible("斗一时代没有可供调用的记者、责任编辑、媒体联盟或跨地区新闻机构。公开消息只能通过地方告示、口耳传闻、商旅消息或所属势力通告传播。", ["调查消息最初从谁口中传出", "请地方管事张贴具名告示", "向所属势力提交有凭据的通告"]);
  const locationId = game.view.locationId ?? "local";
  const alias = game.world.flags.activeAliasLocationId === locationId ? String(game.world.flags.activeAlias ?? "") : "";
  const publicName = alias || game.view.character!.name;
  const publishedRumor = [...game.world.socialRumors].reverse().find((item) => item.publicName === publicName && (item.mediaStatus === "已刊发" || item.mediaStatus === "已更正"));
  if (/提议|建立/.test(action) && /媒体联盟|核验联盟/.test(action)) {
    const competition = game.view.mediaCompetitions?.at(-1);
    if (!competition || competition.topics.length < 2) return impossible("至少需要两家媒体围绕两个有来源的共同议题留下竞争记录，才能讨论跨地区核验联盟。", ["等待第二个共同议题", "对比两家媒体核验链", "继续调查来源"]);
    const outlets = competition.outlets.map((name) => game.view.mediaOutlets.find((item) => item.name === name));
    if (outlets.some((outlet) => !outlet || outlet.trustScore < 58)) return impossible("参与机构中有一家尚未达到稳定信誉，联盟不能用低可信机构互相背书。", ["分别核验两家报道", "推动证据化更正", "暂缓联盟"]);
    const id = `media-alliance:${competition.id}`;
    if (game.view.mediaAlliances.some((item) => item.id === id)) return impossible("这组媒体已经有联盟提案或试运行档案，不能重复建立。", ["查看联盟状态", "联系双方责任编辑", "安排优先议题"]);
    const alliance = { id, name: `${competition.outlets.join("—")}跨地区核验联盟`, competitionId: competition.id, outlets: [...competition.outlets], status: "提议中" as const, sharedVerificationPool: 0, minimumMembers: 2, delayedAgendaIds: [], agendas: competition.topics.map((topic) => ({ ...topic, priorityScores: { ...topic.priorityScores }, evidence: [...topic.evidence] })), departures: [], membershipApplications: [], evidence: [`行动${game.actionIndex}：基于${competition.sharedTopics}个共同议题提出联盟，不自动互认报道真实性`] };
    game.view.mediaAlliances.push(alliance);
    return { intent: "提议跨地区媒体联盟", minutes: 60, ruleSummary: `${alliance.name}进入提议中；联盟尚无共享核验资源，必须完成竞争链对比并分别取得两名责任编辑同意。`, fallbackNarrative: "两家机构的名字第一次出现在同一份提案上。提案只列共享目录、异地查证和责任边界，没有写相互背书；两位责任编辑都还要单独签字。", suggestions: ["分别采访两家责任编辑", "对比两家媒体核验链", "协商启动共享核验资源"] };
  }
  if (/登记|提出|申请/.test(action) && /退出.*联盟|退出联盟|联盟.*退出/.test(action) && !/批准|通过|确认/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    if (!alliance || !["试运行", "资源冲突"].includes(alliance.status) || (alliance.minimumMembers ?? 2) < 3 || alliance.outlets.length < 3) return impossible("只有已经形成三方章程且正常运行的联盟才能登记成员退出；暂停或人数不足期间不能绕过修复与替补程序。", ["查看联盟成员", "完成联盟修复", "暂缓退出"]);
    alliance.departures ??= [];
    if (alliance.departures.some((item) => item.status === "待退出复核")) return impossible("联盟已经有一项待复核退出申请，必须先完成或撤回，不能同时改写多家成员责任。", ["分别采访全部成员编辑", "批准已登记成员退出", "查看退出档案"]);
    const outletName = alliance.outlets.find((name) => action.includes(name));
    if (!outletName) return impossible("退出申请必须明确写出一家正式成员机构；系统不会替玩家选择谁离开。", alliance.outlets.map((name) => `登记${name}退出联盟申请`));
    const editor = game.view.mediaOutlets.find((item) => item.name === outletName)?.responsibleEditor;
    if (!editor) return impossible(`${outletName}没有可核验责任编辑，不能登记无责任人的退出。`, ["核对成员编辑", "查看媒体责任档案", "暂缓退出"]);
    const interactionCounts = Object.fromEntries(alliance.outlets.map((name) => [name, game.view.mediaOutlets.find((item) => item.name === name)?.responsibleEditor?.interactions ?? 0]));
    alliance.departures.push({ outlet: outletName, editorName: editor.name, status: "待退出复核", requestedAtActionIndex: game.actionIndex, interactionCounts, evidence: [`行动${game.actionIndex}：${editor.name}登记退出申请；既往报道、更正与共同核验签收责任继续留档`] });
    alliance.evidence.push(`${outletName}登记退出申请；共享资源冻结在联盟账内，尚未改变正式成员名单`);
    return { intent: "登记媒体联盟成员退出", minutes: 45, ruleSummary: `${outletName}进入待退出复核；${alliance.outlets.length}家成员编辑必须在申请后分别确认责任边界。退出不会撤销既往报道、更正、签收记录，也不能带走共享核验资源。`, fallbackNarrative: `${editor.name}把退出申请放进联盟档案，却没有抽走旧页。每份共同查证的签收号仍留在${outletName}名下，共享核验签也锁在公共账柜里；其余编辑要逐栏确认后，成员表才会改变。`, suggestions: alliance.outlets.map((name) => `联系${game.view.mediaOutlets.find((item) => item.name === name)?.responsibleEditor?.name ?? name}责任编辑复核退出责任`) };
  }
  if (/批准|通过|确认/.test(action) && /退出.*联盟|联盟.*退出/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    const departure = alliance?.departures?.find((item) => item.status === "待退出复核" && (!action.includes("退出") || action.includes(item.outlet))) ?? alliance?.departures?.find((item) => item.status === "待退出复核");
    if (!alliance || !departure || !["试运行", "资源冲突"].includes(alliance.status)) return impossible("当前没有可批准的成员退出申请，或联盟正处于不能改写成员表的状态。", ["登记具名成员退出申请", "查看联盟状态", "完成联盟修复"]);
    const editors = alliance.outlets.map((name) => ({ name, editor: game.view.mediaOutlets.find((item) => item.name === name)?.responsibleEditor }));
    const missingReviews = editors.filter(({ name, editor }) => !editor || (editor.interactions ?? 0) <= (departure.interactionCounts[name] ?? 0));
    if (missingReviews.length) return impossible(`${missingReviews.map((item) => item.editor?.name ?? item.name).join("、")}尚未在退出申请后分别确认责任边界，不能代签退出。`, editors.map((item) => `联系${item.editor?.name ?? item.name}责任编辑复核退出责任`));
    const retainedPool = alliance.sharedVerificationPool;
    alliance.statusBeforeMemberShortage = alliance.status === "资源冲突" ? "资源冲突" : "试运行";
    alliance.outlets = alliance.outlets.filter((name) => name !== departure.outlet);
    alliance.minimumMembers = 3;
    alliance.status = "成员不足";
    alliance.priorityAgendaId = undefined;
    alliance.delayedAgendaIds = alliance.agendas.filter((item) => item.status !== "共同核验").map((item) => item.id);
    for (const agenda of alliance.agendas) if (agenda.status !== "共同核验") agenda.status = "延后排期";
    departure.status = "已退出";
    departure.approvedAtActionIndex = game.actionIndex;
    departure.evidence.push(`行动${game.actionIndex}：${editors.map((item) => item.editor!.name).join("、")}分别复核后退出生效；保留全部既往责任，联盟保留${retainedPool}份共享资源但暂停使用`);
    alliance.name = `${alliance.outlets.join("—")}跨地区核验联盟（待替补）`;
    alliance.evidence.push(`${departure.outlet}正式退出；成员降至${alliance.outlets.length}家，${retainedPool}份共享资源未被带走但在替补完成前冻结`);
    return { intent: "批准媒体联盟成员退出", minutes: 90, ruleSummary: `${departure.outlet}退出生效，既往刊发、更正和共同核验责任完整保留；联盟剩余${alliance.outlets.length}家，${retainedPool}份共享资源冻结，必须完成替补准入后才能恢复共同核验。`, fallbackNarrative: "三份复核签字终于齐全，退出机构的名字从现任成员栏移到历史责任栏。账柜里的核验签一枚没少，却全部压上暂停封条；新成员没有通过独立调查前，剩下两家不能借旧联盟名义继续查证。", suggestions: ["登记替补媒体候选", "查看退出责任档案", "由单家机构继续调查"] };
  }
  if (/登记|寻找|引入/.test(action) && /替补.*(?:媒体|机构|成员)|(?:媒体|机构|成员).*替补/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    if (!alliance || alliance.status !== "成员不足") return impossible("只有正式成员退出并导致人数不足后，才能登记替补候选。", ["查看联盟状态", "登记具名成员退出", "保持现有成员"]);
    alliance.membershipApplications ??= [];
    if (alliance.membershipApplications.some((item) => item.status === "替补核验")) return impossible("已经有一家替补处于核验阶段，不能同时争夺同一个空缺席位。", ["采访替补责任编辑", "完成独立调查", "提交替补准入审议"]);
    const profile = allianceReplacementProfiles[game.view.era];
    const replacesOutlet = alliance.departures?.filter((item) => item.status === "已退出").at(-1)?.outlet;
    if (!replacesOutlet) return impossible("退出责任档案不完整，不能登记无对应空缺的替补。", ["查看退出档案", "核对成员名单", "保持暂停"]);
    recordMediaOutletReputation(game, { name: profile.outlet, stance: profile.stance, trustDelta: 0, evidence: `行动${game.actionIndex}：登记为${replacesOutlet}空缺的替补候选，不自动继承旧成员责任` });
    alliance.membershipApplications.push({ ...profile, status: "替补核验", kind: "替补", replacesOutlet, registeredAtActionIndex: game.actionIndex, evidence: [`行动${game.actionIndex}：登记替补；现有成员与候选编辑必须分别复核，且须完成独立调查`] });
    alliance.evidence.push(`${profile.outlet}进入替补核验；不继承${replacesOutlet}的报道、信誉、票数或责任，也未解冻共享资源`);
    return { intent: "登记媒体联盟替补候选", minutes: 60, ruleSummary: `${profile.outlet}由${profile.editorName}负责替补核验；两家现有成员与候选编辑必须分别复核，并取得至少1项登记后的独立调查。候选不继承退出机构的信誉、议题票数或责任。`, fallbackNarrative: `${profile.outlet}只被写进空缺席位旁的候选栏。${profile.editorName}另起一页签名，旧成员留下的报道和更正仍封存在原名下；公共账柜的核验签继续冻结。`, suggestions: [`联系${profile.editorName}责任编辑询问替补责任`, "分别采访现有成员编辑", "调查替补机构的独立来源记录"] };
  }
  if (/调查|核验|查证/.test(action) && /替补.*(?:来源|记录|能力)|(?:来源|记录|能力).*替补/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    const application = alliance?.membershipApplications?.find((item) => item.status === "替补核验");
    if (!alliance || alliance.status !== "成员不足" || !application) return impossible("当前没有等待独立来源调查的联盟替补候选。", ["登记替补媒体候选", "查看联盟状态", "由现有机构独立调查"]);
    application.evidence.push(`行动${game.actionIndex}：实地核对${application.outlet}的一项独立来源记录；调查结果仍须与编辑签字共同审议`);
    return { intent: "调查媒体联盟替补来源", minutes: 120, ruleSummary: `完成${application.outlet}的一项独立来源调查，形成可追踪行动证据；这不自动批准替补，也不解冻联盟资源。`, fallbackNarrative: `我没有从联盟旧档里抄一份结论，而是沿着${application.outlet}给出的编号重新找到来源。回函和时间戳都装进新证据袋，候选栏仍没有被改成正式成员。`, suggestions: ["分别采访三名责任编辑", "批准替补媒体加入联盟", "核对候选责任边界"] };
  }
  if (/登记|寻找|引入/.test(action) && /第三家.*(?:媒体|核验机构)|(?:媒体|核验机构).*第三家/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    if (!alliance || !["试运行", "资源冲突"].includes(alliance.status)) return impossible("联盟必须先完成双机构试运行，才能登记第三家候选机构。", ["启动媒体核验联盟", "查看联盟状态", "暂缓扩员"]);
    if (alliance.outlets.length >= 3) return impossible("联盟已经有三家正式成员，不能重复登记同一层级的扩员。", ["查看成员责任", "使用共同核验资源", "审计现有成员"]);
    const profile = allianceCandidateProfiles[game.view.era];
    alliance.membershipApplications ??= [];
    if (alliance.membershipApplications.some((item) => item.outlet === profile.outlet)) return impossible(`${profile.outlet}已有准入档案，不能重复登记。`, ["采访候选责任编辑", "完成独立调查", "提交三方准入审议"]);
    recordMediaOutletReputation(game, { name: profile.outlet, stance: profile.stance, trustDelta: 0, evidence: `行动${game.actionIndex}：登记为联盟第三家候选，不自动取得成员资格` });
    alliance.membershipApplications.push({ ...profile, status: "候选核验", kind: "扩员", registeredAtActionIndex: game.actionIndex, evidence: [`行动${game.actionIndex}：公开登记机构立场与责任编辑，等待三方分别复核`] });
    alliance.evidence.push(`${profile.outlet}进入候选核验；未获得共享资源、议题投票或成员背书`);
    return { intent: "登记第三媒体联盟候选", minutes: 60, ruleSummary: `${profile.outlet}由${profile.editorName}负责准入核验，目前只是候选；现有两家与候选编辑都必须在登记后分别复核，并至少完成1项独立来源调查。`, fallbackNarrative: `${profile.outlet}的名称被写进候选栏，而不是成员栏。${profile.editorName}的责任页、机构立场和来源边界单独装订；共享额度仍没有因此增加。`, suggestions: [`联系${profile.editorName}责任编辑询问准入来源`, "分别重新采访现有成员编辑", "调查候选机构的独立来源记录"] };
  }
  if (/批准|通过|完成/.test(action) && /第三家.*(?:加入|准入)|三方.*准入|替补.*(?:加入|准入)|(?:加入|准入).*替补/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    const application = alliance?.membershipApplications?.find((item) => item.status === "候选核验" || item.status === "替补核验");
    const replacement = application?.status === "替补核验" || application?.kind === "替补";
    const validStatus = replacement ? alliance?.status === "成员不足" : Boolean(alliance && ["试运行", "资源冲突"].includes(alliance.status));
    if (!alliance || !application || !validStatus) return impossible("当前没有与联盟状态匹配的候选准入申请。", [replacement ? "登记替补媒体候选" : "登记第三家媒体候选", "查看联盟状态", "暂缓准入"]);
    const requiredNames = [...alliance.outlets, application.outlet];
    const editors = requiredNames.map((name) => ({ name, editor: game.view.mediaOutlets.find((item) => item.name === name)?.responsibleEditor }));
    const missingReviews = editors.filter(({ editor }) => !editor || (editor.requestedEvidenceAtActionIndex ?? -1) <= application.registeredAtActionIndex);
    if (missingReviews.length) return impossible(`${missingReviews.map((item) => item.editor?.name ?? item.name).join("、")}尚未在候选登记后分别复核，任何一家都不能代签准入。`, requiredNames.map((name) => `联系${game.view.mediaOutlets.find((item) => item.name === name)?.responsibleEditor?.name ?? name}责任编辑复核第三家准入`));
    const investigations = game.world.actionLedger.filter((entry) => entry.index > application.registeredAtActionIndex && /调查|取得证据/.test(entry.intent) && !/登记|无法完成|规则阻止/.test(entry.intent));
    if (!investigations.length) return impossible("候选登记后还没有独立调查其来源能力，编辑会谈不能替代证据。", ["调查候选机构的独立来源记录", "寻找可追溯的异地证据", "暂缓准入"]);
    const candidate = game.view.mediaOutlets.find((item) => item.name === application.outlet);
    if (!candidate || candidate.trustScore < 58) return impossible("候选机构未达到稳定信誉门槛，不能靠联盟成员互相背书。", ["继续独立核验候选机构", "查看候选信誉", "拒绝本次准入"]);
    alliance.outlets.push(application.outlet);
    alliance.name = `${alliance.outlets.join("—")}跨地区核验联盟`;
    application.status = "已加入";
    application.evidence.push(`行动${game.actionIndex}：${editors.map((item) => item.editor!.name).join("、")}分别复核并以行动${investigations.at(-1)!.index}的独立调查通过准入`);
    for (const agenda of alliance.agendas) agenda.priorityScores[application.outlet] ??= 0;
    alliance.minimumMembers = 3;
    if (replacement) {
      alliance.status = alliance.statusBeforeMemberShortage ?? (alliance.delayedAgendaIds.length ? "资源冲突" : "试运行");
      alliance.statusBeforeMemberShortage = undefined;
      alliance.evidence.push(`${application.outlet}完成替补准入；未新增或取走共享资源，未继承${application.replacesOutlet}的既往责任`);
      return { intent: "批准替补媒体加入联盟", minutes: 120, ruleSummary: `${application.outlet}经三名责任编辑分别复核和独立调查后补足第3席；联盟解冻原有${alliance.sharedVerificationPool}份资源，但候选不继承${application.replacesOutlet}的信誉、票数或历史责任。`, fallbackNarrative: "三份新签字和调查编号全部对上，替补名称才进入现任成员栏。公共账柜只撕掉暂停封条，没有多发核验签；退出机构的旧责任页仍原样留在历史卷宗里。", suggestions: ["重新安排联盟优先议题", "查看退出与替补责任", "恢复三方共同核验"] };
    }
    alliance.sharedVerificationPool = Math.min(3, alliance.sharedVerificationPool + 1);
    alliance.resourceDepletedAtActionIndex = undefined;
    alliance.resourceDepletionInteractionCounts = undefined;
    alliance.evidence.push(`${application.outlet}正式加入并贡献1份核验资源；既有报道与更正责任不转移`);
    return { intent: "批准第三媒体加入联盟", minutes: 120, ruleSummary: `${application.outlet}经三名责任编辑分别复核和独立调查后成为第3家成员，贡献1份资源；联盟现有${alliance.outlets.length}家机构、${alliance.sharedVerificationPool}份资源，各自保留刊发与更正责任。`, fallbackNarrative: "三份签字分列在准入页上，调查编号钉在其后。候选名称这才从侧栏移进成员表，并交入一枚核验签；旧报道的责任栏没有随成员增加而重写。", suggestions: ["查看三方成员责任", "重新安排联盟优先议题", "进行三方共同核验"] };
  }
  if (/登记|制定|启动/.test(action) && /联盟.*修复|修复.*联盟/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    if (!alliance || alliance.status !== "暂停合作") return impossible("只有因信誉事故暂停的联盟才能登记修复计划。", ["查看联盟状态", "完成证据化更正", "暂缓合作"]);
    const suspendedOutlets = alliance.outlets.map((name) => game.view.mediaOutlets.find((item) => item.name === name)).filter((outlet) => alliance.suspendedOutletNames?.includes(outlet?.name ?? ""));
    if (!suspendedOutlets.length || suspendedOutlets.some((outlet) => outlet?.responsibleEditor?.responsibility !== "已签发更正")) return impossible("出错机构尚未签发有证据编号的更正，不能用修复计划跳过责任。", ["提交调查证据申请更正", "查看编辑责任记录", "保持暂停"]);
    alliance.status = "修复审核";
    alliance.recoveryPlanStartedAtActionIndex = game.actionIndex;
    alliance.suspensionInteractionCounts = Object.fromEntries(alliance.outlets.map((name) => [name, game.view.mediaOutlets.find((item) => item.name === name)?.responsibleEditor?.interactions ?? 0]));
    alliance.recoveryEvidence ??= [];
    alliance.recoveryEvidence.push(`行动${game.actionIndex}：登记修复计划；${suspendedOutlets.map((item) => item!.name).join("、")}保留更正责任，${alliance.outlets.length}家成员编辑必须重新复核并补做两项独立调查`);
    return { intent: "登记媒体联盟修复计划", minutes: 60, ruleSummary: `${alliance.name}进入修复审核；已确认出错机构签发更正，但尚未恢复共享资源。${alliance.outlets.length}名责任编辑必须在暂停后分别复核，并补做至少两项独立调查。`, fallbackNarrative: `修复页没有把旧事故划掉。出错机构的更正编号被钉在首页，下面留着${alliance.outlets.length}位编辑各自的复核栏，以及两格尚未完成的独立调查；共享额度仍是零。`, suggestions: ["分别重新采访全部成员责任编辑", "完成两项独立调查", "提交联盟恢复复核"] };
  }
  if (/提交|申请|完成/.test(action) && /联盟.*(?:恢复|修复).*复核|(?:恢复|修复).*联盟.*复核/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    if (!alliance || alliance.status !== "修复审核" || alliance.recoveryPlanStartedAtActionIndex === undefined) return impossible("当前没有已登记且等待复核的联盟修复计划。", ["登记联盟修复计划", "查看联盟状态", "保持暂停"]);
    const editors = alliance.outlets.map((name) => ({ name, editor: game.view.mediaOutlets.find((item) => item.name === name)?.responsibleEditor }));
    const missingReviews = editors.filter(({ name, editor }) => !editor || (editor.interactions ?? 0) <= (alliance.suspensionInteractionCounts?.[name] ?? 0));
    if (missingReviews.length) return impossible(`${missingReviews.map((item) => item.editor?.name ?? item.name).join("、")}尚未在修复计划登记后单独复核，不能由另一家代签。`, ["分别重新采访两家责任编辑", "查看编辑责任记录", "保持暂停"]);
    const investigations = game.world.actionLedger.filter((entry) => entry.index > alliance.recoveryPlanStartedAtActionIndex! && /调查|取得证据/.test(entry.intent) && !/登记|无法完成|规则阻止/.test(entry.intent));
    if (investigations.length < 2) return impossible(`修复计划后只有${investigations.length}项独立调查，至少需要2项才能投入新的共享资源。`, ["继续调查报道来源", "寻找另一项独立证据", "保持暂停"]);
    alliance.status = "受限恢复";
    alliance.sharedVerificationPool = 1;
    alliance.probationVerificationsRemaining = 1;
    const evidence = investigations.slice(-2).map((entry) => `行动${entry.index}：${entry.action}`);
    alliance.recoveryEvidence ??= [];
    alliance.recoveryEvidence.push(...evidence, `行动${game.actionIndex}：${editors.map((item) => item.editor!.name).join("与")}分别签署恢复复核，仅投入1份观察期核验资源`);
    alliance.evidence.push(`修复审核以2项独立调查和${editors.length}名编辑分别复核进入受限恢复；完成观察期核验前不得恢复常规合作`);
    return { intent: "媒体联盟受限恢复", minutes: 120, ruleSummary: `${alliance.name}进入受限恢复，仅补充1份共享核验资源；必须用在尚未共同核验的议题，观察期完成前仍不恢复常规合作。`, fallbackNarrative: "两位编辑在各自的复核栏签字，调查编号也逐项对上。资源室只发回一枚临时核验签，封条写得清楚：先完成一项可追溯的观察期查证，再谈恢复。", suggestions: ["选择尚未共同核验的议题", "完成观察期共同核验", "查看修复证据"] };
  }
  if (/申请|补充|追加/.test(action) && /联盟.*(?:核验资源|共享资源|核验额度)|(?:核验资源|共享资源|核验额度).*联盟/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    if (!alliance || !["试运行", "资源冲突"].includes(alliance.status)) return impossible("联盟当前不处于可补充常规资源的运行状态。", ["查看联盟状态", "完成启动或修复流程", "由单家机构调查"]);
    if (alliance.sharedVerificationPool > 0) return impossible(`联盟仍有${alliance.sharedVerificationPool}份核验资源，不能提前囤积额度。`, ["使用现有额度", "查看优先议题", "继续独立调查"]);
    if (alliance.resourceDepletedAtActionIndex === undefined) return impossible("联盟没有可审计的资源耗尽记录，不能凭空补发额度。", ["查看资源记录", "由单家机构调查", "保持零额度"]);
    const editors = alliance.outlets.map((name) => ({ name, editor: game.view.mediaOutlets.find((item) => item.name === name)?.responsibleEditor }));
    const missingReviews = editors.filter(({ name, editor }) => !editor || (editor.interactions ?? 0) <= (alliance.resourceDepletionInteractionCounts?.[name] ?? 0));
    if (missingReviews.length) return impossible(`${missingReviews.map((item) => item.editor?.name ?? item.name).join("、")}尚未在额度耗尽后重新复核，不能补发共享资源。`, ["分别采访全部成员责任编辑", "查看额度耗尽记录", "继续独立调查"]);
    const investigations = game.world.actionLedger.filter((entry) => entry.index > alliance.resourceDepletedAtActionIndex! && /调查|取得证据/.test(entry.intent) && !/登记|无法完成|规则阻止/.test(entry.intent));
    if (investigations.length < 2) return impossible(`额度耗尽后只有${investigations.length}项新调查，至少需要2项才能补回1份资源。`, ["继续调查报道来源", "寻找另一项独立证据", "保持零额度"]);
    alliance.sharedVerificationPool = 1;
    alliance.resourceRefillCount = (alliance.resourceRefillCount ?? 0) + 1;
    alliance.evidence.push(`行动${game.actionIndex}：以${editors.length}名编辑事后复核和${investigations.length}项耗尽后调查补充1份资源；累计补充${alliance.resourceRefillCount}次`);
    alliance.resourceDepletedAtActionIndex = undefined;
    alliance.resourceDepletionInteractionCounts = undefined;
    return { intent: "补充媒体联盟核验资源", minutes: 120, ruleSummary: `${alliance.name}依据${editors.length}名成员编辑事后复核和至少两项新调查补充1份共享核验资源；不能提前囤积，也不提高任何议题的事实可信度。`, fallbackNarrative: `资源室核对了耗尽页之后的两份调查编号，又让${editors.length}位编辑分别签字，只补回一枚核验签。它能支付下一次异地查证，却没有在任何报道旁盖上“属实”。`, suggestions: ["选择尚未共同核验的议题", "使用补充的核验资源", "查看资源补充记录"] };
  }
  if (/协商|启动/.test(action) && /共享核验|媒体联盟|核验联盟/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    if (!alliance) return impossible("当前没有可协商的媒体联盟提案。", ["提议建立跨地区核验联盟", "对比两家媒体核验链", "查看媒体责任档案"]);
    if (alliance.status !== "提议中") return impossible(`${alliance.name}当前为“${alliance.status}”，不需要重复启动。`, ["安排联盟优先议题", "共同核验优先议题", "查看联盟证据"]);
    const competition = game.view.mediaCompetitions.find((item) => item.id === alliance.competitionId)!;
    const editors = alliance.outlets.map((name) => game.view.mediaOutlets.find((item) => item.name === name)?.responsibleEditor);
    if (!competition.evidence.some((item) => item.includes("玩家对比"))) return impossible("玩家尚未逐栏对比两家机构的来源、转载与更正责任。", ["对比两家媒体的报道与核验记录", "查看报道版本", "暂缓联盟"]);
    if (editors.some((editor) => !editor || (editor.interactions ?? 0) < 1)) return impossible("两家机构的责任编辑尚未分别接受来源边界访谈，不能由一方替另一方同意。", ["分别采访两家责任编辑", "查看编辑署名", "暂缓联盟"]);
    alliance.status = "试运行";
    alliance.sharedVerificationPool = 2;
    alliance.evidence.push(`行动${game.actionIndex}：${editors.map((editor) => editor!.name).join("与")}分别同意共享两份异地查证额度，原机构各自承担刊发责任`);
    return { intent: "启动媒体核验联盟", minutes: 90, ruleSummary: `${alliance.name}进入试运行，共享核验资源 ${alliance.sharedVerificationPool} 份；共享查证不等于共享结论或免责。`, fallbackNarrative: "两位编辑在同一页的不同栏签了名。共享的是异地目录和两次查证额度，标题、结论和出错后的更正责任仍各归各家。", suggestions: ["选择联盟优先议题", "查看候选议题", "让联盟共同核验优先议题"] };
  }
  if (/设为.*优先议题|优先核验/.test(action) && /联盟|议题/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    if (!alliance || ["提议中", "暂停合作", "修复审核", "成员不足"].includes(alliance.status)) return impossible("联盟当前没有可分配的共享核验资源。", ["协商启动、修复或补足成员", "分别采访成员责任编辑", "查看联盟档案"]);
    const agenda = alliance.agendas.find((item) => action.includes(item.title));
    if (!agenda) return impossible("需要明确选择联盟档案中的一个具名议题。", alliance.agendas.slice(0, 3).map((item) => `把${item.title}设为联盟优先议题`));
    const recovering = alliance.status === "受限恢复";
    alliance.priorityAgendaId = agenda.id;
    alliance.delayedAgendaIds = alliance.agendas.filter((item) => item.id !== agenda.id && item.status !== "共同核验").map((item) => item.id);
    for (const item of alliance.agendas) {
      item.status = item.id === agenda.id ? "优先排期" : item.status === "共同核验" ? item.status : "延后排期";
      if (item.id === agenda.id) for (const outlet of alliance.outlets) item.priorityScores[outlet] = (item.priorityScores[outlet] ?? 0) + 1;
    }
    alliance.status = recovering ? "受限恢复" : alliance.delayedAgendaIds.length ? "资源冲突" : "试运行";
    alliance.evidence.push(`行动${game.actionIndex}：把“${agenda.title}”设为优先，${alliance.delayedAgendaIds.length}个议题因共享人力有限延后`);
    return { intent: "设置媒体联盟议程", minutes: 45, ruleSummary: `“${agenda.title}”成为优先议题；${alliance.delayedAgendaIds.length}个议题延后，联盟状态为“${alliance.status}”。优先级不提高事实可信度。`, fallbackNarrative: "排期板只能把一个议题推到最上方。它旁边多了两道核验签位，其他条目则被移到下一栏；没人把“先查”改写成“已经属实”。", suggestions: ["让媒体联盟共同核验优先议题", "查看延后议题", "重新安排联盟优先议题"] };
  }
  if (/联盟.*共同核验|共同核验.*优先议题/.test(action)) {
    const alliance = game.view.mediaAlliances.at(-1);
    const agenda = alliance?.agendas.find((item) => item.id === alliance.priorityAgendaId);
    if (!alliance || !agenda) return impossible("联盟尚未选出一个明确的优先议题。", ["选择联盟优先议题", "查看候选议题", "暂缓共享核验"]);
    if (["提议中", "暂停合作", "修复审核", "成员不足"].includes(alliance.status)) return impossible(`联盟当前为“${alliance.status}”，不能调用共享核验资源。`, ["完成联盟启动、修复或替补准入", "由单家机构独立调查", "查看联盟证据"]);
    if (agenda.status === "共同核验") return impossible("该议题已经完成共同核验，不能反复消耗额度刷取信誉。", ["选择尚未共同核验的议题", "查看延后议题", "由单家机构继续调查"]);
    if (alliance.sharedVerificationPool < 1) return impossible("共享核验额度已经用完，不能凭联盟名义制造新的来源。", ["等待下一轮资源", "由单家机构独立调查", "查看已核验议题"]);
    alliance.sharedVerificationPool -= 1;
    agenda.status = "共同核验";
    agenda.evidence.push(`行动${game.actionIndex}：${alliance.outlets.length}家责任编辑分别签收同一份异地目录查证结果，仍保留各自结论权`);
    alliance.evidence.push(`${agenda.title}消耗1份共享核验额度，剩余${alliance.sharedVerificationPool}`);
    const probation = alliance.status === "受限恢复";
    for (const outlet of alliance.outlets) recordMediaOutletReputation(game, { name: outlet, stance: game.view.mediaOutlets.find((item) => item.name === outlet)?.stance ?? "公共信息核验", trustDelta: probation ? 4 : 1, evidence: `${agenda.id}：联盟${probation ? "观察期" : ""}共享异地查证，但未互相复制结论` });
    recordMediaCompetition(game, { primary: alliance.outlets[0], secondary: alliance.outlets[1], primaryDelta: 1, secondaryDelta: 1, status: "核验拉锯", evidence: `${agenda.id}：双方共同取得查证材料，各自承担使用与更正责任` });
    if (probation) {
      alliance.probationVerificationsRemaining = 0;
      const stable = alliance.outlets.every((name) => (game.view.mediaOutlets.find((item) => item.name === name)?.trustScore ?? 0) >= 58);
      alliance.status = stable ? "试运行" : "受限恢复";
      alliance.evidence.push(`观察期共同核验完成；${stable ? "双方恢复稳定信誉，转回试运行" : "仍有机构未达稳定信誉，继续受限且不补发额度"}`);
    }
    if (alliance.sharedVerificationPool === 0) {
      alliance.resourceDepletedAtActionIndex = game.actionIndex;
      alliance.resourceDepletionInteractionCounts = Object.fromEntries(alliance.outlets.map((name) => [name, game.view.mediaOutlets.find((item) => item.name === name)?.responsibleEditor?.interactions ?? 0]));
      alliance.evidence.push(`行动${game.actionIndex}：共享核验资源耗尽；后续补充必须重新取得${alliance.outlets.length}名成员编辑复核和两项新调查`);
    }
    return { intent: probation ? "媒体联盟观察期核验" : "媒体联盟共同核验", minutes: 180, ruleSummary: `联盟用1份共享资源完成“${agenda.title}”的异地查证，剩余 ${alliance.sharedVerificationPool}；${probation ? `观察期结果为“${alliance.status}”，` : ""}${alliance.outlets.length}家机构各自决定是否刊发并分别承担错误责任。`, fallbackNarrative: probation ? `临时核验签随着异地回函一并归档。${alliance.outlets.length}家编辑分别写下判断，复核人只确认来源链完整，没有替任何一家背书；信誉达到门槛后，常规合作才重新开放。` : `同一份异地回函送到${alliance.outlets.length}张编辑桌上，签收号能够互相对照。各家圈出不同段落，没有共用标题，也没有在责任栏替别家签名。`, suggestions: ["分别询问成员编辑结论", "查看延后议题", "继续独立调查"] };
  }
  if (/对比.*(?:媒体|两家).*(?:报道|核验|记录)|比较.*(?:报道|媒体)/.test(action)) {
    const competition = game.view.mediaCompetitions?.at(-1);
    if (!competition) return impossible("当前还没有两家媒体围绕同一事件形成可比较的报道链。", ["查看近日消息", "等待关联报道", "检查媒体责任档案"]);
    const [left, right] = competition.outlets;
    const leader = competition.leader ? `${competition.leader}暂时领先` : "双方暂时并列";
    competition.evidence.push(`行动${game.actionIndex}：玩家对比两家媒体的来源、核验等级与更正记录`);
    competition.evidence = competition.evidence.slice(-20);
    return { intent: "对比媒体竞争记录", minutes: 45, ruleSummary: `${left} ${competition.scores[left] ?? 0}分，${right} ${competition.scores[right] ?? 0}分；${leader}。分数来自首发、透明转载、独立补证与更正责任，不等于报道内容自动为真。`, fallbackNarrative: "我把两家机构的首发时间、原始来源、转载标记和更正页逐栏排开。谁快、谁肯标明来源、谁在证据推翻旧稿后承担责任，一眼都能看见；声量没有被当成真实性。", suggestions: ["分别采访两家责任编辑", "调查报道来源和现场记录", "选择一家提交独家补充证据"], systemMessages: [`媒体竞争核验 · ${left} / ${right}`] };
  }
  if (/联系.*(?:责任编辑|核验编辑)|采访.*编辑|询问.*编辑|请求.*编辑.*说明/.test(action)) {
    if (!publishedRumor) return impossible(`当前没有以“${publicName}”刊发且可找到责任编辑的报道。`, ["查看近日消息", "检查本地口碑", "等待报道刊发"]);
    const participatingNames = [publishedRumor.mediaOutlet ?? publishedRumor.mediaChannel, ...(publishedRumor.mediaVersions ?? []).map((item) => item.outlet), ...game.view.mediaAlliances.flatMap((item) => [...item.outlets, ...(item.membershipApplications ?? []).map((application) => application.outlet)])].filter(Boolean);
    const outlet = game.view.mediaOutlets.find((item) => participatingNames.includes(item.name) && action.includes(item.responsibleEditor?.name ?? "\0"))
      ?? game.view.mediaOutlets.find((item) => item.name === (publishedRumor.mediaOutlet ?? publishedRumor.mediaChannel));
    const editor = outlet?.responsibleEditor;
    if (!outlet || !editor) return impossible("这份旧报道没有保存可核验的责任编辑档案，不能凭空建立采访关系。", ["查看报道署名", "联系媒体机构", "调查报道来源"]);
    editor.interactions = (editor.interactions ?? 0) + 1;
    editor.playerTrust = Math.min(100, (editor.playerTrust ?? 0) + (/双记录|跨关系网/.test(publishedRumor.verificationStatus ?? "") ? 2 : 0));
    editor.lastContactAt = relationshipDate(game);
    editor.requestedEvidenceAtActionIndex = game.actionIndex;
    editor.activeRumorId = publishedRumor.id;
    editor.evidence.push(`${publishedRumor.id}：与${publicName}当面核对选稿依据并请求独立补充材料`);
    editor.evidence = editor.evidence.slice(-12);
    if (publishedRumor.valence < 0) publishedRumor.auditStartedActionIndex ??= game.actionIndex;
    return { intent: "责任编辑采访", minutes: 60, ruleSummary: `${editor.role}${editor.name}说明了“${publishedRumor.summary}”的来源边界，并登记补充证据请求；采访本身不改稿、不撤稿。`, fallbackNarrative: `${editor.name}把刊发页和来源表并排摊开，没有因为我到场就改标题。${editor.role}逐项说明哪些来自登记、哪些来自见证者，最后新开一栏，让我提交能被独立复核的材料。`, suggestions: ["调查报道来源和现场记录", "向责任编辑提交补充证据", publishedRumor.valence < 0 ? "取得证据后申请更正" : "查看编辑责任记录"], systemMessages: [`媒体采访 · ${outlet.name} · ${editor.name}`] };
  }
  if (/向.*(?:责任编辑|核验编辑|编辑).*提交.*(?:证据|材料)|提交.*补充.*(?:证据|材料)/.test(action)) {
    const outlet = game.view.mediaOutlets.find((item) => item.responsibleEditor?.activeRumorId && action.includes(item.responsibleEditor.name))
      ?? [...game.view.mediaOutlets].reverse().find((item) => item.responsibleEditor?.activeRumorId);
    const editor = outlet?.responsibleEditor;
    const activeRumor = editor?.activeRumorId ? game.world.socialRumors.find((item) => item.id === editor.activeRumorId) : undefined;
    if (!outlet || !editor || !activeRumor || editor.requestedEvidenceAtActionIndex === undefined) return impossible("尚未与该报道的责任编辑完成来源访谈和补证登记。", ["联系责任编辑说明报道", "查看报道署名", "调查消息来源"]);
    const evidence = game.world.actionLedger.filter((entry) => entry.index > editor.requestedEvidenceAtActionIndex! && /调查|取得证据/.test(entry.intent) && !/登记|无法完成|规则阻止/.test(entry.intent));
    if (!evidence.length) return impossible("访谈后还没有完成独立调查，重复自己的说法不能算补充证据。", ["调查报道来源和现场记录", "寻找独立见证者", "取得公开凭据"]);
    const submitted = evidence.slice(-3).map((entry) => `行动${entry.index}：${entry.action}`);
    editor.interactions = (editor.interactions ?? 0) + 1;
    editor.playerTrust = Math.min(100, (editor.playerTrust ?? 0) + 4);
    editor.sourceTrust = Math.min(100, editor.sourceTrust + 1);
    editor.responsibility = "在岗核验";
    editor.evidence.push(...submitted.map((item) => `${activeRumor.id}：补充材料${item}`));
    editor.evidence = editor.evidence.slice(-12);
    editor.requestedEvidenceAtActionIndex = undefined;
    activeRumor.corroborationCount = (activeRumor.corroborationCount ?? 0) + submitted.length;
    activeRumor.confidence = Math.min(100, (activeRumor.confidence ?? 50) + 5);
    const exclusive = /独家/.test(action);
    const rivalName = [activeRumor.mediaOutlet ?? activeRumor.mediaChannel, ...(activeRumor.mediaVersions ?? []).map((item) => item.outlet)].find((name) => name && name !== outlet.name);
    if (exclusive && rivalName) recordMediaCompetition(game, { primary: outlet.name, secondary: rivalName, primaryDelta: 3, secondaryDelta: 0, status: "核验拉锯", playerChoice: outlet.name, evidence: `${activeRumor.id}：玩家把${submitted.length}条独立调查线索优先交给${outlet.name}` });
    return { intent: exclusive ? "提交独家媒体线索" : "向责任编辑补充证据", minutes: 90, ruleSummary: `${editor.name}收录${submitted.length}条访谈后独立调查记录；来源信任调整为${editor.sourceTrust}${exclusive ? `，${outlet.name}在本轮核验竞争中取得线索优势` : ""}，但是否更正或追加报道仍需单独结算。`, fallbackNarrative: `${editor.name}逐页核过调查时间、地点和来源，把能追溯的部分编进补充材料。那一栏有了编号，却还不是新报道；是否改稿，要走下一道复核。`, suggestions: [activeRumor.valence < 0 ? "提交证据申请更正" : "等待补充报道复核", "对比两家媒体报道与核验记录", "继续调查独立来源"], systemMessages: [`媒体补证 · ${outlet.name} · ${submitted.length}条`] };
  }
  const rumor = [...game.world.socialRumors].reverse().find((item) => item.publicName === publicName && item.valence < 0 && item.status === "已传播" && item.mediaStatus !== "已更正");
  if (!rumor) return impossible(`当前没有以“${publicName}”传播且可核验的负面消息。`, ["查看近日消息", "检查本地口碑", "调查其他事件"]);
  if (/申请核验|开始核验|登记核验|核查传闻/.test(action)) {
    rumor.auditStartedActionIndex = game.actionIndex;
    rumor.correctionEvidence ??= [];
    return { intent: "登记传闻核验", minutes: 60, ruleSummary: `登记对“${rumor.summary}”的来源核验；尚未形成足以更正的证据。`, fallbackNarrative: `我先把消息最早出现的日期、地点和说法逐项抄下来。登记处只收下核验申请，没有因为我的否认就撤掉记录。`, suggestions: ["调查消息来源和现场记录", "寻找独立见证者", "取得公开凭据后提交澄清"], systemMessages: [`舆情核验 · ${publicName} · 待取证`] };
  }
  if (/提交.*(?:证据|凭据).*(?:澄清|更正)|公开澄清|申请更正/.test(action)) {
    if (rumor.auditStartedActionIndex === undefined) return impossible("尚未登记针对这条消息的来源核验。", ["申请核验负面传闻", "调查消息来源", "暂不回应"]);
    const evidence = game.world.actionLedger.filter((entry) => entry.index > rumor.auditStartedActionIndex! && /调查|取得证据/.test(entry.intent) && !/登记|无法完成|规则阻止/.test(entry.intent));
    if (evidence.length < 1) return impossible("登记后还没有完成独立调查，单方面否认不能作为媒体更正依据。", ["调查消息来源和现场记录", "寻找独立见证者", "取得公开凭据"]);
    rumor.mediaStatus = "已更正";
    rumor.correctionEvidence = evidence.slice(-3).map((entry) => `行动${entry.index}：${entry.action}`);
    rumor.corroborationCount = (rumor.corroborationCount ?? 0) + rumor.correctionEvidence.length;
    rumor.verificationStatus = "更正证据已核验";
    rumor.confidence = Math.max(10, (rumor.confidence ?? 50) - 35);
    recordMediaOutletReputation(game, { name: rumor.mediaOutlet ?? rumor.mediaChannel ?? "未名媒体", stance: rumor.editorialStance ?? "公共信息记录", trustDelta: -8, correction: true, evidence: `${rumor.id}：后续${rumor.correctionEvidence.length}条证据触发更正` });
    for (const version of rumor.mediaVersions ?? []) {
      version.verificationStatus = "更正证据已核验";
      version.confidence = Math.max(10, version.confidence - 35);
      recordMediaOutletReputation(game, { name: version.outlet, stance: version.stance, trustDelta: -4, correction: true, evidence: `${rumor.id}：关联原报道的更正同步` });
      recordMediaCompetition(game, { primary: rumor.mediaOutlet ?? rumor.mediaChannel ?? "未名媒体", secondary: version.outlet, primaryDelta: -4, secondaryDelta: 1, status: "更正问责", evidence: `${rumor.id}：首发机构承担较高更正责任，透明关联机构保留来源边界` });
    }
    for (const reputation of game.view.reputations.filter((item) => item.publicName === publicName)) {
      reputation.heat = Math.max(0, reputation.heat - 15);
      reputation.reputation = "负面说法已被证据质疑";
      reputation.source = `${rumor.mediaChannel ?? "本地渠道"}更正与${rumor.correctionEvidence.length}条调查证据`;
    }
    const outletTrust = game.view.mediaOutlets.find((item) => item.name === (rumor.mediaOutlet ?? rumor.mediaChannel));
    if (outletTrust?.responsibleEditor) {
      outletTrust.responsibleEditor.interactions = (outletTrust.responsibleEditor.interactions ?? 0) + 1;
      outletTrust.responsibleEditor.playerTrust = Math.min(100, (outletTrust.responsibleEditor.playerTrust ?? 0) + 4);
      outletTrust.responsibleEditor.evidence.push(`${rumor.id}：接受${publicName}提交的独立调查并签发更正`);
      outletTrust.responsibleEditor.evidence = outletTrust.responsibleEditor.evidence.slice(-12);
    }
    for (const alliance of game.view.mediaAlliances.filter((item) => item.outlets.some((name) => name === (rumor.mediaOutlet ?? rumor.mediaChannel) || (rumor.mediaVersions ?? []).some((version) => version.outlet === name)))) {
      const unstable = alliance.outlets.filter((name) => (game.view.mediaOutlets.find((item) => item.name === name)?.trustScore ?? 0) < 58);
      if (unstable.length) {
        alliance.status = "暂停合作";
        alliance.sharedVerificationPool = 0;
        alliance.suspendedOutletNames = unstable;
        alliance.suspensionInteractionCounts = Object.fromEntries(alliance.outlets.map((name) => [name, game.view.mediaOutlets.find((item) => item.name === name)?.responsibleEditor?.interactions ?? 0]));
        alliance.recoveryPlanStartedAtActionIndex = undefined;
        alliance.probationVerificationsRemaining = 0;
        alliance.recoveryEvidence = [`${rumor.id}：${rumor.correctionEvidence.join("；")}`];
        alliance.evidence.push(`${rumor.id}更正后${unstable.join("、")}跌出稳定信誉，联盟暂停且未使用额度全部失效`);
      }
    }
    game.view.news.unshift({ id: `${rumor.id}-correction`, title: `${rumor.mediaOutlet ?? rumor.mediaChannel ?? "本地公报"} · 更正说明`, detail: `关于${publicName}的旧消息已附加更正：${rumor.correctionEvidence.join("；")}。核验状态：${rumor.verificationStatus}；累计${rumor.corroborationCount}项来源；机构信誉调整为${outletTrust?.trustScore ?? 52}（${outletTrust?.status ?? "待观察"}）。${outletTrust?.responsibleEditor?.role ?? "责任编辑"}${outletTrust?.responsibleEditor?.name ?? "当班编辑"}签发更正，个人来源信任调整为${outletTrust?.responsibleEditor?.sourceTrust ?? 52}。更正降低原消息可信度，但不会抹除已经发生的传播。`, date: relationshipDate(game) });
    game.view.news = game.view.news.slice(0, 30);
    return { intent: "证据化媒体更正", minutes: 180, ruleSummary: `以${rumor.correctionEvidence.length}条后续调查证据发布更正；既有传播记录保留。`, fallbackNarrative: `更正没有把旧纸页烧掉。新公告把调查日期和凭据列在原消息旁边，读者能看见前后两份记录，再决定相信哪一边。`, suggestions: ["查看更正公告", "继续补充独立证据", "观察外地口碑变化"], systemMessages: [`媒体更正 · ${publicName} · 有据可查`] };
  }
  return impossible("需要明确申请核验，或在完成调查后提交证据申请更正。", ["申请核验负面传闻", "调查消息来源", "提交证据公开澄清"]);
}

function investigateResolution(game: StoredGame, action: string): ActionResolution {
  const random = actionRandom(game);
  const localNpc = Object.values(game.world.npcs).find((npc) => npc.alive && npc.currentGoal !== "尚未出生" && npc.locationId === game.view.locationId && !npc.knownToPlayer && canDiscoverNpc(game, npc.id) && random() < 0.45);
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
    game.view.character.specialSystem = createSpecialSystemView(selected.hiddenGift);
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

function specialSystemResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character!;
  if (!character.specialSystem) return impossible("我还没有确认任何独立修行体系。", ["调查自己的身世", "研究武魂异象", "继续魂力修炼"]);
  const random = actionRandom(game);
  const system = character.specialSystem;
  const key = "specialSystemProgress";
  const currentProgress = () => Number(game.world.flags[key] ?? 0);
  const advanceSystem = (gain: number) => {
    const next = Math.min(100, currentProgress() + gain);
    game.world.flags[key] = next;
    system.progress = `${next}%`;
    system.stage = next >= 80 ? "稳定运行 · 三级" : next >= 35 ? "功能展开 · 二级" : "觉醒绑定 · 一级";
    return next;
  };

  if (system.name === "万象签到系统") {
    const stamp = `${game.view.worldTime?.year ?? 0}-${game.view.worldTime?.day ?? 1}`;
    if (/查看|记录/.test(action)) {
      const locations = String(game.world.flags.goldFingerSignLocations ?? "").split("|").filter(Boolean);
      return { intent: "查看签到记录", minutes: 1, ruleSummary: `已记录 ${locations.length} 个首签地点；今日${game.world.flags.goldFingerLastSign === stamp ? "已签到" : "尚未签到"}。`, fallbackNarrative: `签到页按日期排得整整齐齐。上面只有我真正到过的地点，空白处仍然是空白。`, suggestions: game.world.flags.goldFingerLastSign === stamp ? ["等待到明天", "前往新地点", "继续当前计划"] : ["在当前地点签到", "调查当前地点", "继续当前计划"] };
    }
    if (game.world.flags.goldFingerLastSign === stamp) return impossible("今天已经签到过；更换地点也不能重复领取同一天奖励。", ["等待到明天", "查看签到记录", "继续当前计划"]);
    const seen = new Set(String(game.world.flags.goldFingerSignLocations ?? "").split("|").filter(Boolean));
    const locationId = game.view.locationId ?? "unknown";
    const firstVisit = !seen.has(locationId);
    seen.add(locationId);
    game.world.flags.goldFingerSignLocations = [...seen].join("|");
    game.world.flags.goldFingerLastSign = stamp;
    const coins = firstVisit ? 3 : 1;
    character.coins += coins;
    const progress = advanceSystem(firstVisit ? 6 : 3);
    game.world.metrics.discoveries += firstVisit ? 1 : 0;
    return { intent: "系统签到", minutes: 5, ruleSummary: `${stamp}在${game.view.location}完成签到；${firstVisit ? "首次地点记录" : "普通日签"}，获得${formatSoulCoins(coins)}与系统进度，当前${progress}%。`, fallbackNarrative: `只有我能看见的字在眼前停了一瞬。今天的地点和日期被记进册页，没有神物落地，钱袋里只多了几枚确实能数清的硬币。`, suggestions: ["查看签到记录", "调查当前地点", "等待下一日签到"], systemMessages: [`签到 · ${game.view.location} · ${firstVisit ? "地点首签" : "普通日签"}`] };
  }

  if (system.name === "勤修加点面板") {
    const points = Number(game.world.flags.goldFingerPotentialPoints ?? 0);
    if (/查看|打开|面板/.test(action) && !/加点|分配/.test(action)) return { intent: "查看加点面板", minutes: 1, ruleSummary: `可分配潜能点 ${points}；潜能只来自真实修炼、课程或战斗。`, fallbackNarrative: `面板上的数字很少，也很诚实。没有完成的训练不会出现在这里，可用潜能点只剩${points}。`, suggestions: points > 0 ? ["给体魄加点", "给精神加点", "给感知加点"] : ["完成一次修炼", "参加学院课程", "经历一场实战"] };
    if (!/加点|分配/.test(action)) return impossible("需要说明查看面板，或把潜能点分配给体魄、精神、感知中的一项。", ["查看加点面板", "给体魄加点", "先去修炼"]);
    if (points < 1) return impossible("目前没有潜能点；必须先完成真实训练、课程或实战。", ["安静冥想修炼", "参加学院课程", "查看加点面板"]);
    const target = /精神/.test(action) ? "精神" : /感知/.test(action) ? "感知" : /体魄/.test(action) ? "体魄" : undefined;
    if (!target) return impossible("需要明确选择体魄、精神或感知，不能笼统地全部加满。", ["给体魄加点", "给精神加点", "给感知加点"]);
    const levelKey = `goldFinger${target}Level`;
    const level = Number(game.world.flags[levelKey] ?? 0) + 1;
    game.world.flags[levelKey] = level;
    game.world.flags.goldFingerPotentialPoints = points - 1;
    system.abilities = [...system.abilities.filter((item) => !item.startsWith(`${target}强化`)), `${target}强化 ${level}`];
    const progress = advanceSystem(4);
    if (target === "体魄") game.world.healthPoints = Math.min(100, game.world.healthPoints + 3);
    return { intent: "潜能加点", minutes: 10, ruleSummary: `消耗1点潜能，将${target}强化至${level}；剩余${points - 1}点，系统进度${progress}%。`, fallbackNarrative: `我把那一点潜能压进${target}一栏。变化很轻，没有跨过魂环或等级瓶颈，却能感觉到原本训练留下的积累被重新梳理了一遍。`, suggestions: ["查看加点面板", "测试变化", "继续积累潜能"] };
  }

  if (system.name === "命运片段模拟器") {
    const ordinal = (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1);
    const last = Number(game.world.flags.goldFingerLastSimulationOrdinal ?? -1_000_000_000);
    if (ordinal - last < 7) return impossible(`距离下一次完整模拟还需 ${7 - (ordinal - last)} 天。`, ["记录当前风险", "等待数日", "亲自调查"]);
    game.world.flags.goldFingerLastSimulationOrdinal = ordinal;
    const subject = game.view.tasks.find((item) => item.status === "进行中")?.title ?? game.world.dynamicEvents.find((item) => item.status === "可介入")?.title ?? "下一次重要选择";
    const uncertainty = Math.min(80, 25 + game.world.deviation * 3);
    const outcomes = ["准备不足会留下可避免的伤势", "可靠同伴能显著降低失败代价", "表面最短的路线藏着尚未核实的条件", "拖延会让另一方先采取行动"];
    const fragment = pick(random, outcomes);
    const progress = advanceSystem(8);
    game.world.fatiguePoints += 8;
    return { intent: "命运片段模拟", minutes: 30, ruleSummary: `围绕“${subject}”完成一次短期推演：${fragment}。误差约${uncertainty}%，不获得模拟中的修为或物品；系统进度${progress}%。`, fallbackNarrative: `眼前的景物暗了一瞬。我看见自己沿着一条可能的路走下去，结局只停留了几息便碎开。醒来后手里什么也没有，只有一条值得核实的风险提示。`, suggestions: ["调查模拟提示", "更换方案再准备", "记录误差来源"], systemMessages: [`模拟片段 · ${subject} · 可信度有限`] };
  }

  if (system.name === "等价任务系统") {
    const task = game.view.tasks.find((item) => item.id === "gold-finger-evidence-task" && item.status === "进行中");
    if (/查看|领取|刷新|任务/.test(action) && !/提交|结算/.test(action)) {
      if (!task) {
        const baseline = Number(game.world.flags.goldFingerEvidenceCount ?? 0);
        game.world.flags.goldFingerTaskEvidenceBaseline = baseline;
        ensureTask(game, { id: "gold-finger-evidence-task", title: "系统任务：留下真实成长记录", kind: "计划", detail: "完成一次至少推进60分钟的修炼、学院课程、调查或实战；必须写入行动账本。", status: "进行中" });
      }
      return { intent: "查看系统任务", minutes: 1, ruleSummary: task ? task.detail : "已发布新任务：完成一次有行动记录的真实成长行为。", fallbackNarrative: `任务栏没有让我去凭空击败封号斗罗，只列出当前真正做得到、也必须留下记录的一件事。`, suggestions: ["安静冥想修炼", "进行实地调查", "完成后提交系统任务"] };
    }
    if (/提交|结算/.test(action)) {
      if (!task) return impossible("当前没有待验收的系统任务。", ["查看系统任务", "领取系统任务", "继续当前计划"]);
      const baseline = Number(game.world.flags.goldFingerTaskEvidenceBaseline ?? 0);
      const evidence = Number(game.world.flags.goldFingerEvidenceCount ?? 0);
      if (evidence <= baseline) return impossible("行动账本里还没有任务发布后的有效成长记录。", ["完成一次修炼", "完成一次调查", "参加学院课程"]);
      task.status = "完成";
      task.progressEvidence = [`行动账本新增 ${evidence - baseline} 条有效成长记录`];
      character.coins += 4;
      const progress = advanceSystem(7);
      return { intent: "系统任务验收", minutes: 5, ruleSummary: `任务按行动证据验收，获得${formatSoulCoins(4)}与系统进度；当前${progress}%。`, fallbackNarrative: `系统把行动账本从头到尾核了一遍，直到看见确实发生过的训练记录才亮起“完成”。奖励不大，但没有含糊。`, suggestions: ["领取下一项系统任务", "查看任务证据", "继续主线计划"], systemMessages: ["系统任务 · 证据验收通过"] };
    }
    return impossible("需要先查看任务，完成真实行动后再提交验收。", ["查看系统任务", "完成一次修炼", "提交系统任务"]);
  }

  if (system.name === "武魂生态图鉴") {
    if (!/扫描|鉴定|图鉴|记录/.test(action)) return impossible("图鉴需要扫描当前真实接触到的对象。", ["扫描自己的武魂", "调查附近魂兽", "查看图鉴记录"]);
    const records = new Set(String(game.world.flags.goldFingerCodexRecords ?? "").split("|").filter(Boolean));
    const localBeast = SOUL_BEASTS.find((beast) => beast.habitats.includes(game.view.locationId ?? ""));
    const subject = /自己|武魂/.test(action) ? character.martialSoul.name : localBeast?.name;
    if (!subject) return impossible("当前位置没有经过调查确认、可以安全扫描的魂兽样本。", ["扫描自己的武魂", "调查附近魂兽", "换到魂兽栖息地"]);
    const fresh = !records.has(subject);
    records.add(subject);
    game.world.flags.goldFingerCodexRecords = [...records].join("|");
    const progress = advanceSystem(fresh ? 6 : 1);
    if (fresh) game.world.metrics.discoveries += 1;
    return { intent: "图鉴扫描", minutes: 15, ruleSummary: `${fresh ? "新增" : "复核"}${subject}记录；图鉴仅给出已观察到的结构与适配线索，系统进度${progress}%。`, fallbackNarrative: `细线一样的标记从${subject}表面掠过。图鉴没有补全未知部分，只把我亲眼见到的特征一项项写进空白页。`, suggestions: ["查看图鉴记录", "寻找新的样本", "验证适配建议"], systemMessages: fresh ? [`图鉴新增 · ${subject}`] : [] };
  }

  const definition = goldFingerByName(system.name);
  if (definition) {
    const { mechanic } = definition;
    const lastAction = game.world.actionLedger.at(-1);
    const materialIndex = game.view.inventory.findIndex((item) => /药|草|矿|铁|木|皮|骨|样本|材料/.test(item));
    const triggerReady: Record<typeof mechanic.trigger, boolean> = {
      "随时": true,
      "每日": true,
      "新地点": game.world.discoveredLocations.includes(game.view.locationId ?? ""),
      "训练后": Boolean(lastAction && /修炼|训练|课程|实战/.test(`${lastAction.intent}${lastAction.action}`)),
      "失败后": Boolean(lastAction && /失败|未通过|受挫|无法完成/.test(`${lastAction.intent}${lastAction.result}`)),
      "受伤时": game.world.healthPoints < 100 || character.injuries.length > 0,
      "疲劳时": game.world.fatiguePoints >= 20,
      "任务中": game.view.tasks.some((item) => item.status === "进行中"),
      "战斗中": Boolean(game.view.combat),
      "调查时": Boolean(lastAction && /调查|研究|鉴定|查证/.test(`${lastAction.intent}${lastAction.action}`)),
      "交易时": Boolean(lastAction && /交易|购买|经营|拍卖|行情/.test(`${lastAction.intent}${lastAction.action}`)),
      "制作时": Boolean(lastAction && /制作|锻造|炼制|修复|实验/.test(`${lastAction.intent}${lastAction.action}`)),
      "旅行时": Boolean(lastAction && /旅行|前往|迁居|行程/.test(`${lastAction.intent}${lastAction.action}`)),
      "关系中": game.view.relations.length > 0 || game.view.npcRelations.length > 0,
      "魂环前": character.soulRank >= 10 && character.soulRings.length < Math.floor(character.soulRank / 10),
      "夜间": /夜|戌|亥|子|丑/.test(game.view.worldTime?.time ?? ""),
      "持有物品": game.view.inventory.length > 0,
      "加入势力": game.view.affiliations.length > 0,
      "重大选择": game.view.tasks.some((item) => item.status === "进行中") || game.world.dynamicEvents.some((item) => item.status === "可介入"),
      "新样本": game.world.metrics.discoveries > 0 || game.world.discoveredLocations.length > 1,
    };
    if (!triggerReady[mechanic.trigger]) return impossible(`${definition.name}尚未满足“${mechanic.trigger}”触发条件。${mechanic.constraint}`, [definition.actionCommand, "继续当前计划", "查看金手指说明"]);
    const ordinal = (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1);
    const cooldownKey = `goldFingerCooldown:${definition.id}`;
    const lastUsed = Number(game.world.flags[cooldownKey] ?? -1_000_000_000);
    if (mechanic.cooldownDays > 0 && ordinal - lastUsed < mechanic.cooldownDays) return impossible(`${definition.name}仍在冷却，还需 ${mechanic.cooldownDays - (ordinal - lastUsed)} 天。`, ["继续当前计划", "等待一天", "查看金手指说明"]);
    if (mechanic.cost === "魂币" && character.coins < 2) return impossible("这次发动需要2枚金魂币，目前余额不足。", ["工作赚钱", "出售物品", "继续当前计划"]);
    if (mechanic.cost === "体力" && game.world.healthPoints <= 25) return impossible("当前身体状态无法支付这次体力代价。", ["休息", "疗伤", "继续当前计划"]);
    if (mechanic.cost === "材料" && materialIndex < 0) return impossible("这次发动需要一份真实材料或样本，行囊中目前没有。", ["调查附近材料", "购买材料", "继续当前计划"]);
    if (mechanic.cost === "魂币") character.coins -= 2;
    if (mechanic.cost === "体力") game.world.healthPoints = Math.max(1, game.world.healthPoints - 6);
    if (mechanic.cost === "疲劳") game.world.fatiguePoints = Math.min(100, game.world.fatiguePoints + 8);
    if (mechanic.cost === "材料") game.view.inventory.splice(materialIndex, 1);
    game.world.flags[cooldownKey] = ordinal;

    const rewardDetails: Record<typeof mechanic.reward, string> = {
      "系统进度": "核心机制得到一次有效验证",
      "潜能": "潜能点 +1",
      "情报": "获得一条待核验的可靠提示",
      "发现": "世界发现 +1",
      "恢复": "身体与精神状态得到小幅恢复",
      "魂币": `获得${formatSoulCoins(3)}`,
      "声望": "相关关系留下正向证据",
      "物品": "获得一份机制产物",
      "训练效率": "下一阶段训练准备 +2",
      "风险标记": "当前风险被标记并写入记录",
    };
    if (mechanic.reward === "潜能") game.world.flags.goldFingerPotentialPoints = Math.min(30, Number(game.world.flags.goldFingerPotentialPoints ?? 0) + 1);
    if (mechanic.reward === "情报" || mechanic.reward === "发现") game.world.metrics.discoveries += 1;
    if (mechanic.reward === "恢复") { game.world.healthPoints = Math.min(100, game.world.healthPoints + 8); game.world.fatiguePoints = Math.max(0, game.world.fatiguePoints - 10); }
    if (mechanic.reward === "魂币") character.coins += 3;
    if (mechanic.reward === "声望") game.world.metrics.relationshipsBuilt += 1;
    if (mechanic.reward === "物品") game.view.inventory.push(`${definition.name}·机制产物`);
    if (mechanic.reward === "训练效率") game.world.trainingPoints += 2;
    if (mechanic.reward === "风险标记") game.world.flags[`goldFingerRisk:${definition.id}`] = `${game.view.location}存在待核验风险`;
    const progress = advanceSystem(mechanic.reward === "系统进度" ? 12 : 7);
    if (progress >= 35 && !system.abilities.includes(`${definition.name}·稳定运转`)) system.abilities.push(`${definition.name}·稳定运转`);
    return {
      intent: `金手指·${definition.name}`,
      minutes: mechanic.cost === "材料" ? 60 : mechanic.cost === "疲劳" ? 30 : 15,
      ruleSummary: `${definition.hint}${rewardDetails[mechanic.reward]}；系统进度${progress}%。边界：${mechanic.constraint}。`,
      fallbackNarrative: `只有我能察觉的${definition.name}短暂展开。它没有替我跳过过程，而是按照已经满足的条件完成了一次结算：${rewardDetails[mechanic.reward]}。那条限制仍清楚地留在最后一行。`,
      suggestions: [definition.actionCommand, "验证本次反馈", "继续当前计划"],
      systemMessages: [`${definition.name} · ${mechanic.trigger} · ${mechanic.reward}`],
    };
  }

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
    "shrek-city": "史莱克学院", "radiant-city": "日月皇家魂导师学院", "heavenly-soul-city": "天魂皇家学院", "dou-ling-city": "斗灵皇家学院",
    "east-sea-city": "东海学院", "mingdu-federal": "明都联邦学院", "mother-ship-port": "联邦星际学院",
  };
  const academyName = academyNameByLocation[game.view.locationId ?? ""] ?? `${game.view.location ?? "当地"}初级魂师学院`;
  if (game.view.affiliations.some((item) => item.name === academyName)) return impossible(`我已经是${academyName}的学员。`, ["参加课程", "寻找导师", "认识同学"]);
  const joinedAt = `${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日`;
  game.view.affiliations.push({ id: `academy-${game.view.locationId}`, name: academyName, role: character.coins < 20 ? "工读生" : "学员", reputation: "新入学", joinedAt, contribution: 0, completedAssignments: 0, rankEvidence: [] });
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
  const eraChoices = {
    1: [
    { pattern: /武魂殿/, id: "spirit-hall", name: "武魂殿", rank: 1 }, { pattern: /七宝/, id: "seven-treasure", name: "七宝琉璃宗", rank: 20 },
    { pattern: /蓝电/, id: "blue-lightning", name: "蓝电霸王龙宗", rank: 20 }, { pattern: /昊天/, id: "clear-sky", name: "昊天宗", rank: 40 },
    { pattern: /史莱克/, id: "shrek", name: "史莱克学院", rank: 20 },
    ],
    2: [
      { pattern: /唐门/, id: "peerless-tang-sect", name: "绝世唐门", rank: 10 }, { pattern: /史莱克|内院/, id: "shrek-inner-court", name: "史莱克学院内院", rank: 30 },
      { pattern: /日月|魂导师/, id: "sun-moon-royal-academy", name: "日月皇家魂导师学院", rank: 10 }, { pattern: /本体宗/, id: "body-sect", name: "本体宗", rank: 30 }, { pattern: /传灵塔/, id: "first-spirit-pagoda", name: "传灵塔", rank: 20 },
    ],
    3: [
      { pattern: /唐门/, id: "d3-tang-sect", name: "两万年唐门", rank: 20 }, { pattern: /传灵塔/, id: "spirit-pagoda", name: "传灵塔", rank: 10 },
      { pattern: /战神殿/, id: "war-god-temple", name: "战神殿", rank: 40 }, { pattern: /史莱克/, id: "shrek-inner-court", name: "史莱克学院内院", rank: 30 },
    ],
    4: [
      { pattern: /第一舰队/, id: "d4-first-fleet", name: "斗罗联邦第一舰队", rank: 20 },
      { pattern: /第二舰队/, id: "d4-second-fleet", name: "斗罗联邦第二舰队", rank: 20 },
      { pattern: /第三舰队/, id: "d4-third-fleet", name: "斗罗联邦第三舰队", rank: 20 },
      { pattern: /第四舰队/, id: "d4-fourth-fleet", name: "斗罗联邦第四舰队", rank: 20 },
      { pattern: /第五舰队/, id: "d4-fifth-fleet", name: "斗罗联邦第五舰队", rank: 20 },
      { pattern: /第六舰队/, id: "d4-sixth-fleet", name: "斗罗联邦第六舰队", rank: 20 },
      { pattern: /第七舰队/, id: "d4-seventh-fleet", name: "斗罗联邦第七舰队", rank: 20 },
      { pattern: /舰队|联邦/, id: "d4-federal-fleet", name: "斗罗联邦舰队", rank: 20 }, { pattern: /史莱克/, id: "shrek-space-command", name: "史莱克星际体系", rank: 20 },
      { pattern: /传灵塔/, id: "spirit-pagoda", name: "传灵塔", rank: 10 }, { pattern: /森罗星|魂兽自治/, id: "senluo-planet", name: "森罗星魂兽自治体系", rank: 20 },
    ],
  } as const;
  const localChoice = { pattern: /宗门|势力|组织|行会|武馆/, id: `local-${game.view.locationId}`, name: localOrganizations[game.view.locationId ?? ""] ?? `${game.view.location ?? "当地"}自由魂师互助队`, rank: 10 };
  const choices = [...eraChoices[game.view.era ?? 1], localChoice];
  const target = choices.find((item) => item.pattern.test(action)) ?? choices.at(-1)!;
  const activeFleet = (game.view.era ?? 1) === 4 && (target.id === "d4-federal-fleet" || /^d4-(?:first|second|third|fourth|fifth|sixth|seventh)-fleet$/.test(target.id));
  if (activeFleet && character.age < 18) return impossible("联邦舰队现役军籍至少要求十八岁；未成年人只能走星际学院、少年训练与受监护模拟课程。", ["申请联邦星际学院", "继续星舰基础训练", "等待达到现役年龄"]);
  const faction = FACTIONS.find((item) => item.id === target.id);
  const year = game.view.worldTime?.year ?? 0;
  if (faction && !factionActiveAtYear(faction, year)) {
    return impossible(`${target.name}在当前时代并不存在。`, ["调查当前时代的公开势力", "寻找当地组织", "查看地图与传闻"]);
  }
  if (game.view.affiliations.some((item) => item.id === target.id)) return impossible(`我已经加入${target.name}。`, ["申请内部任务", "拜访组织成员", "提升组织声望"]);
  if (character.soulRank < target.rank) return impossible(`${target.name}的公开门槛约为 ${target.rank} 级，我当前的实力还不够。`, ["继续修炼", "寻找举荐人", "先完成外围委托"]);
  game.view.affiliations.push({ id: target.id, name: target.name, role: activeFleet ? "现役士兵" : "外围成员", reputation: "生疏", joinedAt: `${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日`, contribution: 0, completedAssignments: 0, rankEvidence: [], ...(activeFleet ? { militaryRank: "列兵" as const, militaryMerit: 0, flightHours: 0 } : {}) });
  game.view.economy.salary = Math.max(game.view.economy.salary, target.rank >= 40 ? 18 : target.rank >= 20 ? 10 : 5);
  game.view.relations.push({ id: target.id, name: target.name, relation: "所属势力", impression: "尚未建立功劳", strength: 10, category: "势力" });
  game.world.deviation += target.rank >= 40 ? 8 : target.rank >= 20 ? 4 : 2;
  if (!target.id.startsWith("local-")) recordCanonInfluence(game, { source: "加入势力", description: `加入${target.name}`, affectedFactionIds: [target.id], strength: target.rank >= 40 ? 8 : target.rank >= 20 ? 5 : 2 });
  ensureTask(game, { id: `faction-${target.id}`, title: `在${target.name}站稳脚跟`, kind: "计划", detail: "完成组织事务，观察内部关系与规矩。", status: "进行中" });
  return { intent: "加入势力", minutes: 360, ruleSummary: `通过初步审核，成为${target.name}${activeFleet ? "列兵" : "外围成员"}。`, fallbackNarrative: `负责登记的人问得很细，连家里做什么都记了。我拿到的牌子只够进外院，背面还有一行小字，损坏要赔。`, suggestions: ["领取第一件事务", "打听内部规矩", "认识同批成员"], systemMessages: [`身份 · ${target.name} · ${activeFleet ? "列兵" : "外围成员"}`] };
}

function institutionAssignmentFor(game: StoredGame, affiliationName: string, request = ""): Pick<InstitutionAssignmentView, "route" | "specialization" | "risk" | "stages"> {
  const era = game.view.era ?? 1;
  if (era === 2 && /魂导|日月/.test(affiliationName)) return { route: "魂导器合规研制", stages: [
    { title: "登记核心阵法方案", detail: "学习并记录与当前等级匹配的核心阵法。", evidenceKeywords: ["核心阵法", "魂导理论"] },
    { title: "取得稀有金属", detail: "通过公开采购或有来源记录的方式取得魂导金属。", evidenceKeywords: ["魂导器用稀有金属", "魂导金属", "稀有金属"] },
    { title: "取得核心晶体", detail: "登记核心晶体的采购与来源。", evidenceKeywords: ["魂导核心晶体", "核心晶体"] },
    { title: "完成原型制作", detail: "实际制作一件合规一级魂导器。", evidenceKeywords: ["制作一级", "制作魂导器", "魂导器制作"] },
    { title: "完成安全复核", detail: "对成品进行实验、测试并记录失败风险。", evidenceKeywords: ["实验测试", "安全测试", "复核魂导器"] },
  ] };
  if (era >= 3 && /传灵塔/.test(affiliationName)) return { route: "魂灵来源与适配审计", stages: [
    { title: "核对魂灵来源", detail: "调查魂灵来源、死亡记录与授权档案。", evidenceKeywords: ["魂灵来源", "魂灵档案", "调查魂灵"] },
    { title: "完成适配评估", detail: "记录精神负担与武魂适配结论。", evidenceKeywords: ["魂灵适配评估", "评估魂灵适配"] },
    { title: "复核契约风险", detail: "调查失败案例、退契与知情同意。", evidenceKeywords: ["魂灵风险", "契约风险", "失败案例"] },
    { title: "提交独立复核", detail: "向另一名工作人员询问并形成第二来源。", evidenceKeywords: ["询问", "交谈", "第二来源"] },
  ] };
  if (era === 3 && /战神/.test(affiliationName)) return { route: "城市巡防与事件复盘", stages: [
    { title: "调查巡防路线", detail: "亲自核对辖区路线与治安风险。", evidenceKeywords: ["巡防路线", "城市治安", "调查当前位置"] },
    { title: "完成战术训练", detail: "留下防守、控制或协同训练记录。", evidenceKeywords: ["战术训练", "协同训练", "防守训练"] },
    { title: "处理现场问题", detail: "实际调查或介入一项地方事件。", evidenceKeywords: ["介入世界事件", "调查世界事件", "处理事件"] },
    { title: "提交巡防复盘", detail: "复核经过、损失和未解决风险。", evidenceKeywords: ["巡防复盘", "事件复盘", "复核报告"] },
  ] };
  if (era === 4 && /舰队/.test(affiliationName)) return { route: "舰桥值勤与真实航次", stages: [
    { title: "完成舰桥模拟", detail: "留下损管、航线和撤离模拟记录。", evidenceKeywords: ["星舰指挥训练", "舰桥模拟"] },
    { title: "完成船员协同", detail: "与驾驶、导航或轮机岗位完成协同。", evidenceKeywords: ["船员协同", "招募星舰船员", "舰员协同"] },
    { title: "取得真实航时", detail: "参加有签字记录的随舰航次，模拟时长不算。", evidenceKeywords: ["随舰训练航次", "真实飞行"] },
    { title: "完成航行任务", detail: "驾驶登记星舰完成一次实际航线。", evidenceKeywords: ["星际航行", "驾驶星舰"] },
    { title: "提交值勤复盘", detail: "复核航时、故障、补给和船员记录。", evidenceKeywords: ["值勤复盘", "航次复盘", "复核航行"] },
  ] };
  if (era === 4 && /星际|史莱克/.test(affiliationName)) return { route: "星际学院综合考核", stages: [
    { title: "完成基础驾驶课程", detail: "完成受监护的舰桥模拟。", evidenceKeywords: ["星舰指挥训练", "舰桥模拟"] },
    { title: "复盘模拟事故", detail: "调查并复核一次模拟中的错误。", evidenceKeywords: ["复盘模拟", "模拟事故"] },
    { title: "完成团队协同", detail: "留下船员岗位协同记录。", evidenceKeywords: ["船员协同", "舰员协同", "招募星舰船员"] },
    { title: "提交课程报告", detail: "复核课程、风险与下一阶段资格。", evidenceKeywords: ["课程报告", "训练复盘", "资格复核"] },
  ] };
  const soulProfile = `${game.view.character?.martialSoul.name ?? ""}${game.view.character?.martialSoul.category ?? ""}${game.view.character?.martialSoul.description ?? ""}`;
  const specialization = /支援|后勤|救护|治疗/.test(request) ? "支援" : /情报|侦察|调查/.test(request) ? "情报" : /外勤|护送|战斗|巡防/.test(request) ? "外勤" : /辅助|治疗|食物|琉璃|恢复/.test(soulProfile) ? "支援" : /精神|控制|敏攻|速度|侦察|隐匿/.test(soulProfile) ? "情报" : "外勤";
  if (specialization === "支援") return { route: `${affiliationName}后勤救护线`, specialization, risk: "物资损耗与救护疏漏会保留在事务记录中", stages: [
    { title: "核对支援需求", detail: "调查人员、补给和治疗需求，不能只按名册估算。", evidenceKeywords: ["调查补给", "询问伤员", "救护需求", "后勤需求"] },
    { title: "取得可追踪物资", detail: "采购、制作或领取有来源记录的补给。", evidenceKeywords: ["购买", "制作", "领取补给", "药材"] },
    { title: "完成现场支援", detail: "实际治疗、补给或掩护任务对象。", evidenceKeywords: ["治疗", "救助", "补给", "掩护"] },
    { title: "复核消耗与遗漏", detail: "检查物资去向、伤情变化和未解决风险。", evidenceKeywords: ["复核救护", "检查物资", "后勤报告", "伤情复盘"] },
  ] };
  if (specialization === "情报") return { route: `${affiliationName}情报与风险核验线`, specialization, risk: "错误判断不会转化为贡献，失败记录仍保留", stages: [
    { title: "明确情报问题", detail: "调查委托对象、信息时效和知识边界。", evidenceKeywords: ["调查目标", "调查情报", "询问线索", "核对传闻"] },
    { title: "取得第一来源", detail: "亲自观察、询问或查阅一项可追踪来源。", evidenceKeywords: ["观察", "询问", "查阅", "取得证据"] },
    { title: "完成独立复核", detail: "用不同见证者或档案交叉核对，不能重复使用上一来源。", evidenceKeywords: ["独立复核", "第二来源", "交叉核验", "调查现场记录"] },
    { title: "提交限知报告", detail: "区分已证实、推测和未知内容。", evidenceKeywords: ["情报报告", "风险报告", "限知报告", "复核报告"] },
  ] };
  return { route: `${affiliationName}外勤守护线`, specialization: "外勤" as const, risk: "伤势、疲劳和任务失败不会因组织验收而撤销", stages: [
    { title: "调查外勤环境", detail: "核对路线、对象和公开风险。", evidenceKeywords: ["调查路线", "调查环境", "巡防路线", "询问风险"] },
    { title: "完成针对性训练", detail: "根据风险留下防守、控制、协同或战斗训练记录。", evidenceKeywords: ["战术训练", "防守训练", "协同训练", "战斗训练"] },
    { title: "执行现场任务", detail: "实际护送、巡防、救助或介入事件。", evidenceKeywords: ["护送", "巡防", "救助", "介入世界事件"] },
    { title: "复盘代价与余患", detail: "记录伤势、损失和仍未排除的风险。", evidenceKeywords: ["外勤复盘", "战斗复盘", "检查伤势", "风险报告"] },
  ] };
}

function institutionReviewerFor(affiliation: StoredGame["view"]["affiliations"][number], assignment: Pick<InstitutionAssignmentView, "route" | "specialization">): NonNullable<InstitutionAssignmentView["reviewer"]> {
  const profiles: Array<[RegExp, string, string, string]> = [
    [/七宝琉璃/, "沈璧", "宗产复核执事", "任何支援都必须对得上受援者、物资去向和宗门账册"],
    [/昊天/, "唐峤", "封山戒律执事", "个人功劳不能越过封山戒律与宗族旧案"],
    [/象甲/, "呼延硕", "内门考功执事", "口头勇武不算功绩，伤损与撤退同样必须入册"],
    [/唐门/, "叶衡", "机括验收执事", "暗器、魂导与情报成果必须区分图纸来源和实际复现"],
    [/本体宗/, "程骁", "传承考核执事", "身体代价和二次觉醒风险不能被训练成绩掩盖"],
    [/日月|魂导/, "明序", "安全审查员", "核心阵法、材料批次和失败实验必须形成完整责任链"],
    [/传灵塔/, "冷澄", "魂灵来源复核员", "魂灵授权、死亡记录和知情同意必须来自不同档案"],
    [/战神/, "岳临", "巡防考功官", "训练成绩不能替代现场处置与损失复盘"],
    [/舰队/, "周砺", "值勤考评参谋", "模拟、真实航时和船员签字必须分账"],
    [/星际|史莱克/, "林珩", "课程答辩官", "个人高分不能替代团队协同和事故复盘"],
  ];
  const matched = profiles.find(([pattern]) => pattern.test(affiliation.name));
  const fallbackNames = ["顾谨", "苏衡", "陆简", "程砚"];
  const fallbackName = fallbackNames[[...affiliation.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % fallbackNames.length];
  const [name, role, stance] = matched ? matched.slice(1) as [string, string, string] : [fallbackName, `${assignment.specialization ?? "事务"}复核执事`, `只认可领取当前阶段后形成的${assignment.route}行动证据`];
  return { name, role, stance, trust: 50, objections: 0, meetings: 0, evidence: [`受命复核${assignment.route}`] };
}

function institutionFactionProfileFor(affiliationName: string, route: string): { factions: NonNullable<InstitutionAssignmentView["factions"]>; counterReviewer: NonNullable<InstitutionAssignmentView["counterReviewer"]> } {
  const profiles: Array<[RegExp, string, string, string, string, string, string]> = [
    [/七宝琉璃/, "宗产审计派", "账册、物资去向与长期宗产安全", "外务应变派", "现场救助、时效与成员自主处置", "宁衡", "外务复核执事"],
    [/昊天/, "封山戒律派", "宗族戒律、旧案与风险隔离", "复出实务派", "外界责任、现实成果与逐步复出", "唐岑", "外务考功执事"],
    [/象甲/, "内门考功派", "伤损、纪律与可量化功绩", "实战磨砺派", "现场承压、战术适应与成员成长", "呼延岚", "实战复核执事"],
    [/唐门/, "技术溯源派", "图纸来源、可复现性与技术边界", "外勤应用派", "实用效果、交付时效与现场适配", "苏机", "外勤验收执事"],
    [/本体宗/, "传承安全派", "身体代价、知情同意与传承责任", "极限突破派", "承压记录、突破价值与个体选择", "程岳", "实训复核执事"],
    [/日月|魂导/, "安全审查组", "材料批次、失败实验与责任追溯", "工程推进组", "原型可用性、进度与资源效率", "明策", "工程验收员"],
    [/传灵塔/, "来源合规组", "魂灵来源、授权与死亡档案分离", "适配服务组", "精神负担、契合效果与服务可及性", "许遥", "适配复核员"],
    [/战神/, "考功纪律组", "训练、现场处置与损失分账", "前线处置组", "响应速度、救援结果与战术弹性", "岳岚", "前线复盘官"],
    [/舰队/, "值勤考评组", "航时、签字、军功与模拟分账", "前线指挥组", "任务结果、船员判断与战场时效", "周策", "作战复核参谋"],
    [/星际|史莱克/, "课程标准组", "课程证据、事故复盘与资格边界", "实训协同组", "团队表现、临场判断与成长潜力", "林遥", "实训答辩官"],
  ];
  const matched = profiles.find(([pattern]) => pattern.test(affiliationName));
  const [, primaryName, primaryPriority, counterName, counterPriority, reviewerName, reviewerRole] = matched ?? [/./, "制度审计组", "档案完整、责任清晰与规则一致", "现场实务组", "真实结果、时效与执行弹性", "季衡", "独立复核执事"];
  return {
    factions: [
      { name: primaryName, priority: primaryPriority, influence: 50, playerTrust: 0, evidence: [`主张按“${primaryPriority}”复核${route}`] },
      { name: counterName, priority: counterPriority, influence: 50, playerTrust: 0, evidence: [`主张按“${counterPriority}”复核${route}`] },
    ],
    counterReviewer: { name: reviewerName, role: reviewerRole, stance: `不能只看主审口径，还必须核对${counterPriority}`, factionName: counterName, trust: 50, objections: 0, meetings: 0, evidence: [`受命独立复核${route}`] },
  };
}

function cloneInstitutionFactions(factions: NonNullable<InstitutionAssignmentView["factions"]>): NonNullable<InstitutionAssignmentView["factions"]> {
  return factions.map((faction) => ({ ...faction, evidence: [...faction.evidence] }));
}

function syncInstitutionPolitics(affiliation: StoredGame["view"]["affiliations"][number], chain: InstitutionAssignmentView, history?: string): void {
  if (chain.factions) affiliation.institutionFactions = cloneInstitutionFactions(chain.factions);
  affiliation.institutionPoliticalHistory ??= [];
  if (history) affiliation.institutionPoliticalHistory.push(history);
  affiliation.institutionPoliticalHistory = affiliation.institutionPoliticalHistory.slice(-20);
}

function institutionResolution(game: StoredGame, action: string): ActionResolution {
  const affiliation = game.view.affiliations.find((item) => action.includes(item.name)) ?? game.view.affiliations[0];
  if (!affiliation) return impossible("我还没有任何能够发放正式事务的在册机构身份。", ["加入当地机构", "申请学院", "先完成外围委托"]);
  affiliation.contribution ??= 0;
  affiliation.completedAssignments ??= 0;
  affiliation.rankEvidence ??= [];
  const active = game.view.tasks.find((task) => task.id?.startsWith(`institution-${affiliation.id}-`) && task.status === "进行中");
  if (/协调.*(?:派系|复核|验收)|联合复核|共同复核/.test(action)) {
    const chain = active?.institutionAssignment;
    if (!active || !chain?.reviewer || !chain.counterReviewer || !chain.factions) return impossible(`${affiliation.name}当前没有需要双复核协调的在册事务。`, ["领取机构事务", "查看复核人", "询问验收边界"]);
    if (chain.conflictStatus !== "待复核") return impossible(`当前复核冲突状态为“${chain.conflictStatus ?? "未触发"}”，不能重复生成协调结果。`, ["推进机构事务", "询问两名复核人", "查看派系记录"]);
    if (chain.reviewer.meetings < 1 || chain.counterReviewer.meetings < 1) return impossible("共同协调前必须分别询问主审与独立复核人的具体异议，不能替任何一方预设立场。", [`询问${chain.reviewer.name}当前验收异议`, `询问${chain.counterReviewer.name}当前验收异议`, "查看已有证据"]);
    if ((active.progressEvidence?.length ?? 0) < 2) return impossible("共同复核至少需要两个不同阶段的行动证据；会议不能替代实际履约。", ["继续完成机构事务阶段", "核对阶段证据", "暂缓协调"]);
    chain.conflictStatus = "已协调";
    chain.playerAlignment = undefined;
    chain.resolutionEvidence ??= [];
    const resolution = `${game.view.worldTime?.year ?? 0}年第${game.view.worldTime?.day ?? 1}日：双方基于${active.progressEvidence!.length}条阶段证据签署联合复核边界`;
    chain.resolutionEvidence.push(resolution);
    chain.reviewer.trust = Math.min(100, chain.reviewer.trust + 3);
    chain.counterReviewer.trust = Math.min(100, chain.counterReviewer.trust + 3);
    for (const faction of chain.factions) { faction.playerTrust += 2; faction.evidence.push(resolution); }
    syncInstitutionPolitics(affiliation, chain, resolution);
    return { intent: "协调机构派系", minutes: 120, ruleSummary: `${chain.reviewer.factionName}与${chain.counterReviewer.factionName}基于${active.progressEvidence!.length}条阶段证据完成联合复核；冲突转为“已协调”，没有删除任何一方异议，也没有替代剩余阶段。`, fallbackNarrative: "两份批注摊在同一张桌上。我先逐条读出彼此真正冲突的地方，再把已经做过的行动记录放到中间。没有人撤回立场，但双方终于在一条可执行的验收边界上共同签名。", suggestions: ["继续完成剩余阶段", `向${affiliation.name}推进机构事务`, "查看联合复核记录"] };
  }
  if (/支持|采纳|站在|选择.*(?:派|组)|按.*意见/.test(action)) {
    const chain = active?.institutionAssignment;
    if (!active || !chain?.reviewer || !chain.counterReviewer || !chain.factions || chain.conflictStatus !== "待复核") return impossible("当前没有可以明确站队处理的机构复核冲突。", ["推进机构事务", "询问两名复核人", "查看派系立场"]);
    const selected = chain.factions.find((faction) => action.includes(faction.name));
    if (!selected) return impossible("必须明确写出支持的机构派系名称；系统不会替玩家选择立场。", chain.factions.map((faction) => `支持${faction.name}`));
    const other = chain.factions.find((faction) => faction.name !== selected.name)!;
    chain.conflictStatus = "保留分歧";
    chain.playerAlignment = selected.name;
    chain.resolutionEvidence ??= [];
    const resolution = `${game.view.worldTime?.year ?? 0}年第${game.view.worldTime?.day ?? 1}日：明确采纳${selected.name}口径，${other.name}保留异议`;
    chain.resolutionEvidence.push(resolution);
    selected.playerTrust += 5;
    selected.influence = Math.min(100, selected.influence + 2);
    selected.evidence.push(resolution);
    other.playerTrust -= 4;
    other.evidence.push(resolution);
    const alignedReviewer = chain.reviewer.factionName === selected.name ? chain.reviewer : chain.counterReviewer;
    const dissentingReviewer = alignedReviewer === chain.reviewer ? chain.counterReviewer : chain.reviewer;
    alignedReviewer.trust = Math.min(100, alignedReviewer.trust + 4);
    dissentingReviewer.trust = Math.max(0, dissentingReviewer.trust - 4);
    dissentingReviewer.objections += 1;
    dissentingReviewer.evidence.push(`对${resolution}保留书面异议`);
    syncInstitutionPolitics(affiliation, chain, resolution);
    return { intent: "选择机构派系立场", minutes: 60, ruleSummary: `明确采纳${selected.name}的“${selected.priority}”口径；${other.name}保留书面分歧。任务可以继续，但最终贡献会因未形成共同复核而扣减。`, fallbackNarrative: "我没有把选择包装成所有人都满意。支持的一方收下签字，另一方把异议钉在档案末页；这会影响以后谁愿意替我说话，也会跟着任务进入最终验收。", suggestions: ["继续完成剩余阶段", "查看保留异议", "承担站队后的验收后果"] };
  }
  if (/询问.*(?:异议|验收|复核)|协商.*(?:验收|复核)|查看.*(?:复核人|验收人)/.test(action)) {
    const chain = active?.institutionAssignment;
    const reviewer = chain?.counterReviewer && (action.includes(chain.counterReviewer.name) || action.includes(chain.counterReviewer.factionName ?? "不存在派系")) ? chain.counterReviewer : chain?.reviewer;
    if (!active || !chain || !reviewer) return impossible(`${affiliation.name}当前没有带具名复核人的在册事务。`, ["领取机构事务", "查看当前任务", "核对所属机构"]);
    const stage = chain.stages[chain.stageIndex];
    reviewer.meetings += 1;
    reviewer.evidence.push(`第${chain.stageIndex + 1}阶段当面说明验收边界：${stage?.title ?? "最终交付"}`);
    reviewer.evidence = reviewer.evidence.slice(-12);
    return { intent: "与机构复核人协商", minutes: 45, ruleSummary: `${reviewer.role}${reviewer.name}代表${reviewer.factionName ?? "机构验收方"}说明立场：“${reviewer.stance}”。当前异议${reviewer.objections}次、信任${reviewer.trust}；${stage ? `阶段“${stage.title}”仍需${stage.evidenceKeywords.join("、")}之一的后续成功行动` : "全部阶段已登记，等待最终交付"}。`, fallbackNarrative: `${reviewer.name}没有把异议收回，只把缺的那一栏指给我看。谈话让验收边界更清楚，却没有替代现场行动，也没有凭空多出一枚印章。`, suggestions: chain?.conflictStatus === "待复核" && chain.counterReviewer ? [`询问${reviewer === chain.reviewer ? chain.counterReviewer.name : chain.reviewer!.name}当前验收异议`, "提交共同复核协调方案", "明确选择一个派系立场"] : stage ? [stage.detail, `完成${stage.title}要求`, `向${affiliation.name}推进机构事务`] : [`向${affiliation.name}交付机构事务`, "复核全部阶段证据", "准备最终答辩"] };
  }
  if (/领取|申请.*任务|申请.*事务/.test(action) && !/晋升/.test(action)) {
    if (active) return impossible(`${affiliation.name}已有一项未交付事务：${active.title}。`, [`处理${active.title}`, `核对${active.title}的验收条件`, "放弃或说明失败原因"]);
    const assignment = institutionAssignmentFor(game, affiliation.name, action);
    const reviewer = institutionReviewerFor(affiliation, assignment);
    const factionProfile = institutionFactionProfileFor(affiliation.name, assignment.route);
    if (affiliation.institutionFactions?.length === factionProfile.factions.length && factionProfile.factions.every((faction) => affiliation.institutionFactions!.some((saved) => saved.name === faction.name))) factionProfile.factions = cloneInstitutionFactions(affiliation.institutionFactions);
    reviewer.factionName = factionProfile.factions[0].name;
    reviewer.trust = Math.max(0, Math.min(100, reviewer.trust + factionProfile.factions[0].playerTrust));
    factionProfile.counterReviewer.trust = Math.max(0, Math.min(100, factionProfile.counterReviewer.trust + factionProfile.factions[1].playerTrust));
    ensureTask(game, { id: `institution-${affiliation.id}-${game.actionIndex}`, title: assignment.route, kind: "计划", detail: `当前阶段 1/${assignment.stages.length}：${assignment.stages[0].title}；${assignment.stages[0].detail}`, status: "进行中", ownerId: affiliation.id, institutionAssignment: { route: assignment.route, specialization: assignment.specialization, risk: assignment.risk, stageIndex: 0, stageStartedActionIndex: game.actionIndex, stages: assignment.stages, reviewer, counterReviewer: factionProfile.counterReviewer, factions: factionProfile.factions, conflictStatus: "未触发", resolutionEvidence: [] } });
    return { intent: "领取机构事务", minutes: 30, ruleSummary: `从${affiliation.name}领取“${assignment.route}”共 ${assignment.stages.length} 个阶段${assignment.specialization ? `；分支为${assignment.specialization}` : ""}${assignment.risk ? `；失败代价：${assignment.risk}` : ""}。${reviewer.role}${reviewer.name}代表${reviewer.factionName}主审，${factionProfile.counterReviewer.role}${factionProfile.counterReviewer.name}代表${factionProfile.counterReviewer.factionName}独立复核；当前尚无冲突。当前为“${assignment.stages[0].title}”，尚未获得贡献或报酬。`, fallbackNarrative: `事务牌不再只有一句结果。${reviewer.name}把每一段的开始时间、验收关键词和责任签字逐项标出，独立复核人的名字也在末页；前一页没盖章，后一页就不能假装已经做完。`, suggestions: [assignment.stages[0].detail, `询问${reviewer.name}的验收异议`, `查看${factionProfile.counterReviewer.name}的复核立场`] };
  }
  if (/推进|登记.*阶段|提交.*阶段/.test(action) && !/晋升/.test(action)) {
    if (!active?.institutionAssignment) return impossible(`${affiliation.name}没有可以逐阶段推进的在册事务链。`, ["领取机构事务", "查看当前任务", "核对所属机构"]);
    const chain = active.institutionAssignment;
    const stage = chain.stages[chain.stageIndex];
    if (!stage) return impossible("所有阶段已经登记完成，应进入最终交付而不是重复推进。", [`向${affiliation.name}交付机构事务`, "核对全部阶段证据", "查看报酬条件"]);
    const attempts = game.world.actionLedger.filter((entry) => entry.index > chain.stageStartedActionIndex && stage.evidenceKeywords.some((keyword) => `${entry.action}${entry.intent}${entry.result}`.includes(keyword)));
    const evidence = attempts.filter((entry) => !["领取机构事务", "推进机构事务", "交付机构事务", "一般行动", "无法完成", "规则阻止"].includes(entry.intent) && !/失败|无法完成|缺少/.test(entry.result));
    if (!evidence.length) {
      if (chain.reviewer) {
        chain.reviewer.objections += 1;
        chain.reviewer.trust = Math.max(0, chain.reviewer.trust - 2);
        chain.reviewer.evidence.push(`驳回第${chain.stageIndex + 1}阶段：${attempts.length ? "行动失败或证据不匹配" : "没有领取阶段后的行动收据"}`);
        chain.reviewer.evidence = chain.reviewer.evidence.slice(-12);
      }
      return impossible(attempts.length ? `阶段“${stage.title}”已有行动尝试，但结果失败或不满足验收；消耗和失败记录保留，阶段不会推进。` : `阶段“${stage.title}”缺少领取该阶段后的真实行动记录；需要：${stage.evidenceKeywords.join("、")}。`, [stage.detail, chain.reviewer ? `询问${chain.reviewer.name}的验收异议` : "完成要求后再登记阶段", "核对行动收据"]);
    }
    const proof = evidence.at(-1)!;
    active.progressEvidence ??= [];
    active.progressEvidence.push(`${stage.title}：${proof.action}（${proof.intent}）`);
    if (chain.reviewer) {
      chain.reviewer.trust = Math.min(100, chain.reviewer.trust + 2);
      chain.reviewer.evidence.push(`通过第${chain.stageIndex + 1}阶段：${proof.action}`);
      chain.reviewer.evidence = chain.reviewer.evidence.slice(-12);
    }
    chain.stageIndex += 1;
    chain.stageStartedActionIndex = game.actionIndex;
    let conflictNotice = "";
    if (chain.conflictStatus === "未触发" && chain.counterReviewer && chain.factions && chain.stageIndex >= Math.ceil(chain.stages.length / 2)) {
      chain.conflictStatus = "待复核";
      chain.counterReviewer.objections += 1;
      chain.counterReviewer.evidence.push(`在第${chain.stageIndex}阶段后提出独立复核：现有证据尚未同时覆盖“${chain.factions[1].priority}”`);
      chain.resolutionEvidence ??= [];
      chain.resolutionEvidence.push(`第${chain.stageIndex}阶段触发${chain.factions[0].name}与${chain.factions[1].name}复核冲突`);
      conflictNotice = `；${chain.counterReviewer.name}代表${chain.counterReviewer.factionName}提出独立异议，冲突状态转为“待复核”`;
    }
    const next = chain.stages[chain.stageIndex];
    active.detail = next ? `当前阶段 ${chain.stageIndex + 1}/${chain.stages.length}：${next.title}；${next.detail}` : `全部 ${chain.stages.length} 个阶段已登记，等待最终交付与独立验收。`;
    return { intent: "推进机构事务", minutes: 45, ruleSummary: `${affiliation.name}核验“${stage.title}”的行动收据并登记通过；进度 ${chain.stageIndex}/${chain.stages.length}${next ? `，下一阶段为“${next.title}”` : "，可以最终交付"}${conflictNotice}。`, fallbackNarrative: `验收人没有听我概述，而是翻到行动发生后的那一页，对上时间、对象和结果才盖章。下一页随即露出来；独立复核意见若已出现，也不会因主审盖章自动消失。`, suggestions: chain.conflictStatus === "待复核" && chain.counterReviewer ? [`询问${chain.reviewer!.name}当前验收异议`, `询问${chain.counterReviewer.name}当前验收异议`, "提交共同复核协调方案"] : next ? [next.detail, `向${affiliation.name}推进机构事务`, "查看阶段证据"] : [`向${affiliation.name}交付机构事务`, "复核全部记录", "准备最终答辩"] };
  }
  if (/完成|交付|验收/.test(action)) {
    if (!active) return impossible(`${affiliation.name}没有等待交付的在册事务。`, ["领取机构事务", "查看任务", "询问内部规矩"]);
    if (active.institutionAssignment && active.institutionAssignment.stageIndex < active.institutionAssignment.stages.length) {
      const stage = active.institutionAssignment.stages[active.institutionAssignment.stageIndex];
      return impossible(`“${active.title}”尚未完成全部阶段，当前 ${active.institutionAssignment.stageIndex}/${active.institutionAssignment.stages.length}；下一阶段是“${stage.title}”。`, [stage.detail, `向${affiliation.name}推进机构事务`, "查看行动收据"]);
    }
    if (active.institutionAssignment?.conflictStatus === "待复核") return impossible("全部阶段虽已登记，但主审与独立复核仍处于“待复核”冲突；必须共同协调或明确承担站队后的保留异议。", ["分别询问两名复核人", "提交共同复核协调方案", "明确支持一个派系"]);
    const evidencePattern = /魂导器/.test(active.title) ? /魂导|核心阵法|制作|实验/ : /魂灵/.test(active.title) ? /魂灵|适配|来源|档案/ : /巡防/.test(active.title) ? /巡防|调查|战斗|治安/ : /舰桥/.test(active.title) ? /舰桥|星舰|船员|指挥|模拟/ : /事务/.test(active.title) ? /工作|调查|介入|护送|处理/ : new RegExp(active.title.slice(0, 8));
    const evidence = active.institutionAssignment ? active.progressEvidence ?? [] : game.world.actionLedger.filter((entry) => entry.index > (active.createdActionIndex ?? -1) && !["领取机构事务", "交付机构事务", "一般行动", "无法完成", "规则阻止"].includes(entry.intent) && evidencePattern.test(`${entry.action}${entry.intent}${entry.result}`));
    if (!evidence.length) return impossible(`“${active.title}”缺少领取后的可核验行动记录。`, [`实际处理${active.title}`, "收集制作、巡防或训练记录", "核对验收条件"]);
    active.status = "完成";
    if (active.institutionAssignment?.reviewer) {
      active.institutionAssignment.reviewer.trust = Math.min(100, active.institutionAssignment.reviewer.trust + 3);
      active.institutionAssignment.reviewer.evidence.push(`签署${active.title}最终验收`);
    }
    if (!active.institutionAssignment) active.progressEvidence = evidence.slice(-3).map((entry) => typeof entry === "string" ? entry : `${entry.action}（${entry.result}）`);
    const coordinated = active.institutionAssignment?.conflictStatus === "已协调";
    const dissentPenalty = active.institutionAssignment?.conflictStatus === "保留分歧" ? 2 : 0;
    const contribution = Math.max(1, Math.min(20, 8 + evidence.length * 2 + (coordinated ? 2 : 0)) - dissentPenalty);
    affiliation.contribution += contribution;
    affiliation.completedAssignments += 1;
    if (affiliation.militaryRank) affiliation.militaryMerit = (affiliation.militaryMerit ?? 0) + contribution;
    affiliation.reputation = affiliation.contribution >= 50 ? "有稳定功绩" : affiliation.contribution >= 20 ? "受到认可" : "完成过事务";
    const reward = Math.max(3, Math.round((game.view.era ?? 1) * 4 + contribution / 2));
    game.view.character!.coins += reward;
    recordEconomyTransaction(game, "收入", reward, affiliation.name, `${active.title}验收报酬`);
    let ascensionReward = "";
    if (/传灵塔/.test(affiliation.name) && game.view.spiritAscensionMembership) {
      const membership = game.view.spiritAscensionMembership;
      const taskPoints = Math.max(8, contribution);
      membership.taskPoints = (membership.taskPoints ?? 0) + taskPoints;
      membership.authorizationEvidence ??= [];
      membership.authorizationEvidence.push(`${game.view.worldTime?.year ?? 0}年：${active.title}验收，任务点 +${taskPoints}`);
      membership.authorizationEvidence = membership.authorizationEvidence.slice(-20);
      ascensionReward = `；传灵塔任务点 +${taskPoints}`;
    }
    if (active.institutionAssignment) syncInstitutionPolitics(affiliation, active.institutionAssignment, `${game.view.worldTime?.year ?? 0}年第${game.view.worldTime?.day ?? 1}日：${active.title}完成交付（${active.institutionAssignment.conflictStatus ?? "旧制单审"}）`);
    return { intent: "交付机构事务", minutes: 60, ruleSummary: `${affiliation.name}依据${evidence.length}条行动证据验收“${active.title}”，${coordinated ? "双复核已协调" : active.institutionAssignment?.conflictStatus === "保留分歧" ? `按${active.institutionAssignment.playerAlignment}口径交付并保留另一方异议` : "按单一验收链交付"}；贡献 +${contribution}，获得${formatSoulCoins(reward)}${ascensionReward}。`, fallbackNarrative: `验收人没有听我复述结果，而是把行动记录、成品或值勤签名逐项对过。最后一个章落下，派系协调或保留异议也随档案一同封存；报酬和贡献分别记进两本账。`, suggestions: ["申请下一项事务", "查看贡献与岗位", "申请晋升"] };
  }
  if (/晋升|升职|转正/.test(action)) {
    if (affiliation.militaryRank) {
      const ranks = [
        { rank: "列兵", next: "下士", merit: 20, assignments: 2, hours: 50 }, { rank: "下士", next: "中士", merit: 50, assignments: 4, hours: 150 },
        { rank: "中士", next: "少尉", merit: 100, assignments: 7, hours: 400 }, { rank: "少尉", next: "中尉", merit: 180, assignments: 10, hours: 800 },
        { rank: "中尉", next: "上尉", merit: 280, assignments: 14, hours: 1_400 }, { rank: "上尉", next: "少校", merit: 420, assignments: 20, hours: 2_200 },
        { rank: "少校", next: "中校", merit: 650, assignments: 28, hours: 3_500 }, { rank: "中校", next: "上校", merit: 950, assignments: 38, hours: 5_000 },
        { rank: "上校", next: "大校", merit: 1_350, assignments: 50, hours: 7_000 }, { rank: "大校", next: "少将", merit: 2_000, assignments: 70, hours: 10_000 },
      ] as const;
      const rankStep = ranks.find((item) => item.rank === affiliation.militaryRank);
      if (!rankStep) return impossible("少将以上晋升不属于普通机构事务自动结算范围，需要舰队级任命与战略军功。", ["承担舰队级任务", "维持当前军衔职责", "申请指挥岗位评审"]);
      const merit = affiliation.militaryMerit ?? 0;
      const hours = affiliation.flightHours ?? 0;
      if (merit < rankStep.merit || affiliation.completedAssignments < rankStep.assignments || hours < rankStep.hours) return impossible(`晋升${rankStep.next}需要军功 ${rankStep.merit}、验收任务 ${rankStep.assignments} 项、真实飞行 ${rankStep.hours} 小时；当前 ${merit} / ${affiliation.completedAssignments} / ${hours}。`, ["领取舰队事务", "参加随舰训练航次", "积累真实飞行时间"]);
      affiliation.militaryRank = rankStep.next;
      affiliation.role = ["下士", "中士"].includes(rankStep.next) ? "现役士官" : "现役军官";
      affiliation.rankEvidence.push(`${game.view.worldTime?.year ?? 0}年第${game.view.worldTime?.day ?? 1}日：凭${merit}军功、${affiliation.completedAssignments}项任务与${hours}小时飞行晋升${rankStep.next}`);
      return { intent: "军衔晋升", minutes: 180, ruleSummary: `${affiliation.name}核验能力、军功、任务与真实飞行时长后，军衔晋升为${rankStep.next}。`, fallbackNarrative: `模拟成绩没有被算成真实航时，普通贡献也没有冒充军功。四本记录逐项核完，新军衔才写进军籍。`, suggestions: ["查看新岗位权限", "领取舰队事务", "继续积累飞行时长"], systemMessages: [`军衔 · ${rankStep.next}`] };
    }
    const steps = [{ role: "外围成员", next: "正式成员", need: 20, assignments: 2 }, { role: "正式成员", next: "骨干成员", need: 50, assignments: 4 }, { role: "骨干成员", next: "核心成员", need: 90, assignments: 7 }] as const;
    const step = steps.find((item) => item.role === affiliation.role);
    if (!step) return impossible(`${affiliation.role}没有可由日常事务自动取得的更高公开岗位。`, ["承担关键机构任务", "申请专业岗位", "维持现有职责"]);
    if (affiliation.contribution < step.need || affiliation.completedAssignments < step.assignments) return impossible(`晋升${step.next}需要贡献 ${step.need} 且完成 ${step.assignments} 项事务；当前为 ${affiliation.contribution} / ${affiliation.completedAssignments}。`, ["领取机构事务", "完成当前任务", "查看贡献记录"]);
    affiliation.role = step.next;
    affiliation.rankEvidence.push(`${game.view.worldTime?.year ?? 0}年第${game.view.worldTime?.day ?? 1}日：凭${affiliation.contribution}贡献与${affiliation.completedAssignments}项验收事务晋升${step.next}`);
    game.view.economy.salary = Math.max(game.view.economy.salary, step.next === "核心成员" ? 30 : step.next === "骨干成员" ? 18 : 10);
    return { intent: "机构晋升", minutes: 120, ruleSummary: `${affiliation.name}依据贡献与已验收事务将岗位晋升为${step.next}，证据写入履历。`, fallbackNarrative: `这次换牌子不是一句口头认可。旧牌、任务册和贡献页摆在一起核过，新岗位对应的职责也当面念清。`, suggestions: ["查看新职责", "领取岗位任务", "认识同级成员"], systemMessages: [`身份 · ${affiliation.name} · ${step.next}`] };
  }
  return impossible("机构行动需要明确领取、交付或申请晋升。", ["领取机构事务", "交付当前事务", "申请晋升"]);
}

function mentorResolution(game: StoredGame, action: string): ActionResolution {
  const mentioned = CANON_CHARACTERS.find((item) => action.includes(item.name) || item.aliases.some((alias) => action.includes(alias)));
  const npc = mentioned ? game.world.npcs[mentioned.id] : undefined;
  if (mentioned?.hidden && !canDiscoverNpc(game, mentioned.id)) return impossible("无法确认这个名字对应现实中的哪一位导师。", ["调查名字来源", "寻找当地导师", "先积累可信线索"]);
  if (mentioned && npc?.locationId !== game.view.locationId) return impossible(`${mentioned.name}目前不在这里，连当面提出请求的机会都没有。`, [`打听${mentioned.name}的行踪`, "寻找当地导师", "先证明自己的能力"]);
  const mentorName = mentioned?.name ?? `${game.view.location ?? "当地"}散修 ${pick(actionRandom(game), ["顾闻山", "周砺", "林鹤", "沈秋岩"])}`;
  const existing = game.view.relations.find((item) => item.name === mentorName);
  const trust = npc?.dispositionToPlayer ?? (existing ? 8 : 0);
  if (mentioned && trust < 6) {
    rememberNpcInteraction(game, npc!, "曾经提出拜师，但彼此了解不足");
    return impossible(`${mentorName}没有立刻答应，只让我先证明耐心和判断。`, [`完成${mentorName}关心的事情`, `继续向${mentorName}请教`, "寻找其他导师"]);
  }
  if (existing) { existing.relation = "师徒"; existing.impression = "愿意认真指导，但仍会考察每次选择"; existing.strength = Math.max(45, existing.strength ?? 0); existing.category = "师友"; recordPlayerRelation(game, existing, `${mentorName}接受拜师请求并承担授业责任`, { trust: 12, closeness: 8, respect: 15, identityKnowledge: 10 }); }
  else game.view.relations.push({ id: mentioned?.id ?? "local-mentor", name: mentorName, relation: "师徒", impression: "愿意先教基础，再看品性", strength: 45, category: "师友", dimensions: relationDimensions(45), history: [{ date: `原作 ${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日`, reason: `${mentorName}正式接受拜师请求`, changes: "建立师徒关系" }] });
  game.world.metrics.relationshipsBuilt += 1;
  game.world.deviation += mentioned ? (mentioned.importance ?? 3) * 2 : 1;
  if (mentioned) recordCanonInfluence(game, { source: "建立师徒关系", description: `拜${mentioned.name}为师`, affectedNpcIds: [mentioned.id], affectedFactionIds: mentioned.factionIds, strength: mentioned.importance * 5 });
  ensureTask(game, { id: `mentor-${mentioned?.id ?? "local"}`, title: `完成${mentorName}布置的修行`, kind: "承诺", detail: "按要求练习，并在下次见面时交代结果。", status: "进行中", ownerId: mentioned?.id });
  return { intent: "拜师", minutes: 120, ruleSummary: `${mentorName}接受了师徒关系，并留下第一项修行要求。`, fallbackNarrative: `他没有让我跪太久，伸手把我拉了起来。第一句话也不玄，只让我把每天修炼的时间和失败处一笔笔记清。`, suggestions: ["询问修炼要求", "了解导师的规矩", "开始第一项练习"], systemMessages: [`关系 · ${mentorName} · 师徒`] };
}

function promiseResolution(game: StoredGame, action: string): ActionResolution {
  const title = action.replace(/^(我)?(答应|承诺|保证)/, "").trim().slice(0, 32) || "履行刚刚作出的承诺";
  const id = `promise-${game.actionIndex}`;
  const mentioned = CANON_CHARACTERS.find((character) => action.includes(character.name) && game.world.npcs[character.id]?.knownToPlayer);
  ensureTask(game, { id, title, kind: "承诺", detail: `角色亲口答应了这件事。违背承诺会影响人格与关系。`, status: "进行中", ownerId: mentioned?.id });
  return { intent: "作出承诺", minutes: 10, ruleSummary: `记录新承诺：${title}。`, fallbackNarrative: `话出口后，对面安静了一下。我没再补条件，只把答应的事重复了一遍。`, suggestions: ["立刻准备履约", "确认时间和地点", "记下可能的阻碍"], systemMessages: [`承诺 · ${title}`] };
}

function fulfillPromiseResolution(game: StoredGame, action: string): ActionResolution {
  const active = game.view.tasks.filter((task) => task.kind === "承诺" && task.status === "进行中" && !task.id?.startsWith("debt-"));
  const exact = active.filter((task) => action.includes(task.title));
  if (!exact.length && active.length > 1) return impossible("有多项未完成承诺，需要明确说明要履行哪一项。", active.slice(0, 3).map((task) => `履行承诺：${task.title}`));
  const promise = exact[0] ?? active[0];
  if (!promise) return impossible("没有找到与这次行动对应的未完成承诺。", ["查看任务", "说明要履行哪项承诺", "先完成必要准备"]);
  const createdIndex = promise.createdActionIndex ?? Number(promise.id?.match(/(?:promise|mentor)-(?:[^-]+-)?(\d+)$/)?.[1] ?? game.actionIndex);
  const evidence = game.world.actionLedger.filter((entry) => entry.index > createdIndex && !["作出承诺", "履行承诺", "快进", "休息", "一般行动", "无法完成"].includes(entry.intent));
  const relevantEvidence = promise.id?.startsWith("mentor-") ? evidence.filter((entry) => /修炼|课程|研究|训练/.test(`${entry.intent}${entry.action}`)) : evidence;
  if (!relevantEvidence.length) return impossible(`还没有完成足以证明“${promise.title}”的实际行动。`, ["先执行承诺内容", "收集可核验的结果", "查看承诺详情"]);
  promise.progressEvidence = relevantEvidence.slice(-5).map((entry) => `${entry.action}（${entry.result}）`);
  promise.status = "完成";
  game.world.metrics.promisesKept += 1;
  game.personalityProfile.scores.integrity = (game.personalityProfile.scores.integrity ?? 0) + 2;
  const beneficiaries = promise.ownerId ? game.view.relations.filter((relation) => relation.id === promise.ownerId) : [];
  for (const relation of beneficiaries) { relation.impression = "知道主角会把答应的事做完"; recordPlayerRelation(game, relation, `主角完成了承诺“${promise.title}”`, { trust: 8, respect: 3, favorDebt: 1 }); }
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
      rememberNpcInteraction(game, npc, `玩家明确拒绝了“${event.title}”`);
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
    rememberNpcInteraction(game, npc, `${game.view.worldTime?.year ?? 0}年，玩家介入${event.title}，结果${success ? "成功" : "失败"}`);
  }
  for (const relation of game.view.relations.filter((item) => event.participantIds.includes(item.id ?? ""))) recordPlayerRelation(game, relation, `共同经历${event.title}并看到主角${success ? "承担后果" : "介入失败"}`, success ? { trust: event.stakes * 2, respect: event.stakes, favorDebt: event.stakes } : { trust: -event.stakes, vigilance: event.stakes * 2 });
  if (success) for (const affiliation of game.view.affiliations) affiliation.reputation = event.stakes >= 4 ? "受到重视" : "有过贡献";
  return { intent: "介入世界事件", minutes: 360, ruleSummary: `${event.title}${success ? "处理成功" : "处理失败"}，世界偏差增加 ${impact}。`, fallbackNarrative: success ? `事情收尾时，天已经暗了。没人鼓掌，几个当事人只是反复清点损失。原先要发生的结果被我硬生生推开了一截。` : `我没能兜住局面。人群散开后，地上还留着踩烂的纸和一只断扣子。该担的后果没有因为我的好心少半分。`, suggestions: success ? ["检查事件留下的线索", "与当事人谈谈", "留意后续影响"] : ["处理伤势和损失", "向受影响的人解释", "调查失败原因"], systemMessages: [`世界偏差 · +${impact}`, `事件${success ? "解决" : "失败"} · ${event.title}`] };
}

function npcConflictResolution(game: StoredGame, action: string): ActionResolution {
  const definition = CANON_CHARACTERS.find((item) => action.includes(item.name) || item.aliases.some((alias) => action.includes(alias)));
  if (!definition) return impossible("没有确认攻击目标。", ["观察目标", "调查对方实力", "暂时退开"]);
  const npc = game.world.npcs[definition.id];
  if (definition.hidden && !canDiscoverNpc(game, definition.id)) return impossible("无法确认这个名字对应现实中的具体目标，攻击行动没有成立。", ["调查名字来源", "确认目标身份", "放弃盲目袭击"]);
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
    rememberNpcInteraction(game, npc, "玩家直接造成了这次死亡");
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
  rememberNpcInteraction(game, npc, "玩家曾经主动袭击自己");
  game.view.character!.injuries.push(harm >= 40 ? "强者反击造成的重伤" : "冲突中留下的外伤");
  game.world.deviation += definition.importance * 2;
  recordCanonInfluence(game, { source: "直接冲突", description: `主动袭击${definition.name}`, affectedNpcIds: [definition.id], affectedFactionIds: definition.factionIds, strength: definition.importance * 3 });
  return { intent: "袭击重要人物", minutes: 20, ruleSummary: `袭击${definition.name}失败，受到 ${harm} 点内部伤害，对方已经记住这次敌意。`, fallbackNarrative: `我才动，他就已经转过身。下一瞬胸口像被重锤砸中，脚底擦着地面退了很远。想好的后手只来得及用一半，他看我的眼神已经彻底变了。`, suggestions: ["设法脱身", "处理伤势", "准备面对追查"] };
}

function workResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character!;
  const dangerous = /夜班|矿井|下矿|危险|重体力|猎杀|战斗护卫|押运|通宵/.test(action);
  if (character.age < 16 && dangerous) return impossible(`${character.age}岁的角色不能被合法安排危险、夜间或重体力雇工。`, ["寻找白天跑腿短工", "帮店铺整理货物", "向监护人询问合适工作"]);
  const random = actionRandom(game);
  const eraWageMultiplier = [0, 1, 5, 12, 25][game.view.era ?? 1];
  const job = /锻造|铁匠/.test(action) ? { name: "铁匠铺帮工", profession: "锻造与炼器", wage: 1.3, fatigue: 18, scene: "整理矿料、拉动风箱并清扫炉渣" }
    : /药铺|药材/.test(action) ? { name: "药铺帮工", profession: "炼药", wage: 1.1, fatigue: 11, scene: "辨认标签、晾晒药材并清点药包" }
      : /抄写|文书|账房/.test(action) ? { name: "抄写短工", profession: "魂师学术", wage: 1.2, fatigue: 8, scene: "誊清单据并逐行复核数目" }
        : /搬运|码头/.test(action) ? { name: "搬运短工", profession: "综合研究", wage: 1.15, fatigue: 20, scene: "按货签搬运并核对交接数目" }
          : /采集|采药/.test(action) ? { name: "采集短工", profession: "炼药", wage: 1, fatigue: 14, scene: "按图样采集并剔除不合格材料" }
            : { name: character.age < 10 ? "店铺跑腿短工" : "店铺杂务短工", profession: "商业", wage: .9, fatigue: 10, scene: character.age < 10 ? "送递近处包裹、整理空盒并当面交接" : "理货、跑腿并清扫柜台" };
  const profession = game.view.professions.find((item) => item.name === job.profession);
  const skillMultiplier = 1 + Math.min(.35, (profession?.progress ?? 0) / 300);
  const locationText = `${game.view.location ?? ""}${locationById(game.view.locationId ?? "")?.region ?? ""}`;
  const locationMultiplier = /城|史莱克|明都|天斗|星罗|联邦|母星/.test(locationText) ? 1.2 : /村|镇|聚居地/.test(locationText) ? .85 : 1;
  const childMultiplier = character.age < 10 ? .45 : character.age < 16 ? .72 : 1;
  const baseWage = integer(random, 4, 7);
  const earned = Math.max(1, Math.round(baseWage * eraWageMultiplier * job.wage * locationMultiplier * childMultiplier * skillMultiplier * DIFFICULTY_RULES[game.view.difficulty].money));
  character.coins += earned;
  game.world.fatiguePoints += Math.round(job.fatigue * (character.age < 10 ? .65 : 1));
  const employerId = `employer-${game.view.locationId ?? "local"}`;
  let employer = game.view.relations.find((item) => item.id === employerId);
  if (!employer) {
    employer = { id: employerId, name: `${game.view.location ?? "当地"}雇工管事`, relation: "按工结算的雇佣关系", impression: "只确认做过的工，仍在观察是否可靠。", faction: game.view.location ?? "当地", strength: 8, category: "其他", dimensions: relationDimensions(8), history: [] };
    game.view.relations.push(employer);
    game.world.metrics.relationshipsBuilt += 1;
  }
  recordPlayerRelation(game, employer, `完成一轮${job.name}并当面验收`, { trust: 1, respect: 2, sharedInterest: 2 });
  if (profession) profession.progress = Math.min(100, profession.progress + 1);
  game.view.economy.salary = earned;
  recordEconomyTransaction(game, "收入", earned, employer.name, `${job.name}工钱`);
  return {
    intent: "工作",
    minutes: speedMinutes(game, character.age < 10 ? 120 : 360, character.age < 10 ? 360 : 1440),
    ruleSummary: `完成${job.name}，按年龄、地点与熟练度结算${formatSoulCoins(earned)}，雇主留下验收记录。`,
    fallbackNarrative: `这轮活是${job.scene}。管事验过结果，才把${formatSoulCoins(earned)}倒进我手里；数目、工时和差错都记进了当天的工账。`,
    suggestions: ["购买补给", "回去休息", "继续工作"],
  };
}

function inheritanceResolution(game: StoredGame, action: string): ActionResolution {
  const inheritance = game.view.worldInheritance!;
  const institution = inheritance.institutions.find((item) => action.includes(item.name));
  const branch = inheritance.branches?.find((item) => action.includes(item.name));
  const historyEvent = inheritance.chronology?.find((item) => action.includes(item.title));
  const lineageSubject = inheritance.lineage.find((item) => action.includes(item.name)) ?? inheritance.lineage.at(-1)!;
  const subject = institution ?? branch ?? historyEvent ?? lineageSubject;
  const subjectName = institution?.name ?? (branch ? `${branch.name}的旁支记录` : historyEvent?.title ?? `${lineageSubject.name}的生平记录`);

  if (institution) {
    institution.currentEvidence ??= [];
    institution.claimStatus ??= "未主张";
    institution.claimEvidence ??= [];
    const currentEvidenceSteps = [
      `当前时代登记机关确认“${institution.name}”没有可直接承继的连续产权登记`,
      `${game.view.location ?? "当地"}档案保管人出具旧址、名称沿革与现权利人相互分离的书面说明`,
    ];
    if (/提交|申请/.test(action) && /主张|历史权益/.test(action)) {
      if (institution.verification !== "已核验") return impossible(`必须先把${institution.name}的旧世存在核验到“已核验”，家族单方记录不能直接用于主张。`, [`继续核验${institution.name}`, "寻找独立年代记录", "放弃主张"]);
      if (institution.currentEvidence.length < 2) return impossible(`还需要两条当代权属调查证据；目前只有${institution.currentEvidence.length}条。`, [`调查${institution.name}当前产权登记`, `追查${institution.name}旧址现权利人`, "放弃主张"]);
      if (institution.claimStatus !== "未主张") return impossible(`${institution.name}的历史权益程序当前为“${institution.claimStatus}”，不能重复提交同一主张。`, [institution.claimStatus === "待审理" ? `参加${institution.name}历史权益听证` : "调查其他旧世机构", "继续当前人生"]);
      const filingFee = 10;
      if (game.view.character!.coins < filingFee) return impossible(`提交档案复制、公示与送达需要${formatSoulCoins(filingFee)}，当前资金不足。`, ["工作赚取魂币", "暂缓提交", "整理现有证据"]);
      game.view.character!.coins -= filingFee;
      recordEconomyTransaction(game, "支出", filingFee, `${game.view.location ?? "当地"}历史权益受理处`, `${institution.name}历史权益主张受理费`);
      institution.claimStatus = "待审理";
      institution.claimEvidence.push(`缴纳${formatSoulCoins(filingFee)}受理费并提交旧世证据、当代权属调查与公开送达申请`);
      return { intent: "提交历史权益主张", minutes: speedMinutes(game, 180, 720), ruleSummary: `${institution.name}进入待审理状态；这只是程序性受理，不冻结现权利、不移交成员、领地或财产。`, fallbackNarrative: `受理员把旧档与当代登记分成两叠，逐页编号。我交了复制和送达费用，拿到的只是一张待审通知，而不是钥匙、地契或任何人的效忠。`, suggestions: [`参加${institution.name}历史权益听证`, "准备回答现权利人异议", "继续工作筹资"] };
    }
    if (/听证|审理|裁定/.test(action)) {
      if (institution.claimStatus !== "待审理") return impossible(`${institution.name}没有处于待审理的有效主张。`, [`提交${institution.name}历史权益主张`, "调查其他旧世机构", "继续当前人生"]);
      const limited = institution.state === "有据可查" || institution.state === "碎片传承";
      institution.claimStatus = limited ? "有限承认" : "已驳回";
      institution.recognizedRight = limited ? "旧档案查阅、复制与名称沿革说明权" : undefined;
      institution.claimEvidence.push(limited
        ? "听证仅承认旧档案查阅、复制与名称沿革说明权；现产权、成员、领地与经营许可均不在承认范围"
        : `听证认为“${institution.state}”不足以对抗当代登记与现权利人，历史权益主张被驳回`);
      return { intent: "参加历史权益听证", minutes: speedMinutes(game, 240, 960), ruleSummary: limited ? `${institution.name}获得有限承认，仅限档案权利；如要经营，必须另行投资成立当代主体。` : `${institution.name}主张被驳回，旧世传闻不产生当代产权。`, fallbackNarrative: limited ? `审理人承认这段历史值得被查阅和说明，却把边界写得很清楚：旧名字不是今天的地契，祖先的组织也不是我的部下。` : `旧账上的名字没能跨过漫长年代里的登记断层。裁定盖章后，纸上的历史仍然存在，但它不能从今天的人手里拿走任何东西。`, suggestions: limited ? [`以${institution.name}旧址线索重新投资经营`, "复制核验档案", "继续积攒启动资金"] : ["保存驳回记录", "调查其他旧世机构", "继续当前人生"] };
    }
    if (/重新投资|复建|重新经营/.test(action)) {
      if (institution.claimStatus !== "有限承认") return impossible(`必须先取得${institution.name}的有限历史承认，才能把其名称沿革作为新主体的公开来历；这仍不代表继承旧产权。`, [`参加${institution.name}历史权益听证`, "另行开办普通商铺", "继续当前人生"]);
      if (institution.reestablishedBusiness) return impossible(`${institution.reestablishedBusiness}已经作为当代新主体登记，不能重复领取旧世资源。`, ["经营现有生意", "核对经营账目", "继续当前人生"]);
      const investment = 30;
      if (game.view.character!.coins < investment) return impossible(`成立当代新主体需要场地、登记与首批货物共${formatSoulCoins(investment)}，当前资金不足。`, ["工作赚取魂币", "寻找普通合伙人", "暂缓复建"]);
      if (game.view.economy.business) return impossible(`当前已经经营“${game.view.economy.business}”，需要先处理现实经营能力，不能凭历史线索无成本复制第二份产业。`, ["经营现有生意", "核对账目", "暂缓复建"]);
      const business = `${institution.name}沿革新社`;
      game.view.character!.coins -= investment;
      game.view.economy.business = business;
      institution.reestablishedBusiness = business;
      institution.claimEvidence.push(`另行投入${formatSoulCoins(investment)}，新设“${business}”；法律与账目主体均属于当前时代`);
      recordEconomyTransaction(game, "投资", investment, business, `基于${institution.name}名称沿革线索成立当代新主体`);
      return { intent: "投资成立当代新主体", minutes: speedMinutes(game, 720, 2880), ruleSummary: `投入${formatSoulCoins(investment)}成立${business}；没有继承旧成员、旧领地、旧库存或旧资金。`, fallbackNarrative: `我租下的是今天的铺面，买的是今天的货，登记簿上也写着今天的新名字。旧档只解释招牌从何而来，柜台、债务和风险全得从零开始。`, suggestions: ["经营现有生意", "调查当地需求", "核对启动账目"] };
    }
    if (institution.verification === "已核验" && /当前|产权|权属|登记|旧址|现权利/.test(action)) {
      const nextCurrentEvidence = currentEvidenceSteps.find((item) => !institution.currentEvidence!.includes(item));
      if (!nextCurrentEvidence) return { intent: "调查当代权属", minutes: 30, ruleSummary: `${institution.name}的当代权属边界已完成两处调查；结果明确排除了自动继承。`, fallbackNarrative: `登记页与旧址说明已经互相对上，再翻同一套目录不会多出一块属于我的地。`, suggestions: [`提交${institution.name}历史权益主张`, "调查其他旧世机构", "继续当前人生"] };
      institution.currentEvidence.push(nextCurrentEvidence);
      game.world.metrics.discoveries += 1;
      return { intent: "调查当代权属", minutes: speedMinutes(game, 180, 720), ruleSummary: `${institution.name}新增一条当代权属证据（${institution.currentEvidence.length}/2）；证据确认历史与现产权相互分离。`, fallbackNarrative: `我没有只问家里留下的说法，而是去查今天谁登记、谁维护、谁承担债务。新证据让边界更清楚，也让“祖上有过”不能被偷换成“现在归我”。`, suggestions: institution.currentEvidence.length >= 2 ? [`提交${institution.name}历史权益主张`, "核对申请费用", "放弃主张"] : [`追查${institution.name}旧址现权利人`, "寻找当代登记机关", "继续当前人生"] };
    }
  }
  const evidenceSteps = institution
    ? [`在当前时代的机构目录中找到“${institution.name}”的异名或残卷索引`, `地方账册、谱牒或遗址记录与旧世档案出现两处可交叉对应的细节`]
    : branch
      ? [`当前时代谱牒找到${branch.name}与第${branch.sourceGeneration}代家庭册相符的转交索引`, `独立登记确认${branch.name}以${branch.route}进入家庭的记录存在，但不证明能力或财产继承`]
      : historyEvent
        ? [`当前时代年代目录把“${historyEvent.title}”限定在原作${historyEvent.year}年前后一段可审查范围`, `一份独立保管记录与“${historyEvent.title}”的来源描述出现可交叉对应的编号或转交印记`, `材料年代测定与目录层级共同排除了把后世抄本误当原件的可能`]
      : [`当前时代的地方谱牒记录了${lineageSubject.name}档案的转交链`, `一份独立年代记录与旧世结算摘要中的地点、身份和后果能够互相印证`];
  const nextEvidence = evidenceSteps.find((item) => !subject.evidence.includes(item));
  if (!nextEvidence) return {
    intent: "核验旧世档案",
    minutes: 30,
    ruleSummary: `${subjectName}现有证据已经完成当前可达范围的交叉核验；这不等于自动拥有旧时代的权力或财产。`,
    fallbackNarrative: `能找到的记录都摊在桌上，出处、年代和互相矛盾的地方已经标清。再重复翻同一批纸，不会让历史多出新的证据。`,
    suggestions: ["调查其他旧世机构", "询问当地档案保管人", "继续当前人生"],
  };
  subject.evidence.push(nextEvidence);
  subject.verification = subject.evidence.length >= 3 ? "已核验" : "部分核验";
  if (historyEvent) historyEvent.confidence = subject.verification === "已核验" ? Math.max(historyEvent.confidence, 75) : Math.max(historyEvent.confidence, 50);
  const task = game.view.tasks.find((item) => item.id === "inherited-worldline");
  if (task) {
    task.progressEvidence ??= [];
    task.progressEvidence.push(`${subjectName}：${nextEvidence}`);
    task.progressEvidence = task.progressEvidence.slice(-8);
    if (!institution && !branch && !historyEvent && lineageSubject.name === inheritance.ancestorName && subject.verification === "已核验") task.status = "完成";
  }
  game.world.metrics.discoveries += 1;
  return {
    intent: "核验旧世档案",
    minutes: speedMinutes(game, 180, 720),
    ruleSummary: `${subjectName}新增一条独立证据，可信状态更新为“${subject.verification}”；未复制旧世战力、成员、领地或产权。`,
    fallbackNarrative: `旧纸上的说法没有被直接当成真相。我把年代目录、转交印记和另一处记录逐项对齐，终于有一条细节能脱离家族自己的叙述站住脚。它证明历史确实留下过痕迹，却还不能替我拿回任何东西。`,
    suggestions: subject.verification === "已核验" ? ["调查其他旧世机构", "追查历史影响", "保存核验副本"] : [`继续核验${subjectName}`, "寻找独立记录", "询问档案保管人"],
    systemMessages: [`旧世核验 · ${subjectName} · ${subject.verification}`],
  };
}

function buyResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character!;
  const item = /斗铠/.test(action) && /天锻|神锻|四字/.test(action) ? "天锻斗铠金属胚料"
    : /斗铠/.test(action) && /魂锻|三字/.test(action) ? "魂锻斗铠金属胚料"
      : /斗铠/.test(action) && /灵锻|二字/.test(action) ? "灵锻斗铠金属胚料"
        : /斗铠.*稀有金属|千锻/.test(action) ? "千锻斗铠金属胚料"
          : /稀有金属|魂导金属/.test(action) ? "魂导器用稀有金属"
            : /魂导核心|核心阵法材料|魂导晶体/.test(action) ? "魂导核心晶体"
              : /魂导图纸|空白图纸/.test(action) ? "魂导器空白图纸"
                : /药/.test(action) ? "止血散" : /食|干粮/.test(action) ? "两日干粮" : /绳/.test(action) ? "猎魂绳" : "基础补给包";
  const baseCosts: Record<string, number> = { "魂导器用稀有金属": 80, "魂导核心晶体": 60, "魂导器空白图纸": 15, "基础补给包": 10, "千锻斗铠金属胚料": 200, "灵锻斗铠金属胚料": 800, "魂锻斗铠金属胚料": 3_000, "天锻斗铠金属胚料": 10_000 };
  const baseCost = baseCosts[item] ?? 5;
  const category: MarketCategory = /魂导|斗铠/.test(item) ? "魂导材料" : /金属/.test(item) ? "金属" : /药/.test(item) ? "药材" : /粮/.test(item) ? "粮食" : "日用品";
  const market = updateMarketReport(game, category);
  const cost = Math.max(1, Math.round(baseCost * market.priceIndex / 100 * DIFFICULTY_RULES[game.view.difficulty].resourceCost));
  if (character.coins < cost) return impossible(`购买${item}需要${formatSoulCoins(cost)}，当前只有${formatSoulCoins(character.coins)}。`, ["找临时工作", "换便宜的东西", "离开商店"]);
  character.coins -= cost;
  game.view.inventory.push(item);
  recordEconomyTransaction(game, "支出", cost, `${game.view.location ?? "当地"}商铺`, `购买${item}`);
  return {
    intent: "购买",
    minutes: 20,
    ruleSummary: `按${game.view.location ?? "当地"}${category}行情（价格指数 ${market.priceIndex}）花费${formatSoulCoins(cost)}，获得${item}。`,
    fallbackNarrative: `我把魂币在柜台上排开。老板数完，收走${formatSoulCoins(cost)}，把${item}推了过来。我拆开看过一遍才塞进包里。`,
    suggestions: ["继续采购", "整理背包", "离开商店"],
  };
}

function economyResolution(game: StoredGame, action: string): ActionResolution {
  const character = game.view.character!;
  const economy = game.view.economy;
  if (/承接|接受|领取/.test(action) && /运输合同|货运合同|运货委托/.test(action)) {
    if (activeLogisticsContract(game)) return impossible("当前已有一份未交付的运输合同，不能用新合同覆盖旧货单。", ["查看运输合同", "前往交付地点", "交付运输合同"]);
    syncInventoryAndEconomy(game);
    const destinations = game.view.map.filter((location) => location.travelMinutes > 0);
    const destination = destinations.find((location) => action.includes(location.name)) ?? destinations.find((location) => !["高", "禁区"].includes(location.danger));
    if (!destination) return impossible("当地没有已知且可直接承运的目的地。", ["查看地图", "调查交通路线", "前往交通节点"]);
    const planetaryIds = ["tianluo-planet", "tiandou-planet", "senluo-planet", "elf-planet", "dragon-horse-star", "sky-horse-star"];
    const offWorld = planetaryIds.includes(destination.id) || planetaryIds.includes(game.view.locationId ?? "");
    if (offWorld && !game.view.starship?.shipName) return impossible("跨星球货运不能夹带在普通客运船票中，需要已登记星舰和合法货舱。", ["申请项目舰", "先承接本星球运输", "搭乘客运航班"]);
    if (!offWorld && game.view.inventoryLoad.used + 6 > game.view.inventoryLoad.capacity) return impossible("随身或车载余量不足以装下六单位封箱货物。", ["存放无关物品", "取得储物魂导器", "放弃这份合同"]);
    const category: MarketCategory = /药/.test(action) ? "药材" : /金属/.test(action) ? "金属" : /粮|食/.test(action) ? "粮食" : /魂导/.test(action) ? "魂导材料" : "日用品";
    const originMarket = updateMarketReport(game, category);
    const baseCost = { 药材: 7, 金属: 12, 粮食: 4, 魂导材料: 20, 日用品: 5 }[category] * 6;
    const purchaseCost = Math.max(6, Math.round(baseCost * originMarket.priceIndex / 100));
    if (character.coins < purchaseCost) return impossible(`采购合同货物需要${formatSoulCoins(purchaseCost)}周转金，当前资金不足。`, ["积累周转金", "申请合法借贷", "选择更低价货类"]);
    const travelDays = Math.max(1, Math.ceil(destination.travelMinutes / 1_440));
    const destinationMarket = updateMarketReport(game, category, destination.id, destination.name);
    const destinationValue = Math.max(6, Math.round(baseCost * destinationMarket.priceIndex / 100));
    const payout = destinationValue + Math.max(8, Math.ceil(destination.travelMinutes / 720));
    const id = `logistics-${game.actionIndex}`;
    const cargoLabel = `封签货箱·${category}`;
    const deadlineOrdinal = worldOrdinal(game) + travelDays + (offWorld ? 4 : 2);
    character.coins -= purchaseCost;
    if (!offWorld) game.view.inventory.push(cargoLabel);
    recordEconomyTransaction(game, "投资", purchaseCost, `${game.view.location ?? "当地"}货运行`, `${category}运输合同采购与封签`);
    ensureTask(game, { id, title: `将${category}运往${destination.name}`, kind: "运输合同", detail: `从${game.view.location ?? "当地"}承运六单位${category}；完好准时交付${formatSoulCoins(payout)}，逾期或破损扣款。`, status: "进行中", destinationId: destination.id, deadline: `最迟原作 ${Math.floor((deadlineOrdinal - 1) / 360)} 年第 ${((deadlineOrdinal - 1) % 360) + 1} 日交付`, logistics: { category, originId: game.view.locationId ?? "local", originName: game.view.location ?? "当地", destinationId: destination.id, destinationName: destination.name, cargoLabel, purchaseCost, payout, cargoIntegrity: 100, deadlineOrdinal, mode: offWorld ? "星际货运" : "陆路托运" } });
    return { intent: "承接运输合同", minutes: 90, ruleSummary: `按起运地价格指数 ${originMarket.priceIndex} 支付${formatSoulCoins(purchaseCost)}采购并封签六单位${category}，承诺运往${destination.name}；当地价格指数 ${destinationMarket.priceIndex} 对应准时完好交付价${formatSoulCoins(payout)}，尚未产生收入。`, fallbackNarrative: `货行先验了我的身份和运力，才把采购款、货封编号、两地行情、目的地和最后期限写在同一张单上。钱已经离开账面，只有货物真的抵达，差价才可能成为利润。`, suggestions: [`前往${destination.name}`, "检查货封与路线", "查看交付期限"] };
  }
  if (/交付|结算/.test(action) && /运输合同|货运合同|运货委托|货物/.test(action)) {
    const task = activeLogisticsContract(game);
    if (!task?.logistics) return impossible("当前没有等待交付的运输合同。", ["承接运输合同", "查看任务", "调查市场"]);
    const contract = task.logistics;
    if (game.view.locationId !== contract.destinationId) return impossible(`合同只能在${contract.destinationName}按货封验收。`, [`前往${contract.destinationName}`, "检查合同目的地", "查看路线"]);
    if (contract.mode === "陆路托运" && !game.view.inventory.includes(contract.cargoLabel)) {
      task.status = "失败";
      return { intent: "运输合同失败", minutes: 60, ruleSummary: "验收时无法出示封签货箱，合同按全损结案且没有收入。", fallbackNarrative: "收货人核完单据，又让人把车和行囊查了一遍。货封不在，解释不能替代货物；回单最后只留下全损和零支付两行。", suggestions: ["调查货物去向", "赔偿委托方", "保留事故记录"] };
    }
    const late = worldOrdinal(game) > contract.deadlineOrdinal;
    const payout = Math.max(0, Math.round(contract.payout * contract.cargoIntegrity / 100 * (late ? .7 : 1)));
    character.coins += payout;
    game.view.inventory = game.view.inventory.filter((item) => item !== contract.cargoLabel);
    task.status = "完成";
    task.progressEvidence ??= [];
    task.progressEvidence.push(`${contract.destinationName}验收：货封完整度 ${contract.cargoIntegrity}%${late ? "，逾期扣款" : "，期限内交付"}`);
    recordEconomyTransaction(game, "收入", payout, `${contract.destinationName}收货行`, `${contract.category}运输合同结算`);
    const profit = payout - contract.purchaseCost;
    return { intent: "交付运输合同", minutes: 120, ruleSummary: `${contract.destinationName}按货封、完整度和期限支付${formatSoulCoins(payout)}；本单${profit >= 0 ? `盈利${formatSoulCoins(profit)}` : `亏损${formatSoulCoins(Math.abs(profit))}`}。`, fallbackNarrative: `收货人没有因为我抵达就立刻付款。他逐个核对封签、破损和日期，扣款也写在回单上。最后到账的数减去出发前的采购款，才是这趟真正留下的结果。`, suggestions: ["核对运输账目", "调查当地供需", "寻找返程货物"] };
  }
  if (/市场行情|调查物价|打听物价|询价|供需/.test(action)) {
    const requested: MarketCategory[] = /药/.test(action) ? ["药材"] : /金属/.test(action) ? ["金属"] : /粮/.test(action) ? ["粮食"] : /魂导/.test(action) ? ["魂导材料"] : ["药材", "金属", "粮食", "魂导材料", "日用品"];
    const reports = requested.map((category) => updateMarketReport(game, category));
    return { intent: "调查市场", minutes: 90, ruleSummary: `记录${game.view.location ?? "当地"}${reports.map((item) => `${item.category} ${item.priceIndex}`).join("、")}的供需价格指数；报告会随地点、时代和事件变化。`, fallbackNarrative: `我没有只问一家铺子。进货价、柜台价和真正成交的数分开记，连问几处后，哪些货压仓、哪些货断供已经能看出轮廓。`, suggestions: ["采购低价物资", "调查运输中断", "安排一轮经营"] };
  }
  if (/完成.*悬赏|交付.*悬赏/.test(action)) {
    const task = game.view.tasks.find((item) => item.kind === "悬赏" && item.status === "进行中");
    if (!task) return impossible("当前没有能够交付的悬赏记录。", ["查看任务", "接受悬赏", "核对委托人"]);
    const proof = game.world.actionLedger.some((item) => task.title.includes(item.action) || item.action.includes(task.title.replace(/^完成/, "")));
    if (!proof) return impossible("行动记录中没有足以证明悬赏目标已经完成的因果链。", ["完成悬赏要求", "收集证明", "向委托人核对条件"]);
    const reward = Number(task.detail.match(/报酬(\d+)金魂币/)?.[1] ?? 20);
    character.coins += reward; task.status = "完成";
    recordEconomyTransaction(game, "收入", reward, "悬赏委托人", `交付${task.title}`);
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
    recordEconomyTransaction(game, "支出", reward, `${game.view.location ?? "当地"}委托机构`, "预付公开悬赏赏金");
    return { intent: "发布悬赏", minutes: 60, ruleSummary: `向当地委托机构预付${formatSoulCoins(reward)}，发布具名悬赏；接取者与传播范围将受当地关系影响。`, fallbackNarrative: `赏金先封进柜上的木匣，告示才盖章。管事把不肯承担的风险逐条划掉，剩下的内容没有最初设想得那么万能。`, suggestions: ["观察接取者", "补充可靠情报", "准备验收条件"] };
  }
  if (/存入|存钱/.test(action)) {
    const amount = Math.min(character.coins, Math.max(0, Number(action.match(/\d+/)?.[0] ?? character.coins)));
    if (amount <= 0) return impossible("身上没有可以存入的钱。", ["找工作", "查看账目", "离开钱庄"]);
    character.coins -= amount; economy.bankBalance += amount;
    recordEconomyTransaction(game, "存款", amount, `${game.view.location ?? "当地"}钱庄`, "现金转入具名存款");
    return { intent: "钱庄存款", minutes: 30, ruleSummary: `在当地钱庄存入${formatSoulCoins(amount)}，取得具名凭据。`, fallbackNarrative: `柜上把魂币称了两遍，又让我在存据上按印。纸上的数和柜台收走的数对得上，我才把凭据折好。`, suggestions: ["收好存据", "打听借贷条件", "离开钱庄"] };
  }
  if (/取出|取钱/.test(action)) {
    const amount = Math.min(economy.bankBalance, Math.max(0, Number(action.match(/\d+/)?.[0] ?? economy.bankBalance)));
    if (amount <= 0) return impossible("钱庄账户里没有可取余额。", ["查看账目", "找工作", "离开钱庄"]);
    economy.bankBalance -= amount; character.coins += amount;
    recordEconomyTransaction(game, "取款", amount, `${game.view.location ?? "当地"}钱庄`, "具名存款转回现金");
    return { intent: "钱庄取款", minutes: 30, ruleSummary: `凭具名存据取出${formatSoulCoins(amount)}。`, fallbackNarrative: `掌柜把存据对着灯看过，才从柜后取钱。魂币落在盘里叮当作响，我数清后收进贴身袋。`, suggestions: ["购买物资", "收好余款", "离开钱庄"] };
  }
  if (/借贷|借钱|贷款/.test(action)) {
    const trust = game.view.relations.reduce((sum, item) => sum + Math.max(0, item.dimensions?.trust ?? item.strength ?? 0), 0);
    const amount = Math.min(120, 15 + Math.floor(trust / 20) + game.view.affiliations.length * 20);
    economy.debt += amount + Math.ceil(amount * .2); character.coins += amount;
    recordEconomyTransaction(game, "借贷", amount, `${game.view.location ?? "当地"}钱庄`, `新增应还债务${formatSoulCoins(amount + Math.ceil(amount * .2))}`);
    ensureTask(game, { id: `debt-${game.actionIndex}`, title: `偿还${formatSoulCoins(economy.debt)}债务`, kind: "承诺", detail: "逾期会影响担保人、钱庄声望与后续借贷。", status: "进行中" });
    return { intent: "借贷", minutes: 60, ruleSummary: `凭身份与担保借到${formatSoulCoins(amount)}，应还${formatSoulCoins(amount + Math.ceil(amount * .2))}。`, fallbackNarrative: `契据念得很慢，利息那一行又念了一遍。钱拿到手时，我的名字和担保关系也一起留在了账本里。`, suggestions: ["记录还款期限", "只购买必要物资", "寻找稳定收入"] };
  }
  if (/还债|偿还/.test(action)) {
    const amount = Math.min(character.coins, economy.debt);
    if (!amount) return impossible("当前没有可偿还的钱或未结债务。", ["查看账目", "找工作", "安排收入"]);
    character.coins -= amount; economy.debt -= amount;
    recordEconomyTransaction(game, "还款", amount, `${game.view.location ?? "当地"}钱庄`, `偿还后剩余债务${formatSoulCoins(economy.debt)}`);
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
    recordEconomyTransaction(game, "投资", investment, economy.business, "一轮进货、摊位与经营损耗");
    const category: MarketCategory = /药/.test(action) ? "药材" : /金属|锻造/.test(action) ? "金属" : /粮|食/.test(action) ? "粮食" : /魂导/.test(action) ? "魂导材料" : "日用品";
    const market = updateMarketReport(game, category);
    const sales = Math.max(0, Math.round(investment * (.58 + market.demand / 100 * .72)));
    character.coins += sales;
    if (sales) recordEconomyTransaction(game, "收入", sales, `${game.view.location ?? "当地"}顾客`, `${category}销售回款`);
    const profit = sales - investment;
    return { intent: "商业经营", minutes: speedMinutes(game, 720, 4320), ruleSummary: `向${economy.business}投入${formatSoulCoins(investment)}，按${category}需求 ${market.demand} 完成销售回款${formatSoulCoins(sales)}，本轮${profit >= 0 ? `盈利${formatSoulCoins(profit)}` : `亏损${formatSoulCoins(Math.abs(profit))}`}。`, fallbackNarrative: `进货、摊位、损耗和搬运费先从钱袋里出去，卖货的钱再一笔笔回来。柜台热闹不等于挣钱，我把最后余额和开门前的数对过，才在这轮账后落笔。`, suggestions: ["调整货物", "调查当地需求", "核对账目"] };
  }
  return impossible("这项经济行动缺少明确对象或数额。", ["说明存取或借贷数额", "查看魂币", "寻找当地钱庄"]);
}

function professionResolution(game: StoredGame, action: string): ActionResolution {
  const routes = [
    [/炼药|丹药|药剂/, "炼药"], [/锻造|炼器|打造/, "锻造与炼器"], [/魂导器|魂导师/, "魂导器研究"], [/阵法|阵纹/, "阵法"], [/医术|治疗/, "医术"], [/毒术|制毒/, "毒术"], [/商业|经商/, "商业"], [/驯兽|驯养/, "驯兽"], [/学术|理论|研究魂兽/, "魂师学术"],
  ] as const;
  const name = routes.find(([pattern]) => pattern.test(action))?.[1] ?? "综合研究";
  let profession = game.view.professions.find((item) => item.name === name);
  if (!profession) { profession = { id: name, name, level: "学徒", progress: 0, experiments: 0, failures: 0, knownMethods: [] }; game.view.professions.push(profession); }
  if (name === "魂导器研究" && (game.view.era ?? 1) >= 2) {
    profession.experiments += 1;
    const requestedGrade = Math.max(1, Math.min(9, Number(action.match(/([一二三四五六七八九1-9])级/)?.[1]?.replace(/[一二三四五六七八九]/, (value) => String("一二三四五六七八九".indexOf(value) + 1)) ?? 1)));
    const certifiedGrade = Number(profession.level.match(/(\d+)级魂导师/)?.[1] ?? 0);
    if (/认证|考核/.test(action)) {
      const nextGrade = Math.max(1, certifiedGrade + 1);
      const requiredProgress = nextGrade * 18;
      const hasInstitution = game.view.affiliations.some((item) => /学院|魂导|日月|唐门|传灵塔/.test(item.name)) || game.view.relations.some((item) => /魂导师|魂导老师/.test(`${item.name}${item.relation}`));
      if (!hasInstitution) return impossible("魂导师等级需要有认证资格的学院、宗门或协会监考。", ["加入魂导师学院", "寻找认证魂导师", "继续积累作品"]);
      if (profession.progress < requiredProgress || profession.knownMethods.length < nextGrade) return impossible(`申请 ${nextGrade} 级认证至少需要 ${requiredProgress}% 熟练度和 ${nextGrade} 项可复核方法。`, ["学习核心阵法", "制作低阶魂导器", "复盘失败记录"]);
      profession.level = `${nextGrade}级魂导师`;
      return { intent: "魂导师认证", minutes: speedMinutes(game, 360, 1440), ruleSummary: `通过理论、刻阵与成品复核，取得 ${nextGrade} 级魂导师认证。`, fallbackNarrative: "考官把成品拆开检查，没有因为能启动就给分。最后一处阵纹复测结束，他才在证书上盖下等级印。", suggestions: ["学习更高阶核心阵法", "承接对应等级委托", "检查认证记录"], systemMessages: [`职业 · ${nextGrade}级魂导师`] };
    }
    if (/学习|研究|临摹|练习|推演/.test(action) && !/制作|打造|组装/.test(action)) {
      const gain = integer(actionRandom(game), 5, 10);
      profession.progress = Math.min(100, profession.progress + gain);
      const methodGrade = Math.max(1, Math.min(9, Math.floor(profession.progress / 18) + 1));
      const method = `${methodGrade}级核心阵法识读`;
      if (!profession.knownMethods.includes(method)) profession.knownMethods.push(method);
      game.world.fatiguePoints += 10;
      return { intent: "魂导理论学习", minutes: speedMinutes(game, 180, 720), ruleSummary: `完成一次核心阵法临摹与误差检查，熟练度增加 ${gain}%。`, fallbackNarrative: "刻刀没有碰金属。我先把阵线放大临摹，再逐段标出魂力流向。三处看似对称的节点实际负载不同，抄错一笔，成品就会在启动时烧毁。", suggestions: ["购买稀有金属与核心晶体", "制作一级魂导器", "请魂导师检查图纸"] };
    }
    if (/测试|复核/.test(action) && !/制作|打造|组装/.test(action)) {
      const product = game.view.inventory.find((item) => /\d+级.*魂导器/.test(item));
      if (!product) return impossible("没有可供负载与安全复核的成品魂导器。", ["先制作一级魂导器", "检查成品库存", "复盘失败件"]);
      profession.progress = Math.min(100, profession.progress + 3);
      return { intent: "魂导器安全测试", minutes: speedMinutes(game, 180, 720), ruleSummary: `对${product}完成连续启停、负载、温度和失效保护实验测试；结果已形成安全复核记录。`, fallbackNarrative: `我没有把能亮一次当成合格。连续启停、满载升温和断流保护逐项做完，外壳拆开后又检查了烧蚀痕迹，数据才写进复核页。`, suggestions: ["提交安全复核记录", "修正图纸误差", "申请机构验收"] };
    }
    const maxCraftGrade = Math.max(1, Math.min(9, Math.floor(profession.progress / 18) + 1, certifiedGrade + 1));
    if (requestedGrade > maxCraftGrade) return impossible(`当前只能尝试 ${maxCraftGrade} 级及以下魂导器，不能跳过阵法与认证基础。`, [`制作${maxCraftGrade}级魂导器`, "学习核心阵法", "申请魂导师认证"]);
    const metalIndex = game.view.inventory.findIndex((item) => /稀有金属|魂导器用.*金属/.test(item));
    const coreIndex = game.view.inventory.findIndex((item) => /魂导核心|核心晶体|核心阵法材料/.test(item));
    if (metalIndex < 0 || coreIndex < 0) return impossible("制作实体魂导器同时需要可刻阵金属与魂导核心晶体。", ["购买魂导器用稀有金属", "购买魂导核心晶体", "先学习核心阵法"]);
    const consume = [metalIndex, coreIndex].sort((a, b) => b - a);
    for (const index of consume) game.view.inventory.splice(index, 1);
    const taught = game.view.relations.some((item) => /魂导师|魂导老师|师父|导师/.test(`${item.name}${item.relation}`));
    const random = actionRandom(game);
    const successChance = Math.min(.92, .32 + profession.progress / 140 + (taught ? .15 : 0) - Math.max(0, requestedGrade - certifiedGrade) * .06);
    const success = random() < successChance;
    const gain = integer(random, success ? 8 : 4, success ? 14 : 9);
    profession.progress = Math.min(100, profession.progress + gain);
    game.world.fatiguePoints += 18 + requestedGrade * 2;
    if (!success) {
      profession.failures += 1;
      return { intent: "魂导器制作", minutes: speedMinutes(game, 360, 1440), ruleSummary: `${requestedGrade}级魂导器制作失败；两类材料已消耗，熟练度增加 ${gain}%。`, fallbackNarrative: "核心阵纹亮到第三段时突然偏色。我立刻切断魂力，金属没炸开，晶体却从内部裂了。失败点被我圈在图纸上，材料已经不能恢复。", suggestions: ["复盘阵纹误差", "重新购买材料", "请魂导师检查失败件"] };
    }
    const toolKind = /储物/.test(action) ? "储物魂导器" : /护盾|防御/.test(action) ? "防御魂导器" : /照明/.test(action) ? "照明魂导器" : "训练用魂导器";
    const product = `${requestedGrade}级${toolKind}`;
    game.view.inventory.push(product);
    const method = `${requestedGrade}级${toolKind}制作记录`;
    if (!profession.knownMethods.includes(method)) profession.knownMethods.push(method);
    return { intent: "魂导器制作", minutes: speedMinutes(game, 360, 1440), ruleSummary: `${requestedGrade}级魂导器制作成功，获得${product}；熟练度增加 ${gain}%。`, fallbackNarrative: `最后一段阵纹接通后，核心晶体的光没有乱跳。我连续启停三次，又测了外壳温度，才把${product}从工作台上取下来。它能用，但还远没到可以省略复检的程度。`, suggestions: ["测试成品负载", "记录完整图纸", "申请魂导师认证"], systemMessages: [`制成 · ${product}`] };
  }
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

function eraThreeCareerResolution(game: StoredGame, action: string): ActionResolution {
  if ((game.view.era ?? 1) < 3) return impossible("斗铠与现代机甲产业尚未形成，当前时代不能申请这些第二职业认证。", ["学习当前时代的锻造", "研究早期魂导器", "核对技术年代"]);
  const route = /斗铠.*设计|斗铠设计师/.test(action) ? { id: "斗铠设计", role: "斗铠设计师", material: "魂导器空白图纸" }
    : /机甲.*制造|机甲制造师/.test(action) ? { id: "机甲制造", role: "机甲制造师", material: "魂导器用稀有金属" }
      : /机甲.*修理|机甲维修|机甲修理师/.test(action) ? { id: "机甲维修", role: "机甲修理师", material: "魂导器用稀有金属" }
        : /锻造|锻造师/.test(action) ? { id: "锻造与炼器", role: "锻造师", material: "魂导器用稀有金属" }
          : { id: "机甲设计", role: "机甲设计师", material: "魂导器空白图纸" };
  let profession = game.view.professions.find((item) => item.name === route.id);
  if (!profession) {
    profession = { id: route.id, name: route.id, level: "学徒", progress: 0, experiments: 0, failures: 0, knownMethods: [], certifications: [], portfolio: [], commissionsCompleted: 0 };
    game.view.professions.push(profession);
  }
  profession.certifications ??= [];
  profession.portfolio ??= [];
  profession.commissionsCompleted ??= 0;
  const certified = Math.max(0, ...profession.certifications.filter((item) => item.startsWith(route.role)).map((item) => Number(item.match(/(\d+)级/)?.[1] ?? 0)));
  if (/认证|考核/.test(action)) {
    const target = Math.min(5, certified + 1);
    const hasInstitution = game.view.affiliations.some((item) => /学院|传灵塔|机甲|锻造|协会|史莱克/.test(item.name)) || game.view.relations.some((item) => /设计师|制造师|修理师|锻造师|魂导师/.test(`${item.name}${item.relation}`));
    if (!hasInstitution) return impossible(`${route.role}认证必须由学院、传灵塔、行业协会或有资质的专业人士复核。`, ["加入有资质的学院", `寻找${route.role}导师`, `继续积累${route.id}作品`]);
    if (profession.progress < target * 20 || profession.experiments < target * 3 || profession.portfolio.length < target * 2) return impossible(`${target}级${route.role}认证至少需要 ${target * 20}% 熟练度、${target * 3} 次训练和 ${target * 2} 件可复核作品。`, [`继续学习${route.id}`, "整理作品档案", "复盘失败记录"]);
    profession.certifications = profession.certifications.filter((item) => !item.startsWith(route.role));
    profession.certifications.push(`${route.role}·${target}级`);
    profession.level = `${target}级认证`;
    return { intent: "第二职业认证", minutes: speedMinutes(game, 360, 1_440), ruleSummary: `作品尺寸、负载、武魂适配与失败记录通过复核，取得${route.role} ${target}级认证。`, fallbackNarrative: "考官没有只看最好的一张图。他把失败页、修改痕迹和成品测试记录并排摊开，逐项追问为什么改；最后一个问题答完，认证章才落在档案上。", suggestions: [`承接${route.id}委托`, `继续准备${target + 1}级认证`, "查看职业档案"], systemMessages: [`职业认证 · ${route.role} · ${target}级`] };
  }
  if (/委托|订单|接单/.test(action)) {
    if (certified < 1) return impossible(`没有${route.role}认证，正规客户不会把可追责的产业订单交给玩家。`, [`申请${route.role}认证`, `继续学习${route.id}`, "整理训练作品"]);
    const materialIndex = game.view.inventory.findIndex((item) => item.includes(route.material));
    if (materialIndex < 0) return impossible(`${route.id}委托需要可登记的${route.material}，不能只交口头方案。`, [`购买${route.material}`, "核对订单材料标准", "暂缓接单"]);
    game.view.inventory.splice(materialIndex, 1);
    const perception = /优秀|顶尖/.test(game.view.character!.abilityDescriptors.perception) ? 8 : 0;
    const difficulty = certified * 15 + 35;
    const success = profession.progress + certified * 12 + perception >= difficulty;
    profession.experiments += 1;
    if (!success) {
      profession.failures += 1;
      profession.progress = Math.min(100, profession.progress + 4);
      return { intent: "第二职业委托", minutes: speedMinutes(game, 480, 1_920), ruleSummary: `${route.role}委托未通过客户验收；材料已消耗，失败数据进入职业档案，没有获得报酬。`, fallbackNarrative: "客户把负载测试停在红线前，指出接口公差已经超过合同。材料和工时都回不来，我只能把退件原因逐条写进档案，不能把‘差一点’算成交付。", suggestions: ["复盘退件原因", `继续学习${route.id}`, `重新购买${route.material}`] };
    }
    const reward = certified * 180;
    game.view.character!.coins += reward;
    recordEconomyTransaction(game, "收入", reward, `${game.view.location ?? "当地"}${route.id}客户`, `${route.role}${certified}级委托验收款`);
    profession.commissionsCompleted += 1;
    profession.progress = Math.min(100, profession.progress + 5);
    const evidence = `${route.role}${certified}级委托#${profession.commissionsCompleted}·已验收`;
    profession.portfolio.push(evidence);
    profession.portfolio = profession.portfolio.slice(-20);
    return { intent: "第二职业委托", minutes: speedMinutes(game, 480, 1_920), ruleSummary: `${route.role}委托通过材料、尺寸、负载和安全验收，获得${formatSoulCoins(reward)}，作品与客户回执已入档。`, fallbackNarrative: "交付不是把图纸往桌上一放。客户按合同逐项测过尺寸、负载和失效保护，确认页签完后才付款；这份回执也成了下一次认证能被复核的作品证据。", suggestions: [`承接下一份${route.id}委托`, `准备更高等级${route.role}认证`, "核对收入与作品档案"], systemMessages: [`职业作品 · ${evidence}`] };
  }
  const handsOn = route.material !== "魂导器空白图纸";
  if (handsOn) {
    const materialIndex = game.view.inventory.findIndex((item) => item.includes(route.material));
    if (materialIndex < 0) return impossible(`${route.id}实训需要${route.material}，纸面想象不能形成制造或维修作品。`, [`购买${route.material}`, "先学习安全理论", "寻找实训工坊"]);
    game.view.inventory.splice(materialIndex, 1);
  }
  const gain = integer(actionRandom(game), 10, 14);
  profession.experiments += 1;
  profession.progress = Math.min(100, profession.progress + gain);
  const method = `${route.id}训练法·${profession.experiments}`;
  if (!profession.knownMethods.includes(method)) profession.knownMethods.push(method);
  profession.portfolio.push(`${route.id}训练作品#${profession.experiments}`);
  profession.portfolio = profession.portfolio.slice(-20);
  if (!certified) profession.level = profession.progress >= 35 ? "入门" : "学徒";
  game.world.fatiguePoints += 14;
  return { intent: "第二职业训练", minutes: speedMinutes(game, 300, 1_200), ruleSummary: `完成第 ${profession.experiments} 次${route.id}实训，熟练度增加 ${gain}% 至 ${profession.progress}%，训练作品已入档但不能冒充认证订单。`, fallbackNarrative: handsOn ? "材料上留下的每一道误差都比课本诚实。我按尺寸、受力和安全余量重做一遍，把能复现的步骤和失败边界一起贴进训练档案。" : "我把武魂释放时的重心、魂技距离和控制延迟逐项画进图纸。训练稿不算可出售方案，但每一次修改都留下了能被考官追问的依据。", suggestions: [profession.progress >= 20 ? `申请${route.role}认证` : `继续学习${route.id}`, "整理训练作品", handsOn ? `购买${route.material}` : "临摹另一类武魂方案"] };
}

function soulSpiritGrade(years: number): "十年" | "百年" | "千年" | "万年" {
  if (years < 100) return "十年";
  if (years < 1_000) return "百年";
  if (years < 10_000) return "千年";
  return "万年";
}

function soulSpiritResolution(game: StoredGame, action: string): ActionResolution {
  const era = game.view.era ?? 1;
  const year = game.view.worldTime?.year ?? 0;
  const character = game.view.character!;
  if (era === 1) return impossible("魂灵体系在这个时代尚未形成，只能研究灵魂残留与契约设想。", ["研究魂兽残魂", "调查魂环中的精神残留", "按传统方式准备猎魂"]);
  if (era === 2 && year < 10_005) {
    if (/研究|设想|调查/.test(action)) {
      let theory = game.view.professions.find((item) => item.id === "魂灵理论");
      if (!theory) { theory = { id: "魂灵理论", name: "灵魂契约理论", level: "假说", progress: 0, experiments: 0, failures: 0, knownMethods: [] }; game.view.professions.push(theory); }
      theory.experiments += 1;
      theory.progress = Math.min(24, theory.progress + integer(actionRandom(game), 2, 5));
      return { intent: "魂灵前置研究", minutes: speedMinutes(game, 240, 960), ruleSummary: "当前只能记录魂兽残魂、智慧魂环与契约承载的观察，尚无可复制的魂灵技术。", fallbackNarrative: "几份记录能证明魂环里可能残留意识，却拼不成一套能让魂兽继续存活的办法。我把失败条件写在假说旁边，没有把猜测冒充成果。", suggestions: ["研究智慧魂环记录", "寻找精神系导师", "按传统路线准备魂环"] };
    }
    return impossible("这个年份还没有可供申请或购买的魂灵体系。", ["研究魂兽残魂", "调查智慧魂环传闻", "按传统路线准备猎魂"]);
  }
  if (era === 2 && year < 10_012 && !game.view.affiliations.some((item) => /史莱克/.test(item.name))) {
    return impossible("魂灵目前仍是史莱克内部的高风险保密试验，外部不存在公开服务窗口。", ["加入史莱克并取得研究许可", "调查魂灵公开消息", "按传统路线准备猎魂"]);
  }
  ensureMartialSoulAccounts(game);
  const activeRings = character.soulRingSets[character.activeMartialSoulIndex];
  const ringIndex = activeRings.length + 1;
  if (character.soulRank < ringIndex * 10) return impossible(`当前主修武魂还没有到第 ${ringIndex} 环瓶颈。`, ["继续修炼", "研究魂灵资料", "检查当前魂环"]);

  if (/寻找|申请|咨询|购买|挑选|调查/.test(action) && !/评估/.test(action)) {
    const limit = RING_LIMITS[Math.min(ringIndex, RING_LIMITS.length - 1)] ?? 423;
    const candidates = SOUL_BEASTS.filter((beast) => beast.ageRange[0] <= limit && beast.danger <= Math.max(2, ringIndex + 1));
    if (!candidates.length) return impossible("当地登记库没有适合当前魂环槽位的合规魂灵。", ["前往更大的城市", "申请调取其他分塔库存", "按传统路线调查魂兽"]);
    const beast = pick(actionRandom(game), candidates);
    const years = Math.min(limit, Math.max(beast.ageRange[0], Math.round(Math.min(beast.ageRange[1], limit) * .72)));
    const experimental = era === 2 && year < 10_012;
    const provider = experimental ? "史莱克魂灵红色机密试验组" : "传灵塔正规服务窗口";
    game.view.soulSpiritContract = { stage: "调查", provider, beastId: beast.id, beastName: beast.name, years, compatibility: 0, cost: experimental ? 0 : Math.max(120, Math.round(years * .7)), warning: "尚未完成精神适配评估，不能签约。" };
    return { intent: "调查魂灵", minutes: 90, ruleSummary: `找到一份${beast.name}魂灵档案，标称${years}年；价格、精神负担和适配性尚待评估。`, fallbackNarrative: `工作人员没有先说“最强”，而是把死亡记录、退契案例和一叠检测表推到桌上。玻璃后的${beast.name}魂灵只显出模糊轮廓，偶尔朝这边转一下头。`, suggestions: ["评估魂灵适配", "核对魂灵来源", "放弃这份魂灵"] };
  }

  const contract = game.view.soulSpiritContract;
  if (!contract) return impossible("还没有选定可评估的魂灵档案。", ["寻找正规魂灵", "调查当地魂灵机构", "查看当前魂环需求"]);
  if (/放弃|取消/.test(action)) {
    game.view.soulSpiritContract = undefined;
    return { intent: "放弃魂灵", minutes: 10, ruleSummary: `放弃${contract.beastName}魂灵方案，没有形成契约。`, fallbackNarrative: "我把确认页推了回去。窗口人员收走档案，没有劝我赌一次，只在登记上写了“本人放弃”。", suggestions: ["寻找其他魂灵", "准备传统猎魂", "继续修炼"] };
  }
  if (/评估|检测|适配/.test(action)) {
    const spirit = character.abilityDescriptors.spirit === "顶尖" ? 24 : character.abilityDescriptors.spirit === "优秀" ? 14 : 5;
    const soulAffinity = /精神|本体/.test(character.martialSoul.category) ? 12 : 4;
    contract.compatibility = Math.min(96, 48 + spirit + soulAffinity + integer(actionRandom(game), -7, 8));
    contract.stage = "可签约";
    contract.warning = contract.compatibility >= 75 ? "适配良好，仍需承担契约磨合与魂力冲击。" : contract.compatibility >= 60 ? "适配一般，初期磨合会增加疲劳。" : "适配偏低，不建议直接签约。";
    return { intent: "魂灵适配评估", minutes: 120, ruleSummary: `${contract.beastName}魂灵适配度 ${contract.compatibility}%；${contract.warning}`, fallbackNarrative: `精神检测持续了三轮。每次光纹收束，${contract.beastName}的轮廓都会更清楚一点。工作人员把最终数字圈出来，又让我把风险说明从头读了一遍。`, suggestions: contract.compatibility >= 60 ? ["签订魂灵契约", "核对费用与风险", "放弃这份魂灵"] : ["放弃这份魂灵", "寻找其他魂灵", "提升精神力后复测"] };
  }
  if (/签订|签约|融合|契约/.test(action)) {
    if (contract.stage !== "可签约" || contract.compatibility <= 0) return impossible("必须先完成精神适配评估。", ["评估魂灵适配", "核对魂灵来源", "放弃这份魂灵"]);
    if (contract.compatibility < 60) return impossible(`适配度只有 ${contract.compatibility}%，当前机构拒绝执行高风险签约。`, ["寻找其他魂灵", "提升精神力", "放弃这份魂灵"]);
    if (character.coins < contract.cost) return impossible(`签约与承载材料需要${formatSoulCoins(contract.cost)}，当前资金不足。`, ["合法工作筹款", "申请学院补助", "放弃这份魂灵"]);
    character.coins -= contract.cost;
    const beast = soulBeastById(contract.beastId);
    const ability = beast?.possibleSkills[0] ?? "魂力共鸣";
    const skillName = `${character.martialSoul.name}·${ability}`;
    const ring: SoulRingView = { index: ringIndex, beastId: contract.beastId, beastName: `魂灵·${contract.beastName}`, years: contract.years, color: ringColor(contract.years), skillName, skillDescription: `${contract.beastName}魂灵与${character.martialSoul.name}完成契约后形成的${ability}能力；契约来源与磨合状态会持续记录。` };
    activeRings.push(ring);
    character.soulRings = activeRings;
    character.soulSpirits ??= [];
    character.soulSpirits.push({ id: `spirit-${game.actionIndex}-${contract.beastId}`, name: `${contract.beastName}魂灵`, beastId: contract.beastId, beastName: contract.beastName, years: contract.years, grade: soulSpiritGrade(contract.years), bond: Math.round(contract.compatibility / 4), status: "磨合", abilities: [ability], source: era === 2 ? "人工魂灵" : "人工魂灵" });
    if (character.soulRank === ringIndex * 10) character.soulRank += 1;
    game.world.fatiguePoints += contract.compatibility >= 75 ? 22 : 34;
    game.world.metrics.discoveries += 1;
    game.view.soulSpiritContract = undefined;
    const task = game.view.tasks.find((item) => item.id === `ring-${character.activeMartialSoulIndex}-${ringIndex}` || item.id === `ring-${ringIndex}` || item.id === "first-ring");
    if (task) task.status = "完成";
    return { intent: "签订魂灵契约", minutes: speedMinutes(game, 180, 480), ruleSummary: `支付${formatSoulCoins(contract.cost)}，与${contract.years}年${contract.beastName}魂灵完成契约，获得魂技${skillName}。`, fallbackNarrative: `契约压进精神世界时，最先来的不是力量，而是一阵不属于我的惊惧。等呼吸重新稳住，${contract.beastName}的意识仍在，没有被魂环抹平。脚下魂环亮起，它也第一次回应了我的念头。`, suggestions: ["与魂灵进行第一次沟通", "测试新魂技", "休息适应契约"], systemMessages: [`魂灵 · ${contract.beastName} · ${contract.years} 年`, `魂技 · ${skillName}`] };
  }
  return impossible("需要明确选择调查、评估、签约或放弃魂灵。", ["评估魂灵适配", "签订魂灵契约", "放弃这份魂灵"]);
}

function spiritAscensionResolution(game: StoredGame, action: string): ActionResolution {
  if ((game.view.era ?? 1) < 3) return impossible("升灵台尚未在当前时代建成，不能用后世设施提升魂灵或魂环。", ["核对技术年代", "进行当前时代的魂环修炼", "研究魂灵理论"]);
  const character = game.view.character!;
  const activeRings = character.soulRingSets[character.activeMartialSoulIndex] ?? character.soulRings;
  const current = game.view.spiritAscension;
  if (/登记.*斗铠师|斗铠师.*登记|领取.*升灵台.*福利/.test(action)) {
    const armor = character.battleArmors?.filter((item) => item.status === "完整").sort((a, b) => b.tier - a.tier)[0];
    if (!armor) return impossible("传灵塔斗铠师福利需要一套已完成并可复核的一字或更高斗铠，工程立项不能代替成品。", ["完成一字斗铠", "检查斗铠部件", "取得斗铠师作品证明"]);
    const hasChannel = game.view.locationId === "spirit-pagoda-hq" || game.view.affiliations.some((item) => /传灵塔/.test(item.name));
    if (!hasChannel) return impossible("斗铠师福利必须在传灵塔登记，不由普通商店或学院自行签发。", ["前往传灵塔总部", "加入传灵塔服务体系", "核对斗铠档案"]);
    const year = game.view.worldTime?.year ?? 0;
    const membership = game.view.spiritAscensionMembership ??= { registeredBattleArmorTier: armor.tier, benefitYears: [] };
    membership.registeredBattleArmorTier = Math.max(membership.registeredBattleArmorTier, armor.tier) as 1 | 2 | 3 | 4;
    membership.taskPoints ??= 0;
    membership.authorizationEvidence ??= [];
    if (membership.benefitYears.includes(year)) return impossible("本年度斗铠师升灵台福利已经领取，不能重复生成入门卡。", ["查看中级入门卡", "等待下一原作年", "承接传灵塔任务"]);
    membership.benefitYears.push(year);
    membership.authorizationEvidence.push(`${year}年：完整${armor.title}实名登记`);
    game.view.inventory.push("中级升灵台入门卡", "中级升灵台入门卡", "高级升灵台半价资格");
    return { intent: "登记斗铠师福利", minutes: 120, ruleSummary: `以完整${armor.title}完成传灵塔登记，领取本年度两张中级升灵台入门卡与一次高级升灵台半价资格；福利与登记记录均已留档。`, fallbackNarrative: "工作人员逐件核对斗铠编号和共鸣测试，没有因为外观完整就直接放行。登记完成后，两张中级入门卡与高级服务优惠才写入名下；它们是年度福利，不是可以反复领取的赠品。", suggestions: ["申请中级升灵台名额", "承接传灵塔任务积累任务点", "核对高级授权条件"] };
  }
  if (/真实核心|核心层/.test(action) && /升灵台/.test(action)) {
    return impossible("高级升灵台普通授权不等于真实核心层授权。当前档案没有独立核心资源调令、现实场域坐标与真实死亡知情书，系统不会用一句‘接受风险’绕过三重核验。", ["申请普通高级升灵台授权", "承接传灵塔核心事务", "保留真实核心层封存状态"]);
  }
  if (/高级/.test(action) && /授权|资格|凭证/.test(action) && /申请|兑换|取得/.test(action)) {
    const membership = game.view.spiritAscensionMembership;
    const pagoda = game.view.affiliations.find((item) => /传灵塔/.test(item.name));
    if (!membership) return impossible("高级升灵台授权只向已完成斗铠师实名登记的在册档案开放。", ["登记完整斗铠", "加入传灵塔服务体系", "核对升灵台档案"]);
    if (!pagoda) return impossible("学院合作名额不能签发高级核心资源授权，必须有传灵塔在册身份。", ["加入传灵塔", "承接传灵塔事务", "使用中级入门卡"]);
    const taskPoints = membership.taskPoints ?? 0;
    const contribution = pagoda.contribution ?? 0;
    if (taskPoints < 20 || contribution < 20) return impossible(`普通高级授权需要 20 传灵塔任务点与 20 在册贡献；当前 ${taskPoints} / ${contribution}。现金不能替代任务验收。`, ["承接传灵塔任务", "完成魂灵来源审计", "查看任务点证据"]);
    if (game.view.inventory.includes("高级升灵台授权凭证")) return impossible("名下已有一张未使用的高级升灵台授权凭证，不能重复占用核心资源。", ["申请高级升灵台名额并接受高级风险", "核对授权凭证", "暂缓使用"]);
    membership.taskPoints = taskPoints - 20;
    membership.authorizationEvidence ??= [];
    membership.authorizationEvidence.push(`${game.view.worldTime?.year ?? 0}年：核销20任务点与${contribution}贡献，签发普通高级授权`);
    membership.authorizationEvidence = membership.authorizationEvidence.slice(-20);
    game.view.inventory.push("高级升灵台授权凭证");
    return { intent: "取得高级升灵台授权", minutes: 180, ruleSummary: `传灵塔核销 20 任务点并复核 ${contribution} 点在册贡献，签发一张普通高级升灵台实名授权；该凭证不含真实核心层权限。`, fallbackNarrative: "复核员把任务验收、斗铠登记和贡献记录分屏调出，直到三份档案的姓名与时间都对上，才让那张高级授权落入名下。凭证最醒目的不是准入章，而是‘不含真实核心层’的红色边界。", suggestions: ["申请高级升灵台名额并接受高级风险", "核对高拟真保护说明", "保留授权凭证"] };
  }
  if (/申请|预约|购买.*名额|取得.*名额/.test(action)) {
    if (current && current.status !== "已结算") return impossible(`上一轮升灵台流程仍处于“${current.status}”，必须先完成退出和结算。`, ["进入升灵台", "主动退出升灵台", "结算升灵台灵力"]);
    const requestedTier = /高级/.test(action) ? "高级" as const : /中级/.test(action) ? "中级" as const : "初级" as const;
    if (requestedTier === "初级" && character.soulRank >= 40) return impossible("初级升灵台只准四环以下魂师进入，当前修为必须申请更高层级。", ["申请中级升灵台", "核对传灵塔准入规则", "选择其他修炼方式"]);
    if (requestedTier === "中级" && character.soulRank >= 70) return impossible("中级升灵台只准七环以下魂师进入，当前修为必须申请更高层级。", ["核对高级升灵台资格", "承接传灵塔任务", "选择其他修炼方式"]);
    if (requestedTier === "高级" && character.soulRank < 70) return impossible("普通高级升灵台以七环修为作为当前可执行安全下限，低阶魂师不能凭授权越级接入。", ["使用中级入门卡", "提升魂力与魂环承载", "保留高级授权"]);
    if (!activeRings.length && !(character.soulSpirits?.length)) return impossible("当前没有可承接升灵台灵力的魂环或魂灵。", ["先取得第一魂环", "签订正规魂灵", "继续基础修炼"]);
    const hasChannel = game.view.locationId === "spirit-pagoda-hq" || game.view.affiliations.some((item) => requestedTier === "高级" ? /传灵塔/.test(item.name) : /传灵塔|学院/.test(item.name));
    if (!hasChannel) return impossible("初级升灵台名额有限，需要在传灵塔受理点或通过在册学院申请。", ["前往传灵塔总部", "加入有合作资格的学院", "寻找合法名额渠道"]);
    const violent = /暴动期/.test(action);
    if (violent && requestedTier !== "初级") return impossible("当前暴动期团队规则只适用于已核验的初级升灵台路线。", ["申请常规中级名额", "申请初级暴动期名额", "核对入门卡"]);
    const companions = violent || requestedTier !== "初级" ? game.view.relations.filter((relation) => action.includes(relation.name)) : [];
    const uprisingEntryYears = current?.uprisingEntryYears ?? [];
    const currentYear = game.view.worldTime?.year ?? 0;
    if (violent && uprisingEntryYears.filter((year) => year === currentYear).length >= 2) return impossible("本年度两次暴动期进入记录已经用完，传灵塔不会再签发第三次同年名额。", ["等待下一原作年", "申请常规初级名额", "复盘已有暴动期记录"]);
    if (violent && (companions.length < 2 || companions.length > 6)) return impossible("暴动期团队申请必须明确点名二至六名同伴，加上玩家后不得超过七人。", ["写出全部同行者姓名", "缩减到七人以内", "改申请常规初级名额"]);
    if (requestedTier === "中级" && companions.length > 6) return impossible("中级升灵台同行者加玩家后不得超过七人。", ["缩减同行者", "分批使用入门卡", "核对团队名单"]);
    for (const companion of companions) {
      const trust = companion.dimensions?.trust ?? companion.strength ?? 0;
      const npc = companion.id ? game.world.npcs[companion.id] : undefined;
      if (trust < 45 || companion.category === "敌对") return impossible(`${companion.name}的信任不足以共同承担暴动期风险。`, [`继续与${companion.name}建立信任`, "更换可信同伴", "申请常规初级名额"]);
      if (npc && (!npc.alive || npc.locationId !== game.view.locationId)) return impossible(`${companion.name}当前不能在同一传灵塔受理点完成团队接入。`, [`与${companion.name}会合`, "调整进入日期", "更换同地同伴"]);
    }
    const advancedCredentialIndex = game.view.inventory.indexOf("高级升灵台授权凭证");
    const discountIndex = game.view.inventory.indexOf("高级升灵台半价资格");
    const entryFee = requestedTier === "中级" ? 0 : requestedTier === "高级" ? (discountIndex >= 0 ? 1_000_000 : 2_000_000) : violent ? 800_000 : 500_000;
    if (requestedTier === "中级") {
      const cardIndex = game.view.inventory.indexOf("中级升灵台入门卡");
      if (cardIndex < 0) return impossible("中级升灵台不能只靠现金预约，必须提交拍卖、交换或斗铠师福利取得的实名入门卡。", ["登记斗铠师福利", "核对中级入门卡", "申请常规初级名额"]);
      game.view.inventory.splice(cardIndex, 1);
    } else if (requestedTier === "高级") {
      if (advancedCredentialIndex < 0) return impossible("高级升灵台不能用现金直接购买，必须先提交传灵塔任务点换取的实名授权。", ["申请高级升灵台授权", "承接传灵塔任务", "使用中级入门卡"]);
      if (!/接受高级风险|同意高拟真风险|接受高冲击/.test(action)) return impossible("高级升灵台接入前必须明确接受高拟真痛觉、强脑波冲击与保护系统强制退出风险；普通授权仍不包含真实死亡核心层。", ["申请高级升灵台名额并接受高级风险", "阅读高拟真保护说明", "保留授权凭证"]);
      if (character.coins < entryFee) return impossible(`高级升灵台服务按当前统一账本折算需要${formatSoulCoins(entryFee)}${discountIndex >= 0 ? "（已应用斗铠师年度半价资格）" : ""}，当前资金不足；现金仍不能替代授权。`, ["积攒服务费用", "登记斗铠师年度半价资格", "保留高级授权"]);
      game.view.inventory.splice(advancedCredentialIndex, 1);
      const liveDiscountIndex = game.view.inventory.indexOf("高级升灵台半价资格");
      if (liveDiscountIndex >= 0) game.view.inventory.splice(liveDiscountIndex, 1);
      character.coins -= entryFee;
      recordEconomyTransaction(game, "支出", entryFee, "传灵塔高级升灵台受理处", "普通高级升灵台高拟真保护服务");
    } else {
      if (character.coins < entryFee) return impossible(`初级升灵台一次准入按现有统一账本折算需要${formatSoulCoins(entryFee)}，当前资金不足。`, ["积攒费用", "争取学院奖励名额", "承接传灵塔合规任务"]);
      character.coins -= entryFee;
      recordEconomyTransaction(game, "支出", entryFee, "传灵塔升灵台受理处", "初级升灵台单次名额与脑波保护服务");
    }
    game.view.spiritAscension = { status: "已预约", tier: requestedTier, riskMode: requestedTier === "高级" ? "高拟真保护" : "虚拟保护", mode: violent ? "暴动期" : "常规", companionNames: companions.map((item) => item.name), uprisingEntryYears: violent ? [...uprisingEntryYears, currentYear] : uprisingEntryYears, entryFee, encounters: 0, virtualDefeats: 0, spiritualEnergy: 0, pendingSpiritualEnergy: 0, neuralShock: 0, totalEntries: (current?.totalEntries ?? 0) + 1, bestYearsGained: current?.bestYearsGained ?? 0 };
    const entryProof = requestedTier === "中级" ? "核销一张实名中级入门卡" : requestedTier === "高级" ? `核销高级授权并支付${formatSoulCoins(entryFee)}${discountIndex >= 0 ? "（斗铠师年度半价）" : ""}` : `支付${formatSoulCoins(entryFee)}`;
    return { intent: "预约升灵台", minutes: 90, ruleSummary: `${entryProof}并取得一次${violent ? `暴动期团队（${companions.map((item) => item.name).join("、")}）` : companions.length ? `同行（${companions.map((item) => item.name).join("、")}）` : "常规"}${requestedTier}升灵台名额；${requestedTier === "高级" ? "风险模式为高拟真保护，不含真实核心层" : "尚未入舱，也尚未获得灵力"}。`, fallbackNarrative: "身份、修为、授权和名额逐项核验后，费用或入门卡才从账面划走。工作人员把求救信号和脑波警戒线讲了两遍，最后提醒：进去之后最重要的是清醒地出来。", suggestions: [`进入${requestedTier}升灵台`, "复核求救信号器", "检查魂环承受上限"] };
  }
  if (/进入|入舱|启动/.test(action)) {
    if (!current || current.status !== "已预约") return impossible("没有可使用的升灵台预约名额。", ["申请升灵台名额", "核对预约记录", "前往传灵塔受理点"]);
    current.status = "探索中";
    game.world.fatiguePoints += 6;
    return { intent: "进入升灵台", minutes: 30, ruleSummary: `完成脑波接入并进入${current.tier}升灵台${current.tier === "高级" ? "高拟真" : "虚拟"}森林；现实身体仍在保护舱内，普通高级授权没有切换到真实核心层。`, fallbackNarrative: "舱盖合拢后，金属顶棚被潮湿的树冠替代。求救信号器贴在掌心，风声和泥土气味都逼真得让人忘记身体还躺在外面。", suggestions: ["搜寻升灵台虚拟魂兽", "观察周围环境", "按动求救信号主动退出"] };
  }
  if (/搜寻|探索|遭遇|猎杀|击杀|战斗/.test(action) && /魂兽|升灵台/.test(action)) {
    if (!current || current.status !== "探索中") return impossible("当前并未处于升灵台探索中。", ["申请初级升灵台名额", "进入初级升灵台", "查看升灵台记录"]);
    const random = actionRandom(game);
    const violent = current.mode === "暴动期";
    const middle = current.tier === "中级";
    const advanced = current.tier === "高级";
    const beastYears = advanced ? integer(random, 6_000, 18_000) : middle ? integer(random, 1_000, 3_800) : violent ? integer(random, 300, 1_200) : integer(random, 80, 520);
    const perception = /优秀|顶尖/.test(character.abilityDescriptors.perception) ? (advanced ? 600 : 180) : 80;
    const teamSupport = (current.companionNames?.length ?? 0) * 140;
    const armorTier = character.battleArmors?.filter((item) => item.status === "完整").sort((a, b) => b.tier - a.tier)[0]?.tier ?? 0;
    const armorSupport = armorTier * (advanced ? 2_500 : 900);
    const combatCapacity = character.soulRank * (advanced ? 110 : 35) + activeRings.length * (advanced ? 300 : 120) + perception + teamSupport + armorSupport;
    const success = combatCapacity >= beastYears + integer(random, 0, advanced ? 700 : 280);
    current.encounters += 1;
    current.neuralShock = Math.min(100, current.neuralShock + (success ? integer(random, advanced ? 14 : violent || middle ? 8 : 5, advanced ? 24 : violent || middle ? 16 : 12) : integer(random, advanced ? 45 : middle ? 34 : 28, advanced ? 65 : middle ? 50 : 42)));
    if (success) {
      const energy = Math.max(8, Math.round(beastYears * (advanced ? .08 : violent ? .2 : middle ? .12 : .16)));
      current.virtualDefeats += 1;
      if (violent) current.pendingSpiritualEnergy = (current.pendingSpiritualEnergy ?? 0) + energy;
      else current.spiritualEnergy += energy;
    }
    const forcedExit = current.neuralShock >= 80;
    if (forcedExit) { current.status = "待结算"; current.exitReason = "脑波保护强制退出"; current.pendingSpiritualEnergy = 0; }
    game.world.fatiguePoints += success ? 12 : 22;
    return { intent: "升灵台遭遇", minutes: speedMinutes(game, 45, 120), ruleSummary: `${success ? `击败 ${beastYears} 年${advanced ? "高拟真" : "虚拟"}魂兽${violent ? "，灵力尚待百秒守护吸收" : "并吸收灵力"}` : `未能击败 ${beastYears} 年${advanced ? "高拟真" : "虚拟"}魂兽`}；已稳固灵力 ${current.spiritualEnergy}，待吸收 ${(current.pendingSpiritualEnergy ?? 0)}，脑波冲击 ${current.neuralShock}%。${forcedExit ? "保护系统已强制退出，未稳固灵力已经散失，普通高级层仍未把现实肉体判定为死亡。" : "仍可继续探索或主动求救退出。"}`, fallbackNarrative: success ? violent ? "虚拟魂兽崩散后，灵力仍在林间聚拢。队伍没有立刻抢下一只目标，而是拉开警戒圈；这百秒里若有人逼近，刚赢下来的收获仍可能全部散掉。" : advanced ? "巨兽碎成的光几乎灼穿视野，强烈痛觉和灵力同时压向精神世界。我能感觉到保护阈值正在逼近，也清楚这仍是普通高级层，不是可以混淆现实死亡的核心场域。" : "虚拟魂兽崩散成细碎光点，灵力没有立刻变成魂环年限，而是沿着武魂暂时沉积。林间又传来动静，我得决定贪下一次机会，还是带着已有收获离开。" : forcedExit ? "最后一次冲击像重锤砸进意识。眼前森林骤然熄灭，保护舱把我强制唤醒；身体没有真实伤口，眩晕和冷汗却一点不少。" : "攻击落空后，疼痛反馈几乎骗过了大脑。我按住求救信号器，没有急着再冲；这里不会轻易伤到肉体，不代表意识能无限承受。", suggestions: forcedExit ? ["结算升灵台灵力", "接受脑波检查", "查看本次记录"] : violent && (current.pendingSpiritualEnergy ?? 0) > 0 ? ["守护队友百秒吸收升灵台灵力", "按动求救信号主动退出", "观察其他魂师动向"] : ["继续搜寻升灵台虚拟魂兽", "按动求救信号主动退出", "观察安全路线"] };
  }
  if (/守护|百秒|完成吸收/.test(action) && /升灵台|灵力/.test(action)) {
    if (!current || current.status !== "探索中" || current.mode !== "暴动期") return impossible("只有暴动期探索中的未稳固灵力需要团队百秒守护。", ["查看升灵台状态", "继续常规探索", "主动退出升灵台"]);
    const pending = current.pendingSpiritualEnergy ?? 0;
    if (pending <= 0) return impossible("当前没有等待团队守护吸收的灵力。", ["搜寻升灵台虚拟魂兽", "观察其他魂师动向", "主动退出升灵台"]);
    current.spiritualEnergy += pending;
    current.pendingSpiritualEnergy = 0;
    current.neuralShock = Math.min(100, current.neuralShock + 6);
    return { intent: "升灵台团队守护", minutes: 2, ruleSummary: `团队完成百秒警戒，${pending} 点灵力从待吸收转为已稳固；同伴没有被折算成无条件数值奖励。`, fallbackNarrative: "百秒比战斗本身更慢。有人盯住林线，有人守着退路，直到最后一缕光真正沉进武魂，队伍才重新移动。", suggestions: ["继续搜寻升灵台虚拟魂兽", "主动退出升灵台", "检查队伍脑波状态"] };
  }
  if (/退出|求救|撤离/.test(action)) {
    if (!current || current.status !== "探索中") return impossible("当前没有正在进行的升灵台探索可退出。", ["查看升灵台记录", "申请初级升灵台名额", "进入初级升灵台"]);
    const lostPending = current.pendingSpiritualEnergy ?? 0;
    current.pendingSpiritualEnergy = 0;
    current.status = "待结算";
    current.exitReason = "主动求救";
    return { intent: "退出升灵台", minutes: 20, ruleSummary: `主动按动求救信号退出；带回 ${current.spiritualEnergy} 点待结算灵力${lostPending ? `，另有 ${lostPending} 点未完成吸收而散失` : ""}，现实身体没有新增外伤。`, fallbackNarrative: "信号按下后，森林像被从中撕开。舱盖升起时我先确认自己的手脚，再听工作人员复述脑波数据；主动离开保住了已经吸收的灵力，也终止了继续冒险。", suggestions: ["结算升灵台灵力", "接受脑波检查", "复盘虚拟魂兽遭遇"] };
  }
  if (/结算|吸收.*灵力|转化.*灵力/.test(action)) {
    if (!current || current.status !== "待结算") return impossible("当前没有已经退出且等待结算的升灵台灵力。", ["完成升灵台探索", "主动退出升灵台", "查看升灵台记录"]);
    const targets = [...activeRings, ...(character.soulSpirits ?? [])];
    if (!targets.length) return impossible("没有可承接灵力的魂环或魂灵，结算已暂停。", ["核对武魂档案", "联系传灵塔技术员", "不要丢弃本次记录"]);
    const perTarget = Math.floor(current.spiritualEnergy / targets.length);
    let gained = 0;
    if (perTarget > 0) {
      for (const ring of activeRings) { ring.years += perTarget; ring.color = ringColor(ring.years); gained += perTarget; }
      for (const spirit of character.soulSpirits ?? []) { spirit.years += perTarget; spirit.grade = soulSpiritGrade(spirit.years); gained += perTarget; }
      character.soulRings = activeRings;
    }
    current.status = "已结算";
    current.lastYearsGained = gained;
    current.bestYearsGained = Math.max(current.bestYearsGained, gained);
    return { intent: "结算升灵台", minutes: 120, ruleSummary: `将 ${current.spiritualEnergy} 点升灵台灵力按当前 ${targets.length} 个魂环/魂灵载体结算，累计增加 ${gained} 年；未把虚拟猎杀伪装成真实魂兽死亡。`, fallbackNarrative: gained > 0 ? "暂存的灵力被引导进魂灵与魂环，原有颜色和气息一点点加深。增长不算凭空跳级，每一段都能在传灵塔记录里追到这次遭遇。" : "带回的灵力太少，没能形成可登记的年限增长。工作人员仍保存了本次数据，没有把一次进入包装成必然变强。", suggestions: ["查看魂环年限", "复盘本次升灵台记录", "准备下一次合法名额"] };
  }
  return impossible("需要明确申请、进入、探索、退出或结算升灵台。", ["申请初级升灵台名额", "进入初级升灵台", "查看升灵台记录"]);
}

const BATTLE_ARMOR_PIECES = ["右手前臂甲", "左手前臂甲", "右肩大臂甲", "左肩大臂甲", "胸铠", "腰铠与战裙", "右腿足甲", "左腿足甲", "头盔"];
const BATTLE_ARMOR_MATERIALS: Record<1 | 2 | 3 | 4, { name: string; pattern: RegExp }> = {
  1: { name: "千锻斗铠金属胚料", pattern: /千锻斗铠金属胚料/ },
  2: { name: "灵锻斗铠金属胚料", pattern: /灵锻斗铠金属胚料/ },
  3: { name: "魂锻斗铠金属胚料", pattern: /魂锻斗铠金属胚料/ },
  4: { name: "天锻斗铠金属胚料", pattern: /天锻斗铠金属胚料/ },
};

function battleArmorResolution(game: StoredGame, action: string): ActionResolution {
  const era = game.view.era ?? 1;
  const character = game.view.character!;
  if (era < 3) return impossible("成熟斗铠体系尚未出现在当前时代。", ["研究金属与武魂共鸣", "制作当前时代的魂导护具", "核对技术年代"]);
  const tierToken = action.match(/([一二三四1-4])字斗铠/)?.[1] ?? "一";
  const tier = Math.max(1, Math.min(4, Number(tierToken.replace(/[一二三四]/, (value) => String("一二三四".indexOf(value) + 1))))) as 1 | 2 | 3 | 4;
  const rankRequirements = [0, 50, 60, 70, 90];
  if (character.soulRank < rankRequirements[tier]) return impossible(`${tier}字斗铠工程至少需要 ${rankRequirements[tier]} 级魂力来承受共鸣与增幅。`, ["继续修炼", "先学习斗铠设计", "寻找低负载训练护具"]);
  const isDesignAction = /设计|测量|推演|共鸣测试|适配/.test(action) && !/制作|锻造/.test(action);
  const playerDesign = game.view.professions.find((item) => item.name === "魂导器研究" && item.progress >= 35);
  const designer = game.view.relations.some((item) => /斗铠设计师|机甲设计师|魂导师/.test(`${item.name}${item.relation}`));
  if (isDesignAction && !playerDesign && !designer) return impossible("斗铠设计需要达到入门水平的魂导设计能力，或由可信的专业设计师参与。", ["学习魂导器设计", "寻找斗铠设计师", "先研究核心法阵"]);
  const battleArmors = character.battleArmors ?? [];
  const previous = tier > 1 ? battleArmors.find((armor) => armor.tier === tier - 1 && armor.status === "完整") : undefined;
  if (tier > 1 && !previous) return impossible(`必须先拥有完整的${tier - 1}字斗铠，才能升华到${tier}字。`, [`完成${tier - 1}字斗铠`, "改良现有斗铠", "提升锻造与设计能力"]);

  let armor = battleArmors.find((item) => item.tier === tier);
  if (!armor) {
    if (!isDesignAction) return impossible(`尚未完成${tier}字斗铠立项与适配设计，不能直接检查或制造部件。`, [`设计${tier}字斗铠`, "寻找斗铠设计师", "先准备工程档案"]);
    armor = { tier, title: `${tier}字斗铠`, pieces: [], completion: 0, compatibility: 0, status: "设计中", maker: character.name };
    battleArmors.push(armor);
    character.battleArmors = battleArmors;
  }
  if (!game.view.battleArmorProject || game.view.battleArmorProject.tier !== tier) {
    if (!isDesignAction) return impossible(`当前没有进行中的${tier}字斗铠工程。`, [`设计${tier}字斗铠`, "检查已有斗铠", "准备升级方案"]);
    game.view.battleArmorProject = { tier, blueprintProgress: 0, compatibility: 0, failedPieces: 0, nextPiece: BATTLE_ARMOR_PIECES[0] };
  }
  const project = game.view.battleArmorProject;

  if (isDesignAction) {
    const perception = character.abilityDescriptors.perception === "顶尖" ? 8 : character.abilityDescriptors.perception === "优秀" ? 4 : 1;
    const gain = integer(actionRandom(game), 17, 27) + perception;
    project.blueprintProgress = Math.min(100, project.blueprintProgress + gain);
    project.compatibility = Math.min(98, 45 + Math.round(project.blueprintProgress * .45) + perception);
    armor.compatibility = project.compatibility;
    return { intent: "斗铠设计", minutes: speedMinutes(game, 240, 960), ruleSummary: `${tier}字斗铠图纸进度增加 ${gain}%，当前 ${project.blueprintProgress}%；武魂适配 ${project.compatibility}%。`, fallbackNarrative: "尺寸不是照着身体抄一遍就够了。我让武魂连续释放三次，把魂力经过肩、肘和掌心时的偏差逐个写进图纸。最后那条线改完，甲片才不会在发力时反过来卡住自己。", suggestions: project.blueprintProgress >= 100 ? [`制作${tier}字斗铠${project.nextPiece}`, "请同伴复核图纸", "准备稀有金属"] : ["继续设计斗铠", "测试武魂共鸣", "寻找斗铠设计师复核"] };
  }
  if (/查看|检查|进度/.test(action)) {
    return { intent: "检查斗铠工程", minutes: 10, ruleSummary: `${armor.title}已完成 ${armor.pieces.length}/${BATTLE_ARMOR_PIECES.length} 件，图纸 ${project.blueprintProgress}%，适配 ${project.compatibility}%，失败 ${project.failedPieces} 次。`, fallbackNarrative: `我把已经完成的甲片按身体位置排开。${project.nextPiece}仍是空位，图纸边缘留着几处还没解决的魂力回路。`, suggestions: project.blueprintProgress < 100 ? ["继续设计斗铠", "测试武魂共鸣", "请人复核图纸"] : [`制作${tier}字斗铠${project.nextPiece}`, "购买斗铠稀有金属", "请锻造师协作"] };
  }
  if (/制作|锻造|打造|组装|升华/.test(action)) {
    if (project.blueprintProgress < 100) return impossible(`图纸只有 ${project.blueprintProgress}%，不能在关键魂力回路未闭合时制作。`, ["继续设计斗铠", "测试武魂共鸣", "请斗铠设计师复核"]);
    const requiredMaterial = BATTLE_ARMOR_MATERIALS[tier];
    const metalIndex = game.view.inventory.findIndex((item) => requiredMaterial.pattern.test(item));
    if (metalIndex < 0) return impossible(`下一件${tier}字斗铠缺少${requiredMaterial.name}。`, [`购买${requiredMaterial.name}`, "委托锻造师准备胚料", "检查仓库存料"]);
    const craft = game.view.professions.find((item) => /锻造|炼器/.test(item.name));
    const design = game.view.professions.find((item) => item.name === "魂导器研究");
    const collaborator = game.view.relations.some((item) => /锻造师|制造师|机甲师|魂导师/.test(`${item.name}${item.relation}`));
    if ((craft?.progress ?? 0) < 35 && !collaborator) return impossible("斗铠部件制造需要达到入门水平的锻造/制造能力，或由可信的专业制造者参与。", ["学习锻造与炼器", "寻找斗铠制造师", "委托锻造师协作"]);
    if ((craft?.progress ?? 0) < 35 && (design?.progress ?? 0) < 35) return impossible("斗铠必须由使用者亲自参与至少一种第二职业工序，不能把设计和制造全部外包。", ["学习魂导器设计", "学习锻造与炼器", "先完成个人参与记录"]);
    const expertise = (craft?.progress ?? 0) + (design?.progress ?? 0) * .5 + (collaborator ? 24 : 0);
    const random = actionRandom(game);
    const success = random() < Math.min(.94, .48 + expertise / 180 + project.compatibility / 300 - tier * .07);
    game.view.inventory.splice(metalIndex, 1);
    if (!success) {
      project.failedPieces += 1;
      if (craft) craft.failures += 1;
      return { intent: "斗铠制作", minutes: speedMinutes(game, 480, 1920), ruleSummary: `${project.nextPiece}制作失败，稀有金属胚料已损耗；失败记录 ${project.failedPieces} 次。`, fallbackNarrative: "金属在最后一次收束时出现了肉眼几乎看不见的分层。继续刻阵也能亮，但承受一次全力爆发就可能崩开。我把这块失败件作废，没有把隐患藏进盔甲里。", suggestions: ["分析金属分层原因", "重新准备稀有金属", "请锻造师协作"] };
    }
    const piece = project.nextPiece;
    armor.pieces.push(piece);
    armor.completion = Math.round(armor.pieces.length / BATTLE_ARMOR_PIECES.length * 100);
    armor.status = armor.pieces.length >= BATTLE_ARMOR_PIECES.length ? "完整" : "制作中";
    project.nextPiece = BATTLE_ARMOR_PIECES[armor.pieces.length] ?? "套装共鸣测试";
    if (armor.status === "完整") {
      game.view.battleArmorProject = undefined;
      character.reputation = `${tier}字斗铠师`;
    }
    return { intent: "斗铠制作", minutes: speedMinutes(game, 480, 1920), ruleSummary: `${piece}制作成功；${armor.title}完成度 ${armor.completion}%，适配 ${armor.compatibility}%。`, fallbackNarrative: armor.status === "完整" ? `最后一件甲片扣合时，前面八件依次亮起。魂力不再分段停留，整套斗铠沿着武魂的节奏完成了一次呼吸。它没有凭空让我无敌，但每一处增幅都能解释、测试和维护。` : `${piece}第一次启动没有出现过热。我拆下、复测、再装回，确认接口能和已有甲片同时共鸣，才在工程册上划掉这一项。`, suggestions: armor.status === "完整" ? ["测试完整斗铠", "为斗铠命名", "记录维护周期"] : [`制作${tier}字斗铠${project.nextPiece}`, "检查套装共鸣", "补充稀有金属"], systemMessages: [`斗铠 · ${armor.title} · ${piece}`] };
  }
  return impossible("需要明确进行斗铠设计、检查进度或制作具体部件。", ["设计一字斗铠", "查看斗铠进度", "制作斗铠部件"]);
}

function mechaResolution(game: StoredGame, action: string): ActionResolution {
  if ((game.view.era ?? 1) < 3) return impossible("当前时代没有成熟的现代机甲训练与驾驶资质体系。", ["研究当前时代的魂导器", "核对技术年代", "训练武魂实战"]);
  const mecha = game.view.mecha ??= { license: "无", simulatorProgress: 0, simulatorSessions: 0, practicalPasses: 0 };
  const licenses = ["无", "白级", "黄级", "紫级", "黑级"] as const;
  if (/模拟|训练|课程|练习/.test(action) && !/购买|订购/.test(action)) {
    const perception = game.view.character!.abilityDescriptors.perception === "顶尖" ? 6 : game.view.character!.abilityDescriptors.perception === "优秀" ? 3 : 0;
    const gain = integer(actionRandom(game), 9, 17) + perception;
    mecha.simulatorProgress = Math.min(100, mecha.simulatorProgress + gain);
    mecha.simulatorSessions += 1;
    game.world.fatiguePoints += 10;
    return { intent: "机甲模拟训练", minutes: speedMinutes(game, 120, 480), ruleSummary: `完成第 ${mecha.simulatorSessions} 次模拟训练，驾驶进度增加 ${gain}%，当前 ${mecha.simulatorProgress}%。`, fallbackNarrative: "模拟舱把过载、盲区和迟滞都照实还原。第一次转向太急，虚拟机体在建筑边缘擦出整片警告。我重新跑同一段路线，直到手脚动作不再互相抢指令。", suggestions: ["继续机甲模拟训练", "参加白级机甲驾驶考核", "复盘失误记录"] };
  }
  if (/设计|定制|适配方案/.test(action) && /紫级|黑级/.test(action)) {
    const requested = action.includes("黑级") ? "黑级" as const : "紫级" as const;
    if (licenses.indexOf(mecha.license) < licenses.indexOf(requested)) return impossible(`必须先取得${requested}驾驶资质，才能把真实操控记录写入专属设计。`, [`参加${requested}机甲考核`, "继续模拟训练", "寻找机甲设计师"]);
    const specialist = game.view.relations.find((item) => /机甲设计师|机甲制造师|机甲修理师|魂导师/.test(`${item.name}${item.relation}`));
    if (!specialist) return impossible(`${requested}机甲需要可信的设计、制造或魂导专业人员协作，不能凭空完成专属方案。`, ["寻找可信机甲设计师", "培养机甲制造第二职业", "继续使用黄色制式机甲"]);
    if (!mecha.customDesign || mecha.customDesign.grade !== requested || mecha.customDesign.martialSoulName !== game.view.character!.martialSoul.name) {
      mecha.customDesign = { grade: requested, progress: 0, sessions: 0, specialistId: specialist.id, specialistName: specialist.name, martialSoulName: game.view.character!.martialSoul.name };
    }
    mecha.customDesign.sessions += 1;
    mecha.customDesign.progress = Math.min(100, mecha.customDesign.progress + 34);
    return { intent: "机甲专属设计", minutes: speedMinutes(game, 360, 1_440), ruleSummary: `${specialist.name}协作完成第 ${mecha.customDesign.sessions} 轮${requested}机甲武魂适配，专属方案进度 ${mecha.customDesign.progress}%。`, fallbackNarrative: "设计桌上没有现成答案。武魂释放时的重心、魂技作用距离与精神操控延迟被逐项写入模型，设计师把不合身的通用结构一处处删掉。", suggestions: [mecha.customDesign.progress < 100 ? `继续设计${requested}专属机甲` : `订购${requested}专属机甲`, "复核武魂适配数据", "核对制造与维护预算"] };
  }
  if (/考核|执照|认证/.test(action)) {
    const requested = (["黑级", "紫级", "黄级", "白级"] as const).find((level) => action.includes(level)) ?? "白级";
    const targetIndex = licenses.indexOf(requested);
    const currentIndex = licenses.indexOf(mecha.license);
    if (targetIndex !== currentIndex + 1) return impossible("机甲驾驶资质必须按白、黄、紫、黑逐级考核。", [`参加${licenses[currentIndex + 1] ?? "下一等级"}机甲考核`, "继续模拟训练", "查看资质"]);
    const requiredProgress = targetIndex * 22;
    const requiredSessions = targetIndex * 3;
    const character = game.view.character!;
    if (character.age < 12) return impossible("未满十二岁只能学习机甲理论和使用受监护的模拟舱，不能参加真实机体驾驶考核。", ["继续机甲模拟训练", "学习机甲安全规范", "等待达到实操年龄"]);
    const requiredSoulRank = requested === "紫级" ? 10 : requested === "黑级" ? 60 : 0;
    if (character.soulRank < requiredSoulRank) return impossible(`${requested}机甲要求至少 ${requiredSoulRank} 级魂力；普通人最多只能稳定驾驭黄色制式机甲。`, ["提升魂力修为", "继续低级机甲训练", "学习机甲结构"]);
    if (requested === "黑级" && !/优秀|顶尖/.test(character.abilityDescriptors.perception)) return impossible("黑色超级机甲除六环修为外还要求足以辅助操控的高阶精神感知。", ["训练精神感知", "继续紫级专属机甲训练", "请高级机甲师评估"]);
    const institution = game.view.affiliations.some((item) => /学院|联邦|军|机甲|史莱克/.test(item.name));
    if (!institution) return impossible("正式驾驶考核需要学院、联邦交通或军方训练机构受理。", ["加入有资质的学院", "寻找公开考点", "继续模拟训练"]);
    if (mecha.simulatorProgress < requiredProgress || mecha.simulatorSessions < requiredSessions) return impossible(`${requested}考核至少需要 ${requiredProgress}% 训练进度和 ${requiredSessions} 次模拟记录。`, ["继续机甲模拟训练", "复盘失误记录", "预约后续考核"]);
    mecha.license = requested;
    mecha.practicalPasses += 1;
    return { intent: "机甲驾驶考核", minutes: speedMinutes(game, 240, 960), ruleSummary: `通过路线、故障处置与紧急制动考核，取得${requested}机甲驾驶资质。`, fallbackNarrative: "考核不是打一场漂亮的模拟战。动力故障、平民避让和强制迫降各来了一次。机体停回黄线内后，考官才把新等级写进驾驶档案。", suggestions: ["查看资质权限", "继续高级模拟训练", mecha.model ? "维护自有机甲" : requested === "白级" ? "申请租用白色教学机甲" : `筹备${requested}机甲`], systemMessages: [`资质 · ${requested}机甲驾驶`] };
  }
  if (/购买|订购/.test(action)) {
    if (mecha.license === "无") return impossible("没有机甲驾驶资质，正规渠道不会出售可驾驶机体。", ["参加白级机甲考核", "继续模拟训练", "租用带教训练机"]);
    const requested = (["黑级", "紫级", "黄级", "白级"] as const).find((level) => action.includes(level)) ?? mecha.license;
    const levelIndex = licenses.indexOf(requested);
    if (levelIndex > licenses.indexOf(mecha.license)) return impossible(`当前只有${mecha.license}驾驶资质，不能取得${requested}机甲。`, [`参加${requested}机甲考核`, "继续模拟训练", "查看资质"]);
    const character = game.view.character!;
    if (character.age < 16) return impossible("未成年人不能独立登记大型机甲所有权，只能通过学院或训练机构租用教学机。", ["申请租用白色教学机甲", "使用学院模拟舱", "由监护人与机构审核"]);
    const militaryMember = game.view.affiliations.some((item) => /联邦舰队|军团|军方|战神殿/.test(item.name));
    if (/军用|武装|制式战斗/.test(action) && !militaryMember) return impossible("军用制式机甲不向普通学生和民间个人直接出售。", ["购买民用训练机甲", "申请军方岗位", "租用学院教学机"]);
    const specialist = game.view.relations.some((item) => /机甲设计师|机甲制造师|机甲修理师|魂导师/.test(`${item.name}${item.relation}`));
    if ((requested === "紫级" || requested === "黑级") && !specialist) return impossible(`${requested}机甲必须围绕驾驶者武魂完成专属设计、制造和维护，不能购买通用成品。`, ["寻找可信机甲设计师", "培养机甲制造第二职业", "继续使用黄色制式机甲"]);
    if ((requested === "紫级" || requested === "黑级") && (mecha.customDesign?.grade !== requested || mecha.customDesign.martialSoulName !== character.martialSoul.name || mecha.customDesign.progress < 100)) return impossible(`${requested}机甲必须先完成与当前武魂一致的专属设计方案，认识设计师不能替代实际协作。`, [`设计${requested}专属机甲`, "复核武魂适配数据", "继续使用黄色制式机甲"]);
    if (requested === "紫级" && character.soulRank < 10) return impossible("紫色专属机甲必须由魂师驾驭。", ["成为正式魂师", "继续黄色机甲训练", "学习专属机甲设计"]);
    if (requested === "黑级" && (character.soulRank < 60 || !/优秀|顶尖/.test(character.abilityDescriptors.perception))) return impossible("黑色超级机甲至少要求魂帝修为与高阶精神感知，并且只能绑定一位主人。", ["提升至六环", "训练精神感知", "完善专属设计"]);
    const costs: Record<typeof requested, number> = { 白级: 5_000, 黄级: 30_000, 紫级: 240_000, 黑级: 2_000_000 };
    const cost = costs[requested];
    if (character.coins < cost) return impossible(`${requested}机甲的合规取得、登记和初次维护至少需要${formatSoulCoins(cost)}。`, ["积攒资金", "申请学院训练机", "先租用机甲"]);
    character.coins -= cost;
    mecha.model = requested === "白级" ? "白色基础教学机甲" : requested === "黄级" ? "黄色民用制式机甲" : requested === "紫级" ? `紫色${character.martialSoul.name}专属机甲` : `黑色${character.martialSoul.name}超级机甲`;
    mecha.condition = "完好";
    mecha.energy = 100;
    mecha.ownerId = character.id;
    mecha.ownerName = character.name;
    return { intent: "购买机甲", minutes: 180, ruleSummary: `支付${formatSoulCoins(cost)}，登记并取得${mecha.model}；所有权与驾驶资质均已核验。`, fallbackNarrative: "机体编号、能源记录和维修历史一项不少。付款后，登记员把所有权转到我的档案名下，我绕着外壳检查一圈，没把展厅灯光当成完好证明。", suggestions: ["进行低速试驾", "检查机甲维护手册", "购买备用能源"] };
  }
  if (/转让|过户|出售给/.test(action)) {
    if (!mecha.model) return impossible("当前没有登记在名下的机甲可供转让。", ["查看机甲登记", "购买合规机甲", "使用学院模拟舱"]);
    if (mecha.license === "黑级") return impossible(`黑色超级机甲的核心操控与${mecha.ownerName ?? "原主人"}唯一绑定，不能通过普通交易转让给另一名驾驶者。`, ["保留原主人登记", "封存黑级机甲", "由专业团队解除非核心部件"]);
    return impossible("机甲过户需要核验受让人的同级驾驶资质、年龄、资金与登记机构，本行动尚未提供合格受让人。", ["指定有资质的成年受让人", "前往登记机构核验", "保留当前所有权"]);
  }
  if (/驾驶|启动|出击|使用/.test(action)) {
    if (!mecha.model || mecha.condition === "大修") return impossible("当前没有可安全启动的自有机甲。", ["购买合规机甲", "完成机甲维修", "使用模拟舱训练"]);
    if ((mecha.energy ?? 0) < 10) return impossible("机甲能源不足，无法安全启动。", ["补充机甲能源", "检查能源泄漏", "改用其他交通方式"]);
    mecha.energy = Math.max(0, (mecha.energy ?? 0) - 10);
    return { intent: "驾驶机甲", minutes: 60, ruleSummary: `完成一次许可范围内的机甲驾驶，剩余能源 ${mecha.energy}%。`, fallbackNarrative: "自检灯依次转绿后，我才接通主动力。机体迈出第一步时仍有迟滞，训练里背熟的动作必须按真实重量重新修正。", suggestions: ["记录操控偏差", "补充机甲能源", "进行维护检查"] };
  }
  return impossible("需要明确选择机甲训练、考核、购买或驾驶。", ["进行机甲模拟训练", "参加机甲驾驶考核", "查看机甲状态"]);
}

function starshipResolution(game: StoredGame, action: string): ActionResolution {
  if ((game.view.era ?? 1) < 4) return impossible("当前时代尚未形成可供个人训练与远航的星舰体系。", ["核对技术年代", "训练机甲与魂导器", "研究早期航天资料"]);
  const character = game.view.character!;
  if (/模拟|训练|课程|推演/.test(action) && character.age < 7) return impossible("七岁前只能接触星舰常识和安全启蒙，不能把儿童娱乐模拟算作战舰驾驶训练记录。", ["学习星舰基础常识", "参观民用飞船", "等待进入基础驾驶课程"]);
  const starship = game.view.starship ??= { license: "无", simulatorProgress: 0, simulatorSessions: 0, crew: [], missionsCompleted: 0, crewDrills: 0, crewCoordination: 0, crewEvidence: [] };
  starship.loggedFlightHours ??= 0;
  starship.crewDrills ??= 0;
  starship.crewCoordination ??= 0;
  starship.crewEvidence ??= [];
  const licenses = ["无", "见习指挥", "三级指挥", "二级指挥", "一级指挥"] as const;

  if (/参谋部.*述职|述职.*参谋部|入舰述职/.test(action)) {
    const fleet = game.view.affiliations.find((item) => item.militaryRank && /舰队|军/.test(item.name));
    if (!fleet || character.age < 18) return impossible("舰队参谋部只受理已满十八岁且拥有现役军籍的人员述职；学院身份、荣誉称号或模拟资格不能替代军籍。", ["加入联邦舰队", "等待达到现役年龄", "继续学院训练"]);
    const onboarding = starship.fleetOnboarding ??= { status: "未述职", trainingDays: 0, trainingEvidence: [], assignmentEvidence: [] };
    if (onboarding.status !== "未述职") return impossible(`参谋部述职已经登记，当前阶段为${onboarding.status}。`, ["参加入舰培训", "查看培训证据", "等待岗位分配"]);
    onboarding.status = "培训中";
    onboarding.reportedAt = relationshipDate(game);
    onboarding.assignmentEvidence = [`${fleet.name}${fleet.militaryRank}军籍已核验`, `参谋部述职登记于${onboarding.reportedAt}`];
    return { intent: "舰队参谋部述职", minutes: 180, ruleSummary: `完成舰队参谋部军籍、资格与履历核验；进入一个月入舰培训，尚未分配部门或岗位。`, fallbackNarrative: "参谋部没有因为军衔先安排座位。军籍、真实航时、训练记录和既往任务被逐页核过，最后只发下一张培训表；具体去哪个部门，要等一个月后再看成绩。", suggestions: ["参加航线与指挥培训", "参加损管与动力培训", "参加作战与登陆培训"], systemMessages: ["舰队入职 · 已述职 · 培训中"] };
  }

  if (/入舰培训|舰队培训|参谋培训|作战部培训|航线与指挥培训|损管与动力培训|作战与登陆培训|军纪与保密培训/.test(action)) {
    const onboarding = starship.fleetOnboarding;
    if (!onboarding || onboarding.status === "未述职") return impossible("尚未在舰队参谋部完成述职，培训成绩不能写入正式入舰档案。", ["向舰队参谋部述职", "核验现役军籍", "继续学院课程"]);
    if (onboarding.status === "已分配") return impossible("一个月入舰培训已经结业并完成岗位分配，应按当前部门职责行动。", ["查看岗位职责", "领取部门事务", "申请后续轮训"]);
    const module = /损管|动力|轮机/.test(action) ? "损管与动力" : /作战|登陆|战术/.test(action) ? "作战与登陆" : /军纪|保密|纪律/.test(action) ? "军纪与保密" : "航线与指挥";
    onboarding.trainingDays += 7;
    onboarding.trainingEvidence.push({ date: relationshipDate(game), module, result: "完成七日受监督训练与书面考核；模拟成绩未计为真实航时" });
    onboarding.trainingEvidence = onboarding.trainingEvidence.slice(-12);
    const modules = new Set(onboarding.trainingEvidence.map((item) => item.module));
    if (onboarding.trainingDays >= 30 && modules.size >= 3) onboarding.status = "待分配";
    game.world.fatiguePoints += 9;
    return { intent: "舰队入舰培训", minutes: 7 * 1_440, ruleSummary: `完成${module}七日培训；累计${onboarding.trainingDays}/30天，已覆盖${modules.size}/3类必要模块${onboarding.status === "待分配" ? "，达到岗位评估条件" : ""}。`, fallbackNarrative: "训练表按天签字，漏掉的警报、错误口令和迟到交接都留在原页。七天结束时只有本模块合格，不会把模拟课时改写成真实航时。", suggestions: onboarding.status === "待分配" ? ["申请参谋部岗位评估", "申请作战部岗位评估", "复核一个月培训档案"] : ["继续不同模块入舰培训", "检查培训覆盖", "休息恢复"] };
  }

  if (/岗位评估|岗位分配|分配.*(?:参谋部|作战部)|申请.*(?:参谋部|作战部)岗位/.test(action)) {
    const onboarding = starship.fleetOnboarding;
    if (!onboarding || onboarding.status !== "待分配") return impossible("岗位分配必须在参谋部述职并完成至少三十天、三类模块的入舰培训后进行。", ["向舰队参谋部述职", "完成一个月入舰培训", "查看培训档案"]);
    const wantsStaff = /参谋部/.test(action);
    const modules = new Set(onboarding.trainingEvidence.map((item) => item.module));
    if (wantsStaff) {
      if (!/优秀|顶尖/.test(character.abilityDescriptors.perception) || starship.simulatorSessions < 6 || !modules.has("航线与指挥") || !modules.has("军纪与保密")) return impossible("参谋部见习岗位要求高精神感知、至少六次指挥模拟，以及航线和保密模块合格；军衔本身不能替代岗位能力。", ["继续指挥模拟", "完成军纪与保密培训", "申请作战部评估"]);
      onboarding.assignedDepartment = "舰队参谋部";
      onboarding.assignedPost = "航线与情报见习参谋";
    } else {
      if (!modules.has("作战与登陆") || !modules.has("损管与动力") || game.world.metrics.battlesWon < 1) return impossible("护卫舰作战部见习岗位要求作战与登陆、损管与动力模块合格，并有至少一次可核验实战经历。", ["完成作战与登陆培训", "完成损管与动力培训", "积累可核验实战记录"]);
      onboarding.assignedDepartment = "龙王级护卫舰作战部";
      onboarding.assignedPost = "登陆作战见习队员";
    }
    onboarding.status = "已分配";
    onboarding.assignmentEvidence ??= [];
    onboarding.assignmentEvidence.push(`一个月培训${onboarding.trainingDays}天、${modules.size}类模块通过`, `${onboarding.assignedDepartment}依据能力与履历分配${onboarding.assignedPost}`);
    return { intent: "舰队岗位分配", minutes: 240, ruleSummary: `参谋部依据${onboarding.trainingDays}天培训、${modules.size}类模块与实际履历，将岗位分配至${onboarding.assignedDepartment}·${onboarding.assignedPost}。`, fallbackNarrative: "岗位表不是我自己填的。参谋把训练页、模拟记录和实战履历并排核过，划掉不符合的部门，最后才在一处空缺上盖章。", suggestions: ["查看岗位职责", "领取部门事务", "参加岗位轮值"], systemMessages: [`舰队岗位 · ${onboarding.assignedDepartment} · ${onboarding.assignedPost}`] };
  }

  if (/带教航次|实习航次|随舰训练|真实飞行/.test(action)) {
    if (licenses.indexOf(starship.license) < 1) return impossible("真实随舰训练至少需要见习指挥资格，兴趣课和娱乐模拟不能登记为飞行时长。", ["参加见习指挥考核", "继续基础模拟训练", "申请星际学院课程"]);
    const institution = game.view.affiliations.find((item) => /舰队|星际|史莱克|联邦|学院/.test(item.name));
    if (!institution) return impossible("随舰航次必须由星际学院或舰队安排并签署值勤记录。", ["加入星际学院", "申请舰队岗位", "继续模拟训练"]);
    const hours = integer(actionRandom(game), 8, 18);
    starship.loggedFlightHours += hours;
    if (institution.militaryRank) institution.flightHours = (institution.flightHours ?? 0) + hours;
    return { intent: "随舰训练航次", minutes: hours * 60, ruleSummary: `完成 ${hours} 小时真实随舰轮值；累计真实飞行 ${starship.loggedFlightHours} 小时。模拟时长未计入。`, fallbackNarrative: `离开模拟舱以后，每一次换班都有人签字。航向偏差、轮机警报和交接遗漏写进值勤表，靠港后才汇总成真正的飞行时长。`, suggestions: ["复盘随舰记录", "申请下一次航次", "领取舰队事务"] };
  }

  if (/船员协同|舰桥协同|损管演练|岗位轮值|全舰演练/.test(action)) {
    const requiredRoles = ["驾驶员", "导航员", "轮机师"];
    const missing = requiredRoles.filter((role) => !starship.crew.some((member) => member.role === role));
    if (missing.length) return impossible(`舰桥协同演练至少需要驾驶、导航和轮机岗位，当前缺少：${missing.join("、")}。`, missing.map((role) => `招募${role}`));
    const drill = /损管/.test(action) ? "舰体破损、动力隔离与撤离损管演练" : /轮值/.test(action) ? "跨班次岗位轮值与交接演练" : "舰桥航向、动力与警报协同演练";
    const gain = integer(actionRandom(game), 6, 11);
    starship.crewDrills += 1;
    starship.crewCoordination = Math.min(100, starship.crewCoordination + gain);
    for (const member of starship.crew) member.readiness = Math.min(100, member.readiness + Math.max(2, Math.floor(gain / 2)));
    starship.crewEvidence.push({ date: relationshipDate(game), drill, roles: starship.crew.map((member) => member.role), result: `协同增加${gain}，逐项记录误差、交接与否决危险命令的责任` });
    starship.crewEvidence = starship.crewEvidence.slice(-20);
    game.world.fatiguePoints += 10;
    return { intent: "星舰船员协同演练", minutes: speedMinutes(game, 180, 720), ruleSummary: `完成第${starship.crewDrills}次${drill}；舰桥协同提升至${starship.crewCoordination}%，各岗位准备度同步更新。`, fallbackNarrative: "这次没有把所有报警都交给舰长。驾驶守住姿态，导航重新算返航窗，轮机隔离故障回路；每次口令延迟和交接遗漏都被记下来，演练结束后逐条追责复盘。", suggestions: ["进行损管演练", "安排岗位轮值", "复核船员协同记录"], systemMessages: [`舰桥协同 · ${starship.crewCoordination}%`] };
  }

  if (/模拟|训练|课程|推演/.test(action) && !/购买|招募/.test(action)) {
    starship.trainingStartedAge ??= character.age;
    const gain = integer(actionRandom(game), 8, 15) + (game.view.character!.abilityDescriptors.perception === "顶尖" ? 5 : 1);
    starship.simulatorProgress = Math.min(100, starship.simulatorProgress + gain);
    starship.simulatorSessions += 1;
    game.world.fatiguePoints += 12;
    return { intent: "星舰指挥训练", minutes: speedMinutes(game, 180, 720), ruleSummary: `完成第 ${starship.simulatorSessions} 次基础驾驶/舰桥模拟，训练始于 ${starship.trainingStartedAge} 岁，进度增加 ${gain}%，当前 ${starship.simulatorProgress}%。`, fallbackNarrative: "课程没有让我直接坐上舰长席。魂导车辆、飞行器、星际战机和舰桥岗位被拆成不同阶段；屏幕上的补给、航向、动力和撤离窗口同时跳出警报，每个被忽略的信号都对应一名可能回不了家的船员。", suggestions: ["继续基础驾驶训练", "复盘模拟事故", "核对资格年限"] };
  }
  if (/考核|执照|认证/.test(action)) {
    const requested = (["一级指挥", "二级指挥", "三级指挥", "见习指挥"] as const).find((level) => action.includes(level)) ?? "见习指挥";
    const targetIndex = licenses.indexOf(requested);
    const currentIndex = licenses.indexOf(starship.license);
    if (targetIndex !== currentIndex + 1) return impossible("星舰指挥资格必须逐级取得，不能跳级。", [`参加${licenses[currentIndex + 1] ?? "下一等级"}考核`, "继续舰桥模拟", "查看指挥档案"]);
    const minimumAges = [0, 12, 18, 24, 30];
    const trainingYears = [0, 3, 12, 20, 25];
    const requiredSessions = targetIndex * 6;
    const requiredProgress = [0, 25, 55, 75, 95][targetIndex];
    const yearsStudied = starship.trainingStartedAge === undefined ? 0 : character.age - starship.trainingStartedAge;
    if (character.age < minimumAges[targetIndex] || yearsStudied < trainingYears[targetIndex]) return impossible(`${requested}至少要求 ${minimumAges[targetIndex]} 岁，并有 ${trainingYears[targetIndex]} 年连续基础驾驶与战舰专业训练；当前记录 ${yearsStudied} 年。`, ["继续基础驾驶训练", "完成高等学院战舰课程", "积累星际飞行时间"]);
    if (targetIndex >= 2 && !/优秀|顶尖/.test(character.abilityDescriptors.perception)) return impossible("正式战舰岗位需要高精神力支撑复杂信息处理；当前精神感知尚未达到课程评估标准。", ["训练精神感知", "继续模拟课程", "申请专业评估"]);
    const institution = game.view.affiliations.some((item) => /舰队|星际|史莱克|联邦|学院/.test(item.name));
    if (!institution) return impossible("星舰指挥考核需要舰队或星际学院受理。", ["加入联邦舰队", "申请星际学院", "继续模拟训练"]);
    if (starship.simulatorSessions < requiredSessions || starship.simulatorProgress < requiredProgress) return impossible(`${requested}至少需要 ${requiredSessions} 次模拟记录与 ${requiredProgress}% 指挥进度。`, ["继续星舰模拟训练", "复盘舰桥事故", "预约下一场考核"]);
    starship.license = requested;
    return { intent: "星舰指挥考核", minutes: speedMinutes(game, 360, 1440), ruleSummary: `通过航线规划、损管与撤离考核，取得${requested}资格。`, fallbackNarrative: "最后一道题不是消灭敌舰，而是在动力不足时决定先救哪一艘民船。我提交命令后，考官逐条追问代价。所有数字能对上，他才把资格写入舰队档案。", suggestions: ["组建基础船员组", "继续高级舰桥训练", "申请训练航次"], systemMessages: [`资格 · ${requested}`] };
  }
  if (/招募|邀请|任命/.test(action) && /船员|驾驶员|导航员|轮机师|战术员|医疗员|舰员/.test(action)) {
    const role = (["驾驶员", "导航员", "轮机师", "战术员", "医疗员"] as const).find((item) => action.includes(item)) ?? "驾驶员";
    if (starship.crew.some((member) => member.role === role)) return impossible(`${role}岗位已经有人，需要先处理现有任命。`, ["招募其他岗位", "检查船员状态", "调整岗位分工"]);
    const professionallyFit = (item: typeof game.view.relations[number]) => role === "驾驶员"
      ? /驾驶|飞行员|舰员|星际/.test(`${item.name}${item.relation}${item.impression}`)
      : role === "导航员"
        ? /导航|星图|航线/.test(`${item.name}${item.relation}${item.impression}`)
      : role === "轮机师"
          ? /轮机|工程|维修|动力/.test(`${item.name}${item.relation}${item.impression}`)
          : role === "战术员"
            ? /战术|作战|侦察|控制|军官/.test(`${item.name}${item.relation}${item.impression}`)
            : /医疗|医师|治疗|药师|救护/.test(`${item.name}${item.relation}${item.impression}`);
    const relation = game.view.relations.find((item) => action.includes(item.name) && professionallyFit(item) && (item.dimensions?.trust ?? item.strength ?? 0) >= 30)
      ?? game.view.relations.find((item) => professionallyFit(item) && !starship.crew.some((member) => member.relationId === item.id) && (item.dimensions?.trust ?? item.strength ?? 0) >= 45);
    if (!relation?.id) return impossible("没有找到愿意承担远航风险、且信任达到要求的人选。", ["先建立可信关系", "明确岗位与报酬", "寻找有航行经验的人"]);
    starship.crew.push({ relationId: relation.id, name: relation.name, role, readiness: Math.min(90, 35 + Math.round((relation.dimensions?.trust ?? relation.strength ?? 30) / 2)) });
    return { intent: "招募星舰船员", minutes: 90, ruleSummary: `${relation.name}接受${role}岗位；职责、风险与分配已记录。`, fallbackNarrative: `我没有只问${relation.name}愿不愿意冒险。值班表、报酬、撤退权限和谁能否决危险命令都摆在桌上。${relation.name}看完才在${role}一栏签名。`, suggestions: ["招募下一名船员", "进行船员协同训练", "检查远航准备"] };
  }
  if (/购买|申请配发|取得.*(?:星舰|探索舰)|购置/.test(action)) {
    if (licenses.indexOf(starship.license) < 2) return impossible("至少取得三级指挥资格，才可登记陨星级侦察舰。", ["参加见习指挥考核", "继续指挥训练", "申请舰队带教航次"]);
    const requiredRoles = ["驾驶员", "导航员", "轮机师"];
    const missing = requiredRoles.filter((role) => !starship.crew.some((member) => member.role === role));
    if (missing.length) return impossible(`基础船员组仍缺少：${missing.join("、")}。`, missing.map((role) => `招募${role}`));
    const sponsored = /申请配发|项目舰|任务舰/.test(action);
    if (sponsored && !game.view.affiliations.some((item) => /舰队|星际|史莱克|联邦/.test(item.name) && /学员|成员|军|指挥|核心/.test(item.role))) return impossible("项目舰只向承担正式任务的在册成员开放。", ["加入舰队或星际学院", "取得正式岗位", "购买自有探索舰"]);
    const cost = sponsored ? 0 : 50_000;
    if (game.view.character!.coins < cost) return impossible(`一艘合规陨星级侦察舰需要${formatSoulCoins(cost)}及持续维护能力。`, ["完成舰队任务积累资金", "申请学院项目舰", "缩小为民用穿梭艇计划"]);
    game.view.character!.coins -= cost;
    starship.shipName = sponsored ? `${game.view.character!.name}项目组任务舰` : `${game.view.character!.name}号`;
    starship.shipClass = "陨星级侦察舰";
    starship.hull = 100;
    starship.fuel = 100;
    starship.supplies = 100;
    if (sponsored) ensureTask(game, { id: `starship-project-${game.actionIndex}`, title: "完成三次项目舰探索任务", kind: "计划", detail: "项目舰只有任务使用权；三次可复核调查完成前不得转卖、私用或拒绝审计。", status: "进行中" });
    return { intent: "取得星舰", minutes: 360, ruleSummary: `${sponsored ? "签署项目使用与审计责任" : `支付${formatSoulCoins(cost)}并完成登记`}，取得陨星级侦察舰“${starship.shipName}”。`, fallbackNarrative: `舰名写上船壳以前，验船师先拆了三块检修盖板。动力、维生、逃生舱和旧事故记录全部签字后，这艘船才真正交到我们手中。${sponsored ? "它仍属于项目，航线和样本都必须接受审计。" : "拥有它也意味着往后的燃料、维修和每个船员的命都进入同一本账。"}`, suggestions: ["补满燃料与物资", "进行船员协同训练", "申请第一次探索任务"], systemMessages: [`星舰 · ${starship.shipName} · 陨星级侦察舰`] };
  }
  if (/补给|加注|补充燃料|维修星舰/.test(action)) {
    if (!starship.shipName) return impossible("当前没有需要补给维护的自有星舰。", ["取得陨星级侦察舰", "申请训练航次", "继续指挥训练"]);
    const missing = (100 - (starship.fuel ?? 0)) + (100 - (starship.supplies ?? 0)) + (100 - (starship.hull ?? 0)) * 2;
    const cost = Math.ceil(missing * 8);
    if (game.view.character!.coins < cost) return impossible(`补给与维修需要${formatSoulCoins(cost)}。`, ["筹措维护费", "只补充关键物资", "申请舰队保障"]);
    game.view.character!.coins -= cost;
    starship.fuel = 100; starship.supplies = 100; starship.hull = 100;
    return { intent: "星舰补给维护", minutes: 360, ruleSummary: `支付${formatSoulCoins(cost)}，燃料、物资与舰体恢复到可出航状态。`, fallbackNarrative: "补给单不是一个总数。氧、水、食品、医疗、反应堆介质和备用密封件逐项入库，轮机师复查舰体后才签下可出航。", suggestions: ["检查航线", "确认船员状态", "开始远航"] };
  }
  if (/前往|航行|跃迁|出发/.test(action)) {
    if (!starship.shipName) return impossible("没有完成登记、补给与船员配置的星舰。", ["取得陨星级侦察舰", "组建基础船员组", "申请舰队航次"]);
    const destination = ["mother-ship-port", "tianluo-planet", "tiandou-planet", "senluo-planet", "elf-planet", "dragon-horse-star", "sky-horse-star"].map((id) => locationById(id)!).find((location) => action.includes(location.name));
    if (!destination) return impossible("没有识别出航线终点。", ["前往森罗星", "前往精灵星", "返回联邦母舰港"]);
    const hostileRoute = /天龙星|天马星/.test(destination.name);
    if (hostileRoute && starship.shipClass !== "龙王级护卫舰") return impossible(`${destination.name}位于龙马星系敌对控制区，陨星级侦察舰不能脱离舰队、穿越封锁并自行靠港。`, ["申请加入联邦舰队任务", "取得龙王级护卫舰任务平台", "先调查龙马星系军事情报"]);
    if (hostileRoute && (starship.license !== "一级指挥" || !game.view.affiliations.some((item) => /舰队|军/.test(`${item.name}${item.role}`)))) return impossible("进入龙马星系战区需要一级指挥资格与现役舰队任务授权。", ["完成高级指挥考核", "取得舰队正式岗位", "申请编队护航任务"]);
    const fuelCost = hostileRoute ? 45 : 18;
    const supplyCost = Math.max(8, starship.crew.length * 3);
    if ((starship.fuel ?? 0) < fuelCost || (starship.supplies ?? 0) < supplyCost || (starship.hull ?? 0) < 55) return impossible("燃料、生活物资或舰体状态不足以覆盖航线与返航余量。", ["补给并维修星舰", "缩短航线", "申请舰队护航"]);
    starship.fuel = (starship.fuel ?? 0) - fuelCost;
    starship.supplies = (starship.supplies ?? 0) - supplyCost;
    const random = actionRandom(game);
    const hazard = random() < Math.max(.03, .22 - starship.crew.reduce((sum, member) => sum + member.readiness, 0) / 2000 - (starship.crewCoordination ?? 0) / 1000);
    if (hazard) starship.hull = Math.max(1, (starship.hull ?? 100) - integer(random, 6, 18));
    game.view.locationId = destination.id;
    game.view.location = destination.name;
    if (!game.world.discoveredLocations.includes(destination.id)) game.world.discoveredLocations.push(destination.id);
    game.view.map = buildMapView(game);
    game.view.mapHierarchy = buildMapHierarchy(game);
    game.world.metrics.discoveries += 1;
    const travelMinutes = hostileRoute ? speedMinutes(game, 30_240, 60_480) : speedMinutes(game, 10_080, 20_160);
    const loggedHours = Math.round(travelMinutes / 60);
    starship.loggedFlightHours += loggedHours;
    const military = game.view.affiliations.find((item) => item.militaryRank);
    if (military) military.flightHours = (military.flightHours ?? 0) + loggedHours;
    recordLogisticsTransit(game, hazard, `${game.view.location ?? destination.name}星际货运记录${hazard ? "：航程故障导致货封受损" : "：舱单与货封正常"}`);
    return { intent: "星际航行", minutes: travelMinutes, ruleSummary: `${starship.shipName}抵达${destination.name}；航程约 ${Math.round(travelMinutes / 1_440)} 天，消耗燃料 ${fuelCost}%、物资 ${supplyCost}%${hazard ? `，途中故障使舰体降至 ${starship.hull}%` : "，航行未发生需要维修的事故"}。`, fallbackNarrative: hazard ? `航程中段，舰体警报突然从尾部一路亮到轮机舱。船员没有等我喊口号，各自按演练封舱、切断故障回路。抵达${destination.name}时没有少人，但外壳留下了必须进坞处理的伤。` : `离港以后，星图上的距离很久都没有明显缩短。驾驶、导航和轮机按班次交接，真正抵达${destination.name}时，最先被检查的是剩余燃料和返航余量，而不是窗外景色。`, suggestions: ["检查舰体与船员", "开展当地调查", "规划返航补给"], systemMessages: [`抵达 · ${destination.name}`] };
  }
  if (/调查|扫描|探索任务|采样/.test(action)) {
    if (!starship.shipName || !/森罗星|精灵星|天龙星|天马星/.test(game.view.location ?? "")) return impossible("需要驾驶已登记星舰抵达目标星球后才能执行星际调查。", ["规划星际航线", "组建船员组", "取得探索舰"]);
    starship.missionsCompleted += 1;
    const military = game.view.affiliations.find((item) => item.militaryRank);
    if (military) military.militaryMerit = (military.militaryMerit ?? 0) + 6;
    if (starship.missionsCompleted >= 3) {
      const projectTask = game.view.tasks.find((task) => task.id?.startsWith("starship-project-") && task.status === "进行中");
      if (projectTask) projectTask.status = "完成";
    }
    game.world.metrics.discoveries += 2;
    return { intent: "星球探索", minutes: speedMinutes(game, 720, 2880), ruleSummary: `完成第 ${starship.missionsCompleted} 次星球调查；样本、坐标和风险均已登记。`, fallbackNarrative: "采样不是把发光的东西装进箱子。船员先划出隔离区，再记录空气、微生物和能量变化。所有样本都带着坐标与时间，返航后能由别人复核。", suggestions: ["复核样本污染", "调查当地势力", "规划返航"] };
  }
  return impossible("需要明确选择星舰训练、考核、招募、取得舰船、补给、航行或调查。", ["进行星舰模拟训练", "组建基础船员组", "查看星舰状态"]);
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
  const activeAlias = game.world.flags.activeAliasLocationId === (game.view.locationId ?? "local") ? String(game.world.flags.activeAlias ?? "") : "";
  const publicName = activeAlias || game.view.character!.name;
  let reputation = game.view.reputations.find((item) => item.scope === scope && item.publicName === publicName);
  if (!reputation) { reputation = { scope, publicName, reputation: "陌生人", heat: 0, source: "当地目击与登记" }; game.view.reputations.push(reputation); }
  reputation.heat = Math.min(100, reputation.heat + heat);
  reputation.reputation = success && prepared ? "身份尚未暴露，但有案件传闻" : "受到治安机构怀疑";
  reputation.source = success && prepared ? "现场痕迹与地下传闻" : "目击、证据与追查";
  game.view.economy.bounty += reputation.heat >= 60 ? 30 : 0;
  if (success) game.view.character!.coins += integer(random, 6, 28); else { game.world.healthPoints -= integer(random, 5, 22); game.view.character!.reputation = "受到本地追查"; }
  return { intent: "违法行动", minutes: 90, ruleSummary: `${success ? "行动达到主要目的" : "行动失败"}；证据、目击与当地警戒使热度增加${heat}。声望与追查只在有传播路径的地区变化。`, fallbackNarrative: success ? `东西到手不等于没有后果。离开时我看见街角有人盯着这边，原先准备的退路还能用，只是不能再照原路回来。` : `事情在最不该出声的地方出了声。守卫比预计来得快，我没拿到想要的东西，撤走时还把一截衣料留在了墙钉上。`, suggestions: ["处理证据与伤势", "暂时离开本地", "调查追查范围"] };
}

function disguiseResolution(game: StoredGame, action: string): ActionResolution {
  if (/恢复真名|取消化名/.test(action)) {
    delete game.world.flags.activeAlias;
    delete game.world.flags.activeAliasLocationId;
    return { intent: "恢复真名", minutes: 20, ruleSummary: `停止使用本地化名，后续公开行动重新以${game.view.character!.name}登记；既有化名口碑不会自动合并。`, fallbackNarrative: "我把那套说辞和衣物收了起来。旧化名留下的账不会凭空消失，但从这一刻起，新登记重新写回本名。", suggestions: ["检查本名口碑", "避免接触化名债务", "说明身份变更"] };
  }
  const alias = action.match(/(?:化名|自称|假名)[为叫作：: ]*([\u4e00-\u9fa5]{2,8})/)?.[1] ?? `无名旅人${game.view.reputations.length + 1}`;
  const existing = game.view.reputations.find((item) => item.publicName === alias && item.scope === game.view.location);
  if (!existing) game.view.reputations.push({ scope: game.view.location ?? "当前地区", publicName: alias, reputation: "新出现的陌生人", heat: 0, source: "化名与外观伪装" });
  game.world.flags.activeAlias = alias;
  game.world.flags.activeAliasLocationId = game.view.locationId ?? "local";
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
    fallbackNarrative: `${game.view.character?.name ?? "他"}照自己的想法把事情做了一遍。能做到的部分已经落了地，做不到的地方也很清楚；眼前没有突然冒出秘密，只剩下该接受的结果和接下来真正想做的事。`,
    suggestions: ["把眼前的事情做完", "回应身边正在等的人", "转去推进当前人生目标"],
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

function consumeHeirloomUse(active: NonNullable<StoredGame["view"]["activeHeirloom"]>): void {
  active.remainingUses = Math.max(0, active.remainingUses - 1);
  active.status = active.remainingUses > 0 ? "等待触发" : "本局已触发";
}

function heirloomActionResolution(game: StoredGame): ActionResolution | undefined {
  const active = game.view.activeHeirloom;
  if (!active?.actionCommand) return undefined;
  if (active.remainingUses < 1) return impossible(`${active.name}在本局的发动次数已经耗尽。`, ["查看遗物栏位", "继续当前计划", "检查任务"]);
  const definition = heirloomByName(active.name);
  if (!definition) return impossible("这件遗物的效果资料缺失。");
  if (definition.effectKind === "anomalyCompass") {
    game.world.flags.heirloomCompassRoute = true;
    consumeHeirloomUse(active);
    return { intent: "使用遗物", minutes: 5, ruleSummary: `星痕罗盘已为下一次普通旅行压出捷径，届时耗时降低60%；剩余${active.remainingUses}次。`, fallbackNarrative: `罗盘里的指针沿着大陆轮廓转了一圈，最后把几条旧路叠成一道细亮的线。下一次上路时，只要沿着它走，就能省下大半绕行时间。`, suggestions: ["选择已知地点立即出发", "先处理随身负重", "把捷径留给下一次远行"] };
  }
  if (definition.effectKind === "causalReview") {
    game.world.flags.heirloomCausalProtection = true;
    consumeHeirloomUse(active);
    return { intent: "使用遗物", minutes: 5, ruleSummary: "因果残线已护住下一次非死亡失败；届时恢复40点健康、降低40点疲劳并移除一项最新伤势，但不改变胜负。", fallbackNarrative: "细线钻进手腕后便看不见了。它没有替我抹掉已经做过的选择，只在最坏的结果旁边留出一条能保住身体的窄缝。", suggestions: ["继续当前高风险行动", "先确认失败代价", "把保护留给关键尝试"] };
  }
  const snapshot = `${game.view.worldTime?.year ?? 0}年第${game.view.worldTime?.day ?? 1}日，${game.view.location}；目标：${game.view.chapterObjective?.title ?? game.view.lifeGoal ?? "尚未确定"}；未决：${game.storyMemory.openThreads.slice(0, 4).join("、") || "无"}`;
  game.storyMemory.openThreads = [`岁月锚点：${snapshot}`, ...game.storyMemory.openThreads].slice(0, 12);
  game.world.flags.heirloomTimeAnchorActions = 3;
  consumeHeirloomUse(active);
  return { intent: "使用遗物", minutes: 5, ruleSummary: `岁月锚钉已固定当前节点；接下来3次非战斗行动耗时减半，并持续写入长期记忆。`, fallbackNarrative: `钉身上的日期刻痕一寸寸发热。周围没有停下，只是接下来要做的三件事忽然多出了从容周转的余地。`, suggestions: ["推进当前人生目标", "处理一项关系承诺", "完成一次成长行动"] };
}

function applyHeirloomEffect(game: StoredGame, action: string, resolution: ActionResolution): void {
  const active = game.view.activeHeirloom;
  if (!active || active.remainingUses < 1 || /无法完成|规则阻止/.test(resolution.intent)) return;
  const definition = heirloomByName(active.name);
  if (!definition || definition.actionCommand) return;
  let message = "";
  switch (definition.effectKind) {
    case "huntIntel":
      if (!/魂兽|猎魂|追踪/.test(`${action}${resolution.intent}`)) return;
      game.world.metrics.discoveries += 2;
      recordIntelligence(game, { subjectType: "物品", subjectId: `heirloom-hunt-${game.actionIndex}`, title: `${active.name}补充的生态线索`, detail: "旧记录标出目标常用的饮水方向、活动时段与撤退路径，需要结合现场痕迹复核。", source: active.name, confidence: 78, status: "确定" });
      message = "额外取得一条高可信魂兽生态线索，发现进度 +2"; break;
    case "travelGuide":
      if (resolution.intent !== "旅行") return;
      { const saved = Math.max(1, Math.round(resolution.minutes * .35)); resolution.minutes -= saved; message = `核验旧路，旅行耗时减少 ${saved} 分钟`; } break;
    case "trainingCalm":
      if (!/修炼|训练/.test(resolution.intent)) return;
      game.world.fatiguePoints = Math.max(0, game.world.fatiguePoints - 25); game.world.healthPoints = Math.min(100, game.world.healthPoints + 5); message = "呼吸稳定，疲劳降低25点并恢复5点健康"; break;
    case "tradeInsight":
      if (!/购买|交易|经济|询价|市场/.test(`${action}${resolution.intent}`)) return;
      game.view.character!.coins += 8; message = "识别正规商路价格并返还8金魂币"; break;
    case "factionIntroduction":
      if (!/入学|加入势力|势力申请|学院/.test(`${action}${resolution.intent}`)) return;
      { const relation = game.view.relations.find((item) => item.category === "势力"); if (relation) { relation.dimensions ??= relationDimensions(relation.strength); relation.dimensions.respect = Math.min(100, relation.dimensions.respect + 25); relation.dimensions.trust = Math.min(100, relation.dimensions.trust + 10); } message = "获得正式面谈，接待者敬重+25、信任+10（不保证录取）"; } break;
    case "mentalRescue":
      if (game.world.fatiguePoints < 65) return;
      game.world.fatiguePoints = Math.max(0, game.world.fatiguePoints - 45); game.world.healthPoints = Math.min(100, game.world.healthPoints + 10); message = "温魂灯芯亮起，疲劳降低45点并恢复10点健康"; break;
    case "ringAssessment":
      return;
    case "promiseWitness":
      if (resolution.intent !== "作出承诺") return;
      game.world.flags.heirloomPromiseEvidence = `行动${game.actionIndex}：${action.slice(0, 100)}`; { const target = game.view.relations.find((item) => action.includes(item.name)); if (target) { target.dimensions ??= relationDimensions(target.strength); target.dimensions.trust = Math.min(100, target.dimensions.trust + 15); } } message = "承诺形成额外履约证据，承诺对象信任+15"; break;
    case "craftSalvage":
      if (!/制作|锻造|炼制/.test(`${action}${resolution.intent}`) || !/失败|报废|崩裂/.test(resolution.ruleSummary)) return;
      game.view.inventory.push("遗物回收材料", "遗物回收材料"); { const profession = game.view.professions.find((item) => /锻造|炼器|制作/.test(item.name)); if (profession) profession.progress = Math.min(100, profession.progress + 5); } message = "从失败成品中回收2份材料，相关职业进度+5"; break;
    default: return;
  }
  consumeHeirloomUse(active);
  resolution.systemMessages = [...(resolution.systemMessages ?? []), `${active.name} · ${message} · 剩余${active.remainingUses}次`];
  resolution.ruleSummary += ` 遗物触发：${message}。`;
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
  ensureMartialSoulAccounts(game);

  let resolution: ActionResolution;
  const guarded = guardActionByStoryRules(game, action);
  const huntingActive = game.view.hunting && game.view.hunting.stage !== "完成";
  const activeHeirloom = game.view.activeHeirloom;
  if (activeHeirloom?.actionCommand && action.includes(activeHeirloom.actionCommand)) resolution = heirloomActionResolution(game)!;
  else if (guarded) resolution = guarded;
  else if (/切换|换成|改用|主修/.test(action) && /武魂/.test(action)) resolution = switchMartialSoulResolution(game, action);
  else if (/升灵台/.test(action)) resolution = spiritAscensionResolution(game, action);
  else if (/(?:学习|练习|实训|认证|考核|委托|订单|接单).*(?:斗铠设计|机甲设计|机甲制造|机甲维修|机甲修理|锻造师)|(?:斗铠设计师|机甲设计师|机甲制造师|机甲修理师|锻造师).*(?:学习|练习|实训|认证|考核|委托|订单|接单)/.test(action)) resolution = eraThreeCareerResolution(game, action);
  else if (/魂灵/.test(action)) resolution = soulSpiritResolution(game, action);
  else if (/斗铠/.test(action) && !/购买|买|采购/.test(action) && !(game.view.combat && /攻击|防御|格挡|闪避|逃跑|弱点/.test(action))) resolution = battleArmorResolution(game, action);
  else if (/机甲/.test(action) && (!game.view.combat || !/攻击|防御|格挡|闪避|逃跑|弱点/.test(action) || !game.view.mecha?.model)) resolution = mechaResolution(game, action);
  else if (/星舰|舰桥|随舰|航次|真实飞行|船员|舰员|星际航行|探索舰|项目舰|星球探索|星球调查|指挥考核|指挥资格|参谋部|入舰培训|舰队培训|岗位评估|岗位分配|作战部培训|航线与指挥培训|损管与动力培训|作战与登陆培训|军纪与保密培训/.test(action)) resolution = starshipResolution(game, action);
  else if (/前往|去往|出发去|旅行到/.test(action) && /船票|客运|航班|民航|搭乘/.test(action)) resolution = travelResolution(game, action);
  else if (huntingActive && /献祭|自愿融合|交换|救助|治疗魂兽|交流|沟通|取得信任|残魂传承|转化魂环/.test(action)) resolution = nonLethalRingResolution(game, action);
  else if (huntingActive && (game.view.hunting?.stage === "战斗" || /猎魂|魂兽|魂环|目标|追踪|出发|准备|吸收|返回/.test(action))) resolution = huntResolution(game, action);
  else if (/建立|创建|招募|任命|扩建|领地|外交|情报网|经营势力|管理宗门/.test(action) && /宗门|势力|组织|成员|领地|外交|情报/.test(action)) resolution = factionManagementResolution(game, action);
  else if (/存入.*(?:魂币|钱)|存钱|取出.*(?:魂币|钱)|取钱|借贷|借钱|贷款|还债|偿还债务|黑市|开店|商铺|经营生意|悬赏|市场行情|调查物价|打听物价|询价|供需|运输合同|货运合同|运货委托/.test(action)) resolution = economyResolution(game, action);
  else if (/存放|收进仓库|放回住处|取回|从.*取出|拿回/.test(action)) resolution = storageResolution(game, action);
  else if (/化名|伪装身份|假名|自称|恢复真名|取消化名/.test(action)) resolution = disguiseResolution(game, action);
  else if (/偷窃|盗窃|抢劫|诈骗|绑架|放火|勒索/.test(action)) resolution = crimeResolution(game, action);
  else if (/魂导师/.test(action) && /认证|考核/.test(action)) resolution = professionResolution(game, action);
  else if (/学习|研究|尝试|实验|制作|改良|炼制|锻造|打造/.test(action) && /炼药|丹药|药剂|锻造|炼器|魂导器|阵法|阵纹|医术|治疗|毒术|制毒|商业|经商|驯兽|驯养|学术|魂兽/.test(action)) resolution = professionResolution(game, action);
  else if (/参悟|修炼传承|修行剑|炼丹|炼器|特殊体系|异界功法/.test(action)) resolution = specialSystemResolution(game, action);
  else if (/处理|介入|参与|帮助处理|阻止.*恶化|查看新事件|拒绝|不接受|回绝/.test(action) && game.world.dynamicEvents.some((item) => item.status === "可介入" && (action.includes(item.title) || item.participantIds.some((id) => action.includes(game.world.npcs[id]?.name ?? "")) || /查看新事件/.test(action)))) resolution = dynamicEventResolution(game, action);
  else if (/完成承诺|履行承诺/.test(action)) resolution = fulfillPromiseResolution(game, action);
  else if (/上课|课程|学院学习|参加实战课/.test(action)) resolution = academyStudyResolution(game);
  else if (/入学|报名.*学院|申请.*学院|成为工读生/.test(action)) resolution = academyResolution(game);
  else if (/领取.*(?:任务|事务)|申请.*(?:内部任务|机构任务)|推进.*机构事务|登记.*阶段|提交.*阶段|交付.*(?:机构任务|内部任务|事务)|完成.*(?:机构任务|内部任务|事务)|申请.*晋升|升职|转正|询问.*(?:异议|验收|复核)|协商.*(?:验收|复核|派系)|提交.*(?:共同复核|联合复核|协调方案)|支持.*(?:派|组)|采纳.*(?:派|组)|查看.*(?:复核人|验收人)/.test(action)) resolution = institutionResolution(game, action);
  else if (/加入|投靠|宗门考核/.test(action) && /宗|门|殿|势力|史莱克|舰队|联邦|传灵塔|战神/.test(action)) resolution = factionResolution(game, action);
  else if (/拜师|拜.*为师|收我为徒|请.*指导|寻找导师/.test(action)) resolution = mentorResolution(game, action);
  else if ((goldFingerByName(game.view.character.specialSystem?.name ?? "")?.actionCommand && action.includes(goldFingerByName(game.view.character.specialSystem?.name ?? "")!.actionCommand)) || /签到|加点面板|查看面板|潜能|给.*加点|人生模拟|命运模拟|模拟未来|系统任务|图鉴扫描|扫描.*(?:武魂|魂兽|图鉴)|查看图鉴|查看金手指/.test(action)) resolution = specialSystemResolution(game, action);
  else if (/成为朋友|确认朋友|建立友情|长期关系|成为伴侣|确认恋爱|表达.*心意|求婚|婚姻|结婚|成婚|婚礼|组建家庭|家庭住所|共同住所|家庭准备|生育|收养.*孩子|孩子.*加入家庭|孩子出生/.test(action)) resolution = relationshipResolution(game, action);
  else if (/训练|排练|复盘/.test(action) && /连携|合击|组合技|阵型|生命防线|锁定爆发|破绽突袭|封锁阵线|攻守枢纽|生息铁壁|猎杀三角|四象战阵|逐影围猎|五环协战阵|六芒轮转阵|七星全域战阵/.test(action) && !game.view.combat) resolution = comboTrainingResolution(game, action);
  else if (/^(我)?(答应|承诺|保证)/.test(action)) resolution = promiseResolution(game, action);
  else if (/修炼|冥想|运转|练功|闭关/.test(action)) resolution = trainingResolution(game, action);
  else if (/负面传闻|公开澄清|申请更正|媒体更正|舆情核验|责任编辑|核验编辑|采访.*编辑|提交.*补充.*(?:证据|材料)|独家.*(?:证据|材料|线索)|对比.*(?:媒体|两家)|比较.*(?:报道|媒体)|媒体联盟|核验联盟|共享核验|优先议题|共同核验|第三家.*(?:媒体|核验机构|加入|准入)|三方.*准入|退出.*联盟|联盟.*退出|替补.*(?:媒体|机构|成员|加入|准入)|(?:媒体|机构|成员|加入|准入).*替补/.test(action)) resolution = mediaResolution(game, action);
  else if (/休息|睡觉|疗伤|恢复/.test(action)) resolution = restResolution(game);
  else if (/使用|服用|吃下|吃掉/.test(action)) resolution = useItemResolution(game, action);
  else if (/购买|买|采购/.test(action)) resolution = buyResolution(game, action);
  else if (/打工|工作|赚钱|干活/.test(action)) resolution = workResolution(game, action);
  else if (game.view.worldInheritance && (/旧世|祖先|档案|家谱|谱牒|旧产业|历史权益|旁支|年表|历史节点|转交|衰减|再发现/.test(action) || game.view.worldInheritance.institutions.some((item) => action.includes(item.name)) || game.view.worldInheritance.branches?.some((item) => action.includes(item.name)) || game.view.worldInheritance.chronology?.some((item) => action.includes(item.title))) && /核验|查证|调查|追查|验证|提交|申请|主张|听证|审理|裁定|投资|复建|经营/.test(action)) resolution = inheritanceResolution(game, action);
  else if (/猎魂|猎取魂环|调查.*魂兽|获得魂环/.test(action)) resolution = huntResolution(game, action);
  else if (/前往|去往|出发去|旅行到|离开去/.test(action)) resolution = travelResolution(game, action);
  else if (/问|询问|打听|交谈|告诉|拜访/.test(action)) resolution = conversationResolution(game, action);
  else if (/调查|搜索|观察周围|查找|研究/.test(action)) resolution = investigateResolution(game, action);
  else if (/等待|快进|过去一天|过去一月|过去一年|休整一/.test(action)) resolution = waitResolution(game, action);
  else if (/攻击|战斗|防御|闪避|逃跑|弱点|连携|合击|组合技|阵型|战阵|围猎/.test(action) && game.view.combat) resolution = combatResolution(game, action);
  else if (/攻击|杀|刺杀|偷袭/.test(action) && CANON_CHARACTERS.some((item) => action.includes(item.name) || item.aliases.some((alias) => action.includes(alias)))) resolution = npcConflictResolution(game, action);
  else if (/攻击|杀|抢|闯入/.test(action)) resolution = impossible("当前缺少明确目标或足够条件，强行行动只会引来警惕。", ["观察目标", "先做准备", "暂时退开"]);
  else resolution = generalResolution(game);

  const activeSystem = game.view.character.specialSystem?.name;
  const evidenceAction = !/无法完成|规则阻止/.test(resolution.intent) && resolution.minutes >= 60 && /修炼|训练|学院|课程|调查|战斗|猎魂|实战/.test(resolution.intent);
  if (evidenceAction && activeSystem === "等价任务系统") game.world.flags.goldFingerEvidenceCount = Number(game.world.flags.goldFingerEvidenceCount ?? 0) + 1;
  if (evidenceAction && activeSystem === "勤修加点面板") {
    const gain = Math.max(1, Math.min(3, Math.floor(resolution.minutes / 240)));
    game.world.flags.goldFingerPotentialPoints = Math.min(30, Number(game.world.flags.goldFingerPotentialPoints ?? 0) + gain);
    resolution.systemMessages = [...(resolution.systemMessages ?? []), `加点面板 · 潜能 +${gain}`];
  }

  applyHeirloomEffect(game, action, resolution);

  if (game.world.flags.heirloomCompassRoute && resolution.intent === "旅行") {
    const saved = Math.max(1, Math.round(resolution.minutes * .6));
    resolution.minutes -= saved;
    game.world.flags.heirloomCompassRoute = false;
    resolution.ruleSummary += ` 星痕罗盘捷径额外节省${saved}分钟。`;
    resolution.systemMessages = [...(resolution.systemMessages ?? []), `星痕罗盘 · 捷径节省${saved}分钟`];
  }
  const timeAnchorActions = Number(game.world.flags.heirloomTimeAnchorActions ?? 0);
  if (timeAnchorActions > 0 && !/战斗|使用遗物|规则阻止|无法完成/.test(resolution.intent)) {
    const saved = Math.max(1, Math.floor(resolution.minutes / 2));
    resolution.minutes -= saved;
    game.world.flags.heirloomTimeAnchorActions = timeAnchorActions - 1;
    resolution.ruleSummary += ` 岁月锚钉令本次非战斗行动节省${saved}分钟。`;
    resolution.systemMessages = [...(resolution.systemMessages ?? []), `岁月锚钉 · 节省${saved}分钟 · 还剩${timeAnchorActions - 1}次行动`];
  }
  if (game.world.flags.heirloomCausalProtection && game.world.healthPoints > 0 && !game.view.runProgress.ending && resolution.intent !== "使用遗物" && /失败|受伤/.test(`${resolution.intent}${resolution.ruleSummary}`)) {
    game.world.healthPoints = Math.min(100, game.world.healthPoints + 40);
    game.world.fatiguePoints = Math.max(0, game.world.fatiguePoints - 40);
    const removedInjury = game.view.character!.injuries.pop();
    game.world.flags.heirloomCausalProtection = false;
    resolution.ruleSummary += ` 因果残线截断部分身体后果：恢复40点健康、降低40点疲劳${removedInjury ? `并移除“${removedInjury}”` : ""}；原本的胜负与结果不变。`;
    resolution.systemMessages = [...(resolution.systemMessages ?? []), "因果残线 · 截断一次非死亡失败的身体后果"];
  }

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
  requestId?: string,
): void {
  const character = game.view.character;
  const thirdPerson = character ? toThirdPersonNarrative(narrative, character.name, character.gender) : narrative;
  game.view.narrative.push(entry("player", input), entry("narration", thirdPerson));
  for (const message of result.systemMessages ?? []) game.view.narrative.push(entry("system", message));
  game.view.suggestions = sanitizeNarrativeSuggestions(game, suggestions, result.suggestions);
  game.actionIndex += 1;
  game.world.actionLedger.push({ index: game.actionIndex, requestId, action: input.slice(0, 180), intent: result.intent, result: result.ruleSummary.slice(0, 220), year: game.view.worldTime?.year ?? 0, day: game.view.worldTime?.day ?? 1 });
  game.world.actionLedger = game.world.actionLedger.slice(-400);
  game.view.lastActionReceipt = {
    action: input.slice(0, 180),
    intent: result.intent,
    summary: result.ruleSummary.slice(0, 220),
    elapsedMinutes: result.minutes,
    appliedRuleIds: result.appliedRuleIds ?? [],
    actionIndex: game.actionIndex,
  };
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
  queueSocialRumor(game, input, result.intent, result.ruleSummary);
  game.view.updatedAt = new Date().toISOString();
}
