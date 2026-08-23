import { describe, expect, it } from "vitest";
import type { GameEra } from "../../shared/game.js";
import { awakenCharacter, createGame, ERA_BASE_YEARS, finalizeCharacterShaping, generateCandidates, selectCandidate, selectLifeGoal } from "./generator.js";
import { settleRun } from "./endings.js";
import { guardActionByStoryRules, selectNarrativeRules, violatesCanonChronology } from "./story-rules.js";
import { resolveAction } from "./actions.js";
import { advanceWorldTime, buildMapView, createHiddenWorld } from "./world.js";
import { buildSceneKnowledgePack } from "./scene-knowledge.js";

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
      if (era === 2) {
        expect(game.view.map.some((location) => location.id === "white-tiger-duke-estate")).toBe(true);
        expect(game.view.map.some((location) => location.id === "star-dou-edge")).toBe(true);
      }
    }
  });

  it("does not simulate protagonists from other generations as living local NPCs", () => {
    const era1 = createHiddenWorld(0, "holy-soul-village");
    expect(era1.npcs["tang-san"].factionIds).not.toContain("shrek");
    expect(era1.npcs["tang-san"].factionIds).not.toContain("clear-sky");
    expect(era1.npcs["tang-san"].factionIds).not.toContain("tang-sect");
    expect(createHiddenWorld(7, "heaven-dou-city").npcs["tang-san"].factionIds).toContain("shrek");
    expect(createHiddenWorld(14, "heaven-dou-city").npcs["tang-san"].factionIds).toEqual(expect.arrayContaining(["clear-sky", "tang-sect"]));

    const era2 = createHiddenWorld(10_000, "shrek-city");
    expect(era2.npcs["tang-san"].alive).toBe(false);
    expect(era2.npcs["huo-yuhao"].alive).toBe(true);
    expect(era2.npcs["tang-wulin"].alive).toBe(false);
    expect(era2.npcs["huo-yuhao"].age).toBe(11);
    expect(era2.npcs["huo-yuhao"].locationId).toBe("white-tiger-duke-estate");
    expect(era2.npcs["huo-yuhao"].factionIds).not.toContain("peerless-tang-sect");
    expect(createHiddenWorld(10_001, "shrek-city").npcs["huo-yuhao"].factionIds).toContain("peerless-tang-sect");

    const era3 = createHiddenWorld(20_000, "east-sea-city");
    expect(era3.npcs["huo-yuhao"].alive).toBe(false);
    expect(era3.npcs["tang-wulin"].alive).toBe(true);
    expect(era3.npcs["lan-xuanyu"].alive).toBe(false);
    expect(era3.npcs["tang-wulin"].locationId).toBe("aolai-city-d3");
    expect(era3.npcs["tang-wulin"].factionIds).not.toContain("d3-shrek-seven");
    const shrekAgeWulin = createHiddenWorld(20_007, "shrek-city").npcs["tang-wulin"];
    expect(shrekAgeWulin.age).toBe(13);
    expect(shrekAgeWulin.locationId).toBe("shrek-city");
    expect(shrekAgeWulin.factionIds).toContain("d3-shrek-seven");

    const era4 = createHiddenWorld(30_000, "mother-ship-port");
    expect(era4.npcs["tang-wulin"].alive).toBe(false);
    expect(era4.npcs["lan-xuanyu"].alive).toBe(true);
    expect(era4.npcs["di-tian"].alive).toBe(true);
    expect(era4.npcs["lan-xuanyu"].locationId).toBe("tianluo-planet");
    expect(era4.npcs["lan-xiao"].locationId).toBe("tianluo-planet");
    expect(era4.npcs["na-na-teacher"].locationId).toBe("tiandou-planet");
    expect(era4.npcs["lan-xuanyu"].factionIds).not.toContain("d4-federal-fleet");
    const shrekAgeXuanyu = createHiddenWorld(30_005, "shrek-city").npcs["lan-xuanyu"];
    expect(shrekAgeXuanyu.age).toBe(11);
    expect(shrekAgeXuanyu.factionIds).toContain("shrek-space-command");
    const fleetAgeXuanyu = createHiddenWorld(30_012, "mother-ship-port").npcs["lan-xuanyu"];
    expect(fleetAgeXuanyu.age).toBe(18);
    expect(fleetAgeXuanyu.factionIds).toContain("d4-federal-fleet");
  });

  it("unlocks future faction memberships only when their joining event occurs", () => {
    const game = playingGame(2, "timed-faction-membership");
    game.world = createHiddenWorld(10_000, "shrek-city");
    game.view.worldTime = { year: 10_000, day: 1, time: "08:00", season: "春", era: "霍雨浩离府求学基准年" };
    expect(game.world.npcs["huo-yuhao"].factionIds).not.toContain("peerless-tang-sect");
    advanceWorldTime(game, 15 * 1_440);
    expect(game.world.npcs["huo-yuhao"].factionIds).toContain("peerless-tang-sect");

    const altered = playingGame(2, "suppressed-faction-membership");
    altered.world = createHiddenWorld(10_000, "shrek-city");
    altered.world.suppressedCanonEvents.push("d2-tang-sect-meeting");
    altered.view.worldTime = { year: 10_000, day: 1, time: "08:00", season: "春", era: "霍雨浩离府求学基准年" };
    advanceWorldTime(altered, 15 * 1_440);
    expect(altered.world.npcs["huo-yuhao"].factionIds).not.toContain("peerless-tang-sect");
  });

  it("exposes the two early fourth-era administrative planets and requires valid interplanetary transport", () => {
    const game = playingGame(4, "d4-administrative-planets");
    game.view.locationId = "tianluo-planet";
    game.view.location = "天罗星";
    game.world.discoveredLocations.push("tianluo-planet");
    game.view.map = buildMapView(game);
    game.view.character!.coins = 1_000;

    expect(game.view.map.some((location) => location.id === "tianluo-planet")).toBe(true);
    expect(game.view.map.some((location) => location.id === "tiandou-planet")).toBe(true);
    expect(resolveAction(game, "直接前往天斗星").intent).toBe("无法完成");
    const beforeCoins = game.view.character!.coins;
    expect(resolveAction(game, "购买船票并搭乘客运航班前往天斗星").intent).toBe("星际客运");
    expect(game.view.locationId).toBe("tiandou-planet");
    expect(game.view.character!.coins).toBeLessThan(beforeCoins);
  });

  it("does not let a passenger ticket satisfy an accepted interplanetary freight contract", () => {
    const game = playingGame(4, "d4-passenger-freight-boundary");
    game.view.locationId = "tianluo-planet";
    game.view.location = "天罗星";
    game.world.discoveredLocations.push("tianluo-planet", "tiandou-planet");
    game.view.map = buildMapView(game);
    game.view.character!.coins = 1_000;
    game.view.character!.age = 7;
    resolveAction(game, "进行星舰指挥模拟训练");
    game.view.starship!.shipName = "测试登记舰";
    game.view.starship!.shipClass = "陨星级侦察舰";

    expect(resolveAction(game, "承接运往天斗星的日用品运输合同").intent).toBe("承接运输合同");
    expect(game.view.tasks.find((task) => task.kind === "运输合同")?.logistics?.mode).toBe("星际货运");
    expect(resolveAction(game, "购买船票并搭乘客运航班前往天斗星").intent).toBe("无法完成");
    expect(game.view.locationId).toBe("tianluo-planet");
  });

  it("does not expose first-era factions as active organizations in later eras", () => {
    const game = playingGame(3, "faction-era-isolation");
    game.view.worldTime = { year: 20_000, day: 1, time: "08:00", season: "春", era: "唐舞麟基准年" };
    const pack = buildSceneKnowledgePack(game, "打听武魂殿和传灵塔");
    expect(pack.entries.some((entry) => entry.kind === "势力" && entry.name === "武魂殿")).toBe(false);
    expect(pack.entries.some((entry) => entry.kind === "势力" && entry.name === "传灵塔")).toBe(true);
    expect(buildSceneKnowledgePack(game, "调查武魂城").entries.some((entry) => entry.kind === "地点" && entry.name === "武魂城")).toBe(false);
    expect(guardActionByStoryRules(game, "加入武魂殿")?.intent).toBe("规则阻止");
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
    expect(violatesCanonChronology("定装魂导炮已经投入使用。", 9_995)).toBe(false);
    expect(violatesCanonChronology("斗铠已经投入使用。", 10_000)).toBe(true);
    expect(violatesCanonChronology("斗铠已经投入使用。", 20_000)).toBe(false);
    expect(violatesCanonChronology("星舰已经投入使用。", 20_000)).toBe(true);
    expect(violatesCanonChronology("星舰已经投入使用。", 30_000)).toBe(false);
  });

  it("makes a later-era soul spirit require selection, assessment and payment", () => {
    const game = playingGame(2, "soul-spirit-contract");
    game.view.worldTime = { year: 10_012, day: 1, time: "08:00", season: "春", era: "绝世唐门时代" };
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

  it("keeps soul spirits unavailable before their canon invention", () => {
    const game = playingGame(2, "pre-spirit-era");
    game.view.worldTime = { year: 10_000, day: 1, time: "08:00", season: "春", era: "霍雨浩离府求学基准年" };
    game.view.character!.soulRank = 10;
    expect(resolveAction(game, "申请正规魂灵").intent).toBe("无法完成");
    expect(resolveAction(game, "研究魂兽残魂与魂灵设想").intent).toBe("魂灵前置研究");
    expect(game.view.soulSpiritContract).toBeUndefined();
    expect(createHiddenWorld(10_000, "shrek-city").npcs["snow-empress-human"].alive).toBe(false);
    expect(createHiddenWorld(10_005, "shrek-city").npcs["snow-empress-human"].alive).toBe(true);
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

  it("builds battle armor through a qualified nine-piece engineering chain", () => {
    const game = playingGame(3, "battle-armor-loop");
    game.view.character!.coins = 20_000;
    game.view.character!.abilityDescriptors.perception = "顶尖";
    game.view.character!.soulRank = 40;
    expect(resolveAction(game, "设计一字斗铠").intent).toBe("无法完成");
    game.view.character!.soulRank = 50;
    expect(resolveAction(game, "设计一字斗铠").intent).toBe("无法完成");
    expect(game.view.character!.battleArmors).toHaveLength(0);
    expect(game.view.battleArmorProject).toBeUndefined();
    game.view.professions.push({ id: "battle-armor-design", name: "魂导器研究", level: "入门", progress: 80, experiments: 8, failures: 1, knownMethods: ["斗铠核心法阵"] });
    game.view.professions.push({ id: "battle-armor-forging", name: "锻造与炼器", level: "入门", progress: 80, experiments: 8, failures: 1, knownMethods: ["千锻"] });
    for (let index = 0; index < 6 && (game.view.battleArmorProject?.blueprintProgress ?? 0) < 100; index += 1) {
      resolveAction(game, "继续设计一字斗铠并做武魂适配测试");
    }
    expect(game.view.battleArmorProject?.blueprintProgress).toBe(100);

    for (let attempt = 0; attempt < 24 && game.view.character!.battleArmors?.[0]?.status !== "完整"; attempt += 1) {
      resolveAction(game, "购买斗铠稀有金属");
      resolveAction(game, `制作一字斗铠${game.view.battleArmorProject?.nextPiece ?? "部件"}`);
    }
    const armor = game.view.character!.battleArmors?.[0];
    expect(armor?.status).toBe("完整");
    expect(armor?.pieces).toEqual(["右手前臂甲", "左手前臂甲", "右肩大臂甲", "左肩大臂甲", "胸铠", "腰铠与战裙", "右腿足甲", "左腿足甲", "头盔"]);
    expect(armor?.completion).toBe(100);
    expect(game.view.battleArmorProject).toBeUndefined();

    game.view.character!.soulRank = 60;
    for (let index = 0; index < 6 && (game.view.battleArmorProject?.blueprintProgress ?? 0) < 100; index += 1) resolveAction(game, "继续设计二字斗铠并做武魂适配测试");
    resolveAction(game, "购买斗铠稀有金属");
    expect(resolveAction(game, "制作二字斗铠右手前臂甲").intent).toBe("无法完成");
    expect(game.view.inventory).toContain("千锻斗铠金属胚料");
  });

  it("requires training and a license before buying a mecha", () => {
    const game = playingGame(3, "mecha-license-loop");
    game.view.character!.age = 16;
    game.view.character!.coins = 10_000;
    game.view.affiliations.push({ id: "federal-school", name: "明都联邦学院", role: "学员", reputation: "在册", joinedAt: "测试" });
    expect(resolveAction(game, "购买白级训练机甲").intent).toBe("无法完成");
    for (let index = 0; index < 3; index += 1) resolveAction(game, "进行机甲模拟训练");
    expect(game.view.mecha?.simulatorSessions).toBe(3);
    expect(resolveAction(game, "参加白级机甲驾驶考核").intent).toBe("机甲驾驶考核");
    expect(game.view.mecha?.license).toBe("白级");
    expect(resolveAction(game, "购买白级训练机甲").intent).toBe("购买机甲");
    expect(game.view.mecha?.model).toBe("白色基础教学机甲");
    expect(resolveAction(game, "驾驶机甲进行低速试驾").intent).toBe("驾驶机甲");
    expect(game.view.mecha?.energy).toBe(90);
  });

  it("keeps mecha color grades tied to canon body, soul power, and customization limits", () => {
    const game = playingGame(3, "mecha-grade-limits");
    game.view.affiliations.push({ id: "federal-school", name: "明都联邦学院", role: "学员", reputation: "在册", joinedAt: "测试" });
    for (let index = 0; index < 12; index += 1) resolveAction(game, "进行机甲模拟训练");
    expect(resolveAction(game, "参加白级机甲驾驶考核").intent).toBe("无法完成");
    game.view.character!.age = 18;
    expect(resolveAction(game, "参加白级机甲驾驶考核").intent).toBe("机甲驾驶考核");
    expect(resolveAction(game, "参加黄级机甲驾驶考核").intent).toBe("机甲驾驶考核");
    expect(resolveAction(game, "参加紫级机甲驾驶考核").intent).toBe("无法完成");
    game.view.character!.soulRank = 10;
    expect(resolveAction(game, "参加紫级机甲驾驶考核").intent).toBe("机甲驾驶考核");
    game.view.character!.coins = 300_000;
    expect(resolveAction(game, "购买紫级通用机甲").intent).toBe("无法完成");
    game.view.relations.push({ id: "designer", name: "林工", relation: "机甲设计师", impression: "可信", strength: 70 });
    expect(resolveAction(game, "订购紫级专属机甲").intent).toBe("购买机甲");
    expect(game.view.mecha?.model).toContain("专属机甲");
  });

  it("requires a licensed command crew and resources for interplanetary travel", () => {
    const game = playingGame(4, "starship-command-loop");
    game.view.character!.age = 7;
    game.view.character!.abilityDescriptors.perception = "优秀";
    game.view.character!.coins = 0;
    game.view.affiliations.push({ id: "fleet", name: "斗罗联邦舰队", role: "学员", reputation: "在册", joinedAt: "测试" });
    game.view.relations.push(
      { id: "crew-pilot", name: "林航", relation: "持证星际驾驶员", impression: "可靠", strength: 60 },
      { id: "crew-nav", name: "周星图", relation: "持证导航员", impression: "熟悉航线", strength: 60 },
      { id: "crew-engineer", name: "顾轮机", relation: "轮机工程师", impression: "熟悉动力维修", strength: 60 },
    );
    for (let index = 0; index < 12; index += 1) resolveAction(game, "进行星舰指挥模拟训练");
    game.view.character!.age = 19;
    expect(resolveAction(game, "参加见习指挥考核").intent).toBe("星舰指挥考核");
    expect(resolveAction(game, "参加三级指挥考核").intent).toBe("星舰指挥考核");
    resolveAction(game, "招募林航担任驾驶员成为船员");
    resolveAction(game, "招募周星图担任导航员成为船员");
    resolveAction(game, "招募顾轮机担任轮机师成为船员");
    expect(game.view.starship?.crew).toHaveLength(3);
    expect(resolveAction(game, "前往森罗星").intent).toBe("无法完成");
    expect(resolveAction(game, "申请配发学院项目舰").intent).toBe("取得星舰");
    expect(game.view.starship?.shipName).toBeTruthy();
    expect(game.view.starship?.shipClass).toBe("陨星级侦察舰");
    expect(game.view.tasks.some((task) => task.id?.startsWith("starship-project-") && task.status === "进行中")).toBe(true);
    expect(resolveAction(game, "驾驶星舰前往天龙星").intent).toBe("无法完成");
    expect(game.view.locationId).not.toBe("dragon-horse-star");
    expect(resolveAction(game, "驾驶星舰前往森罗星").intent).toBe("星际航行");
    expect(game.view.locationId).toBe("senluo-planet");
    expect(game.view.starship?.fuel).toBeLessThan(100);
    expect(resolveAction(game, "执行第一次星球探索任务").intent).toBe("星球探索");
    expect(game.view.starship?.missionsCompleted).toBe(1);
  });

  it("does not turn childhood starship interest into a command qualification", () => {
    const game = playingGame(4, "starship-childhood-boundary");
    game.view.affiliations.push({ id: "school", name: "天罗学院", role: "学员", reputation: "在册", joinedAt: "测试" });
    expect(resolveAction(game, "进行星舰指挥模拟训练").intent).toBe("无法完成");
    game.view.character!.age = 7;
    for (let index = 0; index < 6; index += 1) resolveAction(game, "进行星舰指挥模拟训练");
    expect(resolveAction(game, "参加见习指挥考核").intent).toBe("无法完成");
    game.view.character!.age = 12;
    expect(resolveAction(game, "参加见习指挥考核").intent).toBe("星舰指挥考核");
    expect(resolveAction(game, "参加三级指挥考核").intent).toBe("无法完成");
  });

  it("separates fleet enlistment, simulator time, logged flight hours and military promotion", () => {
    const minor = playingGame(4, "underage-fleet-enlistment");
    minor.view.character!.soulRank = 20;
    expect(minor.view.character!.age).toBeLessThan(18);
    expect(resolveAction(minor, "加入斗罗联邦舰队").intent).toBe("无法完成");
    expect(minor.view.affiliations.some((item) => item.id === "d4-federal-fleet")).toBe(false);

    const game = playingGame(4, "military-career-progression");
    game.view.character!.age = 18;
    game.view.character!.soulRank = 20;
    expect(resolveAction(game, "加入斗罗联邦舰队").intent).toBe("加入势力");
    const fleet = game.view.affiliations.find((item) => item.id === "d4-federal-fleet")!;
    expect(fleet).toMatchObject({ role: "现役士兵", militaryRank: "列兵", militaryMerit: 0, flightHours: 0 });

    resolveAction(game, "进行星舰指挥模拟训练");
    expect(game.view.starship?.loggedFlightHours).toBe(0);
    expect(fleet.flightHours).toBe(0);

    game.view.starship!.license = "见习指挥";
    expect(resolveAction(game, "申请随舰训练航次").intent).toBe("随舰训练航次");
    expect(game.view.starship!.loggedFlightHours).toBeGreaterThan(0);
    expect(fleet.flightHours).toBe(game.view.starship!.loggedFlightHours);

    fleet.contribution = 999;
    expect(resolveAction(game, "向斗罗联邦舰队申请晋升").intent).toBe("无法完成");
    fleet.militaryMerit = 20;
    fleet.completedAssignments = 2;
    fleet.flightHours = 50;
    const promotion = resolveAction(game, "向斗罗联邦舰队申请晋升");
    expect(promotion.intent).toBe("军衔晋升");
    expect(fleet.militaryRank).toBe("下士");
    expect(fleet.rankEvidence?.at(-1)).toContain("50小时飞行晋升下士");
  });
});
