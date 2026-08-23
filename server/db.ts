import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MetaProgressionView, RunSettlementView, SaveSummary, WorldCatalogStatsView } from "../shared/game.js";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, SOUL_BEASTS } from "./data/world.js";
import type { StoredGame } from "./domain/model.js";
import { ensureGameState } from "./domain/world.js";

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
`);

function seedCanonCatalog(): void {
  const characterStatement = database.prepare("INSERT OR REPLACE INTO canon_characters (id, name, importance, data_json) VALUES (?, ?, ?, ?)");
  const snapshotStatement = database.prepare("INSERT OR REPLACE INTO canon_power_snapshots (character_id, year, soul_rank, tier, note) VALUES (?, ?, ?, ?, ?)");
  const factionStatement = database.prepare("INSERT OR REPLACE INTO canon_factions (id, name, data_json) VALUES (?, ?, ?)");
  const locationStatement = database.prepare("INSERT OR REPLACE INTO canon_locations (id, name, data_json) VALUES (?, ?, ?)");
  const eventStatement = database.prepare("INSERT OR REPLACE INTO canon_events (id, year, title, data_json) VALUES (?, ?, ?, ?)");
  const beastStatement = database.prepare("INSERT OR REPLACE INTO canon_soul_beasts (id, name, data_json) VALUES (?, ?, ?)");
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

export function getMetaProgression(): MetaProgressionView {
  const row = database.prepare("SELECT state_json FROM meta_profile WHERE id = 'local'").get() as { state_json: string };
  const stored = JSON.parse(row.state_json) as Partial<MetaProgressionView>;
  return {
    ...defaultMetaProgression,
    ...stored,
    weightPreferences: { ...defaultMetaProgression.weightPreferences, ...stored.weightPreferences },
    purchasedUpgrades: { ...defaultMetaProgression.purchasedUpgrades, ...stored.purchasedUpgrades },
  };
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
  meta.completedRuns += 1;
  meta.legacyPoints += settlement.legacyPoints;
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
    characters: tableCount("canon_characters"),
    powerSnapshots: tableCount("canon_power_snapshots"),
    factions: tableCount("canon_factions"),
    locations: tableCount("canon_locations"),
    events: tableCount("canon_events"),
    soulBeasts: tableCount("canon_soul_beasts"),
  };
}
