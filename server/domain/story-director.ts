import type { ActionResolution, StoredGame } from "./model.js";
import type { StoryArcEvidenceKind, StoryArcNpcSceneView, StoryArcPayoffView, StoryArcStage, StoryArcStageGateView, StoryArcView, TaskView } from "../../shared/game.js";

export const STORY_ARC_STAGES: StoryArcStage[] = ["立局", "主动推进", "阻力显形", "局势扩大", "阶段兑现", "不可逆转折"];

function boundedSuggestions(items: string[]): string[] {
  return items.map((item) => item.length > 28 ? item.slice(0, 28) : item);
}

const ERA_OPENING: Record<1 | 2 | 3 | 4, { route: string; living: string; milestone: string; growthAction: string; riskAction: string }> = {
  1: { route: "确认武魂方向与可重复修炼方式", living: "落实学院名额、路费、食宿或监护安排", milestone: "取得第一魂环所需的调查、同行与安全条件", growthAction: "请主持者说明第一魂环方向与修炼门槛", riskAction: "核对武魂细节的登记与外传范围" },
  2: { route: "复核魂力、武魂特征与当前可用培养路线", living: "落实学院报名、食宿与家庭能够承担的费用", milestone: "取得第一魂环或当代魂师培养所需的真实条件", growthAction: "请主持者复核魂力、武魂特征与培养路线", riskAction: "先问清培养条件、费用与保密范围" },
  3: { route: "确认武魂控制、魂师班与当代魂灵路线", living: "确认魂师班选择、家庭生活与后续魂灵费用", milestone: "在达到门槛后完成魂灵或第一魂环的适配与资源准备", growthAction: "确认魂师班并学习基础冥想与武魂控制", riskAction: "提前核对魂灵适配、精神负荷与购买费用" },
  4: { route: "完成觉醒记录、魂力测试与初等学院安排", living: "落实幼儿园或初等学院安排及家庭照料", milestone: "开始当前年龄能够参加的学院基础课程与魂力训练", growthAction: "请主持者完成魂力测试并说明入学安排", riskAction: "核对觉醒记录、数据用途与公开范围" },
};

function currentOrdinal(game: StoredGame): number {
  return (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1);
}

function activeTasks(game: StoredGame): TaskView[] {
  return game.view.tasks.filter((task) => task.status !== "完成" && task.status !== "失败" && task.id !== "life-goal");
}

function mainTaskScore(game: StoredGame, task: TaskView): number {
  if (game.world.dynamicEvents.some((event) => event.id === task.id)) return -200;
  let score = task.kind === "修炼需求" ? 110 : task.kind === "计划" ? 85 : task.kind === "承诺" ? 70 : task.kind === "线索" ? 20 : 45;
  if (/awakening|academy|institution|establish-local-identity|adapt-cultivation|choose-human-world|forbidden-choice/.test(task.id ?? "")) score += 70;
  if (/觉醒|培养|复核|学院|魂环|魂灵|修炼|身份|宗门|入学/.test(`${task.title}${task.detail}`)) score += 55;
  if (task.institutionAssignment) score += 80;
  if (/失踪|商路|矿洞|挑战者|车队|事故|投诉|争议/.test(task.title) && task.kind === "线索") score -= 40;
  return score;
}

function selectMainTask(game: StoredGame): TaskView | undefined {
  return activeTasks(game).sort((left, right) => mainTaskScore(game, right) - mainTaskScore(game, left))[0];
}

function arcTypeFor(text: string): StoryArcView["arcType"] {
  if (/觉醒|武魂|魂力|魂环|魂灵|修炼|训练|培养|入学|体检|能力评估/.test(text)) return "成长";
  if (/婚姻|伴侣|家人|朋友|关系|守护/.test(text)) return "关系";
  if (/宗门|学院|势力|军|舰队|机构|帝国|联邦/.test(text)) return "势力";
  if (/袭击|追杀|生存|危机|失踪|敌对|暗杀/.test(text)) return "危机";
  if (/调查|探索|寻找|遗迹|星球|地图/.test(text)) return "探索";
  return "成长";
}

function activePressure(game: StoredGame, mainTask?: TaskView): string {
  const pressure = game.world.dynamicEvents.find((event) => event.status === "可介入" && event.id === mainTask?.id);
  return pressure?.title ?? mainTask?.detail ?? game.view.chapterObjective?.stakes ?? game.view.character?.originBurden ?? "资源、身份和成长门槛";
}

