import { describe, expect, it } from "vitest";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
import { auditNovelEngineNarrative, buildNovelEnginePack } from "./novel-engine.js";
import { NarrativeAuditError, narrateWithAuditRetries, narrateWithDeepSeek, narrativePacing } from "../services/deepseek.js";

function awakened(seed = "novel-engine") {
  const game = createGame({ gender: "男", difficulty: "标准", seed });
  selectCandidate(game, game.view.candidates[0].id);
  const personality = game.view.shaping!.personalityOptions[0];
  finalizeCharacterShaping(game, {
    keywords: personality.keywords,
    answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])),
  });
  awakenCharacter(game);
  selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  return game;
}

const ordinaryResolution = { intent: "调查", minutes: 20, ruleSummary: "确认了屋内陈设，没有获得新物品。", fallbackNarrative: "", suggestions: ["继续观察"] };

describe("增强小说引擎", () => {
  it("always loads the portable core modules without exposing author workflows", () => {
    const pack = buildNovelEnginePack(awakened(), "观察屋内", ordinaryResolution);
    expect(pack.activeModules.map((module) => module.id)).toEqual(["continuity", "world", "expand", "human", "fanfic"]);
    expect(pack.prompt).toContain("第三人称限知");
    expect(pack.prompt).not.toMatch(/投稿|番茄|第一人称|作者后台/);
    expect(pack.prompt.length).toBeLessThan(6500);
  });

  it("routes dialogue, character, emotion and goldfinger only when relevant", () => {
    const game = awakened("novel-engine-routing");
    game.view.character!.specialSystem = { name: "残缺丹道", stage: "入门", progress: "12%", abilities: ["辨药"], resourceHint: "需要本地药材" };
    const pack = buildNovelEnginePack(game, "质问导师为什么隐瞒传承，并压住愤怒", { ...ordinaryResolution, intent: "交谈" });
    const ids = pack.activeModules.map((module) => module.id);
    expect(ids).toEqual(expect.arrayContaining(["dialogue", "character", "emotion", "goldfinger"]));
  });

  it("can be disabled without leaving hidden prompt fragments", () => {
    expect(buildNovelEnginePack(awakened("novel-engine-off"), "观察", ordinaryResolution, false)).toEqual({ enabled: false, activeModules: [], prompt: "" });
  });

  it("rejects backstage leakage, shouted emotions and cost-free cheats", () => {
    const game = awakened("novel-engine-audit");
    game.view.character!.specialSystem = { name: "因果印记", stage: "未激活", progress: "0%", abilities: [], resourceHint: "未知" };
    const pack = buildNovelEnginePack(game, "尝试激活金手指", { ...ordinaryResolution, intent: "参悟特殊体系" });
    expect(auditNovelEngineNarrative(game, "程序判定已经完成，玩家获得胜利。", pack)).toContain("正文泄露后台叙事机制");
    expect(auditNovelEngineNarrative(game, "他感到无比愤怒。", pack)).toContain("正文直接喊出情绪而没有外显");
    expect(auditNovelEngineNarrative(game, "印记从此可以毫无代价无限使用。", pack)).toContain("特殊体系被写成无代价万能能力");
    expect(auditNovelEngineNarrative(game, "印记目前不能无限使用，每次都会留下头痛。", pack)).not.toContain("特殊体系被写成无代价万能能力");
  });

  it("compresses minor actions while preserving space for consequential scenes", () => {
    const game = awakened("pacing");
    expect(narrativePacing(game, "翻找抽屉并整理旧衣", { ...ordinaryResolution, intent: "一般行动" }).kind).toBe("略写");
    expect(narrativePacing(game, "在魂环吸收中决定是否冒险", { ...ordinaryResolution, intent: "魂环吸收", ruleSummary: "这是可能重伤的重大选择" }).kind).toBe("关键");
  });

  it("automatically regenerates with the previous audit reasons", async () => {
    const game = awakened("automatic-regeneration");
    const guidance: string[][] = [];
    const narrator = (async (_game: typeof game, _input: string, _resolution: typeof ordinaryResolution, _signal?: AbortSignal, retryGuidance: string[] = []) => {
      guidance.push(retryGuidance);
      if (guidance.length < 3) throw new NarrativeAuditError([guidance.length === 1 ? "时间线错误" : "人物知情越界"]);
      return { narrative: "他把能确认的事情记了下来。", suggestions: ["继续调查", "询问家人", "检查地图"] };
    }) as typeof narrateWithDeepSeek;
    const retries: number[] = [];
    const result = await narrateWithAuditRetries(game, "调查", ordinaryResolution, undefined, (attempt) => retries.push(attempt), narrator);
    expect(result?.narrative).toContain("记了下来");
    expect(retries).toEqual([2, 3]);
    expect(guidance[1]).toEqual(["时间线错误"]);
    expect(guidance[2]).toEqual(["人物知情越界"]);
  });
});
