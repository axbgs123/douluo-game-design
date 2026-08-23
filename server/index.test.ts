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

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    modelServer = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += String(chunk); });
      request.on("end", () => {
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
  });
});