function createPayoffLedger(game: StoredGame): StoryArcPayoffView[] {
  const era = game.view.era ?? 1;
  const profile = ERA_OPENING[era];
  const mode = String(game.world.flags.openingMode ?? "public");
  const institution = String(game.world.flags.openingInstitutionName ?? game.view.affiliations[0]?.name ?? "当前机构");
  const route = mode === "internal" ? `确认武魂方向与${institution}内部培养方案`
    : mode === "noble" ? "比较家族、学院与外部导师三类培养路线"
      : mode === "unbound" ? "在无户籍状态下取得合法训练与生存条件"
        : mode === "beast" ? "确认留在兽群或接触人类修炼体系的边界"
          : profile.route;
  const living = mode === "internal" ? `落实${institution}内部的导师、训练场、资源额度和责任`
    : mode === "noble" ? "落实培养地点、费用来源、监护与家族责任"
      : mode === "unbound" ? "落实今晚住处、现场见证与临时身份凭据"
        : mode === "beast" ? "落实离开兽群领地后的身份、语言、钱币与安全准备"
          : profile.living;
  const ledger: StoryArcPayoffView[] = [
    { id: "growth-route", label: route, status: "待兑现", evidence: [] },
    { id: "living-condition", label: living, status: "待兑现", evidence: [] },
    { id: "first-milestone", label: profile.milestone, status: "待兑现", evidence: [] },
  ];
  if (Number(game.world.flags.talentResourcePriority ?? 0) >= 60 || (game.view.character?.innateSoulPower ?? 0) >= 9) {
    ledger.unshift({ id: "talent-response", label: "把公开天赋换成导师面谈、训练资源和明确培养条件", status: "待兑现", evidence: [] });
  }
  return ledger;
}

function promisedPayoff(ledger: StoryArcPayoffView[]): string {
  const pending = ledger.filter((item) => item.status !== "已兑现");
  return (pending.length ? pending : ledger).slice(0, 2).map((item) => item.label).join("；");
}

function irreversibleTurn(game: StoredGame): string {
  if (game.view.affiliations.length) return `决定是否承担${game.view.affiliations[0].name}的培养条件与阵营责任`;
  if ((game.view.character?.martialSouls.length ?? 0) > 1) return "决定多武魂的公开范围、主修顺序和培养归属";
  return "正式选择学院、导师、宗门或独立成长路线，并承担对应代价";
}

function createStageGates(): StoryArcStageGateView[] {
  return [
    { stage: "立局", requirement: "本卷目标、现实门槛与失败代价已经明确", requiredKinds: [], mode: "全部", satisfied: true, evidence: [] },
    { stage: "主动推进", requirement: "玩家为本卷目标采取一次可结算的主动行动", requiredKinds: ["主动行动"], mode: "任一", satisfied: false, evidence: [] },
    { stage: "阻力显形", requirement: "出现真实拒绝、等待、费用、风险、伤势或权限门槛", requiredKinds: ["外部阻力", "现实代价"], mode: "任一", satisfied: false, evidence: [] },
    { stage: "局势扩大", requirement: "阻力之后，能力证明、关系谈判与有权限者反应至少形成两类证据", requiredKinds: ["能力证明", "关系谈判", "外部反应"], mode: "至少二项", satisfied: false, evidence: [] },
    { stage: "阶段兑现", requirement: "导师、名额、食宿、训练、身份或第一里程碑至少一项真正落地", requiredKinds: ["实际兑现"], mode: "任一", satisfied: false, evidence: [] },
    { stage: "不可逆转折", requirement: "玩家亲自作出会改变归属、公开范围或长期路线的重大选择", requiredKinds: ["重大选择"], mode: "任一", satisfied: false, evidence: [] },
  ];
}

function refreshStageGates(arc: StoryArcView): void {
  for (const gate of arc.stageGates) {
    if (!gate.requiredKinds.length) { gate.satisfied = true; continue; }
    const records = arc.evidenceRecords.filter((record) => gate.requiredKinds.includes(record.kind));
    const presentKinds = new Set(records.map((record) => record.kind));
    gate.satisfied = gate.mode === "全部" ? gate.requiredKinds.every((kind) => presentKinds.has(kind)) : gate.mode === "至少二项" ? presentKinds.size >= 2 : presentKinds.size >= 1;
    gate.evidence = records.map((record) => record.summary).slice(-4);
  }
}

