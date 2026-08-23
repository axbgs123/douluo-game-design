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
});
