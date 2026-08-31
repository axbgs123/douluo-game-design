import type { ActionResolution, StoredGame } from "../domain/model.js";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, canonEventSimulationOrdinal, characterById, locationById } from "../data/world.js";
import { auditNarrative, auditNarrativeLogicPacket, buildChineseWebnovelSceneCard, buildNarrativeLogicPacket, refreshStoryArchive, sanitizeNarrativeSuggestions, selectNarrativeRules, violatesCanonChronology } from "../domain/story-rules.js";
import { readDeepSeekSettings } from "./settings.js";
import { auditNovelEngineNarrative, auditResolutionAlignment, buildNovelEnginePack } from "../domain/novel-engine.js";
import { buildSceneKnowledgePack } from "../domain/scene-knowledge.js";
import { randomUUID } from "node:crypto";

export { violatesCanonChronology } from "../domain/story-rules.js";

export interface NarrationResult {
  narrative: string;
  suggestions: string[];
  traceGroupId?: string;
  memory?: {
    summary?: string;
    openThreads?: string[];
    keyChoice?: string;
    npcNotes?: Record<string, string>;
    chapterTitle?: string;
  };
}

export interface CanonNarrativeProfile {
  era: 1 | 2 | 3 | 4;
  sceneMode: "生活成长" | "学院势力" | "修炼突破" | "战斗猎魂" | "调查悬疑";
  eraTexture: string;
  sceneRhythm: string;
  interiority: string;
  exposition: string;
}

export function buildCanonNarrativeProfile(game: StoredGame, playerInput: string, resolution: ActionResolution): CanonNarrativeProfile {
  const scene = `${playerInput}${resolution.intent}${resolution.ruleSummary}`;
  const sceneMode = /调查|追查|线索|秘密|失踪|证据|真相|阴谋|核验/.test(scene) ? "调查悬疑"
    : /战斗|攻击|防御|魂兽|猎魂|魂环|撤退/.test(scene) ? "战斗猎魂"
      : /修炼|训练|突破|冥想|锻造|制作/.test(scene) ? "修炼突破"
        : /学院|入学|宗门|势力|拜师|课程|舰队/.test(scene) ? "学院势力" : "生活成长";
  const era = game.view.era ?? 1;
  const year = game.view.worldTime?.year ?? 0;
  const eraTexture = ({
    1: "斗一的奇异感从村庄、家庭生计、铁匠铺、学院名额、路费与猎魂手令等日常门槛中长出来；魂师身份尊贵，但普通人仍要吃饭、干活、赶路和求人。",
    2: year < 10_012 ? "斗二前期先写个人匮乏、谋生本领、魂导器发展、同伴相遇与学院竞争；成熟魂灵体系和传灵塔尚未成立，不能作为日常制度提前出现。" : "斗二后期仍要从人物匮乏、学院与战争压力出发，再让已经形成证据的魂灵研究和制度变化进入选择；弱小阶段的每份资源都应有重量。",
    3: "斗三重视童年愿望、家庭安慰、学校生活、职业劳动、身体异变与同龄竞争；大设定先落到孩子的失望、饭量、工资、训练和朋友关系上。",
    4: "斗四的联邦科技必须通过岗位命令、设备操作、军衔责任和家庭/同事关系显形；制度场景里也要有人情、玩笑、偏心、疲惫和生活安排。",
  } as const)[era];
  return {
    era,
    sceneMode,
    eraTexture,
    sceneRhythm: sceneMode === "调查悬疑"
      ? "先写人物为什么非查不可，再写具体查法、受阻与证据变化；线索只服务当前人物欲望。"
      : "先写人物此刻想得到或避免什么，再让行动撞上具体人和现实门槛，最后把结果落到身体、资源、身份待遇或关系上；不额外制造谜题。",
    interiority: "允许清楚写主角当下的期盼、失望、满足、好胜、羞耻与判断，只要这些来自既有性格和现场结果；限知不等于把心理全部藏起来。",
    exposition: "必要设定应由正在办事的人、眼前制度、训练过程或主角已有常识自然带出。先有生活动作和利害，再解释一小段；不要像百科、配置表或审稿报告。",
  };
}

export function auditCanonNarrativeVoice(text: string, profile: CanonNarrativeProfile): string[] {
  if (profile.sceneMode === "调查悬疑") return [];
  const forcedMystery = /恐怕不只是|这上面记的.{0,12}不只是|背后隐藏着什么|新的谜团|必须调查清楚|一切都没有那么简单|一定还藏着/.test(text);
  const mysteryHits = ["神秘的旧物", "来历不明的线索", "故意留下的空白", "欲言又止", "必须追查"].filter((phrase) => text.includes(phrase));
  return forcedMystery || mysteryHits.length >= 2 ? ["非调查场景被写成了解密或谜团推进"] : [];
}

export function auditArchivedNarrative(game: StoredGame, playerInput: string, resolution: ActionResolution, narrative: string): string[] {
  const issues = [
    ...(violatesCanonChronology(narrative, game.view.worldTime?.year ?? 0) ? ["正文违反冻结回合的原作时间线"] : []),
    ...auditNarrative(game, narrative),
    ...auditNovelEngineNarrative(game, narrative, buildNovelEnginePack(game, playerInput, resolution, readDeepSeekSettings().novelEngineEnabled)),
    ...auditCanonNarrativeVoice(narrative, buildCanonNarrativeProfile(game, playerInput, resolution)),
    ...auditResolutionAlignment(narrative, resolution, playerInput, game),
  ];
  return [...new Set(issues)];
}

export function observableCanonEventsForNarration(game: StoredGame) {
  return CANON_EVENTS.filter((event) => game.world.firedCanonEvents.includes(event.id) && (game.view.news.some((item) => item.id === event.id || item.title === event.title || item.detail.includes(event.title)) || game.world.intelligenceRecords.some((item) => item.subjectId === event.id || item.title === event.title || item.detail.includes(event.title))));
}

export function observableCausalFootprintsForNarration(game: StoredGame) {
  return game.world.canonCausalFootprints
    .filter((cause) => cause.source !== "历史分支结算" || game.view.canonInfluences.some((item) => item.id === cause.id))
    .map((cause) => ({
      id: cause.id,
      source: cause.source,
      description: cause.description,
      atYear: cause.atYear,
      atDay: cause.atDay,
      location: locationById(cause.locationId)?.name ?? "玩家当时所在地点",
      affectedPeople: cause.affectedNpcIds.map((id) => game.world.npcs[id]).filter((npc) => npc?.knownToPlayer).map((npc) => npc.name),
      affectedFactions: cause.affectedFactionIds.map((id) => FACTIONS.find((item) => item.id === id)).filter((faction) => faction && (cause.description.includes(faction.name) || game.view.affiliations.some((item) => item.id === faction.id) || cause.affectedNpcIds.some((npcId) => game.world.npcs[npcId]?.knownToPlayer && game.world.npcs[npcId]?.factionIds.includes(faction.id)) || game.world.intelligenceRecords.some((record) => record.subjectType === "势力" && record.subjectId === faction.id && record.confidence >= 60))).map((faction) => faction!.name),
      strength: cause.strength,
      domains: cause.domains,
    }));
}

export class NarrativeAuditError extends Error {
  constructor(public readonly issues: string[]) {
    super(`正文未通过审校：${issues.join("、")}`);
    this.name = "NarrativeAuditError";
  }
}

export class NarrativeLogicPreflightError extends Error {
  constructor(public readonly issues: string[]) {
    super(`正文生成前逻辑预检失败：${issues.join("、")}`);
    this.name = "NarrativeLogicPreflightError";
  }
}