function evidenceKinds(text: string, blocked: boolean): StoryArcEvidenceKind[] {
  const kinds = new Set<StoryArcEvidenceKind>();
  if (!blocked) kinds.add("主动行动");
  if (/测试|复测|训练|考核|实战|调查|制作|完成课程|魂力|武魂控制/.test(text) && !/未测试|没有测试/.test(text)) kinds.add("能力证明");
  if (/商量|谈判|询问|追问|条件|合同|协议|监护|家人|导师面谈|表态/.test(text)) kinds.add("关系谈判");
  if (/花费|支付|消耗|疲劳|受伤|伤势|路费|学费|代价|损失/.test(text)) kinds.add("现实代价");
  if (blocked || /拒绝|等待|暂未|尚未|不能|不足|缺少|门槛|风险|复核|异议|竞争|警告|失败/.test(text)) kinds.add("外部阻力");
  if (/主持者|执事|导师|老师|学院|宗门|家人|监护|负责人|机构|登记|上报|答复|安排|复核/.test(text)) kinds.add("外部反应");
  if (!/尚未|暂未|不能|等待|申请中|待复核|失败/.test(text) && /录取|正式加入|获得.{0,8}(?:名额|资格|资源|许可|魂环)|导师.{0,8}(?:同意|安排)|食宿.{0,8}(?:落实|安排)|学费.{0,8}(?:减免|补助)|训练场.{0,8}(?:开放|安排)|身份.{0,8}(?:建立|登记)|契约成立/.test(text)) kinds.add("实际兑现");
  if (/正式决定|决定.{0,12}(?:加入|拒绝|公开|隐藏|主修|路线|归属)|选择.{0,12}(?:学院|导师|宗门|武魂|路线)|签订|登记结婚|离开.{0,8}(?:家|学院|宗门)/.test(text)) kinds.add("重大选择");
  return [...kinds];
}

function taskMatchesResult(task: TaskView | undefined, text: string): boolean {
  if (!task) return false;
  if (task.progressEvidence?.some((item) => text.includes(item) || item.includes(text.slice(0, 24)))) return true;
  const words = `${task.title}${task.detail}`.match(/[\u4e00-\u9fff]{2,6}/g) ?? [];
  return words.some((word) => word.length >= 2 && text.includes(word));
}

function isMainThreadRelevant(game: StoredGame, arc: StoryArcView, action: string, result: ActionResolution): boolean {
  const text = `${action}${result.intent}${result.ruleSummary}`;
  const sideEvent = game.world.dynamicEvents.find((event) => event.id !== arc.mainTaskId && text.includes(event.title));
  if (sideEvent) return false;
  if (/^(休息|睡觉|吃饭|查看|整理背包|购买日用品)/.test(action) && !arc.centralGoal.includes(action.slice(0, 2))) return false;
  const mainTask = game.view.tasks.find((task) => task.id === arc.mainTaskId);
  if (taskMatchesResult(mainTask, text)) return true;
  const patterns: Record<StoryArcView["arcType"], RegExp> = {
    成长: /觉醒|武魂|魂力|魂环|魂灵|修炼|训练|导师|学院|培养|考核|名额|入学|猎魂|复测|体检|能力评估/,
    关系: /家人|朋友|同伴|伴侣|关系|承诺|帮助|保护|商量|谈判/,
    势力: /宗门|学院|势力|机构|军|舰队|贡献|晋升|任务|复核|协议/,
    危机: /袭击|追杀|失踪|敌对|暗杀|保护|撤退|生存|伤势|威胁/,
    探索: /调查|寻找|探索|遗迹|星球|地图|线索|核验|发现/,
  };
  return patterns[arc.arcType].test(text) || text.includes(arc.centralGoal.slice(0, 6));
}

function refreshPayoffs(arc: StoryArcView, text: string): boolean {
  let newlyPaid = false;
  const blocked = /尚未|暂未|不能|等待|申请中|待复核|失败/.test(text);
  const patterns: Record<string, RegExp> = {
    "growth-route": /路线|适配方向|修炼方式|训练计划|主修|能力方向/,
    "living-condition": /食宿|住处|路费|学费|工读|补助|名额|录取|身份登记|学院档案/,
    "first-milestone": /魂环|猎魂|魂灵|魂师班|体检|能力评估|训练资格/,
    "talent-response": /导师面谈|导师安排|训练场|培养资源|资源额度/,
  };
  for (const payoff of arc.payoffLedger) {
    if (!patterns[payoff.id]?.test(text)) continue;
    payoff.evidence = [...new Set([...payoff.evidence, text.slice(0, 180)])].slice(-6);
    const actual = !blocked && /获得|落实|完成|通过|录取|开放|安排|减免|补助|成立|登记|签订/.test(text);
    if (actual && payoff.status !== "已兑现") { payoff.status = "已兑现"; newlyPaid = true; }
    else if (payoff.status === "待兑现") payoff.status = "部分兑现";
  }
  return newlyPaid;
}

