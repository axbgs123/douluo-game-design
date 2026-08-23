import { randomUUID } from "node:crypto";
import type { GameView, KnownFigureView, MapLocationView, WorldEventView, WorldNewsView } from "../../shared/game.js";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, characterById, locationById } from "../data/world.js";
import type { HiddenWorldState, StoredGame, WorldNpcState } from "./model.js";
import { createRandom, integer, pick } from "./random.js";

const DAYS_PER_YEAR = 360;

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
      memoryOfPlayer: [],
    };
    return [definition.id, state];
  }));

  return {
    npcs,
    firedCanonEvents: CANON_EVENTS.filter((event) => event.year < startYear).map((event) => event.id),
    suppressedCanonEvents: [],
    deviation: 0,
    npcRelations: [],
    dynamicEvents: [],
    lastAutonomyOrdinal: ordinal(startYear, 1),
    resurrectionCount: 0,
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

function relationKind(bond: number): "亲近" | "合作" | "竞争" | "敌对" | "陌生" {
  if (bond >= 55) return "亲近";
  if (bond >= 18) return "合作";
  if (bond <= -55) return "敌对";
  if (bond <= -18) return "竞争";
  return "陌生";
}

function updateNpcRelation(game: StoredGame, leftId: string, rightId: string, delta: number, year: number): void {
  if (leftId === rightId) return;
  const [left, right] = [leftId, rightId].sort();
  let relation = game.world.npcRelations.find((item) => item.leftId === left && item.rightId === right);
  if (!relation) {
    relation = { leftId: left, rightId: right, bond: 0, kind: "陌生", lastChangedYear: year };
    game.world.npcRelations.push(relation);
  }
  const before = relation.kind;
  relation.bond = Math.max(-100, Math.min(100, relation.bond + delta));
  relation.kind = relationKind(relation.bond);
  relation.lastChangedYear = year;
  if (before !== relation.kind && relation.kind !== "陌生") {
    const leftNpc = game.world.npcs[left];
    const rightNpc = game.world.npcs[right];
    if (leftNpc?.knownToPlayer && rightNpc?.knownToPlayer) addNews(game, `npc-relation-${left}-${right}-${year}-${relation.kind}`, `${leftNpc.name}与${rightNpc.name}`, `两人的关系最近变成了${relation.kind}。具体原因还没有可靠说法。`);
  }
}

function createDynamicEvent(game: StoredGame, cycle: number, random: () => number): string | undefined {
  const active = game.world.dynamicEvents.filter((item) => item.status === "可介入");
  if (active.length >= 4 || random() > 0.58) return undefined;
  const template = pick(random, DYNAMIC_EVENT_TEMPLATES);
  if (game.world.dynamicEvents.some((event) => event.title === template.title && event.createdYear * DAYS_PER_YEAR + event.createdDay > cycle * 30 - DAYS_PER_YEAR)) return undefined;
  const npcs = Object.values(game.world.npcs).filter((npc) => npc.alive);
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
    stakes: template.stakes,
    status: "可介入",
    createdYear,
    createdDay,
    expiresOrdinal: createdOrdinal + integer(random, 24, 80),
  });
  if (locationId === game.view.locationId || participant?.knownToPlayer) {
    addNews(game, id, template.title, template.detail, { year: createdYear, day: createdDay });
    if (!game.view.tasks.some((task) => task.id === id)) game.view.tasks.push({ id, title: template.title, kind: "线索", detail: template.detail, status: "进行中" });
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
    if (current?.connections.length && (definition?.importance ?? 3) < 5 && random() < 0.32) actor.locationId = pick(random, current.connections).id;
    if (definition?.goals.length && random() < 0.4) actor.currentGoal = pick(random, definition.goals);
    const other = pick(random, living.filter((npc) => npc.id !== actor.id));
    const sharedFaction = actor.factionIds.some((id) => other.factionIds.includes(id));
    updateNpcRelation(game, actor.id, other.id, sharedFaction ? integer(random, 2, 8) : integer(random, -7, 5), game.view.worldTime?.year ?? 0);
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

function simulateCanonEvents(game: StoredGame, previousYear: number, currentYear: number): string[] {
  const messages: string[] = [];
  for (const event of CANON_EVENTS) {
    if (event.year < previousYear || event.year > currentYear || game.world.firedCanonEvents.includes(event.id)) continue;
    const resistance = event.inertia * 18;
    if (game.world.deviation >= resistance) {
      game.world.suppressedCanonEvents.push(event.id);
      addNews(game, `${event.id}-altered`, `${event.title}出现偏差`, "参与者和结果已经偏离常见记载，传闻之间互相矛盾。");
      game.world.metrics.historicalImpact += event.inertia * 2;
      messages.push(`历史偏移 · ${event.title}`);
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
    let revivedThisYear = false;
    if (!npc.alive && definition.importance >= 4 && year > npc.lastSimulatedYear) {
      const random = createRandom(`${game.view.seed}:npc-revival:${npc.id}:${year}`);
      const supportingFaction = FACTIONS.find((faction) => npc.factionIds.includes(faction.id));
      if (supportingFaction && random() < 0.08 + definition.importance * 0.025) {
        npc.alive = true;
        npc.locationId = supportingFaction.headquartersId;
        npc.powerTier = "复生后虚弱";
        npc.currentGoal = "偿还复生代价并处理死亡留下的局面";
        revivedThisYear = true;
        if (npc.knownToPlayer) addNews(game, `npc-revival-${npc.id}-${year}`, `${npc.name}重新出现`, `${supportingFaction.name}付出代价保住了他的性命，具体手段没有公开。`);
        game.world.deviation += definition.importance * 4;
      }
    }
    if (!npc.alive) { npc.lastSimulatedYear = year; continue; }
    const power = powerAtYear(npc.id, year);
    npc.soulRank = revivedThisYear && power.soulRank !== undefined ? Math.max(1, power.soulRank - 10) : power.soulRank;
    npc.powerTier = revivedThisYear ? "复生后虚弱" : power.tier;
    npc.age = definition.birthYear === undefined ? npc.age : Math.max(0, year - definition.birthYear);
    npc.lastSimulatedYear = year;
  }
}

export function advanceWorldTime(game: StoredGame, minutes: number): string[] {
  const time = game.view.worldTime;
  if (!time) return [];
  const previousYear = time.year;
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
  simulateNpcYears(game, time.year);
  const currentOrdinal = ordinal(time.year, time.day);
  const messages = [...simulateNpcAutonomy(game, previousOrdinal, currentOrdinal), ...simulateCanonEvents(game, previousYear, time.year)];
  game.view.map = buildMapView(game);
  game.view.knownFigures = buildKnownFigures(game);
  game.view.activeEvents = buildActiveEvents(game);
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
  legacy.schemaVersion = 3;
  legacy.world ??= createHiddenWorld(startYear, locationId);
  legacy.world.npcRelations ??= [];
  legacy.world.dynamicEvents ??= [];
  legacy.world.lastAutonomyOrdinal ??= ordinal(startYear, game.view.worldTime?.day ?? 1);
  legacy.world.resurrectionCount ??= 0;
  for (const npc of Object.values(legacy.world.npcs)) npc.memoryOfPlayer ??= [];
  game.storyMemory ??= {
    summary: game.view.narrative.slice(-6).map((entry) => entry.text).join(" ").slice(0, 1000),
    openThreads: game.view.tasks.filter((task) => task.status !== "完成").map((task) => task.title).slice(0, 8),
    keyChoices: [], npcNotes: {}, chapterNumber: 1, chapterTitle: "未完的故事", lastUpdatedAction: game.actionIndex,
  };
  game.legacy ??= { upgrades: {} };
  legacy.personalityProfile.evidence ??= [];
  game.view.lifeGoal ??= "成为自己认可的强者";
  game.view.locationId ??= locationId;
  game.view.map ??= [];
  game.view.news ??= [];
  game.view.knownFigures ??= [];
  game.view.activeEvents ??= [];
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
  game.view.activeEvents = buildActiveEvents(game);
  return game;
}

export function createSystemEntry(text: string) {
  return { id: randomUUID(), kind: "system" as const, text, createdAt: new Date().toISOString() };
}
