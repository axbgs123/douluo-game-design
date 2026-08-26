import { randomUUID } from "node:crypto";
import type { GameView, IntelligenceView, KnownFigureView, MapHierarchyView, MapLocationView, NpcRelationEvidenceView, WorldEventView, WorldNewsView } from "../../shared/game.js";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, characterById, locationActiveAtYear, locationById, locationProfileAtYear } from "../data/world.js";
import type { CanonCausalDomain, CanonCausalFootprint, HiddenWorldState, NpcMemoryEntry, SocialRumorState, StoredGame, WorldNpcState } from "./model.js";
import { toThirdPersonNarrative } from "./narrative.js";
import { refreshStoryArchive } from "./story-rules.js";
import { createRandom, integer, pick } from "./random.js";
import { worldMapPoint } from "../../shared/world-map.js";
import { heirloomByName } from "../../shared/heirlooms.js";
import { martialSoulGrade, normalizeMartialSoulName } from "../../shared/martial-soul.js";
import { fixedTraitEffect } from "./traits.js";
import { CANON_RELATIONSHIPS } from "../data/canon-relationships.js";
import { ensureStoryArc } from "./story-director.js";
import { compileNpcPlan, ensureNpcPlans, executeNpcPlanStep } from "./npc-planner.js";
import { decayLocalConsequences, resolveExpiredDynamicEvent } from "./event-consequences.js";
import { dynamicEventTemplatesForEra } from "../data/era-dynamic-events.js";
import { CHARACTER_LIFE_STAGES, characterLifeStageAtDate } from "../data/character-life-stages.js";
import { academyEraLifeProfile } from "../../shared/academy-life.js";

const DAYS_PER_YEAR = 360;

const RELATIONSHIP_EVENT_PREREQUISITES: Record<string, string> = {
  "tangsan-xiaowu-notting": "tang-awakening",
  "tangsan-yuxiaogang": "notting-master-disciple",
  "d2-yuhao-wangdonger": "d2-shrek-enrollment",
  "d3-wulin-gu-yue": "d3-zero-class",
  "d3-shrek-team": "d3-zero-class",
  "d4-xuanyu-xiuxiu": "d4-high-energy-class",
};

function ensureCanonRelationshipBaselines(npcs: Record<string, WorldNpcState>, relations: HiddenWorldState["npcRelations"], year: number, day: number, suppressedCanonEvents: string[] = []): void {
  const era = eraIndexAtYear(year);
  for (const definition of CANON_RELATIONSHIPS) {
    if (definition.era !== era || definition.validFromYear > year || (definition.validFromYear === year && (definition.validFromDay ?? 1) > day) || (definition.validUntilYear !== undefined && definition.validUntilYear < year)) continue;
    const prerequisite = RELATIONSHIP_EVENT_PREREQUISITES[definition.id];
    if (prerequisite && suppressedCanonEvents.includes(prerequisite)) continue;
    const left = npcs[definition.fromId]; const right = npcs[definition.toId];
    if (!left?.alive || !right?.alive || relations.some((item) => (item.leftId === left.id && item.rightId === right.id) || (item.leftId === right.id && item.rightId === left.id))) continue;
    const competitive = /竞争|冲突|怨恨|权力/.test(`${definition.relation}${definition.dynamics}`);
    const close = /父|母|伴侣|兄妹|亲友|保护|抚养|宠爱/.test(`${definition.relation}${definition.basis}`);
    const kind = competitive ? "竞争" as const : close ? "亲近" as const : "合作" as const;
    const bond = kind === "亲近" ? Math.round(45 + definition.importance * 25) : kind === "合作" ? Math.round(25 + definition.importance * 20) : Math.round(5 + definition.importance * 10);
    relations.push({
      leftId: left.id, rightId: right.id, bond, kind, lastChangedYear: year,
      dimensions: kind === "亲近"
        ? { affinity: bond, trust: Math.max(25, bond - 12), respect: 45, sharedInterest: 50, vigilance: 8, hostility: 0 }
        : kind === "合作"
          ? { affinity: 25, trust: 35, respect: 45, sharedInterest: bond + 10, vigilance: 15, hostility: 0 }
          : { affinity: 8, trust: 12, respect: 30, sharedInterest: 18, vigilance: 45, hostility: 12 },
      history: [{ year, day, delta: 0, reason: `原著关系基线：${definition.relation}；后续只按实际经历变化` }],
    });
  }
}

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

export function canonicalFactionIdsAtDate(characterId: string, year: number, day: number): string[] {
  const definition = characterById(characterId);
  if (!definition) return [];
  const stage = characterLifeStageAtDate(characterId, year, day);
  if (stage) return [...stage.publicFactionIds];
  return definition.factionIds.filter((factionId) => {
    const membership = TIMED_FACTION_MEMBERSHIPS.find((item) => item.characterId === characterId && item.factionId === factionId);
    if (!membership) return true;
    const event = CANON_EVENTS.find((item) => item.id === membership.eventId);
    return Boolean(event && ordinal(event.year, event.day ?? 1) <= ordinal(year, day));
  });
}

export function characterPublicNameAtDate(characterId: string, year: number, day = 1): string {
  return characterLifeStageAtDate(characterId, year, day)?.publicName ?? characterById(characterId)?.name ?? characterId;
}

export function characterCurrentGoalAtDate(characterId: string, year: number, day = 1): string {
  const definition = characterById(characterId);
  if (!definition) return "处理当前生活";
  const stage = characterLifeStageAtDate(characterId, year, day);
  if (stage) return stage.currentGoal;
  const age = definition.birthYear === undefined ? undefined : year - definition.birthYear;
  if (age !== undefined && age < 6) return "在家庭或族群照料下成长，尚未形成后来的修炼与势力目标";
  if (age !== undefined && age < 12) return "处理当前家庭生活、武魂觉醒与基础学习，不预设后来的人际和势力选择";
  const snapshot = [...definition.powerSnapshots].filter((item) => item.year <= year).sort((left, right) => left.year - right.year).at(-1);
  if (snapshot) return `处理“${snapshot.note}”阶段的修炼、职责与现实关系`;
  return "维持当前生活并处理已经发生的职责，不使用后来才形成的目标";
}

export function characterPubliclyActiveAtDate(characterId: string, year: number, day = 1): boolean {
  const definition = characterById(characterId);
  if (!definition || !characterExistsInEra(characterId, year)) return false;
  if (characterLifeStageAtDate(characterId, year, day)) return true;
  if (definition.birthYear !== undefined) return year >= definition.birthYear;
  const firstSnapshot = Math.min(...definition.powerSnapshots.map((item) => item.year));
  return Number.isFinite(firstSnapshot) && year >= firstSnapshot;
}

function applyFactionJoinsForEvent(game: StoredGame, eventId: string): void {
  for (const membership of TIMED_FACTION_MEMBERSHIPS.filter((item) => item.eventId === eventId)) {
    const npc = game.world.npcs[membership.characterId];
    if (npc && !npc.factionIds.includes(membership.factionId)) npc.factionIds.push(membership.factionId);
  }
}

