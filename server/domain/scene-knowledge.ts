import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, characterById, factionActiveAtYear, locationActiveAtYear } from "../data/world.js";
import type { StoredGame } from "./model.js";

export type SceneKnowledgeKind = "地点" | "人物" | "势力" | "事件" | "情报";

export interface SceneKnowledgeEntry {
  id: string;
  kind: SceneKnowledgeKind;
  name: string;
  fact: string;
  reason: string;
}

export interface SceneKnowledgePack {
  entries: SceneKnowledgeEntry[];
  usedChars: number;
  omitted: number;
  budgetChars: number;
}

function mentions(action: string, name: string, aliases: string[] = []): boolean {
  return action.includes(name) || aliases.some((alias) => alias.length > 0 && action.includes(alias));
}

export function buildSceneKnowledgePack(game: StoredGame, action: string, budgetChars = 4_800): SceneKnowledgePack {
  const year = game.view.worldTime?.year ?? 0;
  const candidates: Array<SceneKnowledgeEntry & { priority: number }> = [];
  const add = (entry: SceneKnowledgeEntry, priority: number) => candidates.push({ ...entry, priority });

  for (const location of LOCATIONS) {
    const current = location.id === game.view.locationId;
    const discovered = game.world.discoveredLocations.includes(location.id);
    const explicitlyMentioned = mentions(action, location.name);
    if (!current && !discovered && (!explicitlyMentioned || location.hidden)) continue;
    if (!current && !locationActiveAtYear(location, year)) continue;
    add({ id: location.id, kind: "地点", name: location.name, fact: `${location.region}；危险度${location.danger}；${location.description}`, reason: current ? "当前地点" : explicitlyMentioned ? "行动提及" : "已发现地点" }, current ? 100 : explicitlyMentioned ? 80 : 25);
  }

  for (const definition of CANON_CHARACTERS) {
    const npc = game.world.npcs[definition.id];
    if (!npc?.alive || !npc.knownToPlayer) continue;
    const onScene = npc.locationId === game.view.locationId;
    const explicitlyMentioned = mentions(action, definition.name, definition.aliases);
    if (!onScene && !explicitlyMentioned) continue;
    const publicPower = game.view.knownFigures.find((figure) => figure.id === npc.id)?.knownPower ?? "实力未知";
    add({ id: npc.id, kind: "人物", name: npc.name, fact: `当前目标：${npc.currentGoal}；已知实力：${publicPower}；所属势力：${definition.factionIds.map((id) => FACTIONS.find((faction) => faction.id === id)?.name).filter(Boolean).join("、") || "未知"}`, reason: onScene ? "同场人物" : "行动提及" }, onScene ? 95 : 85);
  }

  for (const faction of FACTIONS) {
    if (!factionActiveAtYear(faction, year)) continue;
    const affiliated = game.view.affiliations.some((item) => item.id === faction.id);
    const explicitlyMentioned = mentions(action, faction.name);
    const local = faction.headquartersId === game.view.locationId;
    if (faction.hidden && !affiliated) continue;
    if (!affiliated && !explicitlyMentioned && !local) continue;
    add({ id: faction.id, kind: "势力", name: faction.name, fact: `${faction.kind}；${faction.description}`, reason: affiliated ? "所属势力" : local ? "当地势力" : "行动提及" }, affiliated ? 90 : local ? 75 : 70);
  }

  for (const event of game.world.dynamicEvents) {
    const witnessedParticipant = event.participantIds.some((id) => game.world.npcs[id]?.knownToPlayer);
    const relevant = event.locationId === game.view.locationId || witnessedParticipant || mentions(action, event.title);
    if (!relevant || (event.status === "错过" && !mentions(action, event.title))) continue;
    add({ id: event.id, kind: "事件", name: event.title, fact: `${event.detail}；状态：${event.status}${event.outcome ? `；结果：${event.outcome}` : ""}`, reason: event.locationId === game.view.locationId ? "本地事件" : "相关人物事件" }, event.status === "可介入" ? 92 : 55);
  }

  for (const event of CANON_EVENTS.filter((item) => game.world.firedCanonEvents.includes(item.id)).slice(-12)) {
    const involvedKnownNpc = event.participantIds.some((id) => game.world.npcs[id]?.knownToPlayer);
    if (!mentions(action, event.title) && event.locationId !== game.view.locationId && !involvedKnownNpc) continue;
    add({ id: event.id, kind: "事件", name: event.title, fact: event.publicSummary, reason: "已经发生的公开历史" }, 65);
  }

  for (const record of game.world.intelligenceRecords.filter((item) => item.status !== "矛盾").slice(-40)) {
    const relevant = mentions(action, record.title) || record.subjectId === game.view.locationId || (record.subjectType === "人物" && game.world.npcs[record.subjectId]?.locationId === game.view.locationId);
    if (!relevant) continue;
    add({ id: record.id, kind: "情报", name: record.title, fact: `${record.status}（可信度 ${record.confidence}%）：${record.detail}；来源：${record.source}`, reason: "玩家已获知" }, 60 + Math.round(record.confidence / 10));
  }

  const deduplicated = [...new Map(candidates.sort((left, right) => right.priority - left.priority).map((entry) => [`${entry.kind}:${entry.id}`, entry])).values()];
  const entries: SceneKnowledgeEntry[] = [];
  let usedChars = 0;
  for (const { priority: _priority, ...entry } of deduplicated) {
    const size = JSON.stringify(entry).length;
    if (usedChars + size > budgetChars) continue;
    entries.push(entry);
    usedChars += size;
  }
  return { entries, usedChars, omitted: deduplicated.length - entries.length, budgetChars };
}
