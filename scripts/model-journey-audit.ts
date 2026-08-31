import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const { readDeepSeekSettings } = await import("../server/services/settings.js");
const settings = readDeepSeekSettings();
if (!settings.apiKey) throw new Error("尚未在游戏模型设置中保存可用密钥。");
if (settings.baseUrl.replace(/\/$/, "") !== "https://api.deepseek.com" || settings.model !== "deepseek-v4-flash") {
  throw new Error("长链审读当前只允许官方 DeepSeek deepseek-v4-flash，避免未知价格和接口行为。 ");
}

const dataPrefix = join(tmpdir(), "douluo-model-journey-");
const dataDirectory = mkdtempSync(dataPrefix);
const dryRun = process.env.DOULUO_MODEL_JOURNEY_DRY_RUN === "1";
const capturePath = resolve(process.env.DOULUO_MODEL_JOURNEY_CAPTURE_PATH || (dryRun ? "source-materials/model-audits/douluo1-journey-dry-run.json" : "source-materials/model-audits/douluo1-journey.json"));
const budgetCny = Math.max(.1, Math.min(2, Number(process.env.DOULUO_MODEL_JOURNEY_BUDGET_CNY ?? 1.5) || 1.5));
process.env.DOULUO_DATA_DIR = dataDirectory;
process.env.DOULUO_MODEL_SMOKE_MAX_REQUESTS = "24";
process.env.DOULUO_MODEL_SMOKE_MAX_NARRATOR_CHARS = "80000";
process.env.DOULUO_MODEL_SMOKE_MAX_NARRATIVE_ATTEMPTS = "2";

type CapturedTurn = {
  index: number;
  playerInput: string;
  intent: string;
  fixedResult: string;
  narrative: string;
  suggestions: string[];
  traceGroupId?: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostCny: number;
};

