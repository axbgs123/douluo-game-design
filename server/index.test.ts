import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import type { GameView } from "../shared/game.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./domain/generator.js";

const testDirectoryPrefix = join(tmpdir(), "douluo-api-test-");
const testDirectory = mkdtempSync(testDirectoryPrefix);
process.env.DOULUO_DATA_DIR = testDirectory;
const database = await import("./db.js");
const settings = await import("./services/settings.js");
const { app } = await import("./index.js");

let server: Server;
let modelServer: Server;
let baseUrl: string;
const modelRequestBodies: Array<{ max_tokens?: number; thinking?: { type?: string }; messages?: Array<{ content?: string }> }> = [];
const modelRequestBodyLengths: number[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    modelServer = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += String(chunk); });
      request.on("end", () => {
        modelRequestBodies.push(JSON.parse(body) as { max_tokens?: number; thinking?: { type?: string }; messages?: Array<{ content?: string }> });
        modelRequestBodyLengths.push(body.length);
        const semanticRequest = body.includes("行动语义整理器");
        const content = semanticRequest
          ? JSON.stringify({ ruleAction: "等待一天" })
          : JSON.stringify({ narrative: "少年在屋中安静等了一日，窗外的光影从东墙移到西墙。", suggestions: ["查看当前计划", "观察周围", "继续修炼"], memory: { summary: "少年等待了一日。", openThreads: [], keyChoice: "", npcNotes: {}, chapterTitle: "觉醒之后" } });
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
    }).listen(0, "127.0.0.1", () => {
      const address = modelServer.address() as AddressInfo;
      settings.writeDeepSeekSettings({ apiKey: "local-test-key", baseUrl: `http://127.0.0.1:${address.port}`, model: "test-model", novelEngineEnabled: false });
      resolve();
    });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await new Promise<void>((resolve, reject) => modelServer.close((error) => error ? reject(error) : resolve()));
  database.closeDatabase();
  delete process.env.DOULUO_DATA_DIR;
  if (testDirectory.startsWith(testDirectoryPrefix)) rmSync(testDirectory, { recursive: true, force: true });
});

