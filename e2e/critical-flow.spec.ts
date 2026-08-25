import { expect, test } from "@playwright/test";

let fixtureDatabase: typeof import("../server/db.js") | undefined;

async function seedUnlimitedMartialSoulWarehouse() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const database = await import("../server/db.js");
  fixtureDatabase = database;
  const meta = database.getMetaProgression();
  meta.legacyPoints = Math.max(meta.legacyPoints, 100);
  meta.martialSoulDrawTickets = 0;
  meta.summonGoldPity = 0;
  meta.summonRedPity = 0;
  meta.summonRainbowPity = 0;
  database.saveMetaProgression(meta);
  database.drawMetaMartialSoul(() => .9);
}

async function seedLocalConsequenceGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database, storyRules] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js"), import("../server/domain/story-rules.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 1, gender: "男", difficulty: "标准", seed: "e2e-local-consequence" });
  generator.selectCandidate(game, game.view.candidates[0].id, "地方后果验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  const now = (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1);
  game.world.localConsequences.push({ id: "e2e-herb-shortage", sourceEventId: "e2e-missed-herb-team", locationId: game.view.locationId!, kind: "供需", summary: "采药队失踪后，本地常用药材短缺。", magnitude: 3, marketEffects: [{ category: "药材", supplyDelta: -22, demandDelta: 12 }], riskDelta: 0, startedOrdinal: now, expiresOrdinal: now + 90, status: "生效中" });
  storyRules.refreshStoryArchive(game);
  database.saveGame(game, "e2e.local-consequence-fixture");
}

async function seedCurrentLifeStageGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database, world] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js"), import("../server/domain/world.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 3, gender: "男", difficulty: "标准", seed: "e2e-current-life-stage" });
  generator.selectCandidate(game, game.view.candidates[0].id, "时间线验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.worldTime = { era: "东海学院零班阶段", year: 20003, day: 1, time: "08:00", season: "春" };
  game.view.locationId = "east-sea-city";
  game.view.location = "东海城";
  game.world = world.createHiddenWorld(20003, "east-sea-city");
  game.world.npcs["gu-yue-na"].knownToPlayer = true;
  game.world.npcs["gu-yue-na"].locationId = "east-sea-city";
  world.recordIntelligence(game, { subjectType: "人物", subjectId: "gu-yue-na", title: "古月", detail: "主角在东海学院零班当面认识了自称古月的同学。", source: "同学亲历", confidence: 88, status: "确定" });
  game.view.knownFigures = world.buildKnownFigures(game);
  database.saveGame(game, "e2e.current-life-stage-fixture");
}

async function seedOpeningMatrixGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database, metaSouls] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js"), import("../server/data/meta-martial-souls.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 1, gender: "男", difficulty: "标准", seed: "e2e-opening-matrix" });
  game.hiddenCandidates = generator.generateCandidates(game.view.seed, 0, "男", undefined, 0, 1, [], "hidden-sect-heir");
  game.view.candidates = game.hiddenCandidates.map((candidate) => candidate.public);
  generator.selectCandidate(game, game.view.candidates[0].id, "开局矩阵验收", metaSouls.metaSoulById("rainbow-dao-body"));
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, "在十八岁前完善先天道体与宗门剑道的协同修炼");
  database.saveGame(game, "e2e.opening-matrix-fixture");
}

async function seedEarlyGrowthGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 1, gender: "男", difficulty: "标准", seed: "e2e-early-growth" });
  generator.selectCandidate(game, game.view.candidates[0].id, "早期成长验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.locationId = "notting-city";
  game.view.location = "诺丁城";
  game.view.character!.innateSoulPower = 10;
  game.view.character!.soulRank = 10;
  game.view.character!.coins = 100;
  if (!game.view.relations.some((relation) => relation.category === "亲属")) game.view.relations.push({ id: "e2e-guardian", name: "顾伯", relation: "监护人", impression: "负责食宿与入学签字", strength: 70, category: "亲属" });
  database.saveGame(game, "e2e.early-growth-fixture");
}

async function seedInheritanceRightsGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const parent = generator.createGame({ era: 1, gender: "男", difficulty: "标准", seed: "e2e-inheritance-rights-parent" });
  generator.selectCandidate(parent, parent.view.candidates[0].id, "旧世档案人");
  const parentPersonality = parent.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(parent, { personalityId: parentPersonality.id, keywords: parentPersonality.keywords, answers: Object.fromEntries(parentPersonality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(parent);
  parent.view.managedFactions.push({ id: "e2e-archive-sect", name: "青册门", role: "门主", members: 36, resources: 120, territory: ["青册谷"], departments: ["档案堂"], internalIssues: [] });
  parent.view.status = "ended";
  parent.view.runProgress.ending = "留下青册档案";
  parent.view.runProgress.settlement = { ending: "留下青册档案", baseScore: 70, multiplier: 1, legacyPoints: 70, highlights: [], qualified: true };
  const game = generator.createEraSuccessor(parent);
  generator.selectCandidate(game, game.view.candidates[0].id, "权益验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.character!.coins = 100;
  const institution = game.view.worldInheritance!.institutions[0];
  institution.verification = "已核验";
  institution.evidence.push("独立目录证据", "地方账册证据");
  institution.currentEvidence = ["当代登记无连续产权", "旧址与现权利人分离说明"];
  database.saveGame(game, "e2e.inheritance-rights-fixture");
}

async function seedComboTrainingGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 1, gender: "男", difficulty: "标准", seed: "e2e-combo-training" });
  generator.selectCandidate(game, game.view.candidates[0].id, "连携验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.relations.push(
    { id: "e2e-guard", name: "石岳", relation: "防御系护卫", impression: "可靠并擅长盾牌守护", strength: 70, category: "同伴" },
    { id: "e2e-healer", name: "苏叶", relation: "治疗系医师", impression: "可靠并擅长治愈救护", strength: 70, category: "同伴" },
  );
  game.view.hunting = { stage: "准备", ringIndex: 1, recommendations: [], preparation: [], trailProgress: "连携训练验收场" };
  database.saveGame(game, "e2e.combo-fixture");
}

async function seedMediaAccountabilityGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, actions, world, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/domain/actions.js"), import("../server/domain/world.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 3, gender: "女", difficulty: "标准", seed: "e2e-media-accountability" });
  generator.selectCandidate(game, game.view.candidates[0].id, "媒介验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  for (const npc of Object.values(game.world.npcs)) npc.locationId = "offscreen-e2e";
  for (const [index, witness] of Object.values(game.world.npcs).slice(0, 6).entries()) {
    witness.alive = true;
    witness.currentGoal = "保存现场证词";
    witness.locationId = game.view.locationId!;
    witness.factionIds = [index % 2 ? "spirit-hall" : "shrek"];
  }
  const crime = { intent: "违法行动", minutes: 30, ruleSummary: "行动失败，现场留下六份可辨认见证记录。", fallbackNarrative: "守卫与现场见证者分别留下了说法。", suggestions: ["调查消息来源"] };
  actions.applyActionResult(game, "在街口公开抢劫", crime, crime.fallbackNarrative, crime.suggestions);
  world.advanceWorldTime(game, 20 * 1_440);
  if (!game.world.socialRumors.some((rumor) => rumor.mediaStatus === "已刊发" && rumor.valence < 0)) throw new Error("媒体 E2E 夹具未形成已刊发负面报道");
  world.recordMediaCompetition(game, { primary: "大陆魂导传媒公共频道", secondary: "地方民生频道", primaryDelta: 0, secondaryDelta: 0, newTopic: true, topicId: "e2e-market-supply", topic: "外城药材供应中断", status: "首发竞争", evidence: "公开市场登记形成第二个跨地区议题，尚未决定优先级" });
  database.saveGame(game, "e2e.media-fixture");
}

async function seedInstitutionFactionConflictGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, actions, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/domain/actions.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 3, gender: "男", difficulty: "标准", seed: "e2e-institution-factions" });
  generator.selectCandidate(game, game.view.candidates[0].id, "派系复核验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.affiliations = [{ id: "e2e-faction-pagoda", name: "传灵塔", role: "外围成员", reputation: "生疏", joinedAt: "验收", contribution: 0, completedAssignments: 0, rankEvidence: [] }];
  const commit = (action: string, result = actions.resolveAction(game, action)) => actions.applyActionResult(game, action, result, result.fallbackNarrative, result.suggestions);
  const evidence = (action: string) => commit(action, { intent: "魂灵审计行动", minutes: 60, ruleSummary: "形成带时间、对象与来源的独立审计收据。", fallbackNarrative: "审计材料按发生顺序归入档案。", suggestions: [] });
  commit("向传灵塔领取机构事务");
  evidence("调查魂灵来源与授权档案");
  commit("向传灵塔推进机构事务");
  evidence("完成魂灵适配评估");
  commit("向传灵塔推进机构事务");
  if (game.view.tasks.find((task) => task.institutionAssignment)?.institutionAssignment?.conflictStatus !== "待复核") throw new Error("机构派系 E2E 夹具未触发双复核冲突");
  database.saveGame(game, "e2e.institution-factions-fixture");
}

