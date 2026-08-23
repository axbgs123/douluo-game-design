import { describe, expect, it } from "vitest";
import type { GameEra } from "../../shared/game.js";
import { awakenCharacter, createGame, ERA_BASE_YEARS, finalizeCharacterShaping, generateCandidates, selectCandidate, selectLifeGoal } from "./generator.js";
import { settleRun } from "./endings.js";
import { guardActionByStoryRules, selectNarrativeRules } from "./story-rules.js";
import { resolveAction } from "./actions.js";

function playingGame(era: GameEra, seed: string) {
  const game = createGame({ gender: "男", difficulty: "标准", seed, era });
  selectCandidate(game, game.view.candidates[0].id);
  finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
  awakenCharacter(game);
  selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  return game;
}

describe("multi-era foundations", () => {
  it("creates era-specific lives within the correct absolute-year window", () => {
    for (const era of [1, 2, 3, 4] as GameEra[]) {
      const game = createGame({ gender: "男", difficulty: "标准", seed: `era-${era}`, era });
      expect(game.view.era).toBe(era);
      for (const candidate of game.hiddenCandidates) {
        expect(candidate.public.birthYearOffset).toBeGreaterThanOrEqual(ERA_BASE_YEARS[era] - 5);
        expect(candidate.public.birthYearOffset).toBeLessThanOrEqual(ERA_BASE_YEARS[era] + 5);
        const sourceEra = candidate.martialSoul.sourceEra;
        if (typeof sourceEra === "number") expect(sourceEra).toBeLessThanOrEqual(era);
      }
    }
  });

  it("uses later-era origin pools instead of first-era institutions", () => {
    const candidates = generateCandidates("later-origins", 0, "女", undefined, undefined, 2);
    expect(candidates).toHaveLength(3);
    expect(candidates.every((candidate) => (candidate.public.birthYearOffset ?? 0) >= 9_995)).toBe(true);
    expect(candidates.every((candidate) => !/武魂殿基层|七宝琉璃宗内门|天斗皇家/.test(candidate.public.originName))).toBe(true);
  });

  it("keeps each later-era map focused on places that still exist in that setting", () => {
    for (const era of [2, 3, 4] as GameEra[]) {
      const game = createGame({ gender: "女", difficulty: "标准", seed: `map-era-${era}`, era });
      selectCandidate(game, game.view.candidates[0].id);
      expect(game.view.map.some((location) => location.current)).toBe(true);
      expect(game.view.map.some((location) => location.id === "holy-soul-village")).toBe(false);
      expect(game.view.map.every((location) => location.id !== "spirit-city")).toBe(true);
    }
  });

  it("does not instantly end later-era games because their absolute year exceeds fifty", () => {
    for (const era of [2, 3, 4] as GameEra[]) {
      const game = createGame({ gender: "女", difficulty: "标准", seed: `settlement-era-${era}`, era });
      game.view.worldTime = { year: ERA_BASE_YEARS[era], day: 1, time: "08:00", season: "春", era: `斗罗大陆${era}` };
      const settlement = settleRun(game, "测试中止");
      expect(settlement.ending).toBe("未成之局");
      expect(settlement.qualified).toBe(false);
    }
  });

  it("routes narrative rules and technology limits by active era", () => {
    const era2 = createGame({ gender: "男", difficulty: "标准", seed: "era-2-rules", era: 2 });
    era2.view.worldTime = { year: 10_000, day: 1, time: "08:00", season: "春", era: "绝世唐门时代" };
    expect(selectNarrativeRules(era2, "研究魂导器", { intent: "研究", minutes: 30, ruleSummary: "", fallbackNarrative: "", suggestions: [] }).every((rule) => rule.era === 2)).toBe(true);
    expect(guardActionByStoryRules(era2, "制造一套斗铠")?.intent).toBe("规则阻止");
    expect(guardActionByStoryRules(era2, "制造定装魂导炮")).toBeUndefined();

    const era3 = createGame({ gender: "男", difficulty: "标准", seed: "era-3-rules", era: 3 });
    era3.view.worldTime = { year: 20_000, day: 1, time: "08:00", season: "春", era: "龙王传说时代" };
    expect(guardActionByStoryRules(era3, "制造星舰")?.intent).toBe("规则阻止");
    expect(guardActionByStoryRules(era3, "设计一字斗铠")).toBeUndefined();

    const era4 = createGame({ gender: "男", difficulty: "标准", seed: "era-4-rules", era: 4 });
    era4.view.worldTime = { year: 30_000, day: 1, time: "08:00", season: "春", era: "终极斗罗时代" };
    expect(guardActionByStoryRules(era4, "学习星舰驾驶")).toBeUndefined();
  });

  it("makes a later-era soul spirit require selection, assessment and payment", () => {
    const game = playingGame(2, "soul-spirit-contract");
    game.view.character!.soulRank = 10;
    game.view.character!.coins = 1_000;
    game.view.character!.abilityDescriptors.spirit = "顶尖";

    const selected = resolveAction(game, "申请一份适合第一魂环的正规魂灵");
    expect(selected.intent).toBe("调查魂灵");
    expect(game.view.soulSpiritContract?.stage).toBe("调查");

    const premature = resolveAction(game, "签订魂灵契约");
    expect(premature.intent).toBe("无法完成");
    const assessed = resolveAction(game, "评估魂灵适配");
    expect(assessed.intent).toBe("魂灵适配评估");
    expect(game.view.soulSpiritContract?.compatibility).toBeGreaterThanOrEqual(60);
    const beforeCoins = game.view.character!.coins;
    const signed = resolveAction(game, "签订魂灵契约");
    expect(signed.intent).toBe("签订魂灵契约");
    expect(game.view.character!.coins).toBeLessThan(beforeCoins);
    expect(game.view.character!.soulRings).toHaveLength(1);
    expect(game.view.character!.soulSpirits).toHaveLength(1);
    expect(game.view.character!.soulRank).toBe(11);
    expect(game.view.soulSpiritContract).toBeUndefined();
  });

  it("makes soul-tool crafting consume two material classes and supports certification", () => {
    const game = playingGame(2, "soul-tool-loop");
    game.view.character!.coins = 5_000;
    game.view.affiliations.push({ id: "test-academy", name: "日月皇家魂导师学院", role: "学员", reputation: "在册", joinedAt: "测试" });
    for (let index = 0; index < 3; index += 1) resolveAction(game, "学习一级魂导器核心阵法");
    const profession = game.view.professions.find((item) => item.name === "魂导器研究")!;
    expect(profession.progress).toBeGreaterThanOrEqual(18);
    expect(profession.knownMethods.length).toBeGreaterThanOrEqual(1);

    let crafted = false;
    for (let attempt = 0; attempt < 6 && !crafted; attempt += 1) {
      resolveAction(game, "购买魂导器用稀有金属");
      resolveAction(game, "购买魂导核心晶体");
      resolveAction(game, "制作一级储物魂导器");
      crafted = game.view.inventory.some((item) => item === "1级储物魂导器");
    }
    expect(crafted).toBe(true);
    expect(game.view.inventory.some((item) => /稀有金属|核心晶体/.test(item))).toBe(false);

    const certification = resolveAction(game, "申请一级魂导师认证");
    expect(certification.intent).toBe("魂导师认证");
    expect(profession.level).toBe("1级魂导师");
  });
});
