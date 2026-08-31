import { FACTIONS, characterById, locationById } from "../data/world.js";
import type { NpcPlanState, StoredGame, WorldNpcState } from "./model.js";

const DAYS_PER_YEAR = 360;

interface NpcBehaviorProfile {
  ordinaryObligation: string;
  speechStyle: string;
  attentionFocus: string;
  refusalBoundary: string;
}

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

function behaviorProfileFor(npc: WorldNpcState): NpcBehaviorProfile {
  const definition = characterById(npc.id);
  const traits = definition?.personality ?? [];
  const text = `${traits.join("、")}${npc.currentGoal}${responsibilityFor(npc)}`;
  const faction = npc.factionIds.map((id) => FACTIONS.find((item) => item.id === id)).find(Boolean);
  const young = npc.age !== undefined && npc.age < 18;
  const ordinaryObligation = young
    ? /学院|学员|训练|学习/.test(text) ? "完成当日课程、基础训练、用饭休息与被分配的生活事务" : "完成家庭照料、基础学习、用饭休息与当前年龄能承担的小事"
    : /治疗|药|医/.test(text) ? "核对伤员、药材、治疗顺序和需要继续观察的症状"
    : /锻造|铁匠|制作|研究/.test(text) ? "检查材料、工具、在制品、失败记录与已经答应的交付"
    : /教学|教师|学员|学院/.test(text) ? "备课、查看学员训练记录、处理安全问题并完成当日学院事务"
    : /军|舰队|军团|战神/.test(text) ? "完成值勤、状态报告、装备检查、人员交接与军令要求的保密"
    : /宗|门|家族|帝国|势力|组织/.test(text) ? "处理成员生计、资源账目、日常训练、内部请求与对外来往"
    : "完成饮食休息、伤势和装备检查，并处理亲友、住处与已经答应的事";
  const speechStyle = /寡言|安静|清冷|冷静|谨慎|克制|理性/.test(text)
    ? "先确认事实和责任再开口，句子不多，对没有证据的判断保留余地"
    : /豪爽|直接|冲动|强硬|好战/.test(text)
      ? "说话直接、先讲要做什么，情绪上来时会顶一句，但具体责任不能被口气掩盖"
      : /骄傲|自信|傲慢|强势|好胜/.test(text)
        ? "先维护身份、面子和自己的判断，不轻易示弱，对能力和条件会说得具体"
        : /温和|善良|仁慈|重情|负责|护短/.test(text)
          ? "先问人有没有受伤、难处在哪，语气可以缓和，但涉及家人、学生或职责时会明确划线"
          : `使用符合“${traits.slice(0, 2).join("、") || "当前身份"}”的日常语气，先处理眼前事，不替作者解释全部设定`;
  const attentionFocus = /治疗|药|医/.test(text) ? "先看伤势、呼吸、中毒、疲劳、药材与谁需要优先救治"
    : /锻造|铁匠|制作|研究/.test(text) ? "先看材料、结构、磨损、工艺记录和这东西是怎么做出来的"
    : /教学|教师|学员|学院/.test(text) ? "先看学员的基础动作、训练记录、安全风险、纪律与是否真正完成要求"
    : /军|舰队|军团|战神/.test(text) ? "先看命令来源、人员位置、装备状态、撤离路线、敌我识别与通信"
    : /宗|门|家族|帝国|势力|组织/.test(text) ? "先看对方来历、谁有权作主、需要动用什么资源、谁受益与谁承担后果"
    : "先看眼前人的动作、位置、伤势、已说过的话和实际能够证明的事";
  const refusalBoundary = young
    ? "不会凭一句话调动成年人、机构或稀缺资源，也不会替同龄人作生死与关系决定"
    : faction ? `不会越过自身权限无条件赠送${faction.name}的稀缺资源、泄露机密或代替他人承诺` : "不会因陌生人天赋高就立即信任、送出家底或承担超出自身能力的责任";
  return { ordinaryObligation, speechStyle, attentionFocus, refusalBoundary };
}

function attachBehaviorProfile(npc: WorldNpcState, plan: NpcPlanState): void {
  const profile = behaviorProfileFor(npc);
  plan.ordinaryObligation ??= profile.ordinaryObligation;
  plan.speechStyle ??= profile.speechStyle;
  plan.attentionFocus ??= profile.attentionFocus;
  plan.refusalBoundary ??= profile.refusalBoundary;
}

