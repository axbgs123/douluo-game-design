import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DIFFICULTIES } from "../shared/game.js";
import { applyActionResult, resolveAction } from "./domain/actions.js";
import {
  awakenCharacter,
  createGame,
  finalizeCharacterShaping,
  publicView,
  rerollCandidates,
  rerollCharacterShaping,
  selectCandidate,
} from "./domain/generator.js";
import {
  getMetaProgression,
  getWorldCatalogStats,
  equipLegacyHeirloom,
  listSaves,
  loadGame,
  recordRunSettlement,
  purchaseLegacyUpgrade,
  saveGame,
  updateMetaPreferences,
  claimEquippedMartialSoul,
  drawMetaMartialSoul,
  equipCodexMartialSoul,
  spendLegacyPoints,
  toggleCodexMartialSoul,
} from "./db.js";
import { applyNarrativeMemory, interpretActionWithDeepSeek, narrateWithDeepSeek } from "./services/deepseek.js";
import { settingsView, writeDeepSeekSettings } from "./services/settings.js";
import { settleRun } from "./domain/endings.js";
import { guardActionByStoryRules } from "./domain/story-rules.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(express.json({ limit: "256kb" }));

const createGameSchema = z.object({
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
  keywords: z.array(z.string().trim().min(1).max(12)).min(1).max(8),
  answers: z.record(z.string(), z.string()).refine((answers) => Object.keys(answers).length >= 6, "请完成六道情境题"),
  lifeGoal: z.string().trim().min(6).max(160),
});
const actionSchema = z.object({ input: z.string().trim().min(1).max(1200) });
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
const settingsSchema = z.object({
  apiKey: z.string().trim().min(1),
  baseUrl: z.string().url(),
  model: z.string().trim().min(1),
});

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

app.get("/api/world/catalog/stats", (_request, response) => {
  response.json(getWorldCatalogStats());
});

app.get("/api/games/:id", (request, response) => {
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  return response.json(publicView(game));
});

app.post("/api/games", (request, response) => {
  const input = createGameSchema.parse(request.body);
  const game = createGame(input, getMetaProgression());
  saveGame(game, "game.created", { difficulty: input.difficulty });
  response.status(201).json(publicView(game));
});

app.post("/api/games/:id/reroll", (request, response) => {
  const input = candidateRerollSchema.parse(request.body ?? {});
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status !== "candidate_selection") {
    return response.status(409).json({ error: "角色已经选定，不能重新抽取" });
  }
  if (game.view.candidateRerollsUsed >= 3) {
    const cost = 8 * (game.view.candidatePaidRerolls + 1);
    spendLegacyPoints(cost, "继续刷新角色");
    game.view.candidatePaidRerolls += 1;
  }
  rerollCandidates(game, getMetaProgression().weightPreferences, input.lockedSlots);
  saveGame(game, "candidates.rerolled", { rerollIndex: game.view.rerollIndex, lockedSlots: input.lockedSlots, paid: game.view.candidateRerollsUsed > 3 });
  return response.json(publicView(game));
});

app.post("/api/games/:id/select", (request, response) => {
  const input = candidateSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (!game.view.candidates.some((candidate) => candidate.id === input.candidateId)) return response.status(404).json({ error: "候选角色不存在" });
  const forcedSoul = claimEquippedMartialSoul();
  selectCandidate(game, input.candidateId, input.customName, forcedSoul);
  saveGame(game, "candidate.selected", { candidateId: input.candidateId, customName: input.customName });
  return response.json(publicView(game));
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
  if (game.view.status !== "character_shaping") return response.status(409).json({ error: "当前不能重新抽取角色塑造方案" });
  rerollCharacterShaping(game, input.part, input.lockedSlots);
  saveGame(game, "character_shaping.rerolled", input);
  return response.json(publicView(game));
});

app.post("/api/games/:id/shaping/complete", (request, response) => {
  const input = shapingSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  finalizeCharacterShaping(game, input);
  saveGame(game, "character_shaping.completed", { keywords: input.keywords, lifeGoal: input.lifeGoal });
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
    name: character.martialSoul.name,
    innateSoulPower: character.innateSoulPower,
  });
  return response.json(publicView(game));
});

app.post("/api/games/:id/action", async (request, response) => {
  const input = actionSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status !== "playing") {
    return response.status(409).json({ error: "当前阶段还不能自由行动" });
  }

  let ruleAction = input.input;
  const blockedBeforeInterpretation = guardActionByStoryRules(game, input.input);
  if (!blockedBeforeInterpretation) {
    try { ruleAction = await interpretActionWithDeepSeek(game, input.input) ?? input.input; }
    catch (error) { console.warn(error instanceof Error ? error.message : error); }
  }
  const resolution = resolveAction(game, ruleAction);
  let generated = null;
  if (!/规则阻止|无法完成/.test(resolution.intent)) {
    try {
      generated = await narrateWithDeepSeek(game, input.input, resolution);
    } catch (error) {
      console.warn(error instanceof Error ? error.message : error);
    }
  }
  applyActionResult(
    game,
    input.input,
    resolution,
    generated?.narrative ?? resolution.fallbackNarrative,
    generated?.suggestions.length === 3 ? generated.suggestions : resolution.suggestions,
  );
  if (generated) applyNarrativeMemory(game, generated);
  if (game.view.runProgress.ending && !game.view.runProgress.settlement) {
    const settlement = settleRun(game, game.view.runProgress.ending);
    recordRunSettlement(game, settlement);
  }
  saveGame(game, "action.resolved", {
    input: input.input,
    ruleAction,
    minutes: resolution.minutes,
    usedAiNarrator: Boolean(generated),
    appliedRuleIds: resolution.appliedRuleIds,
  });
  return response.json(publicView(game));
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
  const wasSettled = Boolean(game.view.runProgress.settlement);
  const settlement = settleRun(game, input.reason);
  if (!wasSettled) recordRunSettlement(game, settlement);
  saveGame(game, "run.settled", settlement);
  return response.json(publicView(game));
});

app.get("/api/settings/deepseek", (_request, response) => {
  response.json(settingsView());
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

app.listen(port, "127.0.0.1", () => {
  console.log(`Douluo local server listening on http://127.0.0.1:${port}`);
});
