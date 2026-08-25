import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { awakenCharacter, createEraSuccessor, createGame, finalizeCharacterShaping, META_ORIGIN_POOL, rerollCandidates, selectCandidate } from "./domain/generator.js";
import { createHiddenWorld, ensureGameState } from "./domain/world.js";

const testDirectoryPrefix = join(tmpdir(), "douluo-db-test-");
const testDirectory = mkdtempSync(testDirectoryPrefix);
process.env.DOULUO_DATA_DIR = testDirectory;
const database = await import("./db.js");

afterAll(() => {
  database.closeDatabase();
  delete process.env.DOULUO_DATA_DIR;
  if (testDirectory.startsWith(testDirectoryPrefix)) rmSync(testDirectory, { recursive: true, force: true });
});

describe("存档数据库", () => {
  it("summons only purple-or-better martial souls and maintains independent rainbow pity", () => {
    const meta = database.getMetaProgression();
    meta.legacyPoints = 1_000;
    meta.martialSoulDrawTickets = 0;
    meta.summonGoldPity = 0;
    meta.summonRedPity = 0;
    meta.summonRainbowPity = 79;
    database.saveMetaProgression(meta);

    const rainbow = database.drawMetaMartialSoul(() => 0.999);
    expect(rainbow.kind).toBe("martialSoul");
    if (rainbow.kind === "martialSoul") expect(rainbow.drawn.rarity).toBe("七彩");
    expect(rainbow.meta.summonRainbowPity).toBe(0);

    const ordinary = database.drawMetaMartialSoul(() => 0.999);
    expect(ordinary.kind).toBe("martialSoul");
    if (ordinary.kind === "martialSoul") expect(["紫色", "金色", "红色", "七彩"]).toContain(ordinary.drawn.rarity);
  });

  it("can summon a relic and adds it to the heirloom collection", () => {
    const meta = database.getMetaProgression();
    meta.legacyPoints = 1_000;
    meta.martialSoulDrawTickets = 0;
    meta.summonGoldPity = 0;
    meta.summonRedPity = 0;
    meta.summonRainbowPity = 0;
    meta.unlockedHeirlooms = [];
    database.saveMetaProgression(meta);

    const result = database.drawMetaMartialSoul(() => 0.01);
    expect(result.kind).toBe("heirloom");
    if (result.kind === "heirloom") expect(result.meta.unlockedHeirlooms).toContain(result.drawn.name);
  });

  it("summons only purple-or-better origins, includes rainbow origins, and applies the full origin to a reusable opening", () => {
    expect(META_ORIGIN_POOL.length).toBeGreaterThan(20);
    expect(META_ORIGIN_POOL.every((item) => ["紫色", "金色", "红色", "七彩"].includes(item.rarity))).toBe(true);
    expect(META_ORIGIN_POOL.some((item) => item.rarity === "七彩")).toBe(true);
    const meta = database.getMetaProgression();
    meta.legacyPoints = 1_000;
    meta.martialSoulDrawTickets = 0;
    meta.summonGoldPity = 0;
    meta.summonRedPity = 0;
    meta.summonRainbowPity = 0;
    database.saveMetaProgression(meta);

    const result = database.drawMetaMartialSoul(() => 0.1);
    expect(result.kind).toBe("origin");
    if (result.kind !== "origin") return;
    expect(["紫色", "金色", "红色", "七彩"]).toContain(result.drawn.rarity);
    database.equipCodexOrigin(result.drawn.id);
    const equippedMeta = database.getMetaProgression();
    const game = createGame({ era: result.drawn.era, gender: "男", difficulty: "标准", seed: "equipped-origin" }, equippedMeta);
    expect(game.hiddenCandidates[0].originId).toBe(result.drawn.id);
    expect(game.view.candidates[0].originSummary).toContain(result.drawn.summary.replace(/^[他她]/, "").slice(0, 8));
    rerollCandidates(game, equippedMeta.weightPreferences);
    expect(game.hiddenCandidates[0].originId).toBe(result.drawn.id);
    database.saveGameAndClaimEquippedLoadout(game, undefined, result.drawn.id, "test.origin-claimed");
    expect(database.getMetaProgression().originCodex.some((item) => item.id === result.drawn.id)).toBe(true);
    expect(database.getMetaProgression().equippedOriginId).toBeUndefined();
  });

  it("provides an independent origin summon with gold, red, and rainbow pity", () => {
    const meta = database.getMetaProgression();
    meta.legacyPoints = 1_000;
    meta.martialSoulDrawTickets = 0;
    meta.originGoldPity = 9;
    meta.originRedPity = 29;
    meta.originRainbowPity = 59;
    database.saveMetaProgression(meta);

    const result = database.drawMetaOrigin(() => 0.999);
    expect(result.kind).toBe("origin");
    expect(result.drawn.rarity).toBe("七彩");
    expect(result.meta.originGoldPity).toBe(0);
    expect(result.meta.originRedPity).toBe(0);
    expect(result.meta.originRainbowPity).toBe(0);
  });

  it("auto-selects an equipped origin for a candidate save created before the skip flow", () => {
    const existing = database.getMetaProgression().originCodex[0];
    expect(existing).toBeDefined();
    database.equipCodexOrigin(existing.id);
    const game = createGame({ era: existing.era, gender: "女", difficulty: "标准", seed: "legacy-equipped-origin-selection" }, database.getMetaProgression());
    expect(game.view.status).toBe("candidate_selection");
    database.saveGame(game, "test.legacy-equipped-origin");

    const migrated = database.loadGame(game.view.id)!;
    expect(migrated.view.status).toBe("character_shaping");
    expect(migrated.view.selectedCandidateId).toBe(migrated.view.candidates[0].id);
    expect(database.getMetaProgression().equippedOriginId).toBeUndefined();
    database.deleteGame(game.view.id);
  });

  it("makes every summoned martial soul permanently reusable for unlimited new games", () => {
    const meta = database.getMetaProgression();
    meta.legacyPoints = 1_000;
    meta.martialSoulDrawTickets = 0;
    meta.summonGoldPity = 0;
    meta.summonRedPity = 0;
    meta.summonRainbowPity = 0;
    database.saveMetaProgression(meta);
    const result = database.drawMetaMartialSoul(() => .9);
    expect(result.kind).toBe("martialSoul");
    if (result.kind !== "martialSoul") return;
    expect(result.drawn.unlimited).toBe(true);
    const legacyCharges = result.drawn.charges;
    for (let index = 0; index < 2; index += 1) {
      database.equipCodexMartialSoul(result.drawn.id);
      const game = createGame({ era: 1, gender: "男", difficulty: "标准", seed: `unlimited-codex-${index}` });
      database.saveGameAndClaimEquippedMartialSoul(game, result.drawn.id, "test.unlimited-codex");
    }
    expect(database.getMetaProgression().martialSoulCodex.find((item) => item.id === result.drawn.id)).toMatchObject({ unlimited: true, charges: legacyCharges });
  });

  it("keeps only five summon records and supports warehouse favorites and deletion", () => {
    const meta = database.getMetaProgression();
    meta.legacyPoints = 2_000;
    meta.martialSoulDrawTickets = 0;
    meta.summonGoldPity = 9;
    meta.summonRedPity = 0;
    meta.summonRainbowPity = 0;
    database.saveMetaProgression(meta);
    for (let index = 0; index < 7; index += 1) database.drawMetaMartialSoul(() => .73);
    const afterDraws = database.getMetaProgression();
    expect(afterDraws.summonHistory).toHaveLength(5);
    expect(afterDraws.summonHistory.every((item) => item.kind === "martialSoul" || item.kind === "origin" || item.kind === "heirloom")).toBe(true);
    const soul = afterDraws.martialSoulCodex[0];
    expect(database.favoriteCodexMartialSoul(soul.id, true).martialSoulCodex.find((item) => item.id === soul.id)?.favorite).toBe(true);
    database.equipCodexMartialSoul(soul.id);
    const deleted = database.deleteCodexMartialSoul(soul.id);
    expect(deleted.martialSoulCodex.some((item) => item.id === soul.id)).toBe(false);
    expect(deleted.equippedMartialSoulId).toBeUndefined();
  });

  it("records model cost telemetry without storing prompts or generated prose", () => {
    database.recordModelCall({ gameId: "telemetry-game", role: "narrator", model: "test-model", status: "success", latencyMs: 321, promptChars: 900, outputChars: 300, promptTokens: 120, completionTokens: 45, totalTokens: 165 });
    database.recordModelCall({ gameId: "telemetry-game", role: "intent", model: "test-model", status: "failure", latencyMs: 80, promptChars: 200, outputChars: 0, errorCode: "timeout" });

    expect(database.getModelUsage("telemetry-game")).toMatchObject({ calls: 2, failures: 1, promptTokens: 120, completionTokens: 45, totalTokens: 165, totalLatencyMs: 401 });
  });

  it("persists and retrieves relevant long-term memories without injecting future actions", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "vector-memory-database" });
    database.saveGame(game, "test.vector-memory-game");
    database.storeVectorMemory({ gameId: game.view.id, sourceKey: "hunt", actionIndex: 0, kind: "action", text: "大师答应带主角前往猎魂森林寻找曼陀罗蛇，准备吸收第一魂环。", importance: 0.8 });
    database.storeVectorMemory({ gameId: game.view.id, sourceKey: "meal", actionIndex: 0, kind: "action", text: "主角在学院食堂买了晚饭，花掉两枚铜魂币。", importance: 0.5 });
    database.storeVectorMemory({ gameId: game.view.id, sourceKey: "future", actionIndex: 99, kind: "action", text: "未来已经获得十万年魂环。", importance: 1 });

    const recalled = database.retrieveVectorMemories(game, "去森林猎魂，为自己的第一魂环选择合适魂兽", 4);
    expect(recalled[0].text).toContain("曼陀罗蛇");
    expect(recalled.some((item) => item.text.includes("十万年魂环"))).toBe(false);
    database.deleteGame(game.view.id);
  });

  it("retrieves era-valid canon personality, timeline, faction, and social logic without leaking unknown characters", () => {
    const game = createGame({ era: 1, gender: "男", difficulty: "标准", seed: "canon-vector-retrieval" });
    game.view.worldTime = { era: "斗罗大陆", year: 0, day: 20, time: "08:00", season: "春" };
    game.view.knownFigures.push({ id: "tang-san", name: "唐三", knownPower: "觉醒阶段", location: "圣魂村", status: "已知", source: "亲眼见过" });
    game.view.knownFigures.push({ id: "xiao-wu", name: "小舞", knownPower: "新生", location: "诺丁学院", status: "已知", source: "亲眼见过" });
    const knowledge = database.retrieveCanonKnowledge(game, "唐三原作0年先天满魂力觉醒阶段的实力、性格、目标；唐三和小舞如何相处；与唐三建立信任的人际逻辑", 20);
    expect(knowledge.some((item) => item.subjectId === "tang-san" && item.kind === "character")).toBe(true);
    expect(knowledge.some((item) => item.subjectId === "tang-san" && item.kind === "character-timeline")).toBe(true);
    expect(knowledge.some((item) => item.kind === "relationship" && item.subjectName.includes("唐三") && item.subjectName.includes("小舞"))).toBe(true);
    expect(knowledge.some((item) => item.subjectId === "di-tian")).toBe(false);
    expect(database.getModelUsage().canonKnowledgeVectors).toBeGreaterThan(100);
  });

  it("retrieves only the current public name, goal, and faction stage for known canon characters", () => {
    const era1 = createGame({ era: 1, gender: "男", difficulty: "标准", seed: "character-stage-era1" });
    era1.view.worldTime = { era: "唐三觉醒基准年", year: 0, day: 1, time: "08:00", season: "春" };
    era1.world = createHiddenWorld(0, "holy-soul-village");
    era1.world.npcs["tang-san"].knownToPlayer = true;
    era1.view.knownFigures.push({ id: "tang-san", name: "唐三", knownPower: "10 级", location: "圣魂村", status: "已知", source: "亲眼见过" });
    const tangKnowledge = database.retrieveCanonKnowledge(era1, "唐三当前目标、势力和身份", 20).filter((item) => item.subjectId === "tang-san");
    expect(tangKnowledge.length).toBeGreaterThan(0);
    expect(tangKnowledge.every((item) => !/重建唐门|唐门弟子|昊天宗成员/.test(item.text))).toBe(true);

    const era3 = createGame({ era: 3, gender: "女", difficulty: "标准", seed: "character-stage-era3" });
    era3.view.worldTime = { era: "东海学院零班阶段", year: 20003, day: 1, time: "08:00", season: "春" };
    era3.world = createHiddenWorld(20003, "east-sea-city");
    era3.world.npcs["gu-yue-na"].knownToPlayer = true;
    era3.view.knownFigures.push({ id: "gu-yue-na", name: "古月", knownPower: "实力未知", location: "东海城", status: "已知", source: "同学" });
    const guYueKnowledge = database.retrieveCanonKnowledge(era3, "古月当前身份、目标和同学关系", 20).filter((item) => item.subjectId === "gu-yue-na" || item.kind === "relationship");
    expect(guYueKnowledge.some((item) => item.subjectName.includes("古月"))).toBe(true);
    expect(guYueKnowledge.every((item) => !/古月娜|银龙王|银龙斗罗|传灵塔权力/.test(`${item.subjectName}${item.text}`))).toBe(true);

    const era4 = createGame({ era: 4, gender: "男", difficulty: "标准", seed: "unknown-future-faction" });
    era4.view.worldTime = { era: "蓝轩宇觉醒阶段", year: 30000, day: 1, time: "08:00", season: "春" };
    expect(database.retrieveCanonKnowledge(era4, "龙马联邦和天龙会", 20).some((item) => ["dragon-horse-federation", "sky-dragon-guild"].includes(item.subjectId ?? ""))).toBe(false);
    era4.world.intelligenceRecords.push({ id: "known-dragon-horse", subjectType: "势力", subjectId: "dragon-horse-federation", title: "龙马联邦", detail: "可靠星图确认该外部文明联盟存在。", source: "联邦高权限星图", confidence: 90, status: "确定", year: 30000, day: 1 });
    expect(database.retrieveCanonKnowledge(era4, "龙马联邦", 20).some((item) => item.subjectId === "dragon-horse-federation")).toBe(true);
  });

  it("does not retrieve a past secret event merely because the hidden world has already fired it", () => {
    const game = createGame({ era: 1, gender: "男", difficulty: "标准", seed: "secret-event-knowledge" });
    game.view.worldTime = { era: "唐三觉醒基准年", year: 0, day: 1, time: "08:00", season: "春" };
    game.world = createHiddenWorld(0, "holy-soul-village");
    expect(game.world.firedCanonEvents).toContain("ayin-sacrifice");
    expect(database.retrieveCanonKnowledge(game, "阿银献祭与昊天宗旧案", 20).some((item) => item.subjectId === "ayin-sacrifice")).toBe(false);
    game.view.news.push({ id: "ayin-sacrifice", title: "阿银旧案已核实", detail: "玩家通过可靠档案确认阿银献祭与昊天宗旧案。", date: "原作0年" });
    expect(database.retrieveCanonKnowledge(game, "阿银献祭与昊天宗旧案", 20).some((item) => item.subjectId === "ayin-sacrifice")).toBe(true);
  });

  it("labels original place vectors and never injects gameplay travel minutes as canon facts", () => {
    const game = createGame({ era: 1, gender: "男", difficulty: "标准", seed: "place-provenance-vectors" });
    game.view.locationId = "taixuan-valley";
    game.view.location = "太玄剑宗封山剑谷";
    game.world.discoveredLocations.push("taixuan-valley");
    const knowledge = database.retrieveCanonKnowledge(game, "太玄剑宗封山剑谷的位置、性质与路线", 20);
    const place = knowledge.find((item) => item.subjectId === "taixuan-valley");
    expect(place?.metadata).toMatchObject({ provenance: "原创", sourceType: "同人原创地点" });
    expect(place?.text).toContain("同人原创地点");
    expect(place?.text).toContain("不属于原著事实");
    expect(place?.text).not.toMatch(/约\d+分钟/);
  });

  it("seeds canon relationship baselines by life stage without overwriting later simulation", () => {
    const game = createGame({ era: 1, gender: "女", difficulty: "标准", seed: "canon-relationship-baseline" });
    game.world = createHiddenWorld(-5, "holy-soul-village");
    expect(game.world.npcRelations.some((item) => [item.leftId, item.rightId].includes("tang-san") && [item.leftId, item.rightId].includes("tang-hao") && item.kind === "亲近")).toBe(true);
    expect(game.world.npcRelations.some((item) => [item.leftId, item.rightId].includes("tang-san") && [item.leftId, item.rightId].includes("xiao-wu"))).toBe(false);
    game.view.worldTime = { era: "斗罗大陆", year: 0, day: 20, time: "08:00", season: "春" };
    ensureGameState(game);
    expect(game.world.npcRelations.some((item) => [item.leftId, item.rightId].includes("tang-san") && [item.leftId, item.rightId].includes("xiao-wu"))).toBe(true);
  });

  it("retrieves separate world reaction logic for public talent, resource tilt, and hostile escalation", () => {
    const game = createGame({ era: 1, gender: "男", difficulty: "标准", seed: "world-logic-vector" });
    const logic = database.retrieveWorldLogic(game, "觉醒仪式公开双生武魂和先天满魂力后，老师争取收徒，敌对势力评估监视绑架暗杀", 16);
    const resourceLogic = database.retrieveWorldLogic(game, "罕见高天赋完成复核后，机构怎样优先安排导师面谈、训练场、猎魂名额和资源额度", 8);
    expect(logic.some((item) => item.metadata.ruleId === "public-dual-martial-souls")).toBe(true);
    expect(resourceLogic.some((item) => item.metadata.ruleId === "talent-resource-priority")).toBe(true);
    expect(logic.some((item) => ["hostile-threat-assessment", "assassination-escalation"].includes(String(item.metadata.ruleId)))).toBe(true);
    expect(database.getModelUsage().worldLogicVectors).toBeGreaterThan(40);
  });

  it("replaces a settled slot with its next-era successor and preserves a terminal checkpoint", () => {
    const parent = createGame({ era: 1, gender: "男", difficulty: "标准", seed: "database-era-successor" });
    selectCandidate(parent, parent.view.candidates[0].id, "顾远");
    finalizeCharacterShaping(parent, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(parent);
    parent.view.status = "ended";
    parent.view.runProgress.settlement = { ending: "测试终章", baseScore: 60, multiplier: 1, legacyPoints: 60, highlights: [], qualified: true };
    database.saveGame(parent, "test.parent");
    const successor = createEraSuccessor(parent);

    database.saveEraSuccessor(parent, successor);

    expect(database.loadGame(parent.view.id)?.view.era).toBe(2);
    expect(database.loadGame(parent.view.id)?.view.status).toBe("candidate_selection");
    expect(database.listCheckpoints(parent.view.id).some((checkpoint) => checkpoint.label.includes("世代终章"))).toBe(true);
  });

  it("deletes the game together with events and checkpoints", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "delete-save-test" });
    database.saveGame(game, "test.created");
    database.saveCheckpoint(game, "测试节点");

    expect(database.listSaves().some((save) => save.id === game.view.id)).toBe(true);
    expect(database.listCheckpoints(game.view.id)).toHaveLength(1);
    expect(database.deleteGame(game.view.id)).toBe(true);
    expect(database.listSaves().some((save) => save.id === game.view.id)).toBe(false);
    expect(database.listCheckpoints(game.view.id)).toHaveLength(0);
  });

  it("rewards each run id only once even after a checkpoint-style replay", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "settlement-idempotency" });
    database.saveGame(game, "test.created");
    const settlement = { ending: "测试结局", baseScore: 20, multiplier: 1, legacyPoints: 20, highlights: [], qualified: true };

    const first = database.recordRunSettlement(game, settlement);
    const second = database.recordRunSettlement(game, settlement);

    expect(second.completedRuns).toBe(first.completedRuns);
    expect(second.legacyPoints).toBe(first.legacyPoints);
  });

  it("charges a paid reroll in the same transaction as the save", () => {
    const game = createGame({ gender: "女", difficulty: "标准", seed: "atomic-paid-reroll" });
    database.saveGame(game, "test.created");
    const meta = database.getMetaProgression();
    meta.legacyPoints = 100;
    database.saveMetaProgression(meta);
    game.view.rerollIndex = 4;

    database.saveGameWithLegacyCost(game, 24, "测试刷新", "test.rerolled");

    expect(database.getMetaProgression().legacyPoints).toBe(76);
    expect(database.loadGame(game.view.id)?.view.rerollIndex).toBe(4);
  });

  it("does not save a paid mutation when the legacy balance is insufficient", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "atomic-paid-failure" });
    database.saveGame(game, "test.created");
    const before = database.loadGame(game.view.id)!;
    game.view.rerollIndex = 99;

    expect(() => database.saveGameWithLegacyCost(game, 10_000, "测试刷新", "test.rerolled")).toThrow("传承点");
    expect(database.loadGame(game.view.id)?.view.rerollIndex).toBe(before.view.rerollIndex);
  });

  it("rejects a stale save instead of overwriting a newer revision", () => {
    const game = createGame({ gender: "女", difficulty: "标准", seed: "optimistic-save-lock" });
    database.saveGame(game, "test.created");
    const firstWriter = database.loadGame(game.view.id)!;
    const staleWriter = structuredClone(firstWriter);
    firstWriter.view.speed = "高速";
    database.saveGame(firstWriter, "test.speed");
    staleWriter.view.speed = "标准";

    expect(() => database.saveGame(staleWriter, "test.stale")).toThrow("存档已被另一项操作更新");
    expect(database.loadGame(game.view.id)?.view.speed).toBe("高速");
  });

  it("rolls back checkpoint and rewards when an action commit loses a revision race", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "atomic-action-conflict" });
    database.saveGame(game, "test.created");
    const stalePrevious = database.loadGame(game.view.id)!;
    const staleResolved = structuredClone(stalePrevious);
    const latest = structuredClone(stalePrevious);
    latest.view.speed = "高速";
    database.saveGame(latest, "test.newer");
    const metaBefore = database.getMetaProgression();
    const settlement = { ending: "冲突分支", baseScore: 30, multiplier: 1, legacyPoints: 30, highlights: [], qualified: true };

    expect(() => database.commitResolvedAction(stalePrevious, staleResolved, "不应保留", "test.stale-action", {}, settlement)).toThrow("存档已被另一项操作更新");

    expect(database.listCheckpoints(game.view.id)).toHaveLength(0);
    expect(database.getMetaProgression().completedRuns).toBe(metaBefore.completedRuns);
    expect(database.getMetaProgression().legacyPoints).toBe(metaBefore.legacyPoints);
  });
});
