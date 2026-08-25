import { describe, expect, it } from "vitest";
import { createGame, publicView } from "./generator.js";
import { compileNpcPlan, executeNpcPlanStep } from "./npc-planner.js";
import { ensureGameState } from "./world.js";

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
    expect(game.schemaVersion).toBe(36);
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
});
