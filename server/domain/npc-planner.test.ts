import { describe, expect, it } from "vitest";
import { createGame, publicView } from "./generator.js";
import { compileNpcPlan, executeNpcPlanStep } from "./npc-planner.js";
import { createHiddenWorld, ensureGameState } from "./world.js";

describe("NPC欲望—责任—资源行动规划器", () => {
  it("builds an executable six-link plan from canon goals, authority, resources, and information", () => {
    const game = ensureGameState(createGame({ era: 1, gender: "男", difficulty: "标准", seed: "npc-plan-tang-hao" }));
    const tangHao = game.world.npcs["tang-hao"];
    expect(tangHao.activePlan).toBeDefined();
    expect(tangHao.activePlan?.desire).toContain("保护唐三");
    expect(tangHao.activePlan?.responsibility.length).toBeGreaterThan(8);
    expect(tangHao.activePlan?.informationBoundary.length).toBeGreaterThan(0);
    expect(tangHao.activePlan?.authority).toContain("高层决策");
    expect(tangHao.activePlan?.resources.some((item) => item.includes("当前实力"))).toBe(true);
    expect(tangHao.activePlan?.nextAction).toMatch(/保护|风险/);
    const result = executeNpcPlanStep(game, tangHao, 30);
    expect(result.reason).toContain("责任");
    expect(tangHao.autonomyLog.at(-1)?.reason).toContain("保护唐三");
    expect(JSON.stringify(publicView(game))).not.toContain("informationBoundary");
  });

  it("records player-caused plan changes and refuses to teleport across an unavailable route", () => {
    const original = ensureGameState(createGame({ era: 1, gender: "女", difficulty: "困难", seed: "npc-plan-route-boundary" }));
    delete original.world.npcs["yu-xiaogang"].activePlan;
    original.schemaVersion = 30;
    const game = ensureGameState(structuredClone(original));
    expect(game.schemaVersion).toBe(52);
    expect(game.world.npcs["yu-xiaogang"].activePlan).toBeDefined();
    const npc = game.world.npcs["yu-xiaogang"];
    game.world.canonCausalFootprints.push({ id: "player-impact", source: "玩家行动", description: "公开打乱了学院原定培养安排", atYear: 0, atDay: 1, locationId: npc.locationId, affectedNpcIds: [npc.id], affectedFactionIds: [], strength: 5 });
    npc.activePlan = compileNpcPlan(game, npc, 60);
    npc.activePlan.targetLocationId = "sea-god-island";
    const before = npc.locationId;
    const result = executeNpcPlanStep(game, npc, 60);
    expect(result.moved).toBe(false);
    expect(npc.locationId).toBe(before);
    expect(npc.activePlan.status).toBe("受阻");
    expect(npc.activePlan.lastOutcome).toMatch(/路引|交通|许可|带路人/);
    expect(npc.activePlan.playerImpact).toContain("玩家此前");
  });

  it("keeps profession, daily obligation, speech, attention, and refusal boundaries distinct", () => {
    const game = ensureGameState(createGame({ era: 1, gender: "男", difficulty: "标准", seed: "npc-living-behavior" }));
    game.view.worldTime = { era: "魂师大赛阶段", year: 8, day: 180, time: "08:00", season: "夏" };
    game.world = createHiddenWorld(8, "heaven-dou-city", 180);
    const teacher = compileNpcPlan(game, game.world.npcs["zhao-wuji"], 8 * 360 + 180);
    const healer = compileNpcPlan(game, game.world.npcs["ye-lingling"], 8 * 360 + 180);
    const youngRoyal = compileNpcPlan(game, game.world.npcs["xue-ke"], 8 * 360 + 180);
    expect(teacher.ordinaryObligation).toMatch(/备课|学员训练记录|学院事务/);
    expect(teacher.attentionFocus).toMatch(/基础动作|安全风险|训练记录/);
    expect(teacher.speechStyle).toContain("说话直接");
    expect(healer.attentionFocus).toMatch(/伤势|呼吸|治疗/);
    expect(healer.speechStyle).toContain("先确认事实");
    expect(youngRoyal.refusalBoundary).toMatch(/不会凭一句话调动成年人/);
    expect(new Set([teacher.attentionFocus, healer.attentionFocus, youngRoyal.attentionFocus]).size).toBeGreaterThan(1);
    expect(teacher.nextAction).toContain(teacher.ordinaryObligation!);

    teacher.targetLocationId = game.world.npcs["zhao-wuji"].locationId;
    game.world.npcs["zhao-wuji"].activePlan = teacher;
    const planActions = [0, 1, 2, 3].map((offset) => executeNpcPlanStep(game, game.world.npcs["zhao-wuji"], 8 * 360 + 180 + offset * 30).action);
    expect(new Set(planActions).size).toBe(4);
    expect(planActions[0]).toContain(teacher.ordinaryObligation!);
    expect(planActions.slice(1).join("。")).toMatch(/风险|行程|护卫|警戒/);

    game.world.npcs["zhao-wuji"].activePlan!.status = "计划中";
    game.world.npcs["zhao-wuji"].activePlan!.progress = 50;
    game.world.npcs["zhao-wuji"].activePlan!.deadlineOrdinal = 8 * 360 + 300;
    delete game.world.npcs["zhao-wuji"].activePlan!.ordinaryObligation;
    delete game.world.npcs["zhao-wuji"].activePlan!.speechStyle;
    const migrated = ensureGameState(game);
    expect(migrated.world.npcs["zhao-wuji"].activePlan).toMatchObject({ ordinaryObligation: expect.any(String), speechStyle: expect.any(String), attentionFocus: expect.any(String), refusalBoundary: expect.any(String) });
    expect(JSON.stringify(publicView(migrated))).not.toContain("refusalBoundary");
  });
});
