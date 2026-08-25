import type { ActionResolution, StoredGame } from "../domain/model.js";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, characterById, locationById } from "../data/world.js";
import { toThirdPersonNarrative } from "../domain/narrative.js";
import { auditNarrative, auditNarrativeLogicPacket, buildChineseWebnovelSceneCard, buildNarrativeLogicPacket, refreshStoryArchive, sanitizeNarrativeSuggestions, selectNarrativeRules, violatesCanonChronology } from "../domain/story-rules.js";
import { readDeepSeekSettings } from "./settings.js";
import { auditNovelEngineNarrative, auditResolutionAlignment, buildNovelEnginePack } from "../domain/novel-engine.js";
import { rememberNpcInteraction } from "../domain/world.js";
import { buildSceneKnowledgePack } from "../domain/scene-knowledge.js";

export { violatesCanonChronology } from "../domain/story-rules.js";

export interface NarrationResult {
  narrative: string;
  suggestions: string[];
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
  const eraTexture = ({
    1: "斗一的奇异感从村庄、家庭生计、铁匠铺、学院名额、路费与猎魂手令等日常门槛中长出来；魂师身份尊贵，但普通人仍要吃饭、干活、赶路和求人。",
    2: "斗二先写个人匮乏、谋生本领、同伴相遇与学院竞争，再让魂导器、魂灵研究和万年制度变化进入人物选择；弱小阶段的每份资源都应有重量。",
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
  const importantCanonContact = CANON_CHARACTERS.some((character) => character.importance >= 4 && playerInput.includes(game.world.npcs[character.id]?.name ?? "不存在的当前姓名"));
  const activeEventContact = game.world.dynamicEvents.some((event) => event.status === "可介入" && playerInput.includes(event.title));
  const key = importantCanonContact || /重要战斗|生死|死亡|复生|魂环吸收|觉醒|加入势力|背叛|拜师|建立势力|历史偏移|原作关键|结局|神位|重大选择/.test(scene);
  const routineIntent = /^(调查|交谈|一般行动|购买|工作|休息|等待)$/u.test(resolution.intent);
  const minor = !key && !activeEventContact && (routineIntent || /观察|查看|翻找|整理|简单询问|购买|普通工作|休息|等待|赶路|一般行动|日常/.test(scene));
  const kind = key ? "关键" : minor ? "略写" : "推进";
  const target = game.view.speed === "高速"
    ? kind === "关键" ? "700至1200字" : kind === "略写" ? "160至320字" : "300至550字"
    : kind === "关键" ? "1600至2800字" : kind === "略写" ? "280至550字" : "600至1000字";
  const directive = kind === "略写"
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

async function safeRecordContextRetrieval(game: StoredGame, role: "intent" | "narrator", counts: { memory: number; canon: number; logic: number }): Promise<void> {
  try {
    const { recordContextRetrieval } = await import("../db.js");
    recordContextRetrieval({ gameId: game.view.id, role, actionIndex: game.actionIndex, ...counts });
  } catch {
    // Retrieval has already succeeded; diagnostics must not invalidate it.
  }
}

async function tracedCompletion(game: StoredGame, role: "intent" | "narrator", settings: { apiKey: string; baseUrl: string; model: string }, body: unknown, timeout: number, signal?: AbortSignal): Promise<ChatCompletionPayload> {
  const started = performance.now();
  const serialized = JSON.stringify(body);
  let recorded = false;
  try {
    const maximumRequestChars = positiveEnvironmentInteger("DOULUO_MODEL_SMOKE_MAX_REQUEST_CHARS");
    if (maximumRequestChars && serialized.length > maximumRequestChars) throw new Error(`真实模型冒烟请求超过 ${maximumRequestChars} 字符硬上限`);
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
    return payload;
  } catch (error) {
    if (!recorded) await safeRecordModelCall({ gameId: game.view.id, role, model: settings.model, status: "failure", latencyMs: performance.now() - started, promptChars: serialized.length, outputChars: 0, errorCode: error instanceof DOMException ? error.name : error instanceof Error ? error.constructor.name : "unknown" });
    throw error;
  }
}

export async function interpretActionWithDeepSeek(game: StoredGame, playerInput: string, signal?: AbortSignal): Promise<string | null> {
  const settings = readDeepSeekSettings();
  if (!settings.apiKey) return null;
  const relevantPast = await retrieveVectorMemoryContext(game, `${playerInput}\n${game.view.location}\n${game.view.tasks.filter((task) => task.status !== "完成").slice(0, 4).map((task) => task.title).join("\n")}`);
  await safeRecordContextRetrieval(game, "intent", { memory: relevantPast.length, canon: 0, logic: 0 });
  const payload = await tracedCompletion(game, "intent", settings, {
      model: settings.model,
      max_tokens: 256,
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
        { role: "user", content: JSON.stringify({ playerInput, relevantPast, era: game.view.era ?? 1, worldTime: game.view.worldTime, character: game.view.character, location: game.view.location, map: game.view.map.map((item) => item.name), academyApplication: game.view.academyApplication, mentorPursuit: game.view.mentorPursuit, currentHunt: game.view.hunting, currentEvents: game.view.activeEvents.map((item) => item.title), tasks: game.view.tasks.filter((item) => item.status === "进行中").map((item) => item.title) }) },
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
): Promise<NarrationResult | null> {
  const settings = readDeepSeekSettings();
  if (!settings.apiKey) return null;
  const activeRules = selectNarrativeRules(game, playerInput, resolution);
  const novelEngine = buildNovelEnginePack(game, playerInput, resolution, settings.novelEngineEnabled);
  const pacing = narrativePacing(game, playerInput, resolution);
  const sceneKnowledge = buildSceneKnowledgePack(game, playerInput);
  const narrativeLogicPacket = buildNarrativeLogicPacket(game, playerInput, resolution, sceneKnowledge);
  const canonNarrativeProfile = buildCanonNarrativeProfile(game, playerInput, resolution);
  const logicIssues = auditNarrativeLogicPacket(narrativeLogicPacket);
  if (logicIssues.length) throw new NarrativeLogicPreflightError(logicIssues);
  const publicSoulIndices = game.view.character?.publiclyKnownMartialSoulIndices ?? [0];
  const publicSoulNames = game.view.character?.martialSouls.filter((_soul, index) => publicSoulIndices.includes(index)).map((soul) => soul.name) ?? [];
  const memoryQuery = [
    playerInput, resolution.intent, resolution.ruleSummary, game.view.location,
    publicSoulNames.length ? `已公开${publicSoulNames.length}个武魂：${publicSoulNames.join("、")}；先天魂力${game.view.character?.innateSoulPower ?? "未知"}；社会评价${game.view.character?.reputation ?? "尚未形成"}` : "",
    game.view.storyArc ? `当前故事卷：${game.view.storyArc.title}；阶段${game.view.storyArc.stage}；目标${game.view.storyArc.centralGoal}；冲突${game.view.storyArc.centralConflict}；对抗压力${game.view.storyArc.opposingForce}` : "",
    ...game.view.tasks.filter((task) => task.status !== "完成").slice(0, 6).map((task) => `${task.title} ${task.detail}`),
    ...game.world.localConsequences.filter((item) => item.status === "生效中" && item.locationId === game.view.locationId).map((item) => `持续后果：${item.summary}`),
    ...Object.values(game.world.npcs).filter((npc) => npc.alive && npc.knownToPlayer && npc.locationId === game.view.locationId).map((npc) => `${npc.name}：${npc.activePlan?.nextAction ?? npc.currentGoal}；责任${npc.activePlan?.responsibility ?? "个人事务"}`),
  ].join("\n");
  const retrievedLongTermMemories = await retrieveVectorMemoryContext(game, memoryQuery);
  const retrievedCanonKnowledge = await retrieveCanonKnowledgeContext(game, memoryQuery);
  const retrievedWorldLogic = await retrieveWorldLogicContext(game, memoryQuery);
  if (!retrievedWorldLogic.length) throw new Error("世界基本逻辑检索没有返回适用规则，已停止本次正文生成");
  await safeRecordContextRetrieval(game, "narrator", { memory: retrievedLongTermMemories.length, canon: retrievedCanonKnowledge.length, logic: retrievedWorldLogic.length });
  const lengthTarget = `${pacing.kind}场景，${pacing.target}。${pacing.directive}`;
  const eraTitle = ({ 1: "《斗罗大陆》第一部", 2: "《绝世唐门》", 3: "《龙王传说》", 4: "《终极斗罗》" } as const)[game.view.era ?? 1];

  const payload = await tracedCompletion(game, "narrator", settings, {
      model: settings.model,
      max_tokens: 4096,
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
            "删掉空泛升华、万能比喻、整齐排比和总结性收尾。不要使用「首先、其次、最后」「值得注意的是」「这意味着」「本质上」「不是……而是……」等模板句。",
            "不要为了文艺感把普通行动写成命运、时代、道路或宏大回响。每次只抓一两个有效细节，不要堆满五感。",
            "战斗时写清站位、试探、失误和代价；交谈时保留对方的私心与信息边界；赶路和修炼可以简写，但要留下具体变化。",
            "本作前台体验是代入式斗罗成长小说，不默认采用悬疑或解密结构。除非 playerInput、fixedRuleResult 或当前事件明确要求调查秘密、证据、失踪与阴谋，否则不要制造神秘符号、来源不明的旧物、故意遮掩的 NPC 或必须追查的谜题。",
            "优先让玩家感到自己正在大陆上生活和成长：写主角想要的东西、当下的得失、身体感受、身份待遇、人与人的亲疏、力量兑现和选择后的滋味。日常、修炼、入学、交易、交友与胜利都可以直接给回报，不必一律转成新线索。",
            "章末可以落在满足、尴尬、疲惫、关系变化、拿到资源或明确的下一步目标上；只有真正的悬疑场景才用疑问和证据断章。",
            "canonNarrativeProfile 来自斗一至斗四原著的结构抽样，只学习场景进入、人物欲望、制度落地与节奏机制，不模仿或复述原著句子。必须遵守其中的时代生活质感、场景节拍、心理距离和设定讲法。",
            "建议必须是角色眼下做得到的动作。若程序给出了建议，优先沿用其含义。",
            "按中国男频互动网文设计选项：三项分别推进成长/资源、关系/势力、秘密/风险；写成动作+明确对象+近期目的，不能用查看地图、查看新事件、观察周围或继续行动占位。",
            "每个重要反应都要通过欲望、信息、权限、资源、行动、后果六环。异常天赋必须引发符合目击者利益和权限的复测、上报、谈条件、争夺或戒备，不能只惊叹一句便散场。",
            "sceneLogicCard 中 protagonistSecrets 只供主角内心与程序审校使用，NPC 在秘密公开前绝对不能据此说话、推荐或行动。",
            "narrativeLogicPacket 是正文生成前已经通过的硬逻辑合同。先逐项满足 protagonistContract、participantContracts、reactionChain 与 continuityContract，再写句子；不得在正文中提到逻辑包、状态版本或检查过程。",
            "retrievedLongTermMemories 是本地向量库按当前行动召回的玩家已知旧事。只在与当前场景相关时自然延续；它不能覆盖当前程序状态，也不能让未亲历该事的NPC突然知情。发生冲突时以当前结构化状态和 fixedRuleResult 为准。",
            "retrievedCanonKnowledge 是按当前时代和场景召回的斗罗结构化世界资料。地点与势力条目必须读取 metadata.provenance：原著归纳不是原著原话，原创不能宣称原著出现过。人物条目只描述当前人生时间片；未提供的后来姓名、称号、武魂变化、关系结果、势力归属与目标一律视为尚未发生。玩家已经改变其关系、资源、职位或处境时，以当前存档为准。",
            "原著关系向量默认只用于保持人物行为一致，不能直接向主角陈述。只有 sceneKnowledge 或玩家情报明确证明主角已经知道该关系时，正文和NPC才可以说破；不得借旁白泄露隐藏血缘、感情、阵营或未来身份。",
            "重要原著事件在没有玩家因果足迹时保持惯性；普通人物、关系、资源和地方事件应持续自主变化。玩家形成足够的目击、关系、权限、资源、战力或势力影响后，重要事件也必须从新状态重新推演，不能强行回轨。",
            "retrievedWorldLogic 是独立的世界基本逻辑库。先核对每条的触发前提，再执行目击—复测—上报—利益判断—具体行动—状态痕迹链。高天赋会立刻改变关注、投资、收徒、拉拢、忌惮和敌对概率，但不保证成功拜师、无条件送宝、忠诚或私人好感。",
            "敌对反应必须逐级升级：可靠消息、威胁评估、监视或接触、控制失败、行动资源与可达性成立后，才可能绑架或暗杀。不得让远方敌人无来源瞬移袭击，也不得让敌人连续送死。",
            "storyArc 是程序按真实证据门槛维护的当前卷级导演状态。stageGates 决定当前阶段能否前进：未出现真实拒绝、费用、权限或风险时不得写成阻力显形；payoffLedger 未记录导师、名额、食宿、训练、身份或第一里程碑落地时不得写成阶段兑现；未有玩家重大选择时不得写成不可逆转折。sideThreads 是自主支线，除非玩家主动处理，不得抢走 centralGoal。",
            "storyArc.npcScenes 是已经进入玩家可观察范围的NPC主动要求。只能依据其中的角色、职责、动机与行动写现场压力，不得扩大成无条件收徒、送宝或强迫好感；等待回应不等于玩家已经同意。",
            "sceneNpcProfiles 中的 directorPlan 是NPC欲望—责任—信息—权限—资源行动规划，只用于让人物主动且连续地行动。不得把完整计划、内心或未知信息直接告诉主角；只能通过现场动作、说话、拒绝、调动资源和留下的后果表现。",
            "activeLocalConsequences 是错过事件已经写入程序的持续后果。正文必须让供需、治安、伤亡、制度、关系、势力或生态变化落到当前生活中；不得把已经发生的损失恢复成事件前状态。",
            `activeFanfictionRules 是根据当前行动从四千条清单中检索出的斗${game.view.era === 1 ? "一" : game.view.era === 2 ? "二" : game.view.era === 3 ? "三" : "四"}适用规则。本次正文逐条服从，不要在正文中提到规则编号或审稿过程。`,
            "你还负责维护玩家可知的长期记忆。summary 要合并旧摘要和本次结果，保留身份、关系、承诺、伤势、秘密与长期目标，控制在八百字内。openThreads 只留仍未解决的事。npcNotes 按人名记录此人亲历且今后应该记得的互动，不得写入其未知事实。",
            "当地点、人生阶段、主要矛盾或长期目标发生明显变化时，可以拟一个短章节名；普通行动沿用旧章节名。",
            novelEngine.prompt,
            retryGuidance.length ? `上一稿未通过审校，必须逐项修复后完整重写，不要解释修改过程：${retryGuidance.join("；")}` : "",
            `本次长度要求：${lengthTarget}。按情节自然分段，不固定段数。`,
            "输出 JSON：{\"narrative\":\"第三人称限知正文\",\"suggestions\":[\"建议1\",\"建议2\",\"建议3\"],\"memory\":{\"summary\":\"长期摘要\",\"openThreads\":[\"未决事项\"],\"keyChoice\":\"本次关键选择，无则空字符串\",\"npcNotes\":{\"人名\":\"应记住的互动\"},\"chapterTitle\":\"章节名\"}}。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            character: game.view.character,
            personality: game.view.personalitySummary,
            personalityEvidence: game.personalityProfile.evidence?.slice(-12),
            location: game.view.location,
            worldTime: game.view.worldTime,
            occurredCanonEvents: observableCanonEventsForNarration(game).sort((left, right) => left.year - right.year || (left.day ?? 1) - (right.day ?? 1)).slice(-24).map(({ year, day, title, publicSummary }) => ({ year, day: day ?? 1, title, publicSummary })),
            futureCanonGuard: { currentYear: game.view.worldTime?.year ?? 0, currentDay: game.view.worldTime?.day ?? 1, hiddenFutureEventCount: CANON_EVENTS.filter((event) => event.year > (game.view.worldTime?.year ?? 0) || (event.year === (game.view.worldTime?.year ?? 0) && (event.day ?? 1) > (game.view.worldTime?.day ?? 1))).length, rule: "未来事件标题、参与者与结果未提供；不得猜测或补写" },
            playerCausalFootprints: observableCausalFootprintsForNarration(game).slice(-16),
            sceneKnowledge,
            lifeGoal: game.view.lifeGoal,
            affiliations: game.view.affiliations,
            relationships: game.view.relations.slice(0, 16),
            relationshipDimensionsAndCauses: game.view.relations.slice(0, 16).map(({ name, dimensions, history }) => ({ name, dimensions, latestCause: history?.at(-1) })),
            reputationsByIdentityAndRegion: game.view.reputations,
            economy: game.view.economy,
            inventoryLoad: game.view.inventoryLoad,
            professions: game.view.professions,
            managedFactions: game.view.managedFactions,
            currentTaskRecords: game.view.tasks.filter((task) => task.status !== "完成").slice(0, 10),
            academyApplication: game.view.academyApplication,
            mentorPursuit: game.view.mentorPursuit,
            hunting: game.view.hunting,
            combat: game.view.combat,
            knownFigures: game.view.knownFigures.slice(0, 12),
            intelligenceWithSources: game.view.intelligence.slice(0, 12),
            knownNpcMemories: Object.fromEntries(Object.values(game.world.npcs).filter((npc) => npc.knownToPlayer && npc.episodicMemory.length).map((npc) => [npc.name, npc.episodicMemory.slice(-4).map(({ text, year, day, significance }) => ({ text, year, day, significance }))])),
            sceneNpcProfiles: Object.values(game.world.npcs).filter((npc) => npc.alive && npc.knownToPlayer && npc.locationId === game.view.locationId).map((npc) => { const definition = characterById(npc.id); return { name: npc.name, personality: definition?.personality, currentGoal: npc.currentGoal, attitude: npc.dispositionToPlayer, directorPlan: npc.activePlan ? { desire: npc.activePlan.desire, responsibility: npc.activePlan.responsibility, informationBoundary: npc.activePlan.informationBoundary, authority: npc.activePlan.authority, resources: npc.activePlan.resources, nextAction: npc.activePlan.nextAction, status: npc.activePlan.status, lastOutcome: npc.activePlan.lastOutcome, playerImpact: npc.activePlan.playerImpact } : undefined, rememberedInteractions: npc.episodicMemory.slice(-4).map(({ text, year, day, significance }) => ({ text, year, day, significance })), knownPower: game.view.knownFigures.find((item) => item.id === npc.id)?.knownPower }; }),
            recentNews: game.view.news.slice(0, 8),
            longTermMemory: { summary: game.storyMemory.summary.slice(0, 1_800), openThreads: game.storyMemory.openThreads, keyChoices: game.storyMemory.keyChoices.slice(-8) },
            retrievedLongTermMemories,
            retrievedCanonKnowledge,
            retrievedWorldLogic,
            storyArc: game.view.storyArc,
            activeLocalConsequences: game.world.localConsequences.filter((item) => item.status === "生效中" && item.locationId === game.view.locationId),
            recentNarrative: game.view.narrative.slice(-6).map((entry) => ({ ...entry, text: entry.text.slice(0, 1_600) })),
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
    }, 45_000, signal);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 返回了空内容");
  const parsed = extractJson(content) as Partial<NarrationResult>;
  if (typeof parsed.narrative !== "string" || !Array.isArray(parsed.suggestions)) {
    throw new Error("DeepSeek 返回结构不合法");
  }
  const memoryText = parsed.memory && typeof parsed.memory === "object" ? [parsed.memory.summary, ...(parsed.memory.openThreads ?? []), parsed.memory.keyChoice, ...Object.keys(parsed.memory.npcNotes ?? {}), ...Object.values(parsed.memory.npcNotes ?? {}), parsed.memory.chapterTitle].filter((item): item is string => typeof item === "string").join("\n") : "";
  const chronologyText = `${parsed.narrative}\n${parsed.suggestions.filter((item): item is string => typeof item === "string").join("\n")}\n${memoryText}`;
  if (violatesCanonChronology(chronologyText, game.view.worldTime?.year ?? 0)) throw new Error("DeepSeek 生成内容违反当前原作时间线，已改用安全叙事");
  const auditIssues = auditNarrative(game, parsed.narrative);
  const memoryTimelineIssues = auditNarrative(game, memoryText).filter((issue) => /提前|时间线|年份|年龄|魂力|后期姓名|势力归属/.test(issue));
  const novelEngineIssues = auditNovelEngineNarrative(game, parsed.narrative, novelEngine);
  const allAuditIssues = [...auditIssues, ...memoryTimelineIssues, ...novelEngineIssues, ...auditCanonNarrativeVoice(parsed.narrative, canonNarrativeProfile), ...auditResolutionAlignment(parsed.narrative, resolution)];
  if (allAuditIssues.length) throw new NarrativeAuditError(allAuditIssues);

  return {
    narrative: parsed.narrative,
    suggestions: sanitizeNarrativeSuggestions(game, parsed.suggestions.filter((item): item is string => typeof item === "string"), resolution.suggestions),
    memory: parsed.memory && typeof parsed.memory === "object" ? parsed.memory : undefined,
  };
}

export async function narrateWithAuditRetries(
  game: StoredGame,
  playerInput: string,
  resolution: ActionResolution,
  signal?: AbortSignal,
  onRetry?: (attempt: number, reason: string) => void,
  narrator: typeof narrateWithDeepSeek = narrateWithDeepSeek,
): Promise<NarrationResult | null> {
  let lastError: unknown;
  let retryGuidance: string[] = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try { return await narrator(game, playerInput, resolution, signal, retryGuidance); }
    catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof NarrativeLogicPreflightError) throw error;
      lastError = error;
      retryGuidance = error instanceof NarrativeAuditError ? error.issues : ["上一稿没有完整返回，请重新生成完整且合法的 JSON 正文"];
      if (attempt < 3) onRetry?.(attempt + 2, retryGuidance.join("、"));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI 连续多次未通过设定审校");
}

export function applyNarrativeMemory(game: StoredGame, generated: NarrationResult): void {
  const memory = generated.memory;
  if (!memory) return;
  const character = game.view.character;
  const normalize = (text: string) => character ? toThirdPersonNarrative(text, character.name, character.gender) : text;
  if (typeof memory.summary === "string" && memory.summary.trim()) game.storyMemory.summary = normalize(memory.summary.trim()).slice(0, 4000);
  if (Array.isArray(memory.openThreads)) game.storyMemory.openThreads = memory.openThreads.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.slice(0, 120)).slice(0, 12);
  if (typeof memory.keyChoice === "string" && memory.keyChoice.trim()) game.storyMemory.keyChoices = [...game.storyMemory.keyChoices, normalize(memory.keyChoice.trim()).slice(0, 160)].slice(-20);
  if (memory.npcNotes && typeof memory.npcNotes === "object") {
    for (const [name, note] of Object.entries(memory.npcNotes)) if (typeof note === "string" && note.trim()) {
      const normalizedNote = normalize(note.trim());
      game.storyMemory.npcNotes[name.slice(0, 30)] = normalizedNote.slice(0, 400);
      const npc = Object.values(game.world.npcs).find((item) => item.name === name && item.knownToPlayer);
      if (npc) rememberNpcInteraction(game, npc, normalizedNote, "叙事提取");
    }
  }
  if (typeof memory.chapterTitle === "string" && memory.chapterTitle.trim() && memory.chapterTitle.trim() !== game.storyMemory.chapterTitle) {
    game.storyMemory.chapterNumber += 1;
    game.storyMemory.chapterTitle = memory.chapterTitle.trim().slice(0, 24);
  }
  game.storyMemory.lastUpdatedAction = game.actionIndex;
  game.view.chapter = { number: game.storyMemory.chapterNumber, title: game.storyMemory.chapterTitle, summary: game.storyMemory.summary.slice(0, 220) };
  refreshStoryArchive(game);
}
