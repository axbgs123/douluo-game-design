import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const key = process.env.DEEPSEEK_API_KEY?.trim();
if (!key) {
  console.error("拒绝调用：请只通过当前终端的 DEEPSEEK_API_KEY 环境变量提供一枚未暴露的新密钥。");
  process.exit(2);
}

const baseUrl = (process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/$/, "");
const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
const provider = baseUrl === "https://api.deepseek.com" && model === "deepseek-v4-flash"
  ? { name: "DeepSeek", inputPriceCny: 3, outputPriceCny: 9, budgetCny: 5, pricingSource: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing" }
  : baseUrl === "https://api.xiaomimimo.com/v1" && model === "mimo-v2.5-pro"
    ? { name: "Xiaomi MiMo", inputPriceCny: 3, outputPriceCny: 6, budgetCny: 1, pricingSource: "https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go" }
    : undefined;
if (!provider) {
  console.error("拒绝调用：真实模型冒烟只允许已核对官方价格的 DeepSeek V4 Flash 或 Xiaomi MiMo V2.5 Pro。");
  process.exit(2);
}

const dataPrefix = join(tmpdir(), "douluo-model-smoke-");
const dataDirectory = mkdtempSync(dataPrefix);
const selectedEras = (process.env.DOULUO_MODEL_SMOKE_ERAS?.split(",").map((value) => Number(value.trim())).filter((value): value is 1 | 2 | 3 | 4 => [1, 2, 3, 4].includes(value)) ?? [1, 2, 3, 4]) as Array<1 | 2 | 3 | 4>;
const roundsPerEra = Math.max(1, Math.min(6, Number(process.env.DOULUO_MODEL_SMOKE_ROUNDS ?? 1) || 1));
const narrativeAttempts = Math.max(1, Math.min(2, Number(process.env.DOULUO_MODEL_SMOKE_NARRATIVE_ATTEMPTS ?? 1) || 1));
const capturePath = process.env.DOULUO_MODEL_SMOKE_CAPTURE_PATH?.trim();
const expectedRounds = selectedEras.length * roundsPerEra;
const maximumRequests = expectedRounds * (1 + narrativeAttempts);
const costBudgetCny = Math.min(provider.budgetCny, Number(process.env.DOULUO_MODEL_SMOKE_COST_BUDGET_CNY ?? provider.budgetCny) || provider.budgetCny);
const theoreticalMaximumCostCny = Number(((expectedRounds * 8_000 * 4 * provider.inputPriceCny + expectedRounds * narrativeAttempts * 48_000 * 4 * provider.inputPriceCny + expectedRounds * (256 + narrativeAttempts * 4_096) * provider.outputPriceCny) / 1_000_000).toFixed(6));
process.env.DOULUO_DATA_DIR = dataDirectory;
process.env.DEEPSEEK_BASE_URL = baseUrl;
process.env.DEEPSEEK_MODEL = model;
process.env.DOULUO_MODEL_SMOKE_MAX_REQUESTS = String(maximumRequests);
process.env.DOULUO_MODEL_SMOKE_MAX_INTENT_CHARS = "8000";
process.env.DOULUO_MODEL_SMOKE_MAX_NARRATOR_CHARS = "48000";
process.env.DOULUO_MODEL_SMOKE_MAX_NARRATIVE_ATTEMPTS = String(narrativeAttempts);

const roundActions: Record<1 | 2 | 3 | 4, string[]> = {
  1: ["调查附近学院的入学条件", "冥想修炼并记录魂力变化", "问清学院的食宿、路费和监护要求", "练习武魂的基础收放", "调查第一魂环需要的费用、成年同行者和撤退条件", "休息并整理今天已经确认的事"],
  2: ["调查当地魂导器课程", "学习一级魂导器核心阵法", "问清课程费用、材料损耗和学习门槛", "冥想修炼并检查疲劳", "调查当地可以合法承接的学徒工作", "休息并整理今天已经确认的事"],
  3: ["调查机甲训练的报名条件", "进行机甲模拟训练", "问清模拟训练的费用、年龄与身体要求", "完成一次基础体能训练", "调查当地魂灵服务的实际费用和适配条件", "休息并整理今天已经确认的事"],
  4: ["调查星舰岗位的训练要求", "进行星舰指挥模拟训练", "问清模拟训练的年龄、课程和权限要求", "完成一次基础体能训练", "调查当地可接触的星际基础课程", "休息并整理今天已经确认的事"],
};

type EraReport = {
  era: number;
  successfulRounds: number;
  failedRounds: number;
  calls: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalLatencyMs: number;
  narratorContextRetrievals: number;
  contextRetrievalReady: boolean;
  contextRetrievalStatus: string;
  estimatedMaximumActualCostCny: number;
  errors: string[];
};

let closeDatabase: (() => void) | undefined;
try {
  const [{ createGame, selectCandidate, finalizeCharacterShaping, awakenCharacter, selectLifeGoal }, { resolveAction, applyActionResult }, { interpretActionWithDeepSeek, validateInterpretedAction, narrateWithAuditRetries, applyNarrativeMemory }, database] = await Promise.all([
    import("../server/domain/generator.js"),
    import("../server/domain/actions.js"),
    import("../server/services/deepseek.js"),
    import("../server/db.js"),
  ]);
  closeDatabase = database.closeDatabase;
  const reports: EraReport[] = [];
  const capturedTurns: unknown[] = [];

  for (const era of selectedEras) {
    const game = createGame({ era, gender: "男", difficulty: "标准", seed: `paid-model-smoke-era-${era}` });
    selectCandidate(game, game.view.candidates[0].id);
    const personality = game.view.shaping!.personalityOptions[0];
    finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
    awakenCharacter(game);
    selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
    database.saveGame(game, "quality.model-smoke.created", { era });
    let successfulRounds = 0;
    const errors: string[] = [];

    for (const [roundIndex, playerInput] of roundActions[era].slice(0, roundsPerEra).entries()) {
      let traceGroupId: string | undefined;
      try {
        const interpreted = await interpretActionWithDeepSeek(game, playerInput);
        if (!interpreted) throw new Error("行动理解未返回有效结果");
        const ruleAction = validateInterpretedAction(game, playerInput, interpreted);
        const resolution = resolveAction(game, ruleAction);
        const generated = await narrateWithAuditRetries(game, playerInput, resolution);
        traceGroupId = generated?.traceGroupId;
        if (!generated) throw new Error("小说叙事未返回有效结果");
        applyActionResult(game, playerInput, resolution, generated.narrative, generated.suggestions);
        applyNarrativeMemory(game, generated);
        const narrativeEntry = [...game.view.narrative].reverse().find((entry) => entry.kind === "narration");
        if (narrativeEntry) game.lastCommittedAction = { playerInput, ruleAction, resolution, narrativeEntryId: narrativeEntry.id, committedAt: new Date().toISOString(), traceGroupId: generated.traceGroupId };
        database.saveGame(game, "quality.model-smoke.accepted", { era, round: roundIndex + 1, traceGroupId: generated.traceGroupId });
        successfulRounds += 1;
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : "未知错误";
        errors.push(`第${roundIndex + 1}轮 ${message}`.slice(0, 280));
      } finally {
        const latestTrace = traceGroupId ?? database.getNarrativeDiagnostics(game.view.id).traces[0]?.id;
        const artifact = latestTrace ? database.getTurnTraceComparisonArtifact(game.view.id, latestTrace) : undefined;
        if (artifact && !capturedTurns.some((item) => (item as { id?: string }).id === artifact.id)) capturedTurns.push({ era, round: roundIndex + 1, ...artifact });
      }
    }

    const usage = database.getModelUsage(game.view.id);
    reports.push({
      era,
      successfulRounds,
      failedRounds: roundsPerEra - successfulRounds,
      ...usage,
      estimatedMaximumActualCostCny: Number(((usage.promptTokens * provider.inputPriceCny + usage.completionTokens * provider.outputPriceCny) / 1_000_000).toFixed(6)),
      errors,
    });
  }

  const totals = reports.reduce((sum, report) => ({
    calls: sum.calls + report.calls,
    failures: sum.failures + report.failures,
    promptTokens: sum.promptTokens + report.promptTokens,
    completionTokens: sum.completionTokens + report.completionTokens,
    totalTokens: sum.totalTokens + report.totalTokens,
    totalLatencyMs: sum.totalLatencyMs + report.totalLatencyMs,
    successfulRounds: sum.successfulRounds + report.successfulRounds,
    contextReadyEras: sum.contextReadyEras + (report.contextRetrievalReady ? 1 : 0),
  }), { calls: 0, failures: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, totalLatencyMs: 0, successfulRounds: 0, contextReadyEras: 0 });
  const actualUpperEstimateCny = Number(((totals.promptTokens * provider.inputPriceCny + totals.completionTokens * provider.outputPriceCny) / 1_000_000).toFixed(6));
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    provider: provider.name,
    model,
    policy: {
      eras: selectedEras,
      roundsPerEra,
      narrativeAttempts,
      maximumRequests,
      maximumIntentRequestChars: 8_000,
      maximumNarratorRequestChars: 48_000,
      intentMaxTokens: 256,
      narratorMaxTokens: 4_096,
      theoreticalMaximumCostCny,
      costBudgetCny,
      theoreticalPromptTokenBound: "按每个 UTF-16 code unit 最坏 4 tokens 保守计算",
      pricesCnyPerMillionTokens: { cacheMissInput: provider.inputPriceCny, output: provider.outputPriceCny },
      pricingSource: provider.pricingSource,
      storesPromptsOrNarrative: false,
    },
    totals: { ...totals, actualUpperEstimateCny },
    reports,
  }, null, 2));
  if (capturePath) {
    mkdirSync(join(capturePath, ".."), { recursive: true });
    writeFileSync(capturePath, JSON.stringify({ generatedAt: new Date().toISOString(), provider: provider.name, model, storesApiKey: false, turns: capturedTurns }, null, 2), { encoding: "utf8", mode: 0o600 });
  }
  if (totals.successfulRounds !== expectedRounds || totals.calls > maximumRequests || actualUpperEstimateCny > costBudgetCny || totals.contextReadyEras !== selectedEras.length) process.exitCode = 1;
} finally {
  closeDatabase?.();
  delete process.env.DOULUO_DATA_DIR;
  delete process.env.DOULUO_MODEL_SMOKE_MAX_REQUESTS;
  delete process.env.DOULUO_MODEL_SMOKE_MAX_INTENT_CHARS;
  delete process.env.DOULUO_MODEL_SMOKE_MAX_NARRATOR_CHARS;
  delete process.env.DOULUO_MODEL_SMOKE_MAX_NARRATIVE_ATTEMPTS;
  if (dataDirectory.startsWith(dataPrefix)) rmSync(dataDirectory, { recursive: true, force: true });
}
