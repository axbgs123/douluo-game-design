import { describe, expect, it } from "vitest";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, SOUL_BEASTS } from "../data/world.js";
import { applyActionResult, classifyCoreActionRoute, resolveAction } from "./actions.js";
import { settleRun } from "./endings.js";
import { awakenCharacter, createEraSuccessor, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
import { advanceWorldTime, buildMapView, canDiscoverNpc, createHiddenWorld, ensureGameState, recordCanonInfluence, recordIntelligence, recordMediaCompetition, recordMediaOutletReputation, revealNpc } from "./world.js";
import { applyNarrativeMemory, observableCausalFootprintsForNarration, violatesCanonChronology } from "../services/deepseek.js";
import { rulebookStats } from "../data/fanfiction-rules.js";
import { auditNarrative, selectNarrativeRules } from "./story-rules.js";
import type { MetaProgressionView } from "../../shared/game.js";
import { academyEraLifeProfile } from "../../shared/academy-life.js";

const personality = {
  keywords: ["谨慎", "好奇", "重情"],
  answers: { danger: "observe", promise: "keep", authority: "question" },
};

function awakened(seed = "gameplay") {
  return awakenedInEra(1, seed);
}

function awakenedInEra(era: 1 | 2 | 3 | 4, seed: string) {
  const game = createGame({ era, gender: "男", difficulty: "标准", personality, seed });
  selectCandidate(game, game.view.candidates[0].id);
  finalizeCharacterShaping(game, { keywords: personality.keywords, answers: personality.answers });
  awakenCharacter(game);
  selectLifeGoal(game, "在十八岁前成为魂王，并拥有一套自创魂技体系");
  return game;
}

describe("完整游玩规则", () => {
  it("高频自由行动直接返回原生第三人称兜底正文", () => {
    const actions = ["冥想修炼", "休息恢复", "调查附近环境", "打工赚钱", "等待一天", "整理下一步计划", "攻击没有说明的目标"];
    for (const [index, action] of actions.entries()) {
      const game = awakened(`native-third-person-${index}`);
      const result = resolveAction(game, action);
      expect(auditNarrative(game, result.fallbackNarrative)).not.toContain("正文出现第一人称叙述");
    }
    const conversation = awakened("native-third-person-conversation");
    const target = conversation.view.relations[0].name;
    const result = resolveAction(conversation, `询问${target}附近消息`);
    expect(auditNarrative(conversation, result.fallbackNarrative)).not.toContain("正文出现第一人称叙述");
  });

  it("隐藏第二武魂的私下测试必须真正发生且不会召来NPC", () => {
    const game = awakened("private-hidden-soul-test");
    const first = game.view.character!.martialSouls[0];
    game.view.character!.martialSouls = [first, { ...first, name: "太玄剑胎", category: "器武魂", cultivationState: "未修炼" }];
    game.view.character!.publiclyKnownMartialSoulIndices = [0];
    const result = resolveAction(game, "暂不显露第二武魂，回住处后单独测试");
    expect(result).toMatchObject({ intent: "私下测试隐藏武魂", routing: { selected: "private-hidden-soul-test" } });
    expect(game.view.character!.martialSouls[1]).toMatchObject({ name: "太玄剑胎", privateTested: true });
    expect(game.view.character!.publiclyKnownMartialSoulIndices).toEqual([0]);
    expect(result.ruleSummary).toContain("没有NPC在场");
    expect(result.fallbackNarrative).toContain("太玄剑胎");
    expect(result.fallbackNarrative).not.toMatch(/敲门|长老|议事堂|培养会议|养剑木匣/);
  });
  it("四时代学院生活不会再共用斗一首月结业模板", () => {
    const eraOne = academyEraLifeProfile(1);
    expect(`${eraOne.teacherRole}${eraOne.arrangementName}${eraOne.assessmentName}${eraOne.completionName}`).not.toMatch(/班主任|课表|学籍|首月|结业/);
    expect(eraOne.assessmentName).toBe("基础课程与实战检查");
    expect(academyEraLifeProfile(2)).toMatchObject({ teacherRole: "班主任", periodLabel: "新生阶段", assessmentName: "新生考核" });
    expect(academyEraLifeProfile(3)).toMatchObject({ periodLabel: "入学阶段", assessmentName: "班级阶段实战" });
    expect(academyEraLifeProfile(4)).toMatchObject({ teacherRole: "正班主任", arrangementName: "课程表与班级安排", assessmentName: "班级实战考核" });
  });
  it("普通调查和传闻不会提前确认隐藏人物的真实身份", () => {
    const game = awakened("hidden-identity");
    const diTian = game.world.npcs["di-tian"];
    diTian.locationId = game.view.locationId!;
    for (let index = 0; index < 12; index += 1) resolveAction(game, "调查当前位置的人物登记");
    expect(diTian.knownToPlayer).toBe(false);

    resolveAction(game, "打听千仞雪的消息");
    expect(game.world.npcs["qian-renxue"].knownToPlayer).toBe(false);
    expect(game.world.intelligenceRecords.some((record) => record.subjectId === "qian-renxue")).toBe(false);
  });

  it("不能用拜师或攻击指令绕过隐藏人物认知门禁", () => {
    const game = awakened("hidden-action-guard");
    game.world.npcs["di-tian"].locationId = game.view.locationId!;
    expect(resolveAction(game, "拜帝天为师").intent).toBe("规则阻止");
    expect(resolveAction(game, "刺杀帝天").intent).toBe("规则阻止");
    expect(game.world.npcs["di-tian"].memoryOfPlayer).toHaveLength(0);
    expect(game.world.npcs["di-tian"].knownToPlayer).toBe(false);
  });

  it("不能用后期姓名把当前人物提前路由进拜师或攻击行动", () => {
    const game = awakenedInEra(3, "future-name-action-guard");
    game.view.worldTime = { era: "东海学院零班阶段", year: 20003, day: 1, time: "08:00", season: "春" };
    game.world = createHiddenWorld(20003, "east-sea-city");
    expect(game.world.npcs["gu-yue-na"].name).toBe("古月");
    expect(resolveAction(game, "拜古月娜为师").intent).toBe("无法完成");
    expect(resolveAction(game, "刺杀古月娜").intent).toBe("无法完成");
    expect(game.world.npcs["gu-yue-na"].memoryOfPlayer).toHaveLength(0);
  });

  it("隐藏人物只有在可靠证据形成后才可写入人物档案", () => {
    const game = awakened("hidden-evidence");
    expect(game.world.npcs["qian-renxue"].name).toBe("雪清河");
    expect(canDiscoverNpc(game, "qian-renxue")).toBe(true);
    expect(revealNpc(game, "qian-renxue")).toBe(true);
    expect(game.world.npcs["qian-renxue"].knownToPlayer).toBe(true);
    expect(game.view.knownFigures.find((item) => item.id === "qian-renxue")?.name).toBe("雪清河");
    recordIntelligence(game, { subjectType: "人物", subjectId: "qian-renxue", title: "千仞雪真实身份核验", detail: "两份独立密档与一次直接目击确认雪清河身份背后的千仞雪。", source: "直接目击与交叉核验", confidence: 88, status: "确定" });
    expect(game.world.npcs["qian-renxue"].name).toBe("千仞雪");
  });

  it("承诺必须有后续行动证据，不能用一句完成承诺直接结算", () => {
    const game = awakened("promise-evidence");
    const promise = resolveAction(game, "承诺调查村口失踪线索");
    applyActionResult(game, "承诺调查村口失踪线索", promise, promise.fallbackNarrative, promise.suggestions);
    expect(resolveAction(game, "完成承诺").intent).toBe("无法完成");

    const investigation = resolveAction(game, "调查村口失踪线索");
    applyActionResult(game, "调查村口失踪线索", investigation, investigation.fallbackNarrative, investigation.suggestions);
    const fulfilled = resolveAction(game, "完成承诺");
    expect(fulfilled.intent).toBe("履行承诺");
    const task = game.view.tasks.find((item) => item.title === "调查村口失踪线索");
    expect(task?.status).toBe("完成");
    expect(task?.progressEvidence?.[0]).toContain("调查村口失踪线索");
  });

  it("多项承诺需要明确指定目标", () => {
    const game = awakened("promise-choice");
    for (const text of ["承诺整理学院笔记", "承诺采购猎魂干粮"]) {
      const result = resolveAction(game, text);
      applyActionResult(game, text, result, result.fallbackNarrative, result.suggestions);
    }
    const study = resolveAction(game, "研究学院的基础课程");
    applyActionResult(game, "研究学院的基础课程", study, study.fallbackNarrative, study.suggestions);
    expect(resolveAction(game, "完成承诺").ruleSummary).toContain("明确说明");
  });

  it("猎魂战斗的观察回合积累洞察但不会凭空造成伤害", () => {
    const game = awakened("combat-observe");
    game.view.hunting = { stage: "战斗", ringIndex: 1, targetBeastId: "datura-snake", targetName: "曼陀罗蛇", targetYears: 120, locationId: game.view.locationId, recommendations: [], preparation: [], trailProgress: "已锁定目标" };
    game.view.combat = { id: "combat-observe", enemyName: "曼陀罗蛇", enemyPower: "120 年", round: 0, playerCondition: "良好", enemyCondition: "完好", distance: "中距离", escaped: false };
    game.world.flags.combatEnemyHp = 90;
    const result = resolveAction(game, "观察敌人的发力与弱点");
    expect(game.world.flags.combatEnemyHp).toBe(90);
    expect(game.view.combat?.insight).toBe(1);
    expect(result.ruleSummary).toContain("造成 0 点");
  });

  it("猎魂组队要求可信且同地的同行者", () => {
    const game = awakened("hunt-companion-trust");
    game.view.hunting = { stage: "准备", ringIndex: 1, targetBeastId: "datura-snake", targetName: "曼陀罗蛇", targetYears: 120, locationId: game.view.locationId, recommendations: [], preparation: [], trailProgress: "待准备" };
    game.view.relations = [{ id: "stranger", name: "陌生佣兵", relation: "陌生人", impression: "尚未建立信任", strength: 12, category: "其他" }];
    expect(resolveAction(game, "邀请陌生佣兵组队猎魂").intent).toBe("无法完成");
    expect(game.view.hunting.preparation).toEqual([]);
    game.view.relations.push({ id: "trusted-guide", name: "林岳", relation: "可靠同伴", impression: "共同训练过", strength: 65, category: "同伴" });
    expect(resolveAction(game, "邀请林岳作为同行者组队猎魂").intent).toBe("猎魂准备");
    expect(game.view.hunting.preparation.some((item) => item.includes("同行者：林岳") && item.includes("协同"))).toBe(true);
  });

  it("小队岗位必须有能力证据并在战斗中产生不同贡献", () => {
    const game = awakened("hunt-companion-roles");
    game.view.hunting = { stage: "准备", ringIndex: 2, targetBeastId: "datura-snake", targetName: "曼陀罗蛇", targetYears: 400, locationId: game.view.locationId, recommendations: [], preparation: [], trailProgress: "待准备" };
    game.view.relations = [
      { id: "guard", name: "石岳", relation: "可靠同伴", impression: "防御系盾武魂魂师", strength: 70, category: "同伴" },
      { id: "healer", name: "苏叶", relation: "可靠同伴", impression: "治疗系魂师，擅长治愈外伤", strength: 70, category: "同伴" },
    ];
    expect(resolveAction(game, "邀请石岳担任治疗岗位同行猎魂").intent).toBe("无法完成");
    expect(resolveAction(game, "邀请石岳担任防护岗位同行猎魂").ruleSummary).toContain("防护·协同");
    game.view.hunting.stage = "准备";
    expect(resolveAction(game, "邀请苏叶担任治疗岗位同行猎魂").ruleSummary).toContain("治疗·协同");

    game.view.hunting.stage = "战斗";
    game.view.combat = { id: "combat-roles", enemyName: "曼陀罗蛇", enemyPower: "400 年", round: 0, playerCondition: "轻伤", enemyCondition: "完好", distance: "中距离", escaped: false, allies: [{ name: "石岳", role: "防护", readiness: 56, condition: "完好" }, { name: "苏叶", role: "治疗", readiness: 56, condition: "完好" }] };
    game.world.healthPoints = 60;
    game.world.flags.combatEnemyHp = 1_000;
    const result = resolveAction(game, "让石岳掩护，苏叶治疗，全队协同攻击");
    expect(result.ruleSummary).toContain("苏叶治疗恢复");
    expect(result.ruleSummary).toContain("石岳（防护");
    expect(result.ruleSummary).toContain("苏叶（治疗");
  });

  it("多人连携需要互补岗位、信任与共同训练证据，并经过准备后才能发动", () => {
    const game = awakened("combat-combo-evidence");
    game.view.hunting = { stage: "战斗", ringIndex: 2, targetBeastId: "datura-snake", targetName: "曼陀罗蛇", targetYears: 500, locationId: game.view.locationId, recommendations: [], preparation: [], trailProgress: "已锁定目标" };
    game.view.relations = [
      { id: "guard", name: "石岳", relation: "可靠同伴", impression: "共同训练过防护站位", strength: 70, category: "同伴" },
      { id: "healer", name: "苏叶", relation: "普通同伴", impression: "治疗系魂师", strength: 40, category: "同伴" },
    ];
    game.view.combat = { id: "combat-combo", enemyName: "曼陀罗蛇", enemyPower: "500 年", round: 0, playerCondition: "轻伤", enemyCondition: "完好", distance: "中距离", escaped: false, allies: [{ name: "石岳", role: "防护", readiness: 60, condition: "完好" }, { name: "苏叶", role: "治疗", readiness: 60, condition: "完好" }] };
    game.world.healthPoints = 55;
    game.world.flags.combatEnemyHp = 1_000;

    expect(resolveAction(game, "发动生命防线连携").intent).toBe("无法完成");
    expect(game.view.combat.round).toBe(0);
    expect(resolveAction(game, "让石岳和苏叶准备生命防线连携").intent).toBe("无法完成");
    expect(game.view.combat.round).toBe(0);

    game.view.relations[1].strength = 70;
    game.view.relations[1].impression = "治疗系魂师，已共同训练生命防线";
    const prepared = resolveAction(game, "让石岳和苏叶准备生命防线连携");
    expect(prepared.ruleSummary).toContain("已准备连携“生命防线”");
    expect(game.view.combat.comboPreparation).toMatchObject({ name: "生命防线", allyNames: ["石岳", "苏叶"], preparedAtRound: 1 });
    expect(game.world.flags.combatEnemyHp).toBe(1_000);

    const executed = resolveAction(game, "发动生命防线连携");
    expect(executed.ruleSummary).toContain("发动连携“生命防线”");
    expect(game.view.combat.comboPreparation).toBeUndefined();
    expect(game.view.combat.comboCooldownUntilRound).toBe(5);
    expect(game.view.combat.comboHistory?.at(-1)).toContain("石岳与苏叶发动生命防线");
    expect(game.view.combat.allies?.map((ally) => ally.readiness)).toEqual([45, 45]);
    const roundAfterCombo = game.view.combat.round;
    expect(resolveAction(game, "让石岳和苏叶准备生命防线连携").intent).toBe("无法完成");
    expect(game.view.combat.round).toBe(roundAfterCombo);
  });

  it("固定搭档连携训练会跨战斗积累熟练度、失败复盘与战术分支", () => {
    const game = awakened("persistent-combo-training");
    game.view.relations.push(
      { id: "combo-guard", name: "石岳", relation: "防御系护卫", impression: "擅长盾牌守护", strength: 70, category: "同伴", dimensions: { closeness: 60, trust: 70, respect: 60, sharedInterest: 40, vigilance: 0, hostility: 0, favorDebt: 0, identityKnowledge: 80 }, history: [] },
      { id: "combo-healer", name: "苏叶", relation: "治疗系医师", impression: "擅长治愈与救护", strength: 70, category: "同伴", dimensions: { closeness: 60, trust: 70, respect: 60, sharedInterest: 40, vigilance: 0, hostility: 0, favorDebt: 0, identityKnowledge: 80 }, history: [] },
    );
    for (let index = 0; index < 4; index += 1) expect(resolveAction(game, "与石岳和苏叶共同训练生命防线连携").intent).toBe("连携训练");
    const training = game.view.comboTrainings[0];
    expect(training).toMatchObject({ name: "生命防线", companionNames: ["石岳", "苏叶"], sessions: 4, failures: 0, branch: "轮换救护" });
    expect(training.mastery).toBeGreaterThanOrEqual(35);
    expect(game.view.relations.filter((relation) => ["石岳", "苏叶"].includes(relation.name)).every((relation) => relation.history?.some((item) => item.reason.includes("共同训练生命防线")))).toBe(true);
    game.world.fatiguePoints = 80;
    const masteryBefore = training.mastery;
    expect(resolveAction(game, "与石岳和苏叶复盘生命防线连携").intent).toBe("连携训练复盘");
    expect(training).toMatchObject({ sessions: 5, failures: 1, mastery: masteryBefore });
    game.world.fatiguePoints = 0;
    game.view.hunting = { stage: "战斗", ringIndex: 1, recommendations: [], preparation: [], trailProgress: "测试" };
    game.view.combat = { id: "trained-combo", enemyName: "测试魂兽", enemyPower: "500年", round: 0, playerCondition: "良好", enemyCondition: "完好", distance: "中距离", escaped: false, allies: [{ name: "石岳", role: "防护", readiness: 70, condition: "完好" }, { name: "苏叶", role: "治疗", readiness: 70, condition: "完好" }] };
    game.world.flags.combatEnemyHp = 300;
    expect(resolveAction(game, "让石岳和苏叶准备生命防线连携").intent).toBe("战斗");
    expect(game.view.combat.comboPreparation).toMatchObject({ mastery: training.mastery, branch: "轮换救护" });
    expect(resolveAction(game, "发动生命防线连携").intent).toBe("战斗");
    expect(game.view.combat.comboCooldownUntilRound).toBe(4);
  });

  it("三人阵型要求固定三岗位共同训练，实战消耗与冷却独立于双人连携", () => {
    const game = awakened("three-person-formation");
    game.view.relations.push(
      { id: "formation-striker", name: "陆锋", relation: "强攻系战士", impression: "擅长正面攻击", strength: 70, category: "同伴", dimensions: { closeness: 60, trust: 70, respect: 60, sharedInterest: 40, vigilance: 0, hostility: 0, favorDebt: 0, identityKnowledge: 80 }, history: [] },
      { id: "formation-guard", name: "石岳", relation: "防御系护卫", impression: "擅长盾牌守护", strength: 70, category: "同伴", dimensions: { closeness: 60, trust: 70, respect: 60, sharedInterest: 40, vigilance: 0, hostility: 0, favorDebt: 0, identityKnowledge: 80 }, history: [] },
      { id: "formation-control", name: "宁索", relation: "控制系魂师", impression: "擅长束缚阵法", strength: 70, category: "同伴", dimensions: { closeness: 60, trust: 70, respect: 60, sharedInterest: 40, vigilance: 0, hostility: 0, favorDebt: 0, identityKnowledge: 80 }, history: [] },
    );
    game.view.hunting = { stage: "战斗", ringIndex: 1, recommendations: [], preparation: [], trailProgress: "测试" };
    game.view.combat = { id: "formation-before-training", enemyName: "测试魂兽", enemyPower: "800年", round: 0, playerCondition: "良好", enemyCondition: "完好", distance: "中距离", escaped: false, allies: [
      { name: "陆锋", role: "强攻", readiness: 80, condition: "完好" }, { name: "石岳", role: "防护", readiness: 80, condition: "完好" }, { name: "宁索", role: "控制", readiness: 80, condition: "完好" },
    ] };
    expect(resolveAction(game, "让陆锋石岳宁索准备攻守枢纽阵型").intent).toBe("无法完成");
    game.view.combat = undefined;
    game.view.hunting = undefined;
    for (let index = 0; index < 5; index += 1) expect(resolveAction(game, "与陆锋石岳宁索共同训练攻守枢纽阵型").intent).toBe("连携训练");
    const training = game.view.comboTrainings.find((item) => item.name === "攻守枢纽")!;
    expect(training).toMatchObject({ companionNames: ["宁索", "石岳", "陆锋"], sessions: 5, failures: 0, branch: "轮转锋线" });
    expect(training.mastery).toBeGreaterThanOrEqual(45);
    expect(game.view.relations.filter((relation) => ["陆锋", "石岳", "宁索"].includes(relation.name)).every((relation) => relation.history?.at(-1)?.reason.includes("、"))).toBe(true);
    game.view.hunting = { stage: "战斗", ringIndex: 1, recommendations: [], preparation: [], trailProgress: "测试" };
    game.view.combat = { id: "formation-after-training", enemyName: "测试魂兽", enemyPower: "800年", round: 0, playerCondition: "良好", enemyCondition: "完好", distance: "中距离", escaped: false, allies: [
      { name: "陆锋", role: "强攻", readiness: 80, condition: "完好" }, { name: "石岳", role: "防护", readiness: 80, condition: "完好" }, { name: "宁索", role: "控制", readiness: 80, condition: "完好" },
    ] };
    game.world.flags.combatEnemyHp = 300;
    expect(resolveAction(game, "让陆锋石岳宁索准备攻守枢纽阵型").intent).toBe("战斗");
    expect(game.view.combat.comboPreparation).toMatchObject({ name: "攻守枢纽", allyNames: ["陆锋", "石岳", "宁索"], mastery: training.mastery });
    expect(resolveAction(game, "发动攻守枢纽阵型").intent).toBe("战斗");
    expect(game.view.combat.allies?.map((ally) => ally.readiness)).toEqual([60, 60, 60]);
    expect(game.view.combat.comboCooldownUntilRound).toBe(5);
  });

  it("四人编队要求四个互补岗位和更高熟练度，并按全体成员结算储备与冷却", () => {
    const game = awakened("four-person-formation");
    game.view.relations.push(
      { id: "squad-striker", name: "陆锋", relation: "强攻系战士", impression: "可靠并擅长正面攻击", strength: 70, category: "同伴", dimensions: { closeness: 60, trust: 70, respect: 60, sharedInterest: 40, vigilance: 0, hostility: 0, favorDebt: 0, identityKnowledge: 80 }, history: [] },
      { id: "squad-guard", name: "石岳", relation: "防御系护卫", impression: "可靠并擅长盾牌守护", strength: 70, category: "同伴", dimensions: { closeness: 60, trust: 70, respect: 60, sharedInterest: 40, vigilance: 0, hostility: 0, favorDebt: 0, identityKnowledge: 80 }, history: [] },
      { id: "squad-control", name: "宁索", relation: "控制系魂师", impression: "可靠并擅长束缚阵法", strength: 70, category: "同伴", dimensions: { closeness: 60, trust: 70, respect: 60, sharedInterest: 40, vigilance: 0, hostility: 0, favorDebt: 0, identityKnowledge: 80 }, history: [] },
      { id: "squad-healer", name: "苏叶", relation: "治疗系医师", impression: "可靠并擅长治愈救护", strength: 70, category: "同伴", dimensions: { closeness: 60, trust: 70, respect: 60, sharedInterest: 40, vigilance: 0, hostility: 0, favorDebt: 0, identityKnowledge: 80 }, history: [] },
    );
    const enterCombat = (id: string) => {
      game.view.hunting = { stage: "战斗", ringIndex: 1, recommendations: [], preparation: [], trailProgress: "测试" };
      game.view.combat = { id, enemyName: "测试魂兽", enemyPower: "千年", round: 0, playerCondition: "良好", enemyCondition: "完好", distance: "中距离", escaped: false, allies: [
        { name: "陆锋", role: "强攻", readiness: 80, condition: "完好" }, { name: "石岳", role: "防护", readiness: 80, condition: "完好" }, { name: "宁索", role: "控制", readiness: 80, condition: "完好" }, { name: "苏叶", role: "治疗", readiness: 80, condition: "完好" },
      ] };
      game.world.flags.combatEnemyHp = 600;
    };
    enterCombat("squad-before-training");
    expect(resolveAction(game, "让陆锋石岳宁索苏叶准备四象战阵").intent).toBe("无法完成");
    game.view.combat = undefined;
    game.view.hunting = undefined;
    for (let index = 0; index < 6; index += 1) {
      game.world.fatiguePoints = 0;
      expect(resolveAction(game, "与陆锋石岳宁索苏叶共同训练四象战阵").intent).toBe("连携训练");
    }
    const training = game.view.comboTrainings.find((item) => item.name === "四象战阵")!;
    expect(training).toMatchObject({ companionNames: ["宁索", "石岳", "苏叶", "陆锋"], sessions: 6, failures: 0, branch: "四角轮换" });
    expect(training.mastery).toBeGreaterThanOrEqual(60);
    enterCombat("squad-after-training");
    expect(resolveAction(game, "让陆锋石岳宁索苏叶准备四象战阵").intent).toBe("战斗");
    expect(game.view.combat!.comboPreparation).toMatchObject({ name: "四象战阵", allyNames: ["陆锋", "石岳", "宁索", "苏叶"], branch: "四角轮换" });
    expect(resolveAction(game, "发动已准备的多人连携").intent).toBe("战斗");
    expect(game.view.combat!.allies?.map((ally) => ally.readiness)).toEqual([55, 55, 55, 55]);
    expect(game.view.combat!.comboCooldownUntilRound).toBe(6);
  });

  it("五至七人固定战阵要求精确岗位人数、共同训练和全员协同储备", () => {
    const game = awakened("full-squad-formations");
    game.view.relations.push(
      { id: "full-striker-a", name: "陆锋", relation: "强攻系战士", impression: "可靠并擅长正面攻击", strength: 80, category: "同伴" },
      { id: "full-striker-b", name: "赵烈", relation: "强攻系战士", impression: "可靠并擅长侧翼攻击", strength: 80, category: "同伴" },
      { id: "full-guard-a", name: "石岳", relation: "防御系护卫", impression: "可靠并擅长盾牌守护", strength: 80, category: "同伴" },
      { id: "full-guard-b", name: "韩垒", relation: "防御系护卫", impression: "可靠并擅长阵地守护", strength: 80, category: "同伴" },
      { id: "full-control", name: "宁索", relation: "控制系魂师", impression: "可靠并擅长束缚阵法", strength: 80, category: "同伴" },
      { id: "full-healer", name: "苏叶", relation: "治疗系医师", impression: "可靠并擅长治愈救护", strength: 80, category: "同伴" },
      { id: "full-scout", name: "凌风", relation: "敏攻侦察系魂师", impression: "可靠并擅长侦察追踪", strength: 80, category: "同伴" },
    );
    const train = (action: string, sessions: number) => {
      for (let index = 0; index < sessions; index += 1) {
        game.world.fatiguePoints = 0;
        expect(resolveAction(game, action).intent).toBe("连携训练");
      }
    };
    const enterCombat = (id: string, names: string[]) => {
      game.view.hunting = { stage: "战斗", ringIndex: 1, recommendations: [], preparation: [], trailProgress: "完整编队测试" };
      game.view.combat = { id, enemyName: "高阶测试魂兽", enemyPower: "万年", round: 0, playerCondition: "良好", enemyCondition: "完好", distance: "中距离", escaped: false, allies: names.map((name) => ({ name, role: name === "陆锋" || name === "赵烈" ? "强攻" as const : name === "石岳" || name === "韩垒" ? "防护" as const : name === "宁索" ? "控制" as const : name === "苏叶" ? "治疗" as const : "侦察" as const, readiness: 100, condition: "完好" as const })) };
      game.world.flags.combatEnemyHp = 2_000;
    };

    const fiveNames = ["陆锋", "石岳", "宁索", "苏叶", "凌风"];
    train("与陆锋石岳宁索苏叶凌风共同训练五环协战阵", 4);
    enterCombat("five-person-trained", fiveNames);
    expect(resolveAction(game, "让陆锋石岳宁索苏叶凌风准备五环协战阵").intent).toBe("战斗");
    expect(game.view.combat!.comboPreparation).toMatchObject({ name: "五环协战阵", allyNames: fiveNames });
    expect(resolveAction(game, "发动五环协战阵").intent).toBe("战斗");
    expect(game.view.combat!.allies?.map((ally) => ally.readiness)).toEqual([70, 70, 70, 70, 70]);
    expect(game.view.combat!.comboCooldownUntilRound).toBe(8);

    game.view.combat = undefined;
    game.view.hunting = undefined;
    train("与陆锋赵烈石岳韩垒宁索苏叶凌风共同训练七星全域战阵", 6);
    const sevenNames = ["陆锋", "赵烈", "石岳", "韩垒", "宁索", "苏叶", "凌风"];
    enterCombat("seven-person-trained", sevenNames);
    expect(resolveAction(game, "让七名互补岗位同伴准备七星全域战阵").intent).toBe("战斗");
    expect(game.view.combat!.comboPreparation).toMatchObject({ name: "七星全域战阵", allyNames: sevenNames });
    expect(resolveAction(game, "发动七星全域战阵").intent).toBe("战斗");
    expect(game.view.combat!.allies?.map((ally) => ally.readiness)).toEqual([60, 60, 60, 60, 60, 60, 60]);
    expect(game.view.combat!.comboCooldownUntilRound).toBe(10);
  });

  it("斗四现役人员必须先参谋部述职并完成一个月多模块培训，岗位按能力证据分配", () => {
    const prepare = (seed: string) => {
      const game = awakened(seed);
      game.view.era = 4;
      game.view.character!.age = 18;
      game.view.character!.abilityDescriptors.perception = "优秀";
      game.view.affiliations = [{
        id: "d4-federal-fleet",
        name: "斗罗联邦舰队",
        role: "现役士兵",
        reputation: "生疏",
        joinedAt: "测试",
        contribution: 0,
        completedAssignments: 0,
        rankEvidence: [],
        militaryRank: "列兵",
        militaryMerit: 0,
        flightHours: 0,
      }];
      game.view.starship = { license: "三级指挥", simulatorProgress: 60, simulatorSessions: 6, loggedFlightHours: 0, crew: [], missionsCompleted: 0 };
      return game;
    };
    const trainMonth = (game: ReturnType<typeof prepare>) => {
      expect(resolveAction(game, "向舰队参谋部述职").intent).toBe("舰队参谋部述职");
      for (const action of ["参加航线与指挥舰队培训", "参加损管动力舰队培训", "参加作战登陆舰队培训", "参加军纪保密舰队培训", "继续航线舰队培训"]) {
        expect(resolveAction(game, action).intent).toBe("舰队入舰培训");
      }
      expect(game.view.starship!.fleetOnboarding).toMatchObject({ status: "待分配", trainingDays: 35 });
      expect(new Set(game.view.starship!.fleetOnboarding!.trainingEvidence.map((item) => item.module)).size).toBe(4);
      expect(game.view.starship!.loggedFlightHours).toBe(0);
    };

    const operations = prepare("fleet-operations-onboarding");
    expect(resolveAction(operations, "申请作战部岗位分配").intent).toBe("无法完成");
    trainMonth(operations);
    expect(resolveAction(operations, "申请作战部岗位评估").intent).toBe("无法完成");
    operations.world.metrics.battlesWon = 1;
    expect(resolveAction(operations, "申请作战部岗位评估").intent).toBe("舰队岗位分配");
    expect(operations.view.starship!.fleetOnboarding).toMatchObject({ status: "已分配", assignedDepartment: "龙王级护卫舰作战部", assignedPost: "登陆作战见习队员" });

    const staff = prepare("fleet-staff-onboarding");
    trainMonth(staff);
    expect(resolveAction(staff, "申请参谋部岗位评估").intent).toBe("舰队岗位分配");
    expect(staff.view.starship!.fleetOnboarding).toMatchObject({ status: "已分配", assignedDepartment: "舰队参谋部", assignedPost: "航线与情报见习参谋" });
  });

  it("控制魂技有可累积抗性且战斗会保存同行者状态", () => {
    const game = awakened("combat-control-resistance");
    game.view.character!.soulRank = 30;
    game.view.hunting = { stage: "战斗", ringIndex: 4, targetBeastId: "datura-snake", targetName: "曼陀罗蛇", targetYears: 800, locationId: game.view.locationId, recommendations: [], preparation: ["同行者：林岳（协同60）"], trailProgress: "已锁定目标" };
    game.view.combat = { id: "combat-control", enemyName: "曼陀罗蛇", enemyPower: "800 年", round: 0, playerCondition: "良好", enemyCondition: "完好", distance: "中距离", escaped: false, allies: [{ name: "林岳", readiness: 60, condition: "完好" }], controlResistance: 38 };
    game.world.flags.combatEnemyHp = 1_000;
    expect(resolveAction(game, "使用控制魂技束缚目标").ruleSummary).toContain("缺少可验证的控制魂技");
    game.view.character!.soulRings.push({ index: 1, beastId: "datura-snake", beastName: "曼陀罗蛇", years: 120, color: "黄", skillName: "蓝银缠绕", skillDescription: "用藤蔓束缚并控制目标" });
    const beforeResistance = game.view.combat!.controlResistance!;
    const controlled = resolveAction(game, "让林岳掩护并使用蓝银缠绕控制目标");
    expect(game.view.combat?.controlResistance).toBeGreaterThan(beforeResistance);
    expect(game.view.combat?.controlStatus).toMatch(/控制生效|抵抗成功/);
    expect(controlled.ruleSummary).toContain("同行者：林岳");
  });

  it("战斗触发合规复生后会脱离战斗而不是保留已结束状态", () => {
    const game = awakened("combat-revival");
    const character = game.view.character!;
    character.soulRank = 70;
    character.martialSoul.name = "不死凤凰";
    character.martialSouls[0].name = "不死凤凰";
    character.soulRings = Array.from({ length: 7 }, (_, index) => ({ index: index + 1, beastId: "datura-snake", beastName: "测试魂兽", years: 100, color: "黄", skillName: `测试魂技${index + 1}`, skillDescription: "用于验证复生结算" }));
    character.soulRingSets = [character.soulRings];
    game.world.healthPoints = 1;
    game.view.hunting = { stage: "战斗", ringIndex: 8, targetBeastId: "titan-giant-ape", targetName: "泰坦巨猿", targetYears: 100000, locationId: game.view.locationId, recommendations: [], preparation: [], trailProgress: "已锁定目标" };
    game.view.combat = { id: "combat-revival", enemyName: "泰坦巨猿", enemyPower: "十万年", round: 0, playerCondition: "良好", enemyCondition: "完好", distance: "近距离", escaped: false };
    game.world.flags.combatEnemyHp = 10000;
    resolveAction(game, "防御并格挡");
    expect(game.world.resurrectionCount).toBe(1);
    expect(game.view.status).toBe("playing");
    expect(game.view.combat).toBeUndefined();
    expect(game.view.hunting.stage).toBe("追踪");
    expect(character.soulRings).toHaveLength(6);
  });

  it("双生武魂可以切换主修并独立保存魂环槽", () => {
    const game = awakened("twin-soul-ledger");
    const character = game.view.character!;
    const main = character.martialSouls[0];
    const secondary = { ...main, name: "副生测试锤", cultivationState: "未修炼" as const };
    const mainRings = Array.from({ length: 2 }, (_, index) => ({ index: index + 1, beastId: "datura-snake", beastName: "曼陀罗蛇", years: 100, color: "黄", skillName: `主武魂魂技${index + 1}`, skillDescription: "主武魂独立魂技" }));
    character.soulRank = 21;
    character.martialSouls = [main, secondary];
    character.activeMartialSoulIndex = 0;
    character.soulRingSets = [mainRings, []];
    character.soulRings = mainRings;

    const switched = resolveAction(game, "切换主修武魂为副生测试锤");
    expect(switched.intent).toBe("切换武魂");
    expect(character.martialSoul.name).toBe("副生测试锤");
    expect(character.soulRings).toHaveLength(0);
    expect(resolveAction(game, "开始调查适合当前武魂的魂兽").intent).toBe("比较猎魂责任路线");
    expect(resolveAction(game, "选择家庭筹备第一魂环").intent).toBe("确认猎魂责任路线");
    expect(resolveAction(game, "开始调查适合当前武魂的魂兽").intent).toBe("猎魂调查");

    game.view.hunting = undefined;
    resolveAction(game, `切换主修武魂为${main.name}`);
    expect(character.soulRings).toHaveLength(2);
    expect(character.soulRings[0].skillName).toBe("主武魂魂技1");
  });

  it("修炼会推进时间、疲劳和内部成长", () => {
    const game = awakened("training");
    game.view.character!.soulRank = 3;
    game.view.character!.soulRings = [];
    const beforeTime = game.view.worldTime?.time;
    const beforeFatigue = game.world.fatiguePoints;
    const result = resolveAction(game, "安静冥想修炼");
    expect(result.intent).toBe("修炼");
    expect(game.world.trainingPoints).toBeGreaterThan(0);
    expect(game.world.fatiguePoints).toBeGreaterThan(beforeFatigue);
    expect(game.view.worldTime?.time).not.toBe(beforeTime);
  });

  it("加点金手指必须先靠真实训练积累潜能再分配", () => {
    const meta = { weightPreferences: { origin: "均衡", martialSoul: "均衡", gift: "加点面板" }, purchasedUpgrades: {}, martialSoulCodex: [] } as unknown as MetaProgressionView;
    const game = createGame({ gender: "男", difficulty: "标准", personality, seed: "effort-points-system" }, meta);
    selectCandidate(game, game.view.candidates[0].id);
    const draft = game.view.shaping!.personalityOptions[0];
    finalizeCharacterShaping(game, { personalityId: draft.id, keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])) });
    awakenCharacter(game);
    expect(resolveAction(game, "给体魄加点").intent).toBe("无法完成");
    expect(resolveAction(game, "安静冥想修炼").systemMessages).toContain("加点面板 · 潜能 +1");
    expect(resolveAction(game, "给体魄加点").intent).toBe("潜能加点");
    expect(game.view.character!.specialSystem!.abilities).toContain("体魄强化 1");
  });

  it("签到系统按自然日限领且人生模拟不会复制奖励", () => {
    const setup = (gift: string, seed: string) => {
      const meta = { weightPreferences: { origin: "均衡", martialSoul: "均衡", gift }, purchasedUpgrades: {}, martialSoulCodex: [] } as unknown as MetaProgressionView;
      const game = createGame({ gender: "女", difficulty: "标准", personality, seed }, meta);
      selectCandidate(game, game.view.candidates[0].id);
      const draft = game.view.shaping!.personalityOptions[0];
      finalizeCharacterShaping(game, { personalityId: draft.id, keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])) });
      awakenCharacter(game);
      return game;
    };
    const signIn = setup("签到系统", "daily-sign-system");
    expect(resolveAction(signIn, "在当前地点签到").intent).toBe("系统签到");
    expect(resolveAction(signIn, "在当前地点签到").intent).toBe("无法完成");

    const simulator = setup("人生模拟器", "fate-simulator-system");
    const inventory = [...simulator.view.inventory];
    expect(resolveAction(simulator, "人生模拟下一次重要选择").intent).toBe("命运片段模拟");
    expect(simulator.view.inventory).toEqual(inventory);
    expect(resolveAction(simulator, "人生模拟下一次重要选择").intent).toBe("无法完成");
  });

  it("新增金手指会按各自前置条件、代价和反馈执行", () => {
    const meta = { weightPreferences: { origin: "均衡", martialSoul: "均衡", gift: "百炼熟练度" }, purchasedUpgrades: {}, martialSoulCodex: [] } as unknown as MetaProgressionView;
    const game = createGame({ gender: "男", difficulty: "标准", personality, seed: "mastery-gold-finger" }, meta);
    selectCandidate(game, game.view.candidates[0].id);
    const draft = game.view.shaping!.personalityOptions[0];
    finalizeCharacterShaping(game, { personalityId: draft.id, keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])) });
    awakenCharacter(game);
    expect(game.view.character!.specialSystem!.name).toBe("百炼熟练度");
    expect(resolveAction(game, "查看熟练度").intent).toBe("无法完成");
    const training = resolveAction(game, "安静冥想修炼");
    applyActionResult(game, "安静冥想修炼", training, training.fallbackNarrative, training.suggestions);
    const result = resolveAction(game, "查看熟练度");
    expect(result.intent).toBe("金手指·百炼熟练度");
    expect(result.ruleSummary).toContain("潜能点 +1");
  });

  it("行动提交后保留可重载的规则判定收据", () => {
    const game = awakened("action-receipt");
    const result = resolveAction(game, "安静冥想修炼");
    applyActionResult(game, "安静冥想修炼", result, result.fallbackNarrative, result.suggestions);
    expect(game.view.lastActionReceipt).toMatchObject({
      action: "安静冥想修炼",
      intent: "修炼",
      elapsedMinutes: result.minutes,
      actionIndex: 1,
    });
    expect(game.view.lastActionReceipt?.appliedRuleIds.length).toBeGreaterThan(0);
  });

  it("长程修炼可以一次推演到下个魂环瓶颈", () => {
    const game = awakened("long-training");
    game.view.character!.soulRank = 3;
    game.world.trainingPoints = 0;
    resolveAction(game, "闭关修炼到下个瓶颈");
    expect(game.view.character!.soulRank).toBe(10);
    expect(game.view.hunting?.stage).toBe("需求");
  });

  it("可从十级瓶颈进入调查、选目标和准备阶段", () => {
    const game = awakened("hunting");
    game.view.locationId = "notting-city";
    game.view.location = "诺丁城";
    game.view.character!.soulRank = 10;
    expect(resolveAction(game, "开始调查魂兽").intent).toBe("比较猎魂责任路线");
    expect(resolveAction(game, "选择家庭筹备第一魂环").intent).toBe("确认猎魂责任路线");
    resolveAction(game, "开始调查魂兽");
    expect(game.view.hunting?.stage).toBe("调查");
    expect(game.view.hunting?.recommendations).toHaveLength(3);
    for (const recommendation of game.view.hunting!.recommendations) expect(SOUL_BEASTS.find((beast) => beast.name === recommendation.name)?.habitats).toContain("soul-hunting-forest");
    const target = game.view.hunting!.recommendations[0].name;
    resolveAction(game, `选择${target}作为魂环目标`);
    expect(game.view.hunting?.stage).toBe("准备");
    game.view.relations.push({ id: "academy-mentor", name: "林岳", relation: "学院导师", impression: "登记魂师并愿意承担猎魂护送责任", strength: 65, category: "师友" });
    resolveAction(game, "购买药物和猎魂绳作为补给");
    resolveAction(game, "邀请林岳作为同行者组队猎魂");
    resolveAction(game, "请林岳办理猎魂手令");
    expect(game.view.hunting?.stage).toBe("准备");
    expect(resolveAction(game, "出发猎魂").intent).toBe("猎魂出发确认");
    expect(game.view.hunting?.stage).toBe("旅行");
    expect(game.view.inventory).toContain("外敷伤药");
  });

  it("猎魂准备不会替玩家提前出发，可以登记四名固定编队成员", () => {
    const game = awakened("four-person-hunt-departure");
    game.view.hunting = { stage: "准备", ringIndex: 2, targetBeastId: "datura-snake", targetName: "曼陀罗蛇", targetYears: 700, locationId: "soul-hunting-forest", recommendations: [], preparation: [], trailProgress: "待准备" };
    game.view.relations.push(
      { id: "departure-striker", name: "陆锋", relation: "学院导师兼强攻系战士", impression: "登记魂师，可靠并擅长正面攻击", strength: 70, category: "同伴" },
      { id: "departure-guard", name: "石岳", relation: "防御系护卫", impression: "可靠并擅长盾牌守护", strength: 70, category: "同伴" },
      { id: "departure-control", name: "宁索", relation: "控制系魂师", impression: "可靠并擅长束缚阵法", strength: 70, category: "同伴" },
      { id: "departure-healer", name: "苏叶", relation: "治疗系医师", impression: "可靠并擅长治愈救护", strength: 70, category: "同伴" },
    );
    for (const [name, role] of [["陆锋", "强攻"], ["石岳", "防护"], ["宁索", "控制"], ["苏叶", "治疗"]] as const) {
      expect(resolveAction(game, `邀请${name}担任${role}岗位同行猎魂`).intent).toBe("猎魂准备");
      expect(game.view.hunting.stage).toBe("准备");
    }
    expect(resolveAction(game, "请陆锋办理猎魂手令").intent).toBe("猎魂准备");
    expect(game.view.hunting.preparation.filter((item) => /^(?:成年)?同行者：/.test(item))).toHaveLength(4);
    expect(game.view.hunting.preparation.filter((item) => item.startsWith("成年同行者：")).length).toBeGreaterThanOrEqual(1);
    expect(resolveAction(game, "出发猎魂").intent).toBe("猎魂出发确认");
    expect(game.view.hunting.stage).toBe("旅行");
  });

  it("第一魂环先选择家庭、学院、宗门、导师或独行责任路线，并分别结算预算与成年责任", () => {
    const academyGame = awakened("hunt-support-academy");
    academyGame.view.character!.soulRank = 10;
    academyGame.view.character!.coins = 2;
    academyGame.view.affiliations.push({ id: "support-academy", name: "诺丁初级魂师学院", role: "普通学员", reputation: "在册", joinedAt: "测试" });
    expect(resolveAction(academyGame, "开始调查魂兽").intent).toBe("比较猎魂责任路线");
    expect(academyGame.view.hunting?.support).toBeUndefined();
    expect(resolveAction(academyGame, "申请学院承担首环带队责任").intent).toBe("确认猎魂责任路线");
    expect(academyGame.view.hunting?.support).toMatchObject({ route: "学院带队", sponsorBudget: 6, sponsorSpent: 0 });
    resolveAction(academyGame, "开始调查魂兽");
    const target = academyGame.view.hunting!.recommendations[0].name;
    resolveAction(academyGame, `选择${target}作为魂环目标`);
    expect(resolveAction(academyGame, "购买药物和猎魂绳作为补给").intent).toBe("猎魂准备");
    expect(academyGame.view.character!.coins).toBe(0);
    expect(academyGame.view.hunting?.support?.sponsorSpent).toBe(6);
    const responsible = academyGame.view.hunting!.support!.responsibleParty;
    expect(resolveAction(academyGame, `邀请${responsible}作为成年同行者`).intent).toBe("猎魂准备");
    expect(academyGame.view.hunting?.preparation.some((item) => item.startsWith(`成年同行者：${responsible}`))).toBe(true);

    const sectGame = awakened("hunt-support-sect");
    sectGame.view.character!.soulRank = 10;
    sectGame.view.affiliations.push({ id: "support-sect", name: "青岳宗", role: "弟子", reputation: "在册", joinedAt: "测试" });
    resolveAction(sectGame, "开始调查魂兽");
    expect(resolveAction(sectGame, "申请宗门承担首环护送责任").intent).toBe("确认猎魂责任路线");
    expect(sectGame.view.hunting?.support).toMatchObject({ route: "宗门护送", sponsorBudget: 12 });

    const mentorGame = awakened("hunt-support-mentor");
    mentorGame.view.character!.soulRank = 10;
    resolveAction(mentorGame, "寻找适合当前武魂的导师");
    const mentorName = mentorGame.view.mentorPursuit!.mentorName;
    resolveAction(mentorGame, `请${mentorName}评估公开武魂与现有基础`);
    resolveAction(mentorGame, `完成${mentorName}第一次试学训练`);
    resolveAction(mentorGame, `完成${mentorName}第二次试学训练`);
    resolveAction(mentorGame, `与${mentorName}谈清责任后正式拜师`);
    resolveAction(mentorGame, `请${mentorName}评估第一魂环路线`);
    resolveAction(mentorGame, "开始调查魂兽");
    const mentorSupport = resolveAction(mentorGame, "请求导师指导第一魂环");
    expect(mentorSupport.intent).toBe("确认猎魂责任路线");
    expect(mentorSupport.routing).toMatchObject({ selected: "mentor-hunt-support", candidates: expect.arrayContaining(["mentor-hunt-support", "active-hunt"]) });
    expect(mentorGame.view.hunting?.support).toMatchObject({ route: "导师指导", responsibleParty: mentorName, sponsorBudget: 4 });

    const independent = awakened("hunt-support-independent");
    independent.view.character!.soulRank = 10;
    expect(resolveAction(independent, "开始调查魂兽").intent).toBe("比较猎魂责任路线");
    expect(resolveAction(independent, "选择独行筹备第一魂环").intent).toBe("无法完成");
    independent.view.character!.age = 12;
    expect(resolveAction(independent, "选择独行筹备第一魂环").intent).toBe("确认猎魂责任路线");
    expect(independent.view.hunting?.support?.route).toBe("独行筹备");

    const childTeam = awakened("hunt-support-child-team");
    childTeam.view.hunting = { stage: "准备", ringIndex: 1, targetBeastId: "datura-snake", targetName: "曼陀罗蛇", targetYears: 120, locationId: "star-dou-edge", recommendations: [], preparation: ["猎魂绳", "外敷伤药"], trailProgress: "待准备", support: { route: "家庭筹备", responsibleParty: "顾伯", fundingSource: "家庭", authorization: "仍需成年魂师", sponsorBudget: 0, sponsorSpent: 0, obligations: ["成年魂师同行"], evidence: [], status: "已确认" } };
    childTeam.view.relations.push({ id: "child-peer", name: "小石", relation: "同班同学", impression: "六岁同龄魂师", age: 6, strength: 70, category: "同伴" });
    resolveAction(childTeam, "邀请小石作为同行者组队猎魂");
    expect(resolveAction(childTeam, "出发猎魂").intent).toBe("无法完成");
    expect(resolveAction(childTeam, "出发猎魂").ruleSummary).toContain("同龄队友");
  });

  it("未到魂环瓶颈时不能提前猎取魂环", () => {
    const game = awakened("early-hunt");
    game.view.character!.soulRank = 3;
    game.view.character!.soulRings = [];
    const result = resolveAction(game, "开始调查魂兽");
    expect(result.intent).toBe("无法完成");
    expect(game.view.hunting).toBeUndefined();
  });

  it("地图旅行会改变地点并发现新区域", () => {
    const game = awakened("travel");
    const target = game.view.map.find((location) => !location.current && location.travelMinutes > 0);
    expect(target).toBeDefined();
    resolveAction(game, `前往${target!.name}`);
    expect(game.view.locationId).toBe(target!.id);
    expect(game.world.discoveredLocations).toContain(target!.id);
  });

  it("跨年会推进年龄但不会提前触发年内原作节点", () => {
    const game = awakened("timeline");
    game.view.locationId = "notting-academy";
    game.view.location = "诺丁初级魂师学院";
    game.world = createHiddenWorld(-1, "notting-academy");
    game.view.worldTime = { era: "与唐三同年参加武魂觉醒", year: -1, day: 360, time: "23:00", season: "冬" };
    const age = game.view.character!.age;
    const messages = advanceWorldTime(game, 120);
    expect(game.view.worldTime.year).toBe(0);
    expect(game.view.character!.age).toBe(age + 1);
    expect(messages.some((message) => message.includes("唐三与小舞"))).toBe(false);
    expect(game.view.news.some((item) => item.id === "tang-awakening")).toBe(false);
    const laterMessages = advanceWorldTime(game, 20 * 1440);
    expect(laterMessages.some((message) => message.includes("唐三与小舞"))).toBe(true);
    expect(game.view.news.some((item) => item.id === "tang-awakening")).toBe(true);
  });

  it("过早中止没有收益，真实游玩后才生成传承点", () => {
    const game = awakened("ending");
    game.world.metrics.completedHunts = 2;
    game.world.metrics.discoveries = 3;
    const early = settleRun(game, "完成目标");
    expect(early.legacyPoints).toBe(0);
    expect(early.qualified).toBe(false);
    const qualifiedGame = awakened("qualified-ending");
    qualifiedGame.actionIndex = 8;
    qualifiedGame.world.metrics.completedHunts = 2;
    qualifiedGame.world.metrics.discoveries = 3;
    const settlement = settleRun(qualifiedGame);
    expect(qualifiedGame.view.status).toBe("ended");
    expect(settlement.legacyPoints).toBeGreaterThan(0);
    expect(settlement.qualified).toBe(true);
    expect(settlement.highlights).toHaveLength(4);
    expect(qualifiedGame.view.runProgress.settlement).toEqual(settlement);
  });

  it("旧存档可补齐第二版世界状态", () => {
    const game = awakenedInEra(3, "migration");
    const delivery = { intent: "交付悬赏", minutes: 30, ruleSummary: "公开登记并完成悬赏。", fallbackNarrative: "登记处签发回单。", suggestions: [] };
    applyActionResult(game, "公开交付悬赏", delivery, delivery.fallbackNarrative, delivery.suggestions);
    advanceWorldTime(game, 20 * 1_440);
    game.world.socialRumors[0].mediaVersions![0].verificationStatus = "更正证据已核验";
    delete (game as unknown as { schemaVersion?: number }).schemaVersion;
    delete (game.view as Partial<typeof game.view>).map;
    delete (game.view.candidates[0] as Partial<typeof game.view.candidates[number]>).dwelling;
    delete (game.view.candidates[0] as Partial<typeof game.view.candidates[number]>).startingRelations;
    delete (game.view.candidates[0] as Partial<typeof game.view.candidates[number]>).household;
    delete (game.view.candidates[0] as Partial<typeof game.view.candidates[number]>).residence;
    delete (game.view as Partial<typeof game.view>).mediaCompetitions;
    game.view.mediaAlliances = [{ id: "legacy-alliance", name: "旧档核验联盟", competitionId: "legacy-competition", outlets: ["联邦事务公报编辑部", "地方民生频道"], status: "试运行", sharedVerificationPool: 1, delayedAgendaIds: [], agendas: [], evidence: ["旧档联盟记录"] }];
    game.view.mediaOutlets = [{ name: "联邦事务公报编辑部", stance: "公共机构与职业秩序", trustScore: 64, publications: 2, corrections: 0, linkedReports: 0, status: "信誉稳定", evidence: ["旧报道"] }];
    game.world.npcs["tang-san"].factionIds = ["shrek", "clear-sky", "tang-sect"];
    const migrated = ensureGameState(game);
    expect(migrated.schemaVersion).toBe(45);
    expect(migrated.view.map.length).toBeGreaterThan(0);
    expect(migrated.view.mapPins).toEqual([]);
    expect(migrated.view.candidates[0].residence.building).toBeTruthy();
    expect(migrated.world.npcs["tang-san"]).toBeDefined();
    expect(migrated.view.mediaOutlets[0].responsibleEditor).toMatchObject({ name: "顾衡", sourceTrust: 64, handledReports: 2, playerTrust: 0, interactions: 0 });
    expect(migrated.view.mediaCompetitions[0]).toMatchObject({ sharedTopics: 1, status: "更正问责", leader: "地方民生频道", scores: { 联邦事务公报编辑部: -2, 地方民生频道: 2 } });
    expect(migrated.view.mediaCompetitions[0].topics).toHaveLength(1);
    expect(migrated.view.mediaAlliances[0]).toMatchObject({ id: "legacy-alliance", recoveryEvidence: [], suspendedOutletNames: [], probationVerificationsRemaining: 0, resourceRefillCount: 0, minimumMembers: 2, departures: [], membershipApplications: [] });
  });

  it("重要人物互动会留下记忆并推动世界偏差", () => {
    const game = awakened("canon-contact");
    game.world.npcs["tang-san"].locationId = game.view.locationId!;
    const before = game.world.deviation;
    resolveAction(game, "询问唐三最近在做什么");
    expect(game.world.deviation).toBeGreaterThan(before);
    expect(game.world.npcs["tang-san"].memoryOfPlayer.length).toBeGreaterThan(0);
    expect(game.world.npcs["tang-san"].episodicMemory.at(-1)).toMatchObject({
      source: "规则结算",
      witnessed: true,
      significance: 2,
      actionIndex: game.actionIndex,
    });
    expect(game.view.relations.some((relation) => relation.name === "唐三")).toBe(true);
    expect(game.world.canonCausalFootprints).toHaveLength(0);
  });

  it("地方事件可以被玩家介入并改写世界指标", () => {
    const game = awakened("dynamic-event");
    game.world.dynamicEvents.push({ id: "test-event", title: "失踪的采药队", kind: "地方", locationId: game.view.locationId!, participantIds: [], detail: "有人没有回来。", stakes: 3, status: "可介入", createdYear: 0, createdDay: 1, expiresOrdinal: 60 });
    resolveAction(game, "帮助处理失踪的采药队");
    expect(game.world.dynamicEvents[0].status).toBe("已解决");
    expect(game.world.deviation).toBeGreaterThan(0);
    expect(game.world.metrics.historicalImpact).toBeGreaterThan(0);
  });

  it("NPC在玩家视野外会形成关系并自主行动", () => {
    const game = awakened("npc-autonomy");
    advanceWorldTime(game, 360 * 1440);
    expect(game.world.npcRelations.length).toBeGreaterThan(0);
    expect(game.world.dynamicEvents.length).toBeGreaterThan(0);
    expect(game.world.lastAutonomyOrdinal).toBeGreaterThan(0);
  });

  it("长时间快进按中间日期执行NPC行动而不是套用终点年份", () => {
    const game = awakened("chronological-long-skip");
    game.world = createHiddenWorld(0, game.view.locationId!);
    game.view.worldTime = { era: "唐三觉醒基准年", year: 0, day: 1, time: "08:00", season: "春" };
    advanceWorldTime(game, 360 * 1440);
    const logs = Object.values(game.world.npcs).flatMap((npc) => npc.autonomyLog);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((log) => log.year === 0 && log.day > 1)).toBe(true);
    expect(logs.every((log) => !(log.year === 1 && log.day === 1))).toBe(true);
  });

  it("隐藏传承会被调查发现并能够独立成长", () => {
    const game = awakened("special-system");
    const selected = game.hiddenCandidates.find((candidate) => candidate.public.id === game.view.selectedCandidateId)!;
    selected.hiddenGift = "残缺丹道传承";
    resolveAction(game, "调查自己的身世"); resolveAction(game, "调查自己的身世"); resolveAction(game, "调查自己的身世");
    expect(game.view.character?.specialSystem?.name).toBe("残缺丹道传承");
    resolveAction(game, "参悟特殊体系");
    expect(Number(game.world.flags.specialSystemProgress)).toBeGreaterThan(0);
  });

  it("玩家可以加入学院并完成基础课程", () => {
    const game = awakened("academy-life");
    game.view.character!.innateSoulPower = 10;
    game.view.character!.soulRank = 10;
    game.view.character!.coins = 100;
    expect(resolveAction(game, "申请学院入学").intent).toBe("询问学院入学条件");
    expect(game.view.academyApplication).toMatchObject({ route: "普通学员", fundingType: "家庭自费" });
    expect(game.view.affiliations.some((item) => /学院/.test(item.name))).toBe(false);
    expect(resolveAction(game, "准备学院需要的证明").intent).toBe("完成学院来处查验");
    expect(game.view.academyApplication).toMatchObject({ stage: "待报到", assessmentRequired: false });
    expect(resolveAction(game, "接受学院入学安排").intent).toBe("加入学院");
    expect(game.view.affiliations.some((item) => /学院/.test(item.name))).toBe(true);
    expect(resolveAction(game, "参加课程").intent).toBe("无法完成");
    expect(resolveAction(game, game.view.academyLife!.arrivalAction).intent).toBe("学院入学安顿");
    resolveAction(game, "参加第一堂魂师基础课程");
    resolveAction(game, "参加第二堂魂师基础课程");
    const [competitor, practicalPeer] = game.view.academyLife!.peers;
    const competitionBefore = competitor.competition;
    expect(resolveAction(game, `与${competitor.name}完成一次小组练习`).intent).toBe("学院同辈训练");
    resolveAction(game, "参加第三堂魂师基础课程");
    expect(resolveAction(game, `与${practicalPeer.name}完成一次小组练习`).intent).toBe("学院同辈训练");
    expect(game.view.academyLife).toMatchObject({ stage: "阶段考核", assessmentName: "基础课程与实战检查", courseProgress: 3, peerInteractions: 2 });
    expect(resolveAction(game, "参加基础课程与实战检查").intent).toBe("完成学院阶段考核");
    expect(game.view.academyLife?.peers.find((item) => item.id === competitor.id)?.competition).toBeGreaterThan(competitionBefore);
    expect(game.view.tasks.find((task) => task.id === "academy-foundation")?.status).toBe("完成");
    const legacyTemplate = structuredClone(game);
    legacyTemplate.schemaVersion = 44;
    const oldLife = legacyTemplate.view.academyLife as unknown as Record<string, unknown>;
    oldLife.stage = "首月结业";
    oldLife.homeroomTeacher = oldLife.teacherName;
    oldLife.monthlyScore = oldLife.assessmentScore;
    for (const key of ["teacherName", "teacherRole", "periodLabel", "arrivalAction", "arrangementName", "assessmentName", "completionName", "assessmentScore"]) delete oldLife[key];
    const migratedTemplate = ensureGameState(legacyTemplate);
    expect(migratedTemplate.view.academyLife).toMatchObject({ stage: "阶段完成", teacherRole: "负责一年级课程的学院老师", assessmentName: "基础课程与实战检查" });
    expect(JSON.stringify(migratedTemplate.view.academyLife)).not.toMatch(/首月|结业|班主任|课表|学籍/);
    const legacyAcademy = structuredClone(game);
    legacyAcademy.schemaVersion = 41;
    legacyAcademy.view.academyLife = undefined;
    legacyAcademy.world.flags.academyCourseProgress = 3;
    const migratedAcademy = ensureGameState(legacyAcademy);
    expect(migratedAcademy.schemaVersion).toBe(45);
    expect(migratedAcademy.view.academyLife).toMatchObject({ stage: "同辈磨合", courseProgress: 3, peerInteractions: 0 });
    expect(migratedAcademy.view.academyLife?.peers).toHaveLength(3);
    expect(migratedAcademy.view.tasks.find((task) => task.id === "academy-foundation")?.status).toBe("进行中");
  });

  it("学院学籍与费用来源分开选择，不会把缺钱或贵族身份自动写成工读生", () => {
    const prepare = (era: 1 | 2 | 3 | 4, seed: string) => {
      const game = awakenedInEra(era, seed);
      game.view.character!.innateSoulPower = 10;
      game.view.character!.soulRank = 10;
      game.view.character!.coins = 100;
      if (!game.view.relations.some((item) => item.category === "亲属")) game.view.relations.push({ id: `${seed}-guardian`, name: "顾伯", relation: "监护人", impression: "负责入学签字", strength: 70, category: "亲属" });
      return game;
    };
    const ordinary = prepare(1, "academy-funding-ordinary");
    resolveAction(ordinary, "申请学院入学");
    expect(ordinary.view.academyApplication).toMatchObject({ route: "普通学员", fundingType: "家庭自费" });
    expect(resolveAction(ordinary, "改走工读抵扣路线").intent).toBe("变更学院费用路线");
    expect(ordinary.view.academyApplication).toMatchObject({ route: "工读生", fundingType: "工读抵扣", fee: 0 });
    expect(resolveAction(ordinary, "改走家族资助路线").intent).toBe("变更学院费用路线");
    expect(ordinary.view.academyApplication).toMatchObject({ route: "普通学员", fundingType: "家族资助" });
    expect(resolveAction(ordinary, "改走学院奖助路线").intent).toBe("变更学院费用路线");
    expect(ordinary.view.academyApplication).toMatchObject({ route: "普通学员", fundingType: "学院奖助", fee: 0, passScore: 62 });

    const commissioned = prepare(1, "academy-funding-sect");
    commissioned.view.affiliations.push({ id: "test-sect", name: "青岳宗", role: "弟子", reputation: "已登记", joinedAt: "开局" });
    resolveAction(commissioned, "申请学院入学");
    expect(resolveAction(commissioned, "改走青岳宗宗门委培路线").intent).toBe("变更学院费用路线");
    expect(commissioned.view.academyApplication).toMatchObject({ fundingType: "宗门委培", fundingSource: "青岳宗委托培养额度", fee: 0 });

    const eraThree = prepare(3, "academy-funding-compulsory");
    resolveAction(eraThree, "申请学院入学");
    expect(eraThree.view.academyApplication).toMatchObject({ route: "义务教育生", fundingType: "公共义务教育", fee: 0 });
    expect(eraThree.view.academyApplication?.obligations.join("；")).toContain("额外训练");

    const legacy = structuredClone(ordinary);
    legacy.schemaVersion = 40;
    const oldApplication = legacy.view.academyApplication as Partial<NonNullable<typeof legacy.view.academyApplication>>;
    delete oldApplication.fundingType;
    delete oldApplication.fundingSource;
    delete oldApplication.obligations;
    delete oldApplication.availableFundingOptions;
    const migrated = ensureGameState(legacy);
    expect(migrated.schemaVersion).toBe(45);
    expect(migrated.view.academyApplication).toMatchObject({ fundingType: "家庭自费", fundingSource: "本人及家庭支付" });

    const legacyD1Exam = prepare(1, "academy-legacy-fake-exam");
    resolveAction(legacyD1Exam, "申请学院入学");
    legacyD1Exam.schemaVersion = 44;
    legacyD1Exam.view.academyApplication!.stage = "入学考核";
    const oldD1Application = legacyD1Exam.view.academyApplication as unknown as Record<string, unknown>;
    delete oldD1Application.admissionAssessmentName;
    delete oldD1Application.assessmentRequired;
    const migratedD1Exam = ensureGameState(legacyD1Exam);
    expect(migratedD1Exam.view.academyApplication).toMatchObject({ stage: "待报到", admissionAssessmentName: "觉醒证明与来处查验", assessmentRequired: false });
  });

  it("寻找导师必须经过评估和两次试学，不能一句话自动拜师", () => {
    const game = awakened("mentor-pursuit");
    expect(classifyCoreActionRoute(game, "寻找适合当前武魂的导师").selected).toBe("mentor-pursuit");
    expect(resolveAction(game, "寻找适合当前武魂的导师").intent).toBe("寻找导师候选");
    const mentor = game.view.mentorPursuit!.mentorName;
    expect(game.view.relations.find((item) => item.name === mentor)?.relation).toBe("导师候选");
    expect(resolveAction(game, `正式拜${mentor}为师`).intent).toBe("接受导师能力评估");
    expect(resolveAction(game, `完成${mentor}第一次试学训练`).intent).toBe("完成导师试学");
    expect(resolveAction(game, `正式拜${mentor}为师`).intent).toBe("无法完成");
    expect(resolveAction(game, `完成${mentor}第二次试学训练`).intent).toBe("完成导师试学");
    expect(resolveAction(game, `与${mentor}谈清责任后正式拜师`).intent).toBe("拜师");
    expect(game.view.relations.find((item) => item.name === mentor)?.relation).toBe("师徒");
    expect(game.view.mentorPursuit).toMatchObject({ stage: "已拜师", lessonsCompleted: 0 });
    expect(game.view.mentorPursuit?.specialty.length).toBeGreaterThan(4);
    const firstLesson = resolveAction(game, `完成${mentor}下一节正式课程`);
    expect(firstLesson.intent).toBe("导师正式课程");
    expect(firstLesson.routing?.selected).toBe("established-mentor");
    expect(game.view.mentorPursuit?.lessonsCompleted).toBe(1);
    expect(resolveAction(game, `完成${mentor}第二节正式课程`).intent).toBe("无法完成");
    const practice = resolveAction(game, "按导师课程记录独立复练");
    expect(practice.intent).toBe("修炼");
    expect(practice.routing?.selected).toBe("mentor-independent-practice");
    expect(game.world.flags.mentorIndependentPracticeReady).toBe(true);
    expect(resolveAction(game, `完成${mentor}第二节正式课程`).intent).toBe("导师正式课程");
    expect(resolveAction(game, `请${mentor}评估第一魂环路线`).intent).toBe("导师评估魂环路线");
    expect(game.world.flags.mentorRingAssessment).toBe(mentor);
    const legacyMentor = structuredClone(game);
    legacyMentor.schemaVersion = 41;
    const oldMentor = legacyMentor.view.mentorPursuit as Partial<NonNullable<typeof legacyMentor.view.mentorPursuit>>;
    delete oldMentor.specialty; delete oldMentor.teachingStyle; delete oldMentor.taboo; delete oldMentor.resourceOffer; delete oldMentor.reciprocalDuty; delete oldMentor.trialFocus; delete oldMentor.lessonsCompleted;
    const migratedMentor = ensureGameState(legacyMentor);
    expect(migratedMentor.view.mentorPursuit?.specialty.length).toBeGreaterThan(4);
    expect(migratedMentor.view.mentorPursuit?.lessonsCompleted).toBe(0);
    expect(migratedMentor.view.relations.find((item) => item.name === mentor)?.relation).toBe("师徒");
  });

  it("猎魂补给不会在余额不足时免费发放", () => {
    const game = awakened("hunt-supply-cost");
    game.view.character!.coins = 0;
    game.view.hunting = { stage: "准备", ringIndex: 1, targetBeastId: "datura-snake", targetName: "曼陀罗蛇", targetYears: 120, locationId: "soul-hunting-forest", recommendations: [], preparation: [], trailProgress: "待准备" };
    expect(resolveAction(game, "购买药物和猎魂绳作为补给").intent).toBe("无法完成");
    expect(game.view.inventory).not.toContain("外敷伤药");
    expect(game.view.inventory).not.toContain("猎魂绳");
  });

  it("复合口语输入只执行第一阶段，教师对象不明确时不会替玩家选人", () => {
    const game = awakened("free-text-first-clause");
    const fatigueBefore = game.world.fatiguePoints;
    const result = resolveAction(game, "先休息，然后开始调查适合第一魂环的魂兽");
    expect(result.intent).toBe("休息");
    expect(result.ruleSummary).toContain("后续“开始调查适合第一魂环的魂兽”尚未发生");
    expect(game.view.hunting).toBeUndefined();
    expect(game.world.fatiguePoints).toBeLessThan(fatigueBefore + 1);

    game.view.relations.push(
      { id: "teacher-a", name: "严老师", relation: "学院班主任", impression: "负责课程", strength: 20, category: "师友" },
      { id: "teacher-b", name: "顾导师", relation: "私人导师", impression: "负责专项训练", strength: 20, category: "师友" },
    );
    const ambiguous = resolveAction(game, "询问老师第一魂环意见");
    expect(ambiguous.intent).toBe("无法完成");
    expect(ambiguous.suggestions).toEqual(expect.arrayContaining(["明确询问严老师", "明确询问顾导师"]));
    const explicit = resolveAction(game, "询问严老师第一魂环意见");
    expect(explicit.intent).toBe("与已知人物交谈");
    expect(explicit.routing?.selected).toBe("known-conversation");
  });

  it("AI长期记忆补丁会更新章节、线索和NPC记忆", () => {
    const game = awakened("story-memory");
    game.world.npcs["tang-san"].knownToPlayer = true;
    applyNarrativeMemory(game, { narrative: "", suggestions: [], memory: { summary: "我在诺丁城认识了唐三。", openThreads: ["学院名额"], keyChoice: "答应帮助工读生", npcNotes: { 唐三: "记得我替他保守过秘密" }, chapterTitle: "学院后街" } });
    expect(game.storyMemory.summary).toContain("唐三");
    expect(game.storyMemory.summary).not.toContain("我在诺丁城");
    expect(game.storyMemory.openThreads).toContain("学院名额");
    expect(game.view.chapter.title).toBe("学院后街");
    expect(game.world.npcs["tang-san"].memoryOfPlayer.at(-1)).toContain("保守");
    expect(game.world.npcs["tang-san"].episodicMemory.at(-1)).toMatchObject({ source: "叙事提取", significance: 3 });
  });

  it("unrelated deviation cannot rewrite a canon event", () => {
    const game = awakened("causal-guard");
    game.world = createHiddenWorld(-1, game.view.locationId!);
    game.world.deviation = 999;
    game.view.worldTime = { era: "比唐三早一年", year: -1, day: 360, time: "23:00", season: "冬" };
    advanceWorldTime(game, 20 * 1440 + 120);
    expect(game.world.firedCanonEvents).toContain("tang-awakening");
    expect(game.world.suppressedCanonEvents).not.toContain("tang-awakening");
  });

  it("轻微关系接触不会冻结人物后续人生阶段", () => {
    const game = awakened("minor-contact-does-not-freeze-stage");
    game.world = createHiddenWorld(0, "notting-academy");
    game.view.worldTime = { era: "唐三觉醒基准年", year: 0, day: 30, time: "08:00", season: "春" };
    recordCanonInfluence(game, { source: "普通寒暄", description: "与唐三短暂说过一句话", affectedNpcIds: ["tang-san"], strength: 1, domains: ["relationship"] });
    advanceWorldTime(game, 6 * 360 * 1440);
    expect(game.world.npcs["tang-san"].currentGoal).toContain("史莱克");
    expect(game.world.npcs["tang-san"].currentGoal).not.toContain("诺丁学院学习");
  });

  it("修炼路线被玩家改变后不会重新套用未来原著实力快照", () => {
    const game = awakened("altered-power-route");
    game.world = createHiddenWorld(0, "notting-academy");
    game.view.worldTime = { era: "唐三觉醒基准年", year: 0, day: 30, time: "08:00", season: "春" };
    recordCanonInfluence(game, { source: "长期培养改变", description: "唐三改用另一套持续修炼安排", affectedNpcIds: ["tang-san"], strength: 20, domains: ["power"] });
    advanceWorldTime(game, 8 * 360 * 1440);
    expect(game.world.npcs["tang-san"].soulRank).not.toBe(40);
    expect(game.world.npcs["tang-san"].powerTier).not.toContain("魂宗");
  });

  it("被延后的相识节点不会按旧日期强行建立原著关系", () => {
    const game = awakened("relationship-prerequisite-branch");
    game.world = createHiddenWorld(-1, "notting-academy");
    game.view.locationId = "notting-academy";
    game.view.worldTime = { era: "比唐三早一年", year: -1, day: 360, time: "23:00", season: "冬" };
    recordCanonInfluence(game, { source: "测试", description: "改变唐三个人入学安排", affectedNpcIds: ["tang-san"], strength: 50, domains: ["goal"] });
    advanceWorldTime(game, 30 * 1440);
    expect(game.world.suppressedCanonEvents).toContain("notting-master-disciple");
    expect(game.world.npcRelations.some((relation) => [relation.leftId, relation.rightId].includes("tang-san") && [relation.leftId, relation.rightId].includes("yu-xiaogang"))).toBe(false);
  });

  it("原作事件按年内日期依次发生而不是在元旦一起触发", () => {
    const game = awakened("canon-day-order");
    game.world = createHiddenWorld(5, game.view.locationId!);
    game.view.worldTime = { era: "唐三觉醒后 5 年", year: 5, day: 360, time: "23:00", season: "冬" };
    advanceWorldTime(game, 2 * 1440);
    expect(game.world.firedCanonEvents).not.toContain("shrek-enrollment");
    expect(game.world.firedCanonEvents).not.toContain("suotuo-spirit-arena");
    advanceWorldTime(game, 19 * 1440);
    expect(game.world.firedCanonEvents).toContain("shrek-enrollment");
    expect(game.world.firedCanonEvents).not.toContain("suotuo-spirit-arena");
    advanceWorldTime(game, 40 * 1440);
    expect(game.world.firedCanonEvents).toContain("suotuo-spirit-arena");
    expect(game.world.firedCanonEvents).not.toContain("imperial-team-battle");
  });

  it("主事件目录不会再次加入同义的扩展事件", () => {
    const redundantIds = ["shrek-entry-test", "shrek-soto-arena", "imperial-team-match", "d1-golden-triangle-reunion", "tournament-qualifiers", "xiao-wu-identity-exposed", "tang-hao-rescue"];
    expect(CANON_EVENTS.some((event) => redundantIds.includes(event.id))).toBe(false);
    expect(CANON_EVENTS.find((event) => event.id === "academy-tournament")).toMatchObject({ year: 8, day: 120, locationId: "heaven-dou-city" });
    expect(CANON_EVENTS.find((event) => event.id === "tournament-finals")).toMatchObject({ year: 8, day: 260, locationId: "spirit-city" });
  });

  it("秘密事件照常推进世界但不会变成全图即时新闻", () => {
    const game = awakened("secret-news");
    game.world = createHiddenWorld(6, "notting-city");
    game.view.locationId = "notting-city";
    game.view.location = "诺丁城";
    game.view.worldTime = { era: "唐三觉醒后 6 年", year: 6, day: 360, time: "23:00", season: "冬" };
    const messages = advanceWorldTime(game, 121 * 1440);
    expect(game.world.firedCanonEvents).toContain("ice-fire-herbs");
    expect(game.view.news.some((item) => item.id === "ice-fire-herbs")).toBe(false);
    expect(messages.some((message) => message.includes("冰火两仪眼仙草"))).toBe(false);
  });

  it("大陆级公开事件仍会通过世界消息传播", () => {
    const game = awakened("public-news");
    game.world = createHiddenWorld(7, "notting-city");
    game.view.locationId = "notting-city";
    game.view.location = "诺丁城";
    game.view.worldTime = { era: "唐三觉醒后 7 年", year: 7, day: 360, time: "23:00", season: "冬" };
    const messages = advanceWorldTime(game, 121 * 1440);
    expect(game.view.news.some((item) => item.id === "academy-tournament")).toBe(true);
    expect(messages).toContain("消息 · 全大陆高级魂师学院精英大赛预选赛开幕");
  });

  it("a strong linked cause can change the matching canon event", () => {
    const game = awakened("causal-link");
    game.world = createHiddenWorld(-1, game.view.locationId!);
    game.view.canonInfluences = [];
    game.view.worldTime = { era: "比唐三早一年", year: -1, day: 360, time: "23:00", season: "冬" };
    recordCanonInfluence(game, { source: "测试", description: "提前改变唐三的个人入学安排", affectedNpcIds: ["tang-san"], strength: 50, domains: ["goal"] });
    advanceWorldTime(game, 20 * 1440 + 120);
    expect(game.world.suppressedCanonEvents).toContain("tang-awakening");
    expect(game.view.canonInfluences[0].affects).toContain("唐三");
    expect(game.world.canonTimelineBranches).toEqual(expect.arrayContaining([expect.objectContaining({ eventId: "tang-awakening", state: "延后", status: "待结算" })]));

    advanceWorldTime(game, 300 * 1440);
    const branch = game.world.canonTimelineBranches.find((item) => item.eventId === "tang-awakening");
    expect(branch).toMatchObject({ state: "替代", status: "已结算", recheckCount: 2 });
    expect(game.world.firedCanonEvents).not.toContain("tang-awakening");
    expect(game.world.suppressedCanonEvents).toContain("tang-awakening");
    expect(game.world.dynamicEvents.some((item) => item.id === branch?.replacementEventId && item.status === "可介入")).toBe(true);
    expect(game.world.npcs["tang-san"].currentGoal).toMatch(/利益|计划失效/);
    expect(game.world.canonCausalFootprints.some((item) => item.source === "历史分支结算" && item.affectedNpcIds.includes("tang-san"))).toBe(true);
  });

  it("改写后的节点只向直接后继衰减传播，不会感染整条原著", () => {
    const game = awakened("causal-cascade");
    game.world = createHiddenWorld(-1, "notting-academy");
    game.view.locationId = "notting-academy";
    game.view.location = "诺丁学院";
    game.view.worldTime = { era: "比唐三早一年", year: -1, day: 360, time: "23:00", season: "冬" };
    recordCanonInfluence(game, { source: "测试", description: "提前改变诺丁学院的入学制度", locationId: "notting-academy", strength: 50 });
    advanceWorldTime(game, 140 * 1440);
    expect(game.world.canonTimelineBranches.some((item) => item.eventId === "tang-awakening" && item.status === "已结算")).toBe(true);
    const propagated = game.world.canonCausalFootprints.find((item) => item.originEventId === "tang-awakening");
    expect(propagated?.strength).toBeLessThan(50);
    expect(game.world.canonTimelineBranches.some((item) => item.eventId === "notting-master-disciple")).toBe(true);

    advanceWorldTime(game, (6 * 360 - 120) * 1440);
    expect(game.world.canonTimelineBranches.some((item) => item.eventId === "shrek-enrollment")).toBe(false);
  });

  it("远方未获知的历史分支不会通过模型因果上下文泄露", () => {
    const game = awakened("hidden-causal-branch");
    game.world.canonCausalFootprints.push({ id: "hidden-branch-cause", source: "历史分支结算", description: "远方局势已经变化", atYear: 8, atDay: 1, locationId: "spirit-city", affectedNpcIds: ["qian-renxue"], affectedFactionIds: ["spirit-hall"], strength: 20 });
    expect(observableCausalFootprintsForNarration(game).some((item) => item.id === "hidden-branch-cause")).toBe(false);
    game.view.canonInfluences.push({ id: "hidden-branch-cause", action: "已获知的历史分支", affects: "武魂殿", strength: "已形成历史分支", date: "原作 +8 年" });
    expect(observableCausalFootprintsForNarration(game).some((item) => item.id === "hidden-branch-cause")).toBe(true);
    expect(JSON.stringify(observableCausalFootprintsForNarration(game))).not.toContain("qian-renxue");
  });

  it("respects birth years and canonical locations", () => {
    const early = createHiddenWorld(-20, "notting-city");
    expect(early.npcs["tang-san"].alive).toBe(false);
    const beforeAwakening = createHiddenWorld(-1, "notting-city");
    expect(beforeAwakening.npcs["ning-rongrong"].age).toBe(5);
    expect(beforeAwakening.npcs["ning-rongrong"].locationId).toBe("seven-treasure-fort");
  });

  it("keeps later-era long-lived soul beasts alive and reachable in the first-era world", () => {
    const world = createHiddenWorld(-5, "notting-city");
    for (const id of ["di-tian", "bi-ji", "zi-ji", "xiong-jun", "wan-yao-wang", "chi-wang", "tian-meng", "snow-empress", "ice-empress"]) {
      expect(world.npcs[id]?.alive).toBe(true);
      expect(world.npcs[id]?.knownToPlayer).toBe(false);
    }
    expect(world.npcs["di-tian"].locationId).toBe("star-dou-core");
    expect(world.npcs["snow-empress"].locationId).toBe("extreme-north-core");
    expect(LOCATIONS.some((location) => location.id === "extreme-north-core" && location.danger === "禁区")).toBe(true);
    expect(SOUL_BEASTS.some((beast) => beast.name === "冰天雪女" && beast.ageRange[0] >= 600000)).toBe(true);
  });

  it("never applies a future power snapshot to a younger canon character", () => {
    const earlyStarLuo = createHiddenWorld(-5, "star-luo-city");
    expect(earlyStarLuo.npcs["dai-mubai"].age).toBe(4);
    expect(earlyStarLuo.npcs["dai-mubai"].soulRank).toBeUndefined();
    expect(earlyStarLuo.npcs["dai-mubai"].powerTier).toBe("尚未觉醒");
    expect(earlyStarLuo.npcs["dai-weisi"].age).toBe(10);
    expect(earlyStarLuo.npcs["dai-weisi"].soulRank).toBeUndefined();
    expect(earlyStarLuo.npcs["dai-weisi"].powerTier).toBe("实力未核实");
  });

  it("does not treat sharing a city as personally knowing a canon figure", () => {
    const earlyStarLuo = createHiddenWorld(-5, "star-luo-city");
    expect(Object.values(earlyStarLuo.npcs).some((npc) => npc.knownToPlayer)).toBe(false);
  });

  it("removes unsupported omniscient NPC knowledge from legacy saves", () => {
    const game = awakened("legacy-omniscience");
    game.view.worldTime = { era: "比唐三觉醒早约 5 年", year: -5, day: 1, time: "08:00", season: "春" };
    game.world = createHiddenWorld(-5, "star-luo-city");
    game.world.npcs["dai-weisi"].knownToPlayer = true;
    game.world.npcs["dai-weisi"].soulRank = 49;
    const migrated = ensureGameState(game);
    expect(migrated.world.npcs["dai-weisi"].knownToPlayer).toBe(false);
    expect(migrated.world.npcs["dai-weisi"].soulRank).toBeUndefined();
    expect(migrated.world.npcs["dai-weisi"].powerTier).toBe("实力未核实");
    expect(migrated.view.knownFigures.some((figure) => figure.id === "dai-weisi")).toBe(false);
  });

  it("migrates leaked future names and relationship baselines back to the current life stage", () => {
    const game = awakenedInEra(3, "legacy-future-identity");
    game.schemaVersion = 34;
    game.view.worldTime = { era: "东海学院零班阶段", year: 20003, day: 1, time: "08:00", season: "春" };
    game.world = createHiddenWorld(20003, "east-sea-city");
    game.world.npcs["gu-yue-na"].name = "古月娜";
    game.view.narrative.push({ id: "legacy-future-name", kind: "narration", text: "古月娜已经以银龙斗罗身份处理传灵塔事务。", createdAt: new Date().toISOString() });
    game.storyMemory.summary = "主角在东海学院见到了古月娜。";
    game.view.relations.push({ id: "gu-yue-na", name: "古月娜", relation: "同学", impression: "旧存档提前使用了后期姓名", strength: 10, category: "师友" });
    const migrated = ensureGameState(game);
    expect(migrated.schemaVersion).toBe(45);
    expect(migrated.world.npcs["gu-yue-na"].name).toBe("古月");
    expect(migrated.view.relations.find((item) => item.id === "gu-yue-na")?.name).toBe("古月");
    expect(migrated.storyMemory.summary).not.toContain("古月娜");
    expect(migrated.view.narrative.at(-1)?.text).not.toContain("古月娜");
    expect(migrated.view.narrative.at(-1)?.text).not.toContain("处理传灵塔事务");
    expect(migrated.world.npcRelations.every((relation) => !relation.history.at(-1)?.reason.includes("跨阵营感情核心"))).toBe(true);
  });

  it("migrates old sect body-soul prose and generic opening objectives", () => {
    const game = awakened("legacy-opening-matrix");
    game.schemaVersion = 37;
    game.view.character!.originName = "隐世太玄剑宗少宗主";
    game.view.character!.originSummary = "太玄剑宗内部觉醒";
    game.view.character!.originBurden = "宗门长老受旧誓约束";
    game.view.character!.martialSoul.name = "先天道体";
    game.view.character!.martialSoul.category = "本体武魂";
    game.view.character!.martialSouls[game.view.character!.activeMartialSoulIndex].name = "先天道体";
    game.view.character!.martialSouls[game.view.character!.activeMartialSoulIndex].category = "本体武魂";
    game.view.affiliations = [{ id: "taixuan-sword", name: "太玄剑宗", role: "少宗主", reputation: "身份已确认", joinedAt: "出生", contribution: 0, completedAssignments: 0, rankEvidence: [] }];
    game.view.relations.push({ name: "太玄剑宗守碑长老", relation: "觉醒主持者", impression: "主持内部觉醒", faction: "太玄剑宗", strength: 20, category: "势力" });
    game.view.narrative.push({ id: "legacy-body-palm", kind: "narration", text: "他摊开手。先天道体托在掌心，本体武魂特有的气息沿着指缝散开。太玄剑宗守碑长老俯身看了片刻，又让记录员把形态一笔笔画下来。学院名额、第一魂环和培养责任，今天便要有人给出答复。他心想：这上面记的，恐怕不只是魂环。", createdAt: new Date().toISOString() });
    game.view.chapterObjective = { title: "让觉醒结果真正变成第一步", stakes: "旧版通用目标", steps: [{ id: "path", text: "确定入学、拜师、宗门或独自修炼中的近期路线", status: "进行中" }] };
    game.storyMemory.openThreads = ["家人与出身中尚未说清的细节"];
    delete game.world.flags.openingMode; delete game.world.flags.openingInstitutionName; delete game.world.flags.openingOfficiant; delete game.world.flags.openingSoulTestFocus;
    const migrated = ensureGameState(game);
    expect(migrated.schemaVersion).toBe(45);
    expect(migrated.view.narrative.at(-1)?.text).not.toMatch(/先天道体托在掌心|学院名额|恐怕不只是魂环/);
    expect(migrated.view.chapterObjective?.title).toContain("太玄剑宗内部觉醒");
    expect(JSON.stringify(migrated.view.chapterObjective)).not.toMatch(/加入宗门|学院名额/);
    expect(migrated.storyMemory.openThreads).toContain("谈清太玄剑宗内部培养条件与责任");
  });

  it("normalizes generated prose to third-person limited", () => {
    const game = awakened("third-person");
    applyActionResult(game, "回家", { intent: "测试", minutes: 0, ruleSummary: "", fallbackNarrative: "", suggestions: [] }, "我顺着土路回家。路人问：“你去哪？”我没有回答。", []);
    const text = game.view.narrative.at(-1)?.text ?? "";
    expect(text).toContain(game.view.character!.name);
    expect(text).not.toMatch(/(^|[^“「『])我/);
  });

  it("rejects future canon developments before their year", () => {
    expect(violatesCanonChronology("宁荣荣已经去了史莱克学院就读。", -1)).toBe(true);
    expect(violatesCanonChronology("七宝琉璃宗位于天斗城外，守卫严密。", -1)).toBe(false);
    expect(violatesCanonChronology("宁荣荣进入史莱克学院就读。", 6)).toBe(false);
  });

  it("rejects canon ages and ranks copied from a future snapshot", () => {
    const game = awakened("future-power-audit");
    game.view.worldTime = { era: "比唐三觉醒早约 5 年", year: -5, day: 1, time: "08:00", season: "春" };
    game.world = createHiddenWorld(-5, "star-luo-city");
    expect(auditNarrative(game, "十岁的戴维斯已经是四十九级魂宗。"))
      .toContain("正文提前泄露或写错戴维斯在当前年份的魂力");
    expect(auditNarrative(game, "四岁的戴沐白已经三十七级。"))
      .toContain("正文提前泄露或写错戴沐白在当前年份的魂力");
  });

  it("rejects later names, titles, and faction memberships before their life stage", () => {
    const era1 = awakened("future-identity-era1");
    era1.world.npcs["tang-san"].knownToPlayer = true;
    expect(auditNarrative(era1, "六岁的唐三已经是唐门宗主。"))
      .toContain("正文提前写入唐三尚未形成的势力归属");

    const era3 = awakenedInEra(3, "future-identity-era3");
    era3.view.worldTime = { era: "东海零班阶段", year: 20003, day: 1, time: "08:00", season: "春" };
    era3.world = createHiddenWorld(20003, "east-sea-city");
    era3.world.npcs["gu-yue-na"].knownToPlayer = true;
    expect(era3.world.npcs["gu-yue-na"].name).toBe("古月");
    expect(auditNarrative(era3, "古月娜以银龙斗罗的身份加入传灵塔。"))
      .toContain("正文提前使用古月尚未公开的后期姓名、称号或身份");

    const era4 = awakenedInEra(4, "future-identity-era4");
    era4.view.worldTime = { era: "高能少年班阶段", year: 30001, day: 1, time: "08:00", season: "春" };
    era4.world = createHiddenWorld(30001, "tianluo-planet");
    expect(era4.world.npcs["bai-xiuxiu"].name).toBe("冻千秋");
    expect(auditNarrative(era4, "白秀秀已经成为蓝轩宇的舰队伴侣。"))
      .toContain("正文提前使用冻千秋尚未公开的后期姓名、称号或身份");
  });
});