async function seedBasicInstitutionGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 1, gender: "男", difficulty: "标准", seed: "e2e-basic-institution" });
  generator.selectCandidate(game, game.view.candidates[0].id, "机构分支验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.affiliations = [{ id: "e2e-basic-academy", name: "诺丁初级魂师学院", role: "学员", reputation: "新入学", joinedAt: "验收", contribution: 0, completedAssignments: 0, rankEvidence: [] }];
  database.saveGame(game, "e2e.basic-institution-fixture");
}

async function seedFourPersonFormationGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 1, gender: "男", difficulty: "标准", seed: "e2e-four-person-formation" });
  generator.selectCandidate(game, game.view.candidates[0].id, "战阵验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.relations.push(
    { id: "e2e-four-striker", name: "陆锋", relation: "学院导师兼强攻系战士", impression: "登记魂师，可靠并擅长正面攻击", strength: 70, category: "同伴" },
    { id: "e2e-four-guard", name: "石岳", relation: "防御系护卫", impression: "可靠并擅长盾牌守护", strength: 70, category: "同伴" },
    { id: "e2e-four-control", name: "宁索", relation: "控制系魂师", impression: "可靠并擅长束缚阵法", strength: 70, category: "同伴" },
    { id: "e2e-four-healer", name: "苏叶", relation: "治疗系医师", impression: "可靠并擅长治愈救护", strength: 70, category: "同伴" },
  );
  game.view.hunting = { stage: "准备", ringIndex: 2, targetBeastId: "datura-snake", targetName: "曼陀罗蛇", targetYears: 700, locationId: "soul-hunting-forest", recommendations: [], preparation: [], trailProgress: "四人编队验收" };
  database.saveGame(game, "e2e.four-person-fixture");
}

async function seedSevenPersonFormationGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 1, gender: "女", difficulty: "标准", seed: "e2e-seven-person-formation" });
  generator.selectCandidate(game, game.view.candidates[0].id, "七人战阵验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  const companions = [
    { id: "e2e-seven-striker-a", name: "陆锋", relation: "强攻系战士", impression: "可靠并完成七人共同训练", strength: 80, category: "同伴" as const, role: "强攻" as const },
    { id: "e2e-seven-striker-b", name: "赵烈", relation: "强攻系战士", impression: "可靠并完成七人共同训练", strength: 80, category: "同伴" as const, role: "强攻" as const },
    { id: "e2e-seven-guard-a", name: "石岳", relation: "防御系护卫", impression: "可靠并完成七人共同训练", strength: 80, category: "同伴" as const, role: "防护" as const },
    { id: "e2e-seven-guard-b", name: "韩垒", relation: "防御系护卫", impression: "可靠并完成七人共同训练", strength: 80, category: "同伴" as const, role: "防护" as const },
    { id: "e2e-seven-control", name: "宁索", relation: "控制系魂师", impression: "可靠并完成七人共同训练", strength: 80, category: "同伴" as const, role: "控制" as const },
    { id: "e2e-seven-healer", name: "苏叶", relation: "治疗系医师", impression: "可靠并完成七人共同训练", strength: 80, category: "同伴" as const, role: "治疗" as const },
    { id: "e2e-seven-scout", name: "凌风", relation: "敏攻侦察系魂师", impression: "可靠并完成七人共同训练", strength: 80, category: "同伴" as const, role: "侦察" as const },
  ];
  game.view.relations.push(...companions.map(({ role: _role, ...relation }) => relation));
  game.view.comboTrainings.push({ id: "七星全域战阵:e2e", name: "七星全域战阵", roles: companions.map((item) => item.role), companionNames: companions.map((item) => item.name).sort(), sessions: 6, failures: 0, mastery: 60, evidence: [{ date: "验收前训练", result: "七名固定成员完成岗位、口令与接替训练" }] });
  game.view.hunting = { stage: "战斗", ringIndex: 2, recommendations: [], preparation: companions.map((item) => `同行者：${item.name}（${item.role}·协同100）`), trailProgress: "七人战阵验收" };
  game.view.combat = { id: "e2e-seven-combat", enemyName: "万年测试魂兽", enemyPower: "万年", round: 0, playerCondition: "良好", enemyCondition: "完好", distance: "中距离", escaped: false, allies: companions.map((item) => ({ name: item.name, role: item.role, readiness: 100, condition: "完好" })) };
  game.world.flags.combatEnemyHp = 2_000;
  database.saveGame(game, "e2e.seven-person-fixture");
}

async function seedSoulSpiritGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 2, gender: "女", difficulty: "标准", seed: "e2e-soul-spirit-contract" });
  generator.selectCandidate(game, game.view.candidates[0].id, "魂灵验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.worldTime!.year = 10_012;
  game.view.character!.soulRank = 10;
  game.view.character!.coins = 2_000;
  game.view.character!.abilityDescriptors.spirit = "顶尖";
  game.view.character!.soulRings = [];
  game.view.character!.soulRingSets[game.view.character!.activeMartialSoulIndex] = [];
  database.saveGame(game, "e2e.soul-spirit-fixture");
}

async function seedBattleArmorGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 3, gender: "男", difficulty: "标准", seed: "e2e-battle-armor-project" });
  generator.selectCandidate(game, game.view.candidates[0].id, "斗铠验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.character!.soulRank = 50;
  game.view.character!.coins = 10_000;
  game.view.character!.abilityDescriptors.perception = "顶尖";
  game.view.professions.push(
    { id: "e2e-armor-design", name: "魂导器研究", level: "熟练", progress: 100, experiments: 12, failures: 0, knownMethods: ["斗铠核心法阵"] },
    { id: "e2e-armor-craft", name: "锻造与炼器", level: "熟练", progress: 100, experiments: 12, failures: 0, knownMethods: ["千锻金属塑形"] },
  );
  database.saveGame(game, "e2e.battle-armor-fixture");
}

async function seedMechaLicenseGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 3, gender: "女", difficulty: "标准", seed: "e2e-mecha-license" });
  generator.selectCandidate(game, game.view.candidates[0].id, "机甲验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.character!.age = 15;
  game.view.character!.coins = 50_000;
  game.view.affiliations.push({ id: "e2e-mecha-school", name: "明都联邦机甲学院", role: "在册学员", reputation: "合格", joinedAt: "验收学籍" });
  game.view.mecha = { license: "无", simulatorProgress: 66, simulatorSessions: 6, practicalPasses: 0 };
  database.saveGame(game, "e2e.mecha-license-fixture");
}

async function seedBlackMechaDesignGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 3, gender: "男", difficulty: "标准", seed: "e2e-black-mecha-design" });
  generator.selectCandidate(game, game.view.candidates[0].id, "黑级机甲验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.character!.age = 18;
  game.view.character!.soulRank = 60;
  game.view.character!.coins = 2_100_000;
  game.view.character!.abilityDescriptors.perception = "顶尖";
  game.view.affiliations.push({ id: "e2e-black-mecha-school", name: "史莱克机甲学院", role: "高级学员", reputation: "优秀", joinedAt: "验收学籍" });
  game.view.relations.push({ id: "e2e-black-designer", name: "林工", relation: "机甲设计师", impression: "可信并熟悉武魂适配", strength: 75, category: "师友" });
  game.view.mecha = { license: "黑级", simulatorProgress: 100, simulatorSessions: 12, practicalPasses: 4 };
  database.saveGame(game, "e2e.black-mecha-design-fixture");
}

async function seedSpiritAscensionGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 3, gender: "女", difficulty: "标准", seed: "e2e-spirit-ascension" });
  generator.selectCandidate(game, game.view.candidates[0].id, "升灵台验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.character!.soulRank = 30;
  game.view.character!.coins = 1_000_000;
  game.view.character!.abilityDescriptors.perception = "顶尖";
  const ring = { index: 1, beastId: "e2e-ascension-ring", beastName: "百年青影狼", years: 900, color: "黄", skillName: "青影突袭", skillDescription: "用于核验升灵台灵力结算的既有魂环。" };
  game.view.character!.soulRingSets[game.view.character!.activeMartialSoulIndex] = [ring];
  game.view.character!.soulRings = game.view.character!.soulRingSets[game.view.character!.activeMartialSoulIndex];
  game.view.affiliations.push({ id: "e2e-east-sea-academy", name: "东海学院", role: "在册学员", reputation: "合格", joinedAt: "验收学籍" });
  game.view.relations.push(
    { id: "e2e-ascension-striker", name: "陆锋", relation: "强攻系同伴", impression: "可信", strength: 70, category: "同伴" },
    { id: "e2e-ascension-guard", name: "石岳", relation: "防御系同伴", impression: "可信", strength: 70, category: "同伴" },
  );
  database.saveGame(game, "e2e.spirit-ascension-fixture");
}

async function seedMechaCareerGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 3, gender: "女", difficulty: "标准", seed: "e2e-mecha-career" });
  generator.selectCandidate(game, game.view.candidates[0].id, "机甲职业验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.character!.coins = 1_000;
  game.view.character!.abilityDescriptors.perception = "顶尖";
  game.view.affiliations.push({ id: "e2e-mecha-career-school", name: "史莱克机甲学院", role: "在册学员", reputation: "合格", joinedAt: "验收学籍" });
  database.saveGame(game, "e2e.mecha-career-fixture");
}

