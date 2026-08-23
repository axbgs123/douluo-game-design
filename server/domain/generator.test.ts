import { describe, expect, it } from "vitest";
import {
  awakenCharacter,
  createGame,
  generateCandidates,
  rerollCandidates,
  selectCandidate,
} from "./generator.js";

const personality = {
  keywords: ["谨慎", "重情", "好学", "坚韧", "自由"],
  answers: {
    danger: "observe",
    promise: "keep",
    authority: "question",
    scarcity: "share",
    injustice: "scheme",
    power: "study",
    conflict: "calm",
    history: "investigate",
  },
};

describe("candidate generation", () => {
  it("repeats exactly for the same seed and reroll index", () => {
    const first = generateCandidates("fixed-seed", 0, "男");
    const second = generateCandidates("fixed-seed", 0, "男");
    expect(second).toEqual(first);
  });

  it("keeps martial souls out of the public candidate cards", () => {
    const game = createGame({ gender: "女", difficulty: "标准", personality, seed: "public-view" });
    expect(game.view.candidates).toHaveLength(3);
    expect(game.view.candidates.every((candidate) => !("martialSoul" in candidate))).toBe(true);
    expect(game.view.candidates.every((candidate) => candidate.omens.length === 2)).toBe(true);
  });

  it("changes candidates on reroll while preserving the seed", () => {
    const game = createGame({ gender: "男", difficulty: "困难", personality, seed: "reroll-seed" });
    const original = game.view.candidates;
    rerollCandidates(game);
    expect(game.view.seed).toBe("reroll-seed");
    expect(game.view.rerollIndex).toBe(1);
    expect(game.view.candidates).not.toEqual(original);
  });

  it("keeps every awakening within twenty years of Tang San", () => {
    const candidates = Array.from({ length: 40 }, (_, rerollIndex) =>
      generateCandidates("timeline-window", rerollIndex, "男"),
    ).flat();

    for (const candidate of candidates) {
      const years = candidate.public.eraRelation.match(/(\d+) 年/)?.[1];
      if (years) expect(Number(years)).toBeLessThanOrEqual(20);
    }
  });

  it("builds origins from enough combinations to avoid a tiny repeating pool", () => {
    const summaries = new Set(
      Array.from({ length: 20 }, (_, rerollIndex) =>
        generateCandidates("origin-variety", rerollIndex, "女").map((candidate) => candidate.public.originSummary),
      ).flat(),
    );
    expect(summaries.size).toBeGreaterThanOrEqual(24);
  });

  it("reveals the martial soul only after selection and awakening", () => {
    const game = createGame({ gender: "女", difficulty: "标准", personality, seed: "awakening-seed" });
    const candidateId = game.view.candidates[0].id;
    expect("martialSoul" in game.view.candidates[0]).toBe(false);

    selectCandidate(game, candidateId);
    expect(game.view.status).toBe("awakening");
    expect(game.view.character).toBeUndefined();
    expect(game.view.narrative[0].text).not.toMatch(/你熟悉|你认识|你见过|你从小/);

    const character = awakenCharacter(game);
    expect(game.view.status).toBe("playing");
    expect(game.view.character?.martialSoul.name).toBe(character.martialSoul.name);
  });
});
