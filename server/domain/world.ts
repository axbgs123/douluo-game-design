import { randomUUID } from "node:crypto";
import type { GameView, IntelligenceView, KnownFigureView, MapHierarchyView, MapLocationView, NpcRelationEvidenceView, WorldEventView, WorldNewsView } from "../../shared/game.js";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, characterById, locationActiveAtYear, locationById } from "../data/world.js";
import type { HiddenWorldState, NpcMemoryEntry, StoredGame, WorldNpcState } from "./model.js";
import { toThirdPersonNarrative } from "./narrative.js";
import { refreshStoryArchive } from "./story-rules.js";
import { createRandom, integer, pick } from "./random.js";
import { worldMapPoint } from "../../shared/world-map.js";
import { martialSoulGrade, normalizeMartialSoulName } from "../../shared/martial-soul.js";
import { fixedTraitEffect } from "./traits.js";

const DAYS_PER_YEAR = 360;

function eraIndexAtYear(year: number): 1 | 2 | 3 | 4 {
  return year >= 25_000 ? 4 : year >= 15_000 ? 3 : year >= 5_000 ? 2 : 1;
}

const CROSS_ERA_SOUL_BEASTS = new Set(["di-tian", "bi-ji", "zi-ji", "xiong-jun", "wan-yao-wang", "chi-wang"]);

function characterExistsInEra(characterId: string, year: number): boolean {
  if (CROSS_ERA_SOUL_BEASTS.has(characterId)) return true;
  if (characterId === "tian-meng") return eraIndexAtYear(year) <= 2;
  const definition = characterById(characterId);
  const firstSnapshotYear = definition?.powerSnapshots.reduce((first, snapshot) => Math.min(first, snapshot.year), Number.POSITIVE_INFINITY);
  if (firstSnapshotYear === undefined || !Number.isFinite(firstSnapshotYear)) return false;
  return eraIndexAtYear(firstSnapshotYear) === eraIndexAtYear(year);
}

const TIMED_FACTION_MEMBERSHIPS = [
  { characterId: "tang-san", factionId: "shrek", eventId: "shrek-enrollment" },
  { characterId: "tang-san", factionId: "clear-sky", eventId: "clear-sky-return" },
  { characterId: "tang-san", factionId: "tang-sect", eventId: "tang-sect-founded" },
  { characterId: "xiao-wu", factionId: "shrek", eventId: "shrek-enrollment" },
  { characterId: "dai-mubai", factionId: "shrek", eventId: "shrek-enrollment" },
  { characterId: "zhu-zhuqing", factionId: "shrek", eventId: "shrek-enrollment" },
  { characterId: "ning-rongrong", factionId: "shrek", eventId: "shrek-enrollment" },
  { characterId: "ao-si-ka", factionId: "shrek", eventId: "shrek-enrollment" },
  { characterId: "ma-hongjun", factionId: "shrek", eventId: "shrek-enrollment" },
  { characterId: "huo-yuhao", factionId: "peerless-tang-sect", eventId: "d2-tang-sect-meeting" },
  { characterId: "huo-yuhao", factionId: "shrek-inner-court", eventId: "d2-shrek-enrollment" },
  { characterId: "tang-wutong", factionId: "shrek-inner-court", eventId: "d2-shrek-enrollment" },
  { characterId: "xiao-xiao", factionId: "shrek-inner-court", eventId: "d2-shrek-enrollment" },
  { characterId: "tang-wulin", factionId: "d3-tang-sect", eventId: "d3-east-sea-enrollment" },
  { characterId: "tang-wulin", factionId: "d3-shrek-seven", eventId: "d3-shrek-entry" },
  { characterId: "gu-yue-na", factionId: "d3-shrek-seven", eventId: "d3-shrek-entry" },
  { characterId: "xie-xie", factionId: "d3-shrek-seven", eventId: "d3-shrek-entry" },
  { characterId: "xu-xiaoyan", factionId: "d3-shrek-seven", eventId: "d3-shrek-entry" },
  { characterId: "ye-xinglan", factionId: "d3-shrek-seven", eventId: "d3-shrek-entry" },
  { characterId: "yuanen-yehui", factionId: "d3-shrek-seven", eventId: "d3-shrek-entry" },
  { characterId: "yue-zhengyu", factionId: "d3-shrek-seven", eventId: "d3-shrek-entry" },
  { characterId: "xu-lizhi", factionId: "d3-shrek-seven", eventId: "d3-shrek-entry" },
  { characterId: "lan-xuanyu", factionId: "shrek-space-command", eventId: "d4-shrek-exam" },
  { characterId: "lan-xuanyu", factionId: "d4-federal-fleet", eventId: "d4-fleet-entry" },
  { characterId: "bai-xiuxiu", factionId: "shrek-space-command", eventId: "d4-shrek-exam" },
  { characterId: "qian-lei", factionId: "shrek-space-command", eventId: "d4-shrek-exam" },
  { characterId: "liu-feng", factionId: "shrek-space-command", eventId: "d4-shrek-exam" },
  { characterId: "lan-mengqin", factionId: "shrek-space-command", eventId: "d4-shrek-exam" },
  { characterId: "yuanen-huihui", factionId: "shrek-space-command", eventId: "d4-shrek-exam" },
  { characterId: "tang-yuge", factionId: "shrek-space-command", eventId: "d4-shrek-exam" },
] as const;

function canonicalFactionIdsAtDate(characterId: string, year: number, day: number): string[] {
  const definition = characterById(characterId);
  if (!definition) return [];
  return definition.factionIds.filter((factionId) => {
    const membership = TIMED_FACTION_MEMBERSHIPS.find((item) => item.characterId === characterId && item.factionId === factionId);
    if (!membership) return true;
    const event = CANON_EVENTS.find((item) => item.id === membership.eventId);
    return Boolean(event && ordinal(event.year, event.day ?? 1) <= ordinal(year, day));
  });
}

function applyFactionJoinsForEvent(game: StoredGame, eventId: string): void {
  for (const membership of TIMED_FACTION_MEMBERSHIPS.filter((item) => item.eventId === eventId)) {
    const npc = game.world.npcs[membership.characterId];
    if (npc && !npc.factionIds.includes(membership.factionId)) npc.factionIds.push(membership.factionId);
  }
}

function reconcileTimedFactionMemberships(game: StoredGame, year: number, day: number): void {
  for (const npc of Object.values(game.world.npcs)) {
    const canonical = canonicalFactionIdsAtDate(npc.id, year, day);
    npc.factionIds = canonical.filter((factionId) => {
      const membership = TIMED_FACTION_MEMBERSHIPS.find((item) => item.characterId === npc.id && item.factionId === factionId);
      return !membership || !game.world.suppressedCanonEvents.includes(membership.eventId);
    });
  }
}

function eraAtYear(year: number): string {
  const [base, anchor] = year >= 25000 ? [30000, "蓝轩宇觉醒"] : year >= 15000 ? [20000, "唐舞麟觉醒"] : year >= 5000 ? [10000, "霍雨浩离府求学"] : [0, "唐三觉醒"];
  const offset = year - base;
  if (offset === 0) return `${anchor}基准年`;
  return offset < 0 ? `比${anchor}基准年早约 ${Math.abs(offset)} 年` : `比${anchor}基准年晚约 ${offset} 年`;
}

const DYNAMIC_EVENT_TEMPLATES = [
  { title: "失踪的采药队", kind: "地方" as const, detail: "一支采药队过了约定日期仍没回来，家属正在凑钱找人。", stakes: 2 },
  { title: "魂兽越界", kind: "地方" as const, detail: "外围魂兽闯入耕地，痕迹和当地人熟悉的种类对不上。", stakes: 3 },
  { title: "学院名额争议", kind: "势力" as const, detail: "工读生名额被临时改动，两个家庭各自拿着盖过章的证明。", stakes: 2 },
  { title: "商路扣押", kind: "势力" as const, detail: "一批药材被关卡扣住，商队和守军都说自己手续齐全。", stakes: 3 },
  { title: "受伤的陌生魂师", kind: "人物" as const, detail: "有人在城外发现一名重伤魂师，他不肯说自己从哪里来。", stakes: 3 },
  { title: "宗门招募", kind: "势力" as const, detail: "附近宗门派人登记年轻魂师，给出的条件很好，契约却写得含糊。", stakes: 2 },
  { title: "旧矿洞异响", kind: "地方" as const, detail: "停用多年的矿洞夜里传出敲击声，守夜人已经辞了两个。", stakes: 4 },
  { title: "来历不明的挑战者", kind: "人物" as const, detail: "一名年轻魂师连胜数场，只问本地最强的同龄人在哪里。", stakes: 2 },
];

function ordinal(year: number, day: number): number { return year * DAYS_PER_YEAR + day; }

export function inferLocationId(location: string): string {
  if (/联邦母舰港|母舰港/.test(location)) return "mother-ship-port";
  if (/森罗星/.test(location)) return "senluo-planet";
  if (/精灵星/.test(location)) return "elf-planet";
  if (/海外星罗/.test(location)) return "d3-star-luo-capital";
  if (/传灵塔总部/.test(location)) return "spirit-pagoda-hq";
  if (/联邦明都/.test(location)) return "mingdu-federal";
  if (/东海城/.test(location)) return "east-sea-city";
  if (/史莱克城/.test(location)) return "shrek-city";
  if (/明都/.test(location)) return "radiant-city";
  if (/天魂/.test(location)) return "heavenly-soul-city";
  if (/斗灵/.test(location)) return "dou-ling-city";
  if (/极北.*核心|冰天雪女|冰碧帝皇蝎/.test(location)) return "extreme-north-core";
  if (/极北|北境冰原/.test(location)) return "extreme-north-edge";
  if (/圣魂村/.test(location)) return "holy-soul-village";
  if (/诺丁.*学院/.test(location)) return "notting-academy";
  if (/诺丁/.test(location)) return "notting-city";
  if (/索托/.test(location)) return "suotuo-city";
  if (/史莱克/.test(location)) return "shrek-village";
  if (/星斗.*核心/.test(location)) return "star-dou-core";
  if (/星斗/.test(location)) return "star-dou-edge";
  if (/落日|天斗南部丘陵/.test(location)) return "sunset-forest";
  if (/七宝琉璃宗|七宝商道/.test(location)) return "seven-treasure-fort";
  if (/蓝电霸王龙宗|雷谷村/.test(location)) return "blue-lightning-mountain";
  if (/昊天宗/.test(location)) return "clear-sky-mountain";
  if (/太玄|剑谷/.test(location)) return "taixuan-valley";
  if (/海神岛/.test(location)) return "sea-god-island";
  if (/杀戮之都/.test(location)) return "slaughter-city";
  if (/庚辛/.test(location)) return "gengxin-city";
  if (/龙兴/.test(location)) return "longxing-city";
  if (/天斗城|天斗东部主城|天斗帝国中央/.test(location)) return "heaven-dou-city";
  if (/武魂城/.test(location)) return "spirit-city";
  if (/星罗/.test(location)) return "star-luo-city";
  if (/猎魂森林/.test(location)) return "soul-hunting-forest";
  return "notting-city";
}

function tierForRank(rank: number): string {
  if (rank < 10) return "魂士";
  if (rank < 20) return "魂师";
  if (rank < 30) return "大魂师";
  if (rank < 40) return "魂尊";
  if (rank < 50) return "魂宗";
  if (rank < 60) return "魂王";
  if (rank < 70) return "魂帝";
  if (rank < 80) return "魂圣";
  if (rank < 90) return "魂斗罗";
  return "封号斗罗";
}

