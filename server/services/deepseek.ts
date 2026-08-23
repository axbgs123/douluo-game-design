import type { ActionResolution, StoredGame } from "../domain/model.js";
import { CANON_CHARACTERS, CANON_EVENTS, FACTIONS, characterById } from "../data/world.js";
import { toThirdPersonNarrative } from "../domain/narrative.js";
import { auditNarrative, refreshStoryArchive, sanitizeNarrativeSuggestions, selectNarrativeRules, violatesCanonChronology } from "../domain/story-rules.js";
import { readDeepSeekSettings } from "./settings.js";
import { auditNovelEngineNarrative, buildNovelEnginePack } from "../domain/novel-engine.js";

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

export class NarrativeAuditError extends Error {
  constructor(public readonly issues: string[]) {
    super(`正文未通过审校：${issues.join("、")}`);
    this.name = "NarrativeAuditError";
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
  const importantCanonContact = CANON_CHARACTERS.some((character) => character.importance >= 4 && (playerInput.includes(character.name) || character.aliases.some((alias) => playerInput.includes(alias))));
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

export async function interpretActionWithDeepSeek(game: StoredGame, playerInput: string, signal?: AbortSignal): Promise<string | null> {
  const settings = readDeepSeekSettings();
  if (!settings.apiKey) return null;
  const response = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
    signal: requestSignal(20_000, signal),
    body: JSON.stringify({
      model: settings.model,
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: [
          "你是文字RPG的行动语义整理器，只把玩家原话整理成规则程序容易识别的一句话。",
          "不能决定成功失败，不能增加物品、能力、地点、人物或前提。保留玩家的具体目标、方法、谨慎程度和退路。",
          "玩家一次输入多项行动时，只整理能够连续安全执行的第一个阶段；在战斗、生死、入宗或背叛、魂环魂骨、婚恋、杀死重要人物、暴露秘密、改变原作节点、消耗不可恢复物品、复活成神等重大节点前停下，不替玩家跨过去。",
          "可用动作词包括修炼、休息、前往、询问、调查、购买、使用、工作、等待、攻击、防御、逃跑、猎魂、追踪、吸收、入学、加入势力、拜师、承诺、履行承诺、参悟特殊体系、介入事件。",
          "输出 JSON：{\"ruleAction\":\"整理后的一句话\"}。",
        ].join("\n") },
        { role: "user", content: JSON.stringify({ playerInput, character: game.view.character, location: game.view.location, map: game.view.map.map((item) => item.name), currentHunt: game.view.hunting, currentEvents: game.world.dynamicEvents.filter((item) => item.status === "可介入").map((item) => item.title), tasks: game.view.tasks.filter((item) => item.status === "进行中").map((item) => item.title) }) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek 行动理解失败：${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
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
  const lengthTarget = `${pacing.kind}场景，${pacing.target}。${pacing.directive}`;

  const response = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: requestSignal(45_000, signal),
    body: JSON.stringify({
      model: settings.model,
      response_format: { type: "json_object" },
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: [
            "你是《斗罗大陆》第一部背景的第三人称限知互动小说叙事器。正文始终贴着玩家角色的感受与判断，用角色姓名和他或她来写；只有人物对白可以使用第一人称。",
            "可以描写已经由性格、行为证据和当前处境形成的情绪或想法；面对重大选择只能写犹豫与倾向，不能替玩家新增爱情、仇恨、欲望、道德立场或直接作出决定。",
            "程序已经决定了行动结果；你只能描写这个结果，不能改变胜负、时间、伤势、物品、魂力、关系、猎魂阶段或世界事件。",
            "保持中文小说感、人物动机连续和世界内视角，不泄露角色不知道的隐藏设定。",
            "严格服从 worldTime、occurredCanonEvents 与 futureCanonLocks。futureCanonLocks 中的事在对应年份前绝对没有发生，NPC 不得提前知道、参加或谈论其结果。",
            "原作剧情只有在 playerCausalFootprints 明确连接到相关人物、势力或地点后才允许偏离。没有因果记录时，不能擅自提前、延后、替换或抹去原作事件。",
            "区分作者知道、模型知道与角色知道。玩家问到尚未发生的原作内容时，本地人只能给出当时能查到的常识、传闻或不知道；穿越者也只能依据其已解锁的剧情记忆。",
            "正文从眼前正在发生的动作或感官细节写起，句子长短要有变化。NPC 的说话方式要符合年龄、身份和当下顾虑。",
            "少做解释，多写手上的动作、衣物、气味、声音、停顿和不体面的细节。允许人物判断错、犹豫或话说半截。",
            "删掉空泛升华、万能比喻、整齐排比和总结性收尾。不要使用「首先、其次、最后」「值得注意的是」「这意味着」「本质上」「不是……而是……」等模板句。",
            "不要为了文艺感把普通行动写成命运、时代、道路或宏大回响。每次只抓一两个有效细节，不要堆满五感。",
            "战斗时写清站位、试探、失误和代价；交谈时保留对方的私心与信息边界；赶路和修炼可以简写，但要留下具体变化。",
            "建议必须是角色眼下做得到的动作。若程序给出了建议，优先沿用其含义。",
            "activeFanfictionRules 是根据当前行动从四千条清单中检索出的斗一适用规则。本次正文逐条服从，不要在正文中提到规则编号或审稿过程。",
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
            occurredCanonEvents: CANON_EVENTS.filter((event) => game.world.firedCanonEvents.includes(event.id)).sort((left, right) => left.year - right.year).slice(-24).map(({ year, title, publicSummary }) => ({ year, title, publicSummary })),
            futureCanonLocks: CANON_EVENTS.filter((event) => event.year > (game.view.worldTime?.year ?? 0) && event.year <= (game.view.worldTime?.year ?? 0) + 50).slice(0, 36).map(({ year, title, participantIds }) => ({ notBeforeYear: year, title, participants: participantIds.map((id) => characterById(id)?.name ?? id) })),
            playerCausalFootprints: game.world.canonCausalFootprints.slice(-16),
            knownInstitutions: FACTIONS.filter((faction) => (faction.activeFromYear === undefined || (game.view.worldTime?.year ?? 0) >= faction.activeFromYear) && (faction.activeUntilYear === undefined || (game.view.worldTime?.year ?? 0) <= faction.activeUntilYear) && !faction.hidden && (faction.id !== "tang-sect" || (game.view.worldTime?.year ?? 0) >= 12)).map(({ name, kind, description }) => ({ name, kind, description })),
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
            hunting: game.view.hunting,
            combat: game.view.combat,
            knownFigures: game.view.knownFigures.slice(0, 12),
            intelligenceWithSources: game.view.intelligence.slice(0, 20),
            knownNpcMemories: Object.fromEntries(Object.values(game.world.npcs).filter((npc) => npc.knownToPlayer && npc.memoryOfPlayer.length).map((npc) => [npc.name, npc.memoryOfPlayer.slice(-6)])),
            sceneNpcProfiles: Object.values(game.world.npcs).filter((npc) => npc.alive && npc.knownToPlayer && npc.locationId === game.view.locationId).map((npc) => { const definition = characterById(npc.id); return { name: npc.name, personality: definition?.personality, currentGoal: npc.currentGoal, attitude: npc.dispositionToPlayer, rememberedInteractions: npc.memoryOfPlayer.slice(-6), knownPower: game.view.knownFigures.find((item) => item.id === npc.id)?.knownPower }; }),
            recentNews: game.view.news.slice(0, 8),
            currentWorldEvents: game.world.dynamicEvents.filter((event) => event.status === "可介入" && (event.locationId === game.view.locationId || event.participantIds.some((id) => game.world.npcs[id]?.knownToPlayer))).map(({ title, detail, kind }) => ({ title, detail, kind })),
            visibleMap: game.view.map.filter((location) => location.discovered).map(({ name, danger, current }) => ({ name, danger, current })),
            longTermMemory: game.storyMemory,
            recentNarrative: game.view.narrative.slice(-12),
            playerInput,
            fixedRuleResult: resolution.ruleSummary,
            fixedSuggestions: resolution.suggestions,
            pacing,
            activeFanfictionRules: activeRules.map((rule) => ({ id: rule.id, section: rule.sectionName, rule: rule.text })),
            activeNarrativeModules: novelEngine.activeModules,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek 请求失败：${response.status}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 返回了空内容");
  const parsed = extractJson(content) as Partial<NarrationResult>;
  if (typeof parsed.narrative !== "string" || !Array.isArray(parsed.suggestions)) {
    throw new Error("DeepSeek 返回结构不合法");
  }
  const chronologyText = `${parsed.narrative}\n${parsed.suggestions.filter((item): item is string => typeof item === "string").join("\n")}`;
  if (violatesCanonChronology(chronologyText, game.view.worldTime?.year ?? 0)) throw new Error("DeepSeek 生成内容违反当前原作时间线，已改用安全叙事");
  const auditIssues = auditNarrative(game, parsed.narrative);
  const novelEngineIssues = auditNovelEngineNarrative(game, parsed.narrative, novelEngine);
  const allAuditIssues = [...auditIssues, ...novelEngineIssues];
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
      if (npc) { npc.memoryOfPlayer.push(normalizedNote.slice(0, 220)); npc.memoryOfPlayer = npc.memoryOfPlayer.slice(-12); }
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
