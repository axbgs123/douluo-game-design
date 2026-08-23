import { describe, expect, it } from "vitest";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
import { buildSceneKnowledgePack } from "./scene-knowledge.js";

function playableGame() {
  const game = createGame({ gender: "男", difficulty: "标准", seed: "scene-knowledge" });
  selectCandidate(game, game.view.candidates[0].id);
  const shaping = game.view.shaping!;
  const personality = shaping.personalityOptions[0];
  finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  awakenCharacter(game);
  selectLifeGoal(game, "在十八岁前成为魂王并保护家人");
  return game;
}

describe("场景知识检索", () => {
  it("优先给出当前地点且遵守硬字符预算", () => {
    const game = playableGame();
    const pack = buildSceneKnowledgePack(game, "观察附近环境", 420);
    expect(pack.entries.some((entry) => entry.kind === "地点" && entry.id === game.view.locationId)).toBe(true);
    expect(pack.usedChars).toBeLessThanOrEqual(420);
  });

  it("不会因为玩家说出名字就泄露未发现的隐藏地点", () => {
    const game = playableGame();
    game.world.discoveredLocations = game.world.discoveredLocations.filter((id) => id !== "ice-fire-spring");
    const pack = buildSceneKnowledgePack(game, "直接前往冰火两仪眼", 4_800);
    expect(pack.entries.some((entry) => entry.id === "ice-fire-spring")).toBe(false);
  });

  it("只向模型提供玩家已经认识的同场人物", () => {
    const game = playableGame();
    const npc = game.world.npcs["tang-san"];
    npc.locationId = game.view.locationId!;
    npc.knownToPlayer = false;
    expect(buildSceneKnowledgePack(game, "看看周围", 4_800).entries.some((entry) => entry.id === "tang-san")).toBe(false);
    npc.knownToPlayer = true;
    expect(buildSceneKnowledgePack(game, "看看周围", 4_800).entries.some((entry) => entry.id === "tang-san")).toBe(true);
  });
});
