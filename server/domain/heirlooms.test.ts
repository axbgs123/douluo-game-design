import { describe, expect, it } from "vitest";
import { resolveAction } from "./actions.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
import { HEIRLOOMS } from "../../shared/heirlooms.js";
import { ensureGameState } from "./world.js";
import { auditNarrative } from "./story-rules.js";
import { SOUL_BEASTS } from "../data/world.js";

function awakenedGame(heirloom: string, era: 1 | 2 | 3 | 4 = 1) {
  const game = createGame({ era, gender: "男", difficulty: "标准", seed: `heirloom-${era}-${heirloom}` });
  game.legacy.equippedHeirloom = heirloom;
  game.hiddenCandidates[0].innateSoulPower = 3;
  selectCandidate(game, game.view.candidates[0].id);
  finalizeCharacterShaping(game, { keywords: ["谨慎", "好学", "坚韧"], answers: {} });
  awakenCharacter(game);
  selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  return game;
}

describe("局外遗物", () => {
  it("shows the equipped relic with limited charges and applies its stronger passive effect", () => {
    const game = awakenedGame("九品紫芝");
    expect(game.view.activeHeirloom).toMatchObject({ name: "九品紫芝", status: "等待触发", provenance: "原著具名唯一物" });
    game.world.healthPoints = 55;
    game.world.fatiguePoints = 60;
    const trainingBefore = game.world.trainingPoints;
    const result = resolveAction(game, "服用九品紫芝并炼化药力");
    expect(result.intent).toBe("使用遗物");
    expect(game.world.trainingPoints).toBe(trainingBefore + 120);
    expect(game.world.healthPoints).toBe(100);
    expect(game.world.fatiguePoints).toBe(0);
    expect(game.view.activeHeirloom).toMatchObject({ status: "本局已触发", remainingUses: 0, maxUses: 1 });
  });

  it("lets an active relic write a real long-term story anchor", () => {
    const game = awakenedGame("万年头部魂骨·凝神");
    expect(game.view.activeHeirloom?.soulBoneFusionState).toBe("待融合");
    const fusion = resolveAction(game, "融合万年头部魂骨·凝神");
    expect(fusion.intent).toBe("融合魂骨");
    expect(game.view.character!.soulBones?.find((bone) => bone.id === "heirloom-time-anchor")).toMatchObject({ slot: "头部", years: 10000, fusionState: "已融合", attributeBonuses: { physique: 2, spirit: 20, perception: 16 } });
    const result = resolveAction(game, "发动凝神魂骨技强化五次成长");
    expect(result.intent).toBe("使用遗物");
    expect(game.view.activeHeirloom).toMatchObject({ status: "等待触发", remainingUses: 2, soulBoneFusionState: "已融合" });
    expect(game.storyMemory.openThreads[0]).toContain("凝神魂骨技训练记录");
    const before = game.world.trainingPoints;
    const training = resolveAction(game, "冥想修炼");
    expect(training.ruleSummary).toContain("凝神魂骨技令本次有效成长额外增加25点");
    expect(game.world.trainingPoints).toBeGreaterThanOrEqual(before + 25);
    expect(game.world.flags.heirloomFocusActions).toBe(4);
  });

  it("makes every summonable relic explicitly gold-finger-grade with rarity-limited charges", () => {
    const summonable = HEIRLOOMS.filter((item) => item.summonable);
    expect(summonable).toHaveLength(12);
    expect(summonable.every((item) => Boolean(item.provenance && item.canonEvidence))).toBe(true);
    expect(summonable.every((item) => !/猎魂人实勘手记|魂师驿路总图|拟态修炼室借用牌|商会预存金牌|高阶魂师引荐函|战地治疗药匣|誓约见证书|材料保价契|飞行魂师护送契/.test(item.name))).toBe(true);
    expect(summonable.filter((item) => item.provenance === "原著具名唯一物").every((item) => Boolean(item.canonImpact))).toBe(true);
    expect(summonable.filter((item) => /魂骨/.test(item.name)).every((item) => (item.soulBoneSkills?.length ?? 0) >= 1 && item.soulBoneSkills!.every((skill) => skill.name && skill.effect && skill.actionCommand))).toBe(true);
  });

  it("records a full personal-state snapshot when causal thread is armed", () => {
    const game = awakenedGame("外附魂骨·护心甲");
    expect(game.view.inventory).not.toContain("外附魂骨·护心甲");
    expect(resolveAction(game, "融合外附魂骨·护心甲").intent).toBe("融合魂骨");
    game.world.healthPoints = 73;
    game.world.fatiguePoints = 28;
    game.view.character!.coins = 456;
    game.view.character!.injuries = ["旧伤"];
    game.view.inventory.push("测试物资");
    const soulPowerBefore = game.view.character!.soulPowerCurrent!;
    const result = resolveAction(game, "发动外附魂骨护住下一次重创");
    expect(result.ruleSummary).toContain("健康、疲劳与既有伤势");
    expect(result.ruleSummary).toContain("不返还魂币和物品");
    expect(JSON.parse(String(game.world.flags.heirloomCausalSnapshot))).toEqual({ health: 73, fatigue: 53, injuries: ["旧伤"] });
    expect(game.world.flags.heirloomExposureRisk).toBe(20);
    expect(game.view.character!.soulPowerCurrent).toBe(soulPowerBefore - 35);
    expect(game.view.activeHeirloom?.soulBoneSkills).toEqual([expect.objectContaining({ name: "护心骨甲", actionCommand: "发动外附魂骨护住下一次重创" })]);
    expect(game.view.character!.soulBones?.find((bone) => bone.id === "heirloom-causal-thread")).toMatchObject({ fusionState: "已融合", exposed: true, skills: [expect.objectContaining({ name: "护心骨甲", fatigueCost: 25, cooldownActions: 5 })] });
    const remaining = game.view.activeHeirloom!.remainingUses;
    const cooldown = resolveAction(game, "发动外附魂骨护住下一次重创");
    expect(cooldown.intent).toBe("无法完成");
    expect(cooldown.ruleSummary).toContain("仍在冷却");
    expect(game.view.activeHeirloom!.remainingUses).toBe(remaining);
  });

  it("blocks soul-bone skills when the independent soul-power pool is empty and restores it through meditation", () => {
    const game = awakenedGame("外附魂骨·护心甲");
    resolveAction(game, "融合外附魂骨·护心甲");
    game.view.character!.soulPowerCurrent = 0;
    const blocked = resolveAction(game, "发动外附魂骨护住下一次重创");
    expect(blocked.intent).toBe("无法完成");
    expect(blocked.ruleSummary).toContain("魂力不足");
    const meditate = resolveAction(game, "安静冥想修炼");
    expect(meditate.systemMessages?.some((item) => item.includes("魂力恢复"))).toBe(true);
    expect(game.view.character!.soulPowerCurrent).toBeGreaterThan(0);
  });

  it("blocks a second normal soul bone from occupying an already fused fixed slot", () => {
    const game = awakenedGame("万年头部魂骨·凝神");
    game.view.character!.soulBones!.push({ id: "existing-head-bone", name: "已融合测试头骨", slot: "头部", years: 8000, source: "测试", provenance: "原著类别·同人具体魂骨", fusionState: "已融合", fusedAtAction: 0, attributeBonuses: { physique: 1, spirit: 8, perception: 6 }, skills: [{ name: "旧魂技", effect: "测试", actionCommand: "发动旧魂技", fatigueCost: 10, cooldownActions: 2, cooldownUntilAction: 0 }], exposed: false });
    const result = resolveAction(game, "融合万年头部魂骨·凝神");
    expect(result.intent).toBe("无法完成");
    expect(result.ruleSummary).toContain("头部部位已经融合已融合测试头骨");
    expect(game.view.character!.soulBones!.find((bone) => bone.id === "heirloom-time-anchor")?.fusionState).toBe("待融合");
  });

  it("directly grants a fanfic-style over-limit ring with a martial-soul skill at bottleneck", () => {
    const game = awakenedGame("同人机缘·超限神赐魂环");
    game.view.character!.soulRank = 10;
    game.view.character!.soulRings = [];
    game.view.character!.soulRingSets[game.view.character!.activeMartialSoulIndex] = game.view.character!.soulRings;
    const result = resolveAction(game, "使用超限神赐魂环突破瓶颈");
    const ring = game.view.character!.soulRings[0];
    expect(result.intent).toBe("使用遗物");
    expect(result.ruleSummary).toMatch(/同人超限神赐魂环直接完成第1魂环赋予/);
    expect(ring).toMatchObject({ index: 1, beastId: "fanfic-overlimit-bestowed-ring", beastName: "同人机缘·超限神赐魂环", color: "紫", sourceType: "同人超限神赐", overlimitProfile: expect.objectContaining({ ordinaryLimit: 423 }) });
    expect(ring.years).toBeGreaterThanOrEqual(1000);
    expect(ring.skillName).toContain(game.view.character!.martialSoul.name);
    expect(game.view.character!.soulRank).toBe(11);
    expect(game.view.character!.injuries.at(-1)).toContain("超限神赐魂环适应期");
    expect(game.world.flags.overlimitRingSecret).toContain("仅主角已确认");
    expect(game.view.activeHeirloom?.remainingUses).toBe(0);
    const reveal = resolveAction(game, "公开展示超限魂环");
    expect(reveal.intent).toBe("公开超限魂环");
    expect(game.world.flags.overlimitRingSecret).toBeUndefined();
    expect(game.world.flags.overlimitRingPublic).toContain("第1魂环");
    expect(game.world.dynamicEvents.some((event) => event.title === "超限魂环引发复测与培养争夺")).toBe(true);
    expect(Number(game.world.flags.talentResourcePriority)).toBeGreaterThanOrEqual(85);
  });

  it("scales over-limit years from martial-soul quality, body, spirit, bloodline and fused bones", () => {
    const prepare = (seed: string, strong: boolean) => {
      const game = awakenedGame("同人机缘·超限神赐魂环");
      game.view.seed = seed;
      game.view.character!.soulRank = 10;
      game.view.character!.soulRings = [];
      game.view.character!.soulRingSets[game.view.character!.activeMartialSoulIndex] = game.view.character!.soulRings;
      const soul = game.view.character!.martialSouls[game.view.character!.activeMartialSoulIndex];
      soul.grade = strong ? "神话" : "平凡";
      soul.name = strong ? "终极龙王" : "木棍";
      soul.category = strong ? "兽武魂" : "器武魂";
      soul.description = strong ? "神级龙王血脉与终极属性" : "普通木棍";
      game.view.character!.martialSoul = soul;
      game.view.character!.abilityDescriptors = strong ? { physique: "顶尖", spirit: "顶尖", perception: "顶尖" } : { physique: "普通", spirit: "普通", perception: "普通" };
      if (strong) game.view.character!.soulBones = [{ id: "fused-bone", name: "测试融合魂骨", slot: "躯干", years: 10000, source: "测试", provenance: "原著类别·同人具体魂骨", fusionState: "已融合", fusedAtAction: 0, attributeBonuses: { physique: 18, spirit: 12, perception: 4 }, skills: [{ name: "测试魂技", effect: "测试", actionCommand: "发动测试魂技", fatigueCost: 10, cooldownActions: 2, cooldownUntilAction: 0 }], exposed: false }];
      resolveAction(game, "使用超限神赐魂环突破瓶颈");
      return game.view.character!.soulRings[0];
    };
    const weak = prepare("weak-overlimit", false);
    const strong = prepare("strong-overlimit", true);
    expect(strong.years).toBeGreaterThan(weak.years);
    expect(strong.overlimitProfile!.multiplier).toBeGreaterThan(weak.overlimitProfile!.multiplier);
    expect(strong.overlimitProfile).toMatchObject({ martialSoulQualityBonus: .8, physiqueBonus: .45, spiritBonus: .35, bloodlineBonus: .5 });
    expect(strong.skillName).toContain("终极龙王");
  });

  it("does not grant the over-limit ring before a ten-level bottleneck", () => {
    const game = awakenedGame("同人机缘·超限神赐魂环");
    game.view.character!.soulRank = 9;
    const result = resolveAction(game, "使用超限神赐魂环突破瓶颈");
    expect(result.intent).toBe("无法完成");
    expect(game.view.character!.soulRings).toHaveLength(0);
    expect(game.view.activeHeirloom?.remainingUses).toBe(1);
  });

  it("uses different over-limit-ring response chains for four eras and institutions", () => {
    const cases = [
      [1, "武魂殿长老殿", "武魂殿"],
      [2, "史莱克学院", "史莱克学院"],
      [3, "传灵塔", "传灵塔"],
      [4, "斗罗联邦舰队", "斗罗联邦舰队"],
    ] as const;
    for (const [era, institution, expected] of cases) {
      const game = awakenedGame("同人机缘·超限神赐魂环", era);
      game.world.flags.openingInstitutionName = institution;
      game.view.character!.soulRank = 10;
      game.view.character!.soulRings = [];
      game.view.character!.soulRingSets[game.view.character!.activeMartialSoulIndex] = game.view.character!.soulRings;
      resolveAction(game, "使用超限神赐魂环突破瓶颈");
      const reveal = resolveAction(game, "公开展示超限魂环");
      expect(game.world.flags.overlimitPrimaryResponder, `${era}:${institution}`).toBe(expected);
      expect(reveal.ruleSummary, `${era}:${institution}`).toContain(expected);
      expect(String(game.world.flags.overlimitReactionRoute), `${era}:${institution}`).not.toContain("地方武魂殿与当地学院");
      expect(game.view.tasks.some((task) => task.title.includes(expected) && task.status === "进行中"), `${era}:${institution}`).toBe(true);
    }
  });

  it("uses the canon-grounded Spirit Hall warrant for forest entry without altering ring absorption", () => {
    const game = awakenedGame("武魂殿猎魂森林手令");
    game.view.hunting = { stage: "准备", ringIndex: 1, targetName: "百年斑斓猫", targetYears: 420, locationId: "soul-hunting-forest", recommendations: [], preparation: ["成年同行者：测试导师（防护·协同80）", "药物与猎魂绳"], trailProgress: "已选定目标" };
    const result = resolveAction(game, "出发进入猎魂森林");
    expect(result.ruleSummary).toContain("武魂殿猎魂森林手令已提交");
    expect(game.view.hunting.preparation).toContain("武魂殿一次性猎魂森林手令：已核验并提交");
    expect(game.view.activeHeirloom?.remainingUses).toBe(1);
    expect(game.world.flags.heirloomRingProtectorReady).toBeUndefined();
  });

  it("uses canon-grounded storage tools and records unique-item ownership divergence", () => {
    const storage = awakenedGame("小型储物魂导器");
    expect(storage.view.inventory).toContain("小型储物魂导器");
    expect(storage.view.inventoryLoad.capacity).toBeGreaterThanOrEqual(58);
    expect(storage.view.inventoryLoad.storage).toContain("小型储物魂导器：只存死物");
    const boat = awakenedGame("龙渊艇");
    expect(String(boat.world.flags.canonicalRelicOwnership)).toContain("唐三");
    expect(boat.view.canonInfluences.some((item) => item.id === "relic-ownership-heirloom-worn-map" && item.strength === "已形成唯一物所有权偏转")).toBe(true);
    expect(auditNarrative(boat, "唐三从自己的储物魂导器里拿出龙渊艇，准备下海。" )).toContain("正文忽略唯一物所有权偏转，让原著旧持有人重新拥有龙渊艇");
    expect(auditNarrative(boat, "顾安展开自己持有的龙渊艇，唐三只在岸边看着。" )).not.toContain("正文忽略唯一物所有权偏转，让原著旧持有人重新拥有龙渊艇");
  });

  it("executes canon-grounded subsidy and hidden-weapon mechanics with their real limits", () => {
    const ledger = awakenedGame("魂师手札");
    ledger.view.character!.soulRank = 11;
    ledger.view.character!.soulRings = [{ index: 1, beastId: "test", beastName: "测试魂兽", years: 400, color: "黄", skillName: "测试魂技", skillDescription: "测试" }];
    ledger.view.character!.soulRingSets[ledger.view.character!.activeMartialSoulIndex] = ledger.view.character!.soulRings;
    const before = ledger.view.character!.coins;
    const subsidy = resolveAction(ledger, "凭魂师手札领取本月补贴");
    expect(subsidy.ruleSummary).toContain("领取1金魂币月补贴");
    expect(ledger.view.character!.coins).toBe(before + 1);
    const earlyRepeat = resolveAction(ledger, "凭魂师手札领取本月补贴");
    expect(earlyRepeat.intent).toBe("无法完成");
    expect(earlyRepeat.ruleSummary).toContain("不足30天");

    const crossbow = awakenedGame("诸葛神弩");
    crossbow.view.hunting = { stage: "战斗", ringIndex: 1, recommendations: [], preparation: [], trailProgress: "战斗中", targetName: "测试魂兽", targetYears: 400 };
    crossbow.view.combat = { id: "crossbow-test", enemyName: "测试魂兽", enemyPower: "百年", round: 1, playerCondition: "良好", enemyCondition: "完好", distance: "中距离", escaped: false, allies: [] };
    crossbow.world.flags.combatEnemyHp = 100;
    const shot = resolveAction(crossbow, "发射诸葛神弩");
    expect(shot.ruleSummary).toContain("穿透伤害");
    expect(Number(crossbow.world.flags.combatEnemyHp)).toBeLessThanOrEqual(40);
    expect(crossbow.view.activeHeirloom?.remainingUses).toBe(2);
  });

  it("drops, stores, fuses and activates an ordinary soul bone through the shared system", () => {
    const game = awakenedGame("小型储物魂导器");
    const beast = SOUL_BEASTS[0];
    game.view.hunting = { stage: "吸收", ringIndex: 1, targetBeastId: beast.id, targetName: beast.name, targetYears: Math.max(1000, beast.ageRange[0]), recommendations: [], preparation: [], trailProgress: "目标已被击败" };
    game.world.flags.forcedSoulBoneDrop = true;
    const drop = resolveAction(game, "检查魂兽是否掉落魂骨");
    expect(drop.intent).toBe("获得魂骨");
    const bone = game.view.character!.soulBones!.find((item) => item.source.includes(beast.name))!;
    expect(bone).toMatchObject({ fusionState: "待融合", originBeastId: beast.id, skills: [expect.objectContaining({ soulPowerCost: expect.any(Number), effectKind: expect.any(String) })] });
    expect(game.view.inventory).toContain(`未融合魂骨：${bone.name}`);
    const fusion = resolveAction(game, `融合${bone.name}`);
    expect(fusion.intent).toBe("融合魂骨");
    expect(bone.fusionState).toBe("已融合");
    expect(game.view.inventory).not.toContain(`未融合魂骨：${bone.name}`);
  });

  it("delays secondary faction competition until the public message has time to spread", () => {
    const game = awakenedGame("同人机缘·超限神赐魂环", 3);
    game.world.flags.openingInstitutionName = "传灵塔";
    game.view.character!.soulRank = 10;
    game.view.character!.soulRings = [];
    game.view.character!.soulRingSets[game.view.character!.activeMartialSoulIndex] = game.view.character!.soulRings;
    resolveAction(game, "使用超限神赐魂环突破瓶颈");
    resolveAction(game, "公开展示超限魂环");
    expect(game.world.dynamicEvents.some((event) => event.id.startsWith("overlimit-secondary-"))).toBe(false);
    for (let day = 0; day < 4; day += 1) resolveAction(game, "等待一天");
    expect(game.world.dynamicEvents.some((event) => event.id.startsWith("overlimit-secondary-") && event.detail.includes("延迟传播"))).toBe(true);
    expect(game.view.intelligence.some((item) => item.source.includes("传播链"))).toBe(true);
  });

  it("ages named artifacts across eras and requires durability/ammo repair", () => {
    const game = awakenedGame("诸葛神弩", 4);
    expect(game.view.activeHeirloom).toMatchObject({ historicalState: "万年遗物·需要专项修复与鉴定", maxDurability: 70, ammo: 0 });
    expect(game.view.activeHeirloom!.durability).toBeLessThan(70);
    game.view.character!.coins = 100;
    const repair = resolveAction(game, "维修诸葛神弩");
    expect(repair.intent).toBe("维修遗物");
    expect(game.view.activeHeirloom).toMatchObject({ durability: 70, ammo: 3, remainingUses: 3 });
    expect(game.view.economy.transactions.at(-1)).toMatchObject({ kind: "支出", amount: 60 });
  });

  it("refreshes legacy active-relic text and commands to the strengthened definitions", () => {
    const game = awakenedGame("岁月锚钉");
    game.view.activeHeirloom!.effect = "旧版只固定五次行动";
    game.view.activeHeirloom!.actionCommand = "使用岁月锚钉固定五次行动";
    ensureGameState(game);
    expect(game.view.activeHeirloom!.name).toBe("万年头部魂骨·凝神");
    expect(game.view.activeHeirloom!.effect).toContain("随后5次有效成长");
    expect(game.view.activeHeirloom!.actionCommand).toBe("融合万年头部魂骨·凝神");
    expect(game.view.activeHeirloom!.soulBoneSkills).toEqual([expect.objectContaining({ name: "凝神增幅" })]);
  });
});
