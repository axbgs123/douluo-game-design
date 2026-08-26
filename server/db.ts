import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID } from "node:crypto";
import type { CheckpointSummary, MartialSoulCodexEntryView, MetaProgressionView, MetaSummonResultView, ModelUsageView, OriginCodexEntryView, RunSettlementView, SaveSummary, WorldCatalogStatsView } from "../shared/game.js";
import type { MartialSoulTemplate } from "./domain/model.js";
import { META_MARTIAL_SOULS, META_MARTIAL_SOUL_POOL_SIZE, metaSoulById } from "./data/meta-martial-souls.js";
import { META_HEIRLOOMS } from "./data/meta-heirlooms.js";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, LOCATIONS, SOUL_BEASTS, locationActiveAtYear, locationProfileAtYear } from "./data/world.js";
import { FANFICTION_RULES } from "./data/fanfiction-rules.js";
import type { StoredGame } from "./domain/model.js";
import { canonicalFactionIdsAtDate, characterCurrentGoalAtDate, characterPublicNameAtDate, ensureGameState } from "./domain/world.js";
import { BIRTH_PROFILE_COUNT, MARTIAL_SOUL_CATALOG_NAMES, META_ORIGIN_POOL, META_ORIGIN_POOL_SIZE, selectCandidate } from "./domain/generator.js";
import { bytesToVector, embedMemoryText, vectorSimilarity, vectorToBytes, VECTOR_MEMORY_DIMENSIONS } from "./domain/vector-memory.js";
import { WORLD_SOCIAL_LAWS } from "./data/world-social-laws.js";
import { CANON_RELATIONSHIPS } from "./data/canon-relationships.js";
import { WORLD_REACTION_LOGIC } from "./data/world-reaction-logic.js";
import { CHARACTER_LIFE_STAGES } from "./data/character-life-stages.js";

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

  CREATE TABLE IF NOT EXISTS model_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    role TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    prompt_chars INTEGER NOT NULL,
    output_chars INTEGER NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_model_calls_game_created ON model_calls(game_id, id DESC);

  CREATE TABLE IF NOT EXISTS context_retrievals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    role TEXT NOT NULL,
    action_index INTEGER NOT NULL,
    memory_count INTEGER NOT NULL,
    canon_count INTEGER NOT NULL,
    logic_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_context_retrievals_game_created
  ON context_retrievals(game_id, id DESC);

  CREATE TABLE IF NOT EXISTS vector_memories (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    source_key TEXT NOT NULL,
    action_index INTEGER NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    vector_blob BLOB NOT NULL,
    importance REAL NOT NULL,
    year INTEGER NOT NULL,
    day INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(game_id, source_key),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_vector_memories_game_action
  ON vector_memories(game_id, action_index DESC);

  CREATE TABLE IF NOT EXISTS memory_chapters (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    start_action_index INTEGER NOT NULL,
    end_action_index INTEGER NOT NULL,
    summary TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    vector_blob BLOB NOT NULL,
    importance REAL NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(game_id, chapter_number),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_memory_chapters_game_range
  ON memory_chapters(game_id, start_action_index, end_action_index);

  CREATE TABLE IF NOT EXISTS canon_knowledge_vectors (
    id TEXT PRIMARY KEY,
    source_key TEXT NOT NULL UNIQUE,
    era INTEGER NOT NULL,
    kind TEXT NOT NULL,
    subject_id TEXT,
    subject_name TEXT NOT NULL,
    valid_from_year INTEGER NOT NULL,
    valid_until_year INTEGER NOT NULL,
    text TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    vector_blob BLOB NOT NULL,
    importance REAL NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_canon_knowledge_era_year
  ON canon_knowledge_vectors(era, valid_from_year, valid_until_year);

  CREATE TABLE IF NOT EXISTS world_logic_vectors (
    id TEXT PRIMARY KEY,
    source_key TEXT NOT NULL UNIQUE,
    era INTEGER NOT NULL,
    category TEXT NOT NULL,
    trigger_text TEXT NOT NULL,
    logic_text TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    vector_blob BLOB NOT NULL,
    importance REAL NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_world_logic_era_category
  ON world_logic_vectors(era, category);

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

const contextRetrievalColumns = database.prepare("PRAGMA table_info(context_retrievals)").all() as Array<{ name: string }>;
if (!contextRetrievalColumns.some((column) => column.name === "chapter_count")) database.exec("ALTER TABLE context_retrievals ADD COLUMN chapter_count INTEGER NOT NULL DEFAULT 0");
if (!contextRetrievalColumns.some((column) => column.name === "memory_keys_json")) database.exec("ALTER TABLE context_retrievals ADD COLUMN memory_keys_json TEXT NOT NULL DEFAULT '[]'");
if (!contextRetrievalColumns.some((column) => column.name === "canon_keys_json")) database.exec("ALTER TABLE context_retrievals ADD COLUMN canon_keys_json TEXT NOT NULL DEFAULT '[]'");
if (!contextRetrievalColumns.some((column) => column.name === "logic_keys_json")) database.exec("ALTER TABLE context_retrievals ADD COLUMN logic_keys_json TEXT NOT NULL DEFAULT '[]'");

export interface RetrievedVectorMemory {
  id: string;
  kind: string;
  text: string;
  actionIndex: number;
  year: number;
  day: number;
  importance: number;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface VectorMemoryInput {
  gameId: string;
  sourceKey: string;
  actionIndex: number;
  kind: "action" | "choice" | "npc" | "intelligence" | "continuity";
  text: string;
  importance?: number;
  year?: number;
  day?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryChapterInput {
  gameId: string;
  chapterNumber: number;
  title: string;
  startActionIndex: number;
  endActionIndex: number;
  summary: string;
  importance?: number;
  metadata?: Record<string, unknown>;
}

export interface RetrievedMemoryChapter {
  chapterNumber: number;
  title: string;
  startActionIndex: number;
  endActionIndex: number;
  summary: string;
  importance: number;
  similarity: number;
}

const upsertVectorMemoryStatement = database.prepare(`
  INSERT INTO vector_memories (id, game_id, source_key, action_index, kind, text, metadata_json, vector_blob, importance, year, day, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(game_id, source_key) DO UPDATE SET
    action_index = excluded.action_index,
    kind = excluded.kind,
    text = excluded.text,
    metadata_json = excluded.metadata_json,
    vector_blob = excluded.vector_blob,
    importance = excluded.importance,
    year = excluded.year,
    day = excluded.day,
    created_at = excluded.created_at
`);

export function storeVectorMemory(input: VectorMemoryInput): void {
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, 2_400);
  if (!text) return;
  const vector = embedMemoryText(text);
  upsertVectorMemoryStatement.run(
    randomUUID(), input.gameId, input.sourceKey.slice(0, 160), Math.max(0, input.actionIndex), input.kind,
    text, JSON.stringify(input.metadata ?? {}), vectorToBytes(vector), Math.max(0, Math.min(1, input.importance ?? 0.6)),
    input.year ?? 0, input.day ?? 1, new Date().toISOString(),
  );
  database.prepare(`DELETE FROM vector_memories WHERE id IN (
    SELECT id FROM vector_memories WHERE game_id = ? ORDER BY importance DESC, action_index DESC LIMIT -1 OFFSET 2000
  )`).run(input.gameId);
}

const upsertMemoryChapterStatement = database.prepare(`
  INSERT INTO memory_chapters (id, game_id, chapter_number, title, start_action_index, end_action_index, summary, metadata_json, vector_blob, importance, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(game_id, chapter_number) DO UPDATE SET
    title = excluded.title,
    start_action_index = MIN(memory_chapters.start_action_index, excluded.start_action_index),
    end_action_index = MAX(memory_chapters.end_action_index, excluded.end_action_index),
    summary = excluded.summary,
    metadata_json = excluded.metadata_json,
    vector_blob = excluded.vector_blob,
    importance = MAX(memory_chapters.importance, excluded.importance),
    updated_at = excluded.updated_at
`);

export function storeMemoryChapter(input: MemoryChapterInput): void {
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 40) || `第${input.chapterNumber}章`;
  const summary = input.summary.replace(/\s+/g, " ").trim().slice(0, 3_600);
  if (!summary) return;
  const start = Math.max(0, Math.min(input.startActionIndex, input.endActionIndex));
  const end = Math.max(start, input.endActionIndex);
  upsertMemoryChapterStatement.run(
    randomUUID(), input.gameId, Math.max(1, input.chapterNumber), title, start, end, summary,
    JSON.stringify(input.metadata ?? {}), vectorToBytes(embedMemoryText(`${title} ${summary}`)),
    Math.max(0, Math.min(1, input.importance ?? .72)), new Date().toISOString(),
  );
}

function chapterSummaryFromLedger(game: StoredGame, startActionIndex: number): string {
  const entries = game.world.actionLedger.filter((entry) => entry.index >= startActionIndex && entry.index <= game.actionIndex).slice(-24);
  return entries.map((entry) => `${entry.year}年${entry.day}日，${entry.action}；结果：${entry.result}`).join(" ").slice(-3_600);
}

function storeCurrentMemoryChapter(game: StoredGame): void {
  if (game.actionIndex <= 0) return;
  const existing = database.prepare("SELECT start_action_index FROM memory_chapters WHERE game_id = ? AND chapter_number = ?").get(game.view.id, game.storyMemory.chapterNumber) as { start_action_index: number } | undefined;
  const start = existing?.start_action_index ?? game.actionIndex;
  const summary = chapterSummaryFromLedger(game, start);
  if (!summary) return;
  storeMemoryChapter({
    gameId: game.view.id,
    chapterNumber: game.storyMemory.chapterNumber,
    title: game.storyMemory.chapterTitle,
    startActionIndex: start,
    endActionIndex: game.actionIndex,
    summary,
    importance: game.storyMemory.keyChoices.length ? .84 : .72,
    metadata: { source: "actionLedger", playerKnownOnly: true },
  });
}

function ensureMemoryChapterBackfill(game: StoredGame): void {
  const count = database.prepare("SELECT COUNT(*) AS count FROM memory_chapters WHERE game_id = ?").get(game.view.id) as { count: number };
  if (Number(count.count) > 0 || game.actionIndex <= 0) return;
  const first = game.world.actionLedger[0]?.index ?? 1;
  const summary = chapterSummaryFromLedger(game, first);
  if (!summary) return;
  storeMemoryChapter({ gameId: game.view.id, chapterNumber: game.storyMemory.chapterNumber, title: game.storyMemory.chapterTitle, startActionIndex: first, endActionIndex: game.actionIndex, summary, metadata: { source: "legacy-actionLedger", playerKnownOnly: true } });
}

export function retrieveMemoryChapters(game: StoredGame, query: string, limit = 3): RetrievedMemoryChapter[] {
  ensureMemoryChapterBackfill(game);
  const queryVector = embedMemoryText(query);
  const rows = database.prepare(`SELECT chapter_number, title, start_action_index, end_action_index, summary, vector_blob, importance
    FROM memory_chapters WHERE game_id = ? AND start_action_index <= ?`).all(game.view.id, game.actionIndex) as Array<{ chapter_number: number; title: string; start_action_index: number; end_action_index: number; summary: string; vector_blob: Uint8Array; importance: number }>;
  return rows.map((row) => {
    const similarity = vectorSimilarity(queryVector, bytesToVector(row.vector_blob));
    const recency = game.actionIndex > 0 ? Math.max(0, 1 - (game.actionIndex - row.end_action_index) / Math.max(24, game.actionIndex)) : 1;
    const score = similarity * .78 + row.importance * .15 + recency * .07;
    return { chapterNumber: row.chapter_number, title: row.title, startActionIndex: row.start_action_index, endActionIndex: Math.min(row.end_action_index, game.actionIndex), summary: row.summary, importance: row.importance, similarity: Number(score.toFixed(4)) };
  }).filter((item) => item.similarity > .08).sort((left, right) => right.similarity - left.similarity || right.endActionIndex - left.endActionIndex).slice(0, Math.max(1, Math.min(6, limit)));
}

function ensureVectorMemoryBackfill(game: StoredGame): void {
  const sourceKeys = new Set((database.prepare("SELECT source_key FROM vector_memories WHERE game_id = ?").all(game.view.id) as Array<{ source_key: string }>).map((row) => row.source_key));
  for (const entry of game.world.actionLedger) if (!sourceKeys.has(`action:${entry.index}`) && !sourceKeys.has(`ledger:${entry.index}`)) storeVectorMemory({
    gameId: game.view.id,
    sourceKey: `ledger:${entry.index}`,
    actionIndex: entry.index,
    kind: "action",
    text: `${entry.year}年${entry.day}日，玩家行动：${entry.action}。程序结果：${entry.result}`,
    importance: 0.65,
    year: entry.year,
    day: entry.day,
    metadata: { intent: entry.intent, source: "actionLedger" },
  });
  game.storyMemory.keyChoices.forEach((choice, index) => {
    if (sourceKeys.has(`choice:${index}`)) return;
    storeVectorMemory({
      gameId: game.view.id, sourceKey: `choice:${index}`, actionIndex: Math.max(0, game.actionIndex - game.storyMemory.keyChoices.length + index + 1),
      kind: "choice", text: `玩家已经作出的关键选择：${choice}`, importance: 0.9,
      year: game.view.worldTime?.year, day: game.view.worldTime?.day, metadata: { source: "storyMemory.keyChoices" },
    });
  });
  for (const [name, note] of Object.entries(game.storyMemory.npcNotes)) storeVectorMemory({
    gameId: game.view.id, sourceKey: `npc:${name}`, actionIndex: game.storyMemory.lastUpdatedAction,
    kind: "npc", text: `${name}与玩家之间应延续的已知互动：${note}`, importance: 0.82,
    year: game.view.worldTime?.year, day: game.view.worldTime?.day, metadata: { npcName: name, source: "storyMemory.npcNotes" },
  });
  for (const item of game.view.intelligence.slice(0, 80)) storeVectorMemory({
    gameId: game.view.id, sourceKey: `intelligence:${item.id}`, actionIndex: game.actionIndex,
    kind: "intelligence", text: `已知情报：${item.title}。${item.detail}。来源：${item.source}，状态：${item.status}`, importance: item.status === "确定" ? 0.78 : 0.58,
    year: game.view.worldTime?.year, day: game.view.worldTime?.day, metadata: { subjectId: item.subjectId, confidence: item.confidence, acquiredAt: item.acquiredAt, source: "intelligence" },
  });
}

export function retrieveVectorMemories(game: StoredGame, query: string, limit = 8): RetrievedVectorMemory[] {
  ensureVectorMemoryBackfill(game);
  const chapters = retrieveMemoryChapters(game, query, 3);
  const queryVector = embedMemoryText(query);
  const rows = database.prepare(`
    SELECT id, kind, text, action_index, metadata_json, vector_blob, importance, year, day
    FROM vector_memories WHERE game_id = ? AND action_index <= ?
  `).all(game.view.id, game.actionIndex) as Array<{ id: string; kind: string; text: string; action_index: number; metadata_json: string; vector_blob: Uint8Array; importance: number; year: number; day: number }>;
  const scopedRows = chapters.length ? rows.filter((row) => !["action", "choice", "continuity"].includes(row.kind) || chapters.some((chapter) => row.action_index >= chapter.startActionIndex && row.action_index <= chapter.endActionIndex)) : rows;
  return scopedRows.map((row) => {
    const similarity = vectorSimilarity(queryVector, bytesToVector(row.vector_blob));
    const recency = game.actionIndex > 0 ? Math.max(0, 1 - (game.actionIndex - row.action_index) / Math.max(20, game.actionIndex)) : 1;
    const score = similarity * 0.78 + row.importance * 0.15 + recency * 0.07;
    return {
      id: row.id, kind: row.kind, text: row.text, actionIndex: row.action_index, year: row.year, day: row.day,
      importance: row.importance, similarity: Number(score.toFixed(4)), metadata: {
        ...(JSON.parse(row.metadata_json) as Record<string, unknown>),
        retrievalPhase: chapters.length ? "chapter-scene" : "direct-scene",
        chapterNumber: chapters.find((chapter) => row.action_index >= chapter.startActionIndex && row.action_index <= chapter.endActionIndex)?.chapterNumber,
        chapterTitle: chapters.find((chapter) => row.action_index >= chapter.startActionIndex && row.action_index <= chapter.endActionIndex)?.title,
      },
    };
  }).filter((item) => item.similarity > 0.08).sort((left, right) => right.similarity - left.similarity || right.actionIndex - left.actionIndex).slice(0, Math.max(1, Math.min(16, limit)));
}

export interface RetrievedCanonKnowledge {
  kind: string;
  subjectId?: string;
  subjectName: string;
  text: string;
  importance: number;
  similarity: number;
  metadata: Record<string, unknown>;
}

function eraAtYear(year: number): 1 | 2 | 3 | 4 {
  return year >= 25_000 ? 4 : year >= 15_000 ? 3 : year >= 5_000 ? 2 : 1;
}

function storeCanonKnowledge(input: { sourceKey: string; era: number; kind: string; subjectId?: string; subjectName: string; validFromYear?: number; validUntilYear?: number; text: string; importance: number; metadata?: Record<string, unknown> }): void {
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, 2_800);
  if (!text) return;
  database.prepare(`
    INSERT INTO canon_knowledge_vectors (id, source_key, era, kind, subject_id, subject_name, valid_from_year, valid_until_year, text, metadata_json, vector_blob, importance, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_key) DO UPDATE SET era=excluded.era, kind=excluded.kind, subject_id=excluded.subject_id,
      subject_name=excluded.subject_name, valid_from_year=excluded.valid_from_year, valid_until_year=excluded.valid_until_year,
      text=excluded.text, metadata_json=excluded.metadata_json, vector_blob=excluded.vector_blob, importance=excluded.importance, updated_at=excluded.updated_at
  `).run(randomUUID(), input.sourceKey, input.era, input.kind, input.subjectId ?? null, input.subjectName, input.validFromYear ?? -100_000, input.validUntilYear ?? 100_000, text, JSON.stringify(input.metadata ?? {}), vectorToBytes(embedMemoryText(text)), Math.max(0, Math.min(1, input.importance)), new Date().toISOString());
}

const EARLY_ACADEMY_CANON = [
  { era: 1, subjectId: "d1-early-academy", subjectName: "斗一初级学院与首环", from: -100_000, until: 4_999, text: "斗一基层工读名额由具体村庄或地方责任人提供，减免学费住宿通常伴随适龄校内劳动；普通付费学员与工读生不是同一身份。初级学院生活包括注册、宿舍、课程、同辈关系与现实生活费用。第一魂环还需要有知识与权限的魂师、受管控猎魂区凭证、市场补给、路程、目标习性和撤退判断。" },
  { era: 2, subjectId: "d2-shrek-freshman", subjectName: "斗二史莱克新生制度", from: 5_000, until: 14_999, text: "斗二史莱克新生存在真实报名、学费、宿舍、校服或徽章、班主任与周期考核。获得面试或推荐资格不等于能够长期留校，新生仍要通过后续考核。武魂系、魂导系和不同班主任的课程责任不能写成同一种通用学院流程。" },
  { era: 3, subjectId: "d3-primary-academy", subjectName: "斗三初等学院与东海升学", from: 15_000, until: 24_999, text: "斗三适龄初等教育中，觉醒伴生魂力的孩子进入魂师班，班主任承担连续基础教学并会因学生毕业与表现受到职业影响。初级阶段成为魂师可形成后续中级学院推荐资格；东海学院报到仍需要推荐、接待、分班和现实旅途，不能从觉醒日直接跳到零班或高阶培养。" },
  { era: 4, subjectId: "d4-tianluo-primary", subjectName: "斗四天罗初等学院", from: 25_000, until: 100_000, text: "斗四天罗初等魂师学院的早期生活包括年龄与报名核验、新生分班、正班主任负责教学、副班主任负责生活、体能记录和有教师看护的班级实战。高能少年班属于后续选拔，不是所有六岁觉醒者当天自动获得的身份。私人导师教学仍受家庭知情、安全和实际权限约束。" },
] as const;

function seedCanonKnowledge(): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const validKeys: string[] = [];
    for (const character of CANON_CHARACTERS) {
      const explicitStages = CHARACTER_LIFE_STAGES.filter((item) => item.characterId === character.id);
      const genericFirstYear = Math.min(...character.powerSnapshots.map((item) => item.year));
      const stages = explicitStages.length ? explicitStages : Number.isFinite(genericFirstYear) ? [{ characterId: character.id, validFromYear: genericFirstYear, validFromDay: 1, validUntilYear: character.deathYear, validUntilDay: 360, publicName: characterPublicNameAtDate(character.id, genericFirstYear, 1), currentGoal: characterCurrentGoalAtDate(character.id, genericFirstYear, 1), publicFactionIds: canonicalFactionIdsAtDate(character.id, genericFirstYear, 1) }] : [];
      stages.forEach((stage, index) => {
        const sourceKey = `character:${character.id}:stage:${index}:${stage.validFromYear}:${stage.validFromDay ?? 1}`;
        validKeys.push(sourceKey);
        const factionNames = stage.publicFactionIds.map((id) => FACTIONS.find((item) => item.id === id)?.name ?? id);
        storeCanonKnowledge({ sourceKey, era: eraAtYear(stage.validFromYear), kind: "character", subjectId: character.id, subjectName: stage.publicName,
          validFromYear: stage.validFromYear, validUntilYear: stage.validUntilYear ?? character.deathYear ?? 100_000, importance: character.importance / 5,
          text: `${stage.publicName}在这一时点的性格惯性为${character.personality.join("、")}。当前目标：${stage.currentGoal}。当前可证公开势力：${factionNames.join("、") || "暂无"}。本时间片不提供后来才形成的称号、武魂变化、关系结果、势力归属或人生目标。`,
          metadata: { hidden: Boolean(character.hidden), personality: character.personality, publicName: stage.publicName, publicFactionIds: stage.publicFactionIds, validFromDay: stage.validFromDay ?? 1, validUntilYear: stage.validUntilYear ?? character.deathYear ?? 100_000, validUntilDay: stage.validUntilDay ?? 360, sourceType: "结构化人物人生阶段" } });
      });
      const snapshots = [...character.powerSnapshots].sort((left, right) => left.year - right.year);
      snapshots.forEach((snapshot, index) => {
        const publicName = characterPublicNameAtDate(character.id, snapshot.year, 1);
        const unpublicNames = [character.name, ...character.aliases].filter((name) => name !== publicName);
        if (unpublicNames.some((name) => `${snapshot.tier}${snapshot.note}`.includes(name))) return;
        const currentGoal = characterCurrentGoalAtDate(character.id, snapshot.year, 1);
        const currentFactions = canonicalFactionIdsAtDate(character.id, snapshot.year, 1).map((id) => FACTIONS.find((item) => item.id === id)?.name ?? id);
        const snapshotKey = `character:${character.id}:timeline:${snapshot.year}`;
        validKeys.push(snapshotKey);
        storeCanonKnowledge({ sourceKey: snapshotKey, era: eraAtYear(snapshot.year), kind: "character-timeline", subjectId: character.id, subjectName: publicName,
          validFromYear: snapshot.year, validUntilYear: snapshots[index + 1] ? snapshots[index + 1].year - 1 : character.deathYear ?? 100_000,
          importance: character.importance / 5, text: `${publicName}在原作${snapshot.year}年前后的已证生命阶段：${snapshot.tier}${snapshot.soulRank !== undefined ? `，公开魂力约${snapshot.soulRank}级` : ""}。阶段事实：${snapshot.note}。当前目标：${currentGoal}。当前可证公开势力：${currentFactions.join("、") || "暂无"}。不得据此推导下一时间片的称号、力量、关系或归属。`,
          metadata: { soulRank: snapshot.soulRank, tier: snapshot.tier, hidden: Boolean(character.hidden), publicName, publicFactionIds: canonicalFactionIdsAtDate(character.id, snapshot.year, 1), validFromDay: 1, sourceType: "结构化原著时间线" } });
      });
    }
    for (const faction of FACTIONS) {
      const headquarters = LOCATIONS.find((item) => item.id === faction.headquartersId);
      const provenanceBoundary = faction.provenance === "原著" ? "以下是原著势力的结构化资料。" : faction.provenance === "原著归纳" ? "以下势力依据原著信息归纳，完整称谓或组织边界不是原著原话。" : "以下是同人原创势力，不是原著既有组织。";
      const sourceKey = `faction:${faction.id}`; validKeys.push(sourceKey);
      storeCanonKnowledge({ sourceKey, era: faction.activeFromYear === undefined ? 1 : eraAtYear(faction.activeFromYear), kind: "faction", subjectId: faction.id, subjectName: faction.name,
        validFromYear: faction.activeFromYear, validUntilYear: faction.activeUntilYear, importance: faction.inertia / 5,
        text: `${provenanceBoundary}${faction.name}是${faction.kind}，总部或核心据点为${headquarters?.name ?? faction.headquartersId}${headquarters && headquarters.provenance !== "原著" ? `（${headquarters.provenance}地点）` : ""}。${faction.description}。组织会先维护自身存续、资源、名誉、派系与制度权限，不会因为玩家身份自动让步。`,
        metadata: { hidden: Boolean(faction.hidden), inertia: faction.inertia, provenance: faction.provenance, sourceType: faction.provenance === "原著" ? "结构化原著势力" : faction.provenance === "原著归纳" ? "原著归纳势力" : "同人原创势力" } });
    }
    const eraWindows = [{ era: 1, year: 0, from: -100_000, until: 4_999 }, { era: 2, year: 10_000, from: 5_000, until: 14_999 }, { era: 3, year: 20_000, from: 15_000, until: 24_999 }, { era: 4, year: 30_000, from: 25_000, until: 100_000 }];
    for (const location of LOCATIONS) {
      const provenanceBoundary = location.provenance === "原著" ? "以下是原著可证地点的结构化资料。" : location.provenance === "原著归纳" ? "以下地点以原著地理为基础，但完整标签或功能是项目归纳，不得当作原著原话。" : "以下是同人原创地点，不是原著既有专名。";
      for (const window of eraWindows.filter((item) => locationActiveAtYear(location, item.year))) {
        const profile = locationProfileAtYear(location, window.year);
        const sourceKey = `location:${location.id}:era:${window.era}`; validKeys.push(sourceKey);
        storeCanonKnowledge({ sourceKey, era: window.era, kind: "location", subjectId: location.id, subjectName: location.name,
          validFromYear: Math.max(location.availableFromYear ?? -100_000, window.from), validUntilYear: window.until, importance: location.danger === "禁区" ? .9 : location.danger === "高" ? .75 : .55,
          text: `${provenanceBoundary}${location.name}位于${profile.region}，危险度${location.danger}。${profile.description}。路线和耗时只由当前游戏地图、交通、天气、凭证与补给结算，不属于原著事实。`,
          metadata: { hidden: Boolean(location.hidden), danger: location.danger, provenance: location.provenance, sourceType: location.provenance === "原著" ? "结构化原著地点" : location.provenance === "原著归纳" ? "原著归纳地点" : "同人原创地点" } });
      }
    }
    for (const event of CANON_EVENTS) {
      const sourceKey = `event:${event.id}`; validKeys.push(sourceKey);
      storeCanonKnowledge({ sourceKey, era: eraAtYear(event.year), kind: "event", subjectId: event.id, subjectName: event.title,
        validFromYear: event.year, validUntilYear: 100_000, importance: event.inertia / 5,
        text: `重要原著事件“${event.title}”的原作时间锚点为${event.year}年${event.day ?? 1}日，地点${LOCATIONS.find((item) => item.id === event.locationId)?.name ?? event.locationId ?? "跨地区"}。原著公开结果：${event.publicSummary}。没有玩家因果足迹时保持惯性；玩家实际改变参与者、资源、地点或势力条件后重新推演。`,
        metadata: { visibility: event.visibility ?? "公开", participantIds: event.participantIds, inertia: event.inertia, sourceType: "结构化原著事件" } });
    }
    for (const beast of SOUL_BEASTS) {
      const sourceKey = `soul-beast:${beast.id}`; validKeys.push(sourceKey);
      storeCanonKnowledge({ sourceKey, era: 0, kind: "soul-beast", subjectId: beast.id, subjectName: beast.name, importance: Math.min(1, .45 + beast.danger / 12),
        text: `${beast.name}常见于${beast.habitats.map((id) => { const habitat = LOCATIONS.find((item) => item.id === id); return `${habitat?.name ?? id}${habitat && habitat.provenance !== "原著" ? `（${habitat.provenance}地点）` : ""}`; }).join("、")}，属性${beast.attributes.join("、")}，通常年限${beast.ageRange[0]}至${beast.ageRange[1]}年，危险度${beast.danger}。可能形成${beast.possibleSkills.join("、")}方向魂技。${beast.description}。实际遭遇仍受地点生态、追踪证据和程序战斗结算限制。`,
        metadata: { danger: beast.danger, habitats: beast.habitats, sourceType: "结构化魂兽生态" } });
    }
    for (const relationship of CANON_RELATIONSHIPS) {
      const fromName = characterPublicNameAtDate(relationship.fromId, relationship.validFromYear, relationship.validFromDay ?? 1);
      const toName = characterPublicNameAtDate(relationship.toId, relationship.validFromYear, relationship.validFromDay ?? 1);
      const sourceKey = `relationship:${relationship.id}`; validKeys.push(sourceKey);
      storeCanonKnowledge({ sourceKey, era: relationship.era, kind: "relationship", subjectId: relationship.id, subjectName: `${fromName}—${toName}`,
        validFromYear: relationship.validFromYear, validUntilYear: relationship.validUntilYear, importance: relationship.importance,
        text: `${fromName}与${toName}在该阶段的原著关系：${relationship.relation}。形成依据：${relationship.basis}。互动惯性：${relationship.dynamics}。边界：${relationship.boundary}。当前存档中的共同经历和玩家因果可以改变这段关系。`,
        metadata: { fromId: relationship.fromId, toId: relationship.toId, validFromDay: relationship.validFromDay ?? 1, disclosure: "behavior-only", sourceType: "结构化原著关系" } });
    }
    for (const academy of EARLY_ACADEMY_CANON) {
      const sourceKey = `academy-system:${academy.subjectId}`; validKeys.push(sourceKey);
      storeCanonKnowledge({ sourceKey, era: academy.era, kind: "academy-system", subjectId: academy.subjectId, subjectName: academy.subjectName, validFromYear: academy.from, validUntilYear: academy.until, text: `以下是本地原著抽样形成的制度归纳，不是原著原话。${academy.text}原创玩家可以改变人物和结果，但不能倒灌其他时代制度。`, importance: .88, metadata: { provenance: "原著归纳", sourceType: "原著早期学院机制归纳" } });
    }
    if (validKeys.length) database.prepare(`DELETE FROM canon_knowledge_vectors WHERE source_key NOT IN (${validKeys.map(() => "?").join(",")})`).run(...validKeys);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function retrieveCanonKnowledge(game: StoredGame, query: string, limit = 10): RetrievedCanonKnowledge[] {
  const year = game.view.worldTime?.year ?? 0;
  const era = game.view.era ?? eraAtYear(year);
  const knownCharacterIds = new Set([
    ...game.view.knownFigures.map((item) => item.id),
    ...Object.values(game.world.npcs).filter((npc) => npc.knownToPlayer).map((npc) => npc.id),
  ]);
  const knownLocationIds = new Set([game.view.locationId, ...game.world.discoveredLocations, ...game.view.map.filter((item) => item.discovered || item.current).map((item) => item.id)]);
  const publicFactionIdsByEra: Record<1 | 2 | 3 | 4, string[]> = {
    1: ["spirit-hall", "heaven-dou", "star-luo", "shrek", "seven-treasure", "blue-lightning", "clear-sky"],
    2: ["sun-moon-empire", "heavenly-soul-empire", "dou-ling-empire", "star-luo", "shrek-era2-academy", "peerless-tang-sect"],
    3: ["douluo-federation", "spirit-pagoda", "war-god-temple", "d3-tang-sect", "star-luo-overseas", "dou-spirit-overseas"],
    4: ["douluo-federation", "spirit-pagoda", "d4-federal-fleet", "d4-first-fleet", "d4-second-fleet", "d4-third-fleet", "d4-fourth-fleet", "d4-fifth-fleet", "d4-sixth-fleet", "shrek-space-command", "senluo-planet", "elf-planet"],
  };
  const publiclyLearnedFactions = FACTIONS.filter((faction) => game.world.intelligenceRecords.some((record) => record.subjectType === "势力" && record.subjectId === faction.id && record.confidence >= 60) || game.view.news.some((item) => `${item.title}${item.detail}`.includes(faction.name)) || game.view.canonInfluences.some((item) => item.affects.includes(faction.name))).map((faction) => faction.id);
  const knownFactionIds = new Set([...publicFactionIdsByEra[era], ...publiclyLearnedFactions, ...game.view.affiliations.map((item) => item.id), ...game.view.managedFactions.map((item) => item.id)]);
  const knownCanonEventIds = new Set(CANON_EVENTS.filter((event) => game.world.firedCanonEvents.includes(event.id) && (game.view.news.some((item) => item.id === event.id || item.title === event.title || item.detail.includes(event.title)) || game.world.intelligenceRecords.some((item) => item.subjectId === event.id || item.title === event.title || item.detail.includes(event.title)))).map((event) => event.id));
  const queryVector = embedMemoryText(query);
  const rows = database.prepare(`SELECT kind, subject_id, subject_name, valid_from_year, text, metadata_json, vector_blob, importance FROM canon_knowledge_vectors WHERE (era = 0 OR era = ?) AND valid_from_year <= ? AND valid_until_year >= ?`).all(era, year, year) as Array<{ kind: string; subject_id?: string; subject_name: string; valid_from_year: number; text: string; metadata_json: string; vector_blob: Uint8Array; importance: number }>;
  return rows.map((row) => ({ ...row, metadata: JSON.parse(row.metadata_json) as Record<string, unknown>, rawSimilarity: vectorSimilarity(queryVector, bytesToVector(row.vector_blob)) }))
    .filter((row) => {
      if (row.kind === "relationship") {
        const fromId = String(row.metadata.fromId ?? ""); const toId = String(row.metadata.toId ?? "");
        const started = row.valid_from_year < year || (row.valid_from_year === year && Number(row.metadata.validFromDay ?? 1) <= (game.view.worldTime?.day ?? 1));
        return started && knownCharacterIds.has(fromId) && knownCharacterIds.has(toId);
      }
      if (row.kind === "character" || row.kind === "character-timeline") {
        const startsToday = row.valid_from_year < year || Number(row.metadata.validFromDay ?? 1) <= (game.view.worldTime?.day ?? 1);
        const untilYear = Number(row.metadata.validUntilYear ?? 100_000); const untilDay = Number(row.metadata.validUntilDay ?? 360);
        const notEnded = untilYear > year || (untilYear === year && untilDay >= (game.view.worldTime?.day ?? 1));
        return Boolean(row.subject_id && knownCharacterIds.has(row.subject_id) && startsToday && notEnded);
      }
      if (row.kind === "event") return Boolean(row.subject_id && knownCanonEventIds.has(row.subject_id));
      if (row.kind === "location") return Boolean((row.subject_id && knownLocationIds.has(row.subject_id)) || (!row.metadata.hidden && query.includes(row.subject_name)));
      if (row.kind === "faction") return Boolean(row.subject_id && knownFactionIds.has(row.subject_id));
      if (row.kind === "soul-beast") return query.includes(row.subject_name) || game.view.hunting?.targetBeastId === row.subject_id || game.view.hunting?.targetName === row.subject_name;
      if (row.kind === "academy-system") return /学院|入学|宿舍|班主任|同学|课程|考核|工读|魂环|猎魂|导师/.test(query);
      return false;
    }).map((row) => {
      const score = row.rawSimilarity * .84 + row.importance * .16;
      return { kind: row.kind, subjectId: row.subject_id, subjectName: row.subject_name, text: row.text, importance: row.importance, similarity: Number(score.toFixed(4)), metadata: row.metadata };
    }).filter((item) => item.similarity > .1).sort((left, right) => right.similarity - left.similarity).slice(0, Math.max(1, Math.min(20, limit)));
}

export interface RetrievedWorldLogic {
  category: string;
  trigger: string;
  logic: string;
  importance: number;
  similarity: number;
  metadata: Record<string, unknown>;
}

function seedWorldLogic(): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const validKeys: string[] = [];
    for (const law of WORLD_SOCIAL_LAWS) {
      const sourceKey = `social:${law.id}`; validKeys.push(sourceKey);
      const logic = `斗罗世界基础规律【${law.category}】：${law.text}`;
      database.prepare(`INSERT INTO world_logic_vectors (id, source_key, era, category, trigger_text, logic_text, metadata_json, vector_blob, importance, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(source_key) DO UPDATE SET era=excluded.era, category=excluded.category, trigger_text=excluded.trigger_text,
        logic_text=excluded.logic_text, metadata_json=excluded.metadata_json, vector_blob=excluded.vector_blob, importance=excluded.importance, updated_at=excluded.updated_at`).run(
        randomUUID(), sourceKey, law.era, law.category, law.category, logic, JSON.stringify({ type: "social-law", lawId: law.id }), vectorToBytes(embedMemoryText(`${law.category} ${logic}`)), law.importance, new Date().toISOString(),
      );
    }
    for (const rule of WORLD_REACTION_LOGIC) {
      const sourceKey = `reaction:${rule.id}`; validKeys.push(sourceKey);
      const logic = `触发：${rule.trigger}。前提：${rule.preconditions}。合理反应链：${rule.reactionChain}。必须留下：${rule.stateTrace}。禁止跳跃：${rule.forbiddenLeap}`;
      database.prepare(`INSERT INTO world_logic_vectors (id, source_key, era, category, trigger_text, logic_text, metadata_json, vector_blob, importance, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(source_key) DO UPDATE SET era=excluded.era, category=excluded.category, trigger_text=excluded.trigger_text,
        logic_text=excluded.logic_text, metadata_json=excluded.metadata_json, vector_blob=excluded.vector_blob, importance=excluded.importance, updated_at=excluded.updated_at`).run(
        randomUUID(), sourceKey, rule.era, rule.category, rule.trigger, logic, JSON.stringify({ type: "reaction-logic", ruleId: rule.id, preconditions: rule.preconditions, stateTrace: rule.stateTrace, forbiddenLeap: rule.forbiddenLeap }), vectorToBytes(embedMemoryText(`${rule.category} ${rule.trigger} ${logic}`)), rule.importance, new Date().toISOString(),
      );
    }
    if (validKeys.length) database.prepare(`DELETE FROM world_logic_vectors WHERE source_key NOT IN (${validKeys.map(() => "?").join(",")})`).run(...validKeys);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function retrieveWorldLogic(game: StoredGame, query: string, limit = 8): RetrievedWorldLogic[] {
  const era = game.view.era ?? eraAtYear(game.view.worldTime?.year ?? 0);
  const queryVector = embedMemoryText(query);
  const rows = database.prepare("SELECT category, trigger_text, logic_text, metadata_json, vector_blob, importance FROM world_logic_vectors WHERE era = 0 OR era = ?").all(era) as Array<{ category: string; trigger_text: string; logic_text: string; metadata_json: string; vector_blob: Uint8Array; importance: number }>;
  return rows.map((row) => {
    const similarity = vectorSimilarity(queryVector, bytesToVector(row.vector_blob)) * .84 + row.importance * .16;
    return { category: row.category, trigger: row.trigger_text, logic: row.logic_text, importance: row.importance, similarity: Number(similarity.toFixed(4)), metadata: JSON.parse(row.metadata_json) as Record<string, unknown> };
  }).filter((item) => item.similarity > .1).sort((left, right) => right.similarity - left.similarity).slice(0, Math.max(1, Math.min(16, limit)));
}

export function recordModelCall(input: { gameId: string; role: "intent" | "narrator"; model: string; status: "success" | "failure"; latencyMs: number; promptChars: number; outputChars: number; promptTokens?: number; completionTokens?: number; totalTokens?: number; errorCode?: string }): void {
  database.prepare("INSERT INTO model_calls (game_id, role, model, status, latency_ms, prompt_chars, output_chars, prompt_tokens, completion_tokens, total_tokens, error_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(input.gameId, input.role, input.model.slice(0, 120), input.status, Math.max(0, Math.round(input.latencyMs)), Math.max(0, input.promptChars), Math.max(0, input.outputChars), Math.max(0, input.promptTokens ?? 0), Math.max(0, input.completionTokens ?? 0), Math.max(0, input.totalTokens ?? 0), input.errorCode?.slice(0, 80) ?? null, new Date().toISOString());
}

export function recordContextRetrieval(input: { gameId: string; role: "intent" | "narrator"; actionIndex: number; memory: number; canon: number; logic: number; chapters?: number; memoryLabels?: string[]; canonLabels?: string[]; logicLabels?: string[] }): void {
  const labels = (items: string[] | undefined) => JSON.stringify((items ?? []).map((item) => item.replace(/\s+/g, " ").trim().slice(0, 80)).filter(Boolean).slice(0, 12));
  database.prepare("INSERT INTO context_retrievals (game_id, role, action_index, memory_count, canon_count, logic_count, chapter_count, memory_keys_json, canon_keys_json, logic_keys_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(input.gameId, input.role, input.actionIndex, input.memory, input.canon, input.logic, input.chapters ?? 0, labels(input.memoryLabels), labels(input.canonLabels), labels(input.logicLabels), new Date().toISOString());
  database.prepare("DELETE FROM context_retrievals WHERE game_id = ? AND id NOT IN (SELECT id FROM context_retrievals WHERE game_id = ? ORDER BY id DESC LIMIT 500)").run(input.gameId, input.gameId);
}

export function getModelUsage(gameId?: string): ModelUsageView {
  const where = gameId ? " WHERE game_id = ?" : "";
  const row = database.prepare(`SELECT COUNT(*) calls, SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) failures, COALESCE(SUM(prompt_tokens), 0) prompt_tokens, COALESCE(SUM(completion_tokens), 0) completion_tokens, COALESCE(SUM(total_tokens), 0) total_tokens, COALESCE(SUM(latency_ms), 0) total_latency_ms, MAX(created_at) last_call_at FROM model_calls${where}`).get(...(gameId ? [gameId] : [])) as { calls: number; failures: number; prompt_tokens: number; completion_tokens: number; total_tokens: number; total_latency_ms: number; last_call_at?: string };
  const vectorRow = database.prepare(`SELECT COUNT(*) AS count FROM vector_memories${gameId ? " WHERE game_id = ?" : ""}`).get(...(gameId ? [gameId] : [])) as { count: number };
  const chapterRow = database.prepare(`SELECT COUNT(*) AS count FROM memory_chapters${gameId ? " WHERE game_id = ?" : ""}`).get(...(gameId ? [gameId] : [])) as { count: number };
  const canonRow = database.prepare("SELECT COUNT(*) AS count FROM canon_knowledge_vectors").get() as { count: number };
  const logicRow = database.prepare("SELECT COUNT(*) AS count FROM world_logic_vectors").get() as { count: number };
  const retrievalWhere = gameId ? " WHERE game_id = ?" : "";
  const retrievalCount = database.prepare(`SELECT COUNT(*) AS count FROM context_retrievals${retrievalWhere}`).get(...(gameId ? [gameId] : [])) as { count: number };
  const narratorRetrievalCount = database.prepare(`SELECT COUNT(*) AS count FROM context_retrievals${gameId ? " WHERE game_id = ? AND role = 'narrator'" : " WHERE role = 'narrator'"}`).get(...(gameId ? [gameId] : [])) as { count: number };
  const lastRetrieval = database.prepare(`SELECT memory_count, canon_count, logic_count, chapter_count, memory_keys_json, canon_keys_json, logic_keys_json, created_at FROM context_retrievals${gameId ? " WHERE game_id = ? AND role = 'narrator'" : " WHERE role = 'narrator'"} ORDER BY id DESC LIMIT 1`).get(...(gameId ? [gameId] : [])) as { memory_count: number; canon_count: number; logic_count: number; chapter_count: number; memory_keys_json: string; canon_keys_json: string; logic_keys_json: string; created_at: string } | undefined;
  const contextRetrievalReady = Boolean(lastRetrieval && lastRetrieval.canon_count > 0 && lastRetrieval.logic_count > 0);
  const contextRetrievalStatus: ModelUsageView["contextRetrievalStatus"] = !lastRetrieval ? "未产生升级后正文样本" : contextRetrievalReady ? "最近正文已完成三层检索" : "最近正文检索不完整";
  const parseLabels = (value?: string): string[] => { try { const parsed = JSON.parse(value ?? "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 12) : []; } catch { return []; } };
  return { calls: Number(row.calls), failures: Number(row.failures), promptTokens: Number(row.prompt_tokens), completionTokens: Number(row.completion_tokens), totalTokens: Number(row.total_tokens), totalLatencyMs: Number(row.total_latency_ms), lastCallAt: row.last_call_at || undefined, vectorMemories: Number(vectorRow.count), memoryChapters: Number(chapterRow.count), vectorDimensions: VECTOR_MEMORY_DIMENSIONS, vectorRetrievalLimit: 8, chapterRetrievalLimit: 3, canonKnowledgeVectors: Number(canonRow.count), canonRetrievalLimit: 10, worldLogicVectors: Number(logicRow.count), worldLogicRetrievalLimit: 8, contextRetrievals: Number(retrievalCount.count), narratorContextRetrievals: Number(narratorRetrievalCount.count), contextRetrievalReady, contextRetrievalStatus, lastRetrievedMemoryCount: Number(lastRetrieval?.memory_count ?? 0), lastRetrievedChapterCount: Number(lastRetrieval?.chapter_count ?? 0), lastRetrievedCanonCount: Number(lastRetrieval?.canon_count ?? 0), lastRetrievedLogicCount: Number(lastRetrieval?.logic_count ?? 0), lastRetrievedMemoryLabels: parseLabels(lastRetrieval?.memory_keys_json), lastRetrievedCanonLabels: parseLabels(lastRetrieval?.canon_keys_json), lastRetrievedLogicLabels: parseLabels(lastRetrieval?.logic_keys_json), lastContextRetrievalAt: lastRetrieval?.created_at };
}

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
seedCanonKnowledge();
seedWorldLogic();

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
  martialSoulSummonPoolSize: META_MARTIAL_SOUL_POOL_SIZE,
  originCodex: [],
  originSummonPoolSize: META_ORIGIN_POOL_SIZE,
  martialSoulDrawTickets: 1,
  martialSoulDrawPity: 0,
  summonGoldPity: 0,
  summonRedPity: 0,
  summonRainbowPity: 0,
  originGoldPity: 0,
  originRedPity: 0,
  originRainbowPity: 0,
  summonHistory: [],
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
  if (!row) return undefined;
  const game = ensureGameState(JSON.parse(row.state_json) as StoredGame);
  if (game.view.status === "candidate_selection" && game.legacy.plannedOriginId) {
    const meta = getMetaProgression();
    const originId = game.legacy.plannedOriginId;
    const candidate = game.hiddenCandidates[0];
    if (candidate?.originId === originId && meta.equippedOriginId === originId) {
      const forcedSoul = peekEquippedMartialSoul();
      selectCandidate(game, candidate.public.id, undefined, forcedSoul);
      saveGameAndClaimEquippedLoadout(game, forcedSoul?.id, originId, "candidate.auto_selected_from_equipped_origin", {
        candidateId: candidate.public.id,
        equippedOriginId: originId,
        equippedMartialSoulId: forcedSoul?.id,
      });
    }
  }
  return game;
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
  const legacyPity = stored.martialSoulDrawPity ?? 0;
  const martialSoulCodex = (stored.martialSoulCodex ?? []).map((item) => ({ ...item, favorite: item.favorite ?? false, unlimited: true }));
  const originCodex = (stored.originCodex ?? []).map((item) => ({ ...item, favorite: item.favorite ?? false }));
  const historicalDraws = martialSoulCodex.reduce((sum, item) => sum + item.charges + (item.completedRuns > 0 ? 1 : 0), 0);
  const hasRedOrBetter = martialSoulCodex.some((item) => item.rarity === "红色" || item.rarity === "七彩");
  const hasRainbow = martialSoulCodex.some((item) => item.rarity === "七彩");
  return {
    ...defaultMetaProgression,
    ...stored,
    weightPreferences: { ...defaultMetaProgression.weightPreferences, ...stored.weightPreferences },
    purchasedUpgrades: { ...defaultMetaProgression.purchasedUpgrades, ...stored.purchasedUpgrades },
    martialSoulCodex,
    martialSoulSummonPoolSize: META_MARTIAL_SOUL_POOL_SIZE,
    originCodex,
    originSummonPoolSize: META_ORIGIN_POOL_SIZE,
    summonGoldPity: stored.summonGoldPity ?? legacyPity,
    summonRedPity: stored.summonRedPity ?? (hasRedOrBetter ? legacyPity : Math.min(39, Math.max(legacyPity, historicalDraws))),
    summonRainbowPity: stored.summonRainbowPity ?? (hasRainbow ? legacyPity : Math.min(79, Math.max(legacyPity, historicalDraws))),
    originGoldPity: stored.originGoldPity ?? 0,
    originRedPity: stored.originRedPity ?? 0,
    originRainbowPity: stored.originRainbowPity ?? 0,
    summonHistory: stored.summonHistory ?? [],
  };
}

function randomUnit(): number {
  return Number(BigInt.asUintN(53, BigInt(`0x${randomBytes(8).toString("hex")}`))) / 9_007_199_254_740_992;
}

function weightedMetaSoul<T extends { drawWeight: number }>(pool: readonly T[], random: () => number = randomUnit): T {
  const total = pool.reduce((sum, item) => sum + item.drawWeight, 0);
  let cursor = random() * total;
  for (const item of pool) {
    cursor -= item.drawWeight;
    if (cursor <= 0) return item;
  }
  return pool.at(-1)!;
}

function payForMetaDraw(meta: MetaProgressionView): number {
  const cost = meta.martialSoulDrawTickets > 0 ? 0 : 20;
  if (cost && meta.legacyPoints < cost) throw new Error(`传承点不足，召唤需要 ${cost} 点`);
  if (cost) meta.legacyPoints -= cost;
  else meta.martialSoulDrawTickets -= 1;
  return cost;
}

function drawOriginIntoMeta(meta: MetaProgressionView, cost: number, random: () => number): Extract<MetaSummonResultView, { kind: "origin" }> {
  const forcedRainbow = meta.originRainbowPity >= 59;
  const forcedRed = meta.originRedPity >= 29;
  const forcedGold = meta.originGoldPity >= 9;
  const pool = forcedRainbow
    ? META_ORIGIN_POOL.filter((item) => item.rarity === "七彩")
    : forcedRed
      ? META_ORIGIN_POOL.filter((item) => item.rarity === "红色" || item.rarity === "七彩")
      : forcedGold
        ? META_ORIGIN_POOL.filter((item) => ["金色", "红色", "七彩"].includes(item.rarity))
        : META_ORIGIN_POOL;
  const definition = weightedMetaSoul(pool, random);
  const existing = meta.originCodex.find((item) => item.id === definition.id);
  const duplicate = Boolean(existing);
  const drawn: OriginCodexEntryView = existing ?? {
    id: definition.id,
    name: definition.name,
    rarity: definition.rarity,
    era: definition.era,
    summary: definition.summary,
    advantage: definition.advantage,
    burden: definition.burden,
    favorite: false,
  };
  if (duplicate) meta.martialSoulDrawTickets += 1;
  else meta.originCodex.push(drawn);
  meta.discoveredOrigins = meta.originCodex.length;
  meta.summonHistory = [{ id: randomUUID(), kind: "origin" as const, name: drawn.name, rarity: drawn.rarity, description: `${drawn.advantage}；代价：${drawn.burden}`, duplicate, drawnAt: new Date().toISOString() }, ...meta.summonHistory].slice(0, 5);
  const isGold = ["金色", "红色", "七彩"].includes(drawn.rarity);
  const isRed = ["红色", "七彩"].includes(drawn.rarity);
  const isRainbow = drawn.rarity === "七彩";
  meta.originGoldPity = isGold ? 0 : meta.originGoldPity + 1;
  meta.originRedPity = isRed ? 0 : meta.originRedPity + 1;
  meta.originRainbowPity = isRainbow ? 0 : meta.originRainbowPity + 1;
  saveMetaProgression(meta);
  return { kind: "origin", meta, cost, drawn: { ...drawn, duplicate } };
}

export function drawMetaOrigin(random: () => number = randomUnit): Extract<MetaSummonResultView, { kind: "origin" }> {
  const meta = getMetaProgression();
  return drawOriginIntoMeta(meta, payForMetaDraw(meta), random);
}

export function drawMetaMartialSoul(random: () => number = randomUnit): MetaSummonResultView {
  const meta = getMetaProgression();
  const cost = payForMetaDraw(meta);
  const forcedRainbow = meta.summonRainbowPity >= 79;
  const forcedRed = meta.summonRedPity >= 39;
  const forcedGold = meta.summonGoldPity >= 9;
  const specialRoll = !forcedRainbow && !forcedRed && !forcedGold ? random() : 1;
  const relicRoll = specialRoll < 0.08;
  if (relicRoll) {
    const unowned = META_HEIRLOOMS.filter((item) => !meta.unlockedHeirlooms.includes(item.name));
    const pool = unowned.length > 0 ? unowned : META_HEIRLOOMS;
    const definition = weightedMetaSoul(pool, random);
    const duplicate = meta.unlockedHeirlooms.includes(definition.name);
    if (duplicate) meta.martialSoulDrawTickets += 1;
    else meta.unlockedHeirlooms.push(definition.name);
    meta.summonHistory = [{ id: randomUUID(), kind: "heirloom" as const, name: definition.name, rarity: definition.rarity, description: definition.description, duplicate, drawnAt: new Date().toISOString() }, ...meta.summonHistory].slice(0, 5);
    meta.summonGoldPity += 1;
    meta.summonRedPity += 1;
    meta.summonRainbowPity += 1;
    meta.martialSoulDrawPity = meta.summonGoldPity;
    saveMetaProgression(meta);
    return { kind: "heirloom", meta, cost, drawn: { id: definition.id, name: definition.name, rarity: definition.rarity, description: definition.description, duplicate } };
  }
  if (specialRoll >= 0.08 && specialRoll < 0.20) {
    meta.summonGoldPity += 1;
    meta.summonRedPity += 1;
    meta.summonRainbowPity += 1;
    meta.martialSoulDrawPity = meta.summonGoldPity;
    return drawOriginIntoMeta(meta, cost, random);
  }
  const eligible = META_MARTIAL_SOULS.filter((item) => ["紫色", "金色", "红色", "七彩"].includes(item.metaRarity));
  const pool = forcedRainbow
    ? eligible.filter((item) => item.metaRarity === "七彩")
    : forcedRed
      ? eligible.filter((item) => item.metaRarity === "红色" || item.metaRarity === "七彩")
      : forcedGold
        ? eligible.filter((item) => ["金色", "红色", "七彩"].includes(item.metaRarity))
        : eligible;
  const definition = weightedMetaSoul(pool, random);
  const existing = meta.martialSoulCodex.find((item) => item.id === definition.id);
  const drawn: MartialSoulCodexEntryView = existing ?? {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    description: definition.description,
    rarity: definition.metaRarity,
    charges: 0,
    unlimited: true,
    completedRuns: 0,
    enabled: false,
    initialSoulPowers: [],
    growthRoutes: definition.growthRoutes,
  };
  drawn.unlimited = true;
  if (!existing) meta.martialSoulCodex.push(drawn);
  meta.summonHistory = [{ id: randomUUID(), kind: "martialSoul" as const, name: drawn.name, rarity: drawn.rarity, description: drawn.description, duplicate: Boolean(existing), drawnAt: new Date().toISOString() }, ...meta.summonHistory].slice(0, 5);
  const isGold = ["金色", "红色", "七彩"].includes(definition.metaRarity);
  const isRed = ["红色", "七彩"].includes(definition.metaRarity);
  const isRainbow = definition.metaRarity === "七彩";
  meta.summonGoldPity = isGold ? 0 : meta.summonGoldPity + 1;
  meta.summonRedPity = isRed ? 0 : meta.summonRedPity + 1;
  meta.summonRainbowPity = isRainbow ? 0 : meta.summonRainbowPity + 1;
  meta.martialSoulDrawPity = meta.summonGoldPity;
  meta.discoveredMartialSouls = meta.martialSoulCodex.length;
  saveMetaProgression(meta);
  return { kind: "martialSoul", meta, drawn, cost };
}

export function equipCodexMartialSoul(id?: string): MetaProgressionView {
  const meta = getMetaProgression();
  if (!id) { meta.equippedMartialSoulId = undefined; return saveMetaProgression(meta); }
  const entry = meta.martialSoulCodex.find((item) => item.id === id);
  if (!entry) throw new Error("尚未抽到这个武魂");
  meta.equippedMartialSoulId = id;
  return saveMetaProgression(meta);
}

export function toggleCodexMartialSoul(id: string, enabled: boolean): MetaProgressionView {
  const meta = getMetaProgression();
  const entry = meta.martialSoulCodex.find((item) => item.id === id);
  if (!entry) throw new Error("尚未抽到这个武魂");
  entry.enabled = enabled;
  return saveMetaProgression(meta);
}

export function favoriteCodexMartialSoul(id: string, favorite: boolean): MetaProgressionView {
  const meta = getMetaProgression();
  const entry = meta.martialSoulCodex.find((item) => item.id === id);
  if (!entry) throw new Error("武魂仓库中没有这项记录");
  entry.favorite = favorite;
  return saveMetaProgression(meta);
}

export function deleteCodexMartialSoul(id: string): MetaProgressionView {
  const meta = getMetaProgression();
  const entry = meta.martialSoulCodex.find((item) => item.id === id);
  if (!entry) throw new Error("武魂仓库中没有这项记录");
  meta.martialSoulCodex = meta.martialSoulCodex.filter((item) => item.id !== id);
  if (meta.equippedMartialSoulId === id) meta.equippedMartialSoulId = undefined;
  meta.discoveredMartialSouls = meta.martialSoulCodex.length;
  return saveMetaProgression(meta);
}

export function equipCodexOrigin(id?: string): MetaProgressionView {
  const meta = getMetaProgression();
  if (!id) { meta.equippedOriginId = undefined; return saveMetaProgression(meta); }
  if (!meta.originCodex.some((item) => item.id === id)) throw new Error("尚未抽到这个身世");
  meta.equippedOriginId = id;
  return saveMetaProgression(meta);
}

export function favoriteCodexOrigin(id: string, favorite: boolean): MetaProgressionView {
  const meta = getMetaProgression();
  const entry = meta.originCodex.find((item) => item.id === id);
  if (!entry) throw new Error("身世仓库中没有这项记录");
  entry.favorite = favorite;
  return saveMetaProgression(meta);
}

export function deleteCodexOrigin(id: string): MetaProgressionView {
  const meta = getMetaProgression();
  if (!meta.originCodex.some((item) => item.id === id)) throw new Error("身世仓库中没有这项记录");
  meta.originCodex = meta.originCodex.filter((item) => item.id !== id);
  if (meta.equippedOriginId === id) meta.equippedOriginId = undefined;
  meta.discoveredOrigins = meta.originCodex.length;
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
  return templateFromCodexEntry(entry);
}

export function saveGameAndClaimEquippedMartialSoul(game: StoredGame, soulId: string, eventType: string, payload: unknown = {}): void {
  saveGameAndClaimEquippedLoadout(game, soulId, undefined, eventType, payload);
}

export function saveGameAndClaimEquippedLoadout(game: StoredGame, soulId: string | undefined, originId: string | undefined, eventType: string, payload: unknown = {}): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const meta = getMetaProgression();
    if (soulId) {
      if (meta.equippedMartialSoulId !== soulId) throw new Error("局外武魂装备状态已经变化，请重新选择角色");
      if (!meta.martialSoulCodex.some((item) => item.id === soulId)) throw new Error("尚未抽到这个武魂");
      meta.equippedMartialSoulId = undefined;
    }
    if (originId) {
      if (meta.equippedOriginId !== originId) throw new Error("局外身世装备状态已经变化，请重新创建候选角色");
      if (!meta.originCodex.some((item) => item.id === originId)) throw new Error("尚未抽到这个身世");
      meta.equippedOriginId = undefined;
    }
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
          charges: 0, unlimited: true, completedRuns: 0, enabled: true, initialSoulPowers: [],
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
    const committed = resolved.lastCommittedAction;
    if (committed) {
      const narrative = resolved.view.narrative.find((entry) => entry.id === committed.narrativeEntryId)?.text ?? "";
      const date = resolved.view.worldTime;
      storeVectorMemory({
        gameId: resolved.view.id,
        sourceKey: `action:${resolved.actionIndex}`,
        actionIndex: resolved.actionIndex,
        kind: "action",
        text: `${date?.year ?? 0}年${date?.day ?? 1}日，地点：${resolved.view.location}。玩家行动：${committed.playerInput}。程序判定：${committed.resolution.ruleSummary}。已发生场景：${narrative}`,
        importance: committed.resolution.conditionAfter || /承诺|关系|加入|离开|获得|失去|死亡|觉醒|突破|魂环|魂骨|历史|秘密/.test(`${committed.playerInput}${committed.resolution.ruleSummary}`) ? 0.88 : 0.62,
        year: date?.year,
        day: date?.day,
        metadata: { requestId: committed.requestId, intent: committed.resolution.intent, locationId: resolved.view.locationId },
      });
      storeCurrentMemoryChapter(resolved);
    }
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

export function saveEraSuccessor(parent: StoredGame, successor: StoredGame): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    writeCheckpoint(parent, `世代终章 · 第 ${parent.view.era} 时代 · ${parent.view.character?.name ?? "无名者"}`);
    writeGameAndEvent(successor, "era.successor_created", { sourceEra: parent.view.era, targetEra: successor.view.era, ancestorName: parent.view.character?.name });
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
    martialSouls: new Set([...MARTIAL_SOUL_CATALOG_NAMES, ...META_MARTIAL_SOULS.map((item) => item.name)]).size,
    characters: tableCount("canon_characters"),
    powerSnapshots: tableCount("canon_power_snapshots"),
    factions: tableCount("canon_factions"),
    locations: tableCount("canon_locations"),
    events: tableCount("canon_events"),
    soulBeasts: tableCount("canon_soul_beasts"),
    narrativeRules: tableCount("fanfiction_rules"),
  };
}
