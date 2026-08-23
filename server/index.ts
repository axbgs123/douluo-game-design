import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { DIFFICULTIES } from "../shared/game.js";
import { applyActionResult, resolveAction } from "./domain/actions.js";
import {
  awakenCharacter,
  createGame,
  publicView,
  rerollCandidates,
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
} from "./db.js";
import { applyNarrativeMemory, interpretActionWithDeepSeek, narrateWithDeepSeek } from "./services/deepseek.js";
import { settingsView, writeDeepSeekSettings } from "./services/settings.js";
import { settleRun } from "./domain/endings.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(express.json({ limit: "256kb" }));

const createGameSchema = z.object({
  gender: z.enum(["男", "女"]),
  difficulty: z.enum(DIFFICULTIES),
  personality: z.object({
    keywords: z.array(z.string().trim().min(1).max(12)).min(3).max(8),
    answers: z.record(z.string(), z.string()),
  }),
  lifeGoal: z.string().trim().max(120).optional(),
  seed: z.string().trim().max(120).optional(),
});

const candidateSchema = z.object({ candidateId: z.string().min(1), customName: z.string().trim().min(1).max(12).optional() });
const actionSchema = z.object({ input: z.string().trim().min(1).max(1200) });
const speedSchema = z.object({ speed: z.enum(["标准", "高速"]) });
const endSchema = z.object({ reason: z.string().trim().max(200).optional() });
const metaPreferencesSchema = z.object({
  origin: z.string().trim().min(1).max(40),
  martialSoul: z.string().trim().min(1).max(40),
  gift: z.string().trim().min(1).max(40),
});
const metaPurchaseSchema = z.object({ name: z.enum(["命运余量", "稳固根基", "旧世见闻"]) });
const metaEquipSchema = z.object({ name: z.string().trim().max(60).optional() });
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
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status !== "candidate_selection") {
    return response.status(409).json({ error: "角色已经选定，不能重新抽取" });
  }
  rerollCandidates(game, getMetaProgression().weightPreferences);
  saveGame(game, "candidates.rerolled", { rerollIndex: game.view.rerollIndex });
  return response.json(publicView(game));
});

app.post("/api/games/:id/select", (request, response) => {
  const input = candidateSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  selectCandidate(game, input.candidateId, input.customName);
  saveGame(game, "candidate.selected", { candidateId: input.candidateId, customName: input.customName });
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
  try { ruleAction = await interpretActionWithDeepSeek(game, input.input) ?? input.input; }
  catch (error) { console.warn(error instanceof Error ? error.message : error); }
  const resolution = resolveAction(game, ruleAction);
  let generated = null;
  try {
    generated = await narrateWithDeepSeek(game, input.input, resolution);
  } catch (error) {
    console.warn(error instanceof Error ? error.message : error);
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
  if (game.view.status === "candidate_selection" || game.view.status === "awakening") {
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
