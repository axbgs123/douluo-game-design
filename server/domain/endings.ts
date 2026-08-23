import type { RunSettlementView } from "../../shared/game.js";
import type { StoredGame } from "./model.js";
import { createSystemEntry } from "./world.js";

const MULTIPLIERS: Record<StoredGame["view"]["difficulty"], number> = {
  爽: 0.5,
  简单: 0.75,
  标准: 1,
  困难: 1.5,
  地狱: 2.25,
};

function goalIsVerified(game: StoredGame): boolean {
  const goal = game.view.lifeGoal;
  const rank = game.view.character?.soulRank ?? 0;
  const metrics = game.world.metrics;
  if (game.view.tasks.some((task) => task.id === "life-goal" && task.status === "完成")) return true;
  if (/魂王/.test(goal) && rank >= 50) return true;
  if (/魂帝/.test(goal) && rank >= 60) return true;
  if (/魂圣/.test(goal) && rank >= 70) return true;
  if (/魂斗罗/.test(goal) && rank >= 80) return true;
  if (/封号|封号斗罗/.test(goal) && rank >= 90) return true;
  if (/成神|神位|百级/.test(goal) && rank >= 99) return true;
  if (/宗门|势力|队伍|班底/.test(goal) && game.view.affiliations.length >= 1 && metrics.relationshipsBuilt >= 8 && metrics.historicalImpact >= 12) return true;
  if (/图鉴|一百种魂兽/.test(goal) && metrics.discoveries >= 50 && metrics.completedHunts >= 8) return true;
  if (/家人|债务|追捕|保护/.test(goal) && metrics.promisesKept >= 4 && metrics.historicalImpact >= 8) return true;
  if (/改变|救下|阻止|改写|时间线/.test(goal) && metrics.historicalImpact >= 30 && game.world.canonCausalFootprints.length >= 3) return true;
  return false;
}

function endingName(game: StoredGame): string {
  if (game.view.character?.condition === "死亡" || game.view.runProgress.ending?.includes("死亡")) return game.view.runProgress.ending ?? "死亡";
  if ((game.view.character?.soulRank ?? 0) >= 99) return "走到百级门前";
  if (goalIsVerified(game)) return `完成目标 · ${game.view.lifeGoal}`;
  if ((game.view.worldTime?.year ?? 0) >= 50) return "时间线结束";
  return "未成之局";
}

export function settleRun(game: StoredGame, reason?: string): RunSettlementView {
  if (game.view.runProgress.settlement) return game.view.runProgress.settlement;
  const character = game.view.character;
  const metrics = game.world.metrics;
  const growth = Math.min(25, Math.round((character?.soulRank ?? 0) / 4) + Math.min(5, character?.soulRings.length ?? 0));
  const verifiedGoal = goalIsVerified(game);
  const goal = verifiedGoal || (character?.soulRank ?? 0) >= 99 ? 25 : Math.min(12, metrics.completedHunts * 3 + metrics.promisesKept * 2);
  const survival = character?.condition === "死亡" ? 4 : character?.condition === "濒死" ? 8 : character?.condition === "重伤" ? 12 : 18;
  const exploration = Math.min(15, metrics.discoveries * 2 + game.world.discoveredLocations.length);
  const impact = Math.min(15, Math.round(metrics.historicalImpact / 3) + Math.min(6, metrics.relationshipsBuilt));
  const baseScore = Math.min(100, growth + goal + survival + exploration + impact);
  const multiplier = MULTIPLIERS[game.view.difficulty];
  const qualified = game.actionIndex >= 8 || character?.condition === "死亡" || verifiedGoal || (character?.soulRank ?? 0) >= 99 || (game.view.worldTime?.year ?? 0) >= 50;
  const legacyPoints = qualified ? Math.max(1, Math.round(baseScore * multiplier)) : 0;
  const ending = endingName(game);
  const highlights = [
    `最高魂力 ${game.view.runProgress.highestSoulRank} 级`,
    `完成猎魂 ${metrics.completedHunts} 次`,
    `发现地点 ${game.world.discoveredLocations.length} 处`,
    `建立关系 ${metrics.relationshipsBuilt} 段`,
  ];
  if (!qualified) highlights.unshift("行动不足 8 次，本次视为中止，不计通关与传承收益");
  const settlement: RunSettlementView = { ending, baseScore, multiplier, legacyPoints, highlights, qualified };
  game.view.status = "ended";
  game.view.runProgress.ending = ending;
  game.view.runProgress.settlement = settlement;
  game.view.suggestions = [];
  game.view.narrative.push(createSystemEntry(`本局结束 · ${ending} · 获得 ${legacyPoints} 传承点`));
  game.view.updatedAt = new Date().toISOString();
  return settlement;
}