function nextActionFor(desire: string, responsibility: string, phase: number, behavior: NpcBehaviorProfile): string {
  const text = `${desire}${responsibility}`;
  if (phase === 0) return `先${behavior.ordinaryObligation}，再核对“${desire}”今天有哪一步真的能做`;
  const actionPhase = phase - 1;
  if (/保护|守护|安全|照看/.test(text)) return ["检查受保护对象、住处或辖区的风险，并补上最明显的保护缺口", "确认受保护对象近期的选择和行程，避免保护变成替对方作主", "调整护卫、退路或警戒安排，并核对是否出现新的目击证据"][actionPhase];
  if (/寻找|调查|核实|找回|秘密|消息/.test(text)) return ["沿已有来源调查一条最可靠线索，不越过当前信息权限", "交叉核对上一条线索的来源、时间和可能误差", "根据已确认线索决定继续追踪、暂缓还是向有权限者求助"][actionPhase];
  if (/培养|教学|学院|训练|修炼|证明|提升/.test(text)) return ["完成一次训练、考核、指导或能力验证并留下结果记录", "复盘上一轮训练的不足，调整方法、负荷或资源使用", "用一次正式测试检验调整是否有效，并决定下一阶段门槛"][actionPhase];
  if (/维持|壮大|经营|资源|宗门|家族|帝国|军/.test(text)) return ["处理一项组织职责，核对资源、成员意见和可能的外部压力", "召集职责相关者确认分歧、责任和资源优先级", "执行已经形成依据的组织决定，并记录收益、损失和异议"][actionPhase];
  if (/复仇|清除|对抗|击败|敌/.test(text)) return ["先确认目标行踪、实力、保护者和行动代价，再决定接触或冲突方式", "寻找能够降低正面冲突成本的盟友、地形或信息差", "根据现有证据决定试探、谈判、伏击、暂缓或撤退"][actionPhase];
  return [
    `列出“${desire}”当前缺少的最小条件，确认哪一项在自身权限内`,
    `完成“${desire}”的一项小而具体的行动，并保留成败结果`,
    `根据已发生结果决定继续、换方法、求助或暂停，同时履行当前责任`,
  ][actionPhase];
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
  const behavior = behaviorProfileFor(npc);
  const plan: NpcPlanState = {
    id: `npc-plan-${npc.id}-${now}`,
    desire,
    responsibility: responsibilityFor(npc),
    informationBoundary: informationBoundaryFor(npc),
    authority: authorityFor(npc),
    resources: resourcesFor(npc),
    nextAction: nextActionFor(desire, responsibilityFor(npc), 0, behavior),
    targetLocationId: targetLocationFor(game, npc, desire),
    deadlineOrdinal: now + Math.max(15, 50 - (definition?.importance ?? 1) * 5),
    status: "计划中",
    progress: 0,
    createdYear: year,
    createdDay: day,
    playerImpact: impact ? `玩家此前“${impact.description}”改变了可用条件` : undefined,
  };
  attachBehaviorProfile(npc, plan);
  return plan;
}

export function ensureNpcPlans(game: StoredGame): void {
  const now = ordinal(game.view.worldTime?.year ?? 0, game.view.worldTime?.day ?? 1);
  for (const npc of Object.values(game.world.npcs)) {
    if (!npc.alive || npc.currentGoal === "尚未出生" || npc.currentGoal === "不在当前时代活动") continue;
    if (!npc.activePlan || npc.activePlan.status === "完成" || npc.activePlan.deadlineOrdinal < now || npc.activePlan.desire !== npc.currentGoal) npc.activePlan = compileNpcPlan(game, npc, now);
    else attachBehaviorProfile(npc, npc.activePlan);
  }
}

export function executeNpcPlanStep(game: StoredGame, npc: WorldNpcState, currentOrdinal: number): { action: string; reason: string; outcome: string; moved: boolean } {
  const plan = npc.activePlan ?? compileNpcPlan(game, npc, currentOrdinal);
  npc.activePlan = plan;
  const behavior = behaviorProfileFor(npc);
  attachBehaviorProfile(npc, plan);
  plan.nextAction = nextActionFor(plan.desire, plan.responsibility, Math.min(3, Math.floor(plan.progress / 25)), behavior);
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
