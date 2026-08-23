import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const key = process.env.DEEPSEEK_API_KEY?.trim();
if (!key) {
  console.error("拒绝调用：请只通过当前终端的 DEEPSEEK_API_KEY 环境变量提供一枚未暴露的新密钥。");
  process.exit(2);
}

const baseUrl = (process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/$/, "");
const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
if (baseUrl !== "https://api.deepseek.com" || model !== "deepseek-v4-flash") {
  console.error("拒绝调用：5 元验收只允许官方 https://api.deepseek.com 与 deepseek-v4-flash，避免未知计费。");
  process.exit(2);
}

const dataPrefix = join(tmpdir(), "douluo-model-smoke-");
const dataDirectory = mkdtempSync(dataPrefix);
process.env.DOULUO_DATA_DIR = dataDirectory;
process.env.DEEPSEEK_BASE_URL = baseUrl;
process.env.DEEPSEEK_MODEL = model;
process.env.DOULUO_MODEL_SMOKE_MAX_REQUESTS = "16";
process.env.DOULUO_MODEL_SMOKE_MAX_REQUEST_CHARS = "50000";

const roundActions: Record<1 | 2 | 3 | 4, [string, string]> = {
  1: ["调查附近学院的入学条件", "冥想修炼并记录魂力变化"],
  2: ["调查当地魂导器课程", "学习一级魂导器核心阵法"],
  3: ["调查机甲训练的报名条件", "进行机甲模拟训练"],
  4: ["调查星舰岗位的训练要求", "进行星舰指挥模拟训练"],
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
  estimatedMaximumActualCostCny: number;
  errors: string[];
};

let closeDatabase: (() => void) | undefined;
try {
  const [{ createGame, selectCandidate, finalizeCharacterShaping, awakenCharacter, selectLifeGoal }, { resolveAction, applyActionResult }, { interpretActionWithDeepSeek, validateInterpretedAction, narrateWithDeepSeek, applyNarrativeMemory }, database] = await Promise.all([
    import("../server/domain/generator.js"),
    import("../server/domain/actions.js"),
    import("../server/services/deepseek.js"),
    import("../server/db.js"),
  ]);
  closeDatabase = database.closeDatabase;
  const reports: EraReport[] = [];

  for (const era of [1, 2, 3, 4] as const) {
    const game = createGame({ era, gender: "男", difficulty: "标准", seed: `paid-model-smoke-era-${era}` });
    selectCandidate(game, game.view.candidates[0].id);
    const personality = game.view.shaping!.personalityOptions[0];
    finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
    awakenCharacter(game);
    selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
    let successfulRounds = 0;
    const errors: string[] = [];

    for (const playerInput of roundActions[era]) {
      try {
        const interpreted = await interpretActionWithDeepSeek(game, playerInput);
        if (!interpreted) throw new Error("行动理解未返回有效结果");
        const ruleAction = validateInterpretedAction(game, playerInput, interpreted);
        const resolution = resolveAction(game, ruleAction);
        const generated = await narrateWithDeepSeek(game, playerInput, resolution);
        if (!generated) throw new Error("小说叙事未返回有效结果");
        applyActionResult(game, playerInput, resolution, generated.narrative, generated.suggestions);
        applyNarrativeMemory(game, generated);
        successfulRounds += 1;
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : "未知错误";
        errors.push(message.slice(0, 240));
      }
    }

    const usage = database.getModelUsage(game.view.id);
    reports.push({
      era,
      successfulRounds,
      failedRounds: 2 - successfulRounds,
      ...usage,
      estimatedMaximumActualCostCny: Number(((usage.promptTokens * 1 + usage.completionTokens * 2) / 1_000_000).toFixed(6)),
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
  }), { calls: 0, failures: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, totalLatencyMs: 0, successfulRounds: 0 });
  const actualUpperEstimateCny = Number(((totals.promptTokens * 1 + totals.completionTokens * 2) / 1_000_000).toFixed(6));
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    model,
    policy: {
      eras: 4,
      roundsPerEra: 2,
      maximumRequests: 16,
      maximumRequestChars: 50_000,
      intentMaxTokens: 256,
      narratorMaxTokens: 4_096,
      theoreticalMaximumCostCny: 3.27,
      theoreticalPromptTokenBound: "按每个 UTF-16 code unit 最坏 4 tokens 保守计算",
      pricesCnyPerMillionTokens: { cacheMissInput: 1, output: 2 },
      pricingSource: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing",
      storesPromptsOrNarrative: false,
    },
    totals: { ...totals, actualUpperEstimateCny },
    reports,
  }, null, 2));
  if (totals.successfulRounds !== 8 || totals.calls > 16 || actualUpperEstimateCny > 5) process.exitCode = 1;
} finally {
  closeDatabase?.();
  delete process.env.DOULUO_DATA_DIR;
  delete process.env.DOULUO_MODEL_SMOKE_MAX_REQUESTS;
  delete process.env.DOULUO_MODEL_SMOKE_MAX_REQUEST_CHARS;
  if (dataDirectory.startsWith(dataPrefix)) rmSync(dataDirectory, { recursive: true, force: true });
}
