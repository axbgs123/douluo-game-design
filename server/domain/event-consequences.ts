import { randomUUID } from "node:crypto";
import { DYNAMIC_EVENT_OUTCOMES, type DynamicEventOutcomeProfile } from "../data/dynamic-event-outcomes.js";
import type { DynamicWorldEvent, LocalWorldConsequence, StoredGame } from "./model.js";

const GENERIC_PROFILES: Record<DynamicWorldEvent["kind"], DynamicEventOutcomeProfile> = {
  地方: { outcome: "事件超过可处理期限后对当地生活造成了持续影响，相关人员只能先控制损失。", consequences: [{ kind: "治安", summary: "地方资源被迫转向善后，日常安全和办事效率下降。", magnitude: 2, durationDays: 60, riskDelta: 6 }], followUp: { title: "地方善后与责任追查", detail: "损失已经发生，当地人开始追查责任、补充资源并防止同类事件重演。", stakesDelta: 0, expiresDays: 45 } },
  势力: { outcome: "事件在期限内没有形成一致处理，组织内部按各自利益作出临时决定，争议被带入后续事务。", consequences: [{ kind: "势力", summary: "内部责任与资源分配出现分歧，后续决定需要更多证据和复核。", magnitude: 2, durationDays: 90 }], followUp: { title: "组织内部的后续复核", detail: "临时决定没有解决全部争议，相关派系要求补齐证据、责任人与资源账目。", stakesDelta: 1, expiresDays: 60 } },
  人物: { outcome: "当事人没有等到玩家介入，按照自己的目标和资源作出选择，并记住了谁在期限内保持沉默。", consequences: [{ kind: "关系", summary: "当事人的计划继续推进，与可能帮助者之间的信任和期待发生变化。", magnitude: 2, durationDays: 75 }], followUp: { title: "当事人自行选择后的余波", detail: "当事人的决定已经生效，后续接触只能处理新局面，不能假装期限从未过去。", stakesDelta: 0, expiresDays: 45 } },
  历史前兆: { outcome: "前兆无人处理后成为历史惯性的一部分，相关人物与势力提前调整了自己的准备。", consequences: [{ kind: "势力", summary: "相关势力提前进入戒备，原著节点的参与条件发生局部变化。", magnitude: 4, durationDays: 180, riskDelta: 12 }], followUp: { title: "历史前兆形成的提前戒备", detail: "相关势力已经调整人手和资源；之后再介入，需要面对已经变化的准备与信息差。", stakesDelta: 1, expiresDays: 90 } },
};

function profileFor(event: DynamicWorldEvent): DynamicEventOutcomeProfile {
  const exact = DYNAMIC_EVENT_OUTCOMES[event.title];
  if (exact) return exact;
  if (/袭击准备|盯梢|查问觉醒名册/.test(event.title)) return {
    outcome: "针对主角的情报活动没有被及时处理，对方获得了更完整的作息、同行者或保护安排，威胁进入下一阶段。",
    consequences: [{ kind: "治安", summary: "身份与行踪暴露增加，公开出行和猎魂准备更容易被针对。", magnitude: Math.max(3, event.stakes), durationDays: 120, riskDelta: 15 + event.stakes * 2 }],
    followUp: { title: "敌对情报链的下一次试探", detail: "对方已经掌握部分可靠行踪，接下来可能从接触监护人、制造落单或攻击资源链中选择成本最低的一项。", stakesDelta: 1, expiresDays: 60 },
  };
  return GENERIC_PROFILES[event.kind];
}

function visibleToPlayer(game: StoredGame, event: DynamicWorldEvent): boolean {
  return event.locationId === game.view.locationId || event.participantIds.some((id) => game.world.npcs[id]?.knownToPlayer);
}

export function decayLocalConsequences(game: StoredGame, currentOrdinal: number): void {
  for (const consequence of game.world.localConsequences) if (consequence.status === "生效中" && consequence.expiresOrdinal < currentOrdinal) consequence.status = "已消退";
  game.world.localConsequences = game.world.localConsequences.filter((item) => item.status === "生效中" || item.expiresOrdinal > currentOrdinal - 360).slice(-160);
}

export function resolveExpiredDynamicEvent(game: StoredGame, event: DynamicWorldEvent, currentOrdinal: number): string {
  if (event.status !== "可介入") return event.outcome ?? "事件已经结束";
  const profile = profileFor(event);
  event.status = "错过";
  event.outcome = profile.outcome;
  event.consequences = profile.consequences.map((item) => item.summary);
  const task = game.view.tasks.find((item) => item.id === event.id); if (task) task.status = "失败";
  for (const [index, item] of profile.consequences.entries()) {
    const consequence: LocalWorldConsequence = {
      id: `consequence-${event.id}-${index}`,
      sourceEventId: event.id,
      locationId: event.locationId,
      kind: item.kind,
      summary: item.summary,
      magnitude: item.magnitude,
      marketEffects: item.marketEffects ?? [],
      riskDelta: item.riskDelta ?? 0,
      startedOrdinal: currentOrdinal,
      expiresOrdinal: currentOrdinal + item.durationDays,
      status: "生效中",
    };
    game.world.localConsequences = game.world.localConsequences.filter((existing) => existing.id !== consequence.id);
    game.world.localConsequences.push(consequence);
  }
  for (const id of event.participantIds) {
    const npc = game.world.npcs[id]; if (!npc?.activePlan) continue;
    npc.activePlan.status = "受阻";
    npc.activePlan.lastOutcome = `“${event.title}”未获处理：${profile.outcome}`;
    npc.activePlan.progress = Math.max(0, npc.activePlan.progress - event.stakes * 5);
  }
  if (game.view.storyArc) {
    game.view.storyArc.pressure = Math.min(100, game.view.storyArc.pressure + event.stakes * 4);
    game.view.storyArc.evidence = [...new Set([...game.view.storyArc.evidence, `${event.title}被错过：${profile.outcome}`])].slice(-12);
  }
  const observable = visibleToPlayer(game, event);
  const followDepth = event.id.split("follow-up-").length - 1;
  if (profile.followUp && followDepth < 2) {
    const followId = `follow-up-${event.id}`;
    if (!game.world.dynamicEvents.some((item) => item.id === followId)) {
      const follow: DynamicWorldEvent = { id: followId, title: profile.followUp.title, kind: event.kind, locationId: event.locationId, participantIds: event.participantIds, detail: profile.followUp.detail, stakes: Math.max(1, Math.min(5, event.stakes + profile.followUp.stakesDelta)), status: "可介入", createdYear: game.view.worldTime?.year ?? event.createdYear, createdDay: game.view.worldTime?.day ?? event.createdDay, expiresOrdinal: currentOrdinal + profile.followUp.expiresDays };
      game.world.dynamicEvents.push(follow);
      if (observable) game.view.tasks.push({ id: follow.id, title: follow.title, kind: "线索", detail: follow.detail, status: "进行中", destinationId: follow.locationId, deadline: `${profile.followUp.expiresDays}日内` });
    }
  }
  if (observable) game.view.news.unshift({ id: randomUUID(), title: `错过事件 · ${event.title}`, detail: `${profile.outcome} 后果：${event.consequences.join("；")}`, date: `原作 ${game.view.worldTime?.year ?? event.createdYear} 年第 ${game.view.worldTime?.day ?? event.createdDay} 日` });
  game.world.localConsequences = game.world.localConsequences.slice(-160);
  return profile.outcome;
}
