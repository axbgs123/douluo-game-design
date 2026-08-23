import { describe, expect, it } from "vitest";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, SOUL_BEASTS } from "../data/world.js";
import { applyActionResult, resolveAction } from "./actions.js";
import { settleRun } from "./endings.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate } from "./generator.js";
import { advanceWorldTime, createHiddenWorld, ensureGameState, recordCanonInfluence } from "./world.js";
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
  finalizeCharacterShaping(game, { keywords: personality.keywords, answers: personality.answers, lifeGoal: "在十八岁前成为魂王，并拥有一套自创魂技体系" });
  awakenCharacter(game);
  return game;
}

describe("完整游玩规则", () => {
  it("修炼会推进时间、疲劳和内部成长", () => {
    const game = awakened("training");
    const beforeTime = game.view.worldTime?.time;
    const beforeFatigue = game.world.fatiguePoints;
    const result = resolveAction(game, "安静冥想修炼");
    expect(result.intent).toBe("修炼");
    expect(game.world.trainingPoints).toBeGreaterThan(0);
    expect(game.world.fatiguePoints).toBeGreaterThan(beforeFatigue);
    expect(game.view.worldTime?.time).not.toBe(beforeTime);
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
    game.view.character!.soulRank = 10;
    resolveAction(game, "开始调查魂兽");
    expect(game.view.hunting?.stage).toBe("调查");
    expect(game.view.hunting?.recommendations).toHaveLength(3);
    const target = game.view.hunting!.recommendations[0].name;
    resolveAction(game, `选择${target}作为魂环目标`);
    expect(game.view.hunting?.stage).toBe("准备");
    resolveAction(game, "购买药物和猎魂绳作为补给");
    expect(game.view.hunting?.stage).toBe("旅行");
    expect(game.view.inventory).toContain("止血散");
  });

  it("未到魂环瓶颈时不能提前猎取魂环", () => {
    const game = awakened("early-hunt");
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

  it("跨年会推进年龄并触发原作时间节点", () => {
    const game = awakened("timeline");
    game.view.worldTime = { era: "与唐三同年参加武魂觉醒", year: -1, day: 360, time: "23:00", season: "冬" };
    const age = game.view.character!.age;
    const messages = advanceWorldTime(game, 120);
    expect(game.view.worldTime.year).toBe(0);
    expect(game.view.character!.age).toBe(age + 1);
    expect(messages.some((message) => message.includes("唐三与小舞"))).toBe(true);
    expect(game.view.news.some((item) => item.id === "tang-awakening")).toBe(true);
  });

  it("结局会生成得分、难度倍率和传承点", () => {
    const game = awakened("ending");
    game.world.metrics.completedHunts = 2;
    game.world.metrics.discoveries = 3;
    const settlement = settleRun(game, "完成目标");
    expect(game.view.status).toBe("ended");
    expect(settlement.legacyPoints).toBeGreaterThan(0);
    expect(settlement.highlights).toHaveLength(4);
    expect(game.view.runProgress.settlement).toEqual(settlement);
  });

  it("旧存档可补齐第二版世界状态", () => {
    const game = awakened("migration");
    delete (game as unknown as { schemaVersion?: number }).schemaVersion;
    delete (game.view as Partial<typeof game.view>).map;
    const migrated = ensureGameState(game);
    expect(migrated.schemaVersion).toBe(6);
    expect(migrated.view.map.length).toBeGreaterThan(0);
    expect(migrated.world.npcs["tang-san"]).toBeDefined();
  });

  it("重要人物互动会留下记忆并推动世界偏差", () => {
    const game = awakened("canon-contact");
    game.world.npcs["tang-san"].locationId = game.view.locationId!;
    const before = game.world.deviation;
    resolveAction(game, "询问唐三最近在做什么");
    expect(game.world.deviation).toBeGreaterThan(before);
    expect(game.world.npcs["tang-san"].memoryOfPlayer.length).toBeGreaterThan(0);
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
  });

  it("unrelated deviation cannot rewrite a canon event", () => {
    const game = awakened("causal-guard");
    game.world = createHiddenWorld(-1, game.view.locationId!);
    game.world.deviation = 999;
    game.view.worldTime = { era: "比唐三早一年", year: -1, day: 360, time: "23:00", season: "冬" };
    advanceWorldTime(game, 120);
    expect(game.world.firedCanonEvents).toContain("tang-awakening");
    expect(game.world.suppressedCanonEvents).not.toContain("tang-awakening");
  });

  it("a strong linked cause can change the matching canon event", () => {
    const game = awakened("causal-link");
    game.world = createHiddenWorld(-1, game.view.locationId!);
    game.view.canonInfluences = [];
    game.view.worldTime = { era: "比唐三早一年", year: -1, day: 360, time: "23:00", season: "冬" };
    recordCanonInfluence(game, { source: "测试", description: "提前改变唐三的入学条件", affectedNpcIds: ["tang-san"], strength: 50 });
    advanceWorldTime(game, 120);
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
});

describe("第一部世界资料", () => {
  it("包含人物、势力、地点、事件和魂兽", () => {
    expect(CANON_CHARACTERS.length).toBeGreaterThanOrEqual(50);
    expect(FACTIONS.length).toBeGreaterThanOrEqual(20);
    expect(LOCATIONS.length).toBeGreaterThanOrEqual(30);
    expect(CANON_EVENTS.length).toBeGreaterThanOrEqual(20);
    expect(SOUL_BEASTS.length).toBeGreaterThanOrEqual(50);
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
});
