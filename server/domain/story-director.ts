import type { ActionResolution, StoredGame } from "./model.js";
import type { StoryArcStage, StoryArcView } from "../../shared/game.js";

export const STORY_ARC_STAGES: StoryArcStage[] = ["立局", "主动推进", "阻力显形", "局势扩大", "阶段兑现", "不可逆转折"];

function activePressure(game: StoredGame): string {
  const threat = game.world.dynamicEvents.find((event) => event.status === "可介入" && /威胁|袭击|盯梢|失踪|争夺|冲突|复核/.test(`${event.title}${event.detail}`));
  return threat?.title ?? game.view.tasks.find((task) => task.status !== "完成" && task.id !== "life-goal")?.title ?? game.view.character?.originBurden ?? "资源、身份和成长门槛";
}

function promisedPayoff(game: StoredGame): string {
  if (game.view.character && game.view.character.soulRank >= 10 && !game.view.character.soulRings.length) return "完成第一魂环准备并取得安全猎魂条件";
  if (game.view.affiliations.length) return `在${game.view.affiliations[0].name}取得可验证的培养资格和位置`;
  if (Number(game.world.flags.talentResourcePriority ?? 0) >= 60) return "把公开天赋换成具体导师、训练与第一魂环资源，同时保住选择权";
  return "取得稳定成长路线、可信支持者和第一阶段可支配资源";
}

function irreversibleTurn(game: StoredGame): string {
  if (game.view.affiliations.length) return `决定如何承担${game.view.affiliations[0].name}的培养条件与阵营责任`;
  if (game.view.character?.martialSouls.length && game.view.character.martialSouls.length > 1) return "决定多武魂的公开范围、主修顺序和培养归属";
  return "正式选定学院、导师、宗门或独立成长路线，并承担对应代价";
}

export function createStoryArc(game: StoredGame, previous?: StoryArcView): StoryArcView {
  const arcNumber = (previous?.arcNumber ?? 0) + 1;
  const activeTask = game.view.tasks.find((task) => task.status !== "完成" && task.id !== "life-goal");
  const goal = activeTask?.title ?? game.view.chapterObjective?.title ?? game.view.lifeGoal ?? "在斗罗大陆站稳脚跟";
  const attention = Number(game.world.flags.talentResourcePriority ?? 0);
  const conflict = attention >= 60
    ? "公开天赋带来培养机会，也引来归属谈判、同辈竞争和安全风险"
    : activeTask?.detail ?? game.view.chapterObjective?.stakes ?? "成长需要真实资源、关系和承担风险的行动";
  return {
    id: `arc-${game.view.era ?? 1}-${arcNumber}-${game.actionIndex}`,
    arcNumber,
    title: arcNumber === 1 ? `${game.view.character?.originName ?? "新生"}·觉醒后的第一步` : `${goal}·第${arcNumber}卷`,
    stage: "立局",
    stageIndex: 0,
    centralGoal: goal,
    centralConflict: conflict,
    opposingForce: activePressure(game),
    stakes: game.view.chapterObjective?.stakes ?? game.view.character?.originBurden ?? "失败会失去时间、资源、关系或安全余地",
    promisedPayoff: promisedPayoff(game),
    irreversibleTurn: irreversibleTurn(game),
    pressure: Math.min(100, Math.max(10, Number(game.world.flags.destinyPressure ?? 1) * 12 + (attention >= 60 ? 12 : 0))),
    startedActionIndex: game.actionIndex,
    stageStartedActionIndex: game.actionIndex,
    lastUpdatedAction: game.actionIndex,
    beats: [],
    evidence: [],
    completedArcTitles: previous ? [...previous.completedArcTitles, previous.title].slice(-12) : [],
  };
}

function beatKind(action: string, result: ActionResolution): StoryArcView["beats"][number]["kind"] {
  const text = `${action} ${result.intent} ${result.ruleSummary}`;
  if (/死亡|背叛|加入|离开|拜师|结婚|建立|摧毁|历史偏移|正式决定|签订/.test(text)) return "转折";
  if (/失败|受伤|中毒|拒绝|损失|无法完成|规则阻止|错过|警告/.test(text)) return "受挫";
  if (/获得|完成|突破|成功|录取|晋升|魂环|赢得|兑现/.test(text)) return "兑现";
  if (/威胁|袭击|敌对|追杀|监视|争夺|封锁|危机/.test(text)) return "升级";
  if (/交谈|帮助|承诺|拜访|同伴|家人|导师|关系|谈判/.test(text)) return "关系";
  return "推进";
}

function stageTargetIndex(arc: StoryArcView, kind: StoryArcView["beats"][number]["kind"]): number {
  const total = arc.beats.length;
  if (arc.stageIndex === 0 && total >= 1) return 1;
  if (arc.stageIndex === 1 && (total >= 3 || kind === "受挫" || arc.pressure >= 45)) return 2;
  if (arc.stageIndex === 2 && (total >= 5 || kind === "受挫" || kind === "升级")) return 3;
  if (arc.stageIndex === 3 && (total >= 7 || kind === "兑现")) return 4;
  if (arc.stageIndex === 4 && (total >= 9 || kind === "转折")) return 5;
  return arc.stageIndex;
}

export function updateStoryArc(game: StoredGame, action: string, result: ActionResolution): StoryArcView {
  let arc = game.view.storyArc ?? createStoryArc(game);
  const kind = beatKind(action, result);
  const summary = result.ruleSummary.replace(/\s+/g, " ").trim().slice(0, 180) || `${action}已经产生可追踪后果`;
  arc.beats.push({ actionIndex: game.actionIndex, kind, summary });
  arc.beats = arc.beats.slice(-18);
  if (!/无法完成|规则阻止/.test(result.intent)) arc.evidence = [...new Set([...arc.evidence, summary])].slice(-12);
  const pressureDelta = kind === "受挫" ? 18 : kind === "升级" ? 14 : kind === "转折" ? 10 : kind === "兑现" ? -14 : kind === "关系" ? -3 : 4;
  arc.pressure = Math.max(0, Math.min(100, arc.pressure + pressureDelta));
  const nextIndex = stageTargetIndex(arc, kind);
  if (nextIndex !== arc.stageIndex) {
    arc.stageIndex = nextIndex;
    arc.stage = STORY_ARC_STAGES[nextIndex];
    arc.stageStartedActionIndex = game.actionIndex;
  }
  arc.opposingForce = activePressure(game);
  arc.promisedPayoff = promisedPayoff(game);
  arc.irreversibleTurn = irreversibleTurn(game);
  arc.lastUpdatedAction = game.actionIndex;
  if (arc.stageIndex === 5 && game.actionIndex > arc.stageStartedActionIndex && kind !== "受挫") arc = createStoryArc(game, arc);
  game.view.storyArc = arc;
  return arc;
}

export function ensureStoryArc(game: StoredGame): StoryArcView | undefined {
  if (!game.view.character || !["life_goal_selection", "playing", "ended"].includes(game.view.status)) return undefined;
  game.view.storyArc ??= createStoryArc(game);
  return game.view.storyArc;
}
