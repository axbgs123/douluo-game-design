import { describe, expect, it } from "vitest";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, SOUL_BEASTS } from "../data/world.js";
import { applyActionResult, resolveAction } from "./actions.js";
import { settleRun } from "./endings.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
import { advanceWorldTime, canDiscoverNpc, createHiddenWorld, ensureGameState, recordCanonInfluence, recordIntelligence, revealNpc } from "./world.js";
import { applyNarrativeMemory, violatesCanonChronology } from "../services/deepseek.js";
import { rulebookStats } from "../data/fanfiction-rules.js";
import { auditNarrative, selectNarrativeRules } from "./story-rules.js";

const personality = {
  keywords: ["谨慎", "好奇", "重情"],
  answers: { danger: "observe", promise: "keep", authority: "question" },
};

function awakened(seed = "gameplay") {
  const game = createGame({ gender: "男", difficulty: "标准", personality, seed });
  selectCandidate(game, game.view.candidates[0].id);
  finalizeCharacterShaping(game, { keywords: personality.keywords, answers: personality.answers });
  awakenCharacter(game);
  selectLifeGoal(game, "在十八岁前成为魂王，并拥有一套自创魂技体系");
  return game;
}

describe("完整游玩规则", () => {
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

  it("隐藏人物只有在可靠证据形成后才可写入人物档案", () => {
    const game = awakened("hidden-evidence");
    expect(canDiscoverNpc(game, "qian-renxue")).toBe(false);
    expect(revealNpc(game, "qian-renxue")).toBe(false);
    recordIntelligence(game, { subjectType: "人物", subjectId: "qian-renxue", title: "宫廷密档中的未知身份", detail: "两份独立密档与一次直接目击能够互相印证。", source: "直接目击与交叉核验", confidence: 88, status: "确定" });
    expect(canDiscoverNpc(game, "qian-renxue")).toBe(true);
    expect(revealNpc(game, "qian-renxue")).toBe(true);
    expect(game.world.npcs["qian-renxue"].knownToPlayer).toBe(true);
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
    resolveAction(game, "开始调查魂兽");
    expect(game.view.hunting?.stage).toBe("调查");
    expect(game.view.hunting?.recommendations).toHaveLength(3);
    for (const recommendation of game.view.hunting!.recommendations) expect(SOUL_BEASTS.find((beast) => beast.name === recommendation.name)?.habitats).toContain("soul-hunting-forest");
    const target = game.view.hunting!.recommendations[0].name;
    resolveAction(game, `选择${target}作为魂环目标`);
    expect(game.view.hunting?.stage).toBe("准备");
    resolveAction(game, "购买药物和猎魂绳作为补给");
    expect(game.view.hunting?.stage).toBe("旅行");
    expect(game.view.inventory).toContain("止血散");
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
    const game = awakened("migration");
    delete (game as unknown as { schemaVersion?: number }).schemaVersion;
    delete (game.view as Partial<typeof game.view>).map;
    delete (game.view.candidates[0] as Partial<typeof game.view.candidates[number]>).dwelling;
    delete (game.view.candidates[0] as Partial<typeof game.view.candidates[number]>).startingRelations;
    delete (game.view.candidates[0] as Partial<typeof game.view.candidates[number]>).household;
    delete (game.view.candidates[0] as Partial<typeof game.view.candidates[number]>).residence;
    game.world.npcs["tang-san"].factionIds = ["shrek", "clear-sky", "tang-sect"];
    const migrated = ensureGameState(game);
    expect(migrated.schemaVersion).toBe(10);
    expect(migrated.view.map.length).toBeGreaterThan(0);
    expect(migrated.view.mapPins).toEqual([]);
    expect(migrated.view.candidates[0].residence.building).toBeTruthy();
    expect(migrated.world.npcs["tang-san"]).toBeDefined();
    expect(migrated.world.npcs["tang-san"].factionIds).toEqual([]);
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
    game.view.character!.innateSoulPower = Math.max(1, game.view.character!.innateSoulPower);
    resolveAction(game, "申请学院入学");
    expect(game.view.affiliations.some((item) => /学院/.test(item.name))).toBe(true);
    resolveAction(game, "参加课程"); resolveAction(game, "参加课程"); resolveAction(game, "参加课程");
    expect(game.view.tasks.find((task) => task.id === "academy-foundation")?.status).toBe("完成");
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
    recordCanonInfluence(game, { source: "测试", description: "提前改变唐三的入学条件", affectedNpcIds: ["tang-san"], strength: 50 });
    advanceWorldTime(game, 20 * 1440 + 120);
    expect(game.world.suppressedCanonEvents).toContain("tang-awakening");
    expect(game.view.canonInfluences[0].affects).toContain("唐三");
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
    expect(earlyStarLuo.npcs["dai-weisi"].soulRank).toBeLessThan(20);
    expect(earlyStarLuo.npcs["dai-weisi"].soulRank).not.toBe(49);
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
    expect(migrated.world.npcs["dai-weisi"].soulRank).toBeLessThan(20);
    expect(migrated.view.knownFigures.some((figure) => figure.id === "dai-weisi")).toBe(false);
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
    game.view.character!.coins = 50;
    resolveAction(game, "存钱20金魂币");
    expect(game.view.economy.bankBalance).toBe(20);
    resolveAction(game, "借钱");
    expect(game.view.economy.debt).toBeGreaterThan(0);
    resolveAction(game, "接受当地公开悬赏");
    expect(game.view.tasks.some((task) => task.kind === "悬赏")).toBe(true);
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

  it("未成年角色不会进入成人化关系情节", () => {
    const game = awakened("child-guard");
    expect(resolveAction(game, "与某人成婚").intent).toBe("规则阻止");
    expect(resolveAction(game, "与同龄人成为朋友").intent).not.toBe("规则阻止");
  });
});
