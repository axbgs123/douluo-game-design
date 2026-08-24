import { describe, expect, it } from "vitest";
import { resolveAction } from "./actions.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";

function awakenedGame(heirloom: string) {
  const game = createGame({ gender: "男", difficulty: "标准", seed: `heirloom-${heirloom}` });
  game.legacy.equippedHeirloom = heirloom;
  game.hiddenCandidates[0].innateSoulPower = 3;
  selectCandidate(game, game.view.candidates[0].id);
  finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
  awakenCharacter(game);
  selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  return game;
}

describe("局外遗物", () => {
  it("shows the equipped relic in a dedicated slot and applies its passive effect once", () => {
    const game = awakenedGame("静心木珠");
    expect(game.view.activeHeirloom).toMatchObject({ name: "静心木珠", status: "等待触发" });
    game.world.fatiguePoints = 30;
    const first = resolveAction(game, "安静冥想修炼");
    expect(first.systemMessages).toContain("静心木珠 · 呼吸稳定，疲劳降低 10 点");
    expect(game.view.activeHeirloom?.status).toBe("本局已触发");
    const second = resolveAction(game, "继续冥想修炼");
    expect(second.systemMessages ?? []).not.toContain("静心木珠 · 呼吸稳定，疲劳降低 10 点");
  });

  it("lets an active relic write a real long-term story anchor", () => {
    const game = awakenedGame("岁月锚钉");
    const result = resolveAction(game, "使用岁月锚钉记录当前节点");
    expect(result.intent).toBe("使用遗物");
    expect(game.view.activeHeirloom?.status).toBe("本局已触发");
    expect(game.storyMemory.openThreads[0]).toContain("岁月锚点");
  });
});
