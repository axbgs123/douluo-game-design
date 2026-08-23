import { describe, expect, it } from "vitest";
import {
  BIRTH_PROFILE_COUNT,
  CORE_ORIGIN_COUNT,
  CORE_ORIGIN_MECHANIC_SIGNATURE_COUNT,
  CORE_ORIGIN_UNIQUE_NAME_COUNT,
  awakenCharacter,
  createGame,
  finalizeCharacterShaping,
  generateCandidates,
  rerollCandidates,
  rerollCharacterShaping,
  selectCandidate,
} from "./generator.js";
import { MARTIAL_SOUL_GRADE_ORDER, martialSoulGrade, normalizeMartialSoulName } from "../../shared/martial-soul.js";
import type { MetaProgressionView } from "../../shared/game.js";

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

  it("guarantees a rare route and tells informed characters what they know", () => {
    const candidates = generateCandidates("rare-opening", 0, "女");
    const rare = candidates.filter((candidate) => ["稀有", "传奇", "神话"].includes(candidate.public.rarity));
    expect(rare.length).toBeGreaterThan(0);
    expect(rare.every((candidate) => candidate.innateSoulPower >= 5)).toBe(true);
    expect(candidates.every((candidate) => candidate.public.selfKnowledge.length > 0 && candidate.public.knownBackground.length > 20)).toBe(true);
  });

  it("contains at least one thousand concrete birth profiles with exact homes", () => {
    expect(BIRTH_PROFILE_COUNT).toBeGreaterThanOrEqual(1000);
    expect(CORE_ORIGIN_COUNT).toBe(1000);
    expect(CORE_ORIGIN_UNIQUE_NAME_COUNT).toBe(1000);
    expect(CORE_ORIGIN_MECHANIC_SIGNATURE_COUNT).toBe(1000);
    expect(BIRTH_PROFILE_COUNT).toBe(36000);
    const candidates = Array.from({ length: 30 }, (_, rerollIndex) => generateCandidates("birth-map", rerollIndex, "男")).flat();
    expect(candidates.every((candidate) => candidate.public.birthProfileId && candidate.public.dwelling.includes(" · "))).toBe(true);
    expect(candidates.every((candidate) => candidate.public.mapX >= 0 && candidate.public.mapX <= 100 && candidate.public.mapY >= 0 && candidate.public.mapY <= 100)).toBe(true);
  });

  it("uses all five visible rarity levels", () => {
    const rarities = new Set(Array.from({ length: 220 }, (_, rerollIndex) => generateCandidates("rarity-palette", rerollIndex, "女")).flat().map((candidate) => candidate.public.rarity));
    expect(rarities).toEqual(new Set(["平凡", "优秀", "稀有", "传奇", "神话"]));
  });

  it("never gives a character a martial soul below the origin rarity", () => {
    const candidates = Array.from({ length: 180 }, (_, rerollIndex) => generateCandidates("soul-prestige-match", rerollIndex, "男")).flat();
    for (const candidate of candidates) {
      const identityIndex = MARTIAL_SOUL_GRADE_ORDER.indexOf(candidate.public.rarity);
      const soulIndex = MARTIAL_SOUL_GRADE_ORDER.indexOf(candidate.martialSoul.grade!);
      expect(soulIndex).toBeGreaterThanOrEqual(0);
      expect(soulIndex).toBeGreaterThanOrEqual(identityIndex);
    }
  });

  it("uses restrained names for ordinary souls and elevated names for mythic souls", () => {
    expect(martialSoulGrade("蓝银草", undefined, 4)).toBe("平凡");
    expect(normalizeMartialSoulName("霜戈")).toBe("玄霜破军戈");
    expect(martialSoulGrade("玄霜破军戈", undefined, 10)).toBe("神话");
    expect(normalizeMartialSoulName("噬影血藤")).toBe("九幽噬影血藤");
  });

  it("does not let an enabled low-grade codex soul overwrite a high-grade origin", () => {
    const meta = {
      weightPreferences: { origin: "天骄", martialSoul: "均衡", gift: "均衡" },
      purchasedUpgrades: {},
      martialSoulCodex: [{ id: "white-stone-shield", name: "河纹石盾", category: "器武魂", description: "普通石盾", rarity: "白色", charges: 0, completedRuns: 1, enabled: true, initialSoulPowers: [3], growthRoutes: ["防御"] }],
    } as MetaProgressionView;
    for (let index = 0; index < 80; index += 1) {
      const game = createGame({ gender: "男", difficulty: "标准", seed: `codex-grade-${index}` }, meta);
      for (const candidate of game.hiddenCandidates) {
        expect(MARTIAL_SOUL_GRADE_ORDER.indexOf(candidate.martialSoul.grade ?? "平凡"))
          .toBeGreaterThanOrEqual(MARTIAL_SOUL_GRADE_ORDER.indexOf(candidate.public.rarity));
      }
    }
  });

  it("changes candidates on reroll while preserving the seed", () => {
    const game = createGame({ gender: "男", difficulty: "困难", personality, seed: "reroll-seed" });
    const original = game.view.candidates;
    rerollCandidates(game);
    expect(game.view.seed).toBe("reroll-seed");
    expect(game.view.rerollIndex).toBe(1);
    expect(game.view.candidates).not.toEqual(original);
  });

  it("keeps every awakening within five years of Tang San", () => {
    const candidates = Array.from({ length: 40 }, (_, rerollIndex) =>
      generateCandidates("timeline-window", rerollIndex, "男"),
    ).flat();

    for (const candidate of candidates) {
      const years = candidate.public.eraRelation.match(/(\d+) 年/)?.[1];
      if (years) expect(Number(years)).toBeLessThanOrEqual(5);
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
    expect(game.view.status).toBe("character_shaping");
    expect(game.view.character).toBeUndefined();
    expect(game.view.narrative[0].text).not.toMatch(/你熟悉|你认识|你见过|你从小/);

    const draft = game.view.shaping!.personalityOptions[0];
    finalizeCharacterShaping(game, { keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])), lifeGoal: game.view.shaping!.lifeGoalOptions[0] });
    expect(game.view.status).toBe("awakening");

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
    const candidates = Array.from({ length: 160 }, (_, rerollIndex) => generateCandidates("specific-sect", rerollIndex, "男", { origin: "权贵", martialSoul: "均衡", gift: "均衡" })).flat();
    const genericTitles = /^(普通村庄农户|铁匠家庭|边境巡守之家|采药人与乡医|没落魂师家族旁支|武魂分殿杂役家庭|商队随行家庭|来历不明的收养子|猎户家庭|河港渔家|初级魂师学院雇工家庭|小贵族旁支|流民新垦家庭|酒馆帮工家庭|采石场石工家庭|游方医者家庭|魂师宗门附属村民)$/;
    for (const candidate of candidates) {
      expect(candidate.public.originName).not.toMatch(genericTitles);
      expect(candidate.public.originFacts.map((fact) => fact.label)).toEqual(["家庭", "归属", "生计", "眼前事", "开局优势", "身份代价"]);
    }
    const sectOrigins = candidates.filter((candidate) => /七宝琉璃宗|蓝电霸王龙宗/.test(candidate.public.originName));
    expect(sectOrigins.length).toBeGreaterThan(0);
    for (const candidate of sectOrigins) {
      expect(candidate.public.originName).not.toBe("魂师宗门附属村民");
      expect(candidate.public.originFacts.find((fact) => fact.label === "归属")?.value).toMatch(/七宝琉璃宗|蓝电霸王龙宗/);
      expect(candidate.public.startingRelations.every((relation) => !/^(家人|觉醒魂师)$/.test(relation.name))).toBe(true);
    }
  });

  it("draws concrete goals, dark personalities and identity-based questions after selection", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "personality-impact" });
    selectCandidate(game, game.view.candidates[2].id);
    expect(game.view.shaping?.lifeGoalOptions).toHaveLength(3);
    expect(game.view.shaping?.lifeGoalDifficulties).toHaveLength(3);
    expect(game.view.shaping?.lifeGoalOptions.every((goal) => goal.length >= 18)).toBe(true);
    expect(game.view.shaping?.personalityOptions.some((option) => /野心|利己|复仇|危险|投机|谋士/.test(`${option.title}${option.keywords.join("")}`))).toBe(true);
    expect(game.view.shaping?.personalityOptions.every((option) => option.questions.length === 6)).toBe(true);

    const previousGoals = game.view.shaping!.lifeGoalOptions;
    rerollCharacterShaping(game, "goals");
    expect(game.view.shaping!.lifeGoalOptions).not.toEqual(previousGoals);
  });

  it("makes powerful martial souls more likely to draw harder life goals", () => {
    let weakExtreme = 0;
    let strongExtreme = 0;
    for (let index = 0; index < 80; index += 1) {
      const weak = createGame({ gender: "男", difficulty: "标准", seed: `goal-power-${index}` });
      weak.hiddenCandidates[0].martialSoul = { id: "weak-test", name: "细木棍", category: "器武魂", description: "测试", rarity: 20, soulPowerRange: [0, 3], omens: [] };
      weak.hiddenCandidates[0].innateSoulPower = 1;
      selectCandidate(weak, weak.view.candidates[0].id);
      weakExtreme += weak.view.shaping!.lifeGoalDifficulties.filter((item) => item === "极难").length;

      const strong = createGame({ gender: "男", difficulty: "标准", seed: `goal-power-${index}` });
      strong.hiddenCandidates[0].martialSoul = { id: "strong-test", name: "祖龙", category: "兽武魂", description: "测试", rarity: 1, soulPowerRange: [9, 10], omens: [], metaRarity: "七彩" };
      strong.hiddenCandidates[0].innateSoulPower = 10;
      selectCandidate(strong, strong.view.candidates[0].id);
      strongExtreme += strong.view.shaping!.lifeGoalDifficulties.filter((item) => item === "极难").length;
    }
    expect(strongExtreme).toBeGreaterThan(weakExtreme * 2);
  });
});