async function seedIntermediateAscensionGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 3, gender: "男", difficulty: "标准", seed: "e2e-intermediate-ascension" });
  generator.selectCandidate(game, game.view.candidates[0].id, "中级升灵台验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.character!.soulRank = 69;
  game.view.character!.abilityDescriptors.perception = "顶尖";
  game.view.character!.battleArmors = [{ tier: 1, title: "一字斗铠", pieces: ["右手前臂甲", "左手前臂甲", "右肩大臂甲", "左肩大臂甲", "胸铠", "腰铠与战裙", "右腿足甲", "左腿足甲", "头盔"], completion: 100, compatibility: 90, status: "完整", maker: game.view.character!.name }];
  const rings = Array.from({ length: 6 }, (_, index) => ({ index: index + 1, beastId: `e2e-middle-${index}`, beastName: `${index + 1}号千年魂兽`, years: 2_000, color: "紫", skillName: `${index + 1}号魂技`, skillDescription: "用于核验中级升灵台。" }));
  game.view.character!.soulRingSets[game.view.character!.activeMartialSoulIndex] = rings;
  game.view.character!.soulRings = rings;
  game.view.affiliations.push({ id: "e2e-middle-pagoda", name: "传灵塔", role: "注册魂师", reputation: "在册", joinedAt: "验收登记" });
  database.saveGame(game, "e2e.intermediate-ascension-fixture");
}

async function seedAdvancedAscensionGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 3, gender: "女", difficulty: "标准", seed: "e2e-advanced-ascension" });
  generator.selectCandidate(game, game.view.candidates[0].id, "高级升灵台验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.character!.soulRank = 90;
  game.view.character!.coins = 3_000_000;
  game.view.character!.abilityDescriptors.perception = "顶尖";
  game.view.character!.battleArmors = [{ tier: 3, title: "三字斗铠", pieces: ["右手前臂甲", "左手前臂甲", "右肩大臂甲", "左肩大臂甲", "胸铠", "腰铠与战裙", "右腿足甲", "左腿足甲", "头盔"], completion: 100, compatibility: 96, status: "完整", maker: game.view.character!.name }];
  const rings = Array.from({ length: 9 }, (_, index) => ({ index: index + 1, beastId: `e2e-advanced-${index}`, beastName: `${index + 1}号高阶魂兽`, years: 20_000, color: "黑", skillName: `${index + 1}号高阶魂技`, skillDescription: "用于核验高级升灵台。" }));
  game.view.character!.soulRingSets[game.view.character!.activeMartialSoulIndex] = rings;
  game.view.character!.soulRings = rings;
  game.view.affiliations.push({ id: "e2e-advanced-pagoda", name: "传灵塔", role: "核心事务成员", reputation: "受到认可", joinedAt: "验收登记", contribution: 20, completedAssignments: 2, rankEvidence: [] });
  game.view.spiritAscensionMembership = { registeredBattleArmorTier: 3, benefitYears: [game.view.worldTime!.year], taskPoints: 20, authorizationEvidence: ["两项传灵塔事务独立验收", "三字斗铠实名登记"] };
  game.view.inventory.push("高级升灵台半价资格");
  database.saveGame(game, "e2e.advanced-ascension-fixture");
}

async function seedStarshipCrewGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 4, gender: "女", difficulty: "标准", seed: "e2e-starship-crew" });
  generator.selectCandidate(game, game.view.candidates[0].id, "舰桥验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.character!.age = 18;
  game.view.starship = { license: "见习指挥", simulatorProgress: 50, simulatorSessions: 6, trainingStartedAge: 12, loggedFlightHours: 0, crew: [], missionsCompleted: 0, crewDrills: 0, crewCoordination: 0, crewEvidence: [] };
  game.view.affiliations.push({ id: "e2e-interstellar-academy", name: "星际史莱克学院", role: "战舰专业学员", contribution: 20, completedAssignments: 0, rankEvidence: ["学院正式学籍"] });
  game.view.relations.push(
    { id: "e2e-pilot", name: "林飞", relation: "星际驾驶员", impression: "可靠并通过飞行训练", strength: 70, category: "同伴" },
    { id: "e2e-navigator", name: "周航", relation: "星图导航员", impression: "可靠并熟悉航线计算", strength: 70, category: "同伴" },
    { id: "e2e-engineer", name: "程机", relation: "轮机工程师", impression: "可靠并擅长动力维修", strength: 70, category: "同伴" },
  );
  database.saveGame(game, "e2e.starship-crew-fixture");
}

async function seedFleetOnboardingGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 4, gender: "男", difficulty: "标准", seed: "e2e-fleet-onboarding" });
  generator.selectCandidate(game, game.view.candidates[0].id, "入舰验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.character!.age = 18;
  game.view.character!.abilityDescriptors.perception = "优秀";
  game.view.affiliations.push({ id: "e2e-federal-fleet", name: "斗罗联邦舰队", role: "现役士兵", reputation: "生疏", joinedAt: "验收军籍", contribution: 0, completedAssignments: 0, rankEvidence: [], militaryRank: "列兵", militaryMerit: 0, flightHours: 0 });
  game.view.starship = { license: "三级指挥", simulatorProgress: 60, simulatorSessions: 6, loggedFlightHours: 0, crew: [], missionsCompleted: 0, crewDrills: 0, crewCoordination: 0, crewEvidence: [] };
  database.saveGame(game, "e2e.fleet-onboarding-fixture");
}

async function createPlayingCharacter(page: import("@playwright/test").Page, era: 1 | 2 | 3 | 4) {
  await page.goto("/");
  if (era > 1) await page.getByRole("button", { name: `斗${era === 2 ? "二" : era === 3 ? "三" : "四"}` }).click();
  await page.getByRole("button", { name: "抽取三名角色" }).click();
  await expect(page.getByRole("heading", { name: "选择角色" })).toBeVisible();
  await page.locator(".select-button").first().click();
  await expect(page.getByRole("heading", { name: "性格底色" })).toBeVisible();
  for (const question of await page.locator(".question-card").all()) await question.locator("label").first().click();
  await page.getByRole("button", { name: "确认性格，进入觉醒" }).click();
  await expect(page.getByRole("button", { name: "觉醒武魂" })).toBeVisible();
  await page.getByRole("button", { name: "觉醒武魂" }).click();
  await expect(page.getByRole("heading", { name: "看清武魂后，再定此生所求" })).toBeVisible();
  await page.getByRole("button", { name: "确定目标与觉醒处置，开始故事" }).click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
}

async function submitAction(page: import("@playwright/test").Page, action: string) {
  await page.getByPlaceholder("输入行动或对话……").fill(action);
  await page.getByRole("button", { name: "行动", exact: true }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText(action);
  await expect(page.locator(".action-form textarea")).toBeEnabled();
}

async function clickEraAction(page: import("@playwright/test").Page, buttonName: string, submittedAction: string) {
  await page.getByRole("button", { name: "时代", exact: true }).click();
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText(submittedAction);
  await expect(page.locator(".action-form textarea")).toBeEnabled();
}

test.beforeEach(async ({ request }) => {
  const games = await request.get("/api/games");
  expect(games.ok()).toBeTruthy();
  for (const game of await games.json() as Array<{ id: string }>) {
    const deleted = await request.delete(`/api/games/${game.id}`);
    expect(deleted.ok()).toBeTruthy();
  }
});

test.afterAll(() => fixtureDatabase?.closeDatabase());

test.afterEach(async ({ request }) => {
  await request.post("/api/meta/preferences", { data: { origin: "均衡", martialSoul: "均衡", gift: "均衡" } });
});

test("候选页只显示人工身份并保证三张开局流派不同", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "抽取三名角色" }).click();
  await expect(page.getByRole("heading", { name: "选择角色" })).toBeVisible();
  await expect(page.getByText("出生池现有 80 份具体档案", { exact: false })).toBeVisible();
  const styles = await page.locator(".opening-style").allTextContents();
  expect(styles).toHaveLength(3);
  expect(new Set(styles).size).toBe(3);
  expect((await page.locator(".candidate-origin").allTextContents()).every((name) => !name.includes("护阵房学徒家庭"))).toBe(true);
});

