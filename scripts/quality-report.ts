import type { GameEra } from "../shared/game.js";
import { applyActionResult, resolveAction } from "../server/domain/actions.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "../server/domain/generator.js";
import { evaluateLongSession } from "../server/domain/quality.js";

const actions = ["观察周围环境", "询问家人当地消息", "冥想修炼", "休息恢复", "打工赚钱", "调查当前时代的学院", "等待一天", "查看人生计划", "研究武魂特性", "整理下一步计划"];
const reports = [];
for (const era of [1, 2, 3, 4] as GameEra[]) {
  const game = createGame({ era, gender: "男", difficulty: "标准", seed: `quality-report-era-${era}` });
  selectCandidate(game, game.view.candidates[0].id);
  const personality = game.view.shaping!.personalityOptions[0];
  finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  awakenCharacter(game);
  selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  const npcId = era === 1 ? "tang-san" : era === 2 ? "huo-yuhao" : era === 3 ? "tang-wulin" : "lan-xuanyu";
  game.world.npcs[npcId].locationId = game.view.locationId!;
  game.world.npcs[npcId].knownToPlayer = true;
  for (let index = 0; index < 30; index += 1) {
    if (index % actions.length === 1) game.world.npcs[npcId].locationId = game.view.locationId!;
    const action = index % actions.length === 1 ? `询问${game.world.npcs[npcId].name}当地消息` : actions[index % actions.length];
    const resolution = resolveAction(game, action);
    applyActionResult(game, action, resolution, resolution.fallbackNarrative, resolution.suggestions, `${era}1000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  }
  reports.push(evaluateLongSession(game));
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));