function powerAtYear(characterId: string, year: number): { soulRank?: number; tier: string } {
  const definition = characterById(characterId);
  if (!definition?.powerSnapshots.length) return { tier: "未知" };
  const snapshots = [...definition.powerSnapshots].sort((left, right) => left.year - right.year);
  const first = snapshots[0];
  if (year < first.year) {
    if (definition.birthYear === undefined) return { tier: "实力未核实" };
    const age = year - definition.birthYear;
    if (age < 6) return { tier: "尚未觉醒" };
    if (first.soulRank === undefined) return { tier: "实力未核实" };
    const firstAge = first.year - definition.birthYear;
    if (firstAge <= 6) return { soulRank: Math.min(first.soulRank, 10), tier: tierForRank(Math.min(first.soulRank, 10)) };
    const ratio = Math.max(0, Math.min(1, (age - 6) / (firstAge - 6)));
    const estimatedRank = Math.max(1, Math.round(6 + (first.soulRank - 6) * ratio));
    return { soulRank: estimatedRank, tier: tierForRank(estimatedRank) };
  }
  const prior = snapshots.filter((snapshot) => snapshot.year <= year).at(-1) ?? first;
  const next = snapshots.find((snapshot) => snapshot.year > year);
  if (prior.soulRank !== undefined && next?.soulRank !== undefined && next.year !== prior.year) {
    const ratio = Math.max(0, Math.min(1, (year - prior.year) / (next.year - prior.year)));
    return { soulRank: Math.round(prior.soulRank + (next.soulRank - prior.soulRank) * ratio), tier: prior.tier };
  }
  return { soulRank: prior.soulRank, tier: prior.tier };
}

function canonicalLocationAtYear(characterId: string, year: number, day = 360): string {
  const definition = characterById(characterId);
  const latestEvent = CANON_EVENTS
    .filter((event) => (event.year < year || (event.year === year && (event.day ?? 1) <= day)) && event.locationId && event.participantIds.includes(characterId))
    .sort((left, right) => left.year - right.year || (left.day ?? 1) - (right.day ?? 1))
    .at(-1);
  return latestEvent?.locationId ?? definition?.initialLocationId ?? "notting-city";
}

export function createHiddenWorld(startYear: number, startLocationId: string): HiddenWorldState {
  const npcs = Object.fromEntries(CANON_CHARACTERS.map((definition) => {
    const power = powerAtYear(definition.id, startYear);
    const born = definition.birthYear === undefined || startYear >= definition.birthYear;
    const inCurrentEra = characterExistsInEra(definition.id, startYear);
    const aliveAtStart = inCurrentEra && born && (definition.deathYear === undefined || startYear < definition.deathYear);
    const state: WorldNpcState = {
      id: definition.id,
      name: definition.name,
      alive: aliveAtStart,
      age: definition.birthYear === undefined ? undefined : Math.max(0, startYear - definition.birthYear),
      soulRank: aliveAtStart ? power.soulRank : undefined,
      powerTier: aliveAtStart ? power.tier : "不在当世活动",
      locationId: canonicalLocationAtYear(definition.id, startYear, 1),
      factionIds: canonicalFactionIdsAtDate(definition.id, startYear, 1),
      currentGoal: !inCurrentEra ? "不在当前时代活动" : !born ? "尚未出生" : aliveAtStart ? (definition.goals[0] ?? "继续当前生活") : "已死亡",
      dispositionToPlayer: 0,
      knownToPlayer: false,
      lastSimulatedYear: startYear,
      memoryOfPlayer: [],
      episodicMemory: [],
      autonomyLog: [],
    };
    return [definition.id, state];
  }));

  return {
    npcs,
    firedCanonEvents: CANON_EVENTS.filter((event) => event.year < startYear).map((event) => event.id),
    suppressedCanonEvents: [],
    deviation: 0,
    canonCausalFootprints: [],
    npcRelations: [],
    dynamicEvents: [],
    socialRumors: [],
    lastAutonomyOrdinal: ordinal(startYear, 1),
    resurrectionCount: 0,
    resurrectionRecords: [],
    discoveredLocations: [startLocationId],
    intelligenceRecords: [],
    flags: {},
    trainingPoints: 0,
    healthPoints: 100,
    fatiguePoints: 0,
    metrics: { discoveries: 0, relationshipsBuilt: 0, historicalImpact: 0, completedHunts: 0, promisesKept: 0, battlesWon: 0 },
    actionLedger: [],
  };
}

function memorySignificance(text: string): 1 | 2 | 3 {
  if (/救命|死亡|背叛|承诺|师徒|亲属|袭击|秘密|复生|拒绝|结婚/.test(text)) return 3;
  if (/成功|失败|介入|帮助|交易|战斗|交谈|拜师/.test(text)) return 2;
  return 1;
}

export function rememberNpcInteraction(
  game: StoredGame,
  npc: WorldNpcState,
  text: string,
  source: NpcMemoryEntry["source"] = "规则结算",
): void {
  const normalized = text.trim().slice(0, 220);
  if (!normalized) return;
  const time = game.view.worldTime;
  const memory: NpcMemoryEntry = {
    id: randomUUID(),
    text: normalized,
    year: time?.year ?? 0,
    day: time?.day ?? 1,
    actionIndex: game.actionIndex,
    significance: memorySignificance(normalized),
    source,
    witnessed: true,
  };
  npc.episodicMemory ??= [];
  npc.episodicMemory.push(memory);
  npc.episodicMemory = npc.episodicMemory
    .sort((left, right) => right.significance - left.significance || right.actionIndex - left.actionIndex)
    .slice(0, 24)
    .sort((left, right) => left.actionIndex - right.actionIndex);
  npc.memoryOfPlayer.push(normalized);
  npc.memoryOfPlayer = npc.memoryOfPlayer.slice(-12);
}

export function recordCanonInfluence(
  game: StoredGame,
  input: { source: string; description: string; affectedNpcIds?: string[]; affectedFactionIds?: string[]; strength: number; locationId?: string },
): void {
  const time = game.view.worldTime;
  game.world.canonCausalFootprints.push({
    id: `cause-${game.actionIndex}-${game.world.canonCausalFootprints.length}`,
    source: input.source,
    description: input.description,
    atYear: time?.year ?? 0,
    atDay: time?.day ?? 1,
    locationId: input.locationId ?? game.view.locationId ?? "notting-city",
    affectedNpcIds: [...new Set(input.affectedNpcIds ?? [])],
    affectedFactionIds: [...new Set(input.affectedFactionIds ?? [])],
    strength: Math.max(0, input.strength),
  });
  game.world.canonCausalFootprints = game.world.canonCausalFootprints.slice(-120);
  const latest = game.world.canonCausalFootprints.at(-1)!;
  const affectedNames = latest.affectedNpcIds.map((id) => characterById(id)?.name ?? id);
  const affectedFactions = latest.affectedFactionIds.map((id) => FACTIONS.find((item) => item.id === id)?.name ?? id);
  game.view.canonInfluences.unshift({
    id: latest.id,
    action: latest.description,
    affects: [...new Set([...affectedNames, ...affectedFactions])].join("、") || "当前地点",
    strength: latest.strength >= 30 ? "足以撼动关键节点" : latest.strength >= 12 ? "可能形成长期偏差" : "轻微影响",
    date: `原作 ${latest.atYear >= 0 ? "+" : ""}${latest.atYear} 年 · 第 ${latest.atDay} 日`,
  });
  game.view.canonInfluences = game.view.canonInfluences.slice(0, 24);
}

function npcHasPlayerInfluence(game: StoredGame, npcId: string): boolean {
  const definition = characterById(npcId);
  return game.world.canonCausalFootprints.some((cause) => cause.affectedNpcIds.includes(npcId)
    || definition?.factionIds.some((id) => cause.affectedFactionIds.includes(id)));
}

export function buildMapView(game: StoredGame): MapLocationView[] {
  const currentId = game.view.locationId ?? "notting-city";
  const current = locationById(currentId);
  const customCurrentName = Boolean(game.view.location && current && game.view.location !== current.name);
  const visibleIds = new Set([currentId, ...game.world.discoveredLocations, ...(current?.connections.map((connection) => connection.id) ?? [])]);
  const activeTaskText = game.view.tasks.filter((task) => task.status === "进行中").map((task) => `${task.title}${task.detail}`).join(" ");
  const selectedHome = game.hiddenCandidates.find((candidate) => candidate.public.id === game.view.selectedCandidateId)?.public;
  const year = game.view.worldTime?.year ?? 0;
  return LOCATIONS.filter((location) => {
    if (location.id !== currentId && !locationActiveAtYear(location, year)) return false;
    const point = worldMapPoint(location.id);
    return (!point.hidden && !location.hidden) || visibleIds.has(location.id);
  }).map((location) => {
    const point = worldMapPoint(location.id);
    const isAtSelectedHome = location.id === currentId && selectedHome?.dwelling === game.view.location;
    const objective = game.view.hunting?.locationId === location.id && game.view.hunting.stage !== "完成"
      ? "猎魂" as const
      : game.world.dynamicEvents.some((event) => event.status === "可介入" && event.locationId === location.id)
        ? "事件" as const
        : game.view.tasks.some((task) => task.status === "进行中" && task.destinationId === location.id) || activeTaskText.includes(location.name)
          ? "任务" as const
          : undefined;
    return {
      id: location.id,
      name: location.id === currentId && game.view.location ? game.view.location : location.name,
      region: location.region,
      description: location.id === currentId && customCurrentName ? "角色当前生活的聚居地，交通路线按附近主城计算。" : location.description,
      danger: location.danger,
      travelMinutes: location.id === currentId ? 0 : current?.connections.find((connection) => connection.id === location.id)?.minutes ?? -1,
      discovered: game.world.discoveredLocations.includes(location.id),
      current: location.id === currentId,
      x: isAtSelectedHome ? (selectedHome?.mapX ?? point.x) : point.x,
      y: isAtSelectedHome ? (selectedHome?.mapY ?? point.y) : point.y,
      objective,
    };
  });
}

function knownPower(npc: WorldNpcState): string {
  if (npc.soulRank !== undefined) return `${npc.soulRank} 级`;
  return npc.powerTier;
}

function estimatedPower(npc: WorldNpcState): string {
  if (npc.powerTier === "尚未觉醒") return "尚未觉醒";
  if (npc.soulRank === undefined) return "实力不明";
  return `约${tierForRank(npc.soulRank)}`;
}

export function buildKnownFigures(game: StoredGame): KnownFigureView[] {
  return Object.values(game.world.npcs).filter((npc) => npc.knownToPlayer && npc.currentGoal !== "尚未出生").map((npc) => {
    const definition = characterById(npc.id);
    const faction = FACTIONS.find((item) => npc.factionIds.includes(item.id));
    const intel = [...game.world.intelligenceRecords].reverse().find((item) => item.subjectType === "人物" && item.subjectId === npc.id);
    const relation = game.view.relations.some((item) => item.id === npc.id);
    const metInPerson = relation || npc.memoryOfPlayer.length > 0 || Boolean(intel && /亲历|当面|交谈/.test(intel.source));
    const confidence = intel?.confidence ?? (metInPerson ? 90 : 30);
    const visiblePower = confidence >= 85 && metInPerson ? knownPower(npc) : confidence >= 55 ? estimatedPower(npc) : "实力不明";
    const locationName = locationById(npc.locationId)?.name ?? "不明";
    return {
      id: npc.id,
      name: npc.name,
      title: definition?.aliases[0],
      faction: faction?.name,
      knownPower: visiblePower,
      location: metInPerson && npc.locationId === game.view.locationId ? locationName : confidence >= 70 ? locationName : `${locationName}一带（未核实）`,
      status: npc.alive ? (metInPerson ? npc.currentGoal : intel?.status === "确定" ? "消息已核实" : "近况不明") : "已死亡",
      source: intel?.source ?? (metInPerson ? "亲历" : "旧闻"),
      confidence,
    };
  });
}