test("局外召唤区直接提供武魂、身世与遗物仓库", async ({ page }) => {
  await seedUnlimitedMartialSoulWarehouse();
  await page.goto("/");
  await page.getByRole("button", { name: "✦ 局外成长 传承与图鉴" }).click();
  const poolText = await page.locator(".soul-draw-rules").innerText();
  expect(Number(poolText.match(/武魂池\s+(\d+)\s+种/)?.[1] ?? 0)).toBeGreaterThanOrEqual(180);
  await expect(page.getByTestId("summon-tab-souls")).toBeVisible();
  await expect(page.getByTestId("summon-tab-origins")).toBeVisible();
  await expect(page.getByTestId("summon-tab-heirlooms")).toBeVisible();
  await expect(page.locator(".soul-warehouse-section")).toBeVisible();
  await expect(page.locator(".soul-warehouse-section")).toContainText("永久无限");
  await page.getByRole("button", { name: "收起仓库", exact: true }).click();
  await expect(page.locator(".martial-soul-codex")).not.toBeVisible();
  await page.getByRole("button", { name: "展开仓库", exact: true }).click();
  const raritySelect = page.locator(".soul-warehouse-section select");
  await raritySelect.selectOption("紫色");
  expect(await raritySelect.evaluate((element) => (element as HTMLSelectElement).value)).toBe("紫色");
  await page.getByTestId("summon-tab-origins").click();
  await expect(page.locator(".origin-warehouse-section")).toBeVisible();
  await expect(page.locator(".origin-warehouse-section")).toContainText("最低为紫色");
  await expect(page.getByRole("button", { name: /身世召唤/ })).toBeVisible();
  await expect(page.locator(".origin-pity-rules")).toContainText("七彩保底 60 抽");
  await page.getByTestId("summon-tab-heirlooms").click();
  await expect(page.locator(".heirloom-warehouse-section")).toBeVisible();
  await expect(page.locator(".heirloom-warehouse-section")).toContainText("每局发动次数限制");
});

test("模型设置显示本地向量记忆状态", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "模型设置" }).click();
  await expect(page.getByRole("dialog", { name: "DeepSeek 设置" })).toBeVisible();
  await expect(page.getByText(/本地向量记忆：\d+ 条 · 384 维 · 每回合最多召回 8 条/)).toBeVisible();
  await expect(page.getByText(/斗罗世界知识：\d+ 条 · 每回合最多召回 10 条/)).toBeVisible();
  await expect(page.getByText(/世界基本逻辑：\d+ 条 · 每回合最多召回 8 条/)).toBeVisible();
  await expect(page.getByText(/生成前检索审计：累计 \d+ 次/)).toBeVisible();
});

test("手记显示错过地方事件留下的持续后果", async ({ page }) => {
  await seedLocalConsequenceGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "地方后果验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await page.getByRole("button", { name: /^手记/ }).click();
  await expect(page.locator(".local-consequence-list")).toContainText("正在改变当地生活");
  await expect(page.locator(".local-consequence-list")).toContainText("本地常用药材短缺");
  await expect(page.locator(".local-consequence-list")).toContainText("影响 3/5");
});

test("已知人物只显示当前人生阶段姓名与公开归属", async ({ page }) => {
  await seedCurrentLifeStageGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "时间线验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await page.getByRole("button", { name: "世界", exact: true }).click();
  await expect(page.locator(".figure-list")).toContainText("古月");
  await expect(page.locator(".figure-list")).not.toContainText("古月娜");
  await expect(page.locator(".figure-list")).not.toContainText("银龙斗罗");
  await expect(page.locator(".figure-list")).not.toContainText("传灵塔");
});

test("宗门本体武魂开局使用专属显形、目标与资源路线", async ({ page }) => {
  await seedOpeningMatrixGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "开局矩阵验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.locator(".chapter-objective")).toContainText("太玄剑宗内部觉醒");
  await expect(page.locator(".chapter-objective")).toContainText("导师、训练场、资源额度与猎魂护送");
  await expect(page.locator(".narrative-stream")).toContainText("两手空空");
  await expect(page.locator(".narrative-stream")).toContainText("身体本身的变化");
  await expect(page.locator(".narrative-stream")).not.toContainText("先天道体托在掌心");
  await expect(page.locator(".chapter-objective")).not.toContainText("加入宗门");
});

test("学院入学与拜师必须经过材料、考核和试学，不会一句话送身份", async ({ page }) => {
  test.setTimeout(90_000);
  await seedEarlyGrowthGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "早期成长验收" });
  await save.locator("button").first().click();
  await submitAction(page, "申请诺丁初级魂师学院入学");
  await page.getByRole("button", { name: /^任务/ }).click();
  await expect(page.locator(".growth-application-panel")).toContainText("材料准备");
  await expect(page.locator(".growth-application-panel")).toContainText("普通学员 · 家庭自费");
  await expect(page.locator(".growth-application-panel")).not.toContainText("工读生 · 工读抵扣");
  await page.getByRole("button", { name: "改走学院奖助", exact: true }).click();
  await expect(page.locator(".growth-application-panel")).toContainText("普通学员 · 学院奖助");
  await page.getByRole("button", { name: "改走家庭自费", exact: true }).click();
  await submitAction(page, "准备诺丁初级魂师学院报名材料和监护签字");
  await expect(page.locator(".growth-application-panel")).toContainText("入学考核");
  await submitAction(page, "参加诺丁初级魂师学院入学考核");
  await expect(page.locator(".growth-application-panel")).toContainText("待报到");
  await submitAction(page, "办理诺丁初级魂师学院入学报到");
  await expect(page.locator(".growth-application-panel")).toContainText("已入学");
  await expect(page.locator(".growth-application-panel")).toContainText("学院首月 · 报到安置");
  await submitAction(page, "去宿舍安置并领取课表");
  await submitAction(page, "参加第一堂魂师基础课程");
  await submitAction(page, "参加第二堂魂师基础课程");
  const peerNames = await page.locator(".academy-peer-list section > strong").allTextContents();
  expect(peerNames).toHaveLength(3);
  const firstPeer = peerNames[0].split(" · ")[0];
  const secondPeer = peerNames[1].split(" · ")[0];
  await submitAction(page, `与${firstPeer}完成一次小组练习`);
  await submitAction(page, "参加第三堂魂师基础课程");
  await submitAction(page, `与${secondPeer}完成一次小组练习`);
  await expect(page.locator(".growth-application-panel")).toContainText("首月实战考核");
  await submitAction(page, "参加学院首月实战考核");
  await expect(page.locator(".growth-application-panel")).toContainText("学院首月 · 首月结业");

  await submitAction(page, "寻找适合当前武魂的导师");
  await expect(page.locator(".growth-application-panel")).toContainText("候选接触");
  await expect(page.locator(".growth-application-panel")).toContainText("专长");
  await expect(page.locator(".growth-application-panel")).toContainText("教学");
  await expect(page.locator(".growth-application-panel")).toContainText("禁忌");
  const mentorName = await page.locator(".growth-application-panel article").filter({ hasText: "导师候选" }).locator("strong").textContent();
  if (!mentorName) throw new Error("导师候选未显示姓名");
  await submitAction(page, `请${mentorName}评估公开武魂与现有基础`);
  await submitAction(page, `完成${mentorName}第一次试学训练`);
  await expect(page.locator(".growth-application-panel")).toContainText("试学考察");
  await submitAction(page, `完成${mentorName}第二次试学训练`);
  await expect(page.locator(".growth-application-panel")).toContainText("待决定");
  await submitAction(page, `与${mentorName}谈清责任后正式拜师`);
  await expect(page.locator(".growth-application-panel")).toContainText("已拜师");
  await submitAction(page, `完成${mentorName}下一节正式课程`);
  await expect(page.locator(".growth-application-panel")).toContainText("正式课程1");
  await submitAction(page, `请${mentorName}评估第一魂环路线`);
  await expect(page.locator(".narrative-stream")).toContainText("魂环方向待调查");
});

