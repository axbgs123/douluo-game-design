import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { awakenCharacter, createEraSuccessor, createGame, finalizeCharacterShaping, selectCandidate } from "./domain/generator.js";

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
    expect(afterDraws.summonHistory.every((item) => item.kind === "martialSoul" || item.kind === "heirloom")).toBe(true);
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