export function recordIntelligence(game: StoredGame, input: Omit<HiddenWorldState["intelligenceRecords"][number], "id" | "year" | "day">): void {
  const time = game.view.worldTime;
  const existing = game.world.intelligenceRecords.find((item) => item.subjectType === input.subjectType && item.subjectId === input.subjectId && item.detail === input.detail && item.source === input.source);
  if (existing) {
    existing.confidence = Math.max(existing.confidence, input.confidence);
    existing.year = time?.year ?? existing.year;
    existing.day = time?.day ?? existing.day;
    existing.status = input.status;
  } else {
    game.world.intelligenceRecords.push({ id: `intel-${game.actionIndex}-${game.world.intelligenceRecords.length}`, ...input, year: time?.year ?? 0, day: time?.day ?? 1 });
  }
  game.world.intelligenceRecords = game.world.intelligenceRecords.slice(-300);
  game.view.intelligence = buildIntelligenceView(game);
}

export function buildIntelligenceView(game: StoredGame): IntelligenceView[] {
  const now = ordinal(game.view.worldTime?.year ?? 0, game.view.worldTime?.day ?? 1);
  return game.world.intelligenceRecords.slice(-80).reverse().map((record) => {
    const age = now - ordinal(record.year, record.day);
    return {
      id: record.id,
      subjectType: record.subjectType,
      subjectId: record.subjectId,
      title: record.title,
      detail: record.detail,
      source: record.source,
      confidence: record.confidence,
      acquiredAt: `原作 ${record.year >= 0 ? "+" : ""}${record.year} 年 · 第 ${record.day} 日`,
      freshness: age <= 7 ? "新鲜" : age <= 90 ? "尚可" : "过期",
      status: record.status,
    };
  });
}

export function buildMapHierarchy(game: StoredGame): MapHierarchyView {
  const selected = game.hiddenCandidates.find((candidate) => candidate.public.id === game.view.selectedCandidateId)?.public;
  const atHome = game.view.locationId === selected?.locationId;
  const settlementName = atHome
    ? selected?.residence?.settlement ?? selected?.location ?? game.view.location ?? "当前位置"
    : game.view.location ?? selected?.residence?.settlement ?? "当前位置";
  const buildingName = atHome ? selected?.residence?.building ?? `${settlementName}住处` : `${settlementName}临时落脚处`;
  const currentLocation = game.view.locationId ?? selected?.locationId ?? "notting-city";
  const authorityFact = selected?.originFacts.find((fact) => fact.label === "归属")?.value;
  const authorityName = authorityFact && /宗|殿|府|院|会|队|城|村|镇|行|家族/.test(authorityFact) ? authorityFact : `${settlementName}户籍与治安处`;
  const confidenceFor = (id: string) => [...game.world.intelligenceRecords].reverse().find((item) => item.subjectType === "地点" && item.subjectId === id);
  const continentNodes = game.view.map.filter((item) => item.discovered || item.current || item.objective).map((item) => {
    const intel = confidenceFor(item.id);
    return { id: item.id, name: item.name, level: "大陆" as const, kind: "地点", description: item.description, x: item.x, y: item.y, current: item.current, objective: item.objective, confidence: item.current ? 100 : intel?.confidence ?? 60, source: item.current ? "亲历" : intel?.source ?? "地图与传闻" };
  });
  const localNodes = [
    { id: `${currentLocation}:gate`, name: "聚居地入口", kind: "出入口", description: "通向外部道路，旅行从这里计算。", x: 12, y: 52 },
    { id: `${currentLocation}:home`, name: buildingName, kind: "住处", description: selected?.residence?.security ?? "当前可以休息和存放普通物品的地方。", x: 32, y: 34 },
    { id: `${currentLocation}:authority`, name: authorityName, kind: "机构", description: "处理户籍、治安与本地事务。", x: 67, y: 30 },
    { id: `${currentLocation}:market`, name: `${settlementName}集市`, kind: "交易", description: "日常补给、零工与传闻集中的区域。", x: 62, y: 70 },
    { id: `${currentLocation}:awakening`, name: `${settlementName}觉醒点`, kind: "武魂", description: "当地儿童进行武魂觉醒或复测的地点。", x: 84, y: 49 },
  ].map((node) => ({ ...node, level: "聚居地" as const, parentId: currentLocation, current: node.id.endsWith(":home"), confidence: node.id.endsWith(":home") ? 100 : 82, source: node.id.endsWith(":home") ? "日常生活" : "本地常识" }));
  const room = selected?.residence?.room ?? "临时卧室";
  const buildingNodes = [
    { id: `${currentLocation}:building:entrance`, name: "入口", kind: "出入口", description: "连接住处与外部道路。", x: 50, y: 88 },
    { id: `${currentLocation}:building:main`, name: "堂屋", kind: "公共空间", description: "家人或同住者日常见面、吃饭和商议事情的地方。", x: 50, y: 55 },
    { id: `${currentLocation}:building:room`, name: room, kind: "主角房间", description: "主角当前睡眠、收纳私人物品的位置。", x: 24, y: 28 },
    { id: `${currentLocation}:building:store`, name: "储物间", kind: "储藏", description: "普通物资与家庭工具所在处，贵重物品未必放在这里。", x: 77, y: 28 },
    { id: `${currentLocation}:building:yard`, name: /宗|府|殿|堡/.test(buildingName) ? "练功小院" : "后院", kind: "训练", description: "可以进行不扰民的基础练习。", x: 78, y: 66 },
  ].map((node) => ({ ...node, level: "建筑" as const, parentId: `${currentLocation}:home`, current: node.name === room, confidence: 100, source: "日常生活" }));
  return { continentName: "斗罗大陆", settlementName, buildingName, nodes: [...continentNodes, ...localNodes, ...buildingNodes] };
}

export function buildActiveEvents(game: StoredGame): WorldEventView[] {
  const now = ordinal(game.view.worldTime?.year ?? 0, game.view.worldTime?.day ?? 1);
  return game.world.dynamicEvents.filter((event) => event.status === "可介入" && (event.locationId === game.view.locationId || event.participantIds.some((id) => game.world.npcs[id]?.knownToPlayer))).map((event) => ({
    id: event.id, title: event.title, kind: event.kind, detail: event.detail,
    location: locationById(event.locationId)?.name ?? "不明",
    status: event.status,
    remaining: `约 ${Math.max(1, event.expiresOrdinal - now)} 天`,
  }));
}

function seasonForDay(day: number): GameView["worldTime"] extends infer T ? T extends { season: infer S } ? S : never : never {
  if (day <= 90) return "春";
  if (day <= 180) return "夏";
  if (day <= 270) return "秋";
  return "冬";
}

function addNews(game: StoredGame, eventId: string, title: string, detail: string, at?: { year: number; day: number }): void {
  if (game.view.news.some((item) => item.id === eventId)) return;
  const time = game.view.worldTime;
  const news: WorldNewsView = {
    id: eventId,
    title,
    detail,
    date: at ? `原作基准 ${at.year >= 0 ? "+" : ""}${at.year} 年 · 第 ${at.day} 日` : time ? `原作基准 ${time.year >= 0 ? "+" : ""}${time.year} 年 · 第 ${time.day} 日` : "时间不明",
  };
  game.view.news.unshift(news);
  game.view.news = game.view.news.slice(0, 30);
}

function mediaProfile(era: 1 | 2 | 3 | 4, publicRegistry: boolean, valence: -1 | 1): { channel: string; outlet: string; stance: string } {
  if (era === 1) return publicRegistry && valence > 0
    ? { channel: "城市告示与商会公报", outlet: "商会公报编辑处", stance: "契约与商业信用" }
    : { channel: "城市告示与商会公报", outlet: "城市告示处", stance: "地方治安与可核验风险" };
  if (era === 2) return publicRegistry && valence > 0
    ? { channel: "报刊与魂导广播", outlet: "地方魂师报刊编辑部", stance: "机构履历与魂师公共事务" }
    : { channel: "报刊与魂导广播", outlet: "魂导广播新闻台", stance: "城市安全与即时见证" };
  if (era === 3) return publicRegistry && valence > 0
    ? { channel: "大陆魂导传媒", outlet: "联邦事务公报编辑部", stance: "公共机构与职业秩序" }
    : { channel: "大陆魂导传媒", outlet: "大陆魂导传媒公共频道", stance: "跨城公共安全" };
  return publicRegistry && valence > 0
    ? { channel: "联邦公共信息网", outlet: "联邦公共信息网", stance: "联邦登记与公共服务" }
    : { channel: "联邦公共信息网", outlet: "星域安全通报频道", stance: "星际交通与公共安全" };
}

function secondaryMediaProfile(era: 1 | 2 | 3 | 4): { outlet: string; stance: string } {
  if (era === 1) return { outlet: "行旅商讯抄报", stance: "商路影响与交易风险" };
  if (era === 2) return { outlet: "城市公共广播栏", stance: "听众安全与事件时效" };
  if (era === 3) return { outlet: "地方民生频道", stance: "居民影响与公共问责" };
  return { outlet: "星域民生观察频道", stance: "公共服务影响与跨星区问责" };
}

function responsibleEditor(outlet: string): { name: string; role: "责任编辑" | "值班核验编辑" } {
  const profiles: Record<string, { name: string; role: "责任编辑" | "值班核验编辑" }> = {
    城市告示处: { name: "沈砚", role: "值班核验编辑" },
    商会公报编辑处: { name: "姜禾", role: "责任编辑" },
    行旅商讯抄报: { name: "程路", role: "责任编辑" },
    地方魂师报刊编辑部: { name: "霍青", role: "责任编辑" },
    魂导广播新闻台: { name: "云翎", role: "值班核验编辑" },
    城市公共广播栏: { name: "陆声", role: "责任编辑" },
    联邦事务公报编辑部: { name: "顾衡", role: "责任编辑" },
    大陆魂导传媒公共频道: { name: "林简", role: "值班核验编辑" },
    地方民生频道: { name: "唐芷", role: "责任编辑" },
    联邦公共信息网: { name: "周序", role: "值班核验编辑" },
    星域安全通报频道: { name: "闻启", role: "值班核验编辑" },
    星域民生观察频道: { name: "夏遥", role: "责任编辑" },
  };
  return profiles[outlet] ?? { name: "当班编辑", role: "值班核验编辑" };
}

