import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { DIFFICULTIES, type RunSettlementView } from "../shared/game.js";
import { applyActionResult, resolveAction } from "./domain/actions.js";
import {
  awakenCharacter,
  createGame,
  createEraSuccessor,
  finalizeCharacterShaping,
  publicView,
  rerollCandidates,
  rerollCharacterShaping,
  selectCandidate,
  selectLifeGoal,
} from "./domain/generator.js";
import {
  getMetaProgression,
  getModelUsage,
  getWorldCatalogStats,
  equipLegacyHeirloom,
  listSaves,
  loadGame,
  commitResolvedAction,
  purchaseLegacyUpgrade,
  saveGame,
  updateMetaPreferences,
  peekEquippedMartialSoul,
  drawMetaMartialSoul,
  drawMetaOrigin,
  deleteGame,
  listCheckpoints,
  restoreCheckpoint,
  saveCheckpoint,
  equipCodexMartialSoul,
  saveGameWithLegacyCost,
  saveSettledGame,
  saveEraSuccessor,
  toggleCodexMartialSoul,
  favoriteCodexMartialSoul,
  deleteCodexMartialSoul,
  equipCodexOrigin,
  favoriteCodexOrigin,
  deleteCodexOrigin,
  saveGameAndClaimEquippedLoadout,
} from "./db.js";
import { applyNarrativeMemory, interpretActionWithDeepSeek, narrateWithAuditRetries, validateInterpretedAction } from "./services/deepseek.js";
import { readDeepSeekSettings, settingsView, writeDeepSeekSettings } from "./services/settings.js";
import { settleRun } from "./domain/endings.js";
import { guardActionByStoryRules } from "./domain/story-rules.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(express.json({ limit: "256kb" }));

const createGameSchema = z.object({
  era: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1),
  gender: z.enum(["男", "女"]),
  difficulty: z.enum(DIFFICULTIES),
  personality: z.object({
    keywords: z.array(z.string().trim().min(1).max(12)).min(3).max(8),
    answers: z.record(z.string(), z.string()),
  }).optional(),
  lifeGoal: z.string().trim().max(120).optional(),
  seed: z.string().trim().max(120).optional(),
});

const candidateSchema = z.object({ candidateId: z.string().min(1), customName: z.string().trim().min(1).max(12).optional() });
const slotLocksSchema = z.array(z.number().int().min(0).max(2)).max(3).default([]);
const candidateRerollSchema = z.object({ lockedSlots: slotLocksSchema }).default({ lockedSlots: [] });
const shapingRerollSchema = z.object({ part: z.enum(["goals", "personality"]), lockedSlots: slotLocksSchema });
const shapingSchema = z.object({
  personalityId: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1).max(12)).min(1).max(8),
  answers: z.record(z.string(), z.string()).refine((answers) => Object.keys(answers).length >= 6, "请完成六道情境题"),
});
const lifeGoalSchema = z.object({
  lifeGoal: z.string().trim().min(6).max(160),
  activeMartialSoulIndex: z.number().int().min(0).max(2).default(0),
  publiclyKnownMartialSoulIndices: z.array(z.number().int().min(0).max(2)).min(1).max(3).default([0]),
});
const actionSchema = z.object({ input: z.string().trim().min(1).max(1200), requestId: z.string().uuid().optional() });
const speedSchema = z.object({ speed: z.enum(["标准", "高速"]) });
const mapPinSchema = z.object({ label: z.string().trim().min(1).max(24), x: z.number().min(0).max(100), y: z.number().min(0).max(100) });
const endSchema = z.object({ reason: z.string().trim().max(200).optional() });
const metaPreferencesSchema = z.object({
  origin: z.string().trim().min(1).max(40),
  martialSoul: z.string().trim().min(1).max(40),
  gift: z.string().trim().min(1).max(40),
});
const metaPurchaseSchema = z.object({ name: z.enum(["命运余量", "稳固根基", "旧世见闻"]) });
const metaEquipSchema = z.object({ name: z.string().trim().max(60).optional() });
const metaSoulEquipSchema = z.object({ id: z.string().trim().min(1).optional() });
const metaSoulToggleSchema = z.object({ id: z.string().trim().min(1), enabled: z.boolean() });
const metaSoulFavoriteSchema = z.object({ id: z.string().trim().min(1), favorite: z.boolean() });
const metaOriginEquipSchema = z.object({ id: z.string().trim().min(1).optional() });
const metaOriginFavoriteSchema = z.object({ id: z.string().trim().min(1), favorite: z.boolean() });
const settingsSchema = z.object({
  apiKey: z.string().trim().optional(),
  baseUrl: z.string().url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  }, "模型地址必须是没有内嵌账号或密码的 HTTP(S) 地址"),
  model: z.string().trim().min(1),
  novelEngineEnabled: z.boolean().default(true),
  clearApiKey: z.boolean().optional(),
});