const ACTION_FAMILIES: RegExp[] = [
  /修炼|冥想|闭关|运转|练功/,
  /休息|睡觉|疗伤|恢复/,
  /前往|去往|出发|旅行|离开|赶路/,
  /询问|打听|交谈|告诉|拜访|问/,
  /调查|搜索|观察|查找|研究/,
  /购买|买|采购|花费/,
  /攻击|战斗|防御|闪避|逃跑|刺杀|杀/,
  /猎魂|魂兽|魂环|追踪|吸收/,
  /加入|投靠|入学|拜师|承诺|拒绝/,
  /等待|快进|过去.*(?:天|月|年)/,
];

export function validateInterpretedAction(game: StoredGame, original: string, interpreted: string): string {
  const compactOriginal = original.replace(/\s+/g, "");
  const compactInterpreted = interpreted.replace(/\s+/g, "");
  if (!compactInterpreted || compactInterpreted.length > 1200) return original;
  const originalFamilies = ACTION_FAMILIES.filter((pattern) => pattern.test(compactOriginal));
  if (originalFamilies.length && !originalFamilies.some((pattern) => pattern.test(compactInterpreted))) return original;
  const originalNumbers = new Set(compactOriginal.match(/\d+(?:\.\d+)?/g) ?? []);
  if ((compactInterpreted.match(/\d+(?:\.\d+)?/g) ?? []).some((value) => !originalNumbers.has(value))) return original;
  const originalQuantities = new Set(compactOriginal.match(/[零一二三四五六七八九十百千万两]+(?:天|日|月|年|级|枚|个|次|魂币)/g) ?? []);
  if ((compactInterpreted.match(/[零一二三四五六七八九十百千万两]+(?:天|日|月|年|级|枚|个|次|魂币)/g) ?? []).some((value) => !originalQuantities.has(value))) return original;
  if (!/(已经|成功|完成|获得|拥有|抵达|杀死|击败)/.test(compactOriginal) && /(已经|成功|完成|获得|拥有|抵达|杀死|击败)/.test(compactInterpreted)) return original;
  const protectedTerms = [
    ...game.view.inventory,
    ...game.view.map.map((item) => item.name),
    ...game.view.relations.map((item) => item.name),
    ...game.view.knownFigures.map((item) => item.name),
    ...game.view.affiliations.map((item) => item.name),
  ].filter((term) => term.length >= 2);
  if (protectedTerms.some((term) => compactInterpreted.includes(term) && !compactOriginal.includes(term))) return original;
  return interpreted.trim();
}