export function recordMediaOutletReputation(game: StoredGame, input: { name: string; stance: string; trustDelta: number; publication?: boolean; correction?: boolean; linkedReport?: boolean; evidence: string }): void {
  let outlet = game.view.mediaOutlets.find((item) => item.name === input.name);
  if (!outlet) {
    outlet = { name: input.name, stance: input.stance, trustScore: 60, publications: 0, corrections: 0, linkedReports: 0, status: "待观察", evidence: [] };
    game.view.mediaOutlets.push(outlet);
  }
  const editorProfile = responsibleEditor(input.name);
  outlet.responsibleEditor ??= { ...editorProfile, sourceTrust: 60, handledReports: 0, responsibility: "待复核", evidence: [], playerTrust: 0, interactions: 0 };
  outlet.responsibleEditor.playerTrust ??= 0;
  outlet.responsibleEditor.interactions ??= 0;
  outlet.stance = input.stance;
  outlet.trustScore = Math.max(0, Math.min(100, outlet.trustScore + input.trustDelta));
  if (input.publication) outlet.publications += 1;
  if (input.correction) outlet.corrections += 1;
  if (input.linkedReport) outlet.linkedReports += 1;
  if (input.publication) outlet.responsibleEditor.handledReports += 1;
  outlet.responsibleEditor.sourceTrust = Math.max(0, Math.min(100, outlet.responsibleEditor.sourceTrust + input.trustDelta));
  outlet.responsibleEditor.responsibility = input.correction ? "已签发更正" : input.trustDelta > 0 ? "在岗核验" : "待复核";
  outlet.responsibleEditor.evidence.push(input.evidence);
  outlet.responsibleEditor.evidence = outlet.responsibleEditor.evidence.slice(-12);
  outlet.status = outlet.trustScore >= 78 && outlet.publications >= 3 ? "高度可信" : outlet.trustScore >= 58 ? "信誉稳定" : outlet.trustScore < 45 ? "受到质疑" : "待观察";
  outlet.evidence.push(input.evidence);
  outlet.evidence = outlet.evidence.slice(-20);
}

export function recordMediaCompetition(game: StoredGame, input: { primary: string; secondary: string; primaryDelta: number; secondaryDelta: number; evidence: string; status: "首发竞争" | "核验拉锯" | "更正问责"; newTopic?: boolean; playerChoice?: string }): void {
  game.view.mediaCompetitions ??= [];
  const outlets = [input.primary, input.secondary].sort((left, right) => left.localeCompare(right, "zh-CN")) as [string, string];
  const id = `media-competition:${outlets.join(":")}`;
  let competition = game.view.mediaCompetitions.find((item) => item.id === id);
  if (!competition) {
    competition = { id, outlets, scores: { [outlets[0]]: 0, [outlets[1]]: 0 }, sharedTopics: 0, status: "并列观察", evidence: [] };
    game.view.mediaCompetitions.push(competition);
  }
  competition.scores[input.primary] = Math.max(-100, Math.min(100, (competition.scores[input.primary] ?? 0) + input.primaryDelta));
  competition.scores[input.secondary] = Math.max(-100, Math.min(100, (competition.scores[input.secondary] ?? 0) + input.secondaryDelta));
  if (input.newTopic) competition.sharedTopics += 1;
  competition.status = input.status;
  if (input.playerChoice) competition.playerChoice = input.playerChoice;
  const [left, right] = competition.outlets;
  const difference = (competition.scores[left] ?? 0) - (competition.scores[right] ?? 0);
  competition.leader = difference === 0 ? undefined : difference > 0 ? left : right;
  competition.evidence.push(input.evidence);
  competition.evidence = competition.evidence.slice(-20);
}

export function queueSocialRumor(game: StoredGame, input: string, intent: string, result: string): void {
  if (/无法完成|规则阻止/.test(intent)) return;
  const publicRegistry = /交付机构事务|交付悬赏|交付运输合同|机构晋升|军衔晋升/.test(intent);
  const positive = publicRegistry || (/介入世界事件|救助|加入势力/.test(intent) && /成功|完成|加入/.test(`${intent}${result}`));
  const negative = /违法行动|袭击重要人物|运输合同失败/.test(intent) || (/介入世界事件/.test(intent) && /失败/.test(result));
  if (!positive && !negative) return;
  if (!publicRegistry && /秘密|暗中|无人|私下|潜行/.test(input)) return;
  const locationId = game.view.locationId ?? "local";
  const witnesses = Object.values(game.world.npcs).filter((npc) => npc.alive && npc.locationId === locationId && npc.currentGoal !== "尚未出生").slice(0, 8);
  if (!publicRegistry && !witnesses.length) return;
  const alias = game.world.flags.activeAliasLocationId === locationId ? String(game.world.flags.activeAlias ?? "") : "";
  const publicName = alias || game.view.character?.name || "无名魂师";
  const valence: -1 | 1 = negative ? -1 : 1;
  const factionIds = [...new Set(witnesses.flatMap((npc) => npc.factionIds))];
  const createdOrdinal = ordinal(game.view.worldTime?.year ?? 0, game.view.worldTime?.day ?? 1);
  const era = game.view.era ?? 1;
  const media = mediaProfile(era, publicRegistry, valence);
  const mediaEligible = publicRegistry || (witnesses.length >= 3 && factionIds.length > 0);
  const corroborationCount = publicRegistry ? 2 : witnesses.length;
  const verificationStatus = publicRegistry ? "双记录核验" : witnesses.length >= 5 && factionIds.length >= 2 ? "跨关系网交叉核验" : mediaEligible ? "同源多证待复核" : "来源不足";
  const editorialDecision = publicRegistry
    ? "公开登记含承办与验收两类记录，符合机构履历选稿线"
    : mediaEligible
      ? `${witnesses.length}名现场见证者且存在可追踪组织关系，按公共风险线刊发`
      : `仅有${witnesses.length}名现场见证者，缺少公开登记或可追踪组织关系，暂不跨地区刊发`;
  const localDelay = 1 + (game.actionIndex % 3);
  const mediaDelay = ({ 1: 14, 2: 7, 3: 3, 4: 2 } as const)[era];
  const mediaSpreadsAtOrdinal = createdOrdinal + localDelay + mediaDelay;
  game.world.socialRumors.push({ id: `rumor-${game.actionIndex}-${game.world.socialRumors.length}`, publicName, locationId, summary: valence > 0 ? `${publicName}完成了有公开凭据的${intent}` : `${publicName}卷入了受到质疑的${intent}`, valence, witnessNpcIds: witnesses.map((npc) => npc.id), factionIds, createdOrdinal, spreadsAtOrdinal: createdOrdinal + localDelay, status: "待传播", confidence: publicRegistry ? 92 : Math.min(85, 35 + witnesses.length * 7), sourceKind: publicRegistry ? "公开登记" : "现场目击", mediaChannel: media.channel, mediaOutlet: media.outlet, editorialStance: media.stance, editorialDecision, corroborationCount, verificationStatus, mediaSpreadsAtOrdinal, secondaryMediaSpreadsAtOrdinal: mediaEligible && verificationStatus !== "同源多证待复核" ? mediaSpreadsAtOrdinal + ({ 1: 3, 2: 2, 3: 1, 4: 1 } as const)[era] : undefined, mediaStatus: mediaEligible ? "待刊发" : "不刊发", mediaVersions: [], correctionEvidence: [] });
  game.world.socialRumors = game.world.socialRumors.slice(-60);
}

function propagateSocialRumors(game: StoredGame, currentOrdinal: number): string[] {
  const messages: string[] = [];
  for (const rumor of game.world.socialRumors.filter((item) => item.status === "待传播" && item.spreadsAtOrdinal <= currentOrdinal)) {
    rumor.status = "已传播";
    const scope = locationById(rumor.locationId)?.name ?? game.view.location ?? "当前地区";
    let reputation = game.view.reputations.find((item) => item.scope === scope && item.publicName === rumor.publicName);
    if (!reputation) {
      reputation = { scope, publicName: rumor.publicName, reputation: "尚无定论", heat: 0, source: "现场见证与公开凭据" };
      game.view.reputations.push(reputation);
    }
    reputation.heat = Math.min(100, reputation.heat + 6 + rumor.witnessNpcIds.length * 2);
    reputation.reputation = rumor.valence > 0 ? (reputation.heat >= 30 ? "因可靠履历受到认可" : "出现正面口碑") : (reputation.heat >= 30 ? "负面名声受到关注" : "出现负面传闻");
    reputation.source = rumor.witnessNpcIds.length ? `${rumor.witnessNpcIds.length}名现场见证者及其关系网` : "公开登记与验收记录";
    for (const witnessId of rumor.witnessNpcIds) {
      const witness = game.world.npcs[witnessId];
      if (witness) witness.dispositionToPlayer = Math.max(-100, Math.min(100, witness.dispositionToPlayer + rumor.valence * 4));
    }
    const recipients = Object.values(game.world.npcs).filter((npc) => npc.alive && !rumor.witnessNpcIds.includes(npc.id) && npc.factionIds.some((id) => rumor.factionIds.includes(id))).slice(0, 12);
    for (const npc of recipients) {
      const text = `从同一势力的见证者处听闻：${rumor.summary}`;
      npc.memoryOfPlayer.push(text);
      npc.memoryOfPlayer = npc.memoryOfPlayer.slice(-12);
      npc.episodicMemory.push({ id: randomUUID(), text, year: game.view.worldTime?.year ?? 0, day: game.view.worldTime?.day ?? 1, actionIndex: game.actionIndex, significance: 1, source: "传闻传播", witnessed: false });
      npc.episodicMemory = npc.episodicMemory.slice(-24);
      npc.dispositionToPlayer = Math.max(-100, Math.min(100, npc.dispositionToPlayer + rumor.valence * 2));
    }
    addNews(game, rumor.id, `${scope}口碑变化`, `${rumor.summary}；消息经${rumor.witnessNpcIds.length ? "现场见证者" : "公开登记"}传播，未自动扩散到无关系地区。`);
    messages.push(`口碑 · ${rumor.publicName} · ${scope}`);
  }
  for (const rumor of game.world.socialRumors.filter((item) => item.status === "已传播" && item.mediaStatus === "待刊发" && (item.mediaSpreadsAtOrdinal ?? Number.POSITIVE_INFINITY) <= currentOrdinal)) {
    rumor.mediaStatus = "已刊发";
    const origin = locationById(rumor.locationId)?.name ?? "来源地不明";
    const factionNames = rumor.factionIds.map((id) => FACTIONS.find((faction) => faction.id === id)?.name).filter(Boolean);
    const coverage = factionNames.length ? `${factionNames.join("、")}关系网` : game.view.era === 1 ? `${origin}周边商路` : "公开信息覆盖区";
    recordMediaOutletReputation(game, { name: rumor.mediaOutlet ?? rumor.mediaChannel ?? "未名媒体", stance: rumor.editorialStance ?? "公共信息记录", trustDelta: rumor.verificationStatus === "双记录核验" || rumor.verificationStatus === "跨关系网交叉核验" ? 2 : 0, publication: true, evidence: `${rumor.id}：${rumor.verificationStatus ?? "待复核"}首发` });
    const outletTrust = game.view.mediaOutlets.find((item) => item.name === (rumor.mediaOutlet ?? rumor.mediaChannel));
    addNews(game, `${rumor.id}-media`, `${rumor.mediaOutlet ?? rumor.mediaChannel} · ${rumor.publicName}`, `${rumor.summary}。机构立场：${rumor.editorialStance ?? "公共信息记录"}；机构信誉：${outletTrust?.trustScore ?? 60}（${outletTrust?.status ?? "待观察"}）；${outletTrust?.responsibleEditor?.role ?? "责任编辑"}：${outletTrust?.responsibleEditor?.name ?? "当班编辑"}（来源信任${outletTrust?.responsibleEditor?.sourceTrust ?? 60}）；选稿依据：${rumor.editorialDecision ?? "依据现有来源刊发"}；来源：${rumor.sourceKind ?? "来源未标明"}；交叉核验：${rumor.verificationStatus ?? "状态未标明"}（${rumor.corroborationCount ?? 1}项）；可信度 ${rumor.confidence ?? 50}%；覆盖：${coverage}。刊发不等于事实已最终核验。`);
    const recipients = Object.values(game.world.npcs).filter((npc) => npc.alive && !rumor.witnessNpcIds.includes(npc.id) && (rumor.factionIds.length === 0 ? npc.knownToPlayer : npc.factionIds.some((id) => rumor.factionIds.includes(id)))).slice(0, 20);
    for (const npc of recipients) {
      const text = `从${rumor.mediaOutlet ?? rumor.mediaChannel}获知（${rumor.verificationStatus ?? "待复核"}、可信度${rumor.confidence ?? 50}%）：${rumor.summary}`;
      npc.memoryOfPlayer.push(text);
      npc.memoryOfPlayer = npc.memoryOfPlayer.slice(-12);
      npc.episodicMemory.push({ id: randomUUID(), text, year: game.view.worldTime?.year ?? 0, day: game.view.worldTime?.day ?? 1, actionIndex: game.actionIndex, significance: 1, source: "传闻传播", witnessed: false });
      npc.episodicMemory = npc.episodicMemory.slice(-24);
    }
    messages.push(`媒体 · ${rumor.mediaOutlet ?? rumor.mediaChannel} · ${rumor.publicName}`);
  }
  for (const rumor of game.world.socialRumors.filter((item) => item.mediaStatus === "已刊发" && item.secondaryMediaSpreadsAtOrdinal !== undefined && item.secondaryMediaSpreadsAtOrdinal <= currentOrdinal && !(item.mediaVersions?.length))) {
    const secondary = secondaryMediaProfile(game.view.era ?? 1);
    const framing = rumor.valence > 0
      ? "转载原始登记与核验等级，不扩写未公开细节；重点追问履历对普通成员和当地资源的实际影响"
      : "保留原报道的质疑措辞，不把转述改写成定论；重点区分亲历证词、组织转述与仍未知部分";
    const version = { id: `${rumor.id}-secondary`, outlet: secondary.outlet, stance: secondary.stance, framing, confidence: Math.max(10, (rumor.confidence ?? 50) - 8), verificationStatus: "关联转载核验" as const, publishedOrdinal: currentOrdinal };
    rumor.mediaVersions ??= [];
    rumor.mediaVersions.push(version);
    recordMediaOutletReputation(game, { name: version.outlet, stance: version.stance, trustDelta: 1, publication: true, linkedReport: true, evidence: `${rumor.id}：明确关联${rumor.mediaOutlet ?? rumor.mediaChannel}并保留来源边界` });
    recordMediaCompetition(game, { primary: rumor.mediaOutlet ?? rumor.mediaChannel ?? "未名媒体", secondary: version.outlet, primaryDelta: 2, secondaryDelta: 1, newTopic: true, status: "首发竞争", evidence: `${rumor.id}：前者完成首发，后者透明关联转载且未扩写未知事实` });
    const outletTrust = game.view.mediaOutlets.find((item) => item.name === version.outlet);
    addNews(game, version.id, `${version.outlet} · 关联报道`, `关联原报道：${rumor.mediaOutlet ?? rumor.mediaChannel}。${rumor.summary}。机构立场：${version.stance}；机构信誉：${outletTrust?.trustScore ?? 60}（${outletTrust?.status ?? "待观察"}）；${outletTrust?.responsibleEditor?.role ?? "责任编辑"}：${outletTrust?.responsibleEditor?.name ?? "当班编辑"}；编辑框架：${version.framing}；核验：${version.verificationStatus}；可信度 ${version.confidence}%。本版本没有新增未公开事实。`);
    messages.push(`媒体转载 · ${version.outlet} · ${rumor.publicName}`);
  }
  return messages;
}

