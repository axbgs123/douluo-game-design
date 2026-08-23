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

function endingName(game: StoredGame, reason?: string): string {
  if (game.view.character?.condition === "死亡" || game.view.runProgress.ending?.includes("死亡")) return game.view.runProgress.ending ?? "死亡";
  if ((game.view.character?.soulRank ?? 0) >= 99) return "走到百级门前";
  if (/成神/.test(reason ?? "")) return "追寻神位";
  if (/目标|完成/.test(reason ?? "")) return `完成目标 · ${game.view.lifeGoal}`;
  if (/时间线|时代/.test(reason ?? "")) return "时间线结束";
  return reason?.trim() || "主动结束这一生";
}

export function settleRun(game: StoredGame, reason?: string): RunSettlementView {
  if (game.view.runProgress.settlement) return game.view.runProgress.settlement;
  const character = game.view.character;
  const metrics = game.world.metrics;
  const growth = Math.min(25, Math.round((character?.soulRank ?? 0) / 4) + Math.min(5, character?.soulRings.length ?? 0));
  const goal = /完成目标/.test(reason ?? "") || (character?.soulRank ?? 0) >= 99 ? 25 : Math.min(20, 5 + metrics.completedHunts * 4 + metrics.promisesKept * 3);
  const survival = character?.condition === "死亡" ? 4 : character?.condition === "濒死" ? 8 : character?.condition === "重伤" ? 12 : 18;
  const exploration = Math.min(15, metrics.discoveries * 2 + game.world.discoveredLocations.length);
  const impact = Math.min(15, Math.round(metrics.historicalImpact / 3) + Math.min(6, metrics.relationshipsBuilt));
  const baseScore = Math.min(100, growth + goal + survival + exploration + impact);
  const multiplier = MULTIPLIERS[game.view.difficulty];
  const legacyPoints = Math.max(1, Math.round(baseScore * multiplier));
  const ending = endingName(game, reason);
  const highlights = [
    `最高魂力 ${game.view.runProgress.highestSoulRank} 级`,
    `完成猎魂 ${metrics.completedHunts} 次`,
    `发现地点 ${game.world.discoveredLocations.length} 处`,
    `建立关系 ${metrics.relationshipsBuilt} 段`,
  ];
  const settlement: RunSettlementView = { ending, baseScore, multiplier, legacyPoints, highlights };
  game.view.status = "ended";
  game.view.runProgress.ending = ending;
  game.view.runProgress.settlement = settlement;
  game.view.suggestions = [];
  game.view.narrative.push(createSystemEntry(`本局结束 · ${ending} · 获得 ${legacyPoints} 传承点`));
  game.view.updatedAt = new Date().toISOString();
  return settlement;
}