const activeActionGames = new Set<string>();

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/games", (_request, response) => {
  response.json(listSaves());
});

app.get("/api/meta", (_request, response) => {
  response.json(getMetaProgression());
});

app.post("/api/meta/preferences", (request, response) => {
  response.json(updateMetaPreferences(metaPreferencesSchema.parse(request.body)));
});

app.post("/api/meta/purchase", (request, response) => {
  const input = metaPurchaseSchema.parse(request.body);
  response.json(purchaseLegacyUpgrade(input.name));
});

app.post("/api/meta/equip", (request, response) => {
  const input = metaEquipSchema.parse(request.body);
  response.json(equipLegacyHeirloom(input.name));
});

app.post("/api/meta/martial-souls/draw", (_request, response) => {
  response.json(drawMetaMartialSoul());
});

app.post("/api/meta/martial-souls/equip", (request, response) => {
  const input = metaSoulEquipSchema.parse(request.body);
  response.json(equipCodexMartialSoul(input.id));
});

app.post("/api/meta/martial-souls/toggle", (request, response) => {
  const input = metaSoulToggleSchema.parse(request.body);
  response.json(toggleCodexMartialSoul(input.id, input.enabled));
});

app.post("/api/meta/martial-souls/favorite", (request, response) => {
  const input = metaSoulFavoriteSchema.parse(request.body);
  response.json(favoriteCodexMartialSoul(input.id, input.favorite));
});

app.delete("/api/meta/martial-souls/:id", (request, response) => {
  response.json(deleteCodexMartialSoul(request.params.id));
});

app.post("/api/meta/origins/equip", (request, response) => {
  response.json(equipCodexOrigin(metaOriginEquipSchema.parse(request.body).id));
});

app.post("/api/meta/origins/draw", (_request, response) => {
  response.json(drawMetaOrigin());
});

app.post("/api/meta/origins/favorite", (request, response) => {
  const input = metaOriginFavoriteSchema.parse(request.body);
  response.json(favoriteCodexOrigin(input.id, input.favorite));
});

app.delete("/api/meta/origins/:id", (request, response) => {
  response.json(deleteCodexOrigin(request.params.id));
});

app.get("/api/world/catalog/stats", (_request, response) => {
  response.json(getWorldCatalogStats());
});

app.get("/api/games/:id", (request, response) => {
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  return response.json(publicView(game));
});

app.post("/api/games", (request, response) => {
  if (listSaves().length >= 3) return response.status(409).json({ error: "三个存档位都已使用。请先在书架删除一个存档，再开始新人生。" });
  const input = createGameSchema.parse(request.body);
  const game = createGame(input, getMetaProgression());
  saveGame(game, "game.created", { difficulty: input.difficulty });
  response.status(201).json(publicView(game));
});

app.delete("/api/games/:id", (request, response) => {
  if (!deleteGame(request.params.id)) return response.status(404).json({ error: "没有找到这个存档" });
  return response.json({ ok: true });
});

app.get("/api/games/:id/checkpoints", (request, response) => {
  if (!loadGame(request.params.id)) return response.status(404).json({ error: "没有找到这个存档" });
  return response.json(listCheckpoints(request.params.id));
});

app.post("/api/games/:id/checkpoints", (request, response) => {
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status !== "playing") return response.status(409).json({ error: "进入正式剧情后才能保存手动节点" });
  saveCheckpoint(game, `手动存档 · 第 ${game.view.chapter.number} 章 · 行动 ${game.actionIndex}`);
  return response.status(201).json(listCheckpoints(game.view.id));
});

app.post("/api/games/:id/checkpoints/:checkpointId/restore", (request, response) => {
  const restored = restoreCheckpoint(request.params.id, Number(request.params.checkpointId));
  if (!restored) return response.status(404).json({ error: "没有找到这个关键节点" });
  return response.json(publicView(restored));
});

app.post("/api/games/:id/reroll", (request, response) => {
  const input = candidateRerollSchema.parse(request.body ?? {});
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status !== "candidate_selection") {
    return response.status(409).json({ error: "角色已经选定，不能重新抽取" });
  }
  const working = structuredClone(game);
  const cost = working.view.candidateRerollsUsed >= 3 ? 8 * (working.view.candidatePaidRerolls + 1) : 0;
  if (cost) working.view.candidatePaidRerolls += 1;
  rerollCandidates(working, getMetaProgression().weightPreferences, input.lockedSlots);
  const payload = { rerollIndex: working.view.rerollIndex, lockedSlots: input.lockedSlots, paid: Boolean(cost), cost };
  if (cost) saveGameWithLegacyCost(working, cost, "继续刷新角色", "candidates.rerolled", payload);
  else saveGame(working, "candidates.rerolled", payload);
  return response.json(publicView(working));
});

