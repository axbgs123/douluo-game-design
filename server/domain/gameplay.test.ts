import { describe, expect, it } from "vitest";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, SOUL_BEASTS } from "../data/world.js";
import { applyActionResult, resolveAction } from "./actions.js";
import { settleRun } from "./endings.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
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
  finalizeCharacterShaping(game, { keywords: personality.keywords, answers: personality.answers });
  awakenCharacter(game);
  selectLifeGoal(game, "在十八岁前成为魂王，并拥有一套自创魂技体系");
  return game;
}

describe("完整游玩规则", () => {
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

  it("跨年会推进年龄并触发原作时间节点", () => {
    const game = awakened("timeline");
    game.world = createHiddenWorld(-1, game.view.locationId!);
    game.view.worldTime = { era: "与唐三同年参加武魂觉醒", year: -1, day: 360, time: "23:00", season: "冬" };
    const age = game.view.character!.age;
    const messages = advanceWorldTime(game, 120);
    expect(game.view.worldTime.year).toBe(0);
    expect(game.view.character!.age).toBe(age + 1);
    expect(messages.some((message) => message.includes("唐三与小舞"))).toBe(true);
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
    const migrated = ensureGameState(game);
    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.view.map.length).toBeGreaterThan(0);
    expect(migrated.view.mapPins).toEqual([]);
    expect(migrated.view.candidates[0].residence.building).toBeTruthy();
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