export function narrativePacing(game: StoredGame, playerInput: string, resolution: ActionResolution): { kind: "略写" | "推进" | "关键"; target: string; directive: string } {
  const scene = `${playerInput} ${resolution.intent} ${resolution.ruleSummary}`;
  const privateHiddenSoulTest = /私下测试隐藏武魂/.test(resolution.intent);
  const importantCanonContact = CANON_CHARACTERS.some((character) => character.importance >= 4 && playerInput.includes(game.world.npcs[character.id]?.name ?? "不存在的当前姓名"));
  const activeEventContact = game.world.dynamicEvents.some((event) => event.status === "可介入" && playerInput.includes(event.title));
  const key = importantCanonContact || /重要战斗|生死|死亡|复生|魂环吸收|觉醒|加入势力|背叛|拜师|建立势力|历史偏移|原作关键|结局|神位|重大选择/.test(scene);
  const routineIntent = /^(调查|交谈|一般行动|购买|工作|休息|等待)$/u.test(resolution.intent);
  const minor = !key && !activeEventContact && (routineIntent || /观察|查看|翻找|整理|简单询问|购买|普通工作|休息|等待|赶路|一般行动|日常/.test(scene));
  const kind = key ? "关键" : minor ? "略写" : "推进";
  const target = privateHiddenSoulTest
    ? game.view.speed === "高速" ? "260至450字" : "500至850字"
    : game.view.speed === "高速"
    ? kind === "关键" ? "700至1200字" : kind === "略写" ? "160至320字" : "300至550字"
    : kind === "关键" ? "1600至2800字" : kind === "略写" ? "280至550字" : "600至1000字";
  const directive = privateHiddenSoulTest
    ? "只写独处测试本身：显形、一次可感知差异、主动收回和秘密仍被守住；不得转去见长老、开会、安排培养或补写完整觉醒流程。"
    : kind === "略写"
    ? "压缩过程，只保留一个影响判断的细节和明确结果；不要把开门、走路、翻找、客套逐步展开。"
    : kind === "推进"
      ? "本次至少完成一个完整叙事节拍：目标发生变化、获得可用信息、关系改变或局面进入下一阶段。"
      : "关键场景写清位置、选择、反应与代价；放慢真正改变命运的瞬间，其余动作仍要压缩。";
  return { kind, target, directive };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

function requestSignal(timeout: number, external?: AbortSignal): AbortSignal {
  return external ? AbortSignal.any([external, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}

interface ChatCompletionPayload {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

function completionTokenLimit(settings: { baseUrl: string }, tokens: number): { max_tokens: number } | { max_completion_tokens: number } {
  return /xiaomimimo\.com/.test(settings.baseUrl) ? { max_completion_tokens: tokens } : { max_tokens: tokens };
}

interface TurnTraceContext {
  groupId: string;
  attempt: number;
  operation: "action" | "rewrite" | "model-replay";
}

async function safeStartTurnTrace(groupId: string, game: StoredGame, playerInput: string, resolution: ActionResolution, operation: TurnTraceContext["operation"]): Promise<void> {
  try { const { startTurnTraceGroup } = await import("../db.js"); startTurnTraceGroup({ id: groupId, game, playerInput, resolution, operation }); } catch { /* Diagnostics cannot stop play. */ }
}

async function safeRecordTraceModelAttempt(context: TurnTraceContext | undefined, prompt: unknown, response: unknown | undefined, status: "model-returned" | "model-error"): Promise<void> {
  if (!context) return;
  try { const { recordTurnTraceModelAttempt } = await import("../db.js"); recordTurnTraceModelAttempt({ traceGroupId: context.groupId, attempt: context.attempt, prompt, response, status }); } catch { /* Diagnostics cannot stop play. */ }
}

async function safeCompleteTraceAttempt(context: TurnTraceContext, status: "accepted" | "audit-failed" | "model-error", auditIssues: string[] = []): Promise<void> {
  try { const { completeTurnTraceAttempt } = await import("../db.js"); completeTurnTraceAttempt({ traceGroupId: context.groupId, attempt: context.attempt, status, auditIssues }); } catch { /* Diagnostics cannot stop play. */ }
}

async function safeCompleteTraceGroup(groupId: string, status: "accepted" | "failed", narrative?: string, auditIssues: string[] = []): Promise<void> {
  try { const { completeTurnTraceGroup } = await import("../db.js"); completeTurnTraceGroup({ traceGroupId: groupId, status, narrative, auditIssues }); } catch { /* Diagnostics cannot stop play. */ }
}

let smokeRequestCount = 0;

function positiveEnvironmentInteger(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

async function safeRecordModelCall(input: Parameters<(typeof import("../db.js"))["recordModelCall"]>[0]): Promise<void> {
  try {
    const { recordModelCall } = await import("../db.js");
    recordModelCall(input);
  } catch {
    // Telemetry must never make a player action fail.
  }
}

async function retrieveVectorMemoryContext(game: StoredGame, query: string) {
  const { retrieveVectorMemories } = await import("../db.js");
  return retrieveVectorMemories(game, query, 8).map(({ text, kind, actionIndex, year, day, importance, similarity, metadata }) => ({ text, kind, actionIndex, year, day, importance, similarity, metadata }));
}

async function retrieveCanonKnowledgeContext(game: StoredGame, query: string) {
  const { retrieveCanonKnowledge } = await import("../db.js");
  return retrieveCanonKnowledge(game, query, 10).map(({ kind, subjectId, subjectName, text, importance, similarity, metadata }) => ({ kind, subjectId, subjectName, text, importance, similarity, metadata }));
}

async function retrieveWorldLogicContext(game: StoredGame, query: string) {
  const { retrieveWorldLogic } = await import("../db.js");
  return retrieveWorldLogic(game, query, 8).map(({ category, trigger, logic, importance, similarity, metadata }) => ({ category, trigger, logic, importance, similarity, metadata }));
}

async function safeRecordContextRetrieval(game: StoredGame, role: "intent" | "narrator", contexts: { memory: Array<{ text: string; kind: string; actionIndex: number; similarity: number; metadata: Record<string, unknown> }>; canon: Array<{ text: string; kind: string; subjectName: string; similarity: number; metadata: Record<string, unknown> }>; logic: Array<{ logic: string; trigger: string; category: string; similarity: number; metadata: Record<string, unknown> }> }): Promise<void> {
  try {
    const { recordContextRetrieval } = await import("../db.js");
    const chapterLabels = [...new Set(contexts.memory.map((item) => typeof item.metadata.chapterTitle === "string" ? `第${item.metadata.chapterNumber ?? "?"}章 ${item.metadata.chapterTitle}` : "").filter(Boolean))];
    recordContextRetrieval({
      gameId: game.view.id, role, actionIndex: game.actionIndex,
      memory: contexts.memory.length, canon: contexts.canon.length, logic: contexts.logic.length, chapters: chapterLabels.length,
      memoryLabels: contexts.memory.map((item) => `${item.kind}#${item.actionIndex}${typeof item.metadata.chapterTitle === "string" ? ` · ${item.metadata.chapterTitle}` : ""}`),
      canonLabels: contexts.canon.map((item) => `${item.kind} · ${item.subjectName}`), logicLabels: contexts.logic.map((item) => item.category),
      memoryDetails: contexts.memory.map((item) => ({ label: `${item.kind}#${item.actionIndex}${typeof item.metadata.chapterTitle === "string" ? ` · ${item.metadata.chapterTitle}` : ""}`, snippet: item.text, similarity: item.similarity, source: String(item.metadata.source ?? item.metadata.retrievalPhase ?? "本地剧情记忆"), reason: typeof item.metadata.chapterTitle === "string" ? `先命中第${item.metadata.chapterNumber ?? "?"}章“${item.metadata.chapterTitle}”，再按场景相似度入选` : "NPC记忆或玩家已知情报允许跨章节直接入选" })),
      canonDetails: contexts.canon.map((item) => ({ label: `${item.kind} · ${item.subjectName}`, snippet: item.text, similarity: item.similarity, source: String(item.metadata.provenance ?? item.metadata.sourceType ?? "结构化斗罗知识"), reason: String(item.metadata.retrievalReason ?? "通过当前时代、日期、玩家已知范围与场景相似度筛选") })),
      logicDetails: contexts.logic.map((item) => ({ label: item.category, snippet: item.logic, similarity: item.similarity, source: String(item.metadata.type ?? "世界基本逻辑"), reason: `${String(item.metadata.retrievalReason ?? "按行动相关性入选")}；触发条件：“${item.trigger}”` })),
    });
  } catch {
    // Retrieval has already succeeded; diagnostics must not invalidate it.
  }
}

async function tracedCompletion(game: StoredGame, role: "intent" | "narrator", settings: { apiKey: string; baseUrl: string; model: string }, body: unknown, timeout: number, signal?: AbortSignal, traceContext?: TurnTraceContext): Promise<ChatCompletionPayload> {
  const started = performance.now();
  const serialized = JSON.stringify(body);
  let recorded = false;
  try {
    const roleMaximumRequestChars = positiveEnvironmentInteger(role === "intent" ? "DOULUO_MODEL_SMOKE_MAX_INTENT_CHARS" : "DOULUO_MODEL_SMOKE_MAX_NARRATOR_CHARS");
    const maximumRequestChars = roleMaximumRequestChars ?? positiveEnvironmentInteger("DOULUO_MODEL_SMOKE_MAX_REQUEST_CHARS");
    if (maximumRequestChars && serialized.length > maximumRequestChars) throw new Error(`真实模型冒烟请求实际${serialized.length}字符，超过${maximumRequestChars}字符硬上限`);
    const maximumRequests = positiveEnvironmentInteger("DOULUO_MODEL_SMOKE_MAX_REQUESTS");
    if (maximumRequests && smokeRequestCount >= maximumRequests) throw new Error(`真实模型冒烟达到 ${maximumRequests} 次调用硬上限`);
    if (maximumRequests) smokeRequestCount += 1;
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
      signal: requestSignal(timeout, signal),
      body: serialized,
    });
    if (!response.ok) {
      await safeRecordModelCall({ gameId: game.view.id, role, model: settings.model, status: "failure", latencyMs: performance.now() - started, promptChars: serialized.length, outputChars: 0, errorCode: `http_${response.status}` });
      recorded = true;
      throw new Error(`${role === "intent" ? "DeepSeek 行动理解" : "DeepSeek 请求"}失败：${response.status}`);
    }
    const payload = await response.json() as ChatCompletionPayload;
    const content = payload.choices?.[0]?.message?.content ?? "";
    await safeRecordModelCall({ gameId: game.view.id, role, model: settings.model, status: "success", latencyMs: performance.now() - started, promptChars: serialized.length, outputChars: content.length, promptTokens: payload.usage?.prompt_tokens, completionTokens: payload.usage?.completion_tokens, totalTokens: payload.usage?.total_tokens });
    recorded = true;
    await safeRecordTraceModelAttempt(traceContext, body, payload, "model-returned");
    return payload;
  } catch (error) {
    await safeRecordTraceModelAttempt(traceContext, body, error instanceof Error ? { error: error.message } : { error: "unknown" }, "model-error");
    if (!recorded) await safeRecordModelCall({ gameId: game.view.id, role, model: settings.model, status: "failure", latencyMs: performance.now() - started, promptChars: serialized.length, outputChars: 0, errorCode: error instanceof DOMException ? error.name : error instanceof Error ? error.constructor.name : "unknown" });
    throw error;
  }
}

export async function interpretActionWithDeepSeek(game: StoredGame, playerInput: string, signal?: AbortSignal): Promise<string | null> {
  const settings = readDeepSeekSettings();
  if (!settings.apiKey) return null;
  const relevantPast = await retrieveVectorMemoryContext(game, `${playerInput}\n${game.view.location}\n${game.view.tasks.filter((task) => task.status !== "完成").slice(0, 4).map((task) => task.title).join("\n")}`);
  await safeRecordContextRetrieval(game, "intent", { memory: relevantPast, canon: [], logic: [] });
  const payload = await tracedCompletion(game, "intent", settings, {
      model: settings.model,
      ...completionTokenLimit(settings, 256),
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: [
          "你是文字RPG的行动语义整理器，只把玩家原话整理成规则程序容易识别的一句话。",
          "不能决定成功失败，不能增加物品、能力、地点、人物或前提。保留玩家的具体目标、方法、谨慎程度和退路。",
          "relevantPast 是本地向量库召回的玩家已知旧事，只能用于判断‘他、那里、上次承诺’等指代，不能把旧状态当成当前状态，也不能据此新增权限或结果。",
          "玩家一次输入多项行动时，只整理能够连续安全执行的第一个阶段；在战斗、生死、入宗或背叛、魂环魂骨、婚恋、杀死重要人物、暴露秘密、改变原作节点、消耗不可恢复物品、复活成神等重大节点前停下，不替玩家跨过去。",
          "可用动作词包括修炼、休息、前往、询问、调查、购买、使用、工作、等待、攻击、防御、逃跑、猎魂、追踪、吸收、入学、加入势力、拜师、承诺、履行承诺、参悟特殊体系、介入事件。",
          "遇到后世专属行动时保留关键术语：魂灵调查/评估/签约，魂导器学习/制作/认证，斗铠设计/制作，机甲训练/考核/购买/驾驶，星舰训练/考核/招募船员/取得舰船/补给/航行/星球调查。不要把这些动作改写成普通修炼或普通旅行。",
          "输出 JSON：{\"ruleAction\":\"整理后的一句话\"}。",
        ].join("\n") },
        { role: "user", content: JSON.stringify({ playerInput, relevantPast, era: game.view.era ?? 1, worldTime: game.view.worldTime, character: game.view.character, location: game.view.location, map: game.view.map.map((item) => item.name), academyApplication: game.view.academyApplication, academyLife: game.view.academyLife, mentorPursuit: game.view.mentorPursuit, currentHunt: game.view.hunting, currentEvents: game.view.activeEvents.map((item) => item.title), tasks: game.view.tasks.filter((item) => item.status === "进行中").map((item) => item.title) }) },
      ],
    }, 20_000, signal);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;
  const parsed = extractJson(content) as { ruleAction?: unknown };
  return typeof parsed.ruleAction === "string" && parsed.ruleAction.trim() ? parsed.ruleAction.trim().slice(0, 1200) : null;
}

export async function narrateWithDeepSeek(
  game: StoredGame,
  playerInput: string,
  resolution: ActionResolution,
  signal?: AbortSignal,
  retryGuidance: string[] = [],
  traceContext?: TurnTraceContext,
): Promise<NarrationResult | null> {
  const settings = readDeepSeekSettings();
  if (!settings.apiKey) return null;
  const activeRules = selectNarrativeRules(game, playerInput, resolution);
  const novelEngine = buildNovelEnginePack(game, playerInput, resolution, settings.novelEngineEnabled);
  const pacing = narrativePacing(game, playerInput, resolution);
  const privateSolitaryAction = /私下测试隐藏武魂/.test(resolution.intent) || /没有NPC在场|无NPC在场|无人旁观/.test(resolution.ruleSummary);
  const rawSceneKnowledge = buildSceneKnowledgePack(game, playerInput);
  const sceneKnowledge = privateSolitaryAction ? { ...rawSceneKnowledge, entries: rawSceneKnowledge.entries.filter((entry) => entry.kind === "地点" || (entry.kind === "情报" && playerInput.includes(entry.name))) } : rawSceneKnowledge;
  const narrativeLogicPacket = buildNarrativeLogicPacket(game, playerInput, resolution, sceneKnowledge);
  const canonNarrativeProfile = buildCanonNarrativeProfile(game, playerInput, resolution);
  const logicIssues = auditNarrativeLogicPacket(narrativeLogicPacket);
  if (logicIssues.length) throw new NarrativeLogicPreflightError(logicIssues);
  const publicSoulIndices = game.view.character?.publiclyKnownMartialSoulIndices ?? [0];
  const publicSoulNames = game.view.character?.martialSouls.filter((_soul, index) => publicSoulIndices.includes(index)).map((soul) => soul.name) ?? [];
  const memoryQuery = [
    playerInput, resolution.intent, resolution.ruleSummary, game.view.location,
    publicSoulNames.length ? `已公开${publicSoulNames.length}个武魂：${publicSoulNames.join("、")}；先天魂力${game.view.character?.innateSoulPower ?? "未知"}；社会评价${game.view.character?.reputation ?? "尚未形成"}` : "",
    !privateSolitaryAction && game.view.storyArc ? `当前故事卷：${game.view.storyArc.title}；阶段${game.view.storyArc.stage}；目标${game.view.storyArc.centralGoal}；冲突${game.view.storyArc.centralConflict}；对抗压力${game.view.storyArc.opposingForce}` : "",
    !privateSolitaryAction && game.view.academyLife ? `${game.view.academyLife.periodLabel}：${game.view.academyLife.className}；${game.view.academyLife.stage}；${game.view.academyLife.teacherRole}${game.view.academyLife.teacherName}；当前安排${game.view.academyLife.arrangementName}；同辈${game.view.academyLife.peers.map((peer) => `${peer.name}/${peer.motive}`).join("、")}` : "",
    ...(!privateSolitaryAction ? game.view.tasks.filter((task) => task.status !== "完成").slice(0, 6).map((task) => `${task.title} ${task.detail}`) : ["无人目击，隐藏武魂，保密，知情范围不变"]),
    ...game.world.localConsequences.filter((item) => item.status === "生效中" && item.locationId === game.view.locationId).map((item) => `持续后果：${item.summary}`),
    ...(!privateSolitaryAction ? Object.values(game.world.npcs).filter((npc) => npc.alive && npc.knownToPlayer && npc.locationId === game.view.locationId).map((npc) => `${npc.name}：${npc.activePlan?.nextAction ?? npc.currentGoal}；责任${npc.activePlan?.responsibility ?? "个人事务"}`) : []),
  ].join("\n");
  const rawLongTermMemories = await retrieveVectorMemoryContext(game, memoryQuery);
  const hiddenSoulNames = game.view.character?.martialSouls.filter((_soul, index) => !(game.view.character?.publiclyKnownMartialSoulIndices ?? [0]).includes(index)).map((soul) => soul.name) ?? [];
  const retrievedLongTermMemories = privateSolitaryAction ? rawLongTermMemories.filter((item) => hiddenSoulNames.some((name) => item.text.includes(name)) && !/议事|培养方案|传唤|拜师/.test(item.text)) : rawLongTermMemories;
  const retrievedCanonKnowledge = await retrieveCanonKnowledgeContext(game, memoryQuery);
  const rawWorldLogic = await retrieveWorldLogicContext(game, memoryQuery);
  const retrievedWorldLogic = privateSolitaryAction ? rawWorldLogic.filter((item) => /秘密|隐藏|知情|信息边界|无人目击|保密/.test(`${item.category}${item.trigger}${item.logic}`)) : rawWorldLogic;
  if (!retrievedWorldLogic.length) throw new Error("世界基本逻辑检索没有返回适用规则，已停止本次正文生成");
  await safeRecordContextRetrieval(game, "narrator", { memory: retrievedLongTermMemories, canon: retrievedCanonKnowledge, logic: retrievedWorldLogic });
  const lengthTarget = `${pacing.kind}场景，${pacing.target}。${pacing.directive}`;
  const eraTitle = ({ 1: "《斗罗大陆》第一部", 2: "《绝世唐门》", 3: "《龙王传说》", 4: "《终极斗罗》" } as const)[game.view.era ?? 1];
  const narrativeCharacter = game.view.character ? (() => {
    const { rarity: _originRarity, martialSoul: _activeSoul, martialSouls, ...rest } = game.view.character!;
    const publicIndices = new Set(game.view.character!.publiclyKnownMartialSoulIndices ?? [0]);
    const cleanSoul = ({ rarity: _rarity, grade: _grade, sourceEra: _sourceEra, originFit: _originFit, ...soul }: typeof martialSouls[number], index?: number) => ({ ...soul, visibility: index === undefined || publicIndices.has(index) ? "已公开" : "仅主角知道" });
    const cleanedSouls = martialSouls.map((soul, index) => cleanSoul(soul, index));
    return {
      ...rest,
      originProvenance: "同人原创存档事实",
      originCanonBoundary: "该身世在本局真实成立，但玩家本人、具体家庭、监护关系、微地点与原创机构并非原著既有人物或条目",
      martialSoul: cleanSoul(game.view.character!.martialSoul, game.view.character!.activeMartialSoulIndex),
      martialSouls: cleanedSouls,
    };
  })() : undefined;
  const narrativeStoryArc = privateSolitaryAction ? undefined : game.view.storyArc;
  const scenePersonNames = new Set(sceneKnowledge.entries.filter((entry) => entry.kind === "人物").map((entry) => entry.name));
  const relevantRelations = privateSolitaryAction ? [] : [...game.view.relations]
    .sort((left, right) => Number(playerInput.includes(right.name)) - Number(playerInput.includes(left.name)) || Number(scenePersonNames.has(right.name)) - Number(scenePersonNames.has(left.name)) || (right.strength ?? 0) - (left.strength ?? 0))
    .filter((relation, index) => playerInput.includes(relation.name) || scenePersonNames.has(relation.name) || index < 4)
    .slice(0, 8);
  const relevantIntelligence = privateSolitaryAction ? [] : game.view.intelligence.filter((item) => playerInput.includes(item.title) || item.subjectId === game.view.locationId || sceneKnowledge.entries.some((entry) => entry.id === item.subjectId)).slice(0, 8);
  const relevantTasks = privateSolitaryAction ? [] : game.view.tasks.filter((task) => task.status !== "完成" && (task.id === game.view.storyArc?.mainTaskId || playerInput.includes(task.title) || task.destinationId === game.view.locationId)).slice(0, 5);
  const currentActionNeedsAwakeningHistory = /觉醒|复测|武魂记录|先天魂力/.test(`${playerInput} ${resolution.intent} ${resolution.ruleSummary}`);
  const recentNarrativeForPrompt = privateSolitaryAction ? [] : game.view.narrative
    .filter((entry) => currentActionNeedsAwakeningHistory || game.actionIndex < 2 || !(/觉醒室|觉醒阵|水晶球/.test(entry.text) && /先天满魂力|武魂显形|觉醒结果/.test(entry.text)))
    .slice(-6)
    .map((entry) => ({ ...entry, text: entry.text.slice(0, 1_600) }));

  const payload = await tracedCompletion(game, "narrator", settings, {
      model: settings.model,
      ...completionTokenLimit(settings, 4096),
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      temperature: 0.72,
      messages: [
        {
          role: "system",
          content: [
            `你是${eraTitle}时代背景的第三人称限知互动小说叙事器。正文始终贴着玩家角色的感受与判断，用角色姓名和他或她来写；只有人物对白可以使用第一人称。`,
            "可以描写已经由性格、行为证据和当前处境形成的情绪或想法；面对重大选择只能写犹豫与倾向，不能替玩家新增爱情、仇恨、欲望、道德立场或直接作出决定。",
            "程序已经决定了行动结果；你只能描写这个结果，不能改变胜负、时间、伤势、物品、魂力、关系、猎魂阶段或世界事件。",
            "保持中文小说感、人物动机连续和世界内视角，不泄露角色不知道的隐藏设定。",
            "严格服从 worldTime、occurredCanonEvents 与 futureCanonGuard。occurredCanonEvents 只包含玩家已经通过亲历、可靠消息或调查获知的历史；futureCanonGuard 不提供未来标题，任何未列入已知历史的后续事件、称号、关系结果、武魂变化和势力归属都不得自行补出。",
            "原作剧情只有在 playerCausalFootprints 明确连接到相关人物、势力或地点后才允许偏离。没有因果记录时，不能擅自提前、延后、替换或抹去原作事件。",
            "区分作者知道、模型知道与角色知道。玩家问到尚未发生的原作内容时，本地人只能给出当时能查到的常识、传闻或不知道；穿越者也只能依据其已解锁的剧情记忆。",
            "正文从眼前正在发生的动作或感官细节写起，句子长短要有变化。NPC 的说话方式要符合年龄、身份和当下顾虑。",
            "少做解释，多写手上的动作、衣物、气味、声音、停顿和不体面的细节。允许人物判断错、犹豫或话说半截。",
            "不要反复使用‘把旧布包往肩上一甩’‘拍了拍裤腿的灰’‘声音不大但很稳’‘像是没料到六岁孩子会这样问’‘步子比来时更稳’等库存动作和AI惯用转折。细节必须来自当前人物真实持有的物品、职业习惯或眼前环境，并推动判断、关系或后果。",
            "删掉空泛升华、万能比喻、整齐排比和总结性收尾。不要使用「首先、其次、最后」「值得注意的是」「这意味着」「本质上」「不是……而是……」等模板句。",
            "不要为了文艺感把普通行动写成命运、时代、道路或宏大回响。每次只抓一两个有效细节，不要堆满五感。",
            "战斗时写清站位、试探、失误和代价；交谈时保留对方的私心与信息边界；赶路和修炼可以简写，但要留下具体变化。",
            "本作前台体验是代入式斗罗成长小说，不默认采用悬疑或解密结构。除非 playerInput、fixedRuleResult 或当前事件明确要求调查秘密、证据、失踪与阴谋，否则不要制造神秘符号、来源不明的旧物、故意遮掩的 NPC 或必须追查的谜题。",
            "优先让玩家感到自己正在大陆上生活和成长：写主角想要的东西、当下的得失、身体感受、身份待遇、人与人的亲疏、力量兑现和选择后的滋味。日常、修炼、入学、交易、交友与胜利都可以直接给回报，不必一律转成新线索。",
            "章末可以落在满足、尴尬、疲惫、关系变化、拿到资源或明确的下一步目标上；只有真正的悬疑场景才用疑问和证据断章。",
            "canonNarrativeProfile 来自斗一至斗四原著的结构抽样，只学习场景进入、人物欲望、制度落地与节奏机制，不模仿或复述原著句子。必须遵守其中的时代生活质感、场景节拍、心理距离和设定讲法。",
            "suggestions必须由你根据本次刚生成的正文结尾实时创作，程序建议只作安全兜底，不要照抄或换词。三项都必须承接本次行动已经造成的现场状态，不能重复已经完成的动作。",
            "按中国男频互动网文设计选项：三项分别推进成长/资源、关系/势力、秘密/风险；写成动作+明确对象+近期目的，控制在8至28个汉字，不能用查看地图、查看新事件、观察周围或继续行动占位。",
            "三个suggestions不能都是‘再问一个人/再问一项条件’。即使是办事场景，也要分别给出成长准备、利益关系谈判和暴露/拒绝/暂缓等风险选择。",
            "playerInput是本次正文必须完整兑现的行动，不是可以替换的灵感。先写玩家所做之事及程序固定后果，再写由此产生的反应；不得用NPC来访、会议、转场或另一项任务抢走本次行动。",
            "正文前两段必须已经开始执行playerInput，必要背景只能随动作带出。不得先复述觉醒、身世、上轮结果或旁人安排，再到后半段才写玩家。",
            "调查、打听、核验、查记录类行动必须在正文前半段写出主角亲自走到具体地方、询问可接触对象、查看公开记录或交叉核对来源中的至少一项；不能只写思考、回忆、得出结论或收到消息。",
            "修炼、体能训练与休息也必须写成可见动作：如盘膝引导魂力、跑步负重拉伸、躺下合眼并让身体放松。不能只整理信息、回想或说自己要休息。",
            "未在sceneNpcProfiles、sceneKnowledge、relationships、knownFigures或fixedRuleResult中登记姓名的NPC，只能使用‘那名执事’‘负责老师’‘当班工作人员’等职务称呼，不得现编姓氏、名字或绰号。",
            "非觉醒、非复测、非培养条件谈判场景，不要重述‘先天满魂力’、‘水晶冲顶’或整段觉醒过程；如果必须提及，只写已经存在的觉醒记录、身份待遇或培养影响。",
            "行动所有权是硬门禁：正文前半段必须出现玩家动作的可见执行证据和fixedRuleResult的可见结果证据。若当前行动很短，可以扩写感受、阻力与直接后果，但不能靠新增事件凑字数。",
            "fixedRuleResult若明确禁止进舱、学习、训练或取得资格，正文只能写主角如何碰到边界、问清原因和保留下一步；不得靠‘门没锁’‘第一次免费’‘旧货摊刚好有图册’‘长辈不知从哪里弄来设备’等便利绕过程序结果。",
            "fixedRuleResult只结算修炼、休息或一项日常行动时，不得让新NPC带着帝国回函、猎魂路线、学院录取、导师邀请或培养合同突然上门；这些必须由独立程序行动结算。",
            "若本次行动是隐藏、私下测试、独处、保密或不公开，正文不得让敲门、传唤、NPC进门、实际前往议事堂或培养会议抢走行动，也不得凭空生成未持有物品。测试确实完成后，可以用一句内心提醒承接结构化状态中已经存在的未来安排，但不能实际转场、赴会或替玩家决定如何回应；suggestions必须从私下行动完成后的真实状态继续。",
            "每个重要反应都要通过欲望、信息、权限、资源、行动、后果六环。只有已经公开且被现场人物实际目击的异常天赋，才能引发符合目击者利益和权限的复测、上报、谈条件、争夺或戒备；未显形、无人目击或仍属主角秘密时不得产生NPC反应。",
            "sceneLogicCard 中 protagonistSecrets 只供主角内心与程序审校使用，NPC 在秘密公开前绝对不能据此说话、推荐或行动。",
            "narrativeLogicPacket 是正文生成前已经通过的硬逻辑合同。generationContract是本稿的正向场景白名单：先按sceneGoal和requiredBeats搭好本场骨架，只从allowedFacts取事实，逐条避开forbiddenClaims，并严格停在endingBoundary；然后再满足protagonistContract、participantContracts、reactionChain与continuityContract。不要先自由发挥再依赖审校纠错，也不得在正文中提到逻辑包、白名单、状态版本或检查过程。",
            "retrievedLongTermMemories 是本地向量库按当前行动召回的玩家已知旧事。只在与当前场景相关时自然延续；它不能覆盖当前程序状态，也不能让未亲历该事的NPC突然知情。发生冲突时以当前结构化状态和 fixedRuleResult 为准。",
            "retrievedCanonKnowledge 是按当前时代和场景召回的斗罗结构化世界资料。地点与势力条目必须读取 metadata.provenance：原著归纳不是原著原话，原创不能宣称原著出现过。人物条目只描述当前人生时间片；未提供的后来姓名、称号、武魂变化、关系结果、势力归属与目标一律视为尚未发生。玩家已经改变其关系、资源、职位或处境时，以当前存档为准。",
            "academyApplication.academySource为‘同人场景’时，校名只是当地场景称呼，不得声称原著明确设有该正式机构；feeProvenance为‘游戏估算’时，数字只是当地当次报价与程序结算，不得写成全大陆通用学费或原著硬设定。",
            "已公开的先天满魂力不应继续被普通入学费卡住：平民会获得学院奖助、地方名额或发现机构招揽的现实选项，贵族与宗门子弟则由家族或所属势力先承担基础培养。可以有归属、纪律、服务年限、竞争和猎魂损耗等条件，但不得倒退成‘天才先自己凑齐普通学费才有人理会’。",
            "工读生只是玩家明确选择且程序已经登记后的费用路线。academyApplication尚未选择工读抵扣时，不得因为平民、乡村出身或家境普通就让NPC默认主角先争工读名额；先天满魂力更应先出现奖助、招揽与培养条件的现实反应。",
            "家庭成员只以relationships、sceneNpcProfiles与knownBackground中已登记的人为准。只登记父亲、母亲或一名监护人时，不得顺口扩写成‘父母’‘爹娘’或另一个在场家长。",
            "机构只能兑现fixedRuleResult与participantContracts中已经明确的权限。武魂殿完成觉醒登记或一般指引，不等于已经答应安排、出钱或带队猎魂；学院、导师、家庭与武魂殿的责任不能互相代答。",
            "斗一的武魂殿可以承担觉醒登记、魂师注册、补贴与猎魂森林凭证等实际制度职能。某个地方执事不能亲自带队，不等于‘武魂殿管不了猎魂’，也不得把合法猎魂路线缩成只能依靠宗门或学院。",
            "fixedRuleResult与逻辑包是事实边界，不是人物台词。必须把结果改写成世界内可见行动；不得照抄‘当前只是’‘本次没有自动’‘只是具体条件’‘不等于已经无条件’等规则说明或审校口吻。",
            "正文不得补造fixedRuleResult、economy或academyApplication中没有的精确学费、物价、补贴和预算数字。只知道贵、便宜或需要另算时，就保持模糊，不要自行写成若干金魂币。",
            "斗一生活与训练使用当时人物能自然说出的身体部位、纸笔和训练动作，不要写‘魂导笔’‘半月板’‘膝盖内扣’等后世消费品或现代训练医学术语。",
            "程序没有结算接受、拒绝或路线选择时，正文只能写主角听到条件后的倾向、疑虑与追问，不得替他决定是否入学、是否拜师或下一步实际去哪里。",
            "fixedRuleResult没有登记具体日期或时辰时，不得擅自约定‘明天傍晚来找我’‘后天报到’等未来承诺；只写下一次见面前需要完成的条件。",
            "inventory只是可用物品清单，不是每场必须露面的道具。近期已经反复出现的书袋、铜牌、木箱、旱烟杆和晨光夕阳，除非本次行动确实使用或改变它们，否则换成与当前动作直接相关的细节。",
            "玩家出身、宗门、武魂或遗物若标为原创，只是服从斗罗底层规则的同人事实，不是原著实体。只能使用结构化状态已声明的形态、能力和限制，不得补成原著古老传承、已知历史或大陆公认体系，也不得凭感觉赋予武魂灵智、主动回应、警告、拒绝、择主或隐藏能力。",
            "魂环条目的beastId若为fanfic-overlimit-bestowed-ring，表示用户授权的同人超限神赐机缘：没有魂兽被猎杀，也不是海神考核的原著奖励。overlimitRingSecret存在时只有主角知道完整来源与年限；只有overlimitRingPublic成立后，NPC才能依据现场展示进行复测、争取和风险评估。",
            "activeHeirloom.canonImpact或canonInfluences若记录原著具名唯一物已由玩家持有，当前存档所有权优先：原著旧持有人不能同时凭空保留同一件物品，相关赠礼、拍卖、航海、复生或暗器装备节点必须按新所有权重算。",
            "原著关系向量默认只用于保持人物行为一致，不能直接向主角陈述。只有 sceneKnowledge 或玩家情报明确证明主角已经知道该关系时，正文和NPC才可以说破；不得借旁白泄露隐藏血缘、感情、阵营或未来身份。",
            "重要原著事件在没有玩家因果足迹时保持惯性；普通人物、关系、资源和地方事件应持续自主变化。玩家形成足够的目击、关系、权限、资源、战力或势力影响后，重要事件也必须从新状态重新推演，不能强行回轨。",
            "retrievedWorldLogic 是独立的世界基本逻辑库。先核对每条的触发前提，再执行目击—复测—上报—利益判断—具体行动—状态痕迹链。高天赋会立刻改变关注、投资、收徒、拉拢、忌惮和敌对概率，但不保证成功拜师、无条件送宝、忠诚或私人好感。",
            "敌对反应必须逐级升级：可靠消息、威胁评估、监视或接触、控制失败、行动资源与可达性成立后，才可能绑架或暗杀。不得让远方敌人无来源瞬移袭击，也不得让敌人连续送死。",
            "storyArc 是程序按真实证据门槛维护的当前卷级导演状态。stageGates 决定当前阶段能否前进：未出现真实拒绝、费用、权限或风险时不得写成阻力显形；payoffLedger 未记录导师、名额、食宿、训练、身份或第一里程碑落地时不得写成阶段兑现；未有玩家重大选择时不得写成不可逆转折。sideThreads 是自主支线，除非玩家主动处理，不得抢走 centralGoal。",
            "storyArc.npcScenes 是已经进入玩家可观察范围的NPC主动要求。只能依据其中的角色、职责、动机与行动写现场压力，不得扩大成无条件收徒、送宝或强迫好感；等待回应不等于玩家已经同意。",
            "sceneNpcProfiles 中的 directorPlan 是NPC欲望—责任—信息—权限—资源行动规划，ordinaryObligation、attentionFocus、speechStyle和refusalBoundary分别约束其日常义务、先注意什么、怎样开口和什么事不会答应。这些只用于让人物主动且连续地行动；不得把完整计划、内心或未知信息直接告诉主角，只能通过现场动作、说话、拒绝、调动资源和留下的后果表现。",
            "儿童角色的语言必须符合年龄。六至十岁可以聪明、克制、有前世记忆或受严格教育，但若设定没有明确支持，不能连续使用数据治理、行政汇报、资源审批式口吻，也不能像成年管理者主持会议。",
            "activeLocalConsequences 是错过事件已经写入程序的持续后果。正文必须让供需、治安、伤亡、制度、关系、势力或生态变化落到当前生活中；不得把已经发生的损失恢复成事件前状态。",
            `activeFanfictionRules 是根据当前行动从四千条清单中检索出的斗${game.view.era === 1 ? "一" : game.view.era === 2 ? "二" : game.view.era === 3 ? "三" : "四"}适用规则。本次正文逐条服从，不要在正文中提到规则编号或审稿过程。`,
            "事实记忆完全由程序根据行动账本、任务和结构化状态维护，你不得替程序生成summary、openThreads、keyChoice或npcNotes。当地点、人生阶段、主要矛盾或长期目标明显变化时，只可在memory.chapterTitle提出一个短章节名；普通行动返回空字符串。",
            novelEngine.prompt,
            retryGuidance.length ? `上一稿未通过审校，必须逐项修复后完整重写，不要解释修改过程：${retryGuidance.join("；")}` : "",
            `本次长度要求：${lengthTarget}。按情节自然分段，不固定段数。`,
            "输出 JSON：{\"narrative\":\"第三人称限知正文\",\"suggestions\":[\"建议1\",\"建议2\",\"建议3\"],\"memory\":{\"chapterTitle\":\"章节名或空字符串\"}}。不要返回其他memory字段。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            character: narrativeCharacter,
            personality: game.view.personalitySummary,
            personalityEvidence: game.personalityProfile.evidence?.slice(-12),
            location: game.view.location,
            worldTime: game.view.worldTime,
            occurredCanonEvents: observableCanonEventsForNarration(game).sort((left, right) => left.year - right.year || (left.day ?? 1) - (right.day ?? 1)).slice(-24).map(({ year, day, title, publicSummary }) => ({ year, day: day ?? 1, title, publicSummary })),
            futureCanonGuard: { currentYear: game.view.worldTime?.year ?? 0, currentDay: game.view.worldTime?.day ?? 1, hiddenFutureEventCount: CANON_EVENTS.filter((event) => canonEventSimulationOrdinal(event) > (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1)).length, rule: "未来事件标题、参与者与结果未提供；年份锚点缺少原著日序时，程序调度不得冒充原著精确日期。若玩家尚未改变事件成立条件，以推测窗口末端作为默认触发点，给玩家完整准备时间；若参与者、关系、资源、地点或势力条件已被玩家实际改变，必须改按存档因果推演，不得强行套用原窗口" },
            playerCausalFootprints: privateSolitaryAction ? [] : observableCausalFootprintsForNarration(game).slice(-16),
            sceneKnowledge,
            lifeGoal: privateSolitaryAction ? undefined : game.view.lifeGoal,
            affiliations: privateSolitaryAction ? [] : game.view.affiliations,
            relationships: relevantRelations,
            relationshipDimensionsAndCauses: relevantRelations.map(({ name, dimensions, history }) => ({ name, dimensions, latestCause: history?.at(-1) })),
            reputationsByIdentityAndRegion: privateSolitaryAction ? [] : game.view.reputations,
            economy: privateSolitaryAction ? undefined : game.view.economy,
            inventoryLoad: game.view.inventoryLoad,
            professions: privateSolitaryAction ? [] : game.view.professions,
            managedFactions: privateSolitaryAction ? [] : game.view.managedFactions,
            currentTaskRecords: relevantTasks,
            academyApplication: privateSolitaryAction ? undefined : game.view.academyApplication,
            academyLife: privateSolitaryAction ? undefined : game.view.academyLife,
            mentorPursuit: privateSolitaryAction ? undefined : game.view.mentorPursuit,
            hunting: privateSolitaryAction ? undefined : game.view.hunting,
            combat: privateSolitaryAction ? undefined : game.view.combat,
            knownFigures: privateSolitaryAction ? [] : game.view.knownFigures.slice(0, 12),
            intelligenceWithSources: relevantIntelligence,
            knownNpcMemories: privateSolitaryAction ? {} : Object.fromEntries(Object.values(game.world.npcs).filter((npc) => npc.knownToPlayer && npc.episodicMemory.length && (scenePersonNames.has(npc.name) || playerInput.includes(npc.name))).map((npc) => [npc.name, npc.episodicMemory.slice(-4).map(({ text, year, day, significance }) => ({ text, year, day, significance }))])),
            sceneNpcProfiles: privateSolitaryAction ? [] : [
              ...Object.values(game.world.npcs).filter((npc) => npc.alive && npc.knownToPlayer && npc.locationId === game.view.locationId).map((npc) => { const definition = characterById(npc.id); return { name: npc.name, stableTemperamentHints: definition?.personality.slice(0, 2), temperamentBoundary: "只使用当前阶段已经成立的气质、目标和责任", currentGoal: npc.currentGoal, attitude: npc.dispositionToPlayer, directorPlan: npc.activePlan ? { desire: npc.activePlan.desire, responsibility: npc.activePlan.responsibility, ordinaryObligation: npc.activePlan.ordinaryObligation, informationBoundary: npc.activePlan.informationBoundary, authority: npc.activePlan.authority, resources: npc.activePlan.resources, attentionFocus: npc.activePlan.attentionFocus, speechStyle: npc.activePlan.speechStyle, refusalBoundary: npc.activePlan.refusalBoundary, nextAction: npc.activePlan.nextAction, status: npc.activePlan.status, lastOutcome: npc.activePlan.lastOutcome, playerImpact: npc.activePlan.playerImpact } : undefined, rememberedInteractions: npc.episodicMemory.slice(-4).map(({ text, year, day, significance }) => ({ text, year, day, significance })), knownPower: game.view.knownFigures.find((item) => item.id === npc.id)?.knownPower }; }),
              ...game.view.relations.filter((relation) => relation.localState?.locationId === game.view.locationId && relation.category !== "势力").map((relation) => ({ name: relation.name, stableTemperamentHints: [relation.impression], temperamentBoundary: "只使用共同生活和当前关系已经形成的行为证据", currentGoal: relation.localState!.currentGoal, attitude: relation.dimensions?.trust ?? relation.strength ?? 0, directorPlan: { desire: relation.localState!.currentGoal, responsibility: relation.localState!.responsibility, informationBoundary: relation.localState!.informationBoundary, authority: relation.localState!.authority, resources: relation.localState!.resources, nextAction: relation.localState!.nextAction, status: relation.localState!.status, lastOutcome: relation.localState!.lastOutcome }, rememberedInteractions: (relation.history ?? []).slice(-4).map((item) => ({ text: `${item.reason}：${item.changes}`, year: game.view.worldTime?.year ?? 0, day: game.view.worldTime?.day ?? 1, significance: 1 })), knownPower: undefined })),
            ],
            recentNews: privateSolitaryAction ? [] : game.view.news.slice(0, 8),
            longTermMemory: { summary: game.storyMemory.summary.slice(0, privateSolitaryAction ? 800 : 1_800), openThreads: privateSolitaryAction ? [] : game.storyMemory.openThreads, keyChoices: privateSolitaryAction ? [] : game.storyMemory.keyChoices.slice(-8) },
            retrievedLongTermMemories,
            retrievedCanonKnowledge,
            retrievedWorldLogic,
            storyArc: narrativeStoryArc,
            activeLocalConsequences: privateSolitaryAction ? [] : game.world.localConsequences.filter((item) => item.status === "生效中" && item.locationId === game.view.locationId),
            recentNarrative: recentNarrativeForPrompt,
            playerInput,
            fixedRuleResult: resolution.ruleSummary,
            fixedSuggestions: resolution.suggestions,
            sceneLogicCard: buildChineseWebnovelSceneCard(game, resolution),
            narrativeLogicPacket,
            canonNarrativeProfile,
            pacing,
            activeFanfictionRules: activeRules.map((rule) => ({ id: rule.id, section: rule.sectionName, rule: rule.text })),
            activeNarrativeModules: novelEngine.activeModules,
          }),
        },
      ],
    }, 45_000, signal, traceContext);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 返回了空内容");
  const parsed = extractJson(content) as Partial<NarrationResult>;
  if (typeof parsed.narrative !== "string" || !Array.isArray(parsed.suggestions)) {
    throw new Error("DeepSeek 返回结构不合法");
  }
  const memoryText = parsed.memory && typeof parsed.memory === "object" && typeof parsed.memory.chapterTitle === "string" ? parsed.memory.chapterTitle : "";
  const chronologyText = `${parsed.narrative}\n${parsed.suggestions.filter((item): item is string => typeof item === "string").join("\n")}\n${memoryText}`;
  if (violatesCanonChronology(chronologyText, game.view.worldTime?.year ?? 0)) throw new Error("DeepSeek 生成内容违反当前原作时间线，已改用安全叙事");
  const auditIssues = auditNarrative(game, parsed.narrative);
  const memoryTimelineIssues = auditNarrative(game, memoryText).filter((issue) => /提前|时间线|年份|年龄|魂力|后期姓名|势力归属/.test(issue));
  const novelEngineIssues = auditNovelEngineNarrative(game, parsed.narrative, novelEngine);
  const allAuditIssues = [...auditIssues, ...memoryTimelineIssues, ...novelEngineIssues, ...auditCanonNarrativeVoice(parsed.narrative, canonNarrativeProfile), ...auditResolutionAlignment(parsed.narrative, resolution, playerInput, game)];
  if (allAuditIssues.length) throw new NarrativeAuditError(allAuditIssues);

  return {
    narrative: parsed.narrative,
    suggestions: sanitizeNarrativeSuggestions(game, parsed.suggestions.filter((item): item is string => typeof item === "string"), resolution.suggestions),
    memory: parsed.memory && typeof parsed.memory === "object" ? parsed.memory : undefined,
  };
}

