import { FACTIONS, characterById, locationById } from "../data/world.js";
import type { NpcPlanState, StoredGame, WorldNpcState } from "./model.js";

const DAYS_PER_YEAR = 360;

function ordinal(year: number, day: number): number { return year * DAYS_PER_YEAR + day; }

function responsibilityFor(npc: WorldNpcState): string {
  const faction = npc.factionIds.map((id) => FACTIONS.find((item) => item.id === id)).find(Boolean);
  if (!faction) return "维持自身生存、修炼、亲友关系和当前承诺";
  if (/学院/.test(faction!.kind)) return `履行${faction!.name}的学习、教学、考核或保护学员责任`;
  if (/帝国|军|舰队/.test(`${faction!.kind}${faction!.name}`)) return `履行${faction!.name}的军政命令、保密与辖区责任`;
  if (/宗|门|家族/.test(`${faction!.kind}${faction!.name}`)) return `维护${faction!.name}的传承、资源、名誉和成员安全`;
  return `维护${faction!.name}的制度职责、资源和对外立场`;
}

function authorityFor(npc: WorldNpcState): string {
  const definition = characterById(npc.id);
  const importance = definition?.importance ?? 1;
  if ((npc.soulRank ?? 0) >= 90 || importance >= 5) return "可以影响高层决策、调动高级战力或否决重大风险，但仍受阵营目标与承诺约束";
  if ((npc.soulRank ?? 0) >= 60 || importance >= 4) return "可以主持重要行动、调动一支队伍或向组织高层提交正式意见";
  if ((npc.soulRank ?? 0) >= 30 || importance >= 3) return "可以执行专业任务、带领小队、推荐人才或使用职责内资源";
  return "只能处理个人行动、同辈关系与被明确授权的事务";
}

function resourcesFor(npc: WorldNpcState): string[] {
  const resources = [`当前实力：${npc.powerTier}`];
  if (npc.factionIds.length) resources.push(`组织渠道：${npc.factionIds.map((id) => FACTIONS.find((item) => item.id === id)?.name ?? id).join("、")}`);
  const location = locationById(npc.locationId); if (location) resources.push(`当前位置资源：${location.name}及其公开连接路线`);
  if (npc.memoryOfPlayer.length) resources.push(`与玩家有关的记忆${npc.memoryOfPlayer.length}条`);
  return resources.slice(0, 5);
}

function informationBoundaryFor(npc: WorldNpcState): string[] {
  const witnessed = npc.episodicMemory.filter((item) => item.witnessed).slice(-3).map((item) => `亲历：${item.text}`);
  const reported = npc.episodicMemory.filter((item) => !item.witnessed).slice(-2).map((item) => `转述：${item.text}`);
  return [`知道自己的身份、武魂、当前职责和${locationById(npc.locationId)?.name ?? "当前位置"}的日常信息`, ...witnessed, ...reported].slice(0, 6);
}

function nextActionFor(desire: string, responsibility: string, phase: number): string {
  const text = `${desire}${responsibility}`;
  if (/保护|守护|安全|照看/.test(text)) return ["检查受保护对象、住处或辖区的风险，并补上最明显的保护缺口", "确认受保护对象近期的选择和行程，避免保护变成替对方作主", "调整护卫、退路或警戒安排，并核对是否出现新的目击证据"][phase];
  if (/寻找|调查|核实|找回|秘密|消息/.test(text)) return ["沿已有来源调查一条最可靠线索，不越过当前信息权限", "交叉核对上一条线索的来源、时间和可能误差", "根据已确认线索决定继续追踪、暂缓还是向有权限者求助"][phase];
  if (/培养|教学|学院|训练|修炼|证明|提升/.test(text)) return ["完成一次训练、考核、指导或能力验证并留下结果记录", "复盘上一轮训练的不足，调整方法、负荷或资源使用", "用一次正式测试检验调整是否有效，并决定下一阶段门槛"][phase];
  if (/维持|壮大|经营|资源|宗门|家族|帝国|军/.test(text)) return ["处理一项组织职责，核对资源、成员意见和可能的外部压力", "召集职责相关者确认分歧、责任和资源优先级", "执行已经形成依据的组织决定，并记录收益、损失和异议"][phase];
  if (/复仇|清除|对抗|击败|敌/.test(text)) return ["先确认目标行踪、实力、保护者和行动代价，再决定接触或冲突方式", "寻找能够降低正面冲突成本的盟友、地形或信息差", "根据现有证据决定试探、谈判、伏击、暂缓或撤退"][phase];
  return `推进“${desire}”的下一项可执行条件，同时履行当前责任`;
}