function npcCandidates(game: StoredGame): Array<{ id?: string; name: string; role: string; motive: string }> {
  const relations = game.view.relations.filter((relation) => /觉醒|执事|导师|老师|师徒|父|母|监护|祖|院长|长老|所属学院|所属宗门|同班同学|带队责任人|护送责任人/.test(`${relation.relation}${relation.impression}`)).filter((relation) => !relation.id || !game.world.npcs[relation.id] || game.world.npcs[relation.id].locationId === game.view.locationId).map((relation) => ({ id: relation.id, name: relation.name, role: relation.relation, motive: /父|母|监护|祖/.test(relation.relation) ? "需要确认孩子的食宿、费用和安全，不能把决定全推给六岁孩子" : /同班同学/.test(relation.relation) ? game.view.academyLife?.peers.find((peer) => peer.name === relation.name)?.motive ?? "正在处理自己的课程、名次和小组选择" : /带队责任人|护送责任人/.test(relation.relation) ? "已经在首环责任页签字，需要在出发前核对人员、许可和撤退条件" : /觉醒|执事|导师|老师|师徒/.test(`${relation.relation}${relation.impression}`) ? "亲眼见到当前成长结果，职责要求复核训练、课程或培养边界" : "因当前学院、宗门或长辈职责，需要主角对公开条件作出回应" }));
  const known = Object.values(game.world.npcs).filter((npc) => npc.alive && npc.knownToPlayer && npc.locationId === game.view.locationId).map((npc) => ({ id: npc.id, name: npc.name, role: npc.activePlan?.responsibility ?? "同场人物", motive: npc.activePlan?.responsibility ? `因“${npc.activePlan.responsibility}”需要主角给出可执行答复` : "因当前公开职责与关系，需要主角回应眼前条件" }));
  const score = (item: { role: string }) => /带队责任人|护送责任人/.test(item.role) ? 115 : /觉醒|执事|导师|老师|师徒|院长|长老/.test(item.role) ? 100 : /父|母|监护|祖/.test(item.role) ? 90 : /同班同学/.test(item.role) ? 75 : /学院|宗门|势力/.test(item.role) ? 70 : 20;
  return [...relations, ...known].filter((item, index, all) => all.findIndex((candidate) => candidate.name === item.name) === index).sort((left, right) => score(right) - score(left));
}

function npcActionFor(game: StoredGame, candidate: { name: string; role: string }, stage: StoryArcStage): string {
  const era = game.view.era ?? 1;
  const mode = String(game.world.flags.openingMode ?? "public");
  const institution = String(game.world.flags.openingInstitutionName ?? game.view.affiliations[0]?.name ?? "当前机构");
  if (game.view.hunting?.support?.responsibleParty === candidate.name) return `回应${candidate.name}对预算、成年同行、许可与撤退条件的出发前核对`;
  if (game.view.academyLife?.homeroomTeacher === candidate.name) return `回应${candidate.name}对课程、费用责任和首月考核缺项的当面追问`;
  const peer = game.view.academyLife?.peers.find((item) => item.name === candidate.name);
  if (peer) return peer.role === "竞争者" ? `回应${peer.name}提出的同组实战与名次竞争` : `回应${peer.name}围绕“${peer.motive}”提出的小组安排`;
  if (game.view.mentorPursuit?.mentorName === candidate.name && game.view.mentorPursuit.stage === "已拜师") return `回应${candidate.name}对专项课程记录与训练禁忌的复核`;
  if (/父|母|监护|祖/.test(candidate.role)) {
    if (mode === "internal") return `和${candidate.name}核对${institution}内部导师、资源与第一魂环责任`;
    if (mode === "noble") return `和${candidate.name}比较家族培养、学院报名与外部导师的资格和代价`;
    if (mode === "unbound") return `请${candidate.name}明确临时监护、住处与身份见证能维持多久`;
    if (mode === "beast") return `和${candidate.name}确认离开领地后会失去哪些保护`;
    return ({ 1: `和${candidate.name}核对学院名额、路费与猎魂风险`, 2: `和${candidate.name}核对学院食宿、费用与第一魂环安排`, 3: `和${candidate.name}确认魂师班选择与后续魂灵费用`, 4: `和${candidate.name}核对魂力测试、记录用途与入学安排` } as const)[era];
  }
  if (stage === "阻力显形" || stage === "局势扩大") return `请${candidate.name}明确当前异议、权限与能够调动的资源`;
  return `回应${candidate.name}提出的复核与培养条件`;
}

