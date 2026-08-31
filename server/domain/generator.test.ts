import { describe, expect, it } from "vitest";
import {
  BIRTH_PROFILE_COUNT,
  ACTIVE_ORIGIN_IDS,
  CORE_ORIGIN_COUNT,
  CORE_ORIGIN_MECHANIC_SIGNATURE_COUNT,
  CORE_ORIGIN_UNIQUE_NAME_COUNT,
  MARTIAL_SOUL_CATALOG_STATS,
  ORIGIN_CURATION_STATS,
  SECT_AWAKENING_CONTEXTS,
  awakeningManifestation,
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
import type { MartialSoulTemplate } from "./model.js";
import { fixedTraitEffect } from "./traits.js";
import { auditNarrative, sanitizeNarrativeSuggestions } from "./story-rules.js";
import { META_MARTIAL_SOUL_POOL_SIZE, META_MARTIAL_SOULS, metaSoulById } from "../data/meta-martial-souls.js";
import { ORIGINAL_MARTIAL_SOUL_CURATION_STATS } from "../data/original-martial-souls.js";
import { advanceWorldTime, ensureGameState } from "./world.js";
import { applyActionResult, resolveAction } from "./actions.js";
import { EXPANDED_ORIGINS } from "../data/expanded-origins.js";

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
  it("keeps the four single-attribute clans on their own faction ids", () => {
    expect(SECT_AWAKENING_CONTEXTS["speed-clan-child"].factionId).toBe("speed-clan");
    expect(SECT_AWAKENING_CONTEXTS["strength-clan-child"].factionId).toBe("strength-clan");
    expect(SECT_AWAKENING_CONTEXTS["defense-clan-child"].factionId).toBe("defense-clan");
    expect(SECT_AWAKENING_CONTEXTS["breaking-clan-child"].factionId).toBe("breaking-clan");
  });
  it("keeps a compact summon pool and only representative low-grade original souls", () => {
    expect(META_MARTIAL_SOUL_POOL_SIZE).toBeGreaterThanOrEqual(180);
    expect(META_MARTIAL_SOUL_POOL_SIZE).toBeLessThan(260);
    expect(ORIGINAL_MARTIAL_SOUL_CURATION_STATS).toMatchObject({ before: 432, after: 98, byGrade: { 平凡: 6, 优秀: 8, 稀有: 12, 传奇: 72 } });
    expect(new Set(META_MARTIAL_SOULS.map((item) => item.name)).size).toBe(META_MARTIAL_SOULS.length);
    expect(META_MARTIAL_SOULS.every((item) => item.growthRoutes.length >= 3)).toBe(true);
    expect(META_MARTIAL_SOULS.some((item) => item.id === "catalog-original-1-1")).toBe(false);
    expect(metaSoulById("catalog-original-1-1")).toBeDefined();
  });

  it("uses category-specific awakening manifestations instead of putting every soul in the palm", () => {
    const soul = (name: string, category: string, description = "测试武魂"): MartialSoulTemplate => ({ id: `test-${name}`, name, category, description, rarity: 1, soulPowerRange: [1, 10], omens: [] });
    const body = awakeningManifestation("顾衡", "他", soul("先天道体", "本体武魂", "身体与骨骼发生变化"), "守碑长老");
    expect(body.manifestation).toContain("两手空空");
    expect(body.manifestation).not.toContain("托在掌心");
    expect(awakeningManifestation("顾衡", "他", soul("影猫", "兽武魂"), "教习").manifestation).toContain("身后凝出轮廓");
    expect(awakeningManifestation("顾衡", "他", soul("青藤", "植物武魂"), "教习").manifestation).toContain("掌中生长成形");
    expect(awakeningManifestation("顾衡", "他", soul("麦饼", "食物系器武魂"), "教习").manifestation).toContain("第一次制造");
    expect(awakeningManifestation("顾衡", "他", soul("寒雾", "元素武魂"), "教习").manifestation).toContain("元素形态");
    expect(awakeningManifestation("顾衡", "他", soul("长剑", "器武魂"), "教习").manifestation).toContain("器物在掌中完整成形");
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
    expect(new Set(multiSoul!.martialSouls!.map((soul) => normalizeMartialSoulName(soul.name))).size).toBe(multiSoul!.martialSouls!.length);
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
    expect(ORIGIN_CURATION_STATS).toMatchObject({ before: 151, after: 68, byTier: { 平凡: 4, 优秀: 6, 稀有: 10, 传奇: 35, 神话: 13 } });
    expect(BIRTH_PROFILE_COUNT).toBeGreaterThanOrEqual(60);
    expect(BIRTH_PROFILE_COUNT).toBeLessThan(100);
    expect(CORE_ORIGIN_COUNT).toBe(BIRTH_PROFILE_COUNT);
    expect(CORE_ORIGIN_UNIQUE_NAME_COUNT).toBe(CORE_ORIGIN_COUNT);
    expect(CORE_ORIGIN_MECHANIC_SIGNATURE_COUNT).toBe(CORE_ORIGIN_COUNT);
    const candidates = Array.from({ length: 30 }, (_, rerollIndex) => generateCandidates("birth-map", rerollIndex, "男")).flat();
    expect(candidates.every((candidate) => candidate.public.birthProfileId && candidate.public.dwelling.includes(" · "))).toBe(true);
    expect(candidates.every((candidate) => candidate.public.birthProfileId === candidate.originId)).toBe(true);
    expect(candidates.every((candidate) => candidate.public.mapX >= 0 && candidate.public.mapX <= 100 && candidate.public.mapY >= 0 && candidate.public.mapY <= 100)).toBe(true);
    expect(ACTIVE_ORIGIN_IDS).toContain("modern-transmigrator");
    expect(ACTIVE_ORIGIN_IDS).toContain("void-arrival-unbound");
    expect(ACTIVE_ORIGIN_IDS).not.toContain("alchemy-reborn");
    expect(ACTIVE_ORIGIN_IDS).not.toContain("daoist-remnant");
    expect(ACTIVE_ORIGIN_IDS).not.toContain("sword-spirit-reborn");
    const shrekNeighbor = EXPANDED_ORIGINS.find((origin) => origin.id === "shrek-neighbor")!;
    expect(`${shrekNeighbor.name}${shrekNeighbor.summary}${shrekNeighbor.advantage}`).not.toMatch(/弗兰德|预定|口头约定|受过一次指点/);
    const publicAwakening = EXPANDED_ORIGINS.find((origin) => origin.id === "temple-saint-candidate")!;
    expect(`${publicAwakening.name}${publicAwakening.summary}`).toContain("不是圣女");
    const slaughterEdge = EXPANDED_ORIGINS.find((origin) => origin.id === "slaughter-descendant")!;
    expect(`${slaughterEdge.summary}${slaughterEdge.burden}`).toMatch(/从未声称自己进入又逃出|不是杀戮之都/);
    const remnant = EXPANDED_ORIGINS.find((origin) => origin.id === "hundred-thousand-remnant")!;
    expect(`${remnant.summary}${remnant.knownBackgrounds?.join("")}${remnant.startingItems?.join("")}`).not.toMatch(/识海|精神之海|魂骨碎片/);
  });

  it("不把贵族联姻候选子弟与商队抚养、码头木板屋随机拼接", () => {
    const candidate = generateCandidates("star-luo-elite-household-coherence", 0, "男", undefined, 0, 1, [], "star-luo-spare-pair-sibling")[0].public;
    expect(candidate.birthProfileId).toBe("star-luo-spare-pair-sibling");
    expect(`${candidate.household.structure}${candidate.household.summary}${candidate.originFacts.map((item) => item.value).join("")}`).not.toMatch(/商队集体抚养|永顺商队|老账房/);
    expect(`${candidate.dwelling}${candidate.residence.building}${candidate.residence.room}`).not.toMatch(/码头仓房|木板屋|旧货栈/);
    expect(candidate.residence.security).toContain("固定守卫");
  });

  it("全部精选身份中有明确府邸别院的子弟都保持家庭和住处同源", () => {
    const establishedResidences = EXPANDED_ORIGINS.filter((origin) => /贵族别院|朱氏旁院|公爵府|王府|乡间庄园/.test(origin.locations.join("")));
    expect(establishedResidences.length).toBeGreaterThan(0);
    for (const origin of establishedResidences) {
      const candidate = generateCandidates(`elite-residence-${origin.id}`, 0, "男", undefined, 0, 1, [], origin.id)[0].public;
      expect(`${candidate.household.structure}${candidate.household.summary}`, origin.id).not.toMatch(/商队集体抚养|公养舍|码头老账房/);
      expect(`${candidate.residence.building}${candidate.residence.room}`, origin.id).not.toMatch(/码头仓房|木板屋|旧货栈/);
    }
  });

  it("全部现役斗一身份的抚养结构和住处必须能从身份本身推出", () => {
    for (const originId of ACTIVE_ORIGIN_IDS) {
      const candidate = generateCandidates(`all-origin-coherence-${originId}`, 0, "女", undefined, 0, 1, [], originId)[0].public;
      const identity = `${candidate.originName}${candidate.originSummary}${candidate.location}${candidate.originFacts.map((item) => item.value).join("")}`;
      const home = `${candidate.household.structure}${candidate.household.summary}${candidate.dwelling}${candidate.residence.building}`;
      if (/商队集体抚养|永顺商队/.test(home)) expect(identity, originId).toMatch(/商队|商道|车队/);
      expect(home, originId).not.toContain("公养舍");
      if (!identity.includes("教养院")) expect(home, originId).not.toContain("教养院");
      if (/码头仓房|码头.*木板屋/.test(home)) expect(identity, originId).toMatch(/码头|渔|海|商队|港/);
      if (/孤儿|遗孤/.test(candidate.originName)) expect(candidate.household.structure, originId).not.toBe("双亲家庭");
      if (/收养|养子|养女/.test(`${candidate.originName}${candidate.originSummary}`)) expect(`${candidate.household.structure}${candidate.household.summary}`, originId).toMatch(/收养|养父|养母|宗门共同抚养|教养/);
      if (/家庭|农户|猎户|铁匠|医馆|家族|传人/.test(candidate.originName) && !/商队|收养|养子|养女|孤儿|遗孤/.test(candidate.originName)) {
        expect(`${candidate.household.structure}${candidate.household.summary}`, originId).not.toMatch(/宗门共同抚养|永顺商队老账房|家臣监护|师徒监护/);
      }
    }
    const scout = generateCandidates("scout-orphan-adoption", 0, "男", undefined, 0, 1, [], "scout-orphan")[0].public;
    expect(`${scout.household.structure}${scout.household.summary}${scout.startingRelations.map((item) => item.relation).join("")}`).toMatch(/集体收养|轮值监护/);
  });

  it("原著留白关系保留事实但不自动生成亲情、爱情、授业或继承", () => {
    const bibi = generateCandidates("bibi-ward-boundary", 0, "男", undefined, 0, 1, [], "bibi-dong-secret-ward")[0].public;
    expect(bibi.startingRelations.find((item) => item.name === "比比东")).toMatchObject({ strength: 10, category: "势力" });
    expect(bibi.originFacts.find((item) => item.label === "开局优势")?.value).toContain("仍需另行取得权限");
    const rongrong = generateCandidates("rongrong-betrothed-boundary", 0, "男", undefined, 0, 1, [], "rongrong-betrothed-companion")[0].public;
    expect(rongrong.startingRelations.find((item) => item.name === "宁荣荣")).toMatchObject({ strength: 0 });
    expect(rongrong.startingRelations.find((item) => item.name === "宁荣荣")?.impression).toMatch(/不因此产生好感|不.*感情/);
    const guRong = generateCandidates("gu-rong-ward-boundary", 0, "女", undefined, 0, 1, [], "gu-rong-rescued-ward")[0].public;
    expect(guRong.startingRelations.find((item) => item.name === "古榕")).toMatchObject({ strength: 18 });
    expect(guRong.startingRelations.find((item) => item.name === "古榕")?.impression).toContain("不等于父职");
  });

  it("斗一现役出生资料不倒灌后世制度或凭空生成正式微地点", () => {
    for (const originId of ACTIVE_ORIGIN_IDS) {
      const candidate = generateCandidates(`era-one-origin-language-${originId}`, 0, "男", undefined, 0, 1, [], originId)[0].public;
      const text = `${candidate.originName}${candidate.originSummary}${candidate.originFacts.map((item) => item.value).join("")}${candidate.selfKnowledge}${candidate.knownBackground}`;
      expect(text, originId).not.toMatch(/传灵塔|魂灵体系|升灵台|斗铠|机甲|星舰|联邦儿童觉醒|精神之海|意识海|识海/);
      expect(text, originId).not.toMatch(/项目管理|数据治理|行政汇报|资源配置|审批记录|问责机制|KPI/);
      expect(candidate.residence.nearby.join(""), originId).not.toMatch(/演武院|附属静院觉醒点|教养院觉醒点|内院集市|府邸集市/);
      for (const relation of candidate.startingRelations) {
        if (/所属势力觉醒魂师|可撤销婚约的同龄候选|候选授业者|普通接待人员/.test(relation.relation)) expect(relation.strength, `${originId}:${relation.name}`).toBeLessThanOrEqual(24);
      }
    }
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

  it("binds sect identity, body soul, objective, and choices into one internal awakening", () => {
    const game = createGame({ era: 1, gender: "男", difficulty: "标准", seed: "sect-body-opening-matrix" });
    game.hiddenCandidates = generateCandidates(game.view.seed, 0, "男", undefined, 0, 1, [], "hidden-sect-heir");
    game.hiddenCandidates[0].innateSoulPower = 10;
    game.view.candidates = game.hiddenCandidates.map((candidate) => candidate.public);
    selectCandidate(game, game.view.candidates[0].id, undefined, metaSoulById("rainbow-dao-body"));
    finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(game);
    const prose = game.view.narrative.map((entry) => entry.text).join("\n");
    expect(game.view.chapterObjective?.title).toBe("听清太玄剑宗愿意怎么培养他");
    expect(JSON.stringify(game.view.chapterObjective)).not.toMatch(/加入宗门|学院名额|选择宗门/);
    expect(prose).toContain("先天道体显现的是身体本身的变化");
    expect(prose).not.toMatch(/先天道体托在掌心|学院名额|地方武魂殿|宗门没有敲钟|没有念少宗主|无关人员|记录员|又换了一颗水晶重测|培养方案/);
    expect(prose.match(/备用的一颗复测/g)).toHaveLength(1);
    expect(game.view.suggestions).toEqual(expect.arrayContaining([expect.stringContaining("太玄剑宗守碑长老"), "问清先跟谁练、每天在哪里练、第一次猎魂谁同行"]));
    expect(game.storyMemory.openThreads).toContain("弄清太玄剑宗愿意怎么教、又要什么");
    selectLifeGoal(game, "在十八岁前完善太玄剑胎与先天道体的协同修炼");
    const testAction = "请太玄剑宗守碑长老测试先天道体的体征与魂力流向";
    const testResult = resolveAction(game, testAction);
    expect(testResult.intent).toBe("确认觉醒后的能力");
    applyActionResult(game, testAction, testResult, testResult.fallbackNarrative, testResult.suggestions);
    expect(game.view.chapterObjective?.steps).toEqual(expect.arrayContaining([expect.objectContaining({ id: "understand", status: "完成" }), expect.objectContaining({ id: "support", status: "进行中" })]));
    const supportAction = "问清太玄剑宗能安排哪位导师、多少训练时间和哪些猎魂帮助";
    const supportResult = resolveAction(game, supportAction);
    expect(supportResult.intent).toBe("问清开局培养条件");
    applyActionResult(game, supportAction, supportResult, supportResult.fallbackNarrative, supportResult.suggestions);
    expect(game.view.chapterObjective?.steps.find((step) => step.id === "path")?.status).toBe("进行中");
    const pathAction = "决定继续主修先天道体并只公开第一武魂";
    const pathResult = resolveAction(game, pathAction);
    applyActionResult(game, pathAction, pathResult, pathResult.fallbackNarrative, pathResult.suggestions);
    expect(game.view.chapterObjective?.title).toMatch(/第一次猎魂|第一个瓶颈/);
  });

  it("gives unbound and later-era children their own real opening problems", () => {
    const unbound = createGame({ era: 1, gender: "男", difficulty: "标准", seed: "unbound-opening-matrix" });
    unbound.hiddenCandidates = generateCandidates(unbound.view.seed, 0, "男", undefined, 0, 1, [], "void-arrival-unbound");
    unbound.view.candidates = unbound.hiddenCandidates.map((candidate) => candidate.public);
    selectCandidate(unbound, unbound.view.candidates[0].id, undefined, metaSoulById("purple-thunder-vine"));
    finalizeCharacterShaping(unbound, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(unbound);
    expect(unbound.view.chapterObjective?.title).toContain("活过觉醒后的第一天");
    expect(JSON.stringify(unbound.view.chapterObjective)).toMatch(/住处.*见证/);
    expect(unbound.view.suggestions.some((item) => /安排今晚住处.*作保/.test(item))).toBe(true);
    selectLifeGoal(unbound, "先取得稳定身份，再决定是否进入人类魂师学院");
    const identityAction = unbound.view.suggestions.find((item) => /安排今晚住处.*作保/.test(item))!;
    const identityResult = resolveAction(unbound, identityAction);
    expect(identityResult.intent).toBe("取得临时来处证明");
    applyActionResult(unbound, identityAction, identityResult, identityResult.fallbackNarrative, identityResult.suggestions);
    expect(unbound.view.inventory).toContain("临时来处证明");
    expect(unbound.view.chapterObjective?.steps.find((step) => step.id === "understand")?.status).toBe("进行中");

    const eraThree = createGame({ era: 3, gender: "女", difficulty: "标准", seed: "era-three-public-awakening" });
    eraThree.hiddenCandidates = generateCandidates(eraThree.view.seed, 0, "女", undefined, 0, 3, [], "d3-east-sea-worker");
    eraThree.hiddenCandidates[0].innateSoulPower = Math.max(5, eraThree.hiddenCandidates[0].innateSoulPower);
    eraThree.view.candidates = eraThree.hiddenCandidates.map((candidate) => candidate.public);
    selectCandidate(eraThree, eraThree.view.candidates[0].id);
    finalizeCharacterShaping(eraThree, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(eraThree);
    expect(eraThree.view.narrative.map((entry) => entry.text).join("\n")).not.toContain("武魂殿巡查执事");
    expect(JSON.stringify(eraThree.view.chapterObjective)).toMatch(/魂师班|魂灵路线/);
  });

  it("斗二至斗四出生关系不再沿用斗一武魂殿巡查执事", () => {
    for (const [era, originId] of [[2, "d2-wandering-healer"], [3, "d3-east-sea-worker"], [4, "d4-colony-child"]] as const) {
      const candidate = generateCandidates(`later-awakening-contact-${era}`, 0, "男", undefined, 0, era, [], originId)[0].public;
      expect(JSON.stringify(candidate.startingRelations), originId).not.toMatch(/武魂殿|素云涛/);
      expect(JSON.stringify(candidate.startingRelations), originId).toMatch(era === 2 ? /当地觉醒魂师/ : era === 3 ? /传灵师/ : /联邦儿童觉醒/);
    }
  });

  it("keeps noble and beast-raised openings on their own authority and survival tracks", () => {
    const prepare = (originId: string, seed: string) => {
      const game = createGame({ era: 1, gender: "男", difficulty: "标准", seed });
      game.hiddenCandidates = generateCandidates(game.view.seed, 0, "男", undefined, 0, 1, [], originId);
      game.view.candidates = game.hiddenCandidates.map((candidate) => candidate.public);
      selectCandidate(game, game.view.candidates[0].id);
      finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
      awakenCharacter(game);
      return game;
    };
    const noble = prepare("noble-hostage", "noble-opening-matrix");
    expect(noble.view.chapterObjective?.title).toContain("贵族身份能够打开的培养路线");
    expect(JSON.stringify(noble.view.chapterObjective)).toMatch(/家族培养.*学院.*外部导师.*资格与代价/);
    expect(JSON.stringify(noble.view.chapterObjective)).toMatch(/培养地点.*费用来源.*家族责任/);
    expect(JSON.stringify(noble.view.chapterObjective)).not.toMatch(/必须接受家族教师|已经获得学院名额/);
    const migratedNoble = structuredClone(noble);
    migratedNoble.schemaVersion = 38;
    migratedNoble.view.chapterObjective = {
      title: "让家族身份与觉醒结果形成明确安排",
      stakes: migratedNoble.view.character!.originBurden,
      destinationId: migratedNoble.view.locationId,
      steps: [
        { id: "understand", text: `请家族教官测试${migratedNoble.view.character!.martialSoul.name}`, status: "进行中" },
        { id: "support", text: "核对家族教师、资源、同辈竞争与第一魂环安排", status: "未开始" },
        { id: "path", text: "决定接受、谈判或拒绝哪一项家族培养条件", status: "未开始" },
      ],
    };
    const upgradedNoble = ensureGameState(migratedNoble);
    expect(upgradedNoble.schemaVersion).toBe(52);
    expect(JSON.stringify(upgradedNoble.view.chapterObjective)).toMatch(/家族培养.*学院.*外部导师/);

    const firstStep = resolveAction(noble, `请${noble.world.flags.openingOfficiant}完成武魂复核测试`);
    applyActionResult(noble, `请${noble.world.flags.openingOfficiant}完成武魂复核测试`, firstStep, "复核完成。", []);
    const routeComparison = resolveAction(noble, "核对家族培养、学院报名、外部导师与交换培养的资格和代价");
    expect(routeComparison.intent).toBe("问清开局培养条件");
    expect(routeComparison.ruleSummary).toMatch(/贵族身份不会自动换来录取或拜师/);

    const beast = prepare("fierce-beast-raised", "beast-opening-matrix");
    expect(beast.view.chapterObjective?.title).toContain("接触人类魂师体系");
    expect(JSON.stringify(beast.view.chapterObjective)).toMatch(/离开兽群领地.*保护与资源/);
    expect(JSON.stringify(beast.view.chapterObjective)).not.toMatch(/学院名额|加入宗门/);
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

  it("本地人身世目标不提前泄露原著未来事件", () => {
    for (const originId of ["seven-treasure-core", "blue-lightning-heir", "heaven-royal-ward"]) {
      const game = createGame({ gender: "男", difficulty: "标准", seed: `origin-goal-chronology-${originId}` });
      game.hiddenCandidates[0].originId = originId;
      selectCandidate(game, game.hiddenCandidates[0].public.id);
      finalizeCharacterShaping(game, { keywords: ["谨慎", "坚韧", "好学"], answers: {} });
      expect(game.view.shaping!.lifeGoalOptions.join("；"), originId).not.toMatch(/宁荣荣离宗|武魂殿袭击|宗门覆灭|雪夜大帝病重|太子府异常/);
    }
  });

  it("普通本地儿童的人生目标不使用读者知识或秘密地点知识", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "ordinary-life-goal-knowledge" });
    const hidden = game.hiddenCandidates[0];
    hidden.originId = "village-farmer";
    hidden.roleTags = ["平民", "乡村", "本地人"];
    hidden.public.originName = "圣魂村普通农户孩子";
    hidden.public.originSummary = "家里种地，对大陆秘密地点没有可靠情报。";
    hidden.public.selfKnowledge = "本地人 · 身世明确";
    hidden.public.knownBackground = "只知道村镇、家人和地方觉醒常识。";
    selectCandidate(game, hidden.public.id);
    const draft = game.view.shaping!.personalityOptions[0];
    finalizeCharacterShaping(game, { keywords: draft.keywords, answers: {} });
    const observed = new Set(game.view.shaping!.lifeGoalOptions);
    for (let index = 0; index < 40; index += 1) {
      game.view.shaping!.goalRerollsUsed = 0;
      rerollCharacterShaping(game, "goals");
      game.view.shaping!.lifeGoalOptions.forEach((goal) => observed.add(goal));
    }
    expect([...observed].join("；")).not.toMatch(/原作天才|原本会死去|杀戮之都|杀神领域|海神岛|黑级考核/);
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
    expect(game.view.narrative.at(-1)?.text).toContain("注意力仍在第一武魂上，没有看到第二次显形");
    expect(game.view.suggestions).toContain("暂不显露第二武魂，回住处后单独测试");
    expect(game.view.suggestions.every((suggestion) => !suggestion.includes("测试副武魂"))).toBe(true);
    selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0], { activeMartialSoulIndex: 1, publiclyKnownMartialSoulIndices: [0] });
    expect(game.view.character?.martialSoul.name).toBe("测试副武魂");
    expect(game.view.character?.martialSouls[1].cultivationState).toBe("主修");
    expect(game.view.narrative.at(-1)?.text).toContain("现场只确认了");
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
    expect(game.view.tasks.find((task) => task.id === "awakening-recruitment")?.detail).toMatch(/谁愿意教|训练场能用多久|第一次猎魂能帮到哪一步/);
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
    expect(game.world.dynamicEvents.some((event) => /商议培养安排/.test(event.title) && event.status === "可介入")).toBe(true);
    expect(game.view.narrative.at(-1)?.text).toMatch(/把两次结果单独记下|把两次结果并排写下|队伍晚走半个时辰/);
    expect(game.view.suggestions.some((suggestion) => suggestion.includes(game.view.character!.martialSoul.name) && /测试|确认/.test(suggestion))).toBe(true);
    expect(game.view.suggestions.every((suggestion) => !/查看地图|查看新事件|观察周围|继续行动/.test(suggestion))).toBe(true);
  });

  it("keeps valid live-AI choices first and uses deterministic choices only as safety fallback", () => {
    const game = createGame({ gender: "女", difficulty: "标准", seed: "grounded-choice-filter" });
    const hidden = game.hiddenCandidates[0];
    hidden.martialSouls = [hidden.martialSoul, { ...hidden.martialSoul, id: "secret-soul", name: "不可见副武魂" }];
    selectCandidate(game, hidden.public.id);
    finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(game);
    const liveAi = ["独自在房间测试武魂消耗", "向养父询问近期修炼安排", "暂缓公开异常并观察外界反应"];
    const suggestions = sanitizeNarrativeSuggestions(game, ["查看地图", ...liveAi, "把不可见副武魂告诉唐三", "继续行动"], game.view.suggestions);
    expect(suggestions).toHaveLength(3);
    expect(suggestions).toEqual(liveAi);
    expect(suggestions.every((item) => item.length >= 8 && item.length <= 28)).toBe(true);
    expect(suggestions.every((item) => !/查看地图|查看新事件|观察周围|继续行动|不可见副武魂|唐三/.test(item))).toBe(true);
    expect(suggestions.some((item) => /修炼|武魂/.test(item))).toBe(true);
    expect(sanitizeNarrativeSuggestions(game, [...liveAi, "练习武魂收放", "询问学院费用", "拒绝公开秘密"], game.view.suggestions)).toHaveLength(3);
    expect(sanitizeNarrativeSuggestions(game, ["保留拒绝当前路线的选择", ...liveAi], game.view.suggestions)).not.toContain("保留拒绝当前路线的选择");
  });

  it("斗一正文拒绝后世教具和现代训练医学措辞", () => {
    const game = createGame({ era: 1, gender: "男", difficulty: "标准", seed: "era-one-training-language" });
    selectCandidate(game, game.view.candidates[0].id);
    finalizeCharacterShaping(game, personality);
    awakenCharacter(game);
    expect(auditNarrative(game, "老师让他买一支魂导笔，又提醒膝盖内扣会伤半月板。"))
      .toContain("斗一正文使用了后世教具或现代训练医学术语");
  });

  it("rejects overlong AI choices instead of cutting them into broken sentences", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "choice-no-hard-cut" });
    const overlong = "请太玄剑宗守碑长老测试先天道体的体征魂力流向收放与承载并写下全部结果";
    const suggestions = sanitizeNarrativeSuggestions(game, [overlong], ["独自测试武魂消耗", "询问家人修炼安排", "暂缓公开隐藏异常"]);
    expect(suggestions).not.toContain(overlong.slice(0, 28));
    expect(suggestions.every((item) => item.length <= 28)).toBe(true);
    expect(sanitizeNarrativeSuggestions(game, ["请长老测试体征、魂力流向、收放与承"], ["独自测试武魂消耗", "询问家人修炼安排", "暂缓公开隐藏异常"])).not.toContain("请长老测试体征、魂力流向、收放与承");
  });

  it("六岁角色的实时选项不使用主持会议、审批和资源治理口吻", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "child-choice-manager-language" });
    selectCandidate(game, game.view.candidates[0].id);
    finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(game);
    const suggestions = sanitizeNarrativeSuggestions(game, ["主持长老会审批资源配置", "召集高层制定治理方案", "独自练习武魂收放"], ["询问监护人今天怎么训练", "暂不公开隐藏异常"]);
    expect(suggestions.join("；")).not.toMatch(/主持|审批|资源配置|治理方案|召集高层/);
    expect(suggestions).toContain("独自练习武魂收放");
  });

  it("实时选项不会退化成三个换对象询问", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "choice-query-diversity" });
    selectCandidate(game, game.view.candidates[0].id);
    finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(game);
    const suggestions = sanitizeNarrativeSuggestions(game, ["询问教习训练条件", "追问管事食宿费用", "请长老说明猎魂帮助"], ["练习武魂收放", "暂缓公开第二武魂", "比较现有修炼资源"]);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.filter((item) => /询问|追问|请.*说明/.test(item)).length).toBeLessThanOrEqual(1);
    expect(suggestions.some((item) => /练习|比较|训练|资源/.test(item))).toBe(true);
    expect(suggestions.some((item) => /暂缓|隐藏|拒绝|风险|公开/.test(item))).toBe(true);
  });

  it("replaces vague screenshot-style choices with canon-grounded awakening actions", () => {
    const game = createGame({ gender: "男", difficulty: "标准", seed: "canon-grounded-awakening-buttons" });
    game.hiddenCandidates[0].innateSoulPower = 10;
    selectCandidate(game, game.hiddenCandidates[0].public.id);
    finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(game);
    const suggestions = sanitizeNarrativeSuggestions(game, [], ["把眼前的事情做完", "回应身边正在等的人", `当场召出${game.view.character!.martialSoul.name}，请主持者指出第一处缺陷`]);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.some((item) => item.includes(game.view.character!.martialSoul.name) && /测试|确认/.test(item))).toBe(true);
    expect(suggestions.every((item) => !/把眼前|正在等的人|指出第一处缺陷/.test(item))).toBe(true);
  });

  it("uses each later era's actual awakening follow-up instead of recycling the era-one buttons", () => {
    const originIds = { 2: "d2-shrek-craft-child", 3: "d3-east-sea-worker", 4: "d4-space-technician" } as const;
    const expectedOfficiants = { 2: /负责当地儿童觉醒的魂师/, 3: /传灵塔传灵师/, 4: /负责儿童觉醒室的工作人员/ } as const;
    for (const era of [2, 3, 4] as const) {
      const game = createGame({ era, gender: "女", difficulty: "标准", seed: `era-awakening-choice-${era}` });
      game.hiddenCandidates = generateCandidates(game.view.seed, 0, "女", undefined, 0, era, [], originIds[era]);
      game.view.candidates = game.hiddenCandidates.map((candidate) => candidate.public);
      game.hiddenCandidates[0].innateSoulPower = 3;
      selectCandidate(game, game.hiddenCandidates[0].public.id);
      finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
      awakenCharacter(game);
      expect(expectedOfficiants[era].test(String(game.world.flags.openingOfficiant))).toBe(true);
      expect(game.view.suggestions.some((item) => item.includes(game.view.character!.martialSoul.name) && /测试|确认/.test(item))).toBe(true);
      expect(game.view.narrative.map((entry) => entry.text).join("\n")).not.toContain("武魂殿巡查执事");
      expect(game.view.suggestions.every((item) => !/把眼前|正在等的人|指出第一处缺陷/.test(item))).toBe(true);
    }
  });

  it("uses each era's own awakening room and soul-power test instead of copying the era-one stone array", () => {
    for (const era of [2, 3, 4] as const) {
      const game = createGame({ era, gender: "男", difficulty: "标准", seed: `era-${era}-awakening-room` });
      game.hiddenCandidates[0].innateSoulPower = 10;
      selectCandidate(game, game.view.candidates[0].id);
      finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
      awakenCharacter(game);
      const prose = game.view.narrative.map((entry) => entry.text).join("\n");
      expect(prose).not.toMatch(/六块黑石|六角阵|水晶球/);
      expect(prose).toContain("觉醒室");
      if (era === 3) {
        expect(prose).toMatch(/地面、墙壁和穹顶的纹路|重新引动觉醒室的纹路/);
        expect(prose).toContain("传灵师");
        expect(prose).not.toContain("所属家族觉醒教官");
      }
      if (era === 4) expect(prose).toMatch(/六边形觉醒室|魂力测试仪/);
    }
    const overseas = createGame({ era: 3, gender: "男", difficulty: "标准", seed: "d3-overseas-awakening-authority" });
    overseas.hiddenCandidates = generateCandidates(overseas.view.seed, 0, "男", undefined, 0, 3, [], "d3-overseas-exchange");
    overseas.view.candidates = overseas.hiddenCandidates.map((candidate) => candidate.public);
    selectCandidate(overseas, overseas.view.candidates[0].id);
    finalizeCharacterShaping(overseas, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
    awakenCharacter(overseas);
    const overseasProse = overseas.view.narrative.map((entry) => entry.text).join("\n");
    expect(overseasProse).toContain("受邀到学院的传灵塔传灵师");
    expect(overseasProse).not.toMatch(/所属家族觉醒教官|星罗帝国家族觉醒场/);
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
      .toContain("异常觉醒结果没有引发负责觉醒的人、同行长辈或围观者的具体反应");
    expect(auditNarrative(game, "他把觉醒记录收进包里，上面的先天满魂力与今天要问的入学费用是两件事。"))
      .not.toContain("异常觉醒结果没有引发负责觉醒的人、同行长辈或围观者的具体反应");
    expect(auditNarrative(game, "他翻开旧档案，里面记着当年觉醒室使用的水晶球，也写明了先天满魂力。"))
      .not.toContain("异常觉醒结果没有引发负责觉醒的人、同行长辈或围观者的具体反应");
    expect(auditNarrative(game, "他想起觉醒那天，水晶球里的白光冲到顶端时，周围人看他的眼神。"))
      .not.toContain("异常觉醒结果没有引发负责觉醒的人、同行长辈或围观者的具体反应");
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
