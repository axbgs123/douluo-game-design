import { randomUUID } from "node:crypto";
import type { GameView, KnownFigureView, MapLocationView, WorldNewsView } from "../../shared/game.js";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, characterById, locationById } from "../data/world.js";
import type { HiddenWorldState, StoredGame, WorldNpcState } from "./model.js";

const DAYS_PER_YEAR = 360;

export function inferLocationId(location: string): string {
  if (/圣魂村/.test(location)) return "holy-soul-village";
  if (/诺丁.*学院/.test(location)) return "notting-academy";
  if (/诺丁/.test(location)) return "notting-city";
  if (/索托/.test(location)) return "suotuo-city";
  if (/史莱克/.test(location)) return "shrek-village";
  if (/星斗.*核心/.test(location)) return "star-dou-core";
  if (/星斗/.test(location)) return "star-dou-edge";
  if (/落日|天斗南部丘陵/.test(location)) return "sunset-forest";
  if (/天斗城|天斗东部主城|天斗帝国中央/.test(location)) return "heaven-dou-city";
  if (/武魂城/.test(location)) return "spirit-city";
  if (/星罗/.test(location)) return "star-luo-city";
  if (/猎魂森林/.test(location)) return "soul-hunting-forest";
  return "notting-city";
}

function powerAtYear(characterId: string, year: number): { soulRank?: number; tier: string } {
  const definition = characterById(characterId);
  if (!definition?.powerSnapshots.length) return { tier: "未知" };
  const snapshots = [...definition.powerSnapshots].sort((left, right) => left.year - right.year);
  const prior = snapshots.filter((snapshot) => snapshot.year <= year).at(-1) ?? snapshots[0];
  const next = snapshots.find((snapshot) => snapshot.year > year);
  if (prior.soulRank !== undefined && next?.soulRank !== undefined && next.year !== prior.year) {
    const ratio = Math.max(0, Math.min(1, (year - prior.year) / (next.year - prior.year)));
    return { soulRank: Math.round(prior.soulRank + (next.soulRank - prior.soulRank) * ratio), tier: prior.tier };
  }
  return { soulRank: prior.soulRank, tier: prior.tier };
}

export function createHiddenWorld(startYear: number, startLocationId: string): HiddenWorldState {
  const npcs = Object.fromEntries(CANON_CHARACTERS.map((definition) => {
    const power = powerAtYear(definition.id, startYear);
    const state: WorldNpcState = {
      id: definition.id,
      name: definition.name,
      alive: true,
      age: definition.birthYear === undefined ? undefined : Math.max(0, startYear - definition.birthYear),
      soulRank: power.soulRank,
      powerTier: power.tier,
      locationId: definition.initialLocationId,
      factionIds: definition.factionIds,
      currentGoal: definition.goals[0] ?? "继续当前生活",
      dispositionToPlayer: 0,
      knownToPlayer: definition.initialLocationId === startLocationId && definition.importance <= 3,
      lastSimulatedYear: startYear,
    };
    return [definition.id, state];
  }));

  return {
    npcs,
    firedCanonEvents: CANON_EVENTS.filter((event) => event.year < startYear).map((event) => event.id),
    suppressedCanonEvents: [],
    deviation: 0,
    discoveredLocations: [startLocationId],
    flags: {},
    trainingPoints: 0,
    healthPoints: 100,
    fatiguePoints: 0,
    metrics: { discoveries: 0, relationshipsBuilt: 0, historicalImpact: 0, completedHunts: 0, promisesKept: 0, battlesWon: 0 },
  };
}

export function buildMapView(game: StoredGame): MapLocationView[] {
  const currentId = game.view.locationId ?? "notting-city";
  const current = locationById(currentId);
  const customCurrentName = Boolean(game.view.location && current && game.view.location !== current.name);
  const visibleIds = new Set([currentId, ...game.world.discoveredLocations, ...(current?.connections.map((connection) => connection.id) ?? [])]);
  return LOCATIONS.filter((location) => visibleIds.has(location.id)).map((location) => ({
    id: location.id,
    name: location.id === currentId && game.view.location ? game.view.location : location.name,
    region: location.region,
    description: location.id === currentId && customCurrentName ? "角色当前生活的聚居地，交通路线按附近主城计算。" : location.description,
    danger: location.danger,
    travelMinutes: location.id === currentId ? 0 : current?.connections.find((connection) => connection.id === location.id)?.minutes ?? -1,
    discovered: game.world.discoveredLocations.includes(location.id),
    current: location.id === currentId,
  }));
}

function knownPower(npc: WorldNpcState): string {
  if (npc.soulRank !== undefined) return `${npc.soulRank} 级`;
  return npc.powerTier;
}

