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
import { BIRTH_PROFILE_COUNT, MARTIAL_SOUL_CATALOG_STATS } from "./domain/generator.js";

const databasePath = process.env.DOULUO_DATA_DIR
  ? resolve(process.env.DOULUO_DATA_DIR, "douluo.db")
  : resolve(process.cwd(), ".data", "douluo.db");
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode = WAL;");
database.exec("PRAGMA foreign_keys = ON;");
database.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0
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

  CREATE TABLE IF NOT EXISTS rewarded_runs (
    game_id TEXT PRIMARY KEY,
    settlement_json TEXT NOT NULL,
    rewarded_at TEXT NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
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

const gameColumns = database.prepare("PRAGMA table_info(games)").all() as Array<{ name: string }>;
if (!gameColumns.some((column) => column.name === "revision")) database.exec("ALTER TABLE games ADD COLUMN revision INTEGER NOT NULL DEFAULT 0");

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
    database.exec(`
      DELETE FROM canon_power_snapshots;
      DELETE FROM canon_characters;
      DELETE FROM canon_factions;
      DELETE FROM canon_locations;
      DELETE FROM canon_events;
      DELETE FROM canon_soul_beasts;
      DELETE FROM fanfiction_rules;
    `);
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
  INSERT INTO games (id, state_json, created_at, updated_at, revision)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    state_json = excluded.state_json,
    updated_at = excluded.updated_at,
    revision = excluded.revision
  WHERE games.revision = ?
`);

const loadGameStatement = database.prepare("SELECT state_json FROM games WHERE id = ?");
const listGamesStatement = database.prepare("SELECT state_json FROM games ORDER BY updated_at DESC");
const eventCountStatement = database.prepare("SELECT COUNT(*) AS count FROM events WHERE game_id = ?");
const insertEventStatement = database.prepare(`
  INSERT INTO events (game_id, sequence, event_type, payload_json, created_at)
  VALUES (?, ?, ?, ?, ?)
`);
const deleteGameStatement = database.prepare("DELETE FROM games WHERE id = ?");
const deleteGameEventsStatement = database.prepare("DELETE FROM events WHERE game_id = ?");
const deleteGameCheckpointsStatement = database.prepare("DELETE FROM game_checkpoints WHERE game_id = ?");
const insertCheckpointStatement = database.prepare("INSERT INTO game_checkpoints (game_id, label, action_index, state_json, created_at) VALUES (?, ?, ?, ?, ?)");
const trimCheckpointsStatement = database.prepare("DELETE FROM game_checkpoints WHERE game_id = ? AND id NOT IN (SELECT id FROM game_checkpoints WHERE game_id = ? ORDER BY id DESC LIMIT 3)");

function writeGameAndEvent(game: StoredGame, eventType: string, payload: unknown): void {
  const expectedRevision = game.revision ?? 0;
  game.revision = expectedRevision + 1;
  const serialized = JSON.stringify(game);
  const saved = upsertGameStatement.run(game.view.id, serialized, game.view.createdAt, game.view.updatedAt, game.revision, expectedRevision);
  if (Number(saved.changes) === 0) {
    game.revision = expectedRevision;
    throw new Error("存档已被另一项操作更新，请载入最新存档后重试");
  }
  const countRow = eventCountStatement.get(game.view.id) as { count: number };
  insertEventStatement.run(game.view.id, countRow.count + 1, eventType, JSON.stringify(payload), new Date().toISOString());
}

function writeCheckpoint(game: StoredGame, label: string): void {
  insertCheckpointStatement.run(game.view.id, label.slice(0, 80), game.actionIndex, JSON.stringify(game), new Date().toISOString());
  trimCheckpointsStatement.run(game.view.id, game.view.id);
}

export function saveGame(game: StoredGame, eventType: string, payload: unknown = {}): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    writeGameAndEvent(game, eventType, payload);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function saveGameWithLegacyCost(game: StoredGame, cost: number, reason: string, eventType: string, payload: unknown = {}): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const meta = getMetaProgression();
    if (meta.legacyPoints < cost) throw new Error(`${reason}需要 ${cost} 传承点，当前只有 ${meta.legacyPoints} 点`);
    meta.legacyPoints -= cost;
    saveMetaProgression(meta);
    writeGameAndEvent(game, eventType, payload);
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
  database.exec("BEGIN IMMEDIATE");
  try {
    deleteGameCheckpointsStatement.run(id);
    deleteGameEventsStatement.run(id);
    const deleted = Number(deleteGameStatement.run(id).changes) > 0;
    database.exec("COMMIT");
    return deleted;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function closeDatabase(): void {
  database.close();
}

export function saveCheckpoint(game: StoredGame, label: string): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    writeCheckpoint(game, label);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function listCheckpoints(gameId: string): CheckpointSummary[] {
  return (database.prepare("SELECT id, label, action_index, created_at FROM game_checkpoints WHERE game_id = ? ORDER BY id DESC LIMIT 3").all(gameId) as Array<{ id: number; label: string; action_index: number; created_at: string }>).map((row) => ({ id: row.id, label: row.label, actionIndex: row.action_index, createdAt: row.created_at }));
}

export function restoreCheckpoint(gameId: string, checkpointId: number): StoredGame | undefined {
  const row = database.prepare("SELECT state_json FROM game_checkpoints WHERE id = ? AND game_id = ?").get(checkpointId, gameId) as { state_json: string } | undefined;
  if (!row) return undefined;
  const current = loadGame(gameId);
  const restored = ensureGameState(JSON.parse(row.state_json) as StoredGame);
  restored.revision = current?.revision ?? restored.revision;
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

function templateFromCodexEntry(entry: MartialSoulCodexEntryView): MartialSoulTemplate {
  const definition = metaSoulById(entry.id);
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

export function peekEquippedMartialSoul(): MartialSoulTemplate | undefined {
  const meta = getMetaProgression();
  const id = meta.equippedMartialSoulId;
  if (!id) return undefined;
  const entry = meta.martialSoulCodex.find((item) => item.id === id);
  if (!entry) return undefined;
  if (entry.completedRuns < 1 && entry.charges < 1) throw new Error("这个武魂的单次使用机会已经消耗");
  return templateFromCodexEntry(entry);
}

export function saveGameAndClaimEquippedMartialSoul(game: StoredGame, soulId: string, eventType: string, payload: unknown = {}): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const meta = getMetaProgression();
    if (meta.equippedMartialSoulId !== soulId) throw new Error("局外武魂装备状态已经变化，请重新选择角色");
    const entry = meta.martialSoulCodex.find((item) => item.id === soulId);
    if (!entry) throw new Error("尚未抽到这个武魂");
    if (entry.completedRuns < 1) {
      if (entry.charges < 1) throw new Error("这个武魂的单次使用机会已经消耗");
      entry.charges -= 1;
    }
    meta.equippedMartialSoulId = undefined;
    saveMetaProgression(meta);
    writeGameAndEvent(game, eventType, payload);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
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

function applyRunReward(game: StoredGame, settlement: RunSettlementView): boolean {
  if (!settlement.qualified) return false;
  const claim = database.prepare("INSERT OR IGNORE INTO rewarded_runs (game_id, settlement_json, rewarded_at) VALUES (?, ?, ?)")
    .run(game.view.id, JSON.stringify(settlement), new Date().toISOString());
  if (Number(claim.changes) === 0) return false;
  const meta = getMetaProgression();
  meta.completedRuns += 1;
  meta.legacyPoints += settlement.legacyPoints;
  meta.martialSoulDrawTickets += 1;
  const character = game.view.character;
  if (character) {
    const souls = character.martialSouls?.length ? character.martialSouls : [character.martialSoul];
    const ringSets = character.soulRingSets?.length ? character.soulRingSets : [character.soulRings];
    for (const soul of souls) if (!meta.unlockedMartialSouls.includes(soul.name)) meta.unlockedMartialSouls.push(soul.name);
    if (!meta.unlockedOrigins.includes(character.originName)) meta.unlockedOrigins.push(character.originName);
    meta.discoveredOrigins = Math.max(meta.discoveredOrigins, meta.unlockedOrigins.length - 1);
    for (const ring of ringSets.flat()) {
      const entry = `${ring.beastName} · ${ring.years}年`;
      if (!meta.codexEntries.includes(entry)) meta.codexEntries.push(entry);
    }
    for (const [index, soul] of souls.entries()) {
      const knownDefinition = META_MARTIAL_SOULS.find((item) => item.name === soul.name);
      let codex = meta.martialSoulCodex.find((item) => item.name === soul.name);
      if (!codex) {
        codex = {
          id: knownDefinition?.id ?? `world-${Buffer.from(soul.name).toString("hex")}`,
          name: soul.name, category: soul.category, description: soul.description,
          rarity: knownDefinition?.metaRarity ?? (soul.grade === "神话" ? "红色" : soul.grade === "传奇" ? "金色" : soul.grade === "稀有" ? "紫色" : soul.grade === "优秀" ? "蓝色" : "白色"),
          charges: 0, completedRuns: 0, enabled: true, initialSoulPowers: [],
          growthRoutes: knownDefinition?.growthRoutes ?? ["当前实战路线尚未形成"],
        };
        meta.martialSoulCodex.push(codex);
      }
      codex.completedRuns += 1;
      if (!codex.initialSoulPowers.includes(character.innateSoulPower)) codex.initialSoulPowers.push(character.innateSoulPower);
      const rings = ringSets[index] ?? [];
      const route = rings.length ? rings.map((ring) => `${ring.skillName}（${ring.years}年）`).join(" → ") : index === 0 ? "无魂环通关路线" : "本局作为副武魂觉醒，尚未开始附加魂环";
      if (!codex.growthRoutes.includes(route)) codex.growthRoutes.push(route);
    }
    meta.discoveredMartialSouls = meta.martialSoulCodex.length;
  }
  if (game.world.metrics.completedHunts >= 1 && !meta.unlockedHeirlooms.includes("旧猎魂笔记")) meta.unlockedHeirlooms.push("旧猎魂笔记");
  if (game.world.metrics.historicalImpact >= 20 && !meta.unlockedTraits.includes("时代见证者")) meta.unlockedTraits.push("时代见证者");
  saveMetaProgression(meta);
  return true;
}

export function recordRunSettlement(game: StoredGame, settlement: RunSettlementView): MetaProgressionView {
  database.exec("BEGIN IMMEDIATE");
  try {
    applyRunReward(game, settlement);
    database.exec("COMMIT");
    return getMetaProgression();
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function commitResolvedAction(previous: StoredGame, resolved: StoredGame, checkpointLabel: string, eventType: string, payload: unknown, settlement?: RunSettlementView): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    writeCheckpoint(previous, checkpointLabel);
    if (settlement) applyRunReward(resolved, settlement);
    writeGameAndEvent(resolved, eventType, payload);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function saveSettledGame(game: StoredGame, settlement: RunSettlementView, eventType: string): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    applyRunReward(game, settlement);
    writeGameAndEvent(game, eventType, settlement);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function tableCount(table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
}

export function getWorldCatalogStats(): WorldCatalogStatsView {
  return {
    birthProfiles: BIRTH_PROFILE_COUNT,
    martialSouls: MARTIAL_SOUL_CATALOG_STATS.total + META_MARTIAL_SOULS.length,
    characters: tableCount("canon_characters"),
    powerSnapshots: tableCount("canon_power_snapshots"),
    factions: tableCount("canon_factions"),
    locations: tableCount("canon_locations"),
    events: tableCount("canon_events"),
    soulBeasts: tableCount("canon_soul_beasts"),
    narrativeRules: tableCount("fanfiction_rules"),
  };
}