function refreshNpcScenes(game: StoredGame, arc: StoryArcView, action?: string): void {
  const now = currentOrdinal(game);
  for (const scene of arc.npcScenes.filter((item) => item.status === "等待回应")) {
    const roleResponse = action && /主持者|执事|导师|老师|父亲|母亲|家人|监护/.test(action) && /觉醒|执事|导师|老师|父|母|家人|监护/.test(scene.role);
    if (action && (action.includes(scene.npcName) || roleResponse)) scene.status = "已回应";
    else if (now > scene.expiresOrdinal) {
      scene.status = "已错过";
      arc.pressure = Math.min(100, arc.pressure + 5);
      arc.evidence = [...new Set([...arc.evidence, `错过${scene.npcName}基于“${scene.motive}”提出的回应期限`])].slice(-16);
      const relation = game.view.relations.find((item) => item.name === scene.npcName);
      if (relation?.dimensions) { relation.dimensions.trust = Math.max(-100, relation.dimensions.trust - 2); relation.dimensions.vigilance = Math.min(100, relation.dimensions.vigilance + 2); }
    }
  }
  if (arc.npcScenes.some((item) => item.status === "等待回应")) return;
  const used = new Set(arc.npcScenes.filter((item) => item.earlyGrowthPhase === arc.earlyGrowthPhase).map((item) => item.npcName));
  const candidates = npcCandidates(game).filter((item) => !used.has(item.name));
  const preferredName = arc.earlyGrowthPhase === "首环筹备" ? game.view.hunting?.support?.responsibleParty : arc.earlyGrowthPhase === "学院师承生活" ? game.view.academyLife?.homeroomTeacher ?? (game.view.mentorPursuit?.stage === "已拜师" ? game.view.mentorPursuit.mentorName : undefined) : undefined;
  const candidate = candidates.find((item) => item.name === preferredName) ?? candidates[0];
  if (!candidate) return;
  arc.npcScenes.push({ id: `arc-npc-${arc.id}-${arc.stageIndex}-${arc.npcScenes.length}`, npcId: candidate.id, npcName: candidate.name, role: candidate.role, motive: candidate.motive, action: npcActionFor(game, candidate, arc.stage), stage: arc.stage, status: "等待回应", expiresOrdinal: now + (arc.stageIndex <= 1 ? 7 : 30), earlyGrowthPhase: arc.earlyGrowthPhase });
  arc.npcScenes = arc.npcScenes.slice(-8);
}

function earlyGrowthPhase(game: StoredGame): NonNullable<StoryArcView["earlyGrowthPhase"]> {
  if ((game.view.character?.soulRings.length ?? 0) > 0 || game.view.hunting?.stage === "完成") return "首环兑现";
  if (game.view.hunting?.support || (game.view.hunting && game.view.hunting.stage !== "需求")) return "首环筹备";
  if (game.view.academyLife || game.view.mentorPursuit?.stage === "已拜师") return "学院师承生活";
  if (game.view.academyApplication || game.view.mentorPursuit) return "培养路线";
  return "觉醒落地";
}

const EARLY_GROWTH_DIRECTION: Record<NonNullable<StoryArcView["earlyGrowthPhase"]>, { goal: string; conflict: string; payoff: string; turn: string }> = {
  觉醒落地: { goal: "把觉醒结果变成能执行的培养条件", conflict: "天赋、身份与家庭现实尚未形成同一条可走路线", payoff: "拿到一条由具体责任人承认的培养方案", turn: "决定公开范围与第一条培养路线" },
  培养路线: { goal: "在学院、导师、家族或宗门之间选出近期培养路线", conflict: "每条路线提供的资源、考核、费用与责任并不相同", payoff: "取得真实学籍、师承或明确拒绝后的替代路线", turn: "亲自接受或拒绝一项长期培养责任" },
  学院师承生活: { goal: "用课程、同辈互动或导师训练证明路线能够持续", conflict: "同辈有自己的名次与家庭目标，导师和学院也有独立规则", payoff: "完成学院首月或导师正式课程并形成第一份成长履历", turn: "决定固定训练关系与首环准备方式" },
  首环筹备: { goal: "在责任、费用、许可和成年同行闭合后取得第一魂环", conflict: "合适魂兽、带队权限、补给、路程与吸收风险必须同时成立", payoff: "完成一次不跳步的调查、准备、战斗与吸收", turn: "在安全建议、魂兽适配与个人选择之间确定目标" },
  首环兑现: { goal: "处理第一魂环带来的能力、关系与下一阶段责任", conflict: "获得力量会改变课程、同辈评价、导师计划和外界关注", payoff: "让第一魂技进入真实训练与生活，而非只停在数值栏", turn: "选择下一阶段学院、师承、宗门或独立成长重心" },
};

