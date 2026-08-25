import { describe, expect, it } from "vitest";
import { DYNAMIC_EVENT_OUTCOMES } from "../data/dynamic-event-outcomes.js";
import { DYNAMIC_EVENT_TEMPLATES, dynamicEventTemplatesForEra } from "../data/era-dynamic-events.js";
import { resolveAction } from "./actions.js";
import { decayLocalConsequences, resolveExpiredDynamicEvent } from "./event-consequences.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
import { ensureGameState } from "./world.js";
import type { DynamicWorldEvent } from "./model.js";

function playingGame(seed: string) {
  const game = createGame({ gender: "男", difficulty: "标准", seed });
  selectCandidate(game, game.view.candidates[0].id, "后果测试者");
  const draft = game.view.shaping!.personalityOptions[0];
  finalizeCharacterShaping(game, { personalityId: draft.id, keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])) });
  awakenCharacter(game);
  selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.character!.coins = 10_000;
  game.view.economy.cash = 10_000;
  return game;
}

describe("地方事件专属后果", () => {
  it("only exposes institution events that exist in the selected era", () => {
    const era1 = dynamicEventTemplatesForEra(1, 0).map((item) => item.title);
    const era2BeforeSoulSpirits = dynamicEventTemplatesForEra(2, 10004).map((item) => item.title);
    const era2AfterSoulSpirits = dynamicEventTemplatesForEra(2, 10005).map((item) => item.title);
    const era3 = dynamicEventTemplatesForEra(3, 20000).map((item) => item.title);
    const era4 = dynamicEventTemplatesForEra(4, 30000).map((item) => item.title);

    expect(era1).not.toContain("魂导工坊核心阵法事故");
    expect(era2BeforeSoulSpirits).toContain("魂导工坊核心阵法事故");
    expect(era2BeforeSoulSpirits).not.toContain("魂灵适配实验失控");
    expect(era2AfterSoulSpirits).toContain("魂灵适配实验失控");
    expect(era3).toEqual(expect.arrayContaining(["升灵台紧急退出异常", "斗铠材料批次污染", "机甲驾驶证代考线索", "传灵塔魂灵合同投诉"]));
    expect(era3).not.toContain("星舰补给批次延误");
    expect(era4).toEqual(expect.arrayContaining(["星舰补给批次延误", "模拟舱精神过载", "真实航时登记争议", "生态样本隔离破损"]));
  });

  it("gives every era-filtered event a persistent typed outcome", () => {
    for (const template of DYNAMIC_EVENT_TEMPLATES) {
      const profile = DYNAMIC_EVENT_OUTCOMES[template.title];
      expect(profile, template.title).toBeDefined();
      expect(profile.consequences.length, template.title).toBeGreaterThan(0);
      expect(profile.consequences.every((item) => item.durationDays > 0), template.title).toBe(true);
      expect(profile.followUp?.title, template.title).toBeTruthy();
    }
  });

  it("turns an ignored herb-team disappearance into casualties, shortage, follow-up, and higher prices", () => {
    const game = playingGame("event-consequence-herbs");
    const locationId = game.view.locationId!;
    const baseline = playingGame("event-consequence-baseline");
    baseline.view.locationId = locationId;
    baseline.view.location = game.view.location;
    resolveAction(baseline, "购买一份普通药材");
    const baselinePrice = baseline.view.economy.marketReports.find((item) => item.category === "药材")!.priceIndex;
    const event: DynamicWorldEvent = { id: "ignored-herb-team", title: "失踪的采药队", kind: "地方", locationId, participantIds: [], detail: "采药队过期未归。", stakes: 2, status: "可介入", createdYear: 0, createdDay: 1, expiresOrdinal: 10 };
    game.world.dynamicEvents.push(event);
    game.view.tasks.push({ id: event.id, title: event.title, kind: "线索", detail: event.detail, status: "进行中" });
    const pressure = game.view.storyArc!.pressure;
    resolveExpiredDynamicEvent(game, event, 11);

    expect(event.status).toBe("错过");
    expect(event.outcome).toContain("药篓");
    expect(event.consequences).toEqual(expect.arrayContaining([expect.stringContaining("药材短缺")]));
    expect(game.world.localConsequences.some((item) => item.kind === "供需" && item.marketEffects.some((effect) => effect.category === "药材"))).toBe(true);
    expect(game.world.dynamicEvents.some((item) => item.id === `follow-up-${event.id}` && item.title === "家属组织的二次搜寻")).toBe(true);
    expect(game.view.tasks.find((item) => item.id === event.id)?.status).toBe("失败");
    expect(game.view.storyArc!.pressure).toBeGreaterThan(pressure);

    resolveAction(game, "购买一份普通药材");
    const consequencePrice = game.view.economy.marketReports.find((item) => item.category === "药材")!.priceIndex;
    expect(consequencePrice).toBeGreaterThan(baselinePrice);
  });

  it("gives unknown events a typed default consequence and lets temporary effects decay", () => {
    const game = playingGame("event-consequence-generic");
    const event: DynamicWorldEvent = { id: "unknown-faction-event", title: "地方行会临时争执", kind: "势力", locationId: game.view.locationId!, participantIds: [], detail: "两方没有谈拢。", stakes: 3, status: "可介入", createdYear: 0, createdDay: 1, expiresOrdinal: 10 };
    game.world.dynamicEvents.push(event);
    resolveExpiredDynamicEvent(game, event, 11);
    expect(event.outcome).toMatch(/组织|争议|临时决定/);
    expect(game.world.localConsequences.some((item) => item.kind === "势力")).toBe(true);
    const expiry = Math.max(...game.world.localConsequences.map((item) => item.expiresOrdinal));
    decayLocalConsequences(game, expiry + 1);
    expect(game.world.localConsequences.every((item) => item.status === "已消退")).toBe(true);
  });

  it("keeps a refused event alive until its deadline instead of treating refusal as resolution", () => {
    const game = playingGame("event-consequence-refusal");
    const now = (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1);
    const event: DynamicWorldEvent = { id: "refused-herb-team", title: "失踪的采药队", kind: "地方", locationId: game.view.locationId!, participantIds: [], detail: "采药队过期未归。", stakes: 2, status: "可介入", createdYear: game.view.worldTime?.year ?? 0, createdDay: game.view.worldTime?.day ?? 1, expiresOrdinal: now + 40 };
    game.world.dynamicEvents.push(event);
    game.view.tasks.push({ id: event.id, title: event.title, kind: "线索", detail: event.detail, status: "进行中" });
    const result = resolveAction(game, "拒绝处理失踪的采药队");
    expect(result.intent).toBe("拒绝人物请求");
    expect(event.status).toBe("可介入");
    expect(game.world.flags[`declinedEvent:${event.id}`]).toBe(true);
    resolveExpiredDynamicEvent(game, event, now + 41);
    expect(event.status).toBe("错过");
    expect(game.world.localConsequences.some((item) => item.sourceEventId === event.id)).toBe(true);
  });

  it("migrates old saves with an empty consequence ledger", () => {
    const game = playingGame("event-consequence-migration");
    game.view.inventory.push("止血散");
    game.view.inventoryLoad.storage.push("止血散");
    delete (game.world as Partial<typeof game.world>).localConsequences;
    game.schemaVersion = 31;
    const migrated = ensureGameState(structuredClone(game));
    expect(migrated.schemaVersion).toBe(33);
    expect(migrated.world.localConsequences).toEqual([]);
    expect(migrated.view.inventory).toContain("外敷伤药");
    expect(migrated.view.inventoryLoad.storage).toContain("外敷伤药");
    expect(`${migrated.view.inventory.join("、")}${migrated.view.inventoryLoad.storage.join("、")}`).not.toContain("止血散");
  });
});