test("指定签到金手指会保证出现并在觉醒后提供可用按钮", async ({ page, request }) => {
  const saved = await request.post("/api/meta/preferences", { data: { origin: "均衡", martialSoul: "均衡", gift: "签到系统" } });
  expect(saved.ok()).toBeTruthy();
  await createPlayingCharacter(page, 1);
  await page.getByRole("button", { name: "武魂", exact: true }).click();
  await expect(page.getByText("万象签到系统", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "今日签到", exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeEnabled();
  await page.getByRole("button", { name: "今日签到", exact: true }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText("在当前地点签到");
});

test("玩家可以完成角色创建、推进故事并管理存档", async ({ page }) => {
  await createPlayingCharacter(page, 1);
  await expect(page.locator(".game-era-1 .game-topbar")).toBeVisible();
  await page.getByRole("button", { name: "背包", exact: true }).click();
  await expect(page.getByRole("button", { name: "承接货运", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^手记/ }).click();
  await expect(page.locator(".story-arc-card")).toBeVisible();
  await expect(page.locator(".story-arc-card")).toContainText("第 1 卷 · 成长主线");
  await expect(page.locator(".story-arc-card")).toContainText("本卷目标");
  await page.getByPlaceholder("搜索已知档案……").fill("第一魂环");
  await expect(page.locator(".known-record-search")).toContainText("获得第一魂环");
  await submitAction(page, "在住处等待一天，留意附近动静");
  await expect(page.locator(".story-arc-card header > strong")).toHaveText("立局");
  await expect(page.locator(".story-gate-card")).toContainText("可结算的主动行动");
  await expect(page.getByText("晨光沿着窗纸落进屋里", { exact: false })).toBeVisible();
  await page.getByText("查看判定", { exact: true }).click();
  await expect(page.locator(".action-receipt small")).toContainText("世界时间推进");

  await page.getByRole("button", { name: "返回书架" }).click();
  await expect(page.getByRole("heading", { name: "存档" })).toBeVisible();
  await page.locator(".delete-save").first().click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.locator(".save-shelf")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "抽取三名角色" })).toBeVisible();
});

test("大陆地图可以展开、选择地点并下钻到可交互局部图", async ({ page }) => {
  await createPlayingCharacter(page, 1);
  await page.getByRole("button", { name: "地图", exact: true }).click();
  await expect(page.getByRole("button", { name: "展开地图", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "展开地图", exact: true }).click();
  await expect(page.locator(".map-panel-visual.map-expanded")).toBeVisible();
  await expect(page.getByRole("img", { name: "斗罗大陆第1时代交互地图" })).toBeVisible();
  await page.locator(".atlas-landmark.interactive").first().click({ force: true });
  await expect(page.locator(".map-current-detail")).toBeVisible();
  await expect(page.locator(".map-current-detail")).toContainText(/原著地点|原著归纳地点|原创地点/);
  await expect(page.locator(".map-route-list")).toContainText("游戏估算");
  await page.locator(".map-level-tabs button").nth(1).click();
  await expect(page.getByRole("img", { name: "聚居地地图" })).toBeVisible();
  await expect(page.locator(".local-map-list button")).toHaveCount(5);
  await page.locator(".local-map-list button").nth(1).click();
  await expect(page.locator(".local-selection")).toBeVisible();
  await page.getByRole("button", { name: "收起地图", exact: true }).click();
  await expect(page.locator(".map-panel-visual.map-expanded")).toHaveCount(0);
});

test("剧情导演按证据门槛展示兑现债务与NPC主动场景", async ({ page }) => {
  await createPlayingCharacter(page, 1);
  await page.getByRole("button", { name: /^手记/ }).click();
  await expect(page.locator(".story-arc-card")).toContainText("成长主线");
  await expect(page.locator(".story-gate-card")).toContainText("进入下一阶段还缺什么");
  expect(await page.locator(".story-payoff-list article").count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator(".story-payoff-list")).toContainText("待兑现");
  await expect(page.locator(".npc-initiative-card")).toContainText("主动找来");
  await expect(page.locator(".suggestion-list button")).toHaveCount(3);
});

test("玩家可以从界面进入斗四且出生地图不会显示斗一地标", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "同一幻想大陆从森林村落演变到星际文明的原创全景" })).toBeVisible();
  await page.getByRole("button", { name: "斗四" }).click();
  await expect(page.locator(".era-panorama-4")).toContainText("星际舰队、行星航路与宇宙文明");
  await expect(page.getByRole("heading", { name: "终极斗罗" })).toBeVisible();
  await page.getByRole("button", { name: "抽取三名角色" }).click();
  await expect(page.getByRole("heading", { name: "选择角色" })).toBeVisible();
  await expect(page.locator(".candidate-meta").first()).toContainText("蓝轩宇");
  await expect(page.getByText("武魂城", { exact: true })).toHaveCount(0);
  await expect(page.getByText("诺丁城", { exact: true })).toHaveCount(0);
  await expect(page.getByText("斗罗联邦", { exact: true })).toBeVisible();
  await expect(page.getByText("天罗星", { exact: true })).toBeVisible();
  await expect(page.getByText("天斗星", { exact: true })).toBeVisible();
  await expect(page.getByText("天斗帝国", { exact: true })).toHaveCount(0);
});

test("斗二斗三斗四专属系统可以从浏览器行动并显示持久状态", async ({ page }) => {
  await createPlayingCharacter(page, 2);
  await clickEraAction(page, "学习核心阵法", "学习一级魂导器核心阵法");
  await expect(page.getByText(/熟练度 [1-9][0-9]?%/)).toBeVisible();
  await expect(page.getByText("魂灵与魂导纪元", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "返回书架" }).click();
  await createPlayingCharacter(page, 3);
  await page.getByRole("button", { name: "地图", exact: true }).click();
  await expect(page.getByText("傲来城", { exact: true }).first()).toBeVisible();
  await clickEraAction(page, "机甲模拟", "进行机甲模拟训练");
  await expect(page.getByText("机甲资质 · 无", { exact: true })).toBeVisible();
  await expect(page.getByText(/模拟训练 \d+% · 1 次/)).toBeVisible();

  await page.getByRole("button", { name: "返回书架" }).click();
  await createPlayingCharacter(page, 4);
  await expect(page.locator(".world-clock strong")).toContainText("蓝轩宇");
  await expect(page.locator(".world-clock strong")).not.toContainText("唐三");
  await clickEraAction(page, "舰桥模拟", "进行星舰指挥模拟训练");
  await expect(page.getByText("星舰资格 · 无", { exact: true })).toBeVisible();
  await expect(page.getByText(/指挥训练 0% · 真实飞行 0 小时 · 船员 0 · 舰桥协同 0% · 完成任务 0/)).toBeVisible();
});

test("机构分支、失败代价与具名复核人会谈会持久显示到任务界面", async ({ page }) => {
  await seedBasicInstitutionGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "机构分支验收" });
  await save.locator("button").first().click();
  await page.getByRole("button", { name: "人物", exact: true }).click();
  await expect(page.locator(".affiliation-list article").first()).toBeVisible();
  await page.locator(".affiliation-list article").first().getByRole("button", { name: "领任务" }).click();
  await expect(page.locator(".action-form textarea")).toBeEnabled();
  await page.getByRole("button", { name: /^任务/ }).click();
  const assignment = page.locator(".task-timeline article").filter({ hasText: "分支" }).first();
  await expect(assignment).toBeVisible();
  await expect(assignment).toContainText(/外勤分支|情报分支|支援分支/);
  await expect(assignment).toContainText("失败代价");
  const reviewer = page.locator(".player-relation-ledger article").first();
  await expect(reviewer).toBeVisible();
  await expect(reviewer).toContainText("复核执事");
  await reviewer.getByRole("button", { name: "询问异议" }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText("当前验收异议");
  await expect(reviewer).toContainText("会谈 1");
});

test("机构双复核派系冲突必须分别会谈并基于阶段证据共同协调", async ({ page }) => {
  await seedInstitutionFactionConflictGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "派系复核验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await page.getByRole("button", { name: /^任务/ }).click();
  const ledger = page.locator(".player-relation-ledger");
  const primary = ledger.locator("article").filter({ hasText: "冷澄" });
  const counter = ledger.locator("article").filter({ hasText: "许遥" });
  const factions = ledger.locator("article").filter({ hasText: "机构内部复核" });
  await expect(primary).toContainText("主审 · 魂灵来源复核员");
  await expect(primary).toContainText("来源合规组");
  await expect(counter).toContainText("独立复核 · 适配复核员");
  await expect(counter).toContainText("适配服务组");
  await expect(factions).toContainText("待复核");
  await factions.getByRole("button", { name: "共同协调" }).click();
  await expect(factions).toContainText("待复核");
  await primary.getByRole("button", { name: "询问异议" }).click();
  await counter.getByRole("button", { name: "询问异议" }).click();
  await factions.getByRole("button", { name: "共同协调" }).click();
  await expect(factions).toContainText("已协调");
  await expect(factions).toContainText("双方基于2条阶段证据签署联合复核边界");
  await expect(primary).toContainText("会谈 1");
  await expect(counter).toContainText("会谈 1");
  await page.getByRole("button", { name: "人物", exact: true }).click();
  const affiliation = page.locator(".affiliation-list article").filter({ hasText: "传灵塔" });
  await expect(affiliation).toContainText("来源合规组 · 影响 50 · 信任 2");
  await expect(affiliation).toContainText("适配服务组 · 影响 50 · 信任 2");
  await expect(affiliation).toContainText("政治记录");
  await page.reload();
  await page.locator(".save-shelf article").filter({ hasText: "派系复核验收" }).locator("button").first().click();
  await page.getByRole("button", { name: "人物", exact: true }).click();
  await expect(page.locator(".affiliation-list article").filter({ hasText: "传灵塔" })).toContainText("来源合规组 · 影响 50 · 信任 2");
});

test("固定连携训练会在浏览器显示熟练度、战术分支与失败复盘", async ({ page }) => {
  await seedComboTrainingGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "连携验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  for (let session = 1; session <= 6; session += 1) await submitAction(page, "与石岳和苏叶共同训练生命防线连携");
  await page.getByRole("button", { name: /^猎魂/ }).click();
  const training = page.locator(".player-relation-ledger article").filter({ hasText: "生命防线" });
  await expect(training).toBeVisible();
  await expect(training).toContainText("轮换救护");
  await expect(training).toContainText("训练 6 次 · 失败复盘 1 次 · 证据 6 条");
});

