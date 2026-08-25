import { describe, expect, it } from "vitest";
import { applyActionResult } from "./actions.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
import { ensureGameState } from "./world.js";

function playingGame(seed: string) {
  const game = createGame({ gender: "男", difficulty: "标准", seed });
  selectCandidate(game, game.view.candidates[0].id, "卷级测试者");
  const draft = game.view.shaping!.personalityOptions[0];
  finalizeCharacterShaping(game, { personalityId: draft.id, keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])) });
  awakenCharacter(game);
  selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  return game;
}

function applyBeat(game: ReturnType<typeof playingGame>, action: string, ruleSummary: string, intent = "一般行动") {
  applyActionResult(game, action, { intent, minutes: 60, ruleSummary, fallbackNarrative: ruleSummary, suggestions: [] }, ruleSummary, []);
}

describe("卷级故事导演", () => {
  it("organizes real actions into staged pressure without inventing outcomes", () => {
    const game = playingGame("story-arc-stages");
    expect(game.view.storyArc).toMatchObject({ arcNumber: 1, stage: "立局", stageIndex: 0 });
    expect(game.view.storyArc?.centralGoal.length).toBeGreaterThan(4);
    const initialPressure = game.view.storyArc!.pressure;

    applyBeat(game, "询问导师第一魂环路线", "导师列出三种适配方向和各自风险。", "询问");
    expect(game.view.storyArc?.stage).toBe("主动推进");
    applyBeat(game, "去训练场测试武魂消耗", "完成三轮测试并得到稳定消耗记录。", "训练");
    applyBeat(game, "申请学院培养名额", "申请已进入正式复核，等待资源负责人答复。", "申请");
    expect(game.view.storyArc?.stage).toBe("阻力显形");

    applyBeat(game, "参加培养资格考核", "考核失败并受了轻伤，名额暂未获得。", "失败");
    expect(game.view.storyArc?.stage).toBe("局势扩大");
    expect(game.view.storyArc!.pressure).toBeGreaterThan(initialPressure);
    expect(game.view.storyArc?.evidence.some((item) => item.includes("考核失败"))).toBe(true);
  });

  it("migrates old playing saves and rolls a completed arc into the next volume", () => {
    const game = playingGame("story-arc-migration");
    delete game.view.storyArc;
    game.schemaVersion = 29;
    const migrated = ensureGameState(structuredClone(game));
    expect(migrated.schemaVersion).toBe(31);
    expect(migrated.view.storyArc?.stage).toBe("立局");

    migrated.view.storyArc!.stage = "不可逆转折";
    migrated.view.storyArc!.stageIndex = 5;
    migrated.view.storyArc!.stageStartedActionIndex = migrated.actionIndex - 1;
    const firstTitle = migrated.view.storyArc!.title;
    applyBeat(migrated, "正式加入学院并签下培养协议", "学院完成录取，培养协议与责任同时生效。", "加入势力");
    expect(migrated.view.storyArc?.arcNumber).toBe(2);
    expect(migrated.view.storyArc?.completedArcTitles).toContain(firstTitle);
    expect(migrated.view.storyArc?.stage).toBe("立局");
  });
});