export async function replayStoredNarratorPrompt(game: StoredGame, playerInput: string, resolution: ActionResolution, promptBody: unknown, signal?: AbortSignal): Promise<{ generated: NarrationResult; auditIssues: string[]; traceGroupId: string }> {
  const settings = readDeepSeekSettings();
  if (!settings.apiKey) throw new Error("尚未连接 AI，不能重放原始提示词");
  const traceGroupId = randomUUID();
  const context: TurnTraceContext = { groupId: traceGroupId, attempt: 1, operation: "model-replay" };
  await safeStartTurnTrace(traceGroupId, game, playerInput, resolution, "model-replay");
  try {
    const payload = await tracedCompletion(game, "narrator", settings, promptBody, 45_000, signal, context);
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("模型重放返回了空内容");
    const parsed = extractJson(content) as Partial<NarrationResult>;
    if (typeof parsed.narrative !== "string" || !Array.isArray(parsed.suggestions)) throw new Error("模型重放返回结构不合法");
    const generated: NarrationResult = { narrative: parsed.narrative, suggestions: sanitizeNarrativeSuggestions(game, parsed.suggestions.filter((item): item is string => typeof item === "string"), resolution.suggestions), memory: parsed.memory && typeof parsed.memory === "object" ? parsed.memory : undefined, traceGroupId };
    const auditIssues = auditArchivedNarrative(game, playerInput, resolution, generated.narrative);
    await safeCompleteTraceAttempt(context, auditIssues.length ? "audit-failed" : "accepted", auditIssues);
    await safeCompleteTraceGroup(traceGroupId, auditIssues.length ? "failed" : "accepted", generated.narrative, auditIssues);
    return { generated, auditIssues, traceGroupId };
  } catch (error) {
    const issues = [error instanceof Error ? error.message : "模型重放失败"];
    await safeCompleteTraceAttempt(context, "model-error", issues);
    await safeCompleteTraceGroup(traceGroupId, "failed", undefined, issues);
    throw error;
  }
}