export function buildKnownFigures(game: StoredGame): KnownFigureView[] {
  return Object.values(game.world.npcs).filter((npc) => npc.knownToPlayer).map((npc) => {
    const definition = characterById(npc.id);
    const faction = FACTIONS.find((item) => npc.factionIds.includes(item.id));
    return {
      id: npc.id,
      name: npc.name,
      title: definition?.aliases[0],
      faction: faction?.name,
      knownPower: knownPower(npc),
      location: locationById(npc.locationId)?.name ?? "不明",
      status: npc.alive ? npc.currentGoal : "已死亡",
    };
  });
}

function seasonForDay(day: number): GameView["worldTime"] extends infer T ? T extends { season: infer S } ? S : never : never {
  if (day <= 90) return "春";
  if (day <= 180) return "夏";
  if (day <= 270) return "秋";
  return "冬";
}

function addNews(game: StoredGame, eventId: string, title: string, detail: string): void {
  if (game.view.news.some((item) => item.id === eventId)) return;
  const time = game.view.worldTime;
  const news: WorldNewsView = {
    id: eventId,
    title,
    detail,
    date: time ? `原作基准 ${time.year >= 0 ? "+" : ""}${time.year} 年 · 第 ${time.day} 日` : "时间不明",
  };
  game.view.news.unshift(news);
  game.view.news = game.view.news.slice(0, 30);
}

function simulateCanonEvents(game: StoredGame, previousYear: number, currentYear: number): string[] {
  const messages: string[] = [];
  for (const event of CANON_EVENTS) {
    if (event.year < previousYear || event.year > currentYear || game.world.firedCanonEvents.includes(event.id)) continue;
    const resistance = event.inertia * 18;
    if (game.world.deviation > resistance && event.inertia < 5) {
      game.world.suppressedCanonEvents.push(event.id);
      messages.push(`${event.title}没有按原本的条件发生。`);
      continue;
    }
    game.world.firedCanonEvents.push(event.id);
    addNews(game, event.id, event.title, event.publicSummary);
    for (const participantId of event.participantIds) {
      const npc = game.world.npcs[participantId];
      if (npc && event.locationId) npc.locationId = event.locationId;
    }
    messages.push(`传闻 · ${event.title}`);
  }
  return messages;
}

function simulateNpcYears(game: StoredGame, year: number): void {
  for (const npc of Object.values(game.world.npcs)) {
    const definition = characterById(npc.id);
    if (!definition) continue;
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
  const previousYear = time.year;
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
  simulateNpcYears(game, time.year);
  const messages = simulateCanonEvents(game, previousYear, time.year);
  game.view.map = buildMapView(game);
  game.view.knownFigures = buildKnownFigures(game);
  return messages;
}

export function revealNpc(game: StoredGame, npcId: string): void {
  const npc = game.world.npcs[npcId];
  if (!npc) return;
  npc.knownToPlayer = true;
  game.view.knownFigures = buildKnownFigures(game);
}

export function ensureGameState(game: StoredGame): StoredGame {
  const legacy = game as StoredGame & { schemaVersion?: number; world?: HiddenWorldState };
  const candidate = game.view.candidates[0];
  const startYear = game.view.worldTime?.year ?? candidate?.birthYearOffset ?? 0;
  const locationId = game.view.locationId ?? inferLocationId(game.view.location ?? candidate?.location ?? "诺丁城");
  legacy.schemaVersion = 2;
  legacy.world ??= createHiddenWorld(startYear, locationId);
  legacy.personalityProfile.evidence ??= [];
  game.view.lifeGoal ??= "成为自己认可的强者";
  game.view.locationId ??= locationId;
  game.view.map ??= [];
  game.view.news ??= [];
  game.view.knownFigures ??= [];
  game.view.runProgress ??= {
    lifeGoal: game.view.lifeGoal,
    highestSoulRank: game.view.character?.soulRank ?? 0,
    discoveries: 0,
    relationshipsBuilt: game.view.relations.length,
    historicalImpact: 0,
    completedHunts: 0,
  };
  if (game.view.worldTime) {
    game.view.worldTime.year ??= startYear;
    game.view.worldTime.season ??= "春";
  }
  if (game.view.character) {
    game.view.character.age ??= 6;
    game.view.character.cultivationProgress ??= "刚刚起步";
    game.view.character.condition ??= "良好";
    game.view.character.fatigue ??= "轻松";
    game.view.character.coins ??= 12;
    game.view.character.reputation ??= "默默无闻";
    game.view.character.injuries ??= [];
    game.view.character.soulRings ??= [];
  }
  game.view.map = buildMapView(game);
  game.view.knownFigures = buildKnownFigures(game);
  return game;
}

export function createSystemEntry(text: string) {
  return { id: randomUUID(), kind: "system" as const, text, createdAt: new Date().toISOString() };
}