describe("第一部世界资料", () => {
  it("包含人物、势力、地点、事件和魂兽", () => {
    expect(CANON_CHARACTERS.length).toBeGreaterThanOrEqual(150);
    expect(FACTIONS.length).toBeGreaterThanOrEqual(60);
    expect(LOCATIONS.length).toBeGreaterThanOrEqual(60);
    expect(CANON_EVENTS.length).toBeGreaterThanOrEqual(100);
    expect(SOUL_BEASTS.length).toBeGreaterThanOrEqual(200);
  });

  it("keeps expanded catalog references complete and unique", () => {
    const unique = <T extends { id: string }>(items: T[]) => new Set(items.map((item) => item.id)).size === items.length;
    expect(unique(CANON_CHARACTERS)).toBe(true);
    expect(unique(FACTIONS)).toBe(true);
    expect(unique(LOCATIONS)).toBe(true);
    expect(unique(CANON_EVENTS)).toBe(true);
    expect(unique(SOUL_BEASTS)).toBe(true);
    const characterIds = new Set(CANON_CHARACTERS.map((item) => item.id));
    const locationIds = new Set(LOCATIONS.map((item) => item.id));
    expect(CANON_EVENTS.flatMap((event) => event.participantIds).every((id) => characterIds.has(id))).toBe(true);
    expect(CANON_EVENTS.every((event) => !event.locationId || locationIds.has(event.locationId))).toBe(true);
    expect(SOUL_BEASTS.flatMap((beast) => beast.habitats).every((id) => locationIds.has(id))).toBe(true);
  });

  it("separates canon, derived, and original places without rewriting the Holy Dragon Sect as a later-era rank", () => {
    expect(LOCATIONS.every((location) => ["原著", "原著归纳", "原创"].includes(location.provenance))).toBe(true);
    expect(FACTIONS.every((faction) => ["原著", "原著归纳", "原创"].includes(faction.provenance))).toBe(true);
    expect(FACTIONS.find((faction) => faction.id === "holy-dragon-sect")?.kind).toBe("下四宗");
    expect(LOCATIONS.find((location) => location.id === "haagen-city")).toMatchObject({ name: "西鲁城", provenance: "原著" });
    expect(LOCATIONS.find((location) => location.id === "heavenly-soul-city")).toBeUndefined();
    expect(LOCATIONS.find((location) => location.id === "heaven-dou-city")).toMatchObject({ name: "天斗城", provenance: "原著" });
    expect(LOCATIONS.find((location) => location.id === "mother-ship-port")).toMatchObject({ name: "联邦舰队集结基地", provenance: "原创" });
    expect(LOCATIONS.find((location) => location.id === "fire-leopard-town")?.provenance).toBe("原创");

    const era2 = awakenedInEra(2, "location-provenance-era2");
    expect(era2.view.map).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "heaven-dou-city", source: "原著" }),
      expect.objectContaining({ id: "sunset-forest", source: "原著" }),
    ]));
    expect(era2.view.map.filter((location) => location.name === "天斗城")).toHaveLength(1);

    const oldTianhun = awakenedInEra(2, "location-provenance-tianhun-migration");
    oldTianhun.schemaVersion = 32;
    oldTianhun.view.locationId = "heavenly-soul-city";
    oldTianhun.view.location = "天魂城";
    oldTianhun.world.discoveredLocations.push("heavenly-soul-city");
    const migratedTianhun = ensureGameState(oldTianhun);
    expect(migratedTianhun.view.locationId).toBe("heaven-dou-city");
    expect(migratedTianhun.view.location).toBe("天斗城");
    expect(migratedTianhun.world.discoveredLocations).not.toContain("heavenly-soul-city");

    const legacy = awakenedInEra(4, "location-provenance-migration");
    legacy.schemaVersion = 32;
    legacy.view.locationId = "mother-ship-port";
    legacy.view.location = "联邦母舰港";
    const migrated = ensureGameState(legacy);
    expect(migrated.schemaVersion).toBe(45);
    expect(migrated.view.location).toBe("联邦舰队集结基地");
  });

  it("does not activate later-era people, factions or locations in a first-era save", () => {
    const game = awakened("era-activation-boundaries");
    expect(game.world.npcs["huo-yuhao"].alive).toBe(false);
    expect(game.world.npcs["tang-wulin"].alive).toBe(false);
    expect(game.world.npcs["lan-xuanyu"].alive).toBe(false);
    expect(game.world.npcs["qian-xunji"].alive).toBe(false);
    expect(game.view.map.some((location) => location.id === "radiant-city" || location.id === "dragon-horse-star")).toBe(false);
    expect(resolveAction(game, "前往传灵塔申请魂灵").intent).toBe("规则阻止");
  });

  it("载入四个时代的完整同人规则库", () => {
    expect(rulebookStats()).toEqual({ 1: 1000, 2: 1000, 3: 1000, 4: 1000 });
  });

  it("按当前行动检索适用规则", () => {
    const game = awakened("rule-retrieval");
    const rules = selectNarrativeRules(game, "调查适合第一魂环的魂兽", { intent: "猎魂调查", minutes: 30, ruleSummary: "", fallbackNarrative: "", suggestions: [] });
    expect(rules.some((rule) => [27, 28, 29, 30, 41, 85].includes(rule.section))).toBe(true);
    expect(rules.some((rule) => rule.section === 93)).toBe(true);
  });

  it("阻止斗一时代直接使用后世技术和无来源力量", () => {
    const game = awakened("era-guard");
    expect(resolveAction(game, "直接驾驶机甲去天斗城").intent).toBe("规则阻止");
    expect(resolveAction(game, "立即修炼查克拉").intent).toBe("规则阻止");
    expect(resolveAction(game, "研究附近有没有早期魂导遗物").intent).toBe("调查");
  });

  it("叙事检查能拦住第一人称、模板句和时代越界", () => {
    const game = awakened("narrative-audit");
    expect(auditNarrative(game, "我首先驾驶机甲出发，这意味着未来已经改变。").length).toBeGreaterThanOrEqual(3);
    game.view.narrative.push({ id: "repeat-source", kind: "narration", text: "负责新生的老师把课表压在桌角，让每个人按名字领取。走廊里的说话声一阵高过一阵，谁也没有围着主角停下。", createdAt: new Date().toISOString() });
    expect(auditNarrative(game, "负责新生的老师把课表压在桌角，让每个人按名字领取。走廊里的说话声一阵高过一阵，谁也没有围着主角停下。")).toContain("正文重复近期已经出现的多句完整叙述");
    game.view.hunting = { stage: "需求", ringIndex: 1, recommendations: [], preparation: [], trailProgress: "责任已确认", support: { route: "家庭筹备", responsibleParty: "监护人", fundingSource: "家庭", authorization: "待许可", sponsorBudget: 0, sponsorSpent: 0, obligations: [], evidence: [], status: "已确认" } };
    expect(auditNarrative(game, "他又一次重新复测觉醒水晶，仿佛学院生活从未发生。")).toContain("成长阶段已经推进，正文却重复觉醒复测流程");
  });

  it("行动后会写入故事手记和连续性状态", () => {
    const game = awakened("story-archive");
    const resolution = resolveAction(game, "冥想修炼");
    applyActionResult(game, "冥想修炼", resolution, resolution.fallbackNarrative, resolution.suggestions);
    expect(game.view.storyArchive.recentConsequences[0].action).toBe("冥想修炼");
    expect(game.view.storyArchive.continuity.some((item) => item.label === "原作")).toBe(true);
  });

  it("家庭、住所与三级地图都有可游玩的具体结构", () => {
    const structures = new Set<string>();
    for (let index = 0; index < 80; index += 1) {
      const game = createGame({ gender: "男", difficulty: "标准", seed: `household-${index}` });
      for (const candidate of game.view.candidates) {
        structures.add(candidate.household.structure);
        expect(candidate.residence.room.length).toBeGreaterThan(1);
        expect(candidate.dwelling.split(" · ").length).toBeGreaterThanOrEqual(3);
      }
    }
    expect(structures.size).toBeGreaterThanOrEqual(10);
    const game = awakened("map-levels");
    expect(new Set(game.view.mapHierarchy.nodes.map((node) => node.level))).toEqual(new Set(["大陆", "聚居地", "建筑"]));
  });

  it("情报记录来源、可信度与时效，而不是直接泄露全知信息", () => {
    const game = awakened("intel-ledger");
    resolveAction(game, "调查当前位置的治安和路线");
    expect(game.view.intelligence.length).toBeGreaterThan(0);
    expect(game.view.intelligence[0].source.length).toBeGreaterThan(0);
    expect(game.view.intelligence[0].confidence).toBeLessThanOrEqual(100);
    expect(["确定", "推测", "传闻", "矛盾"]).toContain(game.view.intelligence[0].status);
  });

  it("公开履约会经现场见证者延迟传播到地区口碑和同势力NPC记忆", () => {
    const game = awakened("social-rumor-propagation");
    game.view.locationId = "notting-city";
    game.view.location = "诺丁城";
    for (const npc of Object.values(game.world.npcs)) if (npc.alive) npc.locationId = "heaven-dou-city";
    const witness = game.world.npcs["tang-san"];
    const recipient = game.world.npcs["xiao-wu"];
    witness.alive = true; witness.locationId = "notting-city"; witness.factionIds = ["test-guild"];
    recipient.alive = true; recipient.locationId = "suotuo-city"; recipient.factionIds = ["test-guild"];
    recordCanonInfluence(game, { source: "测试中的已发生组织关系", description: "两名见证者已经加入同一地方行会", affectedNpcIds: [witness.id, recipient.id], affectedFactionIds: ["test-guild"], strength: 2 });
    const publicDelivery = { intent: "交付悬赏", minutes: 60, ruleSummary: "凭公开验收记录完成悬赏并成功履约。", fallbackNarrative: "委托方核过证据后盖章。", suggestions: ["查看回单"] };

    applyActionResult(game, "在诺丁城公开交付悬赏", publicDelivery, publicDelivery.fallbackNarrative, publicDelivery.suggestions);
    expect(game.world.socialRumors).toHaveLength(1);
    expect(game.world.socialRumors[0]).toMatchObject({ publicName: game.view.character!.name, status: "待传播", witnessNpcIds: ["tang-san"] });
    expect(recipient.episodicMemory.some((memory) => memory.source === "传闻传播")).toBe(false);

    advanceWorldTime(game, 4 * 1_440);
    expect(game.world.socialRumors[0].status).toBe("已传播");
    expect(game.view.reputations.find((item) => item.scope === "诺丁城" && item.publicName === game.view.character!.name)?.reputation).toContain("正面");
    expect(recipient.episodicMemory.at(-1)).toMatchObject({ source: "传闻传播", witnessed: false });
    expect(game.view.news.some((item) => item.title === "诺丁城口碑变化")).toBe(true);
  });

  it("秘密行动不凭空传播，地方化名的公开履历也不会自动合并到真名", () => {
    const secret = awakened("secret-rumor-boundary");
    const witness = secret.world.npcs["tang-san"];
    witness.alive = true; witness.locationId = secret.view.locationId!;
    const hiddenHelp = { intent: "救助成功", minutes: 30, ruleSummary: "救助成功。", fallbackNarrative: "没有人看见这次救助。", suggestions: ["离开"] };
    applyActionResult(secret, "暗中无人知晓地救助伤者", hiddenHelp, hiddenHelp.fallbackNarrative, hiddenHelp.suggestions);
    expect(secret.world.socialRumors).toHaveLength(0);

    const aliasGame = awakened("alias-rumor-boundary");
    const disguise = resolveAction(aliasGame, "化名为青禾");
    applyActionResult(aliasGame, "化名为青禾", disguise, disguise.fallbackNarrative, disguise.suggestions);
    const delivery = { intent: "交付运输合同", minutes: 60, ruleSummary: "公开登记并完成运输合同。", fallbackNarrative: "收货行按化名签发回单。", suggestions: ["查看回单"] };
    applyActionResult(aliasGame, "公开交付运输合同", delivery, delivery.fallbackNarrative, delivery.suggestions);
    expect(aliasGame.world.socialRumors.at(-1)?.publicName).toBe("青禾");
    advanceWorldTime(aliasGame, 4 * 1_440);
    expect(aliasGame.view.reputations.some((item) => item.publicName === "青禾" && /正面|认可/.test(item.reputation))).toBe(true);
    expect(aliasGame.view.reputations.some((item) => item.publicName === aliasGame.view.character!.name && /正面|认可/.test(item.reputation))).toBe(false);
    expect(resolveAction(aliasGame, "恢复真名").intent).toBe("恢复真名");
  });

  it("斗三地方口碑与跨地区媒体分阶段传播，并保留来源和可信度", () => {
    const game = awakenedInEra(3, "media-propagation-delay");
    for (const npc of Object.values(game.world.npcs)) npc.locationId = "offscreen-test";
    for (const [index, npc] of Object.values(game.world.npcs).slice(0, 6).entries()) {
      npc.alive = true;
      npc.currentGoal = "为亲历事件作证";
      npc.locationId = game.view.locationId!;
      npc.factionIds = [index % 2 ? "spirit-hall" : "shrek"];
    }
    const crime = { intent: "违法行动", minutes: 30, ruleSummary: "行动失败，现场留下可辨认痕迹。", fallbackNarrative: "守卫记录了现场。", suggestions: ["离开"] };
    applyActionResult(game, "在街口公开抢劫", crime, crime.fallbackNarrative, crime.suggestions);
    const rumor = game.world.socialRumors[0];
    expect(rumor).toMatchObject({ sourceKind: "现场目击", mediaStatus: "待刊发", mediaChannel: "大陆魂导传媒", mediaOutlet: "大陆魂导传媒公共频道", editorialStance: "跨城公共安全", verificationStatus: "跨关系网交叉核验", corroborationCount: 6 });

    advanceWorldTime(game, 4 * 1_440);
    expect(rumor.status).toBe("已传播");
    expect(rumor.mediaStatus).toBe("待刊发");
    expect(game.view.news.some((item) => item.id === `${rumor.id}-media`)).toBe(false);
    advanceWorldTime(game, 1 * 1_440);
    expect(rumor.mediaStatus).toBe("已刊发");
    expect(game.view.news.find((item) => item.id === `${rumor.id}-media`)?.detail).toMatch(/机构立场：跨城公共安全；机构信誉：62（信誉稳定）；值班核验编辑：林简（来源信任62）；选稿依据：.+；来源：现场目击；交叉核验：跨关系网交叉核验（6项）；可信度 \d+%；覆盖：/);
    expect(game.view.mediaOutlets.find((item) => item.name === "大陆魂导传媒公共频道")).toMatchObject({ trustScore: 62, publications: 1, corrections: 0, status: "信誉稳定", responsibleEditor: { name: "林简", role: "值班核验编辑", sourceTrust: 62, handledReports: 1, responsibility: "在岗核验" } });
    expect(rumor.mediaVersions).toHaveLength(0);
    advanceWorldTime(game, 1 * 1_440);
    expect(rumor.mediaVersions?.[0]).toMatchObject({ outlet: "地方民生频道", stance: "居民影响与公共问责", verificationStatus: "关联转载核验" });
    expect(game.view.mediaOutlets.find((item) => item.name === "地方民生频道")).toMatchObject({ trustScore: 61, publications: 1, linkedReports: 1, responsibleEditor: { name: "唐芷", sourceTrust: 61, handledReports: 1 } });
    expect(game.view.news.find((item) => item.id === `${rumor.id}-secondary`)?.detail).toContain("本版本没有新增未公开事实");
    expect(game.view.mediaCompetitions[0]).toMatchObject({ sharedTopics: 1, status: "首发竞争", leader: "大陆魂导传媒公共频道", scores: { 大陆魂导传媒公共频道: 2, 地方民生频道: 1 } });
  });

  it("斗三媒体会记录拒稿原因，不把单一无组织来源自动扩散到跨地区", () => {
    const game = awakenedInEra(3, "media-editorial-rejection");
    for (const npc of Object.values(game.world.npcs)) npc.locationId = "offscreen-test";
    const witness = Object.values(game.world.npcs)[0];
    witness.alive = true;
    witness.currentGoal = "记录现场说法";
    witness.locationId = game.view.locationId!;
    witness.factionIds = [];
    const crime = { intent: "违法行动", minutes: 30, ruleSummary: "现场出现争议。", fallbackNarrative: "一名路人留下说法。", suggestions: [] };
    applyActionResult(game, "在街口公开抢劫", crime, crime.fallbackNarrative, crime.suggestions);
    const rumor = game.world.socialRumors[0];
    expect(rumor).toMatchObject({ mediaStatus: "不刊发", verificationStatus: "来源不足", corroborationCount: 1 });
    expect(rumor.editorialDecision).toContain("暂不跨地区刊发");
    advanceWorldTime(game, 30 * 1_440);
    expect(rumor.status).toBe("已传播");
    expect(game.view.news.some((item) => item.id === `${rumor.id}-media`)).toBe(false);
  });

  it("责任编辑采访只解释来源边界，补充材料必须来自访谈后的独立调查", () => {
    const game = awakenedInEra(3, "media-editor-interview");
    for (const npc of Object.values(game.world.npcs)) npc.locationId = "offscreen-test";
    for (const [index, witness] of Object.values(game.world.npcs).slice(0, 6).entries()) {
      witness.alive = true;
      witness.currentGoal = "保存现场证词";
      witness.locationId = game.view.locationId!;
      witness.factionIds = [index % 2 ? "spirit-hall" : "shrek"];
    }
    const crime = { intent: "违法行动", minutes: 30, ruleSummary: "现场出现争议并留下记录。", fallbackNarrative: "见证者提交了说法。", suggestions: [] };
    applyActionResult(game, "在街口公开抢劫", crime, crime.fallbackNarrative, crime.suggestions);
    advanceWorldTime(game, 20 * 1_440);
    const rumor = game.world.socialRumors[0];
    expect(rumor.mediaStatus).toBe("已刊发");

    const interview = resolveAction(game, "联系报道责任编辑询问选稿依据");
    expect(interview.intent).toBe("责任编辑采访");
    expect(interview.ruleSummary).toContain("采访本身不改稿、不撤稿");
    applyActionResult(game, "联系报道责任编辑询问选稿依据", interview, interview.fallbackNarrative, interview.suggestions);
    expect(resolveAction(game, "向责任编辑提交补充证据").intent).toBe("无法完成");

    const investigation = resolveAction(game, "调查报道来源和现场记录");
    applyActionResult(game, "调查报道来源和现场记录", investigation, investigation.fallbackNarrative, investigation.suggestions);
    const supplement = resolveAction(game, "向责任编辑提交补充证据");
    expect(supplement.intent).toBe("向责任编辑补充证据");
    expect(supplement.ruleSummary).toContain("是否更正或追加报道仍需单独结算");
    const editor = game.view.mediaOutlets.find((item) => item.name === "大陆魂导传媒公共频道")!.responsibleEditor!;
    expect(editor).toMatchObject({ name: "林简", interactions: 2, playerTrust: 6, sourceTrust: 63, responsibility: "在岗核验", activeRumorId: rumor.id });
    expect(editor.evidence.some((item) => item.includes("补充材料行动"))).toBe(true);
  });

  it("玩家可比较竞争媒体并把真实调查线索独家交给指定编辑", () => {
    const game = awakenedInEra(3, "media-competition-choice");
    for (const npc of Object.values(game.world.npcs)) npc.locationId = "offscreen-test";
    for (const [index, witness] of Object.values(game.world.npcs).slice(0, 6).entries()) {
      witness.alive = true;
      witness.currentGoal = "保存现场证词";
      witness.locationId = game.view.locationId!;
      witness.factionIds = [index % 2 ? "spirit-hall" : "shrek"];
    }
    const crime = { intent: "违法行动", minutes: 30, ruleSummary: "现场争议留下可核验记录。", fallbackNarrative: "两家媒体随后跟进。", suggestions: [] };
    applyActionResult(game, "在街口公开抢劫", crime, crime.fallbackNarrative, crime.suggestions);
    advanceWorldTime(game, 20 * 1_440);
    recordMediaCompetition(game, { primary: "大陆魂导传媒公共频道", secondary: "地方民生频道", primaryDelta: 0, secondaryDelta: 0, newTopic: true, topicId: "market-supply-topic", topic: "外城药材供应中断", status: "核验拉锯", evidence: "第二个跨地区议题由公开市场登记形成，尚未决定优先级" });
    expect(game.view.mediaCompetitions[0].topics.map((topic) => topic.title)).toEqual(expect.arrayContaining(["外城药材供应中断", expect.stringContaining("违法行动")]));

    const comparison = resolveAction(game, "对比两家媒体的报道与核验记录");
    expect(comparison.intent).toBe("对比媒体竞争记录");
    expect(comparison.ruleSummary).toContain("分数来自首发、透明转载、独立补证与更正责任");
    applyActionResult(game, "对比两家媒体的报道与核验记录", comparison, comparison.fallbackNarrative, comparison.suggestions);

    expect(resolveAction(game, "提议大陆魂导传媒公共频道与地方民生频道建立跨地区核验联盟").intent).toBe("提议跨地区媒体联盟");
    expect(game.view.mediaAlliances[0]).toMatchObject({ status: "提议中", sharedVerificationPool: 0 });
    expect(resolveAction(game, "与两家责任编辑协商启动共享核验资源").intent).toBe("无法完成");

    const primaryInterview = resolveAction(game, "联系林简责任编辑询问选稿依据");
    applyActionResult(game, "联系林简责任编辑询问选稿依据", primaryInterview, primaryInterview.fallbackNarrative, primaryInterview.suggestions);
    expect(resolveAction(game, "与两家责任编辑协商启动共享核验资源").intent).toBe("无法完成");

    const interview = resolveAction(game, "联系唐芷责任编辑询问选稿依据");
    expect(interview.ruleSummary).toContain("唐芷");
    applyActionResult(game, "联系唐芷责任编辑询问选稿依据", interview, interview.fallbackNarrative, interview.suggestions);
    expect(resolveAction(game, "与两家责任编辑协商启动共享核验资源").intent).toBe("启动媒体核验联盟");
    const alliance = game.view.mediaAlliances[0];
    expect(alliance).toMatchObject({ status: "试运行", sharedVerificationPool: 2 });
    const registration = resolveAction(game, "登记第三家媒体候选");
    expect(registration.intent).toBe("登记第三媒体联盟候选");
    applyActionResult(game, "登记第三家媒体候选", registration, registration.fallbackNarrative, registration.suggestions);
    expect(alliance.membershipApplications?.[0]).toMatchObject({ outlet: "大陆独立事实核验站", editorName: "裴真", status: "候选核验" });
    expect(resolveAction(game, "批准第三家媒体加入联盟").intent).toBe("无法完成");
    for (const editorName of ["林简", "唐芷", "裴真"]) {
      const review = resolveAction(game, `联系${editorName}责任编辑复核第三家准入`);
      applyActionResult(game, `联系${editorName}责任编辑复核第三家准入`, review, review.fallbackNarrative, review.suggestions);
    }
    expect(resolveAction(game, "批准第三家媒体加入联盟").intent).toBe("无法完成");
    const candidateInvestigation = resolveAction(game, "调查候选机构的独立来源记录");
    applyActionResult(game, "调查候选机构的独立来源记录", candidateInvestigation, candidateInvestigation.fallbackNarrative, candidateInvestigation.suggestions);
    expect(resolveAction(game, "批准第三家媒体加入联盟").intent).toBe("批准第三媒体加入联盟");
    expect(alliance).toMatchObject({ outlets: ["大陆魂导传媒公共频道", "地方民生频道", "大陆独立事实核验站"], sharedVerificationPool: 3 });
    expect(alliance.membershipApplications?.[0].status).toBe("已加入");
    expect(resolveAction(game, "把外城药材供应中断设为联盟优先议题").intent).toBe("设置媒体联盟议程");
    expect(alliance).toMatchObject({ status: "资源冲突", sharedVerificationPool: 3, priorityAgendaId: "market-supply-topic" });
    expect(alliance.delayedAgendaIds).toHaveLength(1);
    expect(resolveAction(game, "让媒体联盟共同核验优先议题").intent).toBe("媒体联盟共同核验");
    expect(alliance).toMatchObject({ sharedVerificationPool: 2 });
    expect(alliance.agendas.find((agenda) => agenda.id === "market-supply-topic")?.status).toBe("共同核验");
    expect(game.view.mediaOutlets.find((outlet) => outlet.name === "大陆魂导传媒公共频道")?.trustScore).toBe(63);
    expect(game.view.mediaOutlets.find((outlet) => outlet.name === "地方民生频道")?.trustScore).toBe(62);
    expect(game.view.mediaOutlets.find((outlet) => outlet.name === "大陆独立事实核验站")?.trustScore).toBe(61);
    const investigation = resolveAction(game, "调查报道来源和现场记录");
    applyActionResult(game, "调查报道来源和现场记录", investigation, investigation.fallbackNarrative, investigation.suggestions);
    const exclusive = resolveAction(game, "向唐芷责任编辑提交独家补充证据");
    expect(exclusive.intent).toBe("提交独家媒体线索");
    expect(exclusive.ruleSummary).toContain("取得线索优势");
    expect(game.view.mediaCompetitions[0]).toMatchObject({ status: "核验拉锯", leader: "地方民生频道", playerChoice: "地方民生频道", scores: { 大陆魂导传媒公共频道: 3, 地方民生频道: 5 } });

    const exitRequest = resolveAction(game, "登记大陆独立事实核验站退出联盟申请");
    expect(exitRequest.intent).toBe("登记媒体联盟成员退出");
    applyActionResult(game, "登记大陆独立事实核验站退出联盟申请", exitRequest, exitRequest.fallbackNarrative, exitRequest.suggestions);
    expect(alliance.departures?.[0]).toMatchObject({ outlet: "大陆独立事实核验站", editorName: "裴真", status: "待退出复核" });
    expect(resolveAction(game, "批准大陆独立事实核验站退出联盟").intent).toBe("无法完成");
    for (const editorName of ["林简", "唐芷", "裴真"]) {
      const review = resolveAction(game, `联系${editorName}责任编辑复核退出责任`);
      applyActionResult(game, `联系${editorName}责任编辑复核退出责任`, review, review.fallbackNarrative, review.suggestions);
    }
    const approvedExit = resolveAction(game, "批准大陆独立事实核验站退出联盟");
    expect(approvedExit.intent).toBe("批准媒体联盟成员退出");
    applyActionResult(game, "批准大陆独立事实核验站退出联盟", approvedExit, approvedExit.fallbackNarrative, approvedExit.suggestions);
    expect(alliance).toMatchObject({ outlets: ["大陆魂导传媒公共频道", "地方民生频道"], status: "成员不足", sharedVerificationPool: 2, minimumMembers: 3 });
    expect(alliance.departures?.[0]).toMatchObject({ status: "已退出" });
    expect(game.view.mediaOutlets.find((outlet) => outlet.name === "大陆独立事实核验站")?.responsibleEditor?.name).toBe("裴真");
    expect(resolveAction(game, "让媒体联盟共同核验优先议题").intent).toBe("无法完成");

    const replacementRegistration = resolveAction(game, "登记替补媒体候选");
    expect(replacementRegistration.intent).toBe("登记媒体联盟替补候选");
    applyActionResult(game, "登记替补媒体候选", replacementRegistration, replacementRegistration.fallbackNarrative, replacementRegistration.suggestions);
    expect(alliance.membershipApplications?.at(-1)).toMatchObject({ outlet: "联邦公共查证协作社", editorName: "乔衡", status: "替补核验", kind: "替补", replacesOutlet: "大陆独立事实核验站" });
    expect(resolveAction(game, "批准替补媒体加入联盟").intent).toBe("无法完成");
    for (const editorName of ["林简", "唐芷", "乔衡"]) {
      const review = resolveAction(game, `联系${editorName}责任编辑复核替补准入`);
      applyActionResult(game, `联系${editorName}责任编辑复核替补准入`, review, review.fallbackNarrative, review.suggestions);
    }
    expect(resolveAction(game, "批准替补媒体加入联盟").intent).toBe("无法完成");
    const replacementInvestigation = resolveAction(game, "调查替补机构的独立来源记录");
    applyActionResult(game, "调查替补机构的独立来源记录", replacementInvestigation, replacementInvestigation.fallbackNarrative, replacementInvestigation.suggestions);
    const approvedReplacement = resolveAction(game, "批准替补媒体加入联盟");
    expect(approvedReplacement.intent).toBe("批准替补媒体加入联盟");
    expect(alliance).toMatchObject({ outlets: ["大陆魂导传媒公共频道", "地方民生频道", "联邦公共查证协作社"], status: "资源冲突", sharedVerificationPool: 2, minimumMembers: 3 });
    expect(alliance.membershipApplications?.at(-1)?.status).toBe("已加入");
    expect(approvedReplacement.ruleSummary).toContain("不继承大陆独立事实核验站的信誉、票数或历史责任");
  });

  it("斗一使用早期传播链，后世才进入各时代媒体渠道", () => {
    const earlyGame = awakened("early-circulation-era-1");
    for (const npc of Object.values(earlyGame.world.npcs)) if (npc.alive) npc.locationId = "heaven-dou-city";
    const earlyWitness = earlyGame.world.npcs["tang-san"];
    earlyWitness.alive = true; earlyWitness.locationId = earlyGame.view.locationId!; earlyWitness.factionIds = ["spirit-hall"];
    const earlyDelivery = { intent: "交付悬赏", minutes: 30, ruleSummary: "公开登记并完成悬赏。", fallbackNarrative: "登记处签发回单。", suggestions: [] };
    applyActionResult(earlyGame, "公开交付悬赏", earlyDelivery, earlyDelivery.fallbackNarrative, earlyDelivery.suggestions);
    expect(earlyGame.world.socialRumors[0]).toMatchObject({ earlyCirculationChannel: "势力通告", earlyCirculationStatus: "待扩散", sourceKind: "公开登记", confidence: 92, verificationStatus: "双记录核验", corroborationCount: 2 });
    expect(earlyGame.world.socialRumors[0].mediaStatus).toBeUndefined();
    expect(earlyGame.view.mediaOutlets).toEqual([]);
    expect(resolveAction(earlyGame, "联系责任编辑要求更正").ruleSummary).toContain("斗一时代没有");
    advanceWorldTime(earlyGame, 20 * 1_440);
    expect(earlyGame.world.socialRumors[0].earlyCirculationStatus).toBe("已扩散");
    expect(earlyGame.view.news.some((item) => item.id.endsWith("-circulation") && item.title.includes("势力通告"))).toBe(true);
    expect(earlyGame.view.mediaCompetitions).toEqual([]);
    expect(earlyGame.view.mediaAlliances).toEqual([]);

    const channels = { 2: "报刊与魂导广播", 3: "大陆魂导传媒", 4: "联邦公共信息网" } as const;
    const outlets = { 2: "地方魂师报刊编辑部", 3: "联邦事务公报编辑部", 4: "联邦公共信息网" } as const;
    for (const era of [2, 3, 4] as const) {
      const game = createGame({ era, gender: "男", difficulty: "标准", personality, seed: `media-era-${era}` });
      selectCandidate(game, game.view.candidates[0].id);
      finalizeCharacterShaping(game, { keywords: personality.keywords, answers: personality.answers });
      awakenCharacter(game);
      const delivery = { intent: "交付悬赏", minutes: 30, ruleSummary: "公开登记并完成悬赏。", fallbackNarrative: "登记处签发回单。", suggestions: [] };
      applyActionResult(game, "公开交付悬赏", delivery, delivery.fallbackNarrative, delivery.suggestions);
      expect(game.world.socialRumors[0]).toMatchObject({ mediaChannel: channels[era], mediaOutlet: outlets[era], sourceKind: "公开登记", confidence: 92, mediaStatus: "待刊发", verificationStatus: "双记录核验", corroborationCount: 2 });
    }
  });

  it("斗一旧存档会把媒体误植迁移为早期传播痕迹", () => {
    const game = awakened("legacy-era-one-media-migration");
    game.schemaVersion = 26;
    game.world.socialRumors.push({ id: "legacy-media-rumor", publicName: game.view.character!.name, locationId: game.view.locationId!, summary: "旧版误植消息", valence: -1, witnessNpcIds: [], factionIds: [], createdOrdinal: 1, spreadsAtOrdinal: 2, status: "已传播", sourceKind: "公开登记", mediaChannel: "城市告示与商会公报", mediaOutlet: "城市告示处", editorialStance: "地方治安", editorialDecision: "旧版选稿", mediaSpreadsAtOrdinal: 3, mediaStatus: "已刊发", mediaVersions: [{ id: "legacy-secondary", outlet: "行旅商讯抄报", stance: "商路影响", framing: "旧版转载", confidence: 60, verificationStatus: "关联转载核验", publishedOrdinal: 4 }] });
    game.view.mediaOutlets = [{ name: "城市告示处", stance: "地方治安", trustScore: 60, publications: 1, corrections: 0, linkedReports: 0, status: "信誉稳定", evidence: [] }];
    game.view.mediaCompetitions = [{ id: "legacy-competition", outlets: ["城市告示处", "行旅商讯抄报"], scores: {}, sharedTopics: 0, status: "并列观察", evidence: [], topics: [] }];
    game.view.mediaAlliances = [{ id: "legacy-alliance", name: "旧版联盟", competitionId: "legacy-competition", outlets: ["城市告示处", "行旅商讯抄报"], status: "试运行", sharedVerificationPool: 1, delayedAgendaIds: [], agendas: [], evidence: [] }];
    game.view.news.unshift({ id: "legacy-media-rumor-media", title: "旧版媒体报道", detail: "旧版责任编辑与编辑部记录", date: "旧存档" });

    ensureGameState(game);

    const rumor = game.world.socialRumors.find((item) => item.id === "legacy-media-rumor")!;
    expect(rumor).toMatchObject({ earlyCirculationChannel: "地方告示", earlyCirculationStatus: "已扩散" });
    expect(rumor.mediaOutlet).toBeUndefined();
    expect(rumor.mediaVersions).toBeUndefined();
    expect(game.view.mediaOutlets).toEqual([]);
    expect(game.view.mediaCompetitions).toEqual([]);
    expect(game.view.mediaAlliances).toEqual([]);
    expect(game.view.news[0]).toMatchObject({ title: "旧版传播记录已校正" });
  });

  it("斗二至斗四的第三媒体候选都有独立机构立场和具名责任编辑", () => {
    const expected = {
      2: ["魂导公共查证台", "苏澄"],
      3: ["大陆独立事实核验站", "裴真"],
      4: ["星域公共证据联合站", "罗序"],
    } as const;
    for (const era of [2, 3, 4] as const) {
      const game = createGame({ era, gender: "男", difficulty: "标准", personality, seed: `alliance-candidate-era-${era}` });
      selectCandidate(game, game.view.candidates[0].id);
      finalizeCharacterShaping(game, { keywords: personality.keywords, answers: personality.answers });
      awakenCharacter(game);
      for (const name of ["测试首发机构", "测试关联机构"]) recordMediaOutletReputation(game, { name, stance: "测试来源责任", trustDelta: 0, evidence: "测试联盟既有成员" });
      game.view.mediaAlliances = [{ id: `era-${era}-alliance`, name: "测试跨地区核验联盟", competitionId: "test-competition", outlets: ["测试首发机构", "测试关联机构"], status: "试运行", sharedVerificationPool: 1, delayedAgendaIds: [], agendas: [], membershipApplications: [], evidence: [] }];
      expect(resolveAction(game, "登记第三家媒体候选").intent).toBe("登记第三媒体联盟候选");
      const [outletName, editorName] = expected[era];
      expect(game.view.mediaAlliances[0].membershipApplications?.[0]).toMatchObject({ outlet: outletName, editorName, status: "候选核验" });
      expect(game.view.mediaOutlets.find((outlet) => outlet.name === outletName)?.responsibleEditor?.name).toBe(editorName);
    }
  });

  it("斗二至斗四的联盟替补都有独立机构、编辑和不继承旧责的登记", () => {
    const expected = {
      2: ["联城魂导证据台", "卓宁"],
      3: ["联邦公共查证协作社", "乔衡"],
      4: ["星海独立档案节点", "卫岚"],
    } as const;
    for (const era of [2, 3, 4] as const) {
      const game = createGame({ era, gender: "男", difficulty: "标准", personality, seed: `alliance-replacement-era-${era}` });
      selectCandidate(game, game.view.candidates[0].id);
      finalizeCharacterShaping(game, { keywords: personality.keywords, answers: personality.answers });
      awakenCharacter(game);
      for (const name of ["测试留任机构甲", "测试留任机构乙"]) recordMediaOutletReputation(game, { name, stance: "测试来源责任", trustDelta: 0, evidence: "测试替补既有成员" });
      game.view.mediaAlliances = [{ id: `era-${era}-replacement`, name: "测试联盟（待替补）", competitionId: "test-competition", outlets: ["测试留任机构甲", "测试留任机构乙"], status: "成员不足", sharedVerificationPool: 2, minimumMembers: 3, statusBeforeMemberShortage: "试运行", delayedAgendaIds: [], agendas: [], departures: [{ outlet: "测试退出机构", editorName: "旧责编辑", status: "已退出", requestedAtActionIndex: 1, approvedAtActionIndex: 2, interactionCounts: {}, evidence: ["既往责任保留"] }], membershipApplications: [], evidence: [] }];
      const registration = resolveAction(game, "登记替补媒体候选");
      expect(registration.intent).toBe("登记媒体联盟替补候选");
      const [outletName, editorName] = expected[era];
      expect(game.view.mediaAlliances[0].membershipApplications?.[0]).toMatchObject({ outlet: outletName, editorName, status: "替补核验", kind: "替补", replacesOutlet: "测试退出机构" });
      expect(game.view.mediaOutlets.find((outlet) => outlet.name === outletName)?.responsibleEditor?.name).toBe(editorName);
      expect(game.view.mediaAlliances[0].sharedVerificationPool).toBe(2);
      expect(registration.ruleSummary).toContain("不继承退出机构的信誉、议题票数或责任");
    }
  });

  it("公开澄清必须先登记核验并提交后续调查证据，且不会抹除旧消息", () => {
    const game = awakenedInEra(3, "media-correction-evidence");
    for (const npc of Object.values(game.world.npcs)) npc.locationId = "offscreen-test";
    for (const [index, witness] of Object.values(game.world.npcs).slice(0, 6).entries()) {
      witness.alive = true;
      witness.currentGoal = "保留现场证词";
      witness.locationId = game.view.locationId!;
      witness.factionIds = [index % 2 ? "spirit-hall" : "shrek"];
    }
    const crime = { intent: "违法行动", minutes: 30, ruleSummary: "行动受到质疑。", fallbackNarrative: "有人留下了说法。", suggestions: [] };
    applyActionResult(game, "在街口公开抢劫", crime, crime.fallbackNarrative, crime.suggestions);
    advanceWorldTime(game, 4 * 1_440);
    const rumor = game.world.socialRumors[0];
    expect(resolveAction(game, "提交证据公开澄清负面传闻").intent).toBe("无法完成");
    advanceWorldTime(game, 20 * 1_440);
    expect(rumor.mediaVersions).toHaveLength(1);
    recordMediaCompetition(game, { primary: "大陆魂导传媒公共频道", secondary: "地方民生频道", primaryDelta: 0, secondaryDelta: 0, newTopic: true, topicId: "recovery-supply-topic", topic: "外城药材供应中断", status: "核验拉锯", evidence: "独立市场登记形成第二议题" });
    const comparison = resolveAction(game, "对比两家媒体的报道与核验记录");
    applyActionResult(game, "对比两家媒体的报道与核验记录", comparison, comparison.fallbackNarrative, comparison.suggestions);
    expect(resolveAction(game, "提议大陆魂导传媒公共频道与地方民生频道建立跨地区核验联盟").intent).toBe("提议跨地区媒体联盟");
    for (const editorName of ["林简", "唐芷"]) {
      const interview = resolveAction(game, `联系${editorName}责任编辑询问选稿依据`);
      applyActionResult(game, `联系${editorName}责任编辑询问选稿依据`, interview, interview.fallbackNarrative, interview.suggestions);
    }
    expect(resolveAction(game, "与两家责任编辑协商启动共享核验资源").intent).toBe("启动媒体核验联盟");

    const audit = resolveAction(game, "申请核验负面传闻");
    applyActionResult(game, "申请核验负面传闻", audit, audit.fallbackNarrative, audit.suggestions);
    expect(resolveAction(game, "提交证据公开澄清负面传闻").intent).toBe("无法完成");
    const investigation = resolveAction(game, "调查消息来源和现场记录");
    applyActionResult(game, "调查消息来源和现场记录", investigation, investigation.fallbackNarrative, investigation.suggestions);
    const correction = resolveAction(game, "提交调查证据公开澄清负面传闻");
    expect(correction.intent).toBe("证据化媒体更正");
    expect(rumor.mediaStatus).toBe("已更正");
    expect(rumor.correctionEvidence).toHaveLength(1);
    expect(rumor.verificationStatus).toBe("更正证据已核验");
    expect(rumor.mediaVersions?.[0]).toMatchObject({ verificationStatus: "更正证据已核验" });
    expect(game.view.mediaOutlets.find((item) => item.name === "大陆魂导传媒公共频道")).toMatchObject({ trustScore: 54, corrections: 1, status: "待观察", responsibleEditor: { name: "林简", sourceTrust: 54, responsibility: "已签发更正" } });
    expect(game.view.mediaOutlets.find((item) => item.name === "地方民生频道")).toMatchObject({ trustScore: 57, corrections: 1, linkedReports: 1, status: "待观察", responsibleEditor: { name: "唐芷", sourceTrust: 57, responsibility: "已签发更正" } });
    expect(game.view.mediaCompetitions[0]).toMatchObject({ status: "更正问责", leader: "地方民生频道", scores: { 大陆魂导传媒公共频道: -2, 地方民生频道: 2 } });
    expect(game.view.news.find((item) => item.id === `${rumor.id}-correction`)?.detail).toContain("林简签发更正");
    expect(game.view.news.some((item) => item.id === `${rumor.id}-correction`)).toBe(true);
    expect(game.view.news.some((item) => item.id === rumor.id)).toBe(true);
    const alliance = game.view.mediaAlliances[0];
    expect(alliance).toMatchObject({ status: "暂停合作", sharedVerificationPool: 0, suspendedOutletNames: ["大陆魂导传媒公共频道", "地方民生频道"] });
    const repair = resolveAction(game, "登记媒体联盟修复计划");
    expect(repair.intent).toBe("登记媒体联盟修复计划");
    applyActionResult(game, "登记媒体联盟修复计划", repair, repair.fallbackNarrative, repair.suggestions);
    expect(alliance).toMatchObject({ status: "修复审核", sharedVerificationPool: 0 });
    expect(resolveAction(game, "提交媒体联盟恢复复核").intent).toBe("无法完成");
    for (const editorName of ["林简", "唐芷"]) {
      const interview = resolveAction(game, `联系${editorName}责任编辑询问选稿依据`);
      applyActionResult(game, `联系${editorName}责任编辑询问选稿依据`, interview, interview.fallbackNarrative, interview.suggestions);
    }
    expect(resolveAction(game, "提交媒体联盟恢复复核").intent).toBe("无法完成");
    for (const investigationAction of ["调查更正后的来源登记", "调查外城药材供应记录"]) {
      const investigation = resolveAction(game, investigationAction);
      applyActionResult(game, investigationAction, investigation, investigation.fallbackNarrative, investigation.suggestions);
    }
    const recovery = resolveAction(game, "提交媒体联盟恢复复核");
    expect(recovery.intent).toBe("媒体联盟受限恢复");
    expect(alliance).toMatchObject({ status: "受限恢复", sharedVerificationPool: 1, probationVerificationsRemaining: 1 });
    expect(resolveAction(game, "把外城药材供应中断设为联盟优先议题").intent).toBe("设置媒体联盟议程");
    expect(resolveAction(game, "让媒体联盟共同核验优先议题").intent).toBe("媒体联盟观察期核验");
    expect(alliance).toMatchObject({ status: "试运行", sharedVerificationPool: 0, probationVerificationsRemaining: 0 });
    expect(game.view.mediaOutlets.find((item) => item.name === "大陆魂导传媒公共频道")?.trustScore).toBe(58);
    expect(game.view.mediaOutlets.find((item) => item.name === "地方民生频道")?.trustScore).toBe(61);
    expect(resolveAction(game, "让媒体联盟共同核验优先议题").intent).toBe("无法完成");
    expect(resolveAction(game, "申请补充媒体联盟核验资源").intent).toBe("无法完成");
    for (const editorName of ["林简", "唐芷"]) {
      const interview = resolveAction(game, `联系${editorName}责任编辑询问选稿依据`);
      applyActionResult(game, `联系${editorName}责任编辑询问选稿依据`, interview, interview.fallbackNarrative, interview.suggestions);
    }
    expect(resolveAction(game, "申请补充媒体联盟核验资源").intent).toBe("无法完成");
    for (const investigationAction of ["调查联盟耗尽后的异地回函", "调查联盟耗尽后的另一来源"]) {
      const investigation = resolveAction(game, investigationAction);
      applyActionResult(game, investigationAction, investigation, investigation.fallbackNarrative, investigation.suggestions);
    }
    const refill = resolveAction(game, "申请补充媒体联盟核验资源");
    expect(refill.intent).toBe("补充媒体联盟核验资源");
    expect(alliance).toMatchObject({ sharedVerificationPool: 1, resourceRefillCount: 1, resourceDepletedAtActionIndex: undefined });
    const remainingAgenda = alliance.agendas.find((agenda) => agenda.status !== "共同核验")!;
    expect(resolveAction(game, `把${remainingAgenda.title}设为联盟优先议题`).intent).toBe("设置媒体联盟议程");
    expect(resolveAction(game, "让媒体联盟共同核验优先议题").intent).toBe("媒体联盟共同核验");
    expect(alliance).toMatchObject({ sharedVerificationPool: 0, resourceRefillCount: 1 });
    expect(alliance.resourceDepletedAtActionIndex).toBeTypeOf("number");
  });

  it("死亡的重要NPC不会在年度模拟中随机复活", () => {
    const game = awakened("no-random-revival");
    const npc = game.world.npcs["tang-san"];
    npc.alive = false;
    npc.knownToPlayer = true;
    recordCanonInfluence(game, { source: "测试", description: "影响唐三", affectedNpcIds: ["tang-san"], strength: 80 });
    advanceWorldTime(game, 3 * 360 * 1440);
    expect(npc.alive).toBe(false);
    expect(game.view.news.some((item) => item.id.includes("revival"))).toBe(false);
  });

  it("玩家关系以多维数值和明确原因变化", () => {
    const game = awakened("relation-evidence");
    game.world.npcs["tang-san"].locationId = game.view.locationId!;
    resolveAction(game, "询问唐三最近在做什么");
    resolveAction(game, "继续与唐三交谈修炼安排");
    const relation = game.view.relations.find((item) => item.id === "tang-san")!;
    expect(relation.dimensions?.trust).toBeGreaterThan(0);
    expect(relation.history?.at(-1)?.reason).toContain("交谈");
  });

  it("生活职业需要材料并保存实验失败记录", () => {
    const game = awakened("profession");
    resolveAction(game, "尝试炼制药剂");
    const profession = game.view.professions.find((item) => item.name === "炼药")!;
    expect(profession.experiments).toBe(1);
    game.view.inventory.push("普通止血草");
    resolveAction(game, "继续实验炼制药剂");
    expect(profession.experiments).toBe(2);
    expect(profession.progress).toBeGreaterThan(0);
  });

  it("经济系统记录存款、债务和悬赏的自然报酬", () => {
    const game = awakened("economy");
    game.view.character!.coins = 0;
    expect(resolveAction(game, "存钱").intent).toBe("无法完成");
    expect(resolveAction(game, "取钱").intent).toBe("无法完成");
    expect(game.view.character!.coins).toBe(0);
    game.view.character!.coins = 50;
    resolveAction(game, "存钱20金魂币");
    expect(game.view.economy.bankBalance).toBe(20);
    resolveAction(game, "借钱");
    expect(game.view.economy.debt).toBeGreaterThan(0);
    expect(game.view.economy.transactions.map((item) => item.kind)).toEqual(["存款", "借贷"]);
    expect(game.view.economy.transactions.at(-1)?.balance).toBe(game.view.character!.coins);
    resolveAction(game, "接受当地公开悬赏");
    expect(game.view.tasks.some((task) => task.kind === "悬赏")).toBe(true);
  });

  it("未成年只能承接安全短工，工钱与雇主关系都有证据", () => {
    const game = awakened("child-work");
    expect(game.view.character!.age).toBe(6);
    const startingCoins = game.view.character!.coins;
    expect(resolveAction(game, "去矿井上夜班做重体力工作").intent).toBe("无法完成");
    expect(game.view.character!.coins).toBe(startingCoins);

    const first = resolveAction(game, "去店铺打工赚钱");
    expect(first.intent).toBe("工作");
    expect(game.view.character!.coins).toBeGreaterThan(startingCoins);
    expect(game.view.economy.transactions.at(-1)).toMatchObject({ kind: "收入", balance: game.view.character!.coins });
    const employer = game.view.relations.find((item) => item.id === `employer-${game.view.locationId}`)!;
    expect(employer.relation).toContain("雇佣");
    expect(employer.history).toHaveLength(1);

    resolveAction(game, "继续去店铺干活");
    expect(employer.history).toHaveLength(2);
    expect(employer.dimensions!.trust).toBeGreaterThan(6);
  });

  it("采购写入支出流水且账面余额与钱袋一致", () => {
    const game = awakened("purchase-ledger");
    game.view.character!.coins = 30;
    resolveAction(game, "购买止血药");
    expect(game.view.inventory).toContain("外敷伤药");
    expect(game.view.economy.transactions.at(-1)).toMatchObject({ kind: "支出", counterparty: expect.stringContaining("商铺") });
    expect(game.view.economy.transactions.at(-1)?.balance).toBe(game.view.character!.coins);
  });

  it("区域供需改变价格并让经营留下进货与销售盈亏", () => {
    const village = awakened("market-village");
    village.view.locationId = "holy-soul-village";
    village.view.location = "圣魂村";
    expect(resolveAction(village, "调查药材市场行情").intent).toBe("调查市场");
    const villageHerbs = village.view.economy.marketReports.find((item) => item.category === "药材")!;
    expect(villageHerbs.supply).toBeGreaterThan(villageHerbs.demand);
    expect(villageHerbs.priceIndex).toBeLessThan(100);

    village.view.character!.coins = 100;
    const business = resolveAction(village, "经营药材商铺生意");
    expect(business.ruleSummary).toMatch(/盈利|亏损/);
    expect(village.view.economy.transactions.slice(-2).map((item) => item.kind)).toEqual(["投资", "收入"]);
    expect(village.view.economy.transactions.at(-1)?.balance).toBe(village.view.character!.coins);
  });

  it("跨区域运输合同先占用周转金和运力，抵达后才按货损与期限结算", () => {
    const game = awakened("logistics-contract");
    game.view.locationId = "holy-soul-village";
    game.view.location = "圣魂村";
    game.world.discoveredLocations.push("holy-soul-village", "notting-city");
    game.view.map = buildMapView(game);
    game.view.character!.coins = 200;
    const before = game.view.character!.coins;

    const accepted = resolveAction(game, "承接运往诺丁城的药材运输合同");
    expect(accepted.intent).toBe("承接运输合同");
    const task = game.view.tasks.find((item) => item.kind === "运输合同")!;
    expect(task.destinationId).toBe("notting-city");
    expect(task.logistics).toMatchObject({ category: "药材", originId: "holy-soul-village", destinationId: "notting-city", cargoIntegrity: 100, mode: "陆路托运" });
    expect(game.view.character!.coins).toBeLessThan(before);
    expect(game.view.inventory).toContain(task.logistics!.cargoLabel);
    expect(game.view.economy.transactions.at(-1)?.kind).toBe("投资");
    expect(resolveAction(game, "交付运输合同").intent).toBe("无法完成");

    expect(resolveAction(game, "前往诺丁城").intent).toBe("旅行");
    const delivered = resolveAction(game, "交付运输合同货物");
    expect(delivered.intent).toBe("交付运输合同");
    expect(task.status).toBe("完成");
    expect(game.view.inventory).not.toContain(task.logistics!.cargoLabel);
    expect(game.view.character!.coins).toBeGreaterThan(before);
    expect(game.view.economy.transactions.at(-1)).toMatchObject({ kind: "收入", counterparty: expect.stringContaining("诺丁城") });
    expect(task.progressEvidence?.at(-1)).toContain("验收");
  });

  it("后世机构事务必须先行动再验收，晋升依赖贡献与履历", () => {
    const game = awakened("institution-route");
    game.view.era = 2;
    game.view.worldTime!.year = 10_010;
    game.view.character!.coins = 10_000;
    game.view.affiliations = [{ id: "sun-moon-royal-academy", name: "日月皇家魂导师学院", role: "外围成员", reputation: "生疏", joinedAt: "测试", contribution: 0, completedAssignments: 0, rankEvidence: [] }];
    const commitAction = (action: string) => {
      const result = resolveAction(game, action);
      applyActionResult(game, action, result, result.fallbackNarrative, result.suggestions);
      return result;
    };
    const receive = resolveAction(game, "向日月皇家魂导师学院领取机构事务");
    applyActionResult(game, "向日月皇家魂导师学院领取机构事务", receive, receive.fallbackNarrative, receive.suggestions);
    expect(game.view.tasks.some((item) => item.title.includes("魂导器") && item.status === "进行中")).toBe(true);
    expect(resolveAction(game, "向日月皇家魂导师学院交付机构事务").intent).toBe("无法完成");

    commitAction("学习一级魂导器核心阵法");
    expect(commitAction("向日月皇家魂导师学院推进机构事务").ruleSummary).toContain("进度 1/5");
    commitAction("购买魂导器用稀有金属");
    expect(commitAction("向日月皇家魂导师学院推进机构事务").ruleSummary).toContain("进度 2/5");
    commitAction("购买魂导核心晶体");
    expect(commitAction("向日月皇家魂导师学院推进机构事务").ruleSummary).toContain("进度 3/5");
    const institutionTask = game.view.tasks.find((item) => item.institutionAssignment)!;
    expect(institutionTask.institutionAssignment).toMatchObject({ conflictStatus: "待复核", reviewer: { factionName: "安全审查组" }, counterReviewer: { name: "明策", factionName: "工程推进组", objections: 1 } });
    expect(commitAction("提交共同复核协调方案").intent).toBe("无法完成");
    expect(commitAction("询问明序当前验收异议").intent).toBe("与机构复核人协商");
    expect(commitAction("询问明策当前验收异议").intent).toBe("与机构复核人协商");
    expect(commitAction("提交共同复核协调方案").intent).toBe("协调机构派系");
    expect(institutionTask.institutionAssignment).toMatchObject({ conflictStatus: "已协调", playerAlignment: undefined });
    expect(institutionTask.institutionAssignment!.factions?.every((faction) => faction.playerTrust === 2)).toBe(true);

    const profession = game.view.professions.find((item) => item.name === "魂导器研究")!;
    profession.progress = 100;
    game.view.relations.push({ id: "soul-tool-tutor", name: "测试魂导师", relation: "导师", impression: "监督一级制作", strength: 70, category: "师友" });
    let crafted = false;
    for (let attempt = 0; attempt < 5 && !crafted; attempt += 1) {
      if (!game.view.inventory.some((item) => /稀有金属/.test(item))) commitAction("购买魂导器用稀有金属");
      if (!game.view.inventory.some((item) => /核心晶体/.test(item))) commitAction("购买魂导核心晶体");
      crafted = commitAction("制作一级储物魂导器").ruleSummary.includes("制作成功");
    }
    expect(crafted).toBe(true);
    expect(commitAction("向日月皇家魂导师学院推进机构事务").ruleSummary).toContain("进度 4/5");
    commitAction("实验测试一级魂导器");
    expect(commitAction("向日月皇家魂导师学院推进机构事务").ruleSummary).toContain("进度 5/5");

    const delivery = resolveAction(game, "向日月皇家魂导师学院交付机构事务");
    expect(delivery.intent).toBe("交付机构事务");
    expect(delivery.ruleSummary).toContain("双复核已协调");
    expect(game.view.affiliations[0].contribution).toBeGreaterThan(0);
    expect(game.view.economy.transactions.at(-1)?.note).toContain("验收报酬");
    expect(game.view.affiliations[0].institutionFactions?.every((faction) => faction.playerTrust === 2)).toBe(true);
    expect(game.view.affiliations[0].institutionPoliticalHistory?.at(-1)).toContain("完成交付（已协调）");
    expect(commitAction("向日月皇家魂导师学院领取机构事务").intent).toBe("领取机构事务");
    const nextInstitutionTask = game.view.tasks.find((item) => item.status === "进行中" && item.institutionAssignment)!;
    expect(nextInstitutionTask.institutionAssignment).toMatchObject({ reviewer: { factionName: "安全审查组", trust: 52 }, counterReviewer: { factionName: "工程推进组", trust: 52 } });

    game.view.affiliations[0].contribution = 20;
    game.view.affiliations[0].completedAssignments = 2;
    expect(resolveAction(game, "向日月皇家魂导师学院申请晋升").intent).toBe("机构晋升");
    expect(game.view.affiliations[0].role).toBe("正式成员");
    expect(game.view.affiliations[0].rankEvidence).toHaveLength(1);
  });

  it("宗门事务会按角色能力或明确选择分支，失败尝试保留但不能冒充验收证据", () => {
    const game = awakened("sect-specialized-assignment");
    game.view.character!.martialSoul.description = "擅长精神控制、侦察与隐匿";
    game.view.character!.martialSouls[game.view.character!.activeMartialSoulIndex].description = "擅长精神控制、侦察与隐匿";
    game.view.affiliations = [{ id: "seven-treasure", name: "七宝琉璃宗", role: "外围成员", reputation: "生疏", joinedAt: "测试", contribution: 0, completedAssignments: 0, rankEvidence: [] }];
    const commit = (action: string, result = resolveAction(game, action)) => {
      applyActionResult(game, action, result, result.fallbackNarrative, result.suggestions);
      return result;
    };
    const receive = commit("向七宝琉璃宗领取机构事务");
    expect(receive.ruleSummary).toContain("分支为情报");
    const task = game.view.tasks.find((item) => item.institutionAssignment)!;
    expect(task.institutionAssignment).toMatchObject({ specialization: "情报", risk: expect.stringContaining("失败记录"), stageIndex: 0, reviewer: { name: "沈璧", role: "宗产复核执事", trust: 50, objections: 0, meetings: 0 } });

    commit("调查情报目标", { intent: "调查情报", minutes: 60, ruleSummary: "调查失败，目标没有得到核实。", fallbackNarrative: "线索在现场断了。", suggestions: ["重新调查"] });
    const rejected = resolveAction(game, "向七宝琉璃宗推进机构事务");
    expect(rejected.intent).toBe("无法完成");
    expect(rejected.ruleSummary).toContain("消耗和失败记录保留");
    expect(task.institutionAssignment!.stageIndex).toBe(0);
    expect(task.institutionAssignment!.reviewer).toMatchObject({ trust: 48, objections: 1 });
    const meeting = resolveAction(game, "询问沈璧当前验收异议");
    expect(meeting.intent).toBe("与机构复核人协商");
    expect(meeting.ruleSummary).toContain("物资去向和宗门账册");
    expect(task.institutionAssignment!.reviewer).toMatchObject({ trust: 48, objections: 1, meetings: 1 });

    commit("重新调查情报目标并核对委托对象", { intent: "调查情报", minutes: 90, ruleSummary: "调查目标完成，委托对象和知识边界已经核对。", fallbackNarrative: "这次记录能与名册对上。", suggestions: [] });
    expect(resolveAction(game, "向七宝琉璃宗推进机构事务").ruleSummary).toContain("进度 1/4");
    expect(task.institutionAssignment!.reviewer).toMatchObject({ trust: 50, objections: 1, meetings: 1 });

    commit("观察取得第一来源并查阅账册", { intent: "取得情报来源", minutes: 90, ruleSummary: "现场观察与账册形成第一来源。", fallbackNarrative: "现场记录和账册能够互相对照。", suggestions: [] });
    expect(commit("向七宝琉璃宗推进机构事务").ruleSummary).toContain("待复核");
    expect(task.institutionAssignment).toMatchObject({ conflictStatus: "待复核", counterReviewer: { name: "宁衡", factionName: "外务应变派", objections: 1 } });
    expect(commit("支持宗产审计派处理机构复核冲突").intent).toBe("选择机构派系立场");
    expect(task.institutionAssignment).toMatchObject({ conflictStatus: "保留分歧", playerAlignment: "宗产审计派" });
    expect(task.institutionAssignment!.counterReviewer).toMatchObject({ trust: 46, objections: 2 });
    expect(game.view.affiliations[0].institutionFactions).toEqual(expect.arrayContaining([expect.objectContaining({ name: "宗产审计派", playerTrust: 5, influence: 52 }), expect.objectContaining({ name: "外务应变派", playerTrust: -4, influence: 50 })]));
    expect(game.view.affiliations[0].institutionPoliticalHistory?.at(-1)).toContain("宗产审计派");

    const support = awakened("sect-explicit-support-assignment");
    support.view.affiliations = [{ id: "clear-sky", name: "昊天宗", role: "外围成员", reputation: "生疏", joinedAt: "测试", contribution: 0, completedAssignments: 0, rankEvidence: [] }];
    const supportTask = resolveAction(support, "向昊天宗领取后勤救护分支机构事务");
    expect(supportTask.ruleSummary).toContain("分支为支援");
    expect(support.view.tasks.find((item) => item.institutionAssignment)?.institutionAssignment?.reviewer).toMatchObject({ name: "唐峤", role: "封山戒律执事" });
  });

  it("连续世代档案需要分步核验且不会把历史权益变成当前资产", () => {
    const parent = awakened("inheritance-verification");
    parent.view.managedFactions.push({ id: "archive-sect", name: "青册门", role: "门主", members: 36, resources: 120, territory: ["青册谷"], departments: ["档案堂"], internalIssues: [] });
    parent.view.status = "ended";
    parent.view.runProgress.ending = "留下青册档案";
    parent.view.runProgress.settlement = { ending: "留下青册档案", baseScore: 70, multiplier: 1, legacyPoints: 70, highlights: [], qualified: true };
    const successor = createEraSuccessor(parent);
    selectCandidate(successor, successor.view.candidates[0].id);
    finalizeCharacterShaping(successor, { keywords: ["谨慎", "好学"], answers: {} });
    awakenCharacter(successor);

    expect(successor.view.managedFactions).toHaveLength(0);
    const transferEvent = successor.view.worldInheritance!.chronology.find((event) => event.kind === "档案转交")!;
    expect(transferEvent).toMatchObject({ verification: "传闻", confidence: 30 });
    expect(resolveAction(successor, `调查年表节点${transferEvent.title}`).intent).toBe("核验旧世档案");
    expect(transferEvent).toMatchObject({ verification: "部分核验", confidence: 50 });
    resolveAction(successor, `继续查证历史节点${transferEvent.title}`);
    expect(transferEvent).toMatchObject({ verification: "部分核验", confidence: 50 });
    resolveAction(successor, `再次核验年表节点${transferEvent.title}`);
    expect(transferEvent).toMatchObject({ verification: "已核验", confidence: 75 });
    const ancestor = successor.view.worldInheritance!.lineage[0];
    expect(ancestor.verification).toBe("传闻");
    expect(resolveAction(successor, `核验祖先${ancestor.name}的旧世档案`).intent).toBe("核验旧世档案");
    expect(ancestor.verification).toBe("部分核验");
    resolveAction(successor, `继续查证祖先${ancestor.name}的家谱`);
    expect(ancestor.verification).toBe("已核验");
    expect(successor.view.tasks.find((item) => item.id === "inherited-worldline")?.status).toBe("完成");
    expect(successor.view.worldInheritance!.institutions[0].verification).toBe("传闻");
  });

  it("历史权益必须调查当代权属、缴费听证并另行投资成立新主体", () => {
    const parent = awakened("inheritance-rights-hearing");
    parent.view.managedFactions.push({ id: "archive-sect", name: "青册门", role: "门主", members: 36, resources: 120, territory: ["青册谷"], departments: ["档案堂"], internalIssues: [] });
    parent.view.status = "ended";
    parent.view.runProgress.ending = "留下青册档案";
    parent.view.runProgress.settlement = { ending: "留下青册档案", baseScore: 70, multiplier: 1, legacyPoints: 70, highlights: [], qualified: true };
    const successor = createEraSuccessor(parent);
    selectCandidate(successor, successor.view.candidates[0].id);
    finalizeCharacterShaping(successor, { keywords: ["谨慎", "好学"], answers: {} });
    awakenCharacter(successor);
    successor.view.character!.coins = 100;
    const institution = successor.view.worldInheritance!.institutions[0];

    expect(resolveAction(successor, "提交青册门历史权益主张").intent).toBe("无法完成");
    resolveAction(successor, "调查核验旧世机构青册门");
    resolveAction(successor, "继续查证旧世机构青册门");
    expect(institution.verification).toBe("已核验");
    expect(resolveAction(successor, "提交青册门历史权益主张").intent).toBe("无法完成");
    expect(resolveAction(successor, "调查青册门当前产权登记").intent).toBe("调查当代权属");
    expect(resolveAction(successor, "追查青册门旧址现权利人").intent).toBe("调查当代权属");
    expect(resolveAction(successor, "提交青册门历史权益主张").intent).toBe("提交历史权益主张");
    expect(institution.claimStatus).toBe("待审理");
    expect(successor.view.character!.coins).toBe(90);
    expect(successor.view.managedFactions).toHaveLength(0);

    expect(resolveAction(successor, "参加青册门历史权益听证").intent).toBe("参加历史权益听证");
    expect(institution).toMatchObject({ claimStatus: "有限承认", recognizedRight: "旧档案查阅、复制与名称沿革说明权" });
    expect(successor.view.managedFactions).toHaveLength(0);
    expect(successor.view.economy.business).toBeUndefined();
    expect(resolveAction(successor, "以青册门旧址线索重新投资经营").intent).toBe("投资成立当代新主体");
    expect(successor.view.economy.business).toBe("青册门沿革新社");
    expect(successor.view.character!.coins).toBe(60);
    expect(successor.view.managedFactions).toHaveLength(0);
    expect(successor.view.economy.transactions.slice(-2).map((entry) => entry.kind)).toEqual(["支出", "投资"]);
  });

  it("仅存传闻的旧产业在听证中会被驳回且不能复建", () => {
    const parent = awakened("inheritance-rejected-business");
    parent.view.economy.business = "旧河药行";
    parent.view.status = "ended";
    parent.view.runProgress.ending = "留下残缺账页";
    parent.view.runProgress.settlement = { ending: "留下残缺账页", baseScore: 70, multiplier: 1, legacyPoints: 70, highlights: [], qualified: true };
    const successor = createEraSuccessor(parent);
    selectCandidate(successor, successor.view.candidates[0].id);
    finalizeCharacterShaping(successor, { keywords: ["谨慎", "好学", "耐心"], answers: {} });
    awakenCharacter(successor);
    successor.view.character!.coins = 100;
    resolveAction(successor, "调查核验旧世机构旧河药行");
    resolveAction(successor, "继续查证旧世机构旧河药行");
    resolveAction(successor, "调查旧河药行当前产权登记");
    resolveAction(successor, "追查旧河药行旧址现权利人");
    resolveAction(successor, "提交旧河药行历史权益主张");
    resolveAction(successor, "参加旧河药行历史权益听证");
    expect(successor.view.worldInheritance!.institutions[0].claimStatus).toBe("已驳回");
    expect(resolveAction(successor, "以旧河药行旧址线索重新投资经营").intent).toBe("无法完成");
    expect(successor.view.economy.business).toBeUndefined();
  });

  it("随身物品超载会阻止长途旅行，但住处仓储不计负重", () => {
    const game = awakened("inventory-load");
    game.view.inventory.push(...Array.from({ length: 10 }, (_, index) => `沉重矿石${index}`));
    resolveAction(game, "观察周围");
    expect(game.view.inventoryLoad.state).toBe("超载");
    const target = game.view.map.find((location) => location.travelMinutes > 0)!;
    expect(resolveAction(game, `前往${target.name}`).intent).toBe("无法完成");
    resolveAction(game, "把沉重矿石0存放在住处");
    expect(game.view.inventoryLoad.storage).toContain("沉重矿石0");
  });

  it("伴侣、婚姻与家庭必须经过共同经历、双方确认和现实等待", () => {
    const game = awakened("adult-family-evidence");
    game.view.character!.age = 25;
    game.view.character!.coins = 200;
    game.view.relations.push({
      name: "阿宁",
      age: 24,
      relation: "挚友",
      lifeStage: "挚友",
      impression: "多年共同生活与冒险留下了稳定信任",
      category: "同伴",
      dimensions: { closeness: 82, trust: 84, respect: 70, sharedInterest: 65, vigilance: 0, hostility: 0, favorDebt: 0, identityKnowledge: 90 },
      history: Array.from({ length: 6 }, (_, index) => ({ date: `旧历第${index + 1}日`, reason: `共同完成第${index + 1}次旅行与互助`, changes: "信任经行动验证" })),
    });

    expect(resolveAction(game, "与阿宁登记结婚").intent).toBe("无法完成");
    expect(resolveAction(game, "与阿宁讨论长期关系").intent).toBe("讨论伴侣关系");
    expect(resolveAction(game, "询问阿宁是否愿意成为伴侣").intent).toBe("无法完成");
    advanceWorldTime(game, 7 * 1440);
    expect(resolveAction(game, "询问阿宁是否愿意成为伴侣").intent).toBe("确认伴侣");
    expect(game.view.family.partner?.status).toBe("伴侣");

    advanceWorldTime(game, 30 * 1440);
    expect(resolveAction(game, "与阿宁讨论婚姻").intent).toBe("讨论婚姻");
    advanceWorldTime(game, 7 * 1440);
    expect(resolveAction(game, "与阿宁登记结婚").intent).toBe("登记婚姻");
    expect(game.view.family.partner?.consentEvidence.length).toBeGreaterThanOrEqual(3);

    advanceWorldTime(game, 90 * 1440);
    expect(resolveAction(game, "与阿宁讨论组建家庭").intent).toBe("共同家庭计划");
    expect(game.view.family.children).toHaveLength(0);
    advanceWorldTime(game, 30 * 1440);
    expect(resolveAction(game, "与阿宁准备共同家庭住所").intent).toBe("完成家庭准备");
    advanceWorldTime(game, 240 * 1440);
    expect(resolveAction(game, "与阿宁收养名为小禾的孩子").intent).toBe("建立子女档案");
    expect(game.view.family.children[0]).toMatchObject({ name: "小禾", route: "收养" });
  });

  it("家庭记录进入结局和连续世代，但不会复制成后代战力或资产", () => {
    const parent = awakened("family-lineage");
    parent.view.character!.age = 30;
    parent.view.family.partner = { name: "阿宁", status: "配偶", establishedAt: "旧历", establishedAtOrdinal: 1, consentEvidence: ["双方明确同意"] };
    parent.view.family.children.push({ id: "child-1", name: "小禾", joinedAt: "旧历", route: "收养", parentNames: [parent.view.character!.name, "阿宁"], evidence: ["家庭册与收养登记"] });
    parent.actionIndex = 8;
    const settlement = settleRun(parent);
    expect(settlement.highlights).toContain("配偶 阿宁（有双方同意记录）");
    expect(settlement.highlights).toContain("家庭子女档案 1 份（不继承战力）");

    const successor = createEraSuccessor(parent);
    expect(successor.view.worldInheritance!.lineage.at(-1)?.family).toMatchObject({ partnerName: "阿宁", childCount: 1 });
    expect(successor.view.worldInheritance!.branches).toEqual([expect.objectContaining({ name: "小禾", route: "收养", sourceGeneration: 1, verification: "传闻" })]);
    expect(successor.view.inventory).toHaveLength(0);
    selectCandidate(successor, successor.view.candidates[0].id);
    finalizeCharacterShaping(successor, { keywords: ["谨慎", "好学", "耐心"], answers: {} });
    awakenCharacter(successor);
    expect(resolveAction(successor, "核验旁支小禾的家谱").intent).toBe("核验旧世档案");
    expect(successor.view.worldInheritance!.branches[0].verification).toBe("部分核验");
    expect(successor.view.family).toEqual({ children: [], householdNotes: [] });
  });

  it("未成年角色不会进入成人化关系情节", () => {
    const game = awakened("child-guard");
    expect(resolveAction(game, "与某人成婚").intent).toBe("规则阻止");
    expect(resolveAction(game, "与同龄人成为朋友").intent).not.toBe("规则阻止");
  });
});