app.post("/api/games/:id/select", (request, response) => {
  const input = candidateSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status !== "candidate_selection") return response.status(409).json({ error: "角色已经选定，不能再次选择候选角色" });
  if (!game.view.candidates.some((candidate) => candidate.id === input.candidateId)) return response.status(404).json({ error: "候选角色不存在" });
  const working = structuredClone(game);
  const forcedSoul = peekEquippedMartialSoul();
  const forcedOriginId = working.legacy.plannedOriginId;
  selectCandidate(working, input.candidateId, input.customName, forcedSoul);
  const payload = { candidateId: input.candidateId, customName: input.customName, equippedMartialSoulId: forcedSoul?.id, equippedOriginId: forcedOriginId };
  if (forcedSoul || forcedOriginId) saveGameAndClaimEquippedLoadout(working, forcedSoul?.id, forcedOriginId, "candidate.selected", payload);
  else saveGame(working, "candidate.selected", payload);
  return response.json(publicView(working));
});

app.post("/api/games/:id/map/pins", (request, response) => {
  const input = mapPinSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  game.view.mapPins.push({ id: randomUUID(), ...input, createdAt: new Date().toISOString() });
  game.view.mapPins = game.view.mapPins.slice(-30);
  saveGame(game, "map.pin_added", input);
  return response.json(publicView(game));
});

app.delete("/api/games/:id/map/pins/:pinId", (request, response) => {
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  game.view.mapPins = game.view.mapPins.filter((pin) => pin.id !== request.params.pinId);
  saveGame(game, "map.pin_removed", { pinId: request.params.pinId });
  return response.json(publicView(game));
});

app.post("/api/games/:id/shaping/reroll", (request, response) => {
  const input = shapingRerollSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  const validStage = input.part === "goals" ? game.view.status === "life_goal_selection" : game.view.status === "character_shaping";
  if (!validStage) return response.status(409).json({ error: input.part === "goals" ? "觉醒武魂后才能刷新人生目标" : "当前不能重新抽取性格方案" });
  rerollCharacterShaping(game, input.part, input.lockedSlots);
  saveGame(game, "character_shaping.rerolled", input);
  return response.json(publicView(game));
});

app.post("/api/games/:id/shaping/complete", (request, response) => {
  const input = shapingSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  finalizeCharacterShaping(game, input);
  saveGame(game, "character_shaping.completed", { keywords: input.keywords });
  return response.json(publicView(game));
});

app.post("/api/games/:id/awaken", (request, response) => {
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status !== "awakening") {
    return response.status(409).json({ error: "当前不处于武魂觉醒阶段" });
  }
  const character = awakenCharacter(game);
  saveGame(game, "martial_soul.awakened", {
    names: character.martialSouls.map((soul) => soul.name),
    types: character.martialSouls.map((soul) => soul.category),
    innateSoulPower: character.innateSoulPower,
  });
  saveCheckpoint(game, `关键节点 · ${character.martialSouls.map((soul) => soul.name).join("、")}觉醒`);
  return response.json(publicView(game));
});

app.post("/api/games/:id/life-goal", (request, response) => {
  const input = lifeGoalSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  selectLifeGoal(game, input.lifeGoal, input);
  saveGame(game, "life_goal.selected", input);
  return response.json(publicView(game));
});

function requireAi(response: express.Response): boolean {
  if (readDeepSeekSettings().apiKey) return true;
  response.status(409).json({ error: "尚未连接 AI。可以继续创建角色、查看资料和设置模型，但不能正式推演剧情。" });
  return false;
}

function settleIfNeeded(game: ReturnType<typeof loadGame> extends infer T ? Exclude<T, undefined> : never): RunSettlementView | undefined {
  if (game.view.runProgress.ending && !game.view.runProgress.settlement) {
    return settleRun(game, game.view.runProgress.ending);
  }
  return undefined;
}