test("责任编辑采访、独立补证与更正会形成完整浏览器责任链", async ({ page }) => {
  await seedMediaAccountabilityGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "媒介验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: /^世界/ }).click();
  const competition = page.locator(".media-accountability-panel article").filter({ has: page.getByRole("button", { name: "对比核验链" }) });
  await expect(competition).toContainText("首发竞争");
  await expect(competition).toContainText("大陆魂导传媒公共频道领先");
  await competition.getByRole("button", { name: "对比核验链" }).click();
  await expect(page.getByText("媒体竞争核验 · 大陆魂导传媒公共频道 / 地方民生频道", { exact: true })).toBeVisible();
  await competition.getByRole("button", { name: "提议核验联盟" }).click();
  const alliance = page.locator(".media-accountability-panel article").filter({ hasText: "跨地区核验联盟" });
  await expect(alliance).toContainText("提议中");
  await alliance.getByRole("button", { name: "启动试运行" }).click();
  await expect(alliance).toContainText("提议中");
  const editor = page.locator(".media-accountability-panel article").filter({ hasText: "林简" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "采访编辑" }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText("询问选稿依据");
  await expect(editor).toContainText("互动 1 次");
  const secondaryEditor = page.locator(".media-accountability-panel article").filter({ hasText: "唐芷" });
  await secondaryEditor.getByRole("button", { name: "采访编辑" }).click();
  await expect(secondaryEditor).toContainText("互动 1 次");
  await alliance.getByRole("button", { name: "启动试运行" }).click();
  await expect(alliance).toContainText("试运行");
  await expect(alliance).toContainText("共享核验资源 2");
  await alliance.getByRole("button", { name: "登记第三家候选" }).click();
  await expect(alliance).toContainText("大陆独立事实核验站");
  await expect(alliance).toContainText("裴真 · 候选核验");
  await alliance.getByRole("button", { name: "批准第三家加入" }).click();
  await expect(alliance).toContainText("正式成员 2 家");
  await editor.getByRole("button", { name: "采访编辑" }).click();
  await secondaryEditor.getByRole("button", { name: "采访编辑" }).click();
  const candidateEditor = page.locator(".media-accountability-panel article").filter({ hasText: "裴真", has: page.getByRole("button", { name: "采访编辑" }) });
  await expect(candidateEditor).toBeVisible();
  await candidateEditor.getByRole("button", { name: "采访编辑" }).click();
  await submitAction(page, "调查候选机构的独立来源记录");
  await alliance.getByRole("button", { name: "批准第三家加入" }).click();
  await expect(alliance).toContainText("正式成员 3 家");
  await expect(alliance).toContainText("共享核验资源 3");
  await expect(alliance).toContainText("大陆独立事实核验站");
  const supplyAgenda = alliance.locator(".alliance-agenda").filter({ hasText: "外城药材供应中断" });
  await supplyAgenda.getByRole("button", { name: "设为优先" }).click();
  await expect(alliance).toContainText("资源冲突");
  await expect(alliance).toContainText("1 个议题因资源有限延后");
  await alliance.getByRole("button", { name: "共同核验" }).click();
  await expect(supplyAgenda).toContainText("共同核验");
  await expect(alliance).toContainText("共享核验资源 2");
  await submitAction(page, "调查报道来源和现场记录");
  await editor.getByRole("button", { name: "独家交线索" }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText("提交独家补充证据");
  await expect(editor).toContainText("互动 3 次");
  await expect(competition).toContainText("核验拉锯");
  await expect(competition).toContainText("最近独家线索交给大陆魂导传媒公共频道");
  await submitAction(page, "申请核验负面传闻");
  await submitAction(page, "调查消息来源和现场记录");
  await submitAction(page, "提交调查证据公开澄清负面传闻");
  await expect(editor).toContainText("已签发更正");
  await expect(competition).toContainText("更正问责");
  await expect(competition).toContainText("地方民生频道领先");
  await expect(alliance).toContainText("暂停合作");
  await expect(alliance).toContainText("共享核验资源 0");
  await alliance.getByRole("button", { name: "登记修复计划" }).click();
  await expect(alliance).toContainText("修复审核");
  await alliance.getByRole("button", { name: "提交恢复复核" }).click();
  await expect(alliance).toContainText("修复审核");
  await editor.getByRole("button", { name: "采访编辑" }).click();
  await secondaryEditor.getByRole("button", { name: "采访编辑" }).click();
  await candidateEditor.getByRole("button", { name: "采访编辑" }).click();
  await submitAction(page, "调查更正后的来源登记");
  await submitAction(page, "调查外城药材供应记录");
  await alliance.getByRole("button", { name: "提交恢复复核" }).click();
  await expect(alliance).toContainText("受限恢复");
  await expect(alliance).toContainText("共享核验资源 1");
  const recoveryAgenda = alliance.locator(".alliance-agenda").filter({ hasNotText: "外城药材供应中断" });
  await recoveryAgenda.getByRole("button", { name: "设为优先" }).click();
  await alliance.getByRole("button", { name: "观察期核验" }).click();
  await expect(alliance).toContainText("试运行");
  await expect(alliance).toContainText("观察期剩余 0 次");
  await expect(alliance).toContainText("共享核验资源 0");
  await alliance.getByRole("button", { name: "申请补充资源" }).click();
  await expect(alliance).toContainText("共享核验资源 0");
  await editor.getByRole("button", { name: "采访编辑" }).click();
  await secondaryEditor.getByRole("button", { name: "采访编辑" }).click();
  await candidateEditor.getByRole("button", { name: "采访编辑" }).click();
  await submitAction(page, "调查联盟耗尽后的异地回函");
  await submitAction(page, "调查联盟耗尽后的另一来源");
  await alliance.getByRole("button", { name: "申请补充资源" }).click();
  await expect(alliance).toContainText("共享核验资源 1");
  await expect(alliance).toContainText("已审计补充 1 次");
  await alliance.getByRole("button", { name: "申请大陆独立事实核验站退出" }).click();
  await expect(alliance).toContainText("大陆独立事实核验站 · 裴真 · 待退出复核");
  await alliance.getByRole("button", { name: "批准大陆独立事实核验站退出" }).click();
  await expect(alliance).toContainText("待退出复核");
  await editor.getByRole("button", { name: "采访编辑" }).click();
  await secondaryEditor.getByRole("button", { name: "采访编辑" }).click();
  await candidateEditor.getByRole("button", { name: "采访编辑" }).click();
  await alliance.getByRole("button", { name: "批准大陆独立事实核验站退出" }).click();
  await expect(alliance).toContainText("成员不足");
  await expect(alliance).toContainText("正式成员 2 家");
  await expect(alliance).toContainText("共享核验资源 1");
  await expect(alliance).toContainText("大陆独立事实核验站 · 裴真 · 已退出");
  await expect(alliance.getByRole("button", { name: "共同核验" })).toBeDisabled();
  await alliance.getByRole("button", { name: "登记替补候选" }).click();
  await expect(alliance).toContainText("联邦公共查证协作社 · 乔衡 · 替补核验");
  await alliance.getByRole("button", { name: "批准替补加入" }).click();
  await expect(alliance).toContainText("正式成员 2 家");
  await editor.getByRole("button", { name: "采访编辑" }).click();
  await secondaryEditor.getByRole("button", { name: "采访编辑" }).click();
  const replacementEditor = page.locator(".media-accountability-panel article").filter({ hasText: "乔衡", has: page.getByRole("button", { name: "采访编辑" }) });
  await replacementEditor.getByRole("button", { name: "采访编辑" }).click();
  await submitAction(page, "调查替补机构的独立来源记录");
  await alliance.getByRole("button", { name: "批准替补加入" }).click();
  await expect(alliance).toContainText("正式成员 3 家");
  await expect(alliance).toContainText("联邦公共查证协作社");
  await expect(alliance).toContainText("共享核验资源 1");
  await expect(page.locator(".news-list")).toContainText("更正说明");
  await expect(page.locator(".news-list")).toContainText("旧消息");
});

test("四人编队可以从共同训练、明确出发一路进入实战并发动", async ({ page }) => {
  await seedFourPersonFormationGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "战阵验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  for (let session = 1; session <= 4; session += 1) await submitAction(page, "与陆锋石岳宁索苏叶共同训练四象战阵");
  await submitAction(page, "休息恢复");
  for (let session = 5; session <= 6; session += 1) await submitAction(page, "与陆锋石岳宁索苏叶共同训练四象战阵");
  await page.getByRole("button", { name: /^猎魂/ }).click();
  const training = page.locator(".player-relation-ledger article").filter({ hasText: "四象战阵" });
  await expect(training).toContainText("四角轮换");
  for (const [name, role] of [["陆锋", "强攻"], ["石岳", "防护"], ["宁索", "控制"], ["苏叶", "治疗"]] as const) await submitAction(page, `邀请${name}担任${role}岗位同行猎魂`);
  await submitAction(page, "请陆锋办理猎魂手令");
  await expect(page.locator(".hunt-stage strong")).toHaveText("准备");
  await submitAction(page, "出发猎魂");
  await expect(page.locator(".hunt-stage strong")).toHaveText("旅行");
  await submitAction(page, "出发前往魂兽栖息地");
  await expect(page.locator(".hunt-stage strong")).toHaveText("追踪");
  const prepareFormation = page.getByRole("button", { name: "准备四人编队" });
  for (let attempt = 0; attempt < 6 && !await prepareFormation.isVisible(); attempt += 1) await submitAction(page, "寻找足迹追踪魂兽");
  await expect(prepareFormation).toBeVisible();
  const combatScene = page.locator(".combat-scene");
  await expect(combatScene).toBeVisible();
  await expect(combatScene.locator("img")).toHaveAttribute("src", "/assets/combat-era-1.webp");
  await expect(combatScene).toContainText("原创战斗环境 · 斗1");
  await prepareFormation.click();
  await expect(page.locator(".hunt-target").filter({ hasText: "连携准备" })).toContainText("四象战阵");
  await expect(page.locator(".hunt-target").filter({ hasText: "连携准备" })).toContainText("四角轮换");
  await page.getByRole("button", { name: "发动连携" }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText("发动已准备的多人连携");
  await page.getByText("查看判定", { exact: true }).click();
  await expect(page.locator(".action-receipt p")).toContainText("发动连携“四象战阵”");
  await expect(page.locator(".hunt-stage strong")).toHaveText("吸收");
  await expect(page.locator(".hunt-stage")).toContainText("目标已被击败");
});

test("七人固定战阵会在浏览器核对重复岗位、训练档案、全员储备与长冷却", async ({ page }) => {
  await seedSevenPersonFormationGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "七人战阵验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: /^猎魂/ }).click();
  const training = page.locator(".player-relation-ledger article").filter({ hasText: "七星全域战阵" });
  await expect(training).toContainText("60%");
  const combat = page.locator(".hunt-target").filter({ hasText: "万年测试魂兽" });
  await expect(combat).toContainText("陆锋（强攻·协同100");
  await expect(combat).toContainText("赵烈（强攻·协同100");
  await expect(combat).toContainText("石岳（防护·协同100");
  await expect(combat).toContainText("韩垒（防护·协同100");
  await page.getByRole("button", { name: "准备七人战阵" }).click();
  await expect(combat).toContainText("连携准备 · 七星全域战阵");
  await page.getByRole("button", { name: "发动连携" }).click();
  await expect(combat).toContainText("协同60");
  await expect(combat).toContainText("连携冷却至第 10 回合");
  await page.getByText("查看判定", { exact: true }).click();
  await expect(page.locator(".action-receipt p")).toContainText("发动连携“七星全域战阵”");
});

test("斗二魂灵必须从申请、适配评估走到付费契约并形成持久魂灵", async ({ page }) => {
  await seedSoulSpiritGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "魂灵验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: "时代", exact: true }).click();
  let contract = page.locator(".special-system-card").filter({ hasText: "魂灵" }).first();
  await contract.getByRole("button", { name: "申请魂灵" }).click();
  contract = page.locator(".special-system-card").filter({ hasText: "阶段 调查" });
  await expect(contract).toBeVisible();
  await contract.getByRole("button", { name: "签订契约" }).click();
  await expect(contract).toContainText("阶段 调查");
  await contract.getByRole("button", { name: "评估适配" }).click();
  contract = page.locator(".special-system-card").filter({ hasText: "阶段 可签约" });
  await expect(contract).toContainText(/适配 [6-9][0-9]%/);
  await contract.getByRole("button", { name: "签订契约" }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText("签订魂灵契约");
  await page.getByRole("button", { name: "武魂", exact: true }).click();
  const spirit = page.locator(".special-system-card").filter({ hasText: "人工魂灵" });
  await expect(spirit).toBeVisible();
  await expect(spirit).toContainText("磨合");
});

test("斗三斗铠必须完成设计、材料门禁与逐件制作", async ({ page }) => {
  await seedBattleArmorGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "斗铠验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: "时代", exact: true }).click();
  let project = page.locator(".special-system-card").filter({ hasText: "斗铠工程" });
  for (let design = 0; design < 4; design += 1) await project.getByRole("button", { name: "设计一字斗铠" }).click();
  await expect(project).toContainText("图纸 100%");
  await project.getByRole("button", { name: "制作下一部件" }).click();
  await expect(project).toContainText("下一件 右手前臂甲");
  await project.getByRole("button", { name: "购买斗铠金属" }).click();
  for (let attempt = 0; attempt < 3 && await project.getByText("下一件 右手前臂甲", { exact: false }).count(); attempt += 1) {
    await project.getByRole("button", { name: "制作下一部件" }).click();
    if ((await project.textContent())?.includes("下一件 左手前臂甲")) break;
    await project.getByRole("button", { name: "购买斗铠金属" }).click();
  }
  await expect(project).toContainText("下一件 左手前臂甲");
  await expect(page.getByText("斗铠 · 1字斗铠 · 右手前臂甲", { exact: true })).toBeVisible();
});

test("斗三机甲必须逐级取证且成年后才能登记所有权并试驾", async ({ page }) => {
  await seedMechaLicenseGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "机甲验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: "时代", exact: true }).click();
  const mecha = page.locator(".special-system-card").filter({ hasText: "机甲资质" });
  await submitAction(page, "参加黄级机甲驾驶考核");
  await expect(mecha).toContainText("机甲资质 · 无");
  await mecha.getByRole("button", { name: "资质考核" }).click();
  await expect(mecha).toContainText("机甲资质 · 白级");
  await mecha.getByRole("button", { name: "资质考核" }).click();
  await expect(mecha).toContainText("机甲资质 · 黄级");
  await mecha.getByRole("button", { name: "购置机甲" }).click();
  await expect(mecha).toContainText("尚无自有机甲");
  await submitAction(page, "等待一年");
  await mecha.getByRole("button", { name: "购置机甲" }).click();
  await expect(mecha).toContainText("黄色民用制式机甲");
  await expect(mecha).toContainText("完好 · 能源 100%");
  await mecha.getByRole("button", { name: "低速试驾" }).click();
  await expect(mecha).toContainText("完好 · 能源 90%");
});

test("斗三黑级机甲必须完成武魂专属设计并绑定唯一所有者", async ({ page }) => {
  await seedBlackMechaDesignGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "黑级机甲验收" });
  await expect(save).toBeVisible();
  const ownerName = await save.locator("strong").first().textContent();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: "时代", exact: true }).click();
  const mecha = page.locator(".special-system-card").filter({ hasText: "机甲资质" });
  await mecha.getByRole("button", { name: "购置机甲" }).click();
  await expect(mecha).toContainText("尚无自有机甲");
  for (let session = 0; session < 3; session += 1) await mecha.getByRole("button", { name: "专属设计" }).click();
  await expect(mecha).toContainText(/专属设计 · 黑级 · .+ · 100% · 林工/);
  await mecha.getByRole("button", { name: "购置机甲" }).click();
  await expect(mecha).toContainText(/黑色.+超级机甲/);
  await expect(mecha).toContainText(`所有者 ${ownerName}`);
  const registeredModel = await mecha.locator("strong").textContent();
  await submitAction(page, "把黑级机甲过户转让给林工");
  await expect(mecha.locator("strong")).toHaveText(registeredModel ?? "");
});