describe("HTTP 状态机", () => {
  it("skips candidate selection when an origin is equipped", async () => {
    const drawn = database.drawMetaOrigin(() => 0);
    database.equipCodexOrigin(drawn.drawn.id);
    const response = await fetch(`${baseUrl}/api/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ era: drawn.drawn.era, gender: "男", difficulty: "标准", seed: "api-equipped-origin" }),
    });
    expect(response.status).toBe(201);
    const game = await response.json() as GameView;
    expect(game.status).toBe("character_shaping");
    expect(game.selectedCandidateId).toBe(game.candidates[0].id);
    expect(game.candidates[0].originName).toBe(drawn.drawn.name);
    expect(game.shaping?.personalityOptions.length).toBeGreaterThan(0);
    expect(database.getMetaProgression().equippedOriginId).toBeUndefined();
    database.deleteGame(game.id);
  });

  it("advances a qualified settled save into the next era through the public API", async () => {
    const parent = createGame({ era: 1, gender: "女", difficulty: "标准", seed: "api-era-successor" });
    selectCandidate(parent, parent.view.candidates[0].id, "顾遥");
    finalizeCharacterShaping(parent, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(parent);
    parent.view.status = "ended";
    parent.view.runProgress.settlement = { ending: "旧世终章", baseScore: 70, multiplier: 1, legacyPoints: 70, highlights: [], qualified: true };
    database.saveGame(parent, "test.settled-parent");

    const response = await fetch(`${baseUrl}/api/games/${parent.view.id}/successor`, { method: "POST" });
    expect(response.status).toBe(201);
    const successor = await response.json() as GameView;
    expect(successor.id).toBe(parent.view.id);
    expect(successor.era).toBe(2);
    expect(successor.worldInheritance?.ancestorName).toBe("顾遥");
    expect(database.listCheckpoints(parent.view.id).some((checkpoint) => checkpoint.label.includes("世代终章"))).toBe(true);

    const selection = await fetch(`${baseUrl}/api/games/${parent.view.id}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: successor.candidates[0].id, customName: successor.candidates[0].name }),
    });
    expect(selection.status).toBe(200);
    const shaped = await selection.json() as GameView;
    expect(shaped.status).toBe("character_shaping");
    expect(shaped.worldInheritance?.lineage[0].name).toBe("顾遥");
  });

  it("creates a requested later era through the public API", async () => {
    const response = await fetch(`${baseUrl}/api/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ era: 4, gender: "女", difficulty: "困难", seed: "api-era-four" }),
    });
    expect(response.status).toBe(201);
    const game = await response.json() as GameView;
    expect(game.era).toBe(4);
    expect(game.candidates.every((candidate) => (candidate.birthYearOffset ?? 0) >= 29_995)).toBe(true);
  });

  it("rejects selecting a candidate after the selection stage", async () => {
    const createdResponse = await fetch(`${baseUrl}/api/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gender: "男", difficulty: "标准", seed: "api-state-machine" }),
    });
    const created = await createdResponse.json() as GameView;
    const candidateId = created.candidates[0].id;

    const first = await fetch(`${baseUrl}/api/games/${created.id}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${baseUrl}/api/games/${created.id}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId }),
    });
    expect(second.status).toBe(409);
  });

  it("returns the committed game without executing a repeated action request twice", async () => {
    const game = createGame({ gender: "女", difficulty: "标准", seed: "api-idempotency" });
    selectCandidate(game, game.view.candidates[0].id);
    const draft = game.view.shaping!.personalityOptions[0];
    finalizeCharacterShaping(game, { personalityId: draft.id, keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])) });
    awakenCharacter(game);
    selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
    database.saveGame(game, "test.playable");
    const requestId = "1187a421-1a15-4668-bd70-4e399606f9b9";

    const submit = () => fetch(`${baseUrl}/api/games/${game.view.id}/action/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "等待一天", requestId }),
    });
    const first = await submit();
    expect(first.status).toBe(200);
    await first.text();
    const afterFirst = database.loadGame(game.view.id)!;
    const second = await submit();
    expect(second.status).toBe(200);
    await second.text();
    const afterSecond = database.loadGame(game.view.id)!;

    expect(afterFirst.actionIndex).toBe(1);
    expect(afterSecond.actionIndex).toBe(1);
    expect(afterSecond.revision).toBe(afterFirst.revision);
    const [intentRequest, narratorRequest] = modelRequestBodies.slice(-2);
    expect(intentRequest.max_tokens).toBe(256);
    expect(narratorRequest.max_tokens).toBe(4096);
    expect(intentRequest.thinking?.type).toBe("disabled");
    expect(narratorRequest.thinking?.type).toBe("disabled");
    expect(Math.max(...modelRequestBodyLengths.slice(-2))).toBeLessThan(50_000);
    const intentContext = JSON.parse(intentRequest.messages?.[1]?.content ?? "{}") as { relevantPast?: unknown[] };
    expect(intentContext.relevantPast).toEqual(expect.any(Array));
    const narratorContext = JSON.parse(narratorRequest.messages?.[1]?.content ?? "{}") as { retrievedLongTermMemories?: unknown[]; retrievedCanonKnowledge?: unknown[]; recentNarrative?: unknown[]; longTermMemory?: Record<string, unknown> };
    expect(narratorContext.retrievedLongTermMemories).toEqual(expect.any(Array));
    expect(narratorContext.retrievedCanonKnowledge).toEqual(expect.any(Array));
    expect(narratorContext.recentNarrative?.length).toBeLessThanOrEqual(6);
    expect(narratorContext.longTermMemory).not.toHaveProperty("npcNotes");
    const usageResponse = await fetch(`${baseUrl}/api/settings/deepseek/usage?gameId=${game.view.id}`);
    expect(usageResponse.status).toBe(200);
    const usage = await usageResponse.json() as { vectorMemories: number };
    expect(usage).toMatchObject({ calls: 2, failures: 0, vectorDimensions: 384, vectorRetrievalLimit: 8, canonRetrievalLimit: 10 });
    expect(usage.vectorMemories).toBeGreaterThanOrEqual(1);
  });
});
