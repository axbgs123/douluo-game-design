import type { StoredGame } from "./model.js";
import { auditNarrative } from "./story-rules.js";

export interface LongSessionQualityReport {
  era: number;
  actions: number;
  blockedActions: number;
  blockedRate: number;
  ledgerCoverage: number;
  narrativeCoverage: number;
  narrativeAuditPassRate: number;
  narrativeAuditIssues: number;
  narrativeIssueCounts: Record<string, number>;
  npcMemoryRecords: number;
  invalidNumericStates: number;
}

function ratio(value: number, total: number): number {
  return total ? Number((value / total).toFixed(4)) : 1;
}

export function evaluateLongSession(game: StoredGame): LongSessionQualityReport {
  const actions = game.actionIndex;
  const ledger = game.world.actionLedger.slice(-actions);
  const blockedActions = ledger.filter((entry) => /无法完成|规则阻止/.test(entry.intent)).length;
  const playerEntries = game.view.narrative.filter((entry) => entry.kind === "player").length;
  const narrativeEntries = game.view.narrative.filter((entry) => entry.kind === "narration").slice(-actions);
  const audits = narrativeEntries.map((entry) => auditNarrative(game, entry.text));
  const narrativeAuditIssues = audits.reduce((sum, issues) => sum + issues.length, 0);
  const narrativeIssueCounts = Object.fromEntries([...new Set(audits.flat())].map((issue) => [issue, audits.flat().filter((item) => item === issue).length]));
  const numericStates = [game.world.healthPoints, game.world.fatiguePoints, game.world.trainingPoints, game.view.character?.coins ?? 0, game.view.inventoryLoad.used, game.view.inventoryLoad.capacity];
  return {
    era: game.view.era ?? 1,
    actions,
    blockedActions,
    blockedRate: ratio(blockedActions, actions),
    ledgerCoverage: ratio(ledger.length, actions),
    narrativeCoverage: ratio(Math.min(playerEntries, narrativeEntries.length), actions),
    narrativeAuditPassRate: ratio(narrativeEntries.length - audits.filter((issues) => issues.length > 0).length, narrativeEntries.length),
    narrativeAuditIssues,
    narrativeIssueCounts,
    npcMemoryRecords: Object.values(game.world.npcs).reduce((sum, npc) => sum + npc.episodicMemory.length, 0),
    invalidNumericStates: numericStates.filter((value) => !Number.isFinite(value) || value < 0).length,
  };
}
