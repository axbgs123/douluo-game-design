import { describe, expect, it } from "vitest";
import {
  BIRTH_PROFILE_COUNT,
  CORE_ORIGIN_COUNT,
  CORE_ORIGIN_MECHANIC_SIGNATURE_COUNT,
  CORE_ORIGIN_UNIQUE_NAME_COUNT,
  MARTIAL_SOUL_CATALOG_STATS,
  ORIGIN_CURATION_STATS,
  awakenCharacter,
  createGame,
  createEraSuccessor,
  finalizeCharacterShaping,
  generateCandidates,
  martialSoulMultiplicity,
  rerollCandidates,
  rerollCharacterShaping,
  selectCandidate,
  selectLifeGoal,
} from "./generator.js";
import { MARTIAL_SOUL_GRADE_ORDER, martialSoulGrade, normalizeMartialSoulName } from "../../shared/martial-soul.js";
import type { MetaProgressionView } from "../../shared/game.js";
import { fixedTraitEffect } from "./traits.js";
import { auditNarrative, sanitizeNarrativeSuggestions } from "./story-rules.js";
import { META_MARTIAL_SOUL_POOL_SIZE, META_MARTIAL_SOULS, metaSoulById } from "../data/meta-martial-souls.js";
import { ORIGINAL_MARTIAL_SOUL_CURATION_STATS } from "../data/original-martial-souls.js";
import { advanceWorldTime } from "./world.js";

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
  it("keeps a compact summon pool and only representative low-grade original souls", () => {
    expect(META_MARTIAL_SOUL_POOL_SIZE).toBeGreaterThanOrEqual(180);
    expect(META_MARTIAL_SOUL_POOL_SIZE).toBeLessThan(260);
    expect(ORIGINAL_MARTIAL_SOUL_CURATION_STATS).toMatchObject({ before: 432, after: 98, byGrade: { 平凡: 6, 优秀: 8, 稀有: 12, 传奇: 72 } });
    expect(new Set(META_MARTIAL_SOULS.map((item) => item.name)).size).toBe(META_MARTIAL_SOULS.length);
    expect(META_MARTIAL_SOULS.every((item) => item.growthRoutes.length >= 3)).toBe(true);
    expect(META_MARTIAL_SOULS.some((item) => item.id === "catalog-original-1-1")).toBe(false);
    expect(metaSoulById("catalog-original-1-1")).toBeDefined();
  });
  it("repeats exactly for the same seed and reroll index", () => {
    const first = generateCandidates("fixed-seed", 0, "男");
    const second = generateCandidates("fixed-seed", 0, "男");
    expect(second).toEqual(first);
  });

  it("keeps every martial soul at the same quality when a multi-soul character appears", () => {
    const candidates = generateCandidates("multi-quality-38", 0, "男", { origin: "特殊", martialSoul: "均衡", gift: "均衡" });
    const multiSoul = candidates.find((candidate) => (candidate.martialSouls?.length ?? 1) > 1);
    expect(multiSoul).toBeDefined();
    expect(new Set(multiSoul!.martialSouls!.map((soul) => soul.grade))).toEqual(new Set([multiSoul!.martialSoul.grade]));
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

  it("uses a curated origin pool with one stable representative home per identity", () => {
    expect(ORIGIN_CURATION_STATS).toMatchObject({ before: 151, after: 80, byTier: { 平凡: 4, 优秀: 6, 稀有: 10, 传奇: 44, 神话: 16 } });
    expect(BIRTH_PROFILE_COUNT).toBeGreaterThanOrEqual(60);
    expect(BIRTH_PROFILE_COUNT).toBeLessThan(100);
    expect(CORE_ORIGIN_COUNT).toBe(BIRTH_PROFILE_COUNT);
    expect(CORE_ORIGIN_UNIQUE_NAME_COUNT).toBe(CORE_ORIGIN_COUNT);
    expect(CORE_ORIGIN_MECHANIC_SIGNATURE_COUNT).toBe(CORE_ORIGIN_COUNT);
    const candidates = Array.from({ length: 30 }, (_, rerollIndex) => generateCandidates("birth-map", rerollIndex, "男")).flat();
    expect(candidates.every((candidate) => candidate.public.birthProfileId && candidate.public.dwelling.includes(" · "))).toBe(true);
    expect(candidates.every((candidate) => candidate.public.birthProfileId === candidate.originId)).toBe(true);
    expect(candidates.every((candidate) => candidate.public.mapX >= 0 && candidate.public.mapX <= 100 && candidate.public.mapY >= 0 && candidate.public.mapY <= 100)).toBe(true);
  });

  it("uses all five visible rarity levels", () => {
    const rarities = new Set(Array.from({ length: 220 }, (_, rerollIndex) => generateCandidates("rarity-palette", rerollIndex, "女")).flat().map((candidate) => candidate.public.rarity));
    expect(rarities).toEqual(new Set(["平凡", "优秀", "稀有", "传奇", "神话"]));
  }, 10_000);

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
      martialSoulCodex: [{ id: "white-stone-shield", name: "河纹石盾", category: "器武魂", description: "普通石盾", rarity: "白色", charges: 0, unlimited: true, completedRuns: 1, enabled: true, initialSoulPowers: [3], growthRoutes: ["防御"] }],
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
    const originalOriginIds = new Set(game.hiddenCandidates.map((candidate) => candidate.originId));
    rerollCandidates(game);
    expect(game.view.seed).toBe("reroll-seed");
    expect(game.view.rerollIndex).toBe(1);
    expect(game.view.candidates).not.toEqual(original);
    expect(game.hiddenCandidates.every((candidate) => !originalOriginIds.has(candidate.originId))).toBe(true);
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

  it("does not repeat the same sentence inside a candidate introduction", () => {
    const candidates = Array.from({ length: 240 }, (_, rerollIndex) =>
      generateCandidates("origin-copy-deduplication", rerollIndex, rerollIndex % 2 ? "男" : "女"),
    ).flat();
    for (const candidate of candidates) {
      const sentences = candidate.public.originSummary
        .split(/(?<=[。！？])/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
      expect(new Set(sentences).size, candidate.public.originSummary).toBe(sentences.length);
    }
  });

  it("keeps names distinct within each draw and varied across rerolls", () => {
    const draws = Array.from({ length: 300 }, (_, rerollIndex) =>
      generateCandidates("screened-chinese-name-pool", rerollIndex, rerollIndex % 2 ? "男" : "女"),
    );
    expect(draws.every((draw) => new Set(draw.map((candidate) => candidate.public.name)).size === 3)).toBe(true);
    const allNames = draws.flat().map((candidate) => candidate.public.name);
    expect(new Set(allNames).size).toBeGreaterThanOrEqual(820);
  });

  it("draws three different opening styles whenever the era pool permits it", () => {
    for (let rerollIndex = 0; rerollIndex < 180; rerollIndex += 1) {
      const candidates = generateCandidates("opening-style-diversity", rerollIndex, rerollIndex % 2 ? "男" : "女");
      expect(new Set(candidates.map((candidate) => candidate.public.openingStyle)).size).toBe(3);
    }
  });

  it("supports a beast-raised route and a truly unbound arrival without invented local ties", () => {
    const beast = generateCandidates("beast-raised-opening", 0, "男", { origin: "凶兽养成", martialSoul: "均衡", gift: "均衡" })[0];
    expect(beast.originId).toBe("fierce-beast-raised");
    expect(beast.public.openingStyle).toBe("凶兽养成");

    const unbound = generateCandidates("unbound-opening", 0, "女", { origin: "无羁绊", martialSoul: "均衡", gift: "均衡" })[0];
    expect(unbound.originId).toBe("void-arrival-unbound");
    expect(unbound.public.openingStyle).toBe("无羁绊异客");
    expect(unbound.public.startingRelations).toHaveLength(0);
    expect(unbound.public.household.structure).toBe("独身无监护");
    expect(unbound.public.originBurden).toContain("合法身份");
  });

  it("guarantees the selected gold-finger route and reveals it at awakening", () => {
    const routes = [
      ["签到系统", "万象签到系统"], ["加点面板", "勤修加点面板"], ["人生模拟器", "命运片段模拟器"],
      ["任务系统", "等价任务系统"], ["图鉴系统", "武魂生态图鉴"],
    ] as const;
    for (const [preference, systemName] of routes) {
      const meta = { weightPreferences: { origin: "均衡", martialSoul: "均衡", gift: preference }, purchasedUpgrades: {}, martialSoulCodex: [] } as unknown as MetaProgressionView;
      const game = createGame({ gender: "男", difficulty: "标准", seed: `gold-finger-${preference}` }, meta);
      expect(game.view.candidates[0].giftHint).toContain(systemName);
      selectCandidate(game, game.view.candidates[0].id);
      const draft = game.view.shaping!.personalityOptions[0];
      finalizeCharacterShaping(game, { personalityId: draft.id, keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])) });
      awakenCharacter(game);
      expect(game.view.character?.specialSystem?.name).toBe(systemName);
      expect(game.view.character?.revealedGift).toContain("觉醒时完成绑定");
    }
  });

  it("offers many named sect openings, including bounded original hidden sects", () => {
    const sectDraws = Array.from({ length: 90 }, (_, rerollIndex) =>
      generateCandidates("sect-opening-variety", rerollIndex, rerollIndex % 2 ? "男" : "女", { origin: "宗门开局", martialSoul: "均衡", gift: "均衡" })[0],
    );
    const sectNames = new Set(sectDraws.map((candidate) => (candidate.public.openingStyle ?? "").replace("宗门开局 · ", "")));
    expect(sectDraws.every((candidate) => candidate.public.openingStyle?.startsWith("宗门开局 · "))).toBe(true);
    expect(sectNames.size).toBeGreaterThanOrEqual(6);
    expect([...sectNames]).toEqual(expect.arrayContaining(["七宝琉璃宗", "昊天宗", "太玄剑宗", "眠云谷", "断碑门", "栖凤岭"]));

    const hidden = generateCandidates("hidden-sect-opening", 0, "女", { origin: "隐世宗门", martialSoul: "均衡", gift: "均衡" })[0];
    expect(hidden.public.openingStyle).toMatch(/^宗门开局 · /);
    expect(hidden.roleTags).toContain("原创隐世宗门");
    expect(sectDraws.every((candidate) => !/大客卿/.test(`${candidate.public.originName}${candidate.public.originSummary}`))).toBe(true);
  });

  it("keeps hidden-sect awakening and recruitment inside the character's own sect", () => {
    const meta = {
      weightPreferences: { origin: "隐世宗门", martialSoul: "均衡", gift: "均衡" },
      purchasedUpgrades: {},
      martialSoulCodex: [],
    } as unknown as MetaProgressionView;
    for (let index = 0; index < 12; index += 1) {
      const game = createGame({ gender: index % 2 ? "男" : "女", difficulty: "标准", personality, seed: `hidden-sect-awakening-${index}` }, meta);
      const candidate = game.hiddenCandidates[0];
      const sectName = (candidate.public.openingStyle ?? "").replace("宗门开局 · ", "");
      candidate.innateSoulPower = 10;
      selectCandidate(game, candidate.public.id);
      const draft = game.view.shaping!.personalityOptions[0];
      finalizeCharacterShaping(game, { personalityId: draft.id, keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])) });
      awakenCharacter(game);
      const recruitment = game.view.tasks.find((task) => task.id === "awakening-recruitment");
      expect(recruitment?.detail).toContain(sectName);
      expect(recruitment?.detail).not.toContain("武魂殿");
    }
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
    finalizeCharacterShaping(game, { keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])) });
    expect(game.view.status).toBe("awakening");

    const character = awakenCharacter(game);
    expect(game.view.status).toBe("life_goal_selection");
    expect(game.view.character?.martialSoul.name).toBe(character.martialSoul.name);
    selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
    expect(game.view.status).toBe("playing");
  });

  it("rejects forged answers that do not belong to the selected personality draft", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "forged-shaping-answers" });
    selectCandidate(game, game.view.candidates[0].id);
    const draft = game.view.shaping!.personalityOptions[0];

    expect(() => finalizeCharacterShaping(game, {
      personalityId: draft.id,
      keywords: draft.keywords,
      answers: Object.fromEntries(draft.questions.map((question) => [question.id, "forged-option"])),
    })).toThrow("请完成当前性格方案的全部情境题");
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
    expect(game.view.shaping?.lifeGoalOptions).toEqual([]);
    expect(game.view.lifeGoal).toBe("尚未决定");
    expect(game.view.shaping?.personalityOptions.some((option) => /野心|利己|复仇|危险|投机|谋士/.test(`${option.title}${option.keywords.join("")}`))).toBe(true);
    expect(game.view.shaping?.personalityOptions.every((option) => option.questions.length === 6)).toBe(true);

    const draft = game.view.shaping!.personalityOptions[0];
    finalizeCharacterShaping(game, { keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])) });
    awakenCharacter(game);
    expect(game.view.status).toBe("life_goal_selection");
    expect(game.view.shaping?.lifeGoalOptions).toHaveLength(3);
    expect(game.view.shaping?.lifeGoalDifficulties).toHaveLength(3);
    expect(game.view.shaping?.lifeGoalOptions.every((goal) => goal.length >= 18)).toBe(true);

    const previousGoals = game.view.shaping!.lifeGoalOptions;
    rerollCharacterShaping(game, "goals", [0]);
    expect(game.view.shaping!.lifeGoalOptions[0]).toBe(previousGoals[0]);
    expect(new Set(game.view.shaping!.lifeGoalOptions).size).toBe(3);
    expect(game.view.shaping!.lifeGoalOptions).not.toEqual(previousGoals);
  });

  it("keeps combat martial souls away from support-only life goals", () => {
    for (let index = 0; index < 24; index += 1) {
      const game = createGame({ gender: "男", difficulty: "标准", seed: `combat-goal-fit-${index}` });
      const hidden = game.hiddenCandidates[0];
      hidden.martialSoul = { id: "combat-sword", name: "重锋战剑", category: "器武魂", description: "纯粹强攻、破甲与近战爆发", rarity: 5, soulPowerRange: [5, 9], omens: [], affinityTags: ["强攻", "攻击"] };
      hidden.martialSouls = [hidden.martialSoul];
      selectCandidate(game, hidden.public.id);
      finalizeCharacterShaping(game, { keywords: ["勇敢", "好胜", "专注"], answers: {} });
      awakenCharacter(game);
      expect(game.view.shaping!.lifeGoalOptions).not.toContain("成为大陆公认的第一辅助魂师，让强攻系封号斗罗主动请求合作");
    }
  });

  it("lets the owning sect conduct awakening and alerts the matching canon expert", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "seven-treasure-seven-kill" });
    const hidden = game.hiddenCandidates[0];
    hidden.originId = "seven-treasure-core";
    hidden.roleTags = ["七宝琉璃宗", "内门"];
    hidden.public.originName = "七宝琉璃宗内门子弟";
    hidden.public.location = "七宝琉璃宗城堡";
    hidden.public.startingRelations = [{ name: "七宝觉醒教习", relation: "所属势力觉醒魂师", impression: "等待结果", faction: "七宝琉璃宗", strength: 20, category: "势力" }];
    hidden.martialSoul = { id: "test-seven-kill", name: "七杀剑", category: "器武魂", description: "纯攻击剑武魂", rarity: 1, soulPowerRange: [10, 10], omens: [], grade: "传奇", sourceEra: 1, affinityTags: ["七宝琉璃宗", "剑"] };
    hidden.martialSouls = [hidden.martialSoul];
    hidden.innateSoulPower = 10;
    selectCandidate(game, hidden.public.id);
    finalizeCharacterShaping(game, { keywords: ["勇敢", "专注", "审慎"], answers: {} });
    awakenCharacter(game);
    expect(game.view.tasks.find((task) => task.id === "awakening-recruitment")?.title).toContain("七宝琉璃宗");
    expect(game.view.tasks.find((task) => task.id === "awakening-recruitment")?.detail).not.toContain("武魂殿");
    expect(game.view.tasks.find((task) => task.id === "lineage-notable-attention")?.title).toContain("尘心");
    expect(game.world.dynamicEvents.at(-1)?.participantIds).toContain("chen-xin");
    expect(game.view.character?.reputation).toContain("七宝琉璃宗");
    expect(game.view.suggestions.some((suggestion) => suggestion.includes("七宝琉璃宗"))).toBe(true);
    expect(game.view.suggestions.every((suggestion) => !suggestion.includes("武魂殿"))).toBe(true);
  });

  it("makes powerful martial souls more likely to draw harder life goals", () => {
    let weakExtreme = 0;
    let strongExtreme = 0;
    for (let index = 0; index < 80; index += 1) {
      const weak = createGame({ gender: "男", difficulty: "标准", seed: `goal-power-${index}` });
      weak.hiddenCandidates[0].martialSoul = { id: "weak-test", name: "细木棍", category: "器武魂", description: "测试", rarity: 20, soulPowerRange: [0, 3], omens: [] };
      weak.hiddenCandidates[0].martialSouls = [weak.hiddenCandidates[0].martialSoul];
      weak.hiddenCandidates[0].innateSoulPower = 1;
      selectCandidate(weak, weak.view.candidates[0].id);
      finalizeCharacterShaping(weak, { keywords: ["谨慎", "耐心", "好学"], answers: {} });
      awakenCharacter(weak);
      weakExtreme += weak.view.shaping!.lifeGoalDifficulties.filter((item) => item === "极难").length;

      const strong = createGame({ gender: "男", difficulty: "标准", seed: `goal-power-${index}` });
      strong.hiddenCandidates[0].martialSoul = { id: "strong-test", name: "祖龙", category: "兽武魂", description: "测试", rarity: 1, soulPowerRange: [9, 10], omens: [], metaRarity: "七彩" };
      strong.hiddenCandidates[0].martialSouls = [strong.hiddenCandidates[0].martialSoul];
      strong.hiddenCandidates[0].innateSoulPower = 10;
      selectCandidate(strong, strong.view.candidates[0].id);
      finalizeCharacterShaping(strong, { keywords: ["勇敢", "野心", "好胜"], answers: {} });
      awakenCharacter(strong);
      strongExtreme += strong.view.shaping!.lifeGoalDifficulties.filter((item) => item === "极难").length;
    }
    expect(strongExtreme).toBeGreaterThan(weakExtreme * 2);
  });

  it("loads martial souls recorded across all four eras", () => {
    expect(MARTIAL_SOUL_CATALOG_STATS.total).toBeGreaterThanOrEqual(250);
    expect(MARTIAL_SOUL_CATALOG_STATS.total).toBeLessThan(350);
    for (const era of [1, 2, 3, 4]) expect(MARTIAL_SOUL_CATALOG_STATS.bySource[era]).toBeGreaterThanOrEqual(12);
  });

  it("keeps twin souls rare and triple souls extremely rare, with identity exceptions", () => {
    expect(martialSoulMultiplicity(0.5, "神话", false)).toBe(1);
    expect(martialSoulMultiplicity(0.02, "神话", false)).toBe(2);
    expect(martialSoulMultiplicity(0.0005, "神话", false)).toBe(3);
    expect(martialSoulMultiplicity(0.1, "神话", true)).toBe(2);
    expect(martialSoulMultiplicity(0.005, "神话", true)).toBe(3);
  });

  it("keeps additional martial souls private until the player chooses disclosure and primary cultivation", () => {
    const game = createGame({ gender: "女", difficulty: "标准", seed: "multi-awakening-view" });
    const hidden = game.hiddenCandidates[0];
    hidden.martialSouls = [hidden.martialSoul, { ...hidden.martialSoul, id: "second-test-soul", name: "测试副武魂", category: "本体武魂" }];
    selectCandidate(game, game.view.candidates[0].id);
    finalizeCharacterShaping(game, { keywords: ["谨慎", "好奇", "坚韧"], answers: {} });
    awakenCharacter(game);
    expect(game.view.character?.martialSouls).toHaveLength(2);
    expect(game.view.character?.publiclyKnownMartialSoulIndices).toEqual([0]);
    expect(game.view.narrative.at(-1)?.text).not.toContain("双生武魂");
    expect(game.view.narrative.at(-1)?.text).toContain("执事正转身去取水晶球，没有看见");
    expect(game.view.suggestions).toContain("暂不显露第二武魂，回住处后单独测试");
    expect(game.view.suggestions.every((suggestion) => !suggestion.includes("测试副武魂"))).toBe(true);
    selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0], { activeMartialSoulIndex: 1, publiclyKnownMartialSoulIndices: [0] });
    expect(game.view.character?.martialSoul.name).toBe("测试副武魂");
    expect(game.view.character?.martialSouls[1].cultivationState).toBe("主修");
    expect(game.view.narrative.at(-1)?.text).toContain("阵外的人只看见");
  });

  it("turns a publicly revealed dual martial soul into resource priority, recruitment competition, and staged hostile risk", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "public-dual-soul-world-reaction" });
    const hidden = game.hiddenCandidates[0];
    hidden.innateSoulPower = 10;
    hidden.martialSouls = [hidden.martialSoul, { ...hidden.martialSoul, id: "public-second-soul", name: "公开副武魂", category: "器武魂" }];
    selectCandidate(game, hidden.public.id);
    finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(game);
    selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0], { activeMartialSoulIndex: 0, publiclyKnownMartialSoulIndices: [0, 1] });

    expect(Number(game.world.flags.talentResourcePriority)).toBeGreaterThanOrEqual(80);
    expect(Number(game.world.flags.talentRecruitmentPressure)).toBeGreaterThanOrEqual(3);
    expect(Number(game.world.flags.talentHostileRisk)).toBeGreaterThanOrEqual(4);
    expect(game.view.tasks.find((task) => task.id === "awakening-recruitment")?.detail).toMatch(/导师面谈|训练场时段|第一魂环评估/);
    expect(game.world.dynamicEvents.some((event) => event.id === "talent-recruitment-competition")).toBe(true);
    expect(game.view.intelligence.some((item) => item.subjectId === "talent-recruitment-competition")).toBe(true);

    advanceWorldTime(game, 3_600 * 1_440);
    expect(Number(game.world.flags.talentThreatStage)).toBeGreaterThanOrEqual(3);
    expect(game.world.dynamicEvents.some((event) => event.title.includes("袭击准备"))).toBe(true);
  });

  it("explains the gameplay impact of identity-fixed traits", () => {
    expect(fixedTraitEffect("戒备")).toContain("风险判断");
    expect(fixedTraitEffect("好胜")).toContain("公开失败");
    const game = createGame({ gender: "男", difficulty: "标准", seed: "fixed-trait-effect" });
    selectCandidate(game, game.view.candidates[2].id);
    expect(game.view.shaping?.fixedTraitEffects.every((item) => item.effect.length > 12)).toBe(true);
  });

  it("turns exceptional awakening talent into concrete faction attention", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "full-soul-power-attention" });
    game.hiddenCandidates[0].innateSoulPower = 10;
    selectCandidate(game, game.view.candidates[0].id);
    finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(game);
    expect(game.world.flags.awakeningAttention).toBe("最高优先");
    expect(game.view.tasks.some((task) => task.id === "awakening-recruitment")).toBe(true);
    expect(game.world.dynamicEvents.some((event) => /内部培养评估/.test(event.title) && event.status === "可介入")).toBe(true);
    expect(game.view.narrative.at(-1)?.text).toMatch(/叫停了下一人的仪式|队伍晚走半个时辰/);
    expect(game.view.suggestions.some((suggestion) => /备用水晶复测魂力/.test(suggestion))).toBe(true);
    expect(game.view.suggestions.every((suggestion) => !/查看地图|查看新事件|观察周围|继续行动/.test(suggestion))).toBe(true);
  });

  it("keeps deterministic Chinese-webnovel choices ahead of generic or knowledge-leaking model choices", () => {
    const game = createGame({ gender: "女", difficulty: "标准", seed: "grounded-choice-filter" });
    const hidden = game.hiddenCandidates[0];
    hidden.martialSouls = [hidden.martialSoul, { ...hidden.martialSoul, id: "secret-soul", name: "不可见副武魂" }];
    selectCandidate(game, hidden.public.id);
    finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(game);
    const suggestions = sanitizeNarrativeSuggestions(
      game,
      ["查看地图", "把不可见副武魂告诉唐三", "继续行动"],
      game.view.suggestions,
    );
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((item) => item.length >= 8 && item.length <= 28)).toBe(true);
    expect(suggestions.every((item) => !/查看地图|查看新事件|观察周围|继续行动|不可见副武魂|唐三/.test(item))).toBe(true);
    expect(suggestions.some((item) => /魂环|修炼|武魂/.test(item))).toBe(true);
    expect(suggestions.some((item) => /主持者|教习|培养|复核|条件/.test(item))).toBe(true);
  });

  it("replaces vague screenshot-style choices with canon-grounded awakening actions", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "canon-grounded-awakening-buttons" });
    game.hiddenCandidates[0].innateSoulPower = 10;
    selectCandidate(game, game.hiddenCandidates[0].public.id);
    finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(game);
    const suggestions = sanitizeNarrativeSuggestions(game, [], ["把眼前的事情做完", "回应身边正在等的人", `当场召出${game.view.character!.martialSoul.name}，请主持者指出第一处缺陷`]);
    expect(suggestions).toHaveLength(3);
    expect(suggestions).toEqual(expect.arrayContaining(["请主持者用备用水晶复测魂力"]));
    expect(suggestions.every((item) => !/把眼前|正在等的人|指出第一处缺陷/.test(item))).toBe(true);
  });

  it("uses each later era's actual awakening follow-up instead of recycling the era-one buttons", () => {
    const expected = { 2: /武魂特征/, 3: /魂师班资格/, 4: /魂力测试.*觉醒结果/ } as const;
    for (const era of [2, 3, 4] as const) {
      const game = createGame({ era, gender: "女", difficulty: "标准", seed: `era-awakening-choice-${era}` });
      game.hiddenCandidates[0].innateSoulPower = 3;
      selectCandidate(game, game.hiddenCandidates[0].public.id);
      finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
      awakenCharacter(game);
      expect(game.view.suggestions.some((item) => expected[era].test(item))).toBe(true);
      expect(game.view.suggestions.every((item) => !/把眼前|正在等的人|指出第一处缺陷/.test(item))).toBe(true);
    }
  });

  it("audits a full-soul-power awakening that produces no social or institutional reaction", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "awakening-reaction-audit" });
    game.hiddenCandidates[0].innateSoulPower = 10;
    selectCandidate(game, game.view.candidates[0].id);
    finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(game);
    expect(Number(game.world.flags.talentResourcePriority)).toBe(78);
    expect(Number(game.world.flags.talentHostileRisk)).toBe(3);
    expect(auditNarrative(game, "水晶球完全亮起。先天满魂力。众人随后各自回家。"))
      .toContain("异常觉醒结果没有引发主持者、监护者或围观者的具体反应");
  });

  it("carries a settled worldline into the next era without copying combat power", () => {
    const parent = createGame({ era: 1, gender: "男", difficulty: "标准", seed: "continuous-era-parent" });
    selectCandidate(parent, parent.view.candidates[0].id, "顾远");
    finalizeCharacterShaping(parent, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(parent);
    parent.view.character!.soulRank = 72;
    parent.view.runProgress.highestSoulRank = 72;
    parent.world.metrics.historicalImpact = 24;
    parent.view.status = "ended";
    parent.view.runProgress.ending = "守住旧日宗门";
    parent.view.runProgress.settlement = { ending: "守住旧日宗门", baseScore: 80, multiplier: 1, legacyPoints: 80, highlights: [], qualified: true };
    parent.view.managedFactions.push({ id: "old-sect", name: "远山门", role: "宗主", members: 48, resources: 130, territory: ["远山谷"], departments: ["外务堂"], internalIssues: [] });
    parent.view.economy.business = "远山药材行";

    const successor = createEraSuccessor(parent);
    expect(successor.view.id).toBe(parent.view.id);
    expect(successor.view.era).toBe(2);
    expect(successor.view.worldInheritance).toMatchObject({ ancestorName: "顾远", sourceEra: 1, targetEra: 2, highestSoulRank: 72 });
    expect(successor.view.worldInheritance?.lineage.map((item) => item.name)).toEqual(["顾远"]);
    expect(successor.view.worldInheritance?.branches).toEqual([]);
    expect(successor.view.worldInheritance?.chronology).toHaveLength(4);
    expect(successor.view.worldInheritance?.chronology.map((event) => event.year)).toEqual([...successor.view.worldInheritance!.chronology.map((event) => event.year)].sort((a, b) => a - b));
    expect(successor.view.worldInheritance?.chronology.filter((event) => event.source.includes("系统推演假说"))).toHaveLength(2);
    expect(successor.view.worldInheritance?.institutions.map((item) => item.name)).toEqual(["远山门", "远山药材行"]);
    expect(successor.view.managedFactions).toHaveLength(0);
    expect(successor.view.economy.business).toBeUndefined();
    expect(successor.view.candidates.every((candidate) => candidate.originFacts.some((fact) => fact.label === "旧世回声"))).toBe(true);
    selectCandidate(successor, successor.view.candidates[0].id);
    finalizeCharacterShaping(successor, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(successor);
    expect(successor.view.character?.age).toBe(6);
    expect(successor.view.character?.soulRank).not.toBe(72);
    expect(successor.view.inventory).toContain("旧世档案 · 顾远");
    expect(successor.view.tasks.some((task) => task.id === "inherited-worldline")).toBe(true);
    expect(successor.view.intelligence.some((item) => item.title.includes("顾远"))).toBe(true);

    successor.view.status = "ended";
    successor.view.runProgress.ending = "第二代完成远行";
    successor.view.runProgress.settlement = { ending: "第二代完成远行", baseScore: 60, multiplier: 1, legacyPoints: 60, highlights: [], qualified: true };
    const secondEraInstitution = successor.view.worldInheritance!.institutions.find((item) => item.name === "远山门")!;
    secondEraInstitution.claimStatus = "有限承认";
    secondEraInstitution.currentEvidence = ["斗二当代登记证据"];
    secondEraInstitution.recognizedRight = "斗二档案查阅权";
    const thirdEra = createEraSuccessor(successor);
    expect(thirdEra.view.worldInheritance?.lineage).toHaveLength(2);
    expect(thirdEra.view.worldInheritance?.chronology).toHaveLength(8);
    expect(thirdEra.view.worldInheritance?.lineage[0].name).toBe("顾远");
    expect(thirdEra.view.worldInheritance?.lineage[1].name).toBe(successor.view.character!.name);
    expect(thirdEra.view.worldInheritance?.institutions.find((item) => item.name === "远山门")?.state).toBe("碎片传承");
    expect(thirdEra.view.worldInheritance?.institutions.find((item) => item.name === "远山门")).toMatchObject({ claimStatus: "未主张", currentEvidence: [] });
    expect(thirdEra.view.worldInheritance?.institutions.find((item) => item.name === "远山门")?.recognizedRight).toBeUndefined();
  });
});