test("斗三初级升灵台必须付费入场、虚拟遭遇、主动退出后再结算", async ({ page }) => {
  await seedSpiritAscensionGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "升灵台验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: "时代", exact: true }).click();
  const ascension = page.locator(".special-system-card").filter({ hasText: "升灵台" });
  await ascension.getByRole("button", { name: "申请初级" }).click();
  await expect(ascension).toContainText("升灵台 · 已预约");
  await ascension.getByRole("button", { name: "进入升灵台" }).click();
  await expect(ascension).toContainText("升灵台 · 探索中");
  await ascension.getByRole("button", { name: "搜寻魂兽" }).click();
  await expect(ascension).toContainText("虚拟击败 1");
  await expect(ascension).toContainText(/灵力 [1-9][0-9]*/);
  await ascension.getByRole("button", { name: "主动退出" }).click();
  await expect(ascension).toContainText("升灵台 · 待结算");
  await ascension.getByRole("button", { name: "结算灵力" }).click();
  await expect(ascension).toContainText("升灵台 · 已结算");
  await expect(ascension).toContainText(/上次结算增加 [1-9][0-9]* 年/);
  await page.getByRole("button", { name: "武魂", exact: true }).click();
  await expect(page.locator(".ring-list")).toContainText(/9[1-9][0-9] 年/);
});

test("斗三升灵台暴动期必须明确组队并完成百秒守护才能稳固灵力", async ({ page }) => {
  await seedSpiritAscensionGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "升灵台验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await submitAction(page, "申请暴动期初级升灵台团队名额，与陆锋和石岳组队");
  await page.getByRole("button", { name: "时代", exact: true }).click();
  const ascension = page.locator(".special-system-card").filter({ hasText: "升灵台" });
  await expect(ascension).toContainText("暴动期 · 初级");
  await expect(ascension).toContainText("同行 · 陆锋、石岳");
  await ascension.getByRole("button", { name: "进入升灵台" }).click();
  await ascension.getByRole("button", { name: "搜寻魂兽" }).click();
  await expect(ascension).toContainText("灵力 0");
  await expect(ascension).toContainText(/待吸收 [1-9][0-9]*/);
  await ascension.getByRole("button", { name: "百秒守护" }).click();
  await expect(ascension).toContainText("待吸收 0");
  await expect(ascension).toContainText(/灵力 [1-9][0-9]*/);
  await ascension.getByRole("button", { name: "主动退出" }).click();
  await ascension.getByRole("button", { name: "结算灵力" }).click();
  await expect(ascension).toContainText("升灵台 · 已结算");
});