export async function narrateWithAuditRetries(
  game: StoredGame,
  playerInput: string,
  resolution: ActionResolution,
  signal?: AbortSignal,
  onRetry?: (attempt: number, reason: string) => void,
  narrator: typeof narrateWithDeepSeek = narrateWithDeepSeek,
  operation: TurnTraceContext["operation"] = "action",
): Promise<NarrationResult | null> {
  let lastError: unknown;
  let retryGuidance: string[] = [];
  const maximumAttempts = Math.max(1, Math.min(4, positiveEnvironmentInteger("DOULUO_MODEL_SMOKE_MAX_NARRATIVE_ATTEMPTS") ?? 4));
  const traceGroupId = randomUUID();
  await safeStartTurnTrace(traceGroupId, game, playerInput, resolution, operation);
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const traceContext: TurnTraceContext = { groupId: traceGroupId, attempt: attempt + 1, operation };
    try {
      const generated = await narrator(game, playerInput, resolution, signal, retryGuidance, traceContext);
      if (generated) {
        await safeCompleteTraceAttempt(traceContext, "accepted");
        await safeCompleteTraceGroup(traceGroupId, "accepted", generated.narrative);
        return { ...generated, traceGroupId };
      }
      return null;
    }
    catch (error) {
      if (signal?.aborted) throw error;
      const issues = error instanceof NarrativeAuditError ? error.issues : [error instanceof Error ? error.message : "模型调用失败"];
      await safeCompleteTraceAttempt(traceContext, error instanceof NarrativeAuditError ? "audit-failed" : "model-error", issues);
      if (error instanceof NarrativeLogicPreflightError) { await safeCompleteTraceGroup(traceGroupId, "failed", undefined, issues); throw error; }
      lastError = error;
      retryGuidance = error instanceof NarrativeAuditError ? error.issues : ["上一稿没有完整返回，请重新生成完整且合法的 JSON 正文"];
      if (attempt < maximumAttempts - 1) onRetry?.(attempt + 2, retryGuidance.join("、"));
    }
  }
  await safeCompleteTraceGroup(traceGroupId, "failed", undefined, retryGuidance);
  throw lastError instanceof Error ? lastError : new Error("AI 连续多次未通过设定审校");
}

export function applyNarrativeMemory(game: StoredGame, generated: NarrationResult): void {
  const memory = generated.memory;
  if (!memory) return;
  if (typeof memory.chapterTitle === "string" && memory.chapterTitle.trim() && memory.chapterTitle.trim() !== game.storyMemory.chapterTitle) {
    game.storyMemory.chapterNumber += 1;
    game.storyMemory.chapterTitle = memory.chapterTitle.trim().slice(0, 24);
  }
  game.storyMemory.lastUpdatedAction = game.actionIndex;
  game.view.chapter = { number: game.storyMemory.chapterNumber, title: game.storyMemory.chapterTitle, summary: game.storyMemory.summary.slice(0, 220) };
  refreshStoryArchive(game);
}
