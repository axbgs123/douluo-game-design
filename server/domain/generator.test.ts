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

  it("supports a custom name and keeps candidate prose in third person", () => {
    const game = createGame({ gender: "女", difficulty: "标准", personality, seed: "custom-name" });
    const candidateId = game.view.candidates[0].id;
    selectCandidate(game, candidateId, "秦照雪");
    expect(game.view.candidates[0].name).toBe("秦照雪");
    expect(game.view.narrative[0].text).toContain("秦照雪");
    expect(game.view.narrative[0].text).not.toMatch(/(^|[^“「『])我/);
  });

  it("names the exact sect and records concrete origin facts", () => {
    const candidates = Array.from({ length: 80 }, (_, rerollIndex) => generateCandidates("specific-sect", rerollIndex, "男")).flat();
    const genericTitles = /^(普通村庄农户|铁匠家庭|边境巡守之家|采药人与乡医|没落魂师家族旁支|武魂分殿杂役家庭|商队随行家庭|来历不明的收养子|猎户家庭|河港渔家|初级魂师学院雇工家庭|小贵族旁支|流民新垦家庭|酒馆帮工家庭|采石场石工家庭|游方医者家庭|魂师宗门附属村民)$/;
    for (const candidate of candidates) {
      expect(candidate.public.originName).not.toMatch(genericTitles);
      expect(candidate.public.originFacts.map((fact) => fact.label)).toEqual(["家庭", "归属", "生计", "眼前事"]);
    }
    const sectOrigins = candidates.filter((candidate) => /七宝琉璃宗|蓝电霸王龙宗/.test(candidate.public.originName));
    expect(sectOrigins.length).toBeGreaterThan(0);
    for (const candidate of sectOrigins) {
      expect(candidate.public.originName).not.toBe("魂师宗门附属村民");
      expect(candidate.public.originFacts.find((fact) => fact.label === "归属")?.value).toMatch(/七宝琉璃宗|蓝电霸王龙宗/);
      expect(candidate.public.startingRelations.every((relation) => !/^(家人|觉醒魂师)$/.test(relation.name))).toBe(true);
    }
  });

  it("uses personality answers to change the opening actions", () => {
    const bold = createGame({ gender: "男", difficulty: "标准", personality: { keywords: ["勇敢", "重情", "独立"], answers: { danger: "rush", injustice: "intervene", authority: "resist" } }, seed: "personality-impact" });
    const careful = createGame({ gender: "男", difficulty: "标准", personality: { keywords: ["谨慎", "冷静", "耐心"], answers: { danger: "observe", injustice: "scheme", authority: "question" } }, seed: "personality-impact" });
    selectCandidate(bold, bold.view.candidates[0].id);
    selectCandidate(careful, careful.view.candidates[0].id);
    expect(bold.view.suggestions).not.toEqual(careful.view.suggestions);
  });
});
