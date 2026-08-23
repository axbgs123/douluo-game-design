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
import { getMetaProgression, listSaves, loadGame, saveGame } from "./db.js";
import { narrateWithDeepSeek } from "./services/deepseek.js";
import { settingsView, writeDeepSeekSettings } from "./services/settings.js";

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
  seed: z.string().trim().max(120).optional(),
});

const candidateSchema = z.object({ candidateId: z.string().min(1) });
const actionSchema = z.object({ input: z.string().trim().min(1).max(1200) });
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

app.get("/api/games/:id", (request, response) => {
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  return response.json(publicView(game));
});

app.post("/api/games", (request, response) => {
  const input = createGameSchema.parse(request.body);
  const game = createGame(input);
  saveGame(game, "game.created", { difficulty: input.difficulty });
  response.status(201).json(publicView(game));
});

app.post("/api/games/:id/reroll", (request, response) => {
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  if (game.view.status !== "candidate_selection") {
    return response.status(409).json({ error: "角色已经选定，不能重新抽取" });
  }
  rerollCandidates(game);
  saveGame(game, "candidates.rerolled", { rerollIndex: game.view.rerollIndex });
  return response.json(publicView(game));
});

app.post("/api/games/:id/select", (request, response) => {
  const input = candidateSchema.parse(request.body);
  const game = loadGame(request.params.id);
  if (!game) return response.status(404).json({ error: "没有找到这个存档" });
  selectCandidate(game, input.candidateId);
  saveGame(game, "candidate.selected", { candidateId: input.candidateId });
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

  const resolution = resolveAction(game, input.input);
  let generated = null;
  try {
    generated = await narrateWithDeepSeek(game.view, input.input, resolution);
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
  saveGame(game, "action.resolved", {
    input: input.input,
    minutes: resolution.minutes,
    usedAiNarrator: Boolean(generated),
  });
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
