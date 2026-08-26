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
    const telemetryGame = createGame({ gender: "男", difficulty: "标准", seed: "telemetry-game" });
    telemetryGame.view.id = "telemetry-game";
    database.saveGame(telemetryGame, "test.telemetry-game");
    database.recordModelCall({ gameId: "telemetry-game", role: "narrator", model: "test-model", status: "success", latencyMs: 321, promptChars: 900, outputChars: 300, promptTokens: 120, completionTokens: 45, totalTokens: 165 });
    database.recordModelCall({ gameId: "telemetry-game", role: "intent", model: "test-model", status: "failure", latencyMs: 80, promptChars: 200, outputChars: 0, errorCode: "timeout" });

    expect(database.getModelUsage("telemetry-game")).toMatchObject({ calls: 2, failures: 1, promptTokens: 120, completionTokens: 45, totalTokens: 165, totalLatencyMs: 401, narratorContextRetrievals: 0, contextRetrievalReady: false, contextRetrievalStatus: "未产生升级后正文样本" });
    database.recordContextRetrieval({ gameId: "telemetry-game", role: "narrator", actionIndex: 1, memory: 1, canon: 4, logic: 3, chapters: 1, memoryLabels: ["action#1 · 觉醒之日"], canonLabels: ["character · 唐三"], logicLabels: ["秘密传播"], memoryDetails: [{ label: "action#1", snippet: "完整剧情片段", similarity: .8123, source: "actionLedger", reason: "章节命中后入选" }] });
    expect(database.getModelUsage("telemetry-game")).toMatchObject({ narratorContextRetrievals: 1, contextRetrievalReady: true, contextRetrievalStatus: "最近正文已完成三层检索", lastRetrievedMemoryCount: 1, lastRetrievedChapterCount: 1, lastRetrievedCanonCount: 4, lastRetrievedLogicCount: 3, lastRetrievedMemoryLabels: ["action#1 · 觉醒之日"], lastRetrievedCanonLabels: ["character · 唐三"], lastRetrievedLogicLabels: ["秘密传播"] });
    expect(database.getNarrativeDiagnostics("telemetry-game").retrieval?.memory[0]).toMatchObject({ snippet: "完整剧情片段", similarity: .8123, reason: "章节命中后入选" });
    database.deleteGame("telemetry-game");
  });

  it("keeps lossless append-only scene versions and exact replay inputs", () => {
    const game = createGame({ gender: "女", difficulty: "标准", seed: "lossless-scene-archive" });
    database.saveGame(game, "test.lossless-scene-archive");
    const longNarrative = `开场。${"完整正文不会因向量长度限制而被截断。".repeat(220)}`;
    database.appendSceneArchive({ gameId: game.view.id, actionIndex: 1, archiveKind: "committed", chapterNumber: 1, chapterTitle: "觉醒之日", playerInput: "测试武魂", ruleAction: "测试武魂", intent: "测试", fixedResult: "完成一次测试", narrative: longNarrative, suggestions: ["继续测试"] });
    database.appendSceneArchive({ gameId: game.view.id, actionIndex: 1, archiveKind: "rewrite", chapterNumber: 1, chapterTitle: "觉醒之日", playerInput: "测试武魂", ruleAction: "测试武魂", intent: "测试", fixedResult: "完成一次测试", narrative: "重写后的完整正文", suggestions: ["停止测试"] });
    const traceId = "trace-lossless-replay";
    const resolution = { intent: "测试", minutes: 5, ruleSummary: "完成一次测试", fallbackNarrative: "", suggestions: ["继续测试"] };
    database.startTurnTraceGroup({ id: traceId, game, playerInput: "测试武魂", resolution, operation: "action" });
    const exactPrompt = { model: "test-model", messages: [{ role: "system", content: "完整提示词" }, { role: "user", content: "冻结输入" }] };
    database.recordTurnTraceModelAttempt({ traceGroupId: traceId, attempt: 1, prompt: exactPrompt, response: { choices: [] }, status: "model-returned" });
    database.completeTurnTraceAttempt({ traceGroupId: traceId, attempt: 1, status: "accepted" });
    database.completeTurnTraceGroup({ traceGroupId: traceId, status: "accepted", narrative: longNarrative });
    const diagnostics = database.getNarrativeDiagnostics(game.view.id);
    expect(diagnostics.scenes).toHaveLength(2);
    expect(diagnostics.scenes.map((scene) => scene.version)).toEqual([2, 1]);
    expect(diagnostics.scenes.find((scene) => scene.version === 1)?.narrative).toBe(longNarrative);
    expect(String(diagnostics.scenes.find((scene) => scene.version === 1)?.narrative).length).toBeGreaterThan(2_400);
    expect(database.getTurnTraceReplaySource(game.view.id, traceId)?.acceptedPrompt).toEqual(exactPrompt);
    database.deleteGame(game.view.id);
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

  it("rebuilds action vectors from program receipts instead of accepted AI prose", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "vector-program-receipt-only" });
    game.schemaVersion = 46;
    game.actionIndex = 1;
    game.world.actionLedger = [{ index: 1, action: "独自测试隐藏武魂", intent: "私下测试隐藏武魂", result: "只确认武魂能够显形，没有NPC在场。", year: 0, day: 1 }];
    database.saveGame(game, "test.vector-program-receipt-only");
    database.storeVectorMemory({ gameId: game.view.id, sourceKey: "action:1", actionIndex: 1, kind: "action", text: "AI正文虚构齐长老每天训练三个时辰并安排两名执事猎魂。" });
    const recalled = database.retrieveVectorMemories(game, "隐藏武魂私下测试", 4);
    expect(recalled.some((item) => item.text.includes("只确认武魂能够显形"))).toBe(true);
    expect(recalled.some((item) => /齐长老|三个时辰|两名执事/.test(item.text))).toBe(false);
    game.actionIndex = 0;
    game.world.actionLedger = [];
    database.retrieveVectorMemories(game, "回溯后的新分支", 4);
    expect(database.getModelUsage(game.view.id).vectorMemories).toBe(0);
    database.deleteGame(game.view.id);
  });

  it("retrieves a relevant chapter before ranking scenes inside selected chapters", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "chapter-scene-retrieval" });
    game.actionIndex = 8;
    database.saveGame(game, "test.chapter-scene-retrieval");
    const chapters = [
      { number: 1, action: 1, title: "学院食堂", text: "在学院食堂购买晚饭，核对日常花销。" },
      { number: 2, action: 3, title: "新生课程", text: "参加魂师基础课程，认识同班学生。" },
      { number: 3, action: 5, title: "首环猎魂", text: "前往猎魂森林追踪曼陀罗蛇，为第一魂环做好撤退准备。" },
      { number: 4, action: 7, title: "城内交易", text: "在城内出售普通材料并核对货款。" },
    ];
    for (const chapter of chapters) {
      database.storeMemoryChapter({ gameId: game.view.id, chapterNumber: chapter.number, title: chapter.title, startActionIndex: chapter.action, endActionIndex: chapter.action + 1, summary: chapter.text });
      database.storeVectorMemory({ gameId: game.view.id, sourceKey: `chapter-test:${chapter.number}`, actionIndex: chapter.action, kind: "action", text: chapter.text });
    }
    expect(database.retrieveMemoryChapters(game, "去森林猎魂，追踪适合第一魂环的蛇类魂兽", 1)[0]).toMatchObject({ chapterNumber: 3, title: "首环猎魂" });
    const recalled = database.retrieveVectorMemories(game, "去森林猎魂，追踪适合第一魂环的蛇类魂兽", 2);
    expect(recalled[0].text).toContain("曼陀罗蛇");
    expect(recalled[0].metadata).toMatchObject({ retrievalPhase: "chapter-scene", chapterNumber: 3, chapterTitle: "首环猎魂" });
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
    const academyKnowledge = database.retrieveCanonKnowledge(game, "诺丁学院工读生和普通学员的宿舍、班主任、课程与第一魂环猎魂手令", 20);
    expect(academyKnowledge.some((item) => item.kind === "academy-system" && item.subjectId === "d1-early-academy" && item.metadata.provenance === "原著归纳")).toBe(true);
    expect(database.getModelUsage().canonKnowledgeVectors).toBeGreaterThan(100);
  });

  it("uses conservative temperament anchors instead of later-developed full personalities", () => {
    const game = createGame({ era: 1, gender: "女", difficulty: "标准", seed: "conservative-personality-anchor" });
    game.view.worldTime = { era: "史莱克入学阶段", year: 6, day: 1, time: "08:00", season: "春" };
    game.world.npcs["ning-rongrong"].knownToPlayer = true;
    game.view.knownFigures.push({ id: "ning-rongrong", name: "宁荣荣", knownPower: "实力未知", location: "七宝琉璃宗", status: "已知", source: "亲眼见过" });
    const character = database.retrieveCanonKnowledge(game, "宁荣荣当前性格与目标", 20).find((item) => item.subjectId === "ning-rongrong" && item.kind === "character");
    expect(character?.metadata.personality).toEqual(["聪明", "骄傲"]);
    expect(character?.text).toContain("不代表后来形成的价值观或同伴责任已经出现");
    expect(character?.text).not.toContain("重视同伴");
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
    const resourceLogic = database.retrieveWorldLogic(game, "罕见高天赋经过可靠测试后，谁愿意教、训练场能用多久、猎魂队是否愿意带人和能给多少材料", 8);
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