function applyEarlyGrowthDirection(game: StoredGame, arc: StoryArcView, evidence?: string): void {
  if (arc.arcNumber !== 1 && !arc.earlyGrowthPhase) return;
  const phase = earlyGrowthPhase(game);
  const previous = arc.earlyGrowthPhase;
  arc.earlyGrowthPhase = phase;
  arc.earlyGrowthEvidence ??= [];
  if (previous !== phase) {
    arc.earlyGrowthEvidence.push(`${previous ?? "开局"} → ${phase}：${evidence?.slice(0, 150) ?? "依据当前结构化状态重算"}`);
    for (const scene of arc.npcScenes.filter((item) => item.status === "等待回应")) {
      scene.status = "已错过";
      arc.evidence = [...new Set([...arc.evidence, `成长阶段已从${previous ?? "开局"}推进，${scene.npcName}此前提出的要求未被正面回应`])].slice(-16);
      arc.pressure = Math.min(100, arc.pressure + 3);
    }
  }
  arc.earlyGrowthEvidence = arc.earlyGrowthEvidence.slice(-12);
  const direction = EARLY_GROWTH_DIRECTION[phase];
  arc.title = `${game.view.character?.originName ?? "新生"}·从觉醒到第一魂环`;
  arc.centralGoal = direction.goal;
  arc.centralConflict = direction.conflict;
  arc.promisedPayoff = direction.payoff;
  arc.irreversibleTurn = direction.turn;
  arc.arcType = "成长";
  const routePaid = Boolean(game.view.academyApplication || game.view.mentorPursuit || game.view.hunting?.support);
  const livingPaid = Boolean(game.view.academyLife || game.view.mentorPursuit?.stage === "已拜师");
  const ringPaid = phase === "首环兑现";
  for (const payoff of arc.payoffLedger) {
    if (payoff.id === "growth-route" && routePaid) payoff.status = "已兑现";
    if (payoff.id === "living-condition" && livingPaid) payoff.status = "已兑现";
    if (payoff.id === "first-milestone") payoff.status = ringPaid ? "已兑现" : game.view.hunting?.support ? "部分兑现" : payoff.status;
  }
}

function hydrateStoryArc(game: StoredGame, arc: StoryArcView): StoryArcView {
  const mainTask = selectMainTask(game);
  arc.mainTaskId ??= mainTask?.id;
  arc.arcType ??= arcTypeFor(`${arc.centralGoal}${arc.centralConflict}`);
  arc.sideThreads ??= activeTasks(game).filter((task) => task.id !== arc.mainTaskId).map((task) => ({ taskId: task.id ?? task.title, title: task.title, status: task.status ?? "进行中" }));
  arc.payoffLedger ??= createPayoffLedger(game);
  arc.evidenceRecords ??= arc.beats.flatMap((beat) => evidenceKinds(beat.summary, /无法完成|规则阻止|失败/.test(beat.summary)).map((kind) => ({ actionIndex: beat.actionIndex, kind, summary: beat.summary })));
  arc.stageGates ??= createStageGates();
  arc.npcScenes ??= [];
  applyEarlyGrowthDirection(game, arc);
  refreshStageGates(arc);
  const supportedIndex = arc.stageGates.reduce((index, gate, gateIndex) => gateIndex <= index + 1 && gate.satisfied ? gateIndex : index, 0);
  arc.stageIndex = Math.min(arc.stageIndex, supportedIndex);
  arc.stage = STORY_ARC_STAGES[arc.stageIndex];
  refreshNpcScenes(game, arc);
  return arc;
}