app.post("/api/games/:id/action", async (request, response) => {
  const input = actionSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status !== "playing") {
    return response.status(409).json({ error: "当前阶段还不能自由行动" });
  }
  if (!requireAi(response)) return;
  const requestId = input.requestId ?? randomUUID();
  if (game.world.actionLedger.some((entry) => entry.requestId === requestId)) return response.json(publicView(game));
  if (activeActionGames.has(game.view.id)) return response.status(409).json({ error: "这个存档正在推演另一项行动，请等待当前行动完成" });
  activeActionGames.add(game.view.id);

  try {
    const working = structuredClone(game);
    let ruleAction = input.input;
    const blockedBeforeInterpretation = guardActionByStoryRules(working, input.input);
    if (!blockedBeforeInterpretation) {
      const interpreted = await interpretActionWithDeepSeek(working, input.input);
      ruleAction = interpreted ? validateInterpretedAction(working, input.input, interpreted) : input.input;
    }
    const resolution = resolveAction(working, ruleAction);
    let generated;
    if (!/规则阻止|无法完成/.test(resolution.intent)) generated = await narrateWithAuditRetries(working, input.input, resolution);
    if (!generated && !/规则阻止|无法完成/.test(resolution.intent)) throw new Error("AI 没有返回可提交的正文，本次行动未推进");
    const beforeNarrative = new Set(working.view.narrative.map((entry) => entry.id));
    applyActionResult(working, input.input, resolution, generated?.narrative ?? resolution.fallbackNarrative, generated?.suggestions.length === 3 ? generated.suggestions : resolution.suggestions, requestId);
    if (generated) applyNarrativeMemory(working, generated);
    const narrativeEntry = working.view.narrative.find((entry) => !beforeNarrative.has(entry.id) && entry.kind === "narration");
    if (narrativeEntry) working.lastCommittedAction = { requestId, playerInput: input.input, ruleAction, resolution, narrativeEntryId: narrativeEntry.id, committedAt: new Date().toISOString() };
    const settlement = settleIfNeeded(working);
    commitResolvedAction(game, working, `第 ${game.actionIndex + 1} 次行动前 · ${input.input.slice(0, 32)}`, "action.resolved", { requestId, input: input.input, ruleAction, minutes: resolution.minutes, usedAiNarrator: true, appliedRuleIds: resolution.appliedRuleIds }, settlement);
    return response.json(publicView(working));
  } finally {
    activeActionGames.delete(game.view.id);
  }
});

app.post("/api/games/:id/action/stream", async (request, response) => {
  const input = actionSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status !== "playing") return response.status(409).json({ error: "当前阶段还不能自由行动" });
  if (!readDeepSeekSettings().apiKey) return response.status(409).json({ error: "尚未连接 AI。可以继续创建角色、查看资料和设置模型，但不能正式推演剧情。" });
  const requestId = input.requestId ?? randomUUID();
  if (activeActionGames.has(game.view.id)) return response.status(409).json({ error: "这个存档正在推演另一项行动，请等待当前行动完成" });

  response.status(200);
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();
  const controller = new AbortController();
  let cancelled = false;
  response.on("close", () => { if (!response.writableEnded) { cancelled = true; controller.abort(); } });
  const send = (event: Record<string, unknown>) => { if (!cancelled && !response.writableEnded) response.write(`${JSON.stringify(event)}\n`); };
  const phase = (id: string, label: string) => send({ type: "phase", phase: id, label });

  if (game.world.actionLedger.some((entry) => entry.requestId === requestId)) {
    send({ type: "done", game: publicView(game), explanation: "该行动已经提交，已返回现有结果" });
    response.end();
    return;
  }
  activeActionGames.add(game.view.id);

  try {
    const working = structuredClone(game);
    phase("checking", "检查行动是否合法");
    let ruleAction = input.input;
    const blocked = guardActionByStoryRules(working, input.input);
    if (!blocked) {
      const interpreted = await interpretActionWithDeepSeek(working, input.input, controller.signal);
      ruleAction = interpreted ? validateInterpretedAction(working, input.input, interpreted) : input.input;
    }
    if (cancelled) return;

    phase("calculating", "计算时间、胜负与后果");
    const resolution = resolveAction(working, ruleAction);
    if (cancelled) return;

    phase("logic", "编译人物动机、知情、权限、资源与后果");
    phase("writing", "按第三人称续写正文");
    const generated = /规则阻止|无法完成/.test(resolution.intent)
      ? { narrative: resolution.fallbackNarrative, suggestions: resolution.suggestions }
      : await narrateWithAuditRetries(working, input.input, resolution, controller.signal, (attempt) => send({ type: "retry", attempt, label: "重新续写" }));
    if (!generated) throw new Error("AI 没有返回可提交的正文");
    if (cancelled) return;

    phase("auditing", "核对时间线、知情边界与程序结果");
    for (const paragraph of generated.narrative.split(/(?<=。|！|？)\s*|\n+/).filter(Boolean)) {
      send({ type: "draft", text: paragraph });
    }
    if (cancelled) return;

    phase("committing", "写入存档");
    const beforeNarrative = new Set(working.view.narrative.map((entry) => entry.id));
    applyActionResult(working, input.input, resolution, generated.narrative, generated.suggestions.length === 3 ? generated.suggestions : resolution.suggestions, requestId);
    if ("memory" in generated) applyNarrativeMemory(working, generated);
    const narrativeEntry = working.view.narrative.find((entry) => !beforeNarrative.has(entry.id) && entry.kind === "narration");
    if (narrativeEntry) working.lastCommittedAction = { requestId, playerInput: input.input, ruleAction, resolution, narrativeEntryId: narrativeEntry.id, committedAt: new Date().toISOString() };
    const settlement = settleIfNeeded(working);
    if (cancelled) return;
    commitResolvedAction(game, working, `第 ${game.actionIndex + 1} 次行动前 · ${input.input.slice(0, 32)}`, "action.resolved", { requestId, input: input.input, ruleAction, minutes: resolution.minutes, usedAiNarrator: true, appliedRuleIds: resolution.appliedRuleIds }, settlement);
    send({ type: "done", game: publicView(working), explanation: resolution.ruleSummary });
    response.end();
  } catch (error) {
    if (cancelled || controller.signal.aborted) return;
    send({ type: "error", message: error instanceof Error ? error.message : "AI 推演失败，本次行动未推进", retryable: true });
    response.end();
  } finally {
    activeActionGames.delete(game.view.id);
  }
});