function relationKind(bond: number): "亲近" | "合作" | "竞争" | "敌对" | "陌生" {
  if (bond >= 55) return "亲近";
  if (bond >= 18) return "合作";
  if (bond <= -55) return "敌对";
  if (bond <= -18) return "竞争";
  return "陌生";
}

function buildNpcRelationViews(game: StoredGame): NpcRelationEvidenceView[] {
  return game.world.npcRelations.flatMap((relation) => {
    const left = game.world.npcs[relation.leftId];
    const right = game.world.npcs[relation.rightId];
    const latest = relation.history.at(-1);
    if (!left?.knownToPlayer || !right?.knownToPlayer || !latest) return [];
    return [{
      id: `${relation.leftId}-${relation.rightId}`,
      leftName: left.name,
      rightName: right.name,
      kind: relation.kind,
      dimensions: relation.dimensions,
      reason: latest.reason,
      date: `原作 ${latest.year >= 0 ? "+" : ""}${latest.year} 年 · 第 ${latest.day} 日`,
    }];
  }).slice(-30).reverse();
}

function updateNpcRelation(game: StoredGame, leftId: string, rightId: string, delta: number, year: number, day: number, reason: string): void {
  if (leftId === rightId) return;
  const [left, right] = [leftId, rightId].sort();
  let relation = game.world.npcRelations.find((item) => item.leftId === left && item.rightId === right);
  if (!relation) {
    relation = { leftId: left, rightId: right, bond: 0, kind: "陌生", lastChangedYear: year, dimensions: { affinity: 0, trust: 0, respect: 0, sharedInterest: 0, vigilance: 0, hostility: 0 }, history: [] };
    game.world.npcRelations.push(relation);
  }
  const before = relation.kind;
  relation.bond = Math.max(-100, Math.min(100, relation.bond + delta));
  relation.kind = relationKind(relation.bond);
  relation.lastChangedYear = year;
  relation.dimensions.affinity = Math.max(-100, Math.min(100, relation.dimensions.affinity + delta));
  relation.dimensions.trust = Math.max(-100, Math.min(100, relation.dimensions.trust + Math.round(delta * .7)));
  relation.dimensions.sharedInterest = Math.max(-100, Math.min(100, relation.dimensions.sharedInterest + Math.round(delta * .9)));
  relation.dimensions.respect = Math.max(-100, Math.min(100, relation.dimensions.respect + Math.max(-2, Math.round(delta * .35))));
  relation.dimensions.vigilance = Math.max(0, Math.min(100, relation.dimensions.vigilance + (delta < 0 ? Math.abs(delta) : -1)));
  relation.dimensions.hostility = Math.max(0, Math.min(100, relation.dimensions.hostility + (delta < 0 ? Math.abs(delta) : -2)));
  relation.history.push({ year, day, delta, reason });
  relation.history = relation.history.slice(-20);
  if (before !== relation.kind && relation.kind !== "陌生") {
    const leftNpc = game.world.npcs[left];
    const rightNpc = game.world.npcs[right];
    if (leftNpc?.knownToPlayer && rightNpc?.knownToPlayer) addNews(game, `npc-relation-${left}-${right}-${year}-${day}-${relation.kind}`, `${leftNpc.name}与${rightNpc.name}`, `两人的关系最近变成了${relation.kind}：${reason}`);
  }
  game.view.npcRelations = buildNpcRelationViews(game);
}

function createDynamicEvent(game: StoredGame, cycle: number, random: () => number): string | undefined {
  const active = game.world.dynamicEvents.filter((item) => item.status === "可介入");
  const pressure = Number(game.world.flags.destinyPressure ?? 1);
  if (active.length >= 4 || random() > Math.max(0.34, 0.62 - pressure * 0.06)) return undefined;
  const template = pick(random, DYNAMIC_EVENT_TEMPLATES);
  if (game.world.dynamicEvents.some((event) => event.title === template.title && event.createdYear * DAYS_PER_YEAR + event.createdDay > cycle * 30 - DAYS_PER_YEAR)) return undefined;
  const npcs = Object.values(game.world.npcs).filter((npc) => npc.alive && ((characterById(npc.id)?.importance ?? 3) <= 3 || npcHasPlayerInfluence(game, npc.id)));
  const participant = npcs.length && random() < 0.45 ? pick(random, npcs) : undefined;
  const locationId = random() < 0.62 ? (game.view.locationId ?? "notting-city") : participant?.locationId ?? "notting-city";
  const createdOrdinal = cycle * 30;
  const createdYear = Math.floor((createdOrdinal - 1) / DAYS_PER_YEAR);
  const createdDay = createdOrdinal - createdYear * DAYS_PER_YEAR;
  const id = `dynamic-${cycle}-${Math.floor(random() * 1_000_000).toString(36)}`;
  game.world.dynamicEvents.push({
    id,
    title: template.title,
    kind: template.kind,
    locationId,
    participantIds: participant ? [participant.id] : [],
    detail: template.detail,
    stakes: Math.min(5, template.stakes + (pressure >= 4 && random() < 0.45 ? 1 : 0)),
    status: "可介入",
    createdYear,
    createdDay,
    expiresOrdinal: createdOrdinal + integer(random, 24, 80),
  });
  if (locationId === game.view.locationId || participant?.knownToPlayer) {
    addNews(game, id, template.title, template.detail, { year: createdYear, day: createdDay });
    if (!game.view.tasks.some((task) => task.id === id)) game.view.tasks.push({ id, title: template.title, kind: "线索", detail: template.detail, status: "进行中", destinationId: locationId });
    return template.title;
  }
  return undefined;
}