export function createStoryArc(game: StoredGame, previous?: StoryArcView): StoryArcView {
  const arcNumber = (previous?.arcNumber ?? 0) + 1;
  const mainTask = selectMainTask(game);
  const goal = mainTask?.title ?? game.view.chapterObjective?.title ?? game.view.lifeGoal ?? "在斗罗大陆站稳脚跟";
  const attention = Number(game.world.flags.talentResourcePriority ?? 0);
  const ledger = createPayoffLedger(game);
  const conflict = attention >= 60 ? "公开天赋带来培养机会，也引来复测、归属谈判、同辈竞争与安全风险" : mainTask?.detail ?? game.view.chapterObjective?.stakes ?? "成长需要真实资源、关系和承担风险的行动";
  const arc: StoryArcView = {
    id: `arc-${game.view.era ?? 1}-${arcNumber}-${game.actionIndex}`,
    arcNumber,
    title: arcNumber === 1 ? `${game.view.character?.originName ?? "新生"}·觉醒后的第一步` : `${goal}·第${arcNumber}卷`,
    stage: "立局", stageIndex: 0, centralGoal: goal, centralConflict: conflict, opposingForce: activePressure(game, mainTask),
    stakes: game.view.chapterObjective?.stakes ?? game.view.character?.originBurden ?? "失败会失去时间、资源、关系或安全余地",
    promisedPayoff: promisedPayoff(ledger), irreversibleTurn: irreversibleTurn(game), arcType: arcTypeFor(`${goal}${conflict}`), mainTaskId: mainTask?.id,
    sideThreads: activeTasks(game).filter((task) => task.id !== mainTask?.id).map((task) => ({ taskId: task.id ?? task.title, title: task.title, status: task.status ?? "进行中" })),
    stageGates: createStageGates(), evidenceRecords: [], payoffLedger: ledger, npcScenes: [],
    pressure: Math.min(100, Math.max(10, Number(game.world.flags.destinyPressure ?? 1) * 12 + (attention >= 60 ? 12 : 0))),
    startedActionIndex: game.actionIndex, stageStartedActionIndex: game.actionIndex, lastUpdatedAction: game.actionIndex, beats: [], evidence: [], completedArcTitles: previous ? [...previous.completedArcTitles, previous.title].slice(-12) : [],
  };
  applyEarlyGrowthDirection(game, arc, "建立早期成长卷");
  refreshNpcScenes(game, arc);
  return arc;
}

function beatKind(kinds: StoryArcEvidenceKind[]): StoryArcView["beats"][number]["kind"] {
  if (kinds.includes("重大选择")) return "转折";
  if (kinds.includes("现实代价") || kinds.includes("外部阻力")) return "受挫";
  if (kinds.includes("实际兑现")) return "兑现";
  if (kinds.includes("外部反应")) return "升级";
  if (kinds.includes("关系谈判")) return "关系";
  return "推进";
}

export function updateStoryArc(game: StoredGame, action: string, result: ActionResolution): StoryArcView {
  let arc = hydrateStoryArc(game, game.view.storyArc ?? createStoryArc(game));
  const blocked = /无法完成|规则阻止/.test(result.intent);
  const summary = result.ruleSummary.replace(/\s+/g, " ").trim().slice(0, 180) || `${action}已经产生可追踪后果`;
  const relevant = isMainThreadRelevant(game, arc, action, result);
  refreshNpcScenes(game, arc, action);
  if (relevant) {
    const kinds = evidenceKinds(`${action} ${result.intent} ${summary}`, blocked);
    const newlyPaid = refreshPayoffs(arc, summary);
    if (newlyPaid && !kinds.includes("实际兑现")) kinds.push("实际兑现");
    arc.beats.push({ actionIndex: game.actionIndex, kind: beatKind(kinds), summary });
    arc.beats = arc.beats.slice(-24);
    for (const kind of kinds) arc.evidenceRecords.push({ actionIndex: game.actionIndex, kind, summary });
    arc.evidenceRecords = arc.evidenceRecords.slice(-60);
    if (!blocked) arc.evidence = [...new Set([...arc.evidence, summary])].slice(-16);
    const pressureDelta = kinds.includes("现实代价") ? 12 : kinds.includes("外部阻力") ? 10 : kinds.includes("实际兑现") ? -16 : kinds.includes("关系谈判") ? -2 : 3;
    arc.pressure = Math.max(0, Math.min(100, arc.pressure + pressureDelta));
    refreshStageGates(arc);
    const nextGate = arc.stageGates[arc.stageIndex + 1];
    if (nextGate?.satisfied) {
      arc.stageIndex += 1; arc.stage = STORY_ARC_STAGES[arc.stageIndex]; arc.stageStartedActionIndex = game.actionIndex;
      const completingTask = game.view.tasks.find((task) => task.id === arc.mainTaskId);
      if (arc.stageIndex === 5 && kinds.includes("重大选择") && completingTask && /awakening|培养|复核|入学|身份/.test(`${completingTask.id}${completingTask.title}`)) {
        completingTask.status = "完成";
        completingTask.progressEvidence = [...(completingTask.progressEvidence ?? []), summary].slice(-12);
      }
    }
  }
  applyEarlyGrowthDirection(game, arc, summary);
  const mainTask = game.view.tasks.find((task) => task.id === arc.mainTaskId);
  arc.sideThreads = activeTasks(game).filter((task) => task.id !== arc.mainTaskId).map((task) => ({ taskId: task.id ?? task.title, title: task.title, status: task.status ?? "进行中" }));
  arc.opposingForce = activePressure(game, mainTask);
  arc.promisedPayoff = promisedPayoff(arc.payoffLedger);
  arc.irreversibleTurn = irreversibleTurn(game);
  applyEarlyGrowthDirection(game, arc);
  arc.lastUpdatedAction = game.actionIndex;
  refreshNpcScenes(game, arc);
  const earlyVolumeStillOpen = Boolean(arc.earlyGrowthPhase && arc.earlyGrowthPhase !== "首环兑现");
  if (arc.stageIndex === 5 && relevant && !blocked && arc.stageStartedActionIndex < game.actionIndex && !earlyVolumeStillOpen) arc = createStoryArc(game, arc);
  game.view.storyArc = arc;
  return arc;
}