app.post("/api/games/:id/action/rewrite", async (request, response) => {
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (!requireAi(response)) return;
  const previous = game.lastCommittedAction;
  if (!previous) return response.status(409).json({ error: "没有可以重写的上一段正文" });
  const working = structuredClone(game);
  const generated = await narrateWithAuditRetries(working, previous.playerInput, previous.resolution);
  if (!generated) throw new Error("AI 没有返回可用正文，原存档未修改");
  const narrativeEntry = working.view.narrative.find((entry) => entry.id === previous.narrativeEntryId);
  if (!narrativeEntry) return response.status(409).json({ error: "上一段正文已不在当前存档中" });
  narrativeEntry.text = generated.narrative;
  working.view.suggestions = generated.suggestions.length === 3 ? generated.suggestions : previous.resolution.suggestions;
  applyNarrativeMemory(working, generated);
  working.view.updatedAt = new Date().toISOString();
  saveGame(working, "action.prose_rewritten", { actionIndex: working.actionIndex, ruleAction: previous.ruleAction });
  return response.json(publicView(working));
});

app.post("/api/games/:id/speed", (request, response) => {
  const input = speedSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status === "ended") return response.status(409).json({ error: "本局已经结束" });
  game.view.speed = input.speed;
  game.view.updatedAt = new Date().toISOString();
  saveGame(game, "speed.changed", input);
  return response.json(publicView(game));
});

app.post("/api/games/:id/end", (request, response) => {
  const input = endSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status !== "playing" && game.view.status !== "ended") {
    return response.status(409).json({ error: "角色人生尚未正式开始" });
  }
  const settlement = settleRun(game, input.reason);
  saveSettledGame(game, settlement, "run.settled");
  return response.json(publicView(game));
});

app.post("/api/games/:id/successor", (request, response) => {
  const parent = loadGame(request.params.id);
  if (!parent) return response.status(404).json({ error: "没有找到这个存档" });
  try {
    const successor = createEraSuccessor(parent, getMetaProgression());
    saveEraSuccessor(parent, successor);
    return response.status(201).json(publicView(successor));
  } catch (error) {
    return response.status(409).json({ error: error instanceof Error ? error.message : "无法建立下一时代" });
  }
});

app.get("/api/settings/deepseek", (_request, response) => {
  response.json(settingsView());
});

app.get("/api/settings/deepseek/usage", (request, response) => {
  response.json(getModelUsage(typeof request.query.gameId === "string" ? request.query.gameId : undefined));
});

app.post("/api/settings/deepseek", (request, response) => {
  const input = settingsSchema.parse(request.body);
  response.json(writeDeepSeekSettings(input));
});

const webDistPath = resolve(process.cwd(), "dist");
if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get(/^(?!\/api).*/, (_request, response) => {
    response.sendFile(resolve(webDistPath, "index.html"));
  });
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    return response.status(400).json({ error: "提交内容不完整或格式不正确", details: error.issues });
  }
  console.error(error);
  return response.status(500).json({ error: error instanceof Error ? error.message : "本地服务发生未知错误" });
});

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`Douluo local server listening on http://127.0.0.1:${port}`);
  });
}

export { app };