function simulateNpcAutonomy(game: StoredGame, previousOrdinal: number, currentOrdinal: number): string[] {
  const messages: string[] = [];
  const startCycle = Math.floor(Math.max(previousOrdinal, game.world.lastAutonomyOrdinal) / 30) + 1;
  const endCycle = Math.floor(currentOrdinal / 30);
  const firstCycle = Math.max(startCycle, endCycle - 60);
  for (let cycle = firstCycle; cycle <= endCycle; cycle += 1) {
    for (const event of game.world.dynamicEvents) {
      if (event.status === "可介入" && event.expiresOrdinal < cycle * 30) {
        event.status = "错过";
        event.outcome = "没有人及时处理，事情按当地局势自行收场。";
        const task = game.view.tasks.find((item) => item.id === event.id); if (task) task.status = "失败";
      }
    }
    const random = createRandom(`${game.view.seed}:autonomy:${cycle}`);
    const living = Object.values(game.world.npcs).filter((npc) => npc.alive);
    if (living.length < 2) continue;
    const actor = pick(random, living);
    const definition = characterById(actor.id);
    const current = locationById(actor.locationId);
    const influenced = npcHasPlayerInfluence(game, actor.id);
    if (current?.connections.length && ((definition?.importance ?? 3) <= 3 || influenced) && random() < 0.32) {
      const destination = pick(random, current.connections).id;
      actor.autonomyLog.push({ year: game.view.worldTime?.year ?? 0, day: game.view.worldTime?.day ?? 1, action: `前往${locationById(destination)?.name ?? destination}`, reason: influenced ? "玩家造成的局势变化影响了原定安排" : `为了推进“${actor.currentGoal}”` });
      actor.locationId = destination;
    }
    if (definition?.goals.length && random() < 0.4) {
      const nextGoal = pick(random, definition.goals);
      if (nextGoal !== actor.currentGoal) actor.autonomyLog.push({ year: game.view.worldTime?.year ?? 0, day: game.view.worldTime?.day ?? 1, action: `转向目标：${nextGoal}`, reason: influenced ? "玩家行动改变了可用条件" : "遵循其原有身份与长期动机" });
      actor.currentGoal = nextGoal;
    }
    actor.autonomyLog = actor.autonomyLog.slice(-30);
    const playerRelation = game.view.relations.find((item) => item.id === actor.id);
    if (actor.knownToPlayer && playerRelation && random() < 0.11 && !game.world.dynamicEvents.some((event) => event.status === "可介入" && event.participantIds.includes(actor.id))) {
      const attitude = actor.dispositionToPlayer + (playerRelation.dimensions?.trust ?? playerRelation.strength ?? 0);
      const title = attitude >= 35 ? `${actor.name}主动送来的请求` : attitude <= -10 ? `${actor.name}发出的警告` : `${actor.name}提出的试探`;
      const detail = attitude >= 35
        ? `${actor.name}为了“${actor.currentGoal}”主动联系主角，提出一项需要明确答复的协助。`
        : attitude <= -10
          ? `${actor.name}掌握了与主角有关的部分消息，要求主角停止继续触及其当前目标。`
          : `${actor.name}没有直接说明目的，只提出一次交易或见面，意在判断主角是否值得合作。`;
      const createdOrdinal = cycle * 30;
      const createdYear = Math.floor((createdOrdinal - 1) / DAYS_PER_YEAR);
      const createdDay = createdOrdinal - createdYear * DAYS_PER_YEAR;
      const id = `initiative-${actor.id}-${cycle}`;
      game.world.dynamicEvents.push({ id, title, kind: "人物", locationId: actor.locationId, participantIds: [actor.id], detail, stakes: Math.max(2, Math.min(5, definition?.importance ?? 2)), status: "可介入", createdYear, createdDay, expiresOrdinal: createdOrdinal + 45 });
      game.view.tasks.push({ id, title, kind: "线索", detail: `${detail}玩家可以接受、追问或拒绝。`, status: "进行中", destinationId: actor.locationId });
      addNews(game, id, title, detail, { year: createdYear, day: createdDay });
    }
    const candidates = living.filter((npc) => npc.id !== actor.id && (npc.locationId === actor.locationId || actor.factionIds.some((id) => npc.factionIds.includes(id)) || npcHasPlayerInfluence(game, npc.id)));
    if (!candidates.length) continue;
    const other = pick(random, candidates);
    const sharedFaction = actor.factionIds.some((id) => other.factionIds.includes(id));
    const sameLocation = actor.locationId === other.locationId;
    const delta = sharedFaction ? integer(random, 2, 8) : sameLocation ? integer(random, -5, 5) : integer(random, -3, 3);
    const factionName = FACTIONS.find((faction) => actor.factionIds.includes(faction.id) && other.factionIds.includes(faction.id))?.name;
    const reason = sharedFaction
      ? `两人在${factionName ?? "同一势力"}的事务中${delta >= 0 ? "目标一致并有过配合" : "发生了利益分歧"}`
      : sameLocation
        ? `两人在${locationById(actor.locationId)?.name ?? "同一地点"}推进各自目标时${delta >= 0 ? "互相提供了帮助" : "产生了冲突"}`
        : "玩家造成的因果链让两人的利益发生交集";
    updateNpcRelation(game, actor.id, other.id, delta, game.view.worldTime?.year ?? 0, game.view.worldTime?.day ?? 1, reason);
    const createdEvent = createDynamicEvent(game, cycle, random);
    if (createdEvent) messages.push(`新事件 · ${createdEvent}`);
  }
  for (const event of game.world.dynamicEvents) {
    if (event.status !== "可介入" || event.expiresOrdinal >= currentOrdinal) continue;
    event.status = "错过";
    event.outcome = "没有人及时处理，事情按当地局势自行收场。";
    const task = game.view.tasks.find((item) => item.id === event.id);
    if (task) task.status = "失败";
    if (event.locationId === game.view.locationId) messages.push(`错过事件 · ${event.title}`);
  }
  if (game.world.dynamicEvents.length > 120) game.world.dynamicEvents = game.world.dynamicEvents.filter((event) => event.status === "可介入").concat(game.world.dynamicEvents.filter((event) => event.status !== "可介入").slice(-80));
  if (game.view.tasks.length > 80) {
    const protectedTasks = game.view.tasks.filter((task) => task.id === "life-goal" || task.status === "进行中");
    game.view.tasks = [...protectedTasks, ...game.view.tasks.filter((task) => !protectedTasks.includes(task)).slice(-40)].slice(-80);
  }
  game.world.lastAutonomyOrdinal = currentOrdinal;
  const currentEventMessages = game.world.dynamicEvents.filter((event) => event.status === "可介入" && (event.locationId === game.view.locationId || event.participantIds.some((id) => game.world.npcs[id]?.knownToPlayer))).map((event) => `新事件 · ${event.title}`);
  return [...messages.filter((message) => !message.startsWith("新事件 ·")), ...currentEventMessages];
}

function simulateCanonEvents(game: StoredGame, previousOrdinal: number, currentOrdinal: number): string[] {
  const messages: string[] = [];
  for (const event of CANON_EVENTS) {
    const eventOrdinal = ordinal(event.year, event.day ?? 1);
    if (eventOrdinal < previousOrdinal || eventOrdinal > currentOrdinal || game.world.firedCanonEvents.includes(event.id) || game.world.suppressedCanonEvents.includes(event.id)) continue;
    const participantFactions = new Set(event.participantIds.flatMap((id) => characterById(id)?.factionIds ?? []));
    const linkedCauses = game.world.canonCausalFootprints.filter((cause) => cause.atYear <= event.year && (
      cause.affectedNpcIds.some((id) => event.participantIds.includes(id))
      || cause.affectedFactionIds.some((id) => participantFactions.has(id))
      || (Boolean(event.locationId) && cause.locationId === event.locationId && cause.strength >= 4)
    ));
    const causalStrength = linkedCauses.reduce((sum, cause) => sum + cause.strength, 0);
    const difficultyResistance = { 爽: .8, 简单: .9, 标准: 1, 困难: 1.15, 地狱: 1.3 }[game.view.difficulty];
    const resistance = event.inertia * 8 * difficultyResistance;
    if (causalStrength >= resistance) {
      game.world.suppressedCanonEvents.push(event.id);
      const latestCause = linkedCauses.at(-1);
      addNews(game, `${event.id}-altered`, `${event.title}出现偏差`, `变化能够追溯到玩家此前对${latestCause?.description ?? "相关人物与势力"}的影响，参与者和结果已不再完全符合原有轨迹。`);
      game.world.metrics.historicalImpact += event.inertia * 2;
      messages.push(`历史偏移 · ${event.title}`);
      continue;
    }
    game.world.firedCanonEvents.push(event.id);
    applyFactionJoinsForEvent(game, event.id);
    for (const participantId of event.participantIds) {
      const npc = game.world.npcs[participantId];
      if (npc && event.locationId) npc.locationId = event.locationId;
    }
    const atScene = Boolean(event.locationId && event.locationId === game.view.locationId);
    const knownParticipant = event.participantIds.some((id) => game.world.npcs[id]?.knownToPlayer);
    const directlyInfluenced = linkedCauses.some((cause) => cause.affectedNpcIds.some((id) => event.participantIds.includes(id)) || cause.locationId === event.locationId);
    const visibility = event.visibility ?? "地方";
    const observable = visibility === "公开" || (visibility === "地方" && (atScene || knownParticipant)) || (visibility === "秘密" && atScene && (knownParticipant || directlyInfluenced));
    if (observable) {
      addNews(game, event.id, event.title, event.publicSummary);
      messages.push(`${visibility === "公开" ? "消息" : visibility === "秘密" ? "亲历" : "传闻"} · ${event.title}`);
    }
  }
  return messages;
}

function simulateNpcYears(game: StoredGame, year: number): void {
  for (const npc of Object.values(game.world.npcs)) {
    const definition = characterById(npc.id);
    if (!definition) continue;
    if (!characterExistsInEra(npc.id, year)) {
      npc.alive = false;
      npc.soulRank = undefined;
      npc.powerTier = "不在当世活动";
      npc.currentGoal = "不在当前时代活动";
      npc.knownToPlayer = false;
      npc.lastSimulatedYear = year;
      continue;
    }
    if (definition.birthYear !== undefined && year < definition.birthYear) {
      npc.alive = false;
      npc.age = 0;
      npc.currentGoal = "尚未出生";
      npc.knownToPlayer = false;
      npc.lastSimulatedYear = year;
      continue;
    }
    if (definition.deathYear !== undefined && year >= definition.deathYear) {
      npc.alive = false;
      npc.currentGoal = "已死亡";
      npc.lastSimulatedYear = year;
      continue;
    }
    if (definition.birthYear !== undefined && npc.currentGoal === "尚未出生" && year >= definition.birthYear) {
      npc.alive = true;
      npc.age = year - definition.birthYear;
      npc.locationId = canonicalLocationAtYear(npc.id, year);
      npc.currentGoal = definition.goals[0] ?? "继续当前生活";
    }
    if (!npc.alive) { npc.lastSimulatedYear = year; continue; }
    if (year > npc.lastSimulatedYear && npc.memoryOfPlayer.length > 6) {
      const memoryRandom = createRandom(`${game.view.seed}:npc-memory:${npc.id}:${year}`);
      npc.memoryOfPlayer = npc.memoryOfPlayer.filter((memory, index) => /救命|死亡|背叛|承诺|师徒|亲属|袭击|秘密|复生/.test(memory) || index >= npc.memoryOfPlayer.length - 4 || memoryRandom() > .38).slice(-12);
    }
    const power = powerAtYear(npc.id, year);
    npc.soulRank = power.soulRank;
    npc.powerTier = power.tier;
    npc.age = definition.birthYear === undefined ? npc.age : Math.max(0, year - definition.birthYear);
    npc.lastSimulatedYear = year;
  }
}

export function advanceWorldTime(game: StoredGame, minutes: number): string[] {
  const time = game.view.worldTime;
  if (!time) return [];
  const previousOrdinal = ordinal(time.year, time.day);
  const [hours, minute] = time.time.split(":").map(Number);
  const total = hours * 60 + minute + minutes;
  const elapsedDays = Math.floor(total / 1440);
  const minuteOfDay = total % 1440;
  time.day += elapsedDays;
  while (time.day > DAYS_PER_YEAR) {
    time.day -= DAYS_PER_YEAR;
    time.year += 1;
    if (game.view.character) game.view.character.age += 1;
  }
  time.time = `${Math.floor(minuteOfDay / 60).toString().padStart(2, "0")}:${(minuteOfDay % 60).toString().padStart(2, "0")}`;
  time.season = seasonForDay(time.day);
  time.era = eraAtYear(time.year);
  simulateNpcYears(game, time.year);
  const currentOrdinal = ordinal(time.year, time.day);
  const messages = [...simulateNpcAutonomy(game, previousOrdinal, currentOrdinal), ...simulateCanonEvents(game, previousOrdinal, currentOrdinal), ...propagateSocialRumors(game, currentOrdinal)];
  game.view.map = buildMapView(game);
  game.view.knownFigures = buildKnownFigures(game);
  game.view.npcRelations = buildNpcRelationViews(game);
  game.view.intelligence = buildIntelligenceView(game);
  game.view.mapHierarchy = buildMapHierarchy(game);
  game.view.activeEvents = buildActiveEvents(game);
  return messages;
}

