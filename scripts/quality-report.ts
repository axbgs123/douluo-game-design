import type { GameEra } from "../shared/game.js";
import { applyActionResult, resolveAction } from "../server/domain/actions.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "../server/domain/generator.js";
import { evaluateLongSession } from "../server/domain/quality.js";

const reports = [];
for (const era of [1, 2, 3, 4] as GameEra[]) {
  const game = createGame({ era, gender: "男", difficulty: "标准", seed: `quality-report-era-${era}` });
  selectCandidate(game, game.view.candidates[0].id);
  const personality = game.view.shaping!.personalityOptions[0];
  finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  awakenCharacter(game);
  selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  const familiar = game.view.relations.find((relation) => relation.category !== "势力")?.name ?? "附近居民";
  const actions = [`和${familiar}一起吃饭`, `询问${familiar}今天在忙什么`, "冥想修炼", "休息恢复", "打工赚钱", "调查当前住处的日常开销", "等待一天", "学习读写和大陆常识", "整理床铺和随身物品", "查看人生计划"];
  for (let index = 0; index < 30; index += 1) {
    const action = actions[index % actions.length];
    const resolution = resolveAction(game, action);
    applyActionResult(game, action, resolution, resolution.fallbackNarrative, resolution.suggestions, `${era}1000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  }
  reports.push({
    ...evaluateLongSession(game),
    localPersonStates: game.view.relations.filter((relation) => Boolean(relation.localState)).length,
    localPersonRecentOutcomes: game.view.relations.filter((relation) => Boolean(relation.localState?.lastOutcome)).length,
  });
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), scope: "程序路由、状态、兜底正文与序列化；不调用真实小说模型，不能作为AI文笔验收", reports }, null, 2));