function reconcileTimedFactionMemberships(game: StoredGame, year: number, day: number): void {
  const now = ordinal(year, day);
  for (const npc of Object.values(game.world.npcs)) {
    const activeCauses = game.world.canonCausalFootprints.filter((item) => item.affectedNpcIds.includes(npc.id)).map((cause) => ({ cause, strength: effectiveCauseStrength(cause, now) }));
    const goalAltered = activeCauses.some((item) => item.strength >= 4 && causeHasDomain(item.cause, "goal", "survival"));
    const factionAltered = activeCauses.some((item) => item.strength >= 1 && causeHasDomain(item.cause, "faction", "institution"));
    const definition = characterById(npc.id);
    const identityRevealed = Boolean(definition && game.world.intelligenceRecords.some((record) => record.subjectType === "人物" && record.subjectId === npc.id && record.confidence >= 85 && record.status === "确定" && /交叉核验|身份核验|密档/.test(record.source) && `${record.title}${record.detail}`.includes(definition.name)));
    if (npc.alive) {
      const currentPublicName = identityRevealed && definition ? definition.name : characterPublicNameAtDate(npc.id, year, day);
      npc.name = currentPublicName;
      for (const relation of game.view.relations.filter((item) => item.id === npc.id)) relation.name = currentPublicName;
      if (!goalAltered) npc.currentGoal = characterCurrentGoalAtDate(npc.id, year, day);
    }
    const canonical = canonicalFactionIdsAtDate(npc.id, year, day);
    if (!factionAltered) npc.factionIds = canonical.filter((factionId) => {
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

function ordinal(year: number, day: number): number { return year * DAYS_PER_YEAR + day; }

function inferCausalDomains(source: string, description: string): CanonCausalDomain[] {
  const text = `${source}${description}`;
  const domains = new Set<CanonCausalDomain>();
  if (/身份|化名|揭露|血脉|密档/.test(text)) domains.add("identity");
  if (/目标|计划|拜师|承诺|救下|阻止/.test(text)) domains.add("goal");
  if (/加入|退出|势力|宗门|学院|军团|舰队|夺权|摧毁/.test(text)) domains.add("faction");
  if (/交谈|关系|拜师|背叛|保护|袭击|救/.test(text)) domains.add("relationship");
  if (/修炼|实力|魂力|武魂|魂环|培养/.test(text)) domains.add("power");
  if (/地点|迁移|封锁|路线|入学条件|学院条件/.test(text)) domains.add("location");
  if (/死亡|杀|复生|救下|献祭/.test(text)) domains.add("survival");
  if (/资源|夺取|物资|药草|名额|资金|粮食/.test(text)) domains.add("resource");
  if (/制度|机构|权限|入学|战争|事件|学院条件/.test(text)) domains.add("institution");
  if (!domains.size) domains.add("relationship");
  return [...domains];
}

function causalExpiry(atOrdinal: number, domains: CanonCausalDomain[]): number {
  if (domains.includes("survival") || domains.includes("identity") || domains.includes("power") || domains.includes("faction")) return atOrdinal + 100_000;
  if (domains.includes("institution")) return atOrdinal + 10 * DAYS_PER_YEAR;
  if (domains.includes("goal")) return atOrdinal + 3 * DAYS_PER_YEAR;
  if (domains.includes("relationship")) return atOrdinal + 2 * DAYS_PER_YEAR;
  return atOrdinal + DAYS_PER_YEAR;
}

function effectiveCauseStrength(cause: CanonCausalFootprint, atOrdinal: number): number {
  const created = ordinal(cause.atYear, cause.atDay);
  if (atOrdinal < created || (cause.expiresOrdinal !== undefined && atOrdinal > cause.expiresOrdinal)) return 0;
  const domains = cause.domains ?? inferCausalDomains(cause.source, cause.description);
  if (domains.includes("survival") || domains.includes("identity")) return cause.strength;
  const lifetime = Math.max(1, (cause.expiresOrdinal ?? causalExpiry(created, domains)) - created);
  const age = Math.max(0, atOrdinal - created);
  return cause.strength * Math.max(.05, 1 - age / lifetime);
}

function causeHasDomain(cause: CanonCausalFootprint, ...domains: CanonCausalDomain[]): boolean {
  const actual = cause.domains ?? inferCausalDomains(cause.source, cause.description);
  return domains.some((domain) => actual.includes(domain));
}

export function inferLocationId(location: string): string {
  if (/联邦舰队集结基地|舰队集结基地|联邦母舰港|母舰港/.test(location)) return "mother-ship-port";
  if (/森罗星/.test(location)) return "senluo-planet";
  if (/精灵星/.test(location)) return "elf-planet";
  if (/海外星罗/.test(location)) return "d3-star-luo-capital";
  if (/传灵塔总部/.test(location)) return "spirit-pagoda-hq";
  if (/明都（联邦时期）|联邦明都/.test(location)) return "mingdu-federal";
  if (/东海城/.test(location)) return "east-sea-city";
  if (/史莱克城/.test(location)) return "shrek-city";
  if (/明都/.test(location)) return "radiant-city";
  if (/天魂|天斗城（天魂帝国时期）/.test(location)) return "heaven-dou-city";
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
  const sectLocation = [
    ["圣龙宗驻地", "holy-dragon-gate"], ["圣龙宗白甲山门", "holy-dragon-gate"], ["归潮门听潮屿", "tide-listening-isle"],
    ["眠云谷雾隐山坳", "dream-cloud-valley"], ["铸星台坠铁峰", "star-forge-peak"],
    ["镜湖宗折光湖", "mirror-fold-lake"], ["百兽山庄伏兽岭", "beast-manor-ridge"],
    ["听雪门寒声岭", "snow-sound-ridge"], ["断碑门无字崖", "wordless-cliff"],
    ["药王涧百草峡", "hundred-herb-ravine"], ["无声阁回音窟", "echo-cavern"],
    ["栖凤岭赤羽台", "red-feather-terrace"],
  ].find(([name]) => location.includes(name));
  if (sectLocation) return sectLocation[1];
  if (/火豹宗/.test(location)) return "fire-leopard-town";
  if (/风剑宗|风剑峡/.test(location)) return "wind-sword-pass";
  if (/清河水宗/.test(location)) return "clear-river-spring";
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
    return { tier: "实力未核实" };
  }
  const prior = snapshots.filter((snapshot) => snapshot.year <= year).at(-1) ?? first;
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
      name: characterPublicNameAtDate(definition.id, startYear, 1),
      alive: aliveAtStart,
      age: definition.birthYear === undefined ? undefined : Math.max(0, startYear - definition.birthYear),
      soulRank: aliveAtStart ? power.soulRank : undefined,
      powerTier: aliveAtStart ? power.tier : "不在当世活动",
      locationId: canonicalLocationAtYear(definition.id, startYear, 1),
      factionIds: canonicalFactionIdsAtDate(definition.id, startYear, 1),
      currentGoal: !inCurrentEra ? "不在当前时代活动" : !born ? "尚未出生" : aliveAtStart ? characterCurrentGoalAtDate(definition.id, startYear, 1) : "已死亡",
      dispositionToPlayer: 0,
      knownToPlayer: false,
      lastSimulatedYear: startYear,
      memoryOfPlayer: [],
      episodicMemory: [],
      autonomyLog: [],
    };
    return [definition.id, state];
  }));

  const npcRelations: HiddenWorldState["npcRelations"] = [];
  ensureCanonRelationshipBaselines(npcs, npcRelations, startYear, 1);
  return {
    npcs,
    firedCanonEvents: CANON_EVENTS.filter((event) => event.year < startYear).map((event) => event.id),
    suppressedCanonEvents: [],
    deviation: 0,
    canonCausalFootprints: [],
    canonTimelineBranches: [],
    npcRelations,
    dynamicEvents: [],
    localConsequences: [],
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
  input: { source: string; description: string; affectedNpcIds?: string[]; affectedFactionIds?: string[]; strength: number; locationId?: string; domains?: CanonCausalDomain[]; expiresOrdinal?: number },
): void {
  const time = game.view.worldTime;
  const atOrdinal = ordinal(time?.year ?? 0, time?.day ?? 1);
  const domains = [...new Set(input.domains ?? inferCausalDomains(input.source, input.description))];
  const npcIds = [...new Set(input.affectedNpcIds ?? [])];
  const factionIds = [...new Set(input.affectedFactionIds ?? [])];
  const duplicate = game.world.canonCausalFootprints.find((cause) => cause.source === input.source && cause.description === input.description && cause.atYear === (time?.year ?? 0) && cause.atDay === (time?.day ?? 1) && cause.affectedNpcIds.join("|") === npcIds.join("|") && cause.affectedFactionIds.join("|") === factionIds.join("|"));
  if (duplicate) {
    duplicate.strength = Math.max(duplicate.strength, input.strength);
    duplicate.domains = [...new Set([...(duplicate.domains ?? []), ...domains])];
    duplicate.expiresOrdinal = Math.max(duplicate.expiresOrdinal ?? 0, input.expiresOrdinal ?? causalExpiry(atOrdinal, domains));
    return;
  }
  game.world.canonCausalFootprints.push({
    id: `cause-${game.actionIndex}-${game.world.canonCausalFootprints.length}`,
    source: input.source,
    description: input.description,
    atYear: time?.year ?? 0,
    atDay: time?.day ?? 1,
    locationId: input.locationId ?? game.view.locationId ?? "notting-city",
    affectedNpcIds: npcIds,
    affectedFactionIds: factionIds,
    strength: Math.max(0, input.strength),
    domains,
    expiresOrdinal: input.expiresOrdinal ?? causalExpiry(atOrdinal, domains),
    propagationDepth: 0,
  });
  game.world.canonCausalFootprints = game.world.canonCausalFootprints.slice(-120);
  const latest = game.world.canonCausalFootprints.at(-1)!;
  const affectedNames = latest.affectedNpcIds.map((id) => game.world.npcs[id]).filter((npc) => npc && (npc.knownToPlayer || latest.description.includes(npc.name))).map((npc) => npc!.name);
  const affectedFactions = latest.affectedFactionIds.map((id) => FACTIONS.find((item) => item.id === id)).filter((faction) => faction && (latest.description.includes(faction.name) || game.view.affiliations.some((item) => item.id === faction.id) || latest.affectedNpcIds.some((npcId) => game.world.npcs[npcId]?.knownToPlayer && game.world.npcs[npcId]?.factionIds.includes(faction.id)) || game.world.intelligenceRecords.some((record) => record.subjectType === "势力" && record.subjectId === faction.id && record.confidence >= 60))).map((faction) => faction!.name);
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
  const npc = game.world.npcs[npcId];
  const now = ordinal(game.view.worldTime?.year ?? 0, game.view.worldTime?.day ?? 1);
  return game.world.canonCausalFootprints.some((cause) => effectiveCauseStrength(cause, now) >= 2 && (cause.affectedNpcIds.includes(npcId)
    || (causeHasDomain(cause, "faction", "institution") && npc?.factionIds.some((id) => cause.affectedFactionIds.includes(id)))));
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
    const profile = locationProfileAtYear(location, year);
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
      region: profile.region,
      description: location.id === currentId && customCurrentName ? "角色当前生活的原创微地点，交通路线按附近主城计算。" : profile.description,
      danger: location.danger,
      travelMinutes: location.id === currentId ? 0 : current?.connections.find((connection) => connection.id === location.id)?.minutes ?? -1,
      discovered: game.world.discoveredLocations.includes(location.id),
      current: location.id === currentId,
      x: isAtSelectedHome ? (selectedHome?.mapX ?? point.x) : point.x,
      y: isAtSelectedHome ? (selectedHome?.mapY ?? point.y) : point.y,
      objective,
      source: location.id === currentId && customCurrentName ? "原创" : location.provenance,
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
      faction: faction?.name,
      knownPower: visiblePower,
      location: metInPerson && npc.locationId === game.view.locationId ? locationName : confidence >= 70 ? locationName : `${locationName}一带（未核实）`,
      status: npc.alive ? (metInPerson ? (npc.activePlan?.lastOutcome ? `可观察近况：${npc.activePlan.lastOutcome}` : npc.currentGoal) : intel?.status === "确定" ? "消息已核实" : "近况不明") : "已死亡",
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
  if (input.subjectType === "人物" && input.confidence >= 85 && input.status === "确定" && /交叉核验|身份核验|密档/.test(input.source)) {
    const definition = characterById(input.subjectId); const npc = game.world.npcs[input.subjectId];
    if (definition && npc && `${input.title}${input.detail}`.includes(definition.name)) {
      npc.name = definition.name;
      for (const relation of game.view.relations.filter((item) => item.id === npc.id)) relation.name = definition.name;
    }
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
  const authorityName = authorityFact && /宗|殿|府|院|会|队|城|村|镇|行|家族/.test(authorityFact) ? authorityFact : (game.view.era ?? 1) === 1 ? `${settlementName}当地管事人` : `${settlementName}地方事务接待处`;
  const confidenceFor = (id: string) => [...game.world.intelligenceRecords].reverse().find((item) => item.subjectType === "地点" && item.subjectId === id);
  const continentNodes = game.view.map.filter((item) => item.discovered || item.current || item.objective).map((item) => {
    const intel = confidenceFor(item.id);
    return { id: item.id, name: item.name, level: "大陆" as const, kind: "地点", description: item.description, x: item.x, y: item.y, current: item.current, objective: item.objective, confidence: item.current ? 100 : intel?.confidence ?? 60, source: item.current ? "亲历" : intel?.source ?? "地图与传闻" };
  });
  const localNodes = [
    { id: `${currentLocation}:gate`, name: "聚居地入口", kind: "出入口", description: "通向外部道路，旅行从这里计算。", x: 12, y: 52 },
    { id: `${currentLocation}:home`, name: buildingName, kind: "住处", description: selected?.residence?.security ?? "当前可以休息和存放普通物品的地方。", x: 32, y: 34 },
    { id: `${currentLocation}:authority`, name: authorityName, kind: "机构", description: (game.view.era ?? 1) === 1 ? "处理来处担保、地方纠纷和日常公共事务。" : "处理身份资料、治安与本地事务。", x: 67, y: 30 },
    { id: `${currentLocation}:market`, name: `${settlementName}集市`, kind: "交易", description: "日常补给、零工与传闻集中的区域。", x: 62, y: 70 },
    { id: `${currentLocation}:awakening`, name: `${settlementName}觉醒点`, kind: "武魂", description: "当地儿童进行武魂觉醒，或在结果异常时重新测试的地点。", x: 84, y: 49 },
  ].map((node) => ({ ...node, level: "聚居地" as const, parentId: currentLocation, current: node.id.endsWith(":home"), confidence: node.id.endsWith(":home") ? 100 : 82, source: node.id.endsWith(":home") ? "日常生活" : "本地常识" }));
  const room = selected?.residence?.room ?? "临时卧室";
  const buildingNodes = [
    { id: `${currentLocation}:building:entrance`, name: "入口", kind: "出入口", description: "连接住处与外部道路。", x: 50, y: 88 },
    { id: `${currentLocation}:building:main`, name: "堂屋", kind: "公共空间", description: "家人或同住者日常见面、吃饭和商议事情的地方。", x: 50, y: 55 },
    { id: `${currentLocation}:building:room`, name: room, kind: "个人房间", description: `${game.view.character?.name ?? selected?.name ?? "角色"}当前睡眠、收纳私人物品的位置。`, x: 24, y: 28 },
    { id: `${currentLocation}:building:store`, name: "储物间", kind: "储藏", description: "普通物资与家庭工具所在处，贵重物品未必放在这里。", x: 77, y: 28 },
    { id: `${currentLocation}:building:yard`, name: /宗|府|殿|堡/.test(buildingName) ? "练功小院" : "后院", kind: "训练", description: "可以进行不扰民的基础练习。", x: 78, y: 66 },
  ].map((node) => ({ ...node, level: "建筑" as const, parentId: `${currentLocation}:home`, current: node.name === room, confidence: 100, source: "日常生活" }));
  return { continentName: "斗罗大陆", settlementName, buildingName, nodes: [...continentNodes, ...localNodes, ...buildingNodes] };
}

export function buildActiveEvents(game: StoredGame): WorldEventView[] {
  const now = ordinal(game.view.worldTime?.year ?? 0, game.view.worldTime?.day ?? 1);
  return game.world.dynamicEvents.filter((event) => event.status === "可介入" && (event.locationId === game.view.locationId || game.view.news.some((item) => item.id === event.id || `${item.title}${item.detail}`.includes(event.title)) || game.world.intelligenceRecords.some((record) => record.subjectType === "事件" && (record.subjectId === event.id || `${record.title}${record.detail}`.includes(event.title)) && record.confidence >= 60))).map((event) => ({
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

function mediaProfile(era: 2 | 3 | 4, publicRegistry: boolean, valence: -1 | 1): { channel: string; outlet: string; stance: string } {
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

function secondaryMediaProfile(era: 2 | 3 | 4): { outlet: string; stance: string } {
  if (era === 2) return { outlet: "城市公共广播栏", stance: "听众安全与事件时效" };
  if (era === 3) return { outlet: "地方民生频道", stance: "居民影响与公共问责" };
  return { outlet: "星域民生观察频道", stance: "公共服务影响与跨星区问责" };
}

function responsibleEditor(outlet: string): { name: string; role: "责任编辑" | "值班核验编辑" } {
  const profiles: Record<string, { name: string; role: "责任编辑" | "值班核验编辑" }> = {
    地方魂师报刊编辑部: { name: "霍青", role: "责任编辑" },
    魂导广播新闻台: { name: "云翎", role: "值班核验编辑" },
    城市公共广播栏: { name: "陆声", role: "责任编辑" },
    联邦事务公报编辑部: { name: "顾衡", role: "责任编辑" },
    大陆魂导传媒公共频道: { name: "林简", role: "值班核验编辑" },
    地方民生频道: { name: "唐芷", role: "责任编辑" },
    联邦公共信息网: { name: "周序", role: "值班核验编辑" },
    星域安全通报频道: { name: "闻启", role: "值班核验编辑" },
    星域民生观察频道: { name: "夏遥", role: "责任编辑" },
    魂导公共查证台: { name: "苏澄", role: "值班核验编辑" },
    大陆独立事实核验站: { name: "裴真", role: "责任编辑" },
    星域公共证据联合站: { name: "罗序", role: "值班核验编辑" },
    联城魂导证据台: { name: "卓宁", role: "值班核验编辑" },
    联邦公共查证协作社: { name: "乔衡", role: "责任编辑" },
    星海独立档案节点: { name: "卫岚", role: "值班核验编辑" },
  };
  return profiles[outlet] ?? { name: "当班编辑", role: "值班核验编辑" };
}

export function recordMediaOutletReputation(game: StoredGame, input: { name: string; stance: string; trustDelta: number; publication?: boolean; correction?: boolean; linkedReport?: boolean; evidence: string }): void {
  if (game.view.era === 1) return;
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

export function recordMediaCompetition(game: StoredGame, input: { primary: string; secondary: string; primaryDelta: number; secondaryDelta: number; evidence: string; status: "首发竞争" | "核验拉锯" | "更正问责"; newTopic?: boolean; topicId?: string; topic?: string; playerChoice?: string }): void {
  if (game.view.era === 1) return;
  game.view.mediaCompetitions ??= [];
  const outlets = [input.primary, input.secondary].sort((left, right) => left.localeCompare(right, "zh-CN")) as [string, string];
  const id = `media-competition:${outlets.join(":")}`;
  let competition = game.view.mediaCompetitions.find((item) => item.id === id);
  if (!competition) {
    competition = { id, outlets, scores: { [outlets[0]]: 0, [outlets[1]]: 0 }, sharedTopics: 0, status: "并列观察", evidence: [], topics: [] };
    game.view.mediaCompetitions.push(competition);
  }
  competition.scores[input.primary] = Math.max(-100, Math.min(100, (competition.scores[input.primary] ?? 0) + input.primaryDelta));
  competition.scores[input.secondary] = Math.max(-100, Math.min(100, (competition.scores[input.secondary] ?? 0) + input.secondaryDelta));
  competition.topics ??= [];
  if (input.newTopic) {
    const topicId = input.topicId ?? `topic-${competition.sharedTopics + 1}`;
    if (!competition.topics.some((topic) => topic.id === topicId)) {
      competition.sharedTopics += 1;
      competition.topics.push({ id: topicId, title: input.topic ?? `共同报道议题 ${competition.sharedTopics}`, sourceRumorId: input.topicId ?? "旧存档关联报道", status: "候选议题", priorityScores: { [outlets[0]]: 0, [outlets[1]]: 0 }, evidence: [input.evidence] });
    }
  }
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
  const mediaEligible = publicRegistry || (witnesses.length >= 3 && factionIds.length > 0);
  const corroborationCount = publicRegistry ? 2 : witnesses.length;
  const verificationStatus = publicRegistry ? "双记录核验" : witnesses.length >= 5 && factionIds.length >= 2 ? "跨关系网交叉核验" : mediaEligible ? "同源多证待复核" : "来源不足";
  const localDelay = 1 + (game.actionIndex % 3);
  const baseRumor: SocialRumorState = { id: `rumor-${game.actionIndex}-${game.world.socialRumors.length}`, publicName, locationId, summary: valence > 0 ? `${publicName}完成了有公开凭据的${intent}` : `${publicName}卷入了受到质疑的${intent}`, valence, witnessNpcIds: witnesses.map((npc) => npc.id), factionIds, createdOrdinal, spreadsAtOrdinal: createdOrdinal + localDelay, status: "待传播", confidence: publicRegistry ? 92 : Math.min(85, 35 + witnesses.length * 7), sourceKind: publicRegistry ? "公开登记" : "现场目击", corroborationCount, verificationStatus, correctionEvidence: [] };
  if (era === 1) {
    const earlyCirculationChannel = publicRegistry ? (factionIds.length ? "势力通告" : "地方告示") : mediaEligible ? "商旅消息" : "口耳传闻";
    game.world.socialRumors.push({
      ...baseRumor,
      earlyCirculationChannel,
      earlyCirculationStatus: mediaEligible ? "待扩散" : "仅本地",
      earlyCirculationSpreadsAtOrdinal: mediaEligible ? createdOrdinal + localDelay + 14 : undefined,
      earlyCirculationBasis: publicRegistry
        ? "承办人与验收人留下两类公开记录"
        : mediaEligible
          ? `${witnesses.length}名见证者及其势力或商旅关系能够继续传话`
          : `只有${witnesses.length}名本地见证者，消息停留在口耳相传`,
    });
  } else {
    const media = mediaProfile(era, publicRegistry, valence);
    const editorialDecision = publicRegistry
      ? "公开登记含承办与验收两类记录，符合机构履历选稿线"
      : mediaEligible
        ? `${witnesses.length}名现场见证者且存在可追踪组织关系，按公共风险线刊发`
        : `仅有${witnesses.length}名现场见证者，缺少公开登记或可追踪组织关系，暂不跨地区刊发`;
    const mediaSpreadsAtOrdinal = createdOrdinal + localDelay + ({ 2: 7, 3: 3, 4: 2 } as const)[era];
    game.world.socialRumors.push({ ...baseRumor, mediaChannel: media.channel, mediaOutlet: media.outlet, editorialStance: media.stance, editorialDecision, mediaSpreadsAtOrdinal, secondaryMediaSpreadsAtOrdinal: mediaEligible && verificationStatus !== "同源多证待复核" ? mediaSpreadsAtOrdinal + ({ 2: 2, 3: 1, 4: 1 } as const)[era] : undefined, mediaStatus: mediaEligible ? "待刊发" : "不刊发", mediaVersions: [] });
  }
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
  for (const rumor of game.world.socialRumors.filter((item) => item.earlyCirculationStatus === "待扩散" && (item.earlyCirculationSpreadsAtOrdinal ?? Number.POSITIVE_INFINITY) <= currentOrdinal)) {
    rumor.earlyCirculationStatus = "已扩散";
    const channel = rumor.earlyCirculationChannel ?? "口耳传闻";
    const origin = locationById(rumor.locationId)?.name ?? game.view.location ?? "来源地不明";
    const factionNames = rumor.factionIds.map((id) => FACTIONS.find((faction) => faction.id === id)?.name).filter(Boolean);
    const coverage = channel === "商旅消息" ? `${origin}周边商路` : factionNames.length ? `${factionNames.join("、")}内部关系网` : `${origin}及邻近聚居地`;
    addNews(game, `${rumor.id}-circulation`, `${channel} · ${rumor.publicName}`, `${rumor.summary}。消息依据：${rumor.earlyCirculationBasis ?? "来源边界不明"}；可信度 ${rumor.confidence ?? 50}%；传递范围：${coverage}。传话、告示或势力通告都不等于事实已经最终核实。`);
    const recipients = Object.values(game.world.npcs).filter((npc) => npc.alive && !rumor.witnessNpcIds.includes(npc.id) && (rumor.factionIds.length === 0 ? npc.knownToPlayer : npc.factionIds.some((id) => rumor.factionIds.includes(id)))).slice(0, 20);
    for (const npc of recipients) {
      const text = `从${channel}获知（可信度${rumor.confidence ?? 50}%）：${rumor.summary}`;
      npc.memoryOfPlayer.push(text);
      npc.memoryOfPlayer = npc.memoryOfPlayer.slice(-12);
      npc.episodicMemory.push({ id: randomUUID(), text, year: game.view.worldTime?.year ?? 0, day: game.view.worldTime?.day ?? 1, actionIndex: game.actionIndex, significance: 1, source: "传闻传播", witnessed: false });
      npc.episodicMemory = npc.episodicMemory.slice(-24);
    }
    messages.push(`${channel} · ${rumor.publicName}`);
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
    if (game.view.era === 1) continue;
    const secondary = secondaryMediaProfile(game.view.era);
    const framing = rumor.valence > 0
      ? "转载原始登记与核验等级，不扩写未公开细节；重点追问履历对普通成员和当地资源的实际影响"
      : "保留原报道的质疑措辞，不把转述改写成定论；重点区分亲历证词、组织转述与仍未知部分";
    const version = { id: `${rumor.id}-secondary`, outlet: secondary.outlet, stance: secondary.stance, framing, confidence: Math.max(10, (rumor.confidence ?? 50) - 8), verificationStatus: "关联转载核验" as const, publishedOrdinal: currentOrdinal };
    rumor.mediaVersions ??= [];
    rumor.mediaVersions.push(version);
    recordMediaOutletReputation(game, { name: version.outlet, stance: version.stance, trustDelta: 1, publication: true, linkedReport: true, evidence: `${rumor.id}：明确关联${rumor.mediaOutlet ?? rumor.mediaChannel}并保留来源边界` });
    recordMediaCompetition(game, { primary: rumor.mediaOutlet ?? rumor.mediaChannel ?? "未名媒体", secondary: version.outlet, primaryDelta: 2, secondaryDelta: 1, newTopic: true, topicId: rumor.id, topic: rumor.summary, status: "首发竞争", evidence: `${rumor.id}：前者完成首发，后者透明关联转载且未扩写未知事实` });
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
  const template = pick(random, dynamicEventTemplatesForEra(game.view.era ?? 1, game.view.worldTime?.year ?? 0));
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

function createTalentThreatEvent(game: StoredGame, cycle: number, random: () => number): string | undefined {
  const risk = Number(game.world.flags.talentHostileRisk ?? 0);
  const stage = Number(game.world.flags.talentThreatStage ?? 0);
  if (risk < 3 || game.world.dynamicEvents.some((event) => event.status === "可介入" && event.id.startsWith("talent-threat-")) || random() > .08 + risk * .045) return undefined;
  const createdOrdinal = cycle * 30;
  const createdYear = Math.floor((createdOrdinal - 1) / DAYS_PER_YEAR);
  const createdDay = createdOrdinal - createdYear * DAYS_PER_YEAR;
  const escalation = stage >= 2 && risk >= 4;
  const characterName = game.view.character?.name ?? "这个孩子";
  const title = escalation ? "疑似敌对势力的袭击准备" : stage === 1 ? "住处附近出现的陌生盯梢者" : "有人私下查问觉醒名册";
  const detail = escalation
    ? `此前的查问与盯梢没有得到可控接触，身份不明者开始打听${characterName}的出行、护卫与猎魂安排。现有证据只能确认针对性准备，尚不能断言幕后势力；若继续放任，可能升级为绑架、途中伏击或暗杀。`
    : stage === 1
      ? `有人在住处、学院或训练场外反复打听${characterName}的作息与同行者。对方没有公开敌意，可能是招募前观察、情报收集，也可能在寻找保护漏洞。`
      : "多武魂与高魂力消息离开最初见证范围后，有陌生人通过学员家长、商户或外围人员查问姓名、住处和培养安排。消息来源尚未查清。";
  const id = `talent-threat-${stage}-${cycle}`;
  game.world.dynamicEvents.push({ id, title, kind: "人物", locationId: game.view.locationId ?? "notting-city", participantIds: [], detail, stakes: escalation ? 5 : 3 + Math.min(1, stage), status: "可介入", createdYear, createdDay, expiresOrdinal: createdOrdinal + 45 });
  game.view.tasks.push({ id, title, kind: "线索", detail: `${detail}可以调查消息来源、调整公开行程、寻找保护或布置反监视。`, status: "进行中", destinationId: game.view.locationId, deadline: "发现迹象后45日内" });
  game.world.flags.talentThreatStage = stage + 1;
  game.world.flags.talentThreatLastEvidence = title;
  addNews(game, id, title, detail, { year: createdYear, day: createdDay });
  return `新事件 · ${title}`;
}

function simulateNpcAutonomy(game: StoredGame, previousOrdinal: number, currentOrdinal: number): string[] {
  const messages: string[] = [];
  decayLocalConsequences(game, currentOrdinal);
  const startCycle = Math.floor(Math.max(previousOrdinal, game.world.lastAutonomyOrdinal) / 30) + 1;
  const endCycle = Math.floor(currentOrdinal / 30);
  const firstCycle = Math.max(startCycle, endCycle - 60);
  for (let cycle = firstCycle; cycle <= endCycle; cycle += 1) {
    for (const event of game.world.dynamicEvents) {
      if (event.status === "可介入" && event.expiresOrdinal < cycle * 30) {
        resolveExpiredDynamicEvent(game, event, cycle * 30);
      }
    }
    const random = createRandom(`${game.view.seed}:autonomy:${cycle}`);
    const talentThreat = createTalentThreatEvent(game, cycle, random);
    if (talentThreat) messages.push(talentThreat);
    const living = Object.values(game.world.npcs).filter((npc) => npc.alive);
    if (living.length < 2) continue;
    const actor = pick(random, living);
    const definition = characterById(actor.id);
    const cycleOrdinal = cycle * 30;
    if (!actor.activePlan || actor.activePlan.status === "完成" || actor.activePlan.deadlineOrdinal < cycleOrdinal) actor.activePlan = compileNpcPlan(game, actor, cycleOrdinal);
    const planStep = executeNpcPlanStep(game, actor, cycleOrdinal);
    const playerRelation = game.view.relations.find((item) => item.id === actor.id);
    if (actor.knownToPlayer && playerRelation && random() < 0.11 && !game.world.dynamicEvents.some((event) => event.status === "可介入" && event.participantIds.includes(actor.id))) {
      const attitude = actor.dispositionToPlayer + (playerRelation.dimensions?.trust ?? playerRelation.strength ?? 0);
      const title = attitude >= 35 ? `${actor.name}主动送来的请求` : attitude <= -10 ? `${actor.name}发出的警告` : `${actor.name}提出的试探`;
      const characterName = game.view.character?.name ?? "当事人";
      const detail = attitude >= 35
        ? `${actor.name}为了“${actor.activePlan?.desire ?? actor.currentGoal}”主动联系${characterName}，正在做“${planStep.action}”，并提出一项需要明确答复的协助。`
        : attitude <= -10
          ? `${actor.name}掌握了与${characterName}有关的部分消息，当前责任是“${actor.activePlan?.responsibility ?? "处理自身事务"}”，要求${characterName}停止继续触及其目标。`
          : `${actor.name}正在推进“${planStep.action}”，没有直接说明全部目的，只提出一次交易或见面，意在判断${characterName}是否值得合作。`;
      const createdOrdinal = cycle * 30;
      const createdYear = Math.floor((createdOrdinal - 1) / DAYS_PER_YEAR);
      const createdDay = createdOrdinal - createdYear * DAYS_PER_YEAR;
      const id = `initiative-${actor.id}-${cycle}`;
      game.world.dynamicEvents.push({ id, title, kind: "人物", locationId: actor.locationId, participantIds: [actor.id], detail, stakes: Math.max(2, Math.min(5, definition?.importance ?? 2)), status: "可介入", createdYear, createdDay, expiresOrdinal: createdOrdinal + 45 });
      game.view.tasks.push({ id, title, kind: "线索", detail: `${detail}可以接受、追问，也可以当面拒绝。`, status: "进行中", destinationId: actor.locationId });
      addNews(game, id, title, detail, { year: createdYear, day: createdDay });
    }
    const candidates = living.filter((npc) => npc.id !== actor.id && (npc.locationId === actor.locationId || actor.factionIds.some((id) => npc.factionIds.includes(id)) || npcHasPlayerInfluence(game, npc.id)));
    if (!candidates.length) continue;
    const other = pick(random, candidates);
    const sharedFaction = actor.factionIds.some((id) => other.factionIds.includes(id));
    const sameLocation = actor.locationId === other.locationId;
    const alignedPlans = Boolean(actor.activePlan && other.activePlan && (actor.activePlan.targetLocationId === other.activePlan.targetLocationId || actor.activePlan.responsibility === other.activePlan.responsibility));
    const delta = sharedFaction || alignedPlans ? integer(random, 2, 8) : sameLocation ? integer(random, -5, 5) : integer(random, -3, 3);
    const factionName = FACTIONS.find((faction) => actor.factionIds.includes(faction.id) && other.factionIds.includes(faction.id))?.name;
    const reason = sharedFaction
      ? `两人在${factionName ?? "同一势力"}的事务中${delta >= 0 ? `围绕“${actor.activePlan?.nextAction ?? actor.currentGoal}”有过配合` : "发生了利益分歧"}`
      : sameLocation
        ? `两人在${locationById(actor.locationId)?.name ?? "同一地点"}推进各自计划时${delta >= 0 ? "互相提供了帮助" : "因资源、权限或目标先后产生冲突"}`
        : `${game.view.character?.name ?? "当事人"}此前造成的变化让两人的利益发生交集`;
    updateNpcRelation(game, actor.id, other.id, delta, game.view.worldTime?.year ?? 0, game.view.worldTime?.day ?? 1, reason);
    const createdEvent = createDynamicEvent(game, cycle, random);
    if (createdEvent) messages.push(`新事件 · ${createdEvent}`);
  }
  for (const event of game.world.dynamicEvents) {
    if (event.status !== "可介入" || event.expiresOrdinal >= currentOrdinal) continue;
    resolveExpiredDynamicEvent(game, event, currentOrdinal);
    if (event.locationId === game.view.locationId) messages.push(`错过事件 · ${event.title}`);
  }
  if (game.world.dynamicEvents.length > 120) game.world.dynamicEvents = game.world.dynamicEvents.filter((event) => event.status === "可介入").concat(game.world.dynamicEvents.filter((event) => event.status !== "可介入").slice(-80));
  if (game.view.tasks.length > 80) {
    const protectedTasks = game.view.tasks.filter((task) => task.id === "life-goal" || task.status === "进行中");
    game.view.tasks = [...protectedTasks, ...game.view.tasks.filter((task) => !protectedTasks.includes(task)).slice(-40)].slice(-80);
  }
  game.world.lastAutonomyOrdinal = currentOrdinal;
  const currentEventMessages = buildActiveEvents(game).map((event) => `新事件 · ${event.title}`);
  return [...messages.filter((message) => !message.startsWith("新事件 ·")), ...currentEventMessages];
}

type CanonEvent = (typeof CANON_EVENTS)[number];

function dateAtOrdinal(value: number): { year: number; day: number } {
  const year = Math.floor((value - 1) / DAYS_PER_YEAR);
  return { year, day: value - year * DAYS_PER_YEAR };
}

function canonEventObservable(game: StoredGame, event: CanonEvent, causes: HiddenWorldState["canonCausalFootprints"]): boolean {
  const atScene = Boolean(event.locationId && event.locationId === game.view.locationId);
  const directlyInfluenced = causes.some((cause) => cause.affectedNpcIds.some((id) => event.participantIds.includes(id)) || cause.locationId === event.locationId);
  const hasEventIntel = game.world.intelligenceRecords.some((record) => record.subjectType === "事件" && (record.subjectId === event.id || `${record.title}${record.detail}`.includes(event.title)) && record.confidence >= 60);
  const visibility = event.visibility ?? "地方";
  return visibility === "公开" || hasEventIntel || (visibility === "地方" && atScene) || (visibility === "秘密" && atScene && directlyInfluenced);
}

function eventParticipantFactions(game: StoredGame, event: CanonEvent): Set<string> {
  return new Set(event.participantIds.flatMap((id) => [...(game.world.npcs[id]?.factionIds ?? []), ...canonicalFactionIdsAtDate(id, event.year, event.day ?? 1)]));
}

function causeTargetsEvent(game: StoredGame, cause: CanonCausalFootprint, event: CanonEvent, eventOrdinal: number): boolean {
  if (effectiveCauseStrength(cause, eventOrdinal) < .5) return false;
  const createdOrdinal = ordinal(cause.atYear, cause.atDay);
  const gap = eventOrdinal - createdOrdinal;
  const sharedNpcCount = cause.affectedNpcIds.filter((id) => event.participantIds.includes(id)).length;
  if (cause.originEventId) {
    const origin = CANON_EVENTS.find((item) => item.id === cause.originEventId);
    if (!origin || gap > 3 * DAYS_PER_YEAR) return false;
    const originSharedCount = origin.participantIds.filter((id) => event.participantIds.includes(id)).length;
    if (originSharedCount >= 2 || (origin.participantIds.length <= 2 && originSharedCount >= 1 && gap <= 2 * DAYS_PER_YEAR)) return true;
    if (origin.locationId && origin.locationId === event.locationId && gap <= 180) return true;
    return causeHasDomain(cause, "faction", "institution") && cause.affectedFactionIds.some((id) => eventParticipantFactions(game, event).has(id)) && gap <= 2 * DAYS_PER_YEAR;
  }
  if (sharedNpcCount > 0) return true;
  if (causeHasDomain(cause, "faction", "institution", "resource") && cause.affectedFactionIds.some((id) => eventParticipantFactions(game, event).has(id))) return true;
  return Boolean(event.locationId && cause.locationId === event.locationId && gap <= 180 && causeHasDomain(cause, "location", "resource", "institution"));
}

function linkedCausesForEvent(game: StoredGame, event: CanonEvent, eventOrdinal: number): Array<{ cause: CanonCausalFootprint; strength: number }> {
  return game.world.canonCausalFootprints.map((cause) => ({ cause, strength: effectiveCauseStrength(cause, eventOrdinal) })).filter((item) => item.strength >= .5 && causeTargetsEvent(game, item.cause, event, eventOrdinal));
}

function combinedCausalStrength(linked: Array<{ cause: CanonCausalFootprint; strength: number }>): number {
  const strengths = linked.map((item) => item.strength).sort((left, right) => right - left);
  return strengths.length ? strengths[0] + strengths.slice(1).reduce((sum, value) => sum + value * .25, 0) : 0;
}

function appendBranchPropagation(game: StoredGame, event: CanonEvent, branch: HiddenWorldState["canonTimelineBranches"][number], strength: number): void {
  const at = dateAtOrdinal(branch.resolveOrdinal);
  const sourceCauses = game.world.canonCausalFootprints.filter((cause) => branch.causeIds.includes(cause.id));
  const domains = [...new Set<CanonCausalDomain>(sourceCauses.flatMap((cause) => cause.domains ?? inferCausalDomains(cause.source, cause.description)).concat(["goal", "relationship"]))];
  const propagatedStrength = Math.max(1, strength * .45);
  game.world.canonCausalFootprints.push({
    id: `branch-cause-${branch.id}`,
    source: "历史分支结算",
    description: `${game.view.character?.name ?? "当事人"}此前造成的变化已经沿相关人物、势力与资源条件继续扩散`,
    atYear: at.year,
    atDay: at.day,
    locationId: event.locationId ?? game.world.npcs[event.participantIds[0]]?.locationId ?? game.view.locationId ?? "notting-city",
    affectedNpcIds: [...branch.affectedNpcIds],
    affectedFactionIds: [...branch.affectedFactionIds],
    strength: propagatedStrength,
    domains,
    expiresOrdinal: causalExpiry(branch.resolveOrdinal, domains),
    originEventId: event.id,
    propagationDepth: Math.max(0, ...sourceCauses.map((cause) => cause.propagationDepth ?? 0)) + 1,
  });
  game.world.canonCausalFootprints = game.world.canonCausalFootprints.slice(-120);
}

function settleCanonTimelineBranch(game: StoredGame, branch: HiddenWorldState["canonTimelineBranches"][number], event: CanonEvent, messages: string[]): void {
  if (branch.status === "已结算") return;
  const linked = linkedCausesForEvent(game, event, branch.resolveOrdinal);
  const causes = linked.map((item) => item.cause);
  const causalStrength = combinedCausalStrength(linked);
  const livingParticipants = event.participantIds.filter((id) => game.world.npcs[id]?.alive);
  const resistance = event.inertia * 8 * ({ 爽: .8, 简单: .9, 标准: 1, 困难: 1.15, 地狱: 1.3 }[game.view.difficulty]);
  if (branch.state === "延后") {
    const missingCritical = !game.world.npcs[event.participantIds[0]]?.alive || livingParticipants.length < Math.ceil(event.participantIds.length / 2);
    const factionRedirected = linked.some((item) => item.strength >= resistance * .5 && causeHasDomain(item.cause, "faction", "institution"));
    if (missingCritical) branch.state = "取消";
    else if (causalStrength >= resistance * 1.6 || factionRedirected) branch.state = "替代";
    else if (causalStrength >= resistance) {
      if ((branch.recheckCount ?? 0) < 2) {
        branch.recheckCount = (branch.recheckCount ?? 0) + 1;
        branch.resolveOrdinal += Math.max(30, Math.min(120, Math.round(event.inertia * 12 + causalStrength / 3)));
        branch.causeIds = causes.map((cause) => cause.id);
        branch.summary = `延后节点在新日期复核后仍缺少稳定条件，等待第${branch.recheckCount + 1}次结算`;
        return;
      }
      branch.state = "替代";
    }
  }
  const locationId = event.locationId ?? game.world.npcs[livingParticipants[0]]?.locationId ?? game.view.locationId ?? "notting-city";
  const at = dateAtOrdinal(branch.resolveOrdinal);
  const replacementEventId = `${event.id}-branch-${branch.state}`;
  const observable = canonEventObservable(game, event, causes);
  const stateDetail = branch.state === "延后"
    ? `原定节点没有按旧日期发生。相关人物在玩家已经改变的条件下重新组织行动，事件延后至原作${at.year}年第${at.day}日，并保留继续变化的可能。`
    : branch.state === "替代"
      ? "原有参与条件已经不足，相关人物与势力围绕新的利益和资源关系形成了替代行动。替代行动不继承原事件的固定结果。"
      : "关键参与者、地点或组织条件已经失效，原定事件被取消；留下的资源空缺、责任和敌意会由仍在场的人重新争夺。";
  branch.status = "已结算";
  branch.replacementEventId = replacementEventId;
  branch.summary = stateDetail;
  if (branch.state === "延后") {
    game.world.suppressedCanonEvents = game.world.suppressedCanonEvents.filter((id) => id !== event.id);
    if (!game.world.firedCanonEvents.includes(event.id)) game.world.firedCanonEvents.push(event.id);
    applyFactionJoinsForEvent(game, event.id);
  }
  if (!game.world.dynamicEvents.some((item) => item.id === replacementEventId)) {
    const title = branch.state === "延后" ? `${event.title}在新条件下发生` : branch.state === "替代" ? `${event.title}引出的替代局势` : `${event.title}取消后的局势重组`;
    game.world.dynamicEvents.push({ id: replacementEventId, title, kind: "历史前兆", locationId, participantIds: livingParticipants, detail: stateDetail, stakes: Math.max(3, event.inertia), status: "可介入", createdYear: at.year, createdDay: at.day, expiresOrdinal: branch.resolveOrdinal + 60 });
  }
  for (const id of livingParticipants) {
    const npc = game.world.npcs[id];
    npc.currentGoal = observable
      ? branch.state === "延后" ? `处理“${event.title}”延后后重新形成的现实条件` : `应对“${event.title}”未按原轨迹发生后的利益、责任与关系变化`
      : branch.state === "延后" ? "处理近期计划延后后重新形成的现实条件" : "应对近期计划失效后的利益、责任与关系变化";
    delete npc.activePlan;
  }
  appendBranchPropagation(game, event, branch, causalStrength);
  game.world.metrics.historicalImpact += event.inertia * (branch.state === "延后" ? 2 : 3);
  if (observable) {
    const label = branch.state === "延后" ? "发生时间改变" : branch.state === "替代" ? "出现替代走向" : "原定节点取消";
    addNews(game, replacementEventId, `${event.title}：${label}`, stateDetail, at);
    const knownPeople = livingParticipants.map((id) => game.world.npcs[id]).filter((npc) => npc?.knownToPlayer).map((npc) => npc.name);
    const knownFactions = branch.affectedFactionIds.map((id) => FACTIONS.find((item) => item.id === id)).filter((faction) => faction && (game.view.affiliations.some((item) => item.id === faction.id) || livingParticipants.some((npcId) => game.world.npcs[npcId]?.knownToPlayer && game.world.npcs[npcId]?.factionIds.includes(faction.id)) || game.world.intelligenceRecords.some((record) => record.subjectType === "势力" && record.subjectId === faction.id && record.confidence >= 60))).map((faction) => faction!.name);
    game.view.canonInfluences.unshift({ id: `branch-cause-${branch.id}`, action: `${event.title}${label}`, affects: [...knownPeople, ...knownFactions].join("、") || "相关地区", strength: "已形成历史分支", date: `原作 ${at.year >= 0 ? "+" : ""}${at.year} 年 · 第 ${at.day} 日` });
    game.view.canonInfluences = game.view.canonInfluences.slice(0, 24);
    messages.push(`历史分支 · ${event.title} · ${branch.state}`);
  }
}

function settlePendingCanonBranches(game: StoredGame, throughOrdinal: number, messages: string[]): void {
  for (const branch of game.world.canonTimelineBranches.filter((item) => item.status === "待结算" && item.resolveOrdinal <= throughOrdinal).sort((left, right) => left.resolveOrdinal - right.resolveOrdinal)) {
    const event = CANON_EVENTS.find((item) => item.id === branch.eventId);
    if (event) {
      settleCanonTimelineBranch(game, branch, event, messages);
      const replacement = game.world.dynamicEvents.find((item) => item.id === branch.replacementEventId && item.status === "可介入");
      if (replacement && replacement.expiresOrdinal < throughOrdinal) resolveExpiredDynamicEvent(game, replacement, throughOrdinal);
    }
    else branch.status = "已结算";
  }
}

function simulateCanonEvents(game: StoredGame, previousOrdinal: number, currentOrdinal: number): string[] {
  const messages: string[] = [];
  const events = CANON_EVENTS.filter((event) => { const at = ordinal(event.year, event.day ?? 1); return at >= previousOrdinal && at <= currentOrdinal; }).sort((left, right) => ordinal(left.year, left.day ?? 1) - ordinal(right.year, right.day ?? 1));
  for (const event of events) {
    const eventOrdinal = ordinal(event.year, event.day ?? 1);
    settlePendingCanonBranches(game, eventOrdinal, messages);
    if (game.world.firedCanonEvents.includes(event.id) || game.world.suppressedCanonEvents.includes(event.id)) continue;
    const participantFactions = eventParticipantFactions(game, event);
    const linked = linkedCausesForEvent(game, event, eventOrdinal);
    const linkedCauses = linked.map((item) => item.cause);
    const causalStrength = combinedCausalStrength(linked);
    const difficultyResistance = { 爽: .8, 简单: .9, 标准: 1, 困难: 1.15, 地狱: 1.3 }[game.view.difficulty];
    const resistance = event.inertia * 8 * difficultyResistance;
    if (causalStrength >= resistance) {
      game.world.suppressedCanonEvents.push(event.id);
      const livingCount = event.participantIds.filter((id) => game.world.npcs[id]?.alive).length;
      const missingCritical = !game.world.npcs[event.participantIds[0]]?.alive || livingCount < Math.ceil(event.participantIds.length / 2);
      const factionRedirected = linked.some((item) => item.strength >= resistance * .5 && causeHasDomain(item.cause, "faction", "institution"));
      const state = missingCritical ? "取消" as const : causalStrength >= resistance * 1.6 || factionRedirected ? "替代" as const : "延后" as const;
      const delayDays = state === "延后" ? Math.max(30, Math.min(180, Math.round(event.inertia * 18 + causalStrength / 2))) : 0;
      const branch = {
        id: `branch-${event.id}-${game.world.canonTimelineBranches.length}`,
        eventId: event.id,
        state,
        originalYear: event.year,
        originalDay: event.day ?? 1,
        resolveOrdinal: eventOrdinal + delayDays,
        causeIds: linkedCauses.map((cause) => cause.id),
        affectedNpcIds: [...event.participantIds],
        affectedFactionIds: [...participantFactions],
        summary: "等待新条件结算",
        status: "待结算" as const,
      };
      game.world.canonTimelineBranches.push(branch);
      game.world.canonTimelineBranches = game.world.canonTimelineBranches.slice(-120);
      if (state !== "延后") settleCanonTimelineBranch(game, branch, event, messages);
      continue;
    }
    game.world.firedCanonEvents.push(event.id);
    applyFactionJoinsForEvent(game, event.id);
    for (const participantId of event.participantIds) {
      const npc = game.world.npcs[participantId];
      if (npc && event.locationId) npc.locationId = event.locationId;
    }
    if (canonEventObservable(game, event, linkedCauses)) {
      const detail = causalStrength > 0 ? `${event.publicSummary}${game.view.character?.name ?? "当事人"}此前造成的影响改变了部分参与条件，但尚未越过该节点的原著惯性。` : event.publicSummary;
      addNews(game, event.id, event.title, detail);
      messages.push(`${(event.visibility ?? "地方") === "公开" ? "消息" : event.visibility === "秘密" ? "亲历" : "传闻"} · ${event.title}`);
    }
  }
  settlePendingCanonBranches(game, currentOrdinal, messages);
  return messages;
}

function simulateNpcYears(game: StoredGame, year: number): void {
  const atOrdinal = ordinal(year, 1);
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
    const activeCauses = game.world.canonCausalFootprints.filter((cause) => cause.affectedNpcIds.includes(npc.id) && effectiveCauseStrength(cause, atOrdinal) >= 5);
    const survivalAltered = activeCauses.some((cause) => causeHasDomain(cause, "survival"));
    const powerAltered = activeCauses.some((cause) => causeHasDomain(cause, "power"));
    if (definition.deathYear !== undefined && year >= definition.deathYear && !survivalAltered) {
      npc.alive = false;
      npc.currentGoal = "已死亡";
      npc.lastSimulatedYear = year;
      continue;
    }
    if (definition.birthYear !== undefined && npc.currentGoal === "尚未出生" && year >= definition.birthYear) {
      npc.alive = true;
      npc.age = year - definition.birthYear;
      npc.locationId = canonicalLocationAtYear(npc.id, year);
      npc.name = characterPublicNameAtDate(npc.id, year, 1);
      npc.currentGoal = characterCurrentGoalAtDate(npc.id, year, 1);
    }
    if (!npc.alive) { npc.lastSimulatedYear = year; continue; }
    if (year > npc.lastSimulatedYear && npc.memoryOfPlayer.length > 6) {
      const memoryRandom = createRandom(`${game.view.seed}:npc-memory:${npc.id}:${year}`);
      npc.memoryOfPlayer = npc.memoryOfPlayer.filter((memory, index) => /救命|死亡|背叛|承诺|师徒|亲属|袭击|秘密|复生/.test(memory) || index >= npc.memoryOfPlayer.length - 4 || memoryRandom() > .38).slice(-12);
    }
    if (powerAltered) {
      const elapsedYears = Math.max(0, year - npc.lastSimulatedYear);
      if (npc.soulRank !== undefined && elapsedYears > 0) npc.soulRank = Math.min(99, npc.soulRank + elapsedYears * (npc.soulRank < 30 ? 3 : npc.soulRank < 60 ? 2 : 1));
      npc.powerTier = npc.soulRank === undefined ? "实力路线已偏转，当前未核实" : tierForRank(npc.soulRank);
    } else {
      const power = powerAtYear(npc.id, year);
      npc.soulRank = power.soulRank;
      npc.powerTier = power.tier;
    }
    npc.age = definition.birthYear === undefined ? npc.age : Math.max(0, year - definition.birthYear);
    npc.lastSimulatedYear = year;
  }
}

export function advanceWorldTime(game: StoredGame, minutes: number): string[] {
  const time = game.view.worldTime;
  if (!time) return [];
  const previousOrdinal = ordinal(time.year, time.day);
  const previousYear = time.year;
  const [hours, minute] = time.time.split(":").map(Number);
  const total = hours * 60 + minute + minutes;
  const elapsedDays = Math.floor(total / 1440);
  const minuteOfDay = total % 1440;
  const currentOrdinal = previousOrdinal + elapsedDays;
  const targetDate = dateAtOrdinal(currentOrdinal);
  const messages: string[] = [];
  const setDate = (value: number) => {
    const date = dateAtOrdinal(value);
    time.year = date.year;
    time.day = date.day;
    time.season = seasonForDay(date.day);
    time.era = eraAtYear(date.year);
  };
  setDate(previousOrdinal);
  messages.push(...simulateCanonEvents(game, previousOrdinal, previousOrdinal));
  reconcileTimedFactionMemberships(game, time.year, time.day);
  ensureCanonRelationshipBaselines(game.world.npcs, game.world.npcRelations, time.year, time.day, game.world.suppressedCanonEvents);
  let cursor = previousOrdinal;
  while (cursor < currentOrdinal) {
    const cursorDate = dateAtOrdinal(cursor);
    const nextYearOrdinal = ordinal(cursorDate.year + 1, 1);
    const nextCycleOrdinal = (Math.floor(cursor / 30) + 1) * 30;
    const nextCanonOrdinal = Math.min(...CANON_EVENTS.map((event) => ordinal(event.year, event.day ?? 1)).filter((value) => value > cursor && value <= currentOrdinal), Number.POSITIVE_INFINITY);
    const nextBranchOrdinal = Math.min(...game.world.canonTimelineBranches.filter((branch) => branch.status === "待结算" && branch.resolveOrdinal > cursor && branch.resolveOrdinal <= currentOrdinal).map((branch) => branch.resolveOrdinal), Number.POSITIVE_INFINITY);
    const boundary = Math.min(currentOrdinal, nextYearOrdinal, nextCycleOrdinal, nextCanonOrdinal, nextBranchOrdinal);
    setDate(boundary);
    if (time.year > cursorDate.year) simulateNpcYears(game, time.year);
    messages.push(...simulateCanonEvents(game, cursor + 1, boundary));
    reconcileTimedFactionMemberships(game, time.year, time.day);
    ensureCanonRelationshipBaselines(game.world.npcs, game.world.npcRelations, time.year, time.day, game.world.suppressedCanonEvents);
    ensureNpcPlans(game);
    messages.push(...simulateNpcAutonomy(game, cursor, boundary));
    messages.push(...propagateSocialRumors(game, boundary));
    cursor = boundary;
  }
  setDate(currentOrdinal);
  if (game.view.character) game.view.character.age += Math.max(0, targetDate.year - previousYear);
  time.time = `${Math.floor(minuteOfDay / 60).toString().padStart(2, "0")}:${(minuteOfDay % 60).toString().padStart(2, "0")}`;
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
  const hasReliableIntel = game.world.intelligenceRecords.some((record) => record.subjectType === "人物" && record.subjectId === npcId && record.confidence >= 60);
  const hasDirectCausalContact = game.world.canonCausalFootprints.some((cause) => cause.source !== "历史分支结算" && cause.affectedNpcIds.includes(npcId) && game.view.canonInfluences.some((item) => item.id === cause.id));
  const isVisibleEventParticipant = game.world.dynamicEvents.some((event) => event.status === "可介入" && event.participantIds.includes(npcId) && event.locationId === game.view.locationId);
  if (!characterPubliclyActiveAtDate(npcId, game.view.worldTime?.year ?? 0, game.view.worldTime?.day ?? 1) && !hasReliableIntel && !hasDirectCausalContact && !isVisibleEventParticipant) return false;
  if (npc.knownToPlayer || !definition.hidden || npc.name !== definition.name) return true;
  return hasReliableIntel || hasDirectCausalContact || isVisibleEventParticipant;
}

export function revealNpc(game: StoredGame, npcId: string): boolean {
  const npc = game.world.npcs[npcId];
  if (!npc || !canDiscoverNpc(game, npcId)) return false;
  npc.knownToPlayer = true;
  game.view.knownFigures = buildKnownFigures(game);
  return true;
}

function repairLegacyUnboundAwakening(game: StoredGame): void {
  const character = game.view.character;
  if (!character) return;
  const pronoun = character.gender === "女" ? "她" : "他";
  const prelude = game.view.narrative.find((entry) => entry.kind === "narration" && /昨夜，.+还不属于这片大陆/.test(entry.text) && entry.text.includes("巡查执事允许"));
  if (prelude) prelude.text = [
    `天亮以后，一支挂着武魂殿铜牌的车队停在荒道边。带队执事正催车夫赶去下一个村子，忽然看见路旁站着个衣着古怪的孩子。`,
    `${character.name}低头看过自己的手。身体只有六岁，记忆却仍属于另一个世界；昨夜一起落在荒地上的，除了一身旧衣，再没有别的东西。`,
    `“名字？”执事问。${character.name}只答得出这一个问题。${pronoun}的目光越过车辕，落在箱子里露出一角的六块黑石上。`,
    `执事盯了${pronoun}片刻，把名册翻到末页：“跟上。到了村里站最后一个。测完以后，你得把来处重新说一遍。”`,
  ].join("\n\n");
  const awakening = game.view.narrative.find((entry) => entry.kind === "narration" && entry.text.includes("公共觉醒队继续赶路，围观者很快散去") && entry.text.includes("先天满魂力"));
  if (!awakening) return;
  const souls = character.martialSouls?.length ? character.martialSouls : [character.martialSoul];
  const soulReveal = souls.map((soul, index) => index === 0
    ? `${pronoun}摊开手，${soul.name}托在掌心。执事俯身察看形态，让记录员把轮廓一笔笔画下来。`
    : `阵光本该散去，${soul.name}却紧跟着显形。执事猛地抬头，刚写下的一行字被当场划掉。`).join("\n\n");
  awakening.text = [
    `${character.name}踩进六角阵。金色光点贴着小腿往上钻，麻痒一路爬到肩头。右手骤然一沉，${pronoun}险些把胳膊甩出阵外。`,
    soulReveal,
    `手掌贴上水晶球，白光猛地冲到顶端。执事把水晶抽走，又从箱底取出备用的一颗。第二次，光仍旧一分不少。\n\n“先天满魂力。”他念出这五个字时，门口先静了一瞬，紧接着便炸开了低语。有人踮脚往阵里看，有人拉住自家孩子，追问刚才究竟觉醒了什么。`,
    `执事啪地合上名册，叫助手拦住正在收阵石的人。\n\n“队伍晚走半个时辰。先给这孩子拿水和吃的。”他又点了个人骑马回分殿报信，“把里正也请来，来历和安置分开办。”`,
    `他把一张临时通行条压在桌上：“今晚以前，你至少不会再睡荒地。身份怎么登记、由谁培养，等分殿的人来了再谈。”原本几分钟便能结束的仪式就此停住，门外的队伍和屋里的安排全被改了。`,
  ].join("\n\n");
}

export function ensureGameState(game: StoredGame): StoredGame {
  const legacy = game as StoredGame & { schemaVersion?: number; world?: HiddenWorldState };
  const previousSchemaVersion = legacy.schemaVersion ?? 1;
  const migrateNarrative = (legacy.schemaVersion ?? 1) < 4;
  const legacyLocationNames: Record<string, string> = {
    "哈根城": "西鲁城",
    "天魂城": "天斗城",
    "天斗城（天魂帝国时期）": "天斗城",
    "斗灵城": "斗灵帝国首都",
    "海外星罗城": "星罗城（星罗大陆）",
    "海外斗灵城": "斗灵帝国首都（斗灵大陆）",
    "联邦明都": "明都（联邦时期）",
    "星斗大森林保护区": "星斗大森林核心圈",
    "联邦母舰港": "联邦舰队集结基地",
    "武魂城裁决地牢": "武魂城秘密羁押区",
    "象甲宗山城": "象甲宗驻地",
    "圣龙宗白甲山门": "圣龙宗驻地",
    "天斗南部清河水宗": "清河水宗驻地",
  };
  if (previousSchemaVersion < 33) {
    if (game.view.locationId === "heavenly-soul-city") game.view.locationId = "heaven-dou-city";
    if (game.view.location && legacyLocationNames[game.view.location]) game.view.location = legacyLocationNames[game.view.location];
    for (const publicCandidate of game.view.candidates ?? []) {
      if (publicCandidate.locationId === "heavenly-soul-city") publicCandidate.locationId = "heaven-dou-city";
      if (legacyLocationNames[publicCandidate.location]) publicCandidate.location = legacyLocationNames[publicCandidate.location];
    }
    for (const hidden of game.hiddenCandidates ?? []) {
      if (hidden.public.locationId === "heavenly-soul-city") hidden.public.locationId = "heaven-dou-city";
      if (legacyLocationNames[hidden.public.location]) hidden.public.location = legacyLocationNames[hidden.public.location];
    }
  }
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
  legacy.schemaVersion = 46;
  legacy.revision ??= 0;
  legacy.world ??= createHiddenWorld(startYear, locationId);
  legacy.world.discoveredLocations ??= [locationId];
  legacy.world.dynamicEvents ??= [];
  legacy.world.localConsequences ??= [];
  if (previousSchemaVersion < 33) {
    legacy.world.discoveredLocations = legacy.world.discoveredLocations.map((id) => id === "heavenly-soul-city" ? "heaven-dou-city" : id);
    for (const npc of Object.values(legacy.world.npcs)) if (npc.locationId === "heavenly-soul-city") npc.locationId = "heaven-dou-city";
    for (const event of legacy.world.dynamicEvents ?? []) if (event.locationId === "heavenly-soul-city") event.locationId = "heaven-dou-city";
    for (const consequence of legacy.world.localConsequences ?? []) if (consequence.locationId === "heavenly-soul-city") consequence.locationId = "heaven-dou-city";
    for (const task of game.view.tasks ?? []) if (task.destinationId === "heavenly-soul-city") task.destinationId = "heaven-dou-city";
  }
  legacy.world.npcRelations ??= [];
  if (previousSchemaVersion < 35) legacy.world.npcRelations = legacy.world.npcRelations.filter((relation) => !relation.history?.length || !relation.history.every((item) => item.delta === 0 && item.reason.startsWith("原著关系基线：")));
  ensureCanonRelationshipBaselines(legacy.world.npcs, legacy.world.npcRelations, game.view.worldTime?.year ?? startYear, game.view.worldTime?.day ?? 1, legacy.world.suppressedCanonEvents);
  legacy.world.canonCausalFootprints ??= [];
  for (const cause of legacy.world.canonCausalFootprints) {
    cause.domains ??= inferCausalDomains(cause.source, cause.description);
    cause.expiresOrdinal ??= causalExpiry(ordinal(cause.atYear, cause.atDay), cause.domains);
    cause.propagationDepth ??= cause.originEventId ? 1 : 0;
  }
  legacy.world.canonTimelineBranches ??= [];
  legacy.world.firedCanonEvents ??= [];
  legacy.world.suppressedCanonEvents ??= [];
  legacy.world.dynamicEvents ??= [];
  legacy.world.localConsequences ??= [];
  legacy.world.socialRumors ??= [];
  for (const rumor of legacy.world.socialRumors) {
    rumor.confidence ??= rumor.witnessNpcIds.length ? Math.min(85, 35 + rumor.witnessNpcIds.length * 7) : 92;
    rumor.sourceKind ??= rumor.witnessNpcIds.length ? "现场目击" : "公开登记";
    rumor.corroborationCount ??= rumor.sourceKind === "公开登记" ? 2 : rumor.witnessNpcIds.length;
    if (game.view.era === 1) {
      const wasDistributed = rumor.mediaStatus === "已刊发" || rumor.mediaStatus === "已更正";
      const wasPending = rumor.mediaStatus === "待刊发";
      rumor.earlyCirculationChannel ??= rumor.sourceKind === "公开登记" ? (rumor.factionIds.length ? "势力通告" : "地方告示") : rumor.witnessNpcIds.length >= 3 && rumor.factionIds.length ? "商旅消息" : "口耳传闻";
      rumor.earlyCirculationStatus ??= wasDistributed ? "已扩散" : wasPending ? "待扩散" : "仅本地";
      rumor.earlyCirculationSpreadsAtOrdinal ??= wasPending ? rumor.mediaSpreadsAtOrdinal : undefined;
      rumor.earlyCirculationBasis ??= rumor.sourceKind === "公开登记" ? "旧存档中的承办与验收记录" : `${rumor.witnessNpcIds.length}名现场见证者留下的转述链`;
      rumor.verificationStatus ??= rumor.sourceKind === "公开登记" ? "双记录核验" : rumor.witnessNpcIds.length >= 5 && rumor.factionIds.length >= 2 ? "跨关系网交叉核验" : "来源不足";
      delete rumor.mediaChannel;
      delete rumor.mediaOutlet;
      delete rumor.editorialStance;
      delete rumor.editorialDecision;
      delete rumor.mediaSpreadsAtOrdinal;
      delete rumor.secondaryMediaSpreadsAtOrdinal;
      delete rumor.mediaStatus;
      delete rumor.mediaVersions;
    } else {
      rumor.mediaStatus ??= "不刊发";
      const profile = mediaProfile(game.view.era, rumor.sourceKind === "公开登记", rumor.valence);
      rumor.mediaChannel ??= profile.channel;
      rumor.mediaOutlet ??= profile.outlet;
      rumor.editorialStance ??= profile.stance;
      rumor.verificationStatus ??= rumor.sourceKind === "公开登记" ? "双记录核验" : rumor.witnessNpcIds.length >= 5 && rumor.factionIds.length >= 2 ? "跨关系网交叉核验" : rumor.mediaStatus === "不刊发" ? "来源不足" : "同源多证待复核";
      rumor.editorialDecision ??= rumor.mediaStatus === "不刊发" ? "旧记录缺少跨地区刊发所需来源" : "旧记录按当时已有来源刊发";
      rumor.mediaVersions ??= [];
    }
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
  game.view.mediaAlliances ??= [];
  if (game.view.era === 1) {
    game.view.mediaOutlets = [];
    game.view.mediaCompetitions = [];
    game.view.mediaAlliances = [];
    if (previousSchemaVersion < 27) {
      game.view.news = game.view.news.map((item) => /(?:-media|-secondary|-correction)$/.test(item.id)
        ? { ...item, title: "旧版传播记录已校正", detail: "这条旧存档记录曾误用后世新闻机构结构，现只保留为来源边界不明的历史传播痕迹，不再证明斗一存在记者、编辑部或媒体联盟。" }
        : item);
    }
  }
  for (const alliance of game.view.mediaAlliances) {
    alliance.recoveryEvidence ??= [];
    alliance.suspendedOutletNames ??= [];
    alliance.probationVerificationsRemaining ??= 0;
    alliance.resourceRefillCount ??= 0;
    alliance.membershipApplications ??= [];
    alliance.minimumMembers ??= alliance.outlets.length >= 3 ? 3 : 2;
    alliance.departures ??= [];
  }
  if (missingMediaCompetitions) {
    for (const rumor of legacy.world.socialRumors) {
      for (const version of rumor.mediaVersions ?? []) {
        const corrected = version.verificationStatus === "更正证据已核验";
        recordMediaCompetition(game, { primary: rumor.mediaOutlet ?? rumor.mediaChannel ?? "未名媒体", secondary: version.outlet, primaryDelta: corrected ? -2 : 2, secondaryDelta: corrected ? 2 : 1, newTopic: true, topicId: rumor.id, topic: rumor.summary, status: corrected ? "更正问责" : "首发竞争", evidence: `${rumor.id}：由旧存档中的关联报道${corrected ? "及更正责任" : ""}重建竞争记录` });
      }
    }
  }
  for (const competition of game.view.mediaCompetitions) competition.topics ??= [];
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
  game.view.inventory ??= [];
  game.view.inventory = game.view.inventory.map((item) => item === "止血散" ? "外敷伤药" : item);
  game.view.inventoryLoad ??= { used: game.view.inventory.length, capacity: 18, state: "轻便", storage: [] };
  game.view.inventoryLoad.storage ??= [];
  game.view.inventoryLoad.storage = game.view.inventoryLoad.storage.map((item) => item === "止血散" ? "外敷伤药" : item);
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
  if (previousSchemaVersion < 39 && game.view.character) {
    const character = game.view.character;
    const originText = `${character.originName}${character.originSummary}${character.originBurden}`;
    const legacyMode = /凭空|无户籍|异界来客/.test(originText) ? "unbound"
      : /凶兽养大|兽群养大|星斗兽群/.test(originText) ? "beast"
        : /皇室|王府|公爵|贵族|质子/.test(originText) ? "noble"
          : game.view.affiliations.length || /少宗主|内门亲传|核心嫡系|封山支脉|外门家庭|基层职员子女|军属子女|长老之子/.test(originText) ? "internal" : "public";
    const institution = game.view.affiliations[0]?.name ?? game.view.relations.find((relation) => /觉醒|宗门|所属势力/.test(`${relation.relation}${relation.impression}`))?.faction ?? "地方武魂殿";
    const officiant = game.view.relations.find((relation) => /负责本次觉醒|觉醒主持|觉醒教习|守碑长老|觉醒执事/.test(`${relation.name}${relation.relation}`))?.name ?? (legacyMode === "internal" ? `${institution}负责觉醒的魂师` : "地方武魂殿巡查执事");
    const category = character.martialSoul.category;
    const testFocus = /本体/.test(category) ? "体征、魂力流向、收放与承载" : /兽/.test(category) ? "兽化部位、本能控制、力量与收放" : /植物/.test(category) ? "生长形态、环境反应、消耗与收放" : /食物/.test(category) ? "制造速度、魂力消耗、保存与食用安全" : /元素/.test(category) ? "影响范围、稳定性、消耗与收放" : "形态、重量、结构、魂力反应与收放";
    game.world.flags.openingMode ??= legacyMode;
    game.world.flags.openingInstitutionName ??= institution;
    game.world.flags.openingOfficiant ??= officiant;
    game.world.flags.openingSoulTestFocus ??= testFocus;
    const oldGenericObjective = game.view.chapterObjective?.title === "让觉醒结果真正变成第一步";
    const oldNobleObjective = legacyMode === "noble" && game.view.chapterObjective?.title === "让家族身份与觉醒结果形成明确安排";
    if (oldNobleObjective) {
      for (const entry of game.view.narrative) {
        entry.text = entry.text.replaceAll("教师、资源、同辈排序与第一魂环安排会重新评议", "家族培养、学院报名、外部导师或交换培养都会重新评议");
      }
      if (game.view.storyArc?.arcNumber === 1) {
        game.view.storyArc.centralGoal = "比较贵族身份能够打开的培养路线";
        game.view.storyArc.irreversibleTurn = "在家族培养、学院入学与外部培养之间作出近期选择，并确认费用与家族责任";
        for (const payoff of game.view.storyArc.payoffLedger) {
          if (/家族教师|同辈竞争位置/.test(payoff.label)) payoff.label = payoff.id === "living-condition" ? "落实培养地点、费用来源、监护与家族责任" : "比较家族、学院与外部导师三类培养路线";
        }
        for (const scene of game.view.storyArc.npcScenes) {
          if (/家族教师|第一魂环安排/.test(scene.action)) scene.action = `和${scene.npcName}比较家族培养、学院报名与外部导师的资格和代价`;
        }
      }
    }
    for (const bodySoul of character.martialSouls.filter((soul) => /本体/.test(soul.category))) {
      const escapedSoul = bodySoul.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const entry of game.view.narrative) entry.text = entry.text.replace(new RegExp(`[^。！？\\n]{0,16}摊开手。${escapedSoul}托在掌心，本体武魂特有的气息沿着指缝散开。[^。！？\\n]{0,100}记录员把形态一笔笔画下来。`, "g"), `${character.name}体内先是一热，随后身体本身传来清晰的魂力回响。${officiant}没有检查掌心中的外物，而是核对体征、动作和魂力流向，再让记录员写下变化位置。`);
    }
    if (legacyMode === "internal") {
      for (const entry of game.view.narrative) {
        entry.text = entry.text.replaceAll("学院名额、第一魂环和培养责任，今天便要有人给出答复。", `${institution}里哪位老师愿意教、训练场能用多久、第一次猎魂谁肯同行，都需要当面谈清。`);
        entry.text = entry.text.replace(new RegExp(`[^。！？\\n]{0,48}心里翻过一个念头：这上面记的，恐怕不只是魂环。`, "g"), `${character.name}先记下与第一魂环有关的缺页，准备直接问清可用部分、风险和复核人。`);
        entry.text = entry.text.replaceAll("这上面记的，恐怕不只是魂环。", `他先记下与第一魂环有关的缺页，准备直接问清可用部分、风险和复核人。`);
        entry.text = entry.text.replaceAll("执事划掉重写", "记录员划掉重写");
      }
      if (oldGenericObjective) game.view.chapterObjective = {
        title: `把${institution}内部觉醒变成具体培养方案`, stakes: character.originBurden, destinationId: game.view.locationId,
        steps: [
          { id: "understand", text: `请${officiant}完成${character.martialSoul.name}的${testFocus}测试`, status: "进行中" },
          { id: "support", text: `问清${institution}能安排哪位导师、多少训练时间和哪些猎魂帮助`, status: "未开始" },
          { id: "path", text: "决定主修顺序、公开范围和愿意承担的内部责任", status: "未开始" },
        ],
      };
      game.storyMemory.openThreads = game.storyMemory.openThreads.map((thread) => thread === "家人与出身中尚未说清的细节" ? `谈清${institution}内部培养条件与责任` : thread);
      if (game.view.storyArc?.arcNumber === 1) {
        game.view.storyArc.centralGoal = game.view.chapterObjective?.title ?? game.view.storyArc.centralGoal;
        game.view.storyArc.irreversibleTurn = `决定愿意承担哪些${institution}内部培养责任，以及武魂公开到什么范围`;
      }
    } else if (oldGenericObjective || oldNobleObjective) {
      const objectiveByMode = legacyMode === "unbound" ? {
        title: "先在大陆活过觉醒后的第一天",
        steps: [{ id: "identity", text: "先找到今晚住处和愿意说明来处的见证人", status: "进行中" as const }, { id: "understand", text: `请${officiant}测试${character.martialSoul.name}的${testFocus}`, status: "未开始" as const }, { id: "path", text: "决定说明多少来历、保留异界秘密或继续无籍生活", status: "未开始" as const }],
      } : legacyMode === "beast" ? {
        title: "决定觉醒后是否接触人类魂师体系",
        steps: [{ id: "understand", text: `与养育者确认${character.martialSoul.name}在人类与魂兽视角下的含义`, status: "进行中" as const }, { id: "boundary", text: "确认离开兽群领地会失去哪些保护与资源", status: "未开始" as const }, { id: "path", text: "决定留在森林、短期接触人类或正式建立人类身份", status: "未开始" as const }],
      } : legacyMode === "noble" ? {
        title: "比较贵族身份能够打开的培养路线",
        steps: [{ id: "understand", text: `请${officiant}完成${character.martialSoul.name}的${testFocus}测试`, status: "进行中" as const }, { id: "support", text: "分别核对家族培养、可报学院、外部导师或交换培养的资格与代价", status: "未开始" as const }, { id: "path", text: "与监护人确定近期培养地点、费用来源和必须承担的家族责任", status: "未开始" as const }],
      } : {
        title: "把觉醒结果换成下一步真实条件",
        steps: [{ id: "understand", text: `请${officiant}测试${character.martialSoul.name}的${testFocus}`, status: "进行中" as const }, { id: "support", text: "落实当前时代的入学、照料、费用与第一成长资源", status: "未开始" as const }, { id: "path", text: "在家庭、资源与年龄限制内确定近期成长路线", status: "未开始" as const }],
      };
      game.view.chapterObjective = { title: objectiveByMode.title, stakes: character.originBurden, destinationId: game.view.locationId, steps: objectiveByMode.steps };
      const thread = legacyMode === "unbound" ? "取得住处、见证与临时身份" : legacyMode === "beast" ? "决定与人类魂师体系保持多远的距离" : legacyMode === "noble" ? "比较家族、学院与外部导师路线并承担相应责任" : "落实家庭能够承担的入学、费用与第一成长资源";
      game.storyMemory.openThreads = game.storyMemory.openThreads.map((item) => item === "家人与出身中尚未说清的细节" ? thread : item);
    }
  }
  if (previousSchemaVersion < 45) {
    const officiant = String(game.world.flags.openingOfficiant ?? "负责本次觉醒的魂师");
    const replaceEarlyTemplateLanguage = (text: string) => text
      .replaceAll("请主持者", `请${officiant}`)
      .replaceAll("觉醒主持者", "负责本次觉醒的魂师")
      .replaceAll("多武魂天才培养权复核", "多武魂天才引发培养争议")
      .replaceAll("多武魂觉醒已进入培养复核", "多武魂觉醒引起培养争议")
      .replace(/回应([^。；]{1,24})的培养评估/g, "听取$1愿意给出的培养条件")
      .replaceAll("资源额度", "具体帮助")
      .replaceAll("导师面谈", "导师接触")
      .replaceAll("首环责任页", "首环帮助约定")
      .replaceAll("责任页", "约定");
    for (const entry of game.view.narrative) entry.text = replaceEarlyTemplateLanguage(entry.text);
    for (const task of game.view.tasks) { task.title = replaceEarlyTemplateLanguage(task.title); task.detail = replaceEarlyTemplateLanguage(task.detail); }
    for (const step of game.view.chapterObjective?.steps ?? []) step.text = replaceEarlyTemplateLanguage(step.text);
    game.storyMemory.summary = replaceEarlyTemplateLanguage(game.storyMemory.summary);
    game.storyMemory.openThreads = game.storyMemory.openThreads.map(replaceEarlyTemplateLanguage);
    for (const event of game.world.dynamicEvents.filter((item) => /awakening|talent-recruitment/.test(item.id))) { event.title = replaceEarlyTemplateLanguage(event.title); event.detail = replaceEarlyTemplateLanguage(event.detail); }
    for (const relation of game.view.relations.filter((item) => item.relation === "觉醒主持者")) relation.relation = "负责本次觉醒的魂师";
  }
  if (previousSchemaVersion < 46) {
    const hiddenSoulCount = game.view.character ? Math.max(0, game.view.character.martialSouls.length - (game.view.character.publiclyKnownMartialSoulIndices?.length ?? 1)) : 0;
    for (const entry of game.world.actionLedger) {
      const requestedPrivateTest = /暂不显露|不公开|隐藏/.test(entry.action) && /第二武魂|第三武魂|副武魂|隐藏武魂|单独测试|私下测试/.test(entry.action);
      const resolvedAsDifferentAction = !/私下测试隐藏武魂|隐藏武魂.{0,20}(?:显形|测试)/.test(`${entry.intent}${entry.result}`);
      if (hiddenSoulCount > 0 && requestedPrivateTest && resolvedAsDifferentAction) {
        entry.intent = "旧版本未完成私测";
        entry.result = "旧版本没有实际执行隐藏武魂私测；该记录不构成公开、测试、能力或NPC知情证据，需由玩家重新行动。";
        const consequence = game.view.storyArchive?.recentConsequences.find((item) => item.action === entry.action);
        if (consequence) { consequence.result = entry.result; consequence.tone = "普通"; }
      }
    }
    const ledgerSummary = game.world.actionLedger.slice(-40).map((entry) => `${entry.year}年第${entry.day}日，${entry.action}；程序结果：${entry.result}`);
    const awakeningFact = game.view.character ? `${game.view.character.name}已完成武魂觉醒，当前公开武魂为${game.view.character.martialSouls?.filter((_soul, index) => (game.view.character?.publiclyKnownMartialSoulIndices ?? [0]).includes(index)).map((soul) => soul.name).join("、") || game.view.character.martialSoul.name}，先天魂力${game.view.character.innateSoulPower}级。` : "";
    game.storyMemory.summary = [awakeningFact, ...ledgerSummary].filter(Boolean).join(" ").slice(-4_000);
    game.storyMemory.openThreads = [...new Set((game.view.tasks ?? []).filter((task) => task.status !== "完成").map((task) => task.title))].slice(0, 12);
    game.storyMemory.keyChoices = game.world.actionLedger.filter((entry) => /确定|选择|公开|隐藏|加入|拜师|承诺|拒绝|介入|魂环|生死/.test(`${entry.action}${entry.intent}`)).slice(-20).map((entry) => `${entry.year}年第${entry.day}日，${entry.action}`);
    game.storyMemory.npcNotes = {};
    game.storyMemory.lastUpdatedAction = game.actionIndex;
    for (const npc of Object.values(game.world.npcs)) {
      npc.episodicMemory = (npc.episodicMemory ?? []).filter((memory) => memory.source !== "叙事提取");
      npc.memoryOfPlayer = npc.episodicMemory.map((memory) => memory.text).slice(-12);
    }
    if (game.view.storyArchive) {
      game.view.storyArchive.summary = game.storyMemory.summary;
      game.view.storyArchive.openThreads = [...game.storyMemory.openThreads];
      game.view.storyArchive.keyChoices = [...game.storyMemory.keyChoices].reverse();
    }
    if (game.view.chapter) game.view.chapter.summary = game.storyMemory.summary.slice(-260);
    game.world.flags.schema46MemoryRebuilt = true;
  }
  if (previousSchemaVersion < 35) {
    const day = game.view.worldTime?.day ?? 1;
    const replacements: Array<[string, string]> = [];
    const futureFactionPairs: Array<[string, string]> = [];
    for (const definition of CANON_CHARACTERS) {
      const publicName = characterPublicNameAtDate(definition.id, startYear, day);
      const identityVerified = legacy.world.intelligenceRecords.some((record) => record.subjectType === "人物" && record.subjectId === definition.id && record.confidence >= 85 && record.status === "确定" && /交叉核验|身份核验|密档/.test(record.source) && `${record.title}${record.detail}`.includes(definition.name));
      if (identityVerified) continue;
      const now = ordinal(startYear, day);
      const namesAlreadyOccurred = new Set(CHARACTER_LIFE_STAGES.filter((stage) => stage.characterId === definition.id && ordinal(stage.validFromYear, stage.validFromDay ?? 1) <= now).map((stage) => stage.publicName));
      namesAlreadyOccurred.add(publicName);
      for (const laterName of [definition.name, ...definition.aliases]) if (!namesAlreadyOccurred.has(laterName)) replacements.push([laterName, publicName]);
      const currentFactions = new Set(canonicalFactionIdsAtDate(definition.id, startYear, day));
      for (const factionId of definition.factionIds.filter((id) => !currentFactions.has(id))) {
        const factionName = FACTIONS.find((item) => item.id === factionId)?.name;
        if (factionName) futureFactionPairs.push([publicName, factionName]);
      }
      for (const relation of game.view.relations.filter((item) => item.id === definition.id)) relation.name = publicName;
      for (const record of legacy.world.intelligenceRecords.filter((item) => item.subjectType === "人物" && item.subjectId === definition.id)) {
        for (const [laterName, currentName] of replacements.filter((item) => item[1] === publicName)) { record.title = record.title.replaceAll(laterName, currentName); record.detail = record.detail.replaceAll(laterName, currentName); }
      }
    }
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const futureEventTitles = CANON_EVENTS.filter((event) => ordinal(event.year, event.day ?? 1) > ordinal(startYear, day)).map((event) => event.title);
    const replaceFutureFacts = (text: string) => {
      let value = replacements.reduce((current, [laterName, currentName]) => current.replaceAll(laterName, currentName), text);
      for (const [publicName, factionName] of futureFactionPairs) {
        value = value.replace(new RegExp(`${escape(publicName)}[^。！？]{0,32}${escape(factionName)}`, "g"), `${publicName}当前尚无可证的${factionName}归属`);
        value = value.replace(new RegExp(`${escape(factionName)}[^。！？]{0,32}${escape(publicName)}`, "g"), `${publicName}当前尚无可证的${factionName}归属`);
      }
      for (const title of futureEventTitles) value = value.replaceAll(title, "尚未发生的未来事件");
      return value;
    };
    for (const entry of game.view.narrative) entry.text = replaceFutureFacts(entry.text);
    for (const task of game.view.tasks) { task.title = replaceFutureFacts(task.title); task.detail = replaceFutureFacts(task.detail); }
    for (const item of game.view.news) { item.title = replaceFutureFacts(item.title); item.detail = replaceFutureFacts(item.detail); }
    for (const npc of Object.values(legacy.world.npcs)) {
      npc.memoryOfPlayer = npc.memoryOfPlayer.map(replaceFutureFacts);
      for (const memory of npc.episodicMemory) memory.text = replaceFutureFacts(memory.text);
    }
    game.storyMemory.summary = replaceFutureFacts(game.storyMemory.summary);
    game.storyMemory.openThreads = game.storyMemory.openThreads.map(replaceFutureFacts);
    game.storyMemory.keyChoices = game.storyMemory.keyChoices.map(replaceFutureFacts);
    game.storyMemory.npcNotes = Object.fromEntries(Object.entries(game.storyMemory.npcNotes).map(([name, note]) => [replaceFutureFacts(name), replaceFutureFacts(note)]));
  }
  game.legacy ??= { upgrades: {} };
  if (!game.view.activeHeirloom && game.legacy.equippedHeirloom && game.view.character) {
    const heirloom = heirloomByName(game.legacy.equippedHeirloom);
    if (heirloom) game.view.activeHeirloom = { id: heirloom.id, name: heirloom.name, rarity: heirloom.rarity, description: heirloom.description, effect: heirloom.effect, trigger: heirloom.trigger, status: "等待触发", maxUses: heirloom.maxUses, remainingUses: heirloom.maxUses, actionCommand: heirloom.actionCommand };
  }
  if (game.view.activeHeirloom) {
    const definition = heirloomByName(game.view.activeHeirloom.name);
    game.view.activeHeirloom.maxUses ??= definition?.maxUses ?? 1;
    game.view.activeHeirloom.remainingUses ??= game.view.activeHeirloom.status === "本局已触发" ? 0 : game.view.activeHeirloom.maxUses;
    game.view.activeHeirloom.status = game.view.activeHeirloom.remainingUses > 0 ? "等待触发" : "本局已触发";
  }
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
    affects: [...cause.affectedNpcIds.map((id) => legacy.world.npcs[id]?.name ?? id), ...cause.affectedFactionIds.map((id) => FACTIONS.find((item) => item.id === id)?.name ?? id)].join("、") || "当前地点",
    strength: cause.strength >= 30 ? "足以撼动关键节点" : cause.strength >= 12 ? "可能形成长期偏差" : "轻微影响",
    date: `原作 ${cause.atYear >= 0 ? "+" : ""}${cause.atYear} 年 · 第 ${cause.atDay} 日`,
  }));
  game.view.storyArchive ??= { summary: game.storyMemory.summary, openThreads: game.storyMemory.openThreads, keyChoices: game.storyMemory.keyChoices, recentConsequences: [], continuity: [], localConsequences: [] };
  game.view.storyArchive.localConsequences ??= [];
  game.view.affiliations ??= [];
  const singleClanIds: Record<string, string> = { "敏之一族": "speed-clan", "力之一族": "strength-clan", "御之一族": "defense-clan", "破之一族": "breaking-clan" };
  for (const affiliation of game.view.affiliations) if (affiliation.id === "min-clan" && singleClanIds[affiliation.name]) affiliation.id = singleClanIds[affiliation.name];
  game.view.inventory = game.view.inventory.map((item) => item === "地方临时身份凭据" ? "临时来处证明" : item);
  if (game.view.academyApplication) {
    const application = game.view.academyApplication as typeof game.view.academyApplication & Partial<Pick<import("../../shared/game.js").AcademyApplicationView, "fundingType" | "fundingSource" | "obligations" | "availableFundingOptions">>;
    const academyEra = game.view.era ?? 1;
    const academyProfile = academyEraLifeProfile(academyEra);
    application.fundingType ??= application.route === "工读生" ? "工读抵扣" : game.view.era === 3 && application.fee === 0 ? "公共义务教育" : "家庭自费";
    application.fundingSource ??= application.fundingType === "工读抵扣" ? "旧存档工读名额与在校劳动抵扣" : application.fundingType === "公共义务教育" ? "斗三适龄免费义务教育安排" : "本人及家庭支付";
    application.obligations ??= application.fundingType === "工读抵扣" ? ["按排班完成适龄校内劳动", "劳动不能替代课程与考核"] : application.fundingType === "公共义务教育" ? ["完成适龄基础课程与纪律要求", "额外培养资源仍需另算"] : ["家庭承担学费、食宿与路费", "不附带工读、宗门或奖助义务"];
    application.availableFundingOptions ??= ["家庭自费", ...(game.view.era === 1 ? ["工读抵扣" as const] : []), ...(game.view.era === 3 ? ["公共义务教育" as const] : [])];
    application.admissionAssessmentName ??= /史莱克|皇家|日月皇家|星际学院/.test(application.academyName) ? "学院入学考核" : academyEra === 1 ? "觉醒证明与来处查验" : academyEra === 2 ? "学院入学考核" : academyEra === 3 ? "魂力测试与分班" : "入学与分班测试";
    application.assessmentRequired ??= /史莱克|皇家|日月皇家|星际学院/.test(application.academyName) || academyEra >= 2;
    if (previousSchemaVersion < 45 && academyEra === 1 && !application.assessmentRequired && application.stage === "入学考核") {
      application.stage = "待报到";
      application.evidence.push("Schema 45保留已经交过的觉醒与来处证明，不再要求普通初级学院完成无原著依据的统一入学考试");
    }
    if (game.view.academyLife) {
      const life = game.view.academyLife as typeof game.view.academyLife & { homeroomTeacher?: string; monthlyScore?: number; stage: string; teacherName?: string; teacherRole?: string; periodLabel?: string; arrivalAction?: string; arrangementName?: string; assessmentName?: string; completionName?: string; assessmentScore?: number };
      life.stage = ({ 报到安置: "入学安顿", 基础课程: "共同学习", 同辈磨合: "同辈磨合", 首月实战考核: "阶段考核", 首月结业: "阶段完成" } as Record<string, import("../../shared/academy-life.js").AcademyLifeStage>)[life.stage] ?? life.stage as import("../../shared/academy-life.js").AcademyLifeStage;
      life.teacherName ??= life.homeroomTeacher ?? ({ 1: "严观棋", 2: "许岚川", 3: "罗闻舟", 4: "周砺星" } as const)[academyEra];
      life.teacherRole ??= academyProfile.teacherRole;
      life.periodLabel ??= academyProfile.periodLabel;
      life.arrivalAction ??= academyProfile.arrivalAction;
      life.arrangementName ??= academyProfile.arrangementName;
      life.assessmentName ??= academyProfile.assessmentName;
      life.completionName ??= academyProfile.completionName;
      life.assessmentScore ??= life.monthlyScore;
      const reviseAcademyText = (text: string) => {
        let revised = text.replaceAll("学院首月", academyProfile.periodLabel).replaceAll("首月实战考核", academyProfile.assessmentName).replaceAll("首月考核", academyProfile.assessmentName).replaceAll("首月结业", academyProfile.completionName).replaceAll("首月", academyProfile.periodLabel);
        if (academyEra === 1) revised = revised.replaceAll("班主任", "学院老师").replaceAll("课表", "课程与工读安排").replaceAll("学籍", "学院身份").replaceAll("正式报到", "正式入学");
        return revised;
      };
      life.evidence = life.evidence.map(reviseAcademyText);
      for (const entry of game.view.narrative) entry.text = reviseAcademyText(entry.text);
      for (const task of game.view.tasks) { task.title = reviseAcademyText(task.title); task.detail = reviseAcademyText(task.detail); }
      game.storyMemory.summary = reviseAcademyText(game.storyMemory.summary);
      game.storyMemory.openThreads = game.storyMemory.openThreads.map(reviseAcademyText);
      if (game.view.storyArc) {
        game.view.storyArc.centralGoal = reviseAcademyText(game.view.storyArc.centralGoal);
        game.view.storyArc.centralConflict = reviseAcademyText(game.view.storyArc.centralConflict);
        game.view.storyArc.promisedPayoff = reviseAcademyText(game.view.storyArc.promisedPayoff);
      }
      for (const relation of game.view.relations.filter((item) => item.name === life.teacherName || item.name === life.homeroomTeacher)) {
        relation.name = life.teacherName;
        if (!/师徒|私人导师|正式导师/.test(relation.relation)) relation.relation = academyProfile.teacherRole;
        relation.impression = reviseAcademyText(relation.impression);
      }
      delete life.homeroomTeacher;
      delete life.monthlyScore;
    }
    if (application.stage === "已入学" && !game.view.academyLife) {
      const progress = Number(game.world.flags.academyCourseProgress ?? 0);
      const peerSpecs = ({ 1: [["陆峥", "竞争者"], ["石禾", "务实同学"], ["苏棠", "协作同学"]], 2: [["徐铮", "竞争者"], ["安禾", "务实同学"], ["林晚照", "协作同学"]], 3: [["贺骁", "竞争者"], ["唐禾", "务实同学"], ["叶清", "协作同学"]], 4: [["穆辰星", "竞争者"], ["蓝禾", "务实同学"], ["周澄", "协作同学"]] } as const)[academyEra];
      const teacherName = ({ 1: "严观棋", 2: "许岚川", 3: "罗闻舟", 4: "周砺星" } as const)[academyEra];
      game.view.academyLife = { academyName: application.academyName, stage: progress >= 2 ? "同辈磨合" : "入学安顿", className: academyEra === 1 ? "初级魂师一年级" : academyEra === 2 ? "新生魂师基础班" : academyEra === 3 ? "初等学院魂师班" : "初等学院魂力基础班", teacherName, ...academyProfile, dormitory: application.route === "工读生" ? "工读生集体宿舍" : `${application.academyName}新生宿舍`, attendance: progress, courseProgress: progress, practicalProgress: 0, fundingDutyProgress: ["家庭自费", "公共义务教育"].includes(application.fundingType) ? 1 : 0, peerInteractions: 0, standing: 0, discipline: 100, evidence: progress ? [`旧存档保留${progress}次基础课程；同辈互动与${academyProfile.assessmentName}从本次载入后继续`] : [`旧存档已有学院身份；${academyProfile.arrangementName}与同辈生活从本次载入后继续`], peers: peerSpecs.map(([name, role], index) => ({ id: `academy-peer-${academyEra}-${name}`, name, role, background: "旧存档未记录具体家庭，只保留同班身份", motive: role === "竞争者" ? `争取在${academyProfile.assessmentName}中表现更好` : role === "务实同学" ? "稳住课程与家庭开销" : "寻找可靠的小组练习同伴", attitude: index ? 4 : 0, competition: index === 0 ? 28 : index === 1 ? 12 : 6, interactions: 0, lastAction: `正在处理自己的课程、生活与${academyProfile.periodLabel}目标` })) };
      if (!game.view.relations.some((relation) => relation.name === teacherName)) game.view.relations.push({ id: `academy-teacher-${academyEra}`, name: teacherName, relation: academyProfile.teacherRole, impression: `旧存档补建的${academyProfile.periodLabel}课程、生活与${academyProfile.assessmentName}负责人`, strength: 12, category: "师友" });
      for (const peer of game.view.academyLife.peers) if (!game.view.relations.some((relation) => relation.name === peer.name)) game.view.relations.push({ id: peer.id, name: peer.name, relation: "同班同学", impression: `${peer.background}；${peer.motive}`, strength: 8, category: "其他" });
      const foundationTask = game.view.tasks.find((item) => item.id === "academy-foundation");
      if (foundationTask?.status === "完成") { foundationTask.status = "进行中"; foundationTask.detail = `旧课程次数保留；继续完成宿舍生活、同辈互动、费用约定与${academyProfile.assessmentName}。`; }
    }
  }
  if (game.view.mentorPursuit) {
    const pursuit = game.view.mentorPursuit as typeof game.view.mentorPursuit & Partial<Pick<import("../../shared/game.js").MentorPursuitView, "specialty" | "teachingStyle" | "taboo" | "resourceOffer" | "reciprocalDuty" | "trialFocus" | "lessonsCompleted">>;
    const category = game.view.character?.martialSoul.category ?? "器武魂";
    pursuit.specialty ??= /本体/.test(category) ? "身体承载、魂力流向与本体控制" : /兽/.test(category) ? "兽化部位、本能压制与近身发力" : /植物/.test(category) ? "环境感应、生长控制与消耗管理" : /食物/.test(category) ? "制造稳定、保存安全与团队补给" : /元素/.test(category) ? "范围控制、稳定性与属性环境" : "器武魂结构、收放精度与发力路线";
    pursuit.teachingStyle ??= "逐次记录型：先复现失败，再改一个动作";
    pursuit.taboo ??= "禁止以偶然成功冒充稳定能力，也不以伤害幼年身体换取短期表现";
    pursuit.resourceOffer ??= `${pursuit.mentorName}只提供权限范围内的训练、复核与介绍，不包办稀有资源`;
    pursuit.reciprocalDuty ??= "如实记录失败，按时履行课程，不借师名索取超出权限的资源";
    pursuit.trialFocus ??= `${pursuit.specialty}中的一项可重复基础动作`;
    pursuit.lessonsCompleted ??= 0;
  }
  if (game.view.hunting) {
    const hunting = game.view.hunting;
    if (hunting.stage !== "需求" && !hunting.support) hunting.support = { route: "旧存档续接", responsibleParty: hunting.recommendations[0]?.source ?? "旧存档未完整记录的责任人", fundingSource: "旧存档已发生费用，不补造新补助", authorization: "沿用已发生的调查与准备，但后续受当前地点、凭证和未成年安全门禁约束", sponsorBudget: 0, sponsorSpent: 0, obligations: ["补齐成年魂师同行证据", "受管控区域补齐合法凭证"], evidence: ["Schema 43只续接旧猎魂进度，不反向虚构当时由学院、家族、宗门或导师承担"], status: "已确认" };
    hunting.preparation = hunting.preparation.map((entry) => {
      const name = entry.match(/^同行者：(.+?)（/)?.[1];
      if (!name) return entry;
      const relation = game.view.relations.find((item) => item.name === name);
      const profile = `${relation?.relation ?? ""}${relation?.impression ?? ""}`;
      return (relation?.age ?? 0) >= 18 || /导师|老师|教官|护卫|执事|父|母|叔|长老|向导|佣兵|带队责任人|护送责任人/.test(profile) ? `成年${entry}` : entry;
    });
  }
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
    repairLegacyUnboundAwakening(game);
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
    game.view.character.publiclyKnownMartialSoulIndices ??= game.view.character.martialSouls.map((_soul, index) => index);
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
  ensureNpcPlans(game);
  ensureStoryArc(game);
  refreshStoryArchive(game);
  return game;
}

export function createSystemEntry(text: string) {
  return { id: randomUUID(), kind: "system" as const, text, createdAt: new Date().toISOString() };
}
