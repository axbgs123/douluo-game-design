import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SaveSummary } from "../shared/game.js";
import type { StoredGame } from "./domain/model.js";

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
`);

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
  return row ? JSON.parse(row.state_json) as StoredGame : undefined;
}

export function listSaves(): SaveSummary[] {
  const rows = listGamesStatement.all() as Array<{ state_json: string }>;
  return rows.map(({ state_json }) => {
    const game = JSON.parse(state_json) as StoredGame;
    return {
      id: game.view.id,
      characterName: game.view.character?.name
        ?? game.view.candidates.find((candidate) => candidate.id === game.view.selectedCandidateId)?.name
        ?? "未选择角色",
      status: game.view.status,
      location: game.view.location ?? "命运选择",
      updatedAt: game.view.updatedAt,
    };
  });
}