export function canDiscoverNpc(game: StoredGame, npcId: string): boolean {
  const npc = game.world.npcs[npcId];
  const definition = characterById(npcId);
  if (!npc || !definition || !npc.alive || npc.currentGoal === "尚未出生") return false;
  if (npc.knownToPlayer || !definition.hidden) return true;
  const hasReliableIntel = game.world.intelligenceRecords.some((record) => record.subjectType === "人物" && record.subjectId === npcId && record.confidence >= 60);
  const hasDirectCausalContact = game.world.canonCausalFootprints.some((cause) => cause.affectedNpcIds.includes(npcId));
  const isVisibleEventParticipant = game.world.dynamicEvents.some((event) => event.status === "可介入" && event.participantIds.includes(npcId) && event.locationId === game.view.locationId);
  return hasReliableIntel || hasDirectCausalContact || isVisibleEventParticipant;
}

export function revealNpc(game: StoredGame, npcId: string): boolean {
  const npc = game.world.npcs[npcId];
  if (!npc || !canDiscoverNpc(game, npcId)) return false;
  npc.knownToPlayer = true;
  game.view.knownFigures = buildKnownFigures(game);
  return true;
}

export function ensureGameState(game: StoredGame): StoredGame {
  const legacy = game as StoredGame & { schemaVersion?: number; world?: HiddenWorldState };
  const migrateNarrative = (legacy.schemaVersion ?? 1) < 4;
  const candidate = game.view.candidates[0];
  const startYear = game.view.worldTime?.year ?? candidate?.birthYearOffset ?? 0;
  game.view.era ??= startYear >= 25000 ? 4 : startYear >= 15000 ? 3 : startYear >= 5000 ? 2 : 1;
  const locationId = game.view.locationId ?? inferLocationId(game.view.location ?? candidate?.location ?? "诺丁城");
  for (const publicCandidate of game.view.candidates ?? []) {
    const oldDwelling = publicCandidate.dwelling ?? `${publicCandidate.location ?? "原居地"} · 户籍所记住处`;
    const oldRelations = publicCandidate.startingRelations ?? [];
    publicCandidate.household ??= { structure: "旧档案家庭", summary: publicCandidate.originFacts?.find((fact) => fact.label === "家庭")?.value ?? "家庭信息需要在后续相处中补全。", members: oldRelations.filter((item) => item.category === "亲属").map((item) => ({ name: item.name, role: item.relation, note: item.impression })) };
    publicCandidate.residence ??= { region: publicCandidate.location ?? "原居地", settlement: publicCandidate.location ?? "原居地", district: `${publicCandidate.location ?? "原居地"}户籍辖区`, building: oldDwelling.split(" · ").at(-1) ?? "旧居", room: "日常卧房", security: "依靠当地治安与原有监护关系", nearby: [publicCandidate.location ?? "原居地"] };
  }
  for (const hidden of game.hiddenCandidates ?? []) {
    const matched = game.view.candidates.find((item) => item.id === hidden.public.id);
    if (matched) hidden.public = matched;
  }
  legacy.schemaVersion = 21;
  legacy.revision ??= 0;
  legacy.world ??= createHiddenWorld(startYear, locationId);
  legacy.world.npcRelations ??= [];
  legacy.world.canonCausalFootprints ??= [];
  legacy.world.firedCanonEvents ??= [];
  legacy.world.suppressedCanonEvents ??= [];
  legacy.world.dynamicEvents ??= [];
  legacy.world.socialRumors ??= [];
  for (const rumor of legacy.world.socialRumors) {
    rumor.confidence ??= rumor.witnessNpcIds.length ? Math.min(85, 35 + rumor.witnessNpcIds.length * 7) : 92;
    rumor.sourceKind ??= rumor.witnessNpcIds.length ? "现场目击" : "公开登记";
    rumor.mediaStatus ??= "不刊发";
    const profile = mediaProfile(game.view.era ?? 1, rumor.sourceKind === "公开登记", rumor.valence);
    rumor.mediaChannel ??= profile.channel;
    rumor.mediaOutlet ??= profile.outlet;
    rumor.editorialStance ??= profile.stance;
    rumor.corroborationCount ??= rumor.sourceKind === "公开登记" ? 2 : rumor.witnessNpcIds.length;
    rumor.verificationStatus ??= rumor.sourceKind === "公开登记" ? "双记录核验" : rumor.witnessNpcIds.length >= 5 && rumor.factionIds.length >= 2 ? "跨关系网交叉核验" : rumor.mediaStatus === "不刊发" ? "来源不足" : "同源多证待复核";
    rumor.editorialDecision ??= rumor.mediaStatus === "不刊发" ? "旧记录缺少跨地区刊发所需来源" : "旧记录按当时已有来源刊发";
    rumor.mediaVersions ??= [];
    rumor.correctionEvidence ??= [];
  }
  legacy.world.lastAutonomyOrdinal ??= ordinal(startYear, game.view.worldTime?.day ?? 1);
  legacy.world.resurrectionCount ??= 0;
  legacy.world.resurrectionRecords ??= [];
  legacy.world.intelligenceRecords ??= [];
  legacy.world.actionLedger ??= [];
  game.view.npcRelations ??= [];
  game.view.family ??= { children: [], householdNotes: [] };
  game.view.family.children ??= [];
  game.view.family.householdNotes ??= [];
  for (const task of game.view.tasks ?? []) {
    task.createdActionIndex ??= 0;
    task.progressEvidence ??= [];
  }
  game.view.reputations ??= [];
  game.view.mediaOutlets ??= [];
  const missingMediaCompetitions = !game.view.mediaCompetitions;
  game.view.mediaCompetitions ??= [];
  if (missingMediaCompetitions) {
    for (const rumor of legacy.world.socialRumors) {
      for (const version of rumor.mediaVersions ?? []) {
        const corrected = version.verificationStatus === "更正证据已核验";
        recordMediaCompetition(game, { primary: rumor.mediaOutlet ?? rumor.mediaChannel ?? "未名媒体", secondary: version.outlet, primaryDelta: corrected ? -2 : 2, secondaryDelta: corrected ? 2 : 1, newTopic: true, status: corrected ? "更正问责" : "首发竞争", evidence: `${rumor.id}：由旧存档中的关联报道${corrected ? "及更正责任" : ""}重建竞争记录` });
      }
    }
  }
  for (const outlet of game.view.mediaOutlets) {
    const profile = responsibleEditor(outlet.name);
    outlet.responsibleEditor ??= { ...profile, sourceTrust: outlet.trustScore ?? 60, handledReports: outlet.publications ?? 0, responsibility: outlet.corrections > 0 ? "已签发更正" : outlet.publications > 0 ? "在岗核验" : "待复核", evidence: [...(outlet.evidence ?? [])].slice(-12), playerTrust: 0, interactions: 0 };
    outlet.responsibleEditor.playerTrust ??= 0;
    outlet.responsibleEditor.interactions ??= 0;
    outlet.responsibleEditor.evidence ??= [];
  }
  for (const affiliation of game.view.affiliations ?? []) {
    affiliation.contribution ??= 0;
    affiliation.completedAssignments ??= 0;
    affiliation.rankEvidence ??= [];
    if (affiliation.militaryRank) {
      affiliation.militaryMerit ??= 0;
      affiliation.flightHours ??= 0;
    }
  }
  game.view.inventoryLoad ??= { used: game.view.inventory?.length ?? 0, capacity: 18, state: "轻便", storage: [] };
  game.view.professions ??= [];
  game.view.managedFactions ??= [];
  game.view.comboTrainings ??= [];
  if (game.view.starship?.fleetOnboarding) {
    game.view.starship.fleetOnboarding.trainingDays ??= 0;
    game.view.starship.fleetOnboarding.trainingEvidence ??= [];
    game.view.starship.fleetOnboarding.assignmentEvidence ??= [];
  }
  game.view.economy ??= { cash: game.view.character?.coins ?? 0, bankBalance: 0, debt: 0, salary: 0, bounty: 0, blackMarketAccess: false, transactions: [], marketReports: [] };
  game.view.economy.transactions ??= [];
  game.view.economy.marketReports ??= [];
  if (game.view.starship) {
    game.view.starship.crewDrills ??= 0;
    game.view.starship.crewCoordination ??= 0;
    game.view.starship.crewEvidence ??= [];
  }
  if (game.view.starship?.shipClass) {
    const legacyShipClass = game.view.starship.shipClass as string;
    if (legacyShipClass === "穿梭艇") game.view.starship.shipClass = "民用穿梭艇";
    if (legacyShipClass === "小型探索舰") game.view.starship.shipClass = "陨星级侦察舰";
    if (legacyShipClass === "护卫舰") game.view.starship.shipClass = "龙王级护卫舰";
  }
  if (game.view.worldInheritance) {
    game.view.worldInheritance.lineage ??= [{ generation: game.view.worldInheritance.generation, era: game.view.worldInheritance.sourceEra, name: game.view.worldInheritance.ancestorName, ending: game.view.worldInheritance.ending, highestSoulRank: game.view.worldInheritance.highestSoulRank, historicalImpact: game.view.worldInheritance.historicalImpact, verification: "传闻", evidence: [`${game.view.worldInheritance.legacyArtifact}保存了旧世摘要`] }];
    game.view.worldInheritance.branches ??= [];
    game.view.worldInheritance.chronology ??= [];
    game.view.worldInheritance.institutions ??= [];
    for (const institution of game.view.worldInheritance.institutions) {
      institution.currentEvidence ??= [];
      institution.claimStatus ??= "未主张";
      institution.claimEvidence ??= [];
    }
    game.legacy.worldInheritance = game.view.worldInheritance;
  }
  game.view.intelligence ??= buildIntelligenceView(game);
  game.view.mapHierarchy ??= { continentName: "斗罗大陆", settlementName: game.view.location ?? "当前位置", buildingName: "当前住处", nodes: [] };
  for (const relation of legacy.world.npcRelations) {
    relation.dimensions ??= { affinity: relation.bond, trust: Math.round(relation.bond * .7), respect: 0, sharedInterest: Math.round(relation.bond * .8), vigilance: relation.bond < 0 ? Math.abs(relation.bond) : 0, hostility: relation.bond < 0 ? Math.abs(relation.bond) : 0 };
    relation.history ??= [{ year: relation.lastChangedYear, day: 1, delta: relation.bond, reason: "旧存档关系记录，具体经过未能完整保留" }];
  }
  for (const npc of Object.values(legacy.world.npcs)) {
    npc.memoryOfPlayer ??= [];
    npc.episodicMemory ??= npc.memoryOfPlayer.map((text, index) => ({
      id: `legacy-memory-${npc.id}-${index}`,
      text,
      year: npc.lastSimulatedYear ?? startYear,
      day: 1,
      actionIndex: Math.max(0, game.actionIndex - npc.memoryOfPlayer.length + index),
      significance: memorySignificance(text),
      source: "旧存档" as const,
      witnessed: true as const,
    }));
    npc.autonomyLog ??= [];
  }
  reconcileTimedFactionMemberships(game, startYear, game.view.worldTime?.day ?? 1);
  simulateNpcYears(game, startYear);
  const evidencedNpcIds = new Set([
    ...legacy.world.intelligenceRecords.filter((record) => {
      if (record.subjectType !== "人物") return false;
      return !characterById(record.subjectId)?.hidden || record.confidence >= 60;
    }).map((record) => record.subjectId),
    ...game.view.relations.map((relation) => relation.id).filter((id): id is string => Boolean(id)),
    ...Object.values(legacy.world.npcs).filter((npc) => npc.memoryOfPlayer.length > 0).map((npc) => npc.id),
  ]);
  for (const npc of Object.values(legacy.world.npcs)) {
    if (!evidencedNpcIds.has(npc.id)) npc.knownToPlayer = false;
  }
  game.storyMemory ??= {
    summary: game.view.narrative.slice(-6).map((entry) => entry.text).join(" ").slice(0, 1000),
    openThreads: game.view.tasks.filter((task) => task.status !== "完成").map((task) => task.title).slice(0, 8),
    keyChoices: [], npcNotes: {}, chapterNumber: 1, chapterTitle: "未完的故事", lastUpdatedAction: game.actionIndex,
  };
  game.legacy ??= { upgrades: {} };
  legacy.personalityProfile.evidence ??= [];
  const allCandidates = [...game.hiddenCandidates.map((item) => item.public), ...game.view.candidates];
  for (const item of allCandidates) {
    item.route ??= "本地成长";
    if ((item.rarity as string) === "寻常") item.rarity = "平凡";
    if ((item.rarity as string) === "少见") item.rarity = "优秀";
    item.rarity ??= /身世不明|亲传|嫡系|少宗主|封号/.test(item.originName) ? "稀有" : "平凡";
    item.selfKnowledge ??= /身世不明|无籍收养/.test(item.originName) ? "本地人 · 身世未知" : "本地人 · 身世明确";
    item.knownBackground ??= /身世不明|无籍收养/.test(item.originName) ? "只知道自己由养父母抚养，真正来历仍未查明。" : "知道自己的家庭、住处和日常关系。";
    item.fixedTraits ??= [];
    item.originAdvantage ??= "行动自由度较高";
    item.originBurden ??= "资源需要自行积累";
    item.locationId ??= inferLocationId(item.location);
    const point = worldMapPoint(item.locationId);
    item.dwelling ??= `${item.location} · 户籍所记住处`;
    item.mapX ??= point.x;
    item.mapY ??= point.y;
    item.birthProfileId ??= `legacy-${item.id}`;
    item.originFacts ??= [
      { label: "家庭", value: `${item.originName}的一户具体人家，旧存档尚未记录姓名` },
      { label: "归属", value: item.location },
      { label: "生计", value: item.originSummary },
    ];
    item.startingRelations ??= [
      { name: `${item.name}的父亲`, relation: "父亲", impression: "期待中带着担忧", strength: 75, category: "亲属" },
      { name: `${item.name}的母亲`, relation: "母亲", impression: "一直留意觉醒后的去处", strength: 80, category: "亲属" },
      { name: "当值武魂殿执事", relation: "觉醒执事", impression: "公事公办", faction: "武魂殿", strength: 5, category: "势力" },
    ];
  }
  for (const hidden of game.hiddenCandidates) {
    hidden.originId ??= "legacy-origin";
    hidden.roleTags ??= ["本地人"];
    hidden.martialSouls ??= [hidden.martialSoul];
    for (const soul of hidden.martialSouls) {
      soul.name = normalizeMartialSoulName(soul.name);
      soul.grade ??= martialSoulGrade(soul.name, soul.metaRarity, soul.soulPowerRange[1]);
      soul.sourceEra ??= soul.metaRarity ? "局外" : "原创";
    }
    hidden.martialSoul = hidden.martialSouls[0];
    hidden.originStart ??= { coins: 12, items: [], reputation: "默默无闻", advantage: hidden.public.originAdvantage, burden: hidden.public.originBurden, pressure: 1 };
  }
  game.view.lifeGoal ??= "成为自己认可的强者";
  game.view.birthProfileCount ??= 1044;
  game.view.candidateRerollsUsed ??= game.view.rerollIndex ?? 0;
  game.view.candidatePaidRerolls ??= 0;
  if (game.view.shaping) {
    game.view.shaping.goalRerollsUsed ??= game.view.shaping.goalRerollIndex ?? 0;
    game.view.shaping.goalLocks ??= [false, false, false];
    game.view.shaping.lifeGoalDifficulties ??= game.view.shaping.lifeGoalOptions.map(() => "困难");
    game.view.shaping.fixedTraitEffects ??= game.view.shaping.fixedTraits.map((trait) => ({ trait, effect: fixedTraitEffect(trait) }));
  }
  game.view.locationId ??= locationId;
  game.view.map ??= [];
  game.view.mapPins ??= [];
  game.view.news ??= [];
  game.view.knownFigures ??= [];
  game.view.activeEvents ??= [];
  game.view.canonInfluences ??= legacy.world.canonCausalFootprints.slice().reverse().slice(0, 24).map((cause) => ({
    id: cause.id,
    action: cause.description,
    affects: [...cause.affectedNpcIds.map((id) => characterById(id)?.name ?? id), ...cause.affectedFactionIds.map((id) => FACTIONS.find((item) => item.id === id)?.name ?? id)].join("、") || "当前地点",
    strength: cause.strength >= 30 ? "足以撼动关键节点" : cause.strength >= 12 ? "可能形成长期偏差" : "轻微影响",
    date: `原作 ${cause.atYear >= 0 ? "+" : ""}${cause.atYear} 年 · 第 ${cause.atDay} 日`,
  }));
  game.view.storyArchive ??= { summary: game.storyMemory.summary, openThreads: game.storyMemory.openThreads, keyChoices: game.storyMemory.keyChoices, recentConsequences: [], continuity: [] };
  game.view.affiliations ??= [];
  game.view.chapter ??= { number: game.storyMemory.chapterNumber, title: game.storyMemory.chapterTitle, summary: game.storyMemory.summary.slice(0, 160) };
  game.view.runProgress ??= {
    lifeGoal: game.view.lifeGoal,
    highestSoulRank: game.view.character?.soulRank ?? 0,
    discoveries: 0,
    relationshipsBuilt: game.view.relations.length,
    historicalImpact: 0,
    completedHunts: 0,
  };
  if (game.view.runProgress.settlement && game.view.runProgress.settlement.qualified === undefined) game.view.runProgress.settlement.qualified = true;
  if (game.view.worldTime) {
    game.view.worldTime.year ??= startYear;
    game.view.worldTime.season ??= "春";
    game.view.worldTime.era = eraAtYear(game.view.worldTime.year);
  }
  if (game.view.character) {
    game.storyMemory.openThreads = game.storyMemory.openThreads.filter((thread) => thread !== "武魂觉醒结果");
    if (/即将参加武魂觉醒|尚未真正开始/.test(game.storyMemory.summary)) {
      game.storyMemory.summary = `${game.view.character.name}已经完成武魂觉醒，武魂是${game.view.character.martialSoul.name}，先天魂力${game.view.character.innateSoulPower}级。`;
    }
    game.view.character.age ??= 6;
    game.view.character.cultivationProgress ??= "刚刚起步";
    game.view.character.condition ??= "良好";
    game.view.character.fatigue ??= "轻松";
    game.view.character.coins ??= 12;
    game.view.character.reputation ??= "默默无闻";
    game.view.character.injuries ??= [];
    game.view.character.soulRings ??= [];
    game.view.character.soulSpirits ??= [];
    game.view.character.battleArmors ??= [];
    game.view.character.martialSoul.name = normalizeMartialSoulName(game.view.character.martialSoul.name);
    game.view.character.martialSoul.grade ??= martialSoulGrade(game.view.character.martialSoul.name, game.view.character.martialSoul.rarity, game.view.character.innateSoulPower);
    game.view.character.martialSoul.sourceEra ??= game.view.character.martialSoul.rarity ? "局外" : "原创";
    game.view.character.martialSouls ??= [game.view.character.martialSoul];
    game.view.character.activeMartialSoulIndex ??= 0;
    game.view.character.activeMartialSoulIndex = Math.max(0, Math.min(game.view.character.activeMartialSoulIndex, game.view.character.martialSouls.length - 1));
    game.view.character.soulRingSets ??= [game.view.character.soulRings];
    while (game.view.character.soulRingSets.length < game.view.character.martialSouls.length) game.view.character.soulRingSets.push([]);
    game.view.character.martialSouls = game.view.character.martialSouls.map((soul, index) => ({ ...soul, name: normalizeMartialSoulName(soul.name), grade: soul.grade ?? martialSoulGrade(soul.name, soul.rarity, game.view.character!.innateSoulPower), sourceEra: soul.sourceEra ?? (soul.rarity ? "局外" : "原创"), cultivationState: index === game.view.character!.activeMartialSoulIndex ? "主修" : game.view.character!.soulRingSets[index].length ? "主修" : "未修炼" }));
    game.view.character.martialSoul = game.view.character.martialSouls[game.view.character.activeMartialSoulIndex];
    game.view.character.soulRings = game.view.character.soulRingSets[game.view.character.activeMartialSoulIndex];
    for (const relation of game.view.relations) {
      relation.strength ??= /亲属|父亲|母亲/.test(relation.relation) ? 75 : /师徒/.test(relation.relation) ? 45 : 12;
      relation.category ??= /亲属|父亲|母亲/.test(relation.relation) ? "亲属" : /势力|学院/.test(relation.relation) ? "势力" : /敌|仇/.test(relation.relation) ? "敌对" : "师友";
      relation.dimensions ??= { closeness: relation.category === "敌对" ? -relation.strength : relation.strength, trust: Math.round(relation.strength * .8), respect: Math.round(relation.strength * .45), sharedInterest: 0, vigilance: relation.category === "敌对" ? relation.strength : 5, hostility: relation.category === "敌对" ? relation.strength : 0, favorDebt: 0, identityKnowledge: Math.min(100, relation.strength + 10) };
      relation.history ??= [{ date: "旧存档", reason: "旧存档只保留了综合关系，详细原因从本次载入后开始记录", changes: "迁移关系" }];
      const surname = relation.name.slice(0, 1);
      if (relation.relation === "母亲" && /(?:守义|青禾|岳山|德昌|远林|成业|茂生|长顺)$/.test(relation.name)) relation.name = `${surname}兰芝`;
      if (relation.relation === "父亲" && /(?:兰芝|素琴|秋娘|静娴|春桃|桂香|月娥|秀禾)$/.test(relation.name)) relation.name = `${surname}守义`;
    }
    game.view.suggestions = game.view.suggestions.map((suggestion) => toThirdPersonNarrative(suggestion, game.view.character!.name, game.view.character!.gender)
      .replaceAll("他的", "自身的")
      .replaceAll("她的", "自身的")
      .replace(/询问(?:自身的)?先天魂力意味着什么/, "询问先天魂力会影响哪些修炼安排"));
    if (migrateNarrative) {
      for (const narrative of game.view.narrative) if (narrative.kind === "narration") narrative.text = toThirdPersonNarrative(narrative.text, game.view.character.name, game.view.character.gender);
    }
  }
  game.view.map = buildMapView(game);
  game.view.mapHierarchy = buildMapHierarchy(game);
  game.view.knownFigures = buildKnownFigures(game);
  game.view.intelligence = buildIntelligenceView(game);
  game.view.activeEvents = buildActiveEvents(game);
  refreshStoryArchive(game);
  return game;
}

export function createSystemEntry(text: string) {
  return { id: randomUUID(), kind: "system" as const, text, createdAt: new Date().toISOString() };
}
