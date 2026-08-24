import { describe, expect, it } from "vitest";
import { applyActionResult, resolveAction } from "./actions.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
import { ensureGameState } from "./world.js";
import type { GameEra } from "../../shared/game.js";
import { evaluateLongSession } from "./quality.js";

function playableGame() {
  const game = createGame({ gender: "女", difficulty: "标准", seed: "fixed-twenty-turn-regression" });
  selectCandidate(game, game.view.candidates[0].id);
  const personality = game.view.shaping!.personalityOptions[0];
  finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  awakenCharacter(game);
  selectLifeGoal(game, "先在家乡立足并找到可靠的修炼道路");
  game.world.npcs["tang-san"].locationId = game.view.locationId!;
  game.world.npcs["tang-san"].knownToPlayer = true;
  return game;
}

function laterEraGame(era: GameEra) {
  const game = createGame({ era, gender: "男", difficulty: "标准", seed: `long-era-${era}` });
  selectCandidate(game, game.view.candidates[0].id);
  const personality = game.view.shaping!.personalityOptions[0];
  finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  awakenCharacter(game);
  selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  const npcId = era === 2 ? "huo-yuhao" : era === 3 ? "tang-wulin" : "lan-xuanyu";
  game.world.npcs[npcId].locationId = game.view.locationId!;
  game.world.npcs[npcId].knownToPlayer = true;
  return game;
}

describe("二十回合长局回归", () => {
  it("每回合保持时间、账本、正文和存档结构一致", () => {
    const game = playableGame();
    const actions = [
      "观察周围环境", "询问唐三附近的消息", "安静冥想修炼", "休息恢复", "打工赚钱",
      "调查自己的身世", "等待一天", "整理随身物品", "安静冥想修炼", "休息恢复",
      "观察周围环境", "打工赚钱", "等待一天", "调查附近的修炼消息", "安静冥想修炼",
      "休息恢复", "询问唐三最近的变化", "观察周围环境", "等待一天", "整理下一步计划",
    ];
    let previousOrdinal = (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1);

    actions.forEach((action, index) => {
      const resolution = resolveAction(game, action);
      applyActionResult(game, action, resolution, resolution.fallbackNarrative, resolution.suggestions, `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
      const currentOrdinal = (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1);
      expect(currentOrdinal).toBeGreaterThanOrEqual(previousOrdinal);
      expect(game.world.actionLedger.at(-1)).toMatchObject({ index: index + 1, action });
      expect(game.view.lastActionReceipt).toMatchObject({ actionIndex: index + 1, action });
      expect(Number.isFinite(game.world.healthPoints)).toBe(true);
      expect(Number.isFinite(game.world.fatiguePoints)).toBe(true);
      expect(game.view.inventoryLoad.used).toBeGreaterThanOrEqual(0);
      previousOrdinal = currentOrdinal;
    });

    expect(game.actionIndex).toBe(20);
    expect(game.world.actionLedger).toHaveLength(20);
    expect(game.view.narrative.filter((entry) => entry.kind === "player")).toHaveLength(20);
    const restored = ensureGameState(JSON.parse(JSON.stringify(game)));
    expect(restored.actionIndex).toBe(20);
    expect(restored.world.actionLedger.at(-1)?.index).toBe(20);
    expect(restored.view.lastActionReceipt?.actionIndex).toBe(20);
    expect(evaluateLongSession(restored)).toMatchObject({ actions: 20, ledgerCoverage: 1, narrativeCoverage: 1, narrativeAuditPassRate: 1, npcMemoryRecords: 2, invalidNumericStates: 0 });
  });

  it("斗二至斗四各运行三十回合并通过序列化迁移", () => {
    const actions = ["观察周围环境", "询问家人当地消息", "冥想修炼", "休息恢复", "打工赚钱", "调查当前时代的学院", "等待一天", "查看人生计划", "研究武魂特性", "整理下一步计划"];
    for (const era of [2, 3, 4] as GameEra[]) {
      const game = laterEraGame(era);
      for (let index = 0; index < 30; index += 1) {
        const memoryNpc = game.world.npcs[era === 2 ? "huo-yuhao" : era === 3 ? "tang-wulin" : "lan-xuanyu"];
        if (index % actions.length === 1) memoryNpc.locationId = game.view.locationId!;
        const npcName = memoryNpc.name;
        const action = index % actions.length === 1 ? `询问${npcName}当地消息` : actions[index % actions.length];
        const resolution = resolveAction(game, action);
        applyActionResult(game, action, resolution, resolution.fallbackNarrative, resolution.suggestions, `${era}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
        expect(Number.isFinite(game.world.healthPoints)).toBe(true);
        expect(Number.isFinite(game.world.fatiguePoints)).toBe(true);
        expect(game.view.era).toBe(era);
      }
      const restored = ensureGameState(JSON.parse(JSON.stringify(game)));
      expect(restored.schemaVersion).toBe(19);
      expect(restored.actionIndex).toBe(30);
      expect(restored.view.map.some((location) => location.current)).toBe(true);
      expect(restored.world.actionLedger).toHaveLength(30);
      expect(restored.world.npcs[era === 2 ? "huo-yuhao" : era === 3 ? "tang-wulin" : "lan-xuanyu"].alive).toBe(true);
      expect(restored.world.npcs[era === 2 ? "tang-wulin" : era === 3 ? "huo-yuhao" : "tang-wulin"].alive).toBe(false);
      expect(evaluateLongSession(restored)).toMatchObject({ actions: 30, ledgerCoverage: 1, narrativeCoverage: 1, narrativeAuditPassRate: 1, npcMemoryRecords: 3, invalidNumericStates: 0 });
    }
  });
});