export function storyArcSuggestions(game: StoredGame): string[] {
  const arc = ensureStoryArc(game);
  if (!arc) return [];
  if (arc.earlyGrowthPhase === "首环筹备") return boundedSuggestions(game.view.hunting?.support ? ["推进当前首环调查与准备", `回应${game.view.hunting.support.responsibleParty}的出发核对`, "保留撤退条件并核对秘密范围"] : ["选择一条首环责任路线", "请监护或机构说明能承担的责任", "暂缓猎魂并继续基础训练"]);
  if (arc.earlyGrowthPhase === "学院师承生活") {
    const peer = game.view.academyLife?.peers[0];
    return boundedSuggestions([game.view.academyLife?.stage === "报到安置" ? "去宿舍安置并领取课表" : "完成下一项课程或导师训练", peer ? `回应${peer.name}的同组训练请求` : "回应导师对训练记录的复核", "核对隐藏武魂与培养责任边界"]);
  }
  if (arc.earlyGrowthPhase === "培养路线") return boundedSuggestions(["推进学院申请或导师试学", "和监护人比较费用与长期责任", "保留拒绝当前路线的选择"]);
  const era = game.view.era ?? 1;
  const profile = ERA_OPENING[era];
  const pendingNpc = arc.npcScenes.find((scene) => scene.status === "等待回应");
  const nextGate = arc.stageGates[arc.stageIndex + 1];
  const mode = String(game.world.flags.openingMode ?? "public");
  const institution = String(game.world.flags.openingInstitutionName ?? game.view.affiliations[0]?.name ?? "当前机构");
  const officiant = String(game.world.flags.openingOfficiant ?? "主持者");
  const focus = String(game.world.flags.openingSoulTestFocus ?? "能力边界、消耗与收放");
  const mainSoul = game.view.character?.martialSoul.name ?? "武魂";
  const openingGrowth = mode === "internal" ? `请${officiant}测试${mainSoul}的${focus}` : mode === "noble" ? `请${officiant}测试${mainSoul}的${focus}` : mode === "beast" ? `与养育者确认${mainSoul}的人兽差异` : `请${officiant}测试${mainSoul}的${focus}`;
  const payoffAction = mode === "internal" ? `向${institution}落实导师、训练场与猎魂责任` : mode === "noble" ? "落实选定路线的名额、费用、导师与家族责任" : mode === "unbound" ? "落实住处、临时身份与基础训练条件" : mode === "beast" ? "落实离开兽群后的身份与安全准备" : ({ 1: "向负责人落实导师、训练与猎魂帮助", 2: "向学院落实食宿、培养与魂环帮助", 3: "落实魂师班安排与后续魂灵条件", 4: "落实魂力测试结果与学院基础课程" } as const)[era];
  const growth = nextGate?.stage === "阶段兑现" ? payoffAction : openingGrowth;
  const relation = pendingNpc?.action ?? (game.view.relations[0] ? `向${game.view.relations[0].name}追问能提供的帮助与条件` : "向当前机构追问负责人、条件与答复期限");
  const risk = (game.view.character?.martialSouls.length ?? 0) > (game.view.character?.publiclyKnownMartialSoulIndices?.length ?? 1) ? "暂不公开隐藏武魂，先核对知情范围" : profile.riskAction;
  return boundedSuggestions([growth, relation, risk]);
}

export function ensureStoryArc(game: StoredGame): StoryArcView | undefined {
  if (!game.view.character || !["life_goal_selection", "playing", "ended"].includes(game.view.status)) return undefined;
  game.view.storyArc = hydrateStoryArc(game, game.view.storyArc ?? createStoryArc(game));
  return game.view.storyArc;
}
