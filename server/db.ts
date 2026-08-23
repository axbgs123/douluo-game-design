import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import type { CheckpointSummary, MartialSoulCodexEntryView, MetaProgressionView, RunSettlementView, SaveSummary, WorldCatalogStatsView } from "../shared/game.js";
import type { MartialSoulTemplate } from "./domain/model.js";
import { META_MARTIAL_SOULS, metaSoulById } from "./data/meta-martial-souls.js";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, SOUL_BEASTS } from "./data/world.js";
import { FANFICTION_RULES } from "./data/fanfiction-rules.js";
import type { StoredGame } from "./domain/model.js";
import { ensureGameState } from "./domain/world.js";
import { BIRTH_PROFILE_COUNT } from "./domain/generator.js";

const databasePath = resolve(process.cwd(), ".data", "douluo.db");
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode = WAL;");
database.exec("PRAGMA foreign_keys = ON;");
database.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_events_game_sequence
  ON events(game_id, sequence);

  CREATE TABLE IF NOT EXISTS game_checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    label TEXT NOT NULL,
    action_index INTEGER NOT NULL,
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_checkpoints_game_created
  ON game_checkpoints(game_id, id DESC);

  CREATE TABLE IF NOT EXISTS meta_profile (
    id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS canon_characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    importance INTEGER NOT NULL,
    data_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS canon_power_snapshots (
    character_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    soul_rank INTEGER,
    tier TEXT NOT NULL,
    note TEXT NOT NULL,
    PRIMARY KEY (character_id, year),
    FOREIGN KEY (character_id) REFERENCES canon_characters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS canon_factions (id TEXT PRIMARY KEY, name TEXT NOT NULL, data_json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS canon_locations (id TEXT PRIMARY KEY, name TEXT NOT NULL, data_json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS canon_events (id TEXT PRIMARY KEY, year INTEGER NOT NULL, title TEXT NOT NULL, data_json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS canon_soul_beasts (id TEXT PRIMARY KEY, name TEXT NOT NULL, data_json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS fanfiction_rules (
    era INTEGER NOT NULL,
    rule_id INTEGER NOT NULL,
    section INTEGER NOT NULL,
    section_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    conditional INTEGER NOT NULL,
    rule_text TEXT NOT NULL,
    PRIMARY KEY (era, rule_id)
  );
`);

function seedCanonCatalog(): void {
  const characterStatement = database.prepare("INSERT OR REPLACE INTO canon_characters (id, name, importance, data_json) VALUES (?, ?, ?, ?)");
  const snapshotStatement = database.prepare("INSERT OR REPLACE INTO canon_power_snapshots (character_id, year, soul_rank, tier, note) VALUES (?, ?, ?, ?, ?)");
  const factionStatement = database.prepare("INSERT OR REPLACE INTO canon_factions (id, name, data_json) VALUES (?, ?, ?)");
  const locationStatement = database.prepare("INSERT OR REPLACE INTO canon_locations (id, name, data_json) VALUES (?, ?, ?)");
  const eventStatement = database.prepare("INSERT OR REPLACE INTO canon_events (id, year, title, data_json) VALUES (?, ?, ?, ?)");
  const beastStatement = database.prepare("INSERT OR REPLACE INTO canon_soul_beasts (id, name, data_json) VALUES (?, ?, ?)");
  const ruleStatement = database.prepare("INSERT OR REPLACE INTO fanfiction_rules (era, rule_id, section, section_name, kind, conditional, rule_text) VALUES (?, ?, ?, ?, ?, ?, ?)");
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const character of CANON_CHARACTERS) {
      characterStatement.run(character.id, character.name, character.importance, JSON.stringify(character));
      for (const snapshot of character.powerSnapshots) snapshotStatement.run(character.id, snapshot.year, snapshot.soulRank ?? null, snapshot.tier, snapshot.note);
    }
    for (const faction of FACTIONS) factionStatement.run(faction.id, faction.name, JSON.stringify(faction));
    for (const location of LOCATIONS) locationStatement.run(location.id, location.name, JSON.stringify(location));
    for (const event of CANON_EVENTS) eventStatement.run(event.id, event.year, event.title, JSON.stringify(event));
    for (const beast of SOUL_BEASTS) beastStatement.run(beast.id, beast.name, JSON.stringify(beast));
    for (const rule of FANFICTION_RULES) ruleStatement.run(rule.era, rule.id, rule.section, rule.sectionName, rule.kind, rule.conditional ? 1 : 0, rule.text);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

seedCanonCatalog();

const defaultMetaProgression: MetaProgressionView = {
  legacyPoints: 0,
  completedRuns: 0,
  discoveredMartialSouls: 0,
  discoveredOrigins: 0,
  unlockedOrigins: ["斗罗本地基础出身"],
  unlockedMartialSouls: [],
  unlockedTraits: [],
  unlockedHeirlooms: [],
  codexEntries: [],
  weightPreferences: { origin: "均衡", martialSoul: "均衡", gift: "均衡" },
  purchasedUpgrades: {},
  martialSoulCodex: [],
  martialSoulDrawTickets: 1,
  martialSoulDrawPity: 0,
  difficultyBudgets: { 爽: 120, 简单: 80, 标准: 50, 困难: 25, 地狱: 10 },
  difficultyMultipliers: { 爽: 0.5, 简单: 0.75, 标准: 1, 困难: 1.5, 地狱: 2.25 },
};

database.prepare(`
  INSERT OR IGNORE INTO meta_profile (id, state_json, updated_at)
  VALUES ('local', ?, ?)
`).run(JSON.stringify(defaultMetaProgression), new Date().toISOString());

const upsertGameStatement = database.prepare(`
  INSERT INTO games (id, state_json, created_at, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    state_json = excluded.state_json,
    updated_at = excluded.updated_at
`);

const loadGameStatement = database.prepare("SELECT state_json FROM games WHERE id = ?");
const listGamesStatement = database.prepare("SELECT state_json FROM games ORDER BY updated_at DESC");
const eventCountStatement = database.prepare("SELECT COUNT(*) AS count FROM events WHERE game_id = ?");
const insertEventStatement = database.prepare(`
  INSERT INTO events (game_id, sequence, event_type, payload_json, created_at)
  VALUES (?, ?, ?, ?, ?)
`);
const deleteGameStatement = database.prepare("DELETE FROM games WHERE id = ?");

export function saveGame(game: StoredGame, eventType: string, payload: unknown = {}): void {
  const serialized = JSON.stringify(game);
  database.exec("BEGIN IMMEDIATE");
  try {
    upsertGameStatement.run(
      game.view.id,
      serialized,
      game.view.createdAt,
      game.view.updatedAt,
    );
    const countRow = eventCountStatement.get(game.view.id) as { count: number };
    insertEventStatement.run(
      game.view.id,
      countRow.count + 1,
      eventType,
      JSON.stringify(payload),
      new Date().toISOString(),
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function loadGame(id: string): StoredGame | undefined {
  const row = loadGameStatement.get(id) as { state_json: string } | undefined;
  return row ? ensureGameState(JSON.parse(row.state_json) as StoredGame) : undefined;
}

export function listSaves(): SaveSummary[] {
  const rows = listGamesStatement.all() as Array<{ state_json: string }>;
  return rows.map(({ state_json }) => {
    const game = ensureGameState(JSON.parse(state_json) as StoredGame);
    return {
      id: game.view.id,
      characterName: game.view.character?.name
        ?? game.view.candidates.find((candidate) => candidate.id === game.view.selectedCandidateId)?.name
        ?? "未选择角色",
      status: game.view.status,
      location: game.view.location ?? "命运选择",
      soulRank: game.view.character?.soulRank,
      difficulty: game.view.difficulty,
      updatedAt: game.view.updatedAt,
    };
  });
}

export function deleteGame(id: string): boolean {
  return Number(deleteGameStatement.run(id).changes) > 0;
}

export function saveCheckpoint(game: StoredGame, label: string): void {
  database.prepare("INSERT INTO game_checkpoints (game_id, label, action_index, state_json, created_at) VALUES (?, ?, ?, ?, ?)").run(game.view.id, label.slice(0, 80), game.actionIndex, JSON.stringify(game), new Date().toISOString());
  database.prepare("DELETE FROM game_checkpoints WHERE game_id = ? AND id NOT IN (SELECT id FROM game_checkpoints WHERE game_id = ? ORDER BY id DESC LIMIT 3)").run(game.view.id, game.view.id);
}

export function listCheckpoints(gameId: string): CheckpointSummary[] {
  return (database.prepare("SELECT id, label, action_index, created_at FROM game_checkpoints WHERE game_id = ? ORDER BY id DESC LIMIT 3").all(gameId) as Array<{ id: number; label: string; action_index: number; created_at: string }>).map((row) => ({ id: row.id, label: row.label, actionIndex: row.action_index, createdAt: row.created_at }));
}

export function restoreCheckpoint(gameId: string, checkpointId: number): StoredGame | undefined {
  const row = database.prepare("SELECT state_json FROM game_checkpoints WHERE id = ? AND game_id = ?").get(checkpointId, gameId) as { state_json: string } | undefined;
  if (!row) return undefined;
  const current = loadGame(gameId);
  const restored = ensureGameState(JSON.parse(row.state_json) as StoredGame);
  const reloads = Number(current?.world.flags.reloadCount ?? 0) + 1;
  restored.world.flags.reloadCount = reloads;
  restored.world.flags.performancePenalty = reloads * 5;
  restored.view.updatedAt = new Date().toISOString();
  restored.view.narrative.push({ id: `rewind-${checkpointId}-${reloads}`, kind: "system", text: `回溯关键节点 · 本局表现分扣除 ${reloads * 5}，通关获得的局外点数会相应减少`, createdAt: new Date().toISOString() });
  saveGame(restored, "checkpoint.restored", { checkpointId, reloads, performancePenalty: reloads * 5 });
  return restored;
}

export function getMetaProgression(): MetaProgressionView {
  const row = database.prepare("SELECT state_json FROM meta_profile WHERE id = 'local'").get() as { state_json: string };
  const stored = JSON.parse(row.state_json) as Partial<MetaProgressionView>;
  return {
    ...defaultMetaProgression,
    ...stored,
    weightPreferences: { ...defaultMetaProgression.weightPreferences, ...stored.weightPreferences },
    purchasedUpgrades: { ...defaultMetaProgression.purchasedUpgrades, ...stored.purchasedUpgrades },
    martialSoulCodex: stored.martialSoulCodex ?? [],
  };
}

function randomUnit(): number {
  return Number(BigInt.asUintN(53, BigInt(`0x${randomBytes(8).toString("hex")}`))) / 9_007_199_254_740_992;
}

function weightedMetaSoul(pool: typeof META_MARTIAL_SOULS) {
  const total = pool.reduce((sum, item) => sum + item.drawWeight, 0);
  let cursor = randomUnit() * total;
  for (const item of pool) {
    cursor -= item.drawWeight;
    if (cursor <= 0) return item;
  }
  return pool.at(-1)!;
}

export function drawMetaMartialSoul(): { meta: MetaProgressionView; drawn: MartialSoulCodexEntryView; cost: number } {
  const meta = getMetaProgression();
  const cost = meta.martialSoulDrawTickets > 0 ? 0 : 20;
  if (cost && meta.legacyPoints < cost) throw new Error(`传承点不足，武魂召唤需要 ${cost} 点`);
  if (cost) meta.legacyPoints -= cost;
  else meta.martialSoulDrawTickets -= 1;
  const pity = meta.martialSoulDrawPity;
  const pool = pity >= 39
    ? META_MARTIAL_SOULS.filter((item) => item.metaRarity === "红色" || item.metaRarity === "七彩")
    : pity >= 9
      ? META_MARTIAL_SOULS.filter((item) => ["金色", "红色", "七彩"].includes(item.metaRarity))
      : META_MARTIAL_SOULS;
  const definition = weightedMetaSoul(pool);
  const existing = meta.martialSoulCodex.find((item) => item.id === definition.id);
  const drawn: MartialSoulCodexEntryView = existing ?? {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    description: definition.description,
    rarity: definition.metaRarity,
    charges: 0,
    completedRuns: 0,
    enabled: false,
    initialSoulPowers: [],
    growthRoutes: definition.growthRoutes,
  };
  drawn.charges += 1;
  if (!existing) meta.martialSoulCodex.push(drawn);
  meta.martialSoulDrawPity = ["金色", "红色", "七彩"].includes(definition.metaRarity) ? 0 : pity + 1;
  meta.discoveredMartialSouls = meta.martialSoulCodex.length;
  saveMetaProgression(meta);
  return { meta, drawn, cost };
}

export function equipCodexMartialSoul(id?: string): MetaProgressionView {
  const meta = getMetaProgression();
  if (!id) { meta.equippedMartialSoulId = undefined; return saveMetaProgression(meta); }
  const entry = meta.martialSoulCodex.find((item) => item.id === id);
  if (!entry) throw new Error("尚未抽到这个武魂");
  if (entry.charges < 1 && entry.completedRuns < 1) throw new Error("这个武魂没有可用次数，也尚未通关解锁");
  meta.equippedMartialSoulId = id;
  return saveMetaProgression(meta);
}

export function toggleCodexMartialSoul(id: string, enabled: boolean): MetaProgressionView {
  const meta = getMetaProgression();
  const entry = meta.martialSoulCodex.find((item) => item.id === id);
  if (!entry || entry.completedRuns < 1) throw new Error("使用这个武魂通关后才能设置随机出场");
  entry.enabled = enabled;
  return saveMetaProgression(meta);
}

export function claimEquippedMartialSoul(): MartialSoulTemplate | undefined {
  const meta = getMetaProgression();
  const id = meta.equippedMartialSoulId;
  if (!id) return undefined;
  const entry = meta.martialSoulCodex.find((item) => item.id === id);
  if (!entry) { meta.equippedMartialSoulId = undefined; saveMetaProgression(meta); return undefined; }
  if (entry.completedRuns < 1) {
    if (entry.charges < 1) throw new Error("这个武魂的单次使用机会已经消耗");
    entry.charges -= 1;
  }
  meta.equippedMartialSoulId = undefined;
  saveMetaProgression(meta);
  const definition = metaSoulById(id);
  return definition ?? {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    description: entry.description,
    rarity: 1,
    soulPowerRange: [Math.min(...entry.initialSoulPowers, 6), Math.max(...entry.initialSoulPowers, 10)] as [number, number],
    omens: [`${entry.name}曾在梦中显出轮廓`, `魂力对${entry.name}的意象产生共鸣`],
    metaRarity: entry.rarity,
  };
}

export function spendLegacyPoints(amount: number, reason: string): MetaProgressionView {
  const meta = getMetaProgression();
  if (meta.legacyPoints < amount) throw new Error(`${reason}需要 ${amount} 传承点，当前只有 ${meta.legacyPoints} 点`);
  meta.legacyPoints -= amount;
  return saveMetaProgression(meta);
}

export function saveMetaProgression(meta: MetaProgressionView): MetaProgressionView {
  database.prepare(`
    INSERT INTO meta_profile (id, state_json, updated_at) VALUES ('local', ?, ?)
    ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
  `).run(JSON.stringify(meta), new Date().toISOString());
  return meta;
}

export function updateMetaPreferences(input: MetaProgressionView["weightPreferences"]): MetaProgressionView {
  const meta = getMetaProgression();
  meta.weightPreferences = input;
  return saveMetaProgression(meta);
}

export const LEGACY_UPGRADES = {
  "命运余量": { cost: 30, maxLevel: 3 },
  "稳固根基": { cost: 40, maxLevel: 3 },
  "旧世见闻": { cost: 50, maxLevel: 2 },
} as const;

export function purchaseLegacyUpgrade(name: keyof typeof LEGACY_UPGRADES): MetaProgressionView {
  const meta = getMetaProgression();
  const definition = LEGACY_UPGRADES[name];
  const level = meta.purchasedUpgrades[name] ?? 0;
  if (level >= definition.maxLevel) throw new Error(`${name}已经达到最高等级`);
  const cost = definition.cost * (level + 1);
  if (meta.legacyPoints < cost) throw new Error(`传承点不足，本次需要 ${cost} 点`);
  meta.legacyPoints -= cost;
  meta.purchasedUpgrades[name] = level + 1;
  return saveMetaProgression(meta);
}

export function equipLegacyHeirloom(name?: string): MetaProgressionView {
  const meta = getMetaProgression();
  if (name && !meta.unlockedHeirlooms.includes(name)) throw new Error("这件遗物尚未解锁");
  meta.equippedHeirloom = name;
  return saveMetaProgression(meta);
}

export function recordRunSettlement(game: StoredGame, settlement: RunSettlementView): MetaProgressionView {
  const meta = getMetaProgression();
  if (!settlement.qualified) return meta;
  meta.completedRuns += 1;
  meta.legacyPoints += settlement.legacyPoints;
  meta.martialSoulDrawTickets += 1;
  const character = game.view.character;
  if (character) {
    if (!meta.unlockedMartialSouls.includes(character.martialSoul.name)) meta.unlockedMartialSouls.push(character.martialSoul.name);
    if (!meta.unlockedOrigins.includes(character.originName)) meta.unlockedOrigins.push(character.originName);
    meta.discoveredMartialSouls = meta.unlockedMartialSouls.length;
    meta.discoveredOrigins = Math.max(meta.discoveredOrigins, meta.unlockedOrigins.length - 1);
    for (const ring of character.soulRings) {
      const entry = `${ring.beastName} · ${ring.years}年`;
      if (!meta.codexEntries.includes(entry)) meta.codexEntries.push(entry);
    }
    const knownDefinition = META_MARTIAL_SOULS.find((item) => item.name === character.martialSoul.name);
    let codex = meta.martialSoulCodex.find((item) => item.name === character.martialSoul.name);
    if (!codex) {
      codex = {
        id: knownDefinition?.id ?? `world-${Buffer.from(character.martialSoul.name).toString("hex")}`,
        name: character.martialSoul.name,
        category: character.martialSoul.category,
        description: character.martialSoul.description,
        rarity: knownDefinition?.metaRarity ?? (character.innateSoulPower >= 9 ? "金色" : character.innateSoulPower >= 7 ? "紫色" : character.innateSoulPower >= 4 ? "蓝色" : "白色"),
        charges: 0,
        completedRuns: 0,
        enabled: true,
        initialSoulPowers: [],
        growthRoutes: knownDefinition?.growthRoutes ?? ["当前实战路线尚未形成"],
      };
      meta.martialSoulCodex.push(codex);
    }
    codex.completedRuns += 1;
    if (!codex.initialSoulPowers.includes(character.innateSoulPower)) codex.initialSoulPowers.push(character.innateSoulPower);
    const route = character.soulRings.length
      ? character.soulRings.map((ring) => `${ring.skillName}（${ring.years}年）`).join(" → ")
      : "无魂环通关路线";
    if (!codex.growthRoutes.includes(route)) codex.growthRoutes.push(route);
    meta.discoveredMartialSouls = meta.martialSoulCodex.length;
  }
  if (game.world.metrics.completedHunts >= 1 && !meta.unlockedHeirlooms.includes("旧猎魂笔记")) meta.unlockedHeirlooms.push("旧猎魂笔记");
  if (game.world.metrics.historicalImpact >= 20 && !meta.unlockedTraits.includes("时代见证者")) meta.unlockedTraits.push("时代见证者");
  return saveMetaProgression(meta);
}

function tableCount(table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
}

export function getWorldCatalogStats(): WorldCatalogStatsView {
  return {
    birthProfiles: BIRTH_PROFILE_COUNT,
    characters: tableCount("canon_characters"),
    powerSnapshots: tableCount("canon_power_snapshots"),
    factions: tableCount("canon_factions"),
    locations: tableCount("canon_locations"),
    events: tableCount("canon_events"),
    soulBeasts: tableCount("canon_soul_beasts"),
    narrativeRules: tableCount("fanfiction_rules"),
  };
}
