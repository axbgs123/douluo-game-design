import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGame } from "./domain/generator.js";

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