test("斗三中级升灵台必须凭完整斗铠年度福利卡进入", async ({ page }) => {
  await seedIntermediateAscensionGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "中级升灵台验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: "时代", exact: true }).click();
  const ascension = page.locator(".special-system-card").filter({ hasText: "升灵台" });
  await ascension.getByRole("button", { name: "登记斗铠师" }).click();
  await expect(ascension).toContainText("斗铠师登记 · 1字 · 已领福利年份 1");
  await ascension.getByRole("button", { name: "申请中级" }).click();
  await expect(ascension).toContainText("常规 · 中级");
  await ascension.getByRole("button", { name: "进入升灵台" }).click();
  await ascension.getByRole("button", { name: "搜寻魂兽" }).click();
  await expect(ascension).toContainText("虚拟击败 1");
  await expect(ascension).toContainText(/灵力 [1-9][0-9]*/);
  await ascension.getByRole("button", { name: "主动退出" }).click();
  await ascension.getByRole("button", { name: "结算灵力" }).click();
  await expect(ascension).toContainText("升灵台 · 已结算");
});

test("斗三高级升灵台必须用任务点授权、明确接受风险且不能越权进入真实核心层", async ({ page }) => {
  await seedAdvancedAscensionGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "高级升灵台验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await submitAction(page, "申请高级升灵台真实核心层授权并接受真实死亡风险");
  await page.getByRole("button", { name: "时代", exact: true }).click();
  const ascension = page.locator(".special-system-card").filter({ hasText: "升灵台" });
  await expect(ascension).toContainText("任务点 20");
  await ascension.getByRole("button", { name: "申请高级授权" }).click();
  await expect(ascension).toContainText("任务点 0");
  await expect(ascension.getByRole("button", { name: "申请高级" })).toBeVisible();
  await ascension.getByRole("button", { name: "申请高级" }).click();
  await expect(ascension).toContainText("常规 · 高级 · 高拟真保护");
  await ascension.getByRole("button", { name: "进入升灵台" }).click();
  await ascension.getByRole("button", { name: "搜寻魂兽" }).click();
  await expect(ascension).toContainText("虚拟击败 1");
  await expect(ascension).toContainText(/脑波冲击 (1[4-9]|2[0-4])%/);
  await ascension.getByRole("button", { name: "主动退出" }).click();
  await ascension.getByRole("button", { name: "结算灵力" }).click();
  await expect(ascension).toContainText("升灵台 · 已结算");
});

test("斗三机甲设计第二职业必须实训、认证、备料后才能完成付费委托", async ({ page }) => {
  await seedMechaCareerGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "机甲职业验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: "时代", exact: true }).click();
  const career = page.locator(".special-system-card").filter({ hasText: "第二职业 · 机甲设计" });
  await career.getByRole("button", { name: "承接委托" }).click();
  await expect(career).toContainText("已验收委托 0");
  for (let session = 0; session < 3; session += 1) await career.getByRole("button", { name: "设计实训" }).click();
  await expect(career).toContainText("实训 3 · 作品 3");
  await career.getByRole("button", { name: "职业认证" }).click();
  await expect(career).toContainText("机甲设计师·1级");
  await career.getByRole("button", { name: "承接委托" }).click();
  await expect(career).toContainText("已验收委托 0");
  await career.getByRole("button", { name: "购买图纸" }).click();
  await career.getByRole("button", { name: "承接委托" }).click();
  await expect(career).toContainText("已验收委托 1");
  await page.getByRole("button", { name: "人物", exact: true }).click();
  const profession = page.locator(".profession-list article").filter({ hasText: "机甲设计" });
  await expect(profession).toContainText("机甲设计师·1级");
  await expect(profession).toContainText("作品 4 · 委托 1");
});

test("斗四星舰必须按岗位招募船员后才能协同并登记真实航时", async ({ page }) => {
  await seedStarshipCrewGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "舰桥验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: "时代", exact: true }).click();
  const starship = page.locator(".special-system-card").filter({ hasText: "星舰资格" });
  await starship.getByRole("button", { name: "船员协同" }).click();
  await expect(starship).toContainText("船员 0 · 舰桥协同 0%");
  await starship.getByRole("button", { name: "招募驾驶员" }).click();
  await submitAction(page, "检查可信关系并招募导航员船员");
  await submitAction(page, "检查可信关系并招募轮机师船员");
  await expect(starship).toContainText("船员 3");
  await starship.getByRole("button", { name: "船员协同" }).click();
  await expect(starship).toContainText(/舰桥协同 [1-9][0-9]?%/);
  await starship.getByRole("button", { name: "随舰航次" }).click();
  await expect(starship).toContainText(/真实飞行 [1-9][0-9]? 小时/);
  await expect(page.getByText(/舰桥协同 · [1-9][0-9]?%/, { exact: true })).toBeVisible();
});

test("斗四现役人员必须述职并完成一个月多模块培训后才能分岗", async ({ page }) => {
  await seedFleetOnboardingGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "入舰验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: "时代", exact: true }).click();
  const starship = page.locator(".special-system-card").filter({ hasText: "星舰资格" });
  await starship.getByRole("button", { name: "航线培训" }).click();
  await expect(starship).not.toContainText("入舰档案");
  await starship.getByRole("button", { name: "参谋部述职" }).click();
  await expect(starship).toContainText("入舰档案 · 培训中 · 培训 0/30 天");
  for (const button of ["航线培训", "损管培训", "作战培训", "军纪培训", "航线培训"]) await starship.getByRole("button", { name: button, exact: true }).click();
  await expect(starship).toContainText("入舰档案 · 待分配 · 培训 35/30 天");
  await expect(starship).toContainText("真实飞行 0 小时");
  await starship.getByRole("button", { name: "参谋部分岗" }).click();
  await expect(starship).toContainText("入舰档案 · 已分配 · 培训 35/30 天 · 舰队参谋部 · 航线与情报见习参谋");
});

test("旧世机构在浏览器中必须经过主张、听证和付费新设主体", async ({ page }) => {
  await seedInheritanceRightsGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "权益验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await page.getByRole("button", { name: /^世界/ }).click();
  const chronology = page.locator(".chronology-panel");
  await expect(chronology).toContainText("时代间可审查年表");
  await expect(chronology).toContainText("系统推演假说");
  await chronology.getByRole("button", { name: "核验节点" }).nth(1).click();
  await expect(chronology.locator("article").nth(1)).toContainText("部分核验 · 可信 50%");
  const institution = page.locator(".world-panel .lineage-list article").filter({ hasText: "青册门" });
  await expect(institution).toContainText("主张：未主张");
  await institution.getByRole("button", { name: "提交主张" }).click();
  await expect(institution).toContainText("主张：待审理");
  await expect(page.locator(".prose-entry").last()).toContainText("待审理");
  await institution.getByRole("button", { name: "参加听证" }).click();
  await expect(institution).toContainText("主张：有限承认");
  await expect(institution).toContainText("旧档案查阅、复制与名称沿革说明权");
  await expect(page.locator(".prose-entry").last()).toContainText("有限承认");
  await institution.getByRole("button", { name: "投资新主体" }).click();
  await expect(page.locator(".prose-entry").last()).toContainText("投入3 银魂币成立青册门沿革新社");
  await page.getByRole("button", { name: "人物", exact: true }).click();
  await expect(page.locator(".panel-copy").filter({ hasText: "青册门沿革新社" })).toContainText("当代经营主体");
  await expect(page.getByText("6 银魂币", { exact: true }).first()).toBeVisible();
});

test("有效结算可以在同一存档开启下一时代并核验累积谱系", async ({ page }) => {
  test.setTimeout(90_000);
  await createPlayingCharacter(page, 1);
  for (let day = 1; day <= 8; day += 1) await submitAction(page, `在住处训练并记录第${day}天的变化`);
  await page.getByRole("button", { name: "申请结算" }).click();
  await page.getByRole("button", { name: "交给程序判定" }).click();
  await expect(page.getByRole("button", { name: "在同一存档开启斗2继承人" })).toBeVisible();
  await page.getByRole("button", { name: "在同一存档开启斗2继承人" }).click();
  await expect(page.getByRole("heading", { name: "选择角色" })).toBeVisible();
  await expect(page.getByText("旧世回声", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".candidate-meta").first()).toContainText("霍雨浩");
  await page.locator(".select-button").first().click();
  await expect(page.getByRole("heading", { name: "性格底色" })).toBeVisible();
  for (const question of await page.locator(".question-card").all()) await question.locator("label").first().click();
  await page.getByRole("button", { name: "确认性格，进入觉醒" }).click();
  await expect(page.getByRole("button", { name: "觉醒武魂" })).toBeVisible();
  await page.getByRole("button", { name: "觉醒武魂" }).click();
  await expect(page.getByRole("heading", { name: "看清武魂后，再定此生所求" })).toBeVisible();
  await page.getByRole("button", { name: "确定目标与觉醒处置，开始故事" }).click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: /^世界/ }).click();
  await expect(page.getByText("连续世代谱系", { exact: true })).toBeVisible();
  const lineage = page.locator(".world-panel .lineage-list").first();
  await expect(lineage).toContainText("第 1 代");
  await lineage.getByRole("button", { name: "核验" }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText("旧世档案");
  await expect(lineage).toContainText("部分核验");
});
