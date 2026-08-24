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
  it("shows the equipped relic with limited charges and applies its stronger passive effect", () => {
    const game = awakenedGame("静心木珠");
    expect(game.view.activeHeirloom).toMatchObject({ name: "静心木珠", status: "等待触发" });
    game.world.fatiguePoints = 30;
    const first = resolveAction(game, "安静冥想修炼");
    expect(first.systemMessages?.some((item) => item.includes("静心木珠 · 呼吸稳定，疲劳降低50点并恢复15点健康 · 剩余2次"))).toBe(true);
    expect(game.view.activeHeirloom).toMatchObject({ status: "等待触发", remainingUses: 2, maxUses: 3 });
    resolveAction(game, "继续冥想修炼");
    resolveAction(game, "再完成一次冥想修炼");
    expect(game.view.activeHeirloom).toMatchObject({ status: "本局已触发", remainingUses: 0 });
    const exhausted = resolveAction(game, "第四次冥想修炼");
    expect(exhausted.systemMessages?.some((item) => item.includes("静心木珠")) ?? false).toBe(false);
  });

  it("lets an active relic write a real long-term story anchor", () => {
    const game = awakenedGame("岁月锚钉");
    const result = resolveAction(game, "使用岁月锚钉固定五次行动");
    expect(result.intent).toBe("使用遗物");
    expect(game.view.activeHeirloom).toMatchObject({ status: "本局已触发", remainingUses: 0 });
    expect(game.storyMemory.openThreads[0]).toContain("岁月锚点");
    const training = resolveAction(game, "冥想修炼");
    expect(training.ruleSummary).toContain("岁月锚钉令本次非战斗行动");
    expect(game.world.flags.heirloomTimeAnchorActions).toBe(4);
  });
});