let closeDatabase: (() => void) | undefined;
try {
  const [generator, actions, deepseek, database] = await Promise.all([
    import("../server/domain/generator.js"),
    import("../server/domain/actions.js"),
    import("../server/services/deepseek.js"),
    import("../server/db.js"),
  ]);
  closeDatabase = database.closeDatabase;
  const createJourneyGame = (attempt: number) => {
    const candidateGame = generator.createGame({ era: 1, gender: "男", difficulty: "标准", seed: `real-model-douluo1-journey-${attempt}` });
    generator.selectCandidate(candidateGame, candidateGame.view.candidates[0].id, "林川");
    const personality = candidateGame.view.shaping!.personalityOptions[0];
    generator.finalizeCharacterShaping(candidateGame, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
    generator.awakenCharacter(candidateGame);
    return candidateGame;
  };
  let game = createJourneyGame(0);
  for (let attempt = 1; attempt < 80 && game.view.character?.innateSoulPower !== 10; attempt += 1) game = createJourneyGame(attempt);
  if (game.view.character?.innateSoulPower !== 10) throw new Error("80次固定候选中没有生成先天满魂力角色。 ");
  generator.selectLifeGoal(game, "先在诺丁城站稳脚跟，取得可靠的第一魂环与能长期兑现的培养路线");
  game.view.locationId = "notting-city";
  game.view.location = "诺丁城";
  game.view.character!.coins = Math.max(100, game.view.character!.coins);
  game.view.character!.soulPowerMax = Math.max(160, game.view.character!.soulPowerMax ?? 0);
  game.view.character!.soulPowerCurrent = game.view.character!.soulPowerMax;
  if (!game.view.relations.some((relation) => relation.category === "亲属")) game.view.relations.push({ id: "journey-guardian", name: "林伯", relation: "监护人", impression: "负责住处、签字与路费，不懂高阶魂师修炼", strength: 70, category: "亲属" });
  database.saveGame(game, "quality.model-journey.created");

  const turns: CapturedTurn[] = [];
  const auditErrors: string[] = [];
  const modelFailures: Array<{ playerInput: string; error: string }> = [];
  const currentCost = () => {
    const usage = database.getModelUsage(game.view.id);
    return Number(((usage.promptTokens * 3 + usage.completionTokens * 9) / 1_000_000).toFixed(6));
  };
  const nextTurnWorstCaseReserveCny = 0.56;
  const commitProgramOnly = (playerInput: string) => {
    const resolution = actions.resolveAction(game, playerInput);
    actions.applyActionResult(game, playerInput, resolution, resolution.fallbackNarrative, resolution.suggestions);
    database.saveGame(game, "quality.model-journey.connector", { playerInput, intent: resolution.intent });
    return resolution;
  };
  const commitModelTurn = async (playerInput: string) => {
    if (!dryRun && currentCost() + nextTurnWorstCaseReserveCny > budgetCny) throw new Error(`费用门禁剩余不足以覆盖下一回合最坏成本，已在${currentCost()}元停止（上限${budgetCny}元）。`);
    const before = database.getModelUsage(game.view.id);
    const resolution = actions.resolveAction(game, playerInput);
    let generated;
    try {
      generated = dryRun ? { narrative: resolution.fallbackNarrative, suggestions: resolution.suggestions, traceGroupId: `dry-run-${turns.length + 1}` } : await deepseek.narrateWithAuditRetries(game, playerInput, resolution);
      if (!generated) throw new Error("模型未返回可接受正文");
    } catch (error) {
      modelFailures.push({ playerInput, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
      actions.applyActionResult(game, playerInput, resolution, resolution.fallbackNarrative, resolution.suggestions);
      database.saveGame(game, "quality.model-journey.model-fallback", { playerInput, intent: resolution.intent });
      return;
    }
    actions.applyActionResult(game, playerInput, resolution, generated.narrative, generated.suggestions);
    deepseek.applyNarrativeMemory(game, generated);
    const narrativeEntry = [...game.view.narrative].reverse().find((entry) => entry.kind === "narration");
    if (narrativeEntry) game.lastCommittedAction = { playerInput, ruleAction: playerInput, resolution, narrativeEntryId: narrativeEntry.id, committedAt: new Date().toISOString(), traceGroupId: generated.traceGroupId };
    database.saveGame(game, "quality.model-journey.accepted", { playerInput, traceGroupId: generated.traceGroupId });
    const after = database.getModelUsage(game.view.id);
    turns.push({
      index: turns.length + 1,
      playerInput,
      intent: resolution.intent,
      fixedResult: resolution.ruleSummary,
      narrative: generated.narrative,
      suggestions: generated.suggestions,
      traceGroupId: generated.traceGroupId,
      promptTokens: after.promptTokens - before.promptTokens,
      completionTokens: after.completionTokens - before.completionTokens,
      estimatedCostCny: Number((((after.promptTokens - before.promptTokens) * 3 + (after.completionTokens - before.completionTokens) * 9) / 1_000_000).toFixed(6)),
    });
  };

  const keyTurns = async () => {
    const awakeningOfficial = game.view.relations.find((relation) => relation.category !== "亲属" && /觉醒|执事|武魂殿/.test(`${relation.relation}${relation.faction ?? ""}`))?.name;
    const guardian = game.view.relations.find((relation) => relation.category === "亲属" || /监护|父|母|祖/.test(`${relation.relation}${relation.impression}`))?.name;
    if (!awakeningOfficial || !guardian) throw new Error("开局没有形成觉醒责任人与监护人。 ");
    await commitModelTurn(`向${awakeningOfficial}问清学院与第一魂环的一般安排`);
    await commitModelTurn(`与${guardian}核对家里现有住处和能承担的路费`);
    await commitModelTurn("安静冥想，确认先天满魂力在体内如何运转");
    await commitModelTurn("申请诺丁初级魂师学院入学");
    await commitModelTurn("准备诺丁初级魂师学院需要的证明");
    await commitModelTurn("接受诺丁初级魂师学院入学安排");
    commitProgramOnly("跟学院老师看过宿舍、教室和工读安排");
    await commitModelTurn("参加第一堂魂师基础课程");
    commitProgramOnly("参加第二堂魂师基础课程");
    const firstPeer = game.view.academyLife?.peers[0]?.name;
    const secondPeer = game.view.academyLife?.peers[1]?.name;
    if (!firstPeer || !secondPeer) throw new Error("学院生活没有形成足够的同辈角色。 ");
    commitProgramOnly(`与${firstPeer}完成一次小组练习`);
    commitProgramOnly("参加第三堂魂师基础课程");
    commitProgramOnly(`与${secondPeer}完成一次小组练习`);
    commitProgramOnly("向学院老师核对奖助成绩要求");
    commitProgramOnly("参加基础课程与实战检查");
    await commitModelTurn("寻找适合当前武魂的导师");
    const mentor = game.view.mentorPursuit?.mentorName;
    if (!mentor) throw new Error("程序没有形成导师候选。 ");
    await commitModelTurn(`请${mentor}评估公开武魂与现有基础`);
    commitProgramOnly(`完成${mentor}第一次试学训练`);
    commitProgramOnly(`完成${mentor}第二次试学训练`);
    await commitModelTurn(`与${mentor}谈清责任后正式拜师`);
    commitProgramOnly(`完成${mentor}下一节正式课程`);
    await commitModelTurn(`请${mentor}评估第一魂环路线`);
    await commitModelTurn("调查适合当前武魂的魂兽，先比较由谁承担首环责任");
    await commitModelTurn(`请求导师${mentor}负责第一魂环`);
    await commitModelTurn("开始调查适合当前武魂的魂兽");
    const target = game.view.hunting?.recommendations[0]?.name;
    if (!target) throw new Error("程序没有形成魂兽推荐。 ");
    commitProgramOnly(`选择${target}作为魂环目标`);
    if (game.view.hunting?.targetYears) game.view.hunting.targetYears = Math.min(game.view.hunting.targetYears, 200);
    commitProgramOnly("购买药物和猎魂绳作为补给");
    commitProgramOnly(`邀请${mentor}作为同行者组队猎魂`);
    commitProgramOnly(`请${mentor}办理猎魂手令`);
    await commitModelTurn("检查补给与同行责任后出发猎魂");
    await commitModelTurn("沿既定路线进入魂兽栖息地");
    for (let attempt = 0; attempt < 12 && game.view.hunting?.stage === "追踪"; attempt += 1) {
      game.world.fatiguePoints = Math.min(game.world.fatiguePoints, 45);
      commitProgramOnly("寻找目标魂兽留下的足迹");
    }
    if (game.view.hunting?.stage !== "战斗") throw new Error(`追踪未进入战斗，当前阶段${game.view.hunting?.stage}。`);
    game.world.flags.combatEnemyHp = 1;
    await commitModelTurn("与导师配合发动武魂攻击，结束战斗");
    if (game.view.hunting?.stage !== "吸收") throw new Error(`战斗未进入吸收，当前阶段${game.view.hunting?.stage}。`);
    await commitModelTurn("让导师警戒，开始吸收第一魂环");
    if (game.view.status !== "ended") await commitModelTurn("完成本次猎魂，处理伤势与疲劳，再和导师核对得失");
  };

  try {
    await keyTurns();
  } catch (error) {
    auditErrors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }

  const usage = database.getModelUsage(game.view.id);
  const diagnostics = database.getNarrativeDiagnostics(game.view.id);
  mkdirSync(dirname(capturePath), { recursive: true });
  writeFileSync(capturePath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    provider: "DeepSeek",
    model: settings.model,
    dryRun,
    storesApiKey: false,
    policy: { budgetCny, inputPriceCnyPerMillion: 3, outputPriceCnyPerMillion: 9, rawTextDirectoryIgnoredByGit: true },
    initialNarrative: game.view.narrative.filter((entry) => entry.kind === "narration").slice(0, 1).map((entry) => entry.text),
    turns,
    modelFailures,
    auditErrors,
    totals: { ...usage, estimatedCostCny: currentCost(), acceptedTurns: turns.length, auditFailures: usage.narrativeAuditFailures, traceGroups: diagnostics.traces.length },
    finalState: { status: game.view.status, location: game.view.location, soulRank: game.view.character?.soulRank, rings: game.view.character?.soulRings, hunting: game.view.hunting, affiliations: game.view.affiliations.map((item) => ({ name: item.name, role: item.role })) },
  }, null, 2), { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ capturePath, acceptedTurns: turns.length, modelFailureCount: modelFailures.length, auditErrors, estimatedCostCny: currentCost(), usage, finalState: { status: game.view.status, location: game.view.location, soulRank: game.view.character?.soulRank, ringCount: game.view.character?.soulRings.length, huntingStage: game.view.hunting?.stage } }, null, 2));
  if (auditErrors.length || !turns.length) process.exitCode = 1;
} finally {
  closeDatabase?.();
  delete process.env.DOULUO_DATA_DIR;
  delete process.env.DOULUO_MODEL_SMOKE_MAX_REQUESTS;
  delete process.env.DOULUO_MODEL_SMOKE_MAX_NARRATOR_CHARS;
  delete process.env.DOULUO_MODEL_SMOKE_MAX_NARRATIVE_ATTEMPTS;
  if (dataDirectory.startsWith(dataPrefix)) rmSync(dataDirectory, { recursive: true, force: true });
}