function targetLocationFor(game: StoredGame, npc: WorldNpcState, desire: string): string {
  const named = Object.values(game.world.npcs).find((character) => character.id !== npc.id && character.alive && desire.includes(character.name));
  if (named) return named.locationId;
  const faction = npc.factionIds.map((id) => FACTIONS.find((item) => item.id === id)).find(Boolean);
  if (faction && /维持|壮大|组织|宗门|学院|军/.test(`${desire}${responsibilityFor(npc)}`)) return faction.headquartersId;
  return npc.locationId;
}

export function compileNpcPlan(game: StoredGame, npc: WorldNpcState, currentOrdinal?: number): NpcPlanState {
  const year = game.view.worldTime?.year ?? npc.lastSimulatedYear ?? 0;
  const day = game.view.worldTime?.day ?? 1;
  const now = currentOrdinal ?? ordinal(year, day);
  const definition = characterById(npc.id);
  const desire = npc.currentGoal || definition?.goals[0] || "维持当前生活并处理眼前责任";
  const impact = game.world.canonCausalFootprints.filter((item) => item.affectedNpcIds.includes(npc.id)).at(-1);
  return {
    id: `npc-plan-${npc.id}-${now}`,
    desire,
    responsibility: responsibilityFor(npc),
    informationBoundary: informationBoundaryFor(npc),
    authority: authorityFor(npc),
    resources: resourcesFor(npc),
    nextAction: nextActionFor(desire, responsibilityFor(npc), npc.autonomyLog.length % 3),
    targetLocationId: targetLocationFor(game, npc, desire),
    deadlineOrdinal: now + Math.max(15, 50 - (definition?.importance ?? 1) * 5),
    status: "计划中",
    progress: 0,
    createdYear: year,
    createdDay: day,
    playerImpact: impact ? `玩家此前“${impact.description}”改变了可用条件` : undefined,
  };
}

export function ensureNpcPlans(game: StoredGame): void {
  const now = ordinal(game.view.worldTime?.year ?? 0, game.view.worldTime?.day ?? 1);
  for (const npc of Object.values(game.world.npcs)) {
    if (!npc.alive || npc.currentGoal === "尚未出生" || npc.currentGoal === "不在当前时代活动") continue;
    if (!npc.activePlan || npc.activePlan.status === "完成" || npc.activePlan.deadlineOrdinal < now) npc.activePlan = compileNpcPlan(game, npc, now);
  }
}

export function executeNpcPlanStep(game: StoredGame, npc: WorldNpcState, currentOrdinal: number): { action: string; reason: string; outcome: string; moved: boolean } {
  const plan = npc.activePlan ?? compileNpcPlan(game, npc, currentOrdinal);
  npc.activePlan = plan;
  plan.status = "执行中";
  let moved = false;
  let outcome: string;
  if (plan.targetLocationId !== npc.locationId) {
    const current = locationById(npc.locationId);
    const direct = current?.connections.find((item) => item.id === plan.targetLocationId);
    if (direct) {
      npc.locationId = plan.targetLocationId;
      moved = true;
      plan.progress = Math.min(100, plan.progress + 30);
      outcome = `沿公开路线抵达${locationById(plan.targetLocationId)?.name ?? plan.targetLocationId}，开始处理目标`;
    } else {
      plan.status = "受阻";
      plan.progress = Math.min(95, plan.progress + 8);
      outcome = `目标不在直达路线内，先寻找路引、交通、许可或可靠带路人`;
    }
  } else {
    plan.progress = Math.min(100, plan.progress + 25);
    outcome = `${plan.nextAction}；本阶段留下了职责内记录`;
  }
  if (plan.progress >= 100) plan.status = "完成";
  plan.lastOutcome = outcome;
  plan.deadlineOrdinal = currentOrdinal + 30;
  const reason = `${plan.desire}；责任：${plan.responsibility}${plan.playerImpact ? `；${plan.playerImpact}` : ""}`;
  npc.autonomyLog.push({ year: game.view.worldTime?.year ?? 0, day: game.view.worldTime?.day ?? 1, action: moved ? `前往${locationById(npc.locationId)?.name ?? npc.locationId}` : plan.nextAction, reason });
  npc.autonomyLog = npc.autonomyLog.slice(-30);
  return { action: plan.nextAction, reason, outcome, moved };
}
