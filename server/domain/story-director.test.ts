import { describe, expect, it } from "vitest";
import { applyActionResult } from "./actions.js";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
import { ensureGameState } from "./world.js";
import { storyArcSuggestions } from "./story-director.js";

function playingGame(seed: string, era: 1 | 2 | 3 | 4 = 1) {
  const game = createGame({ gender: "男", difficulty: "标准", seed, era });
  selectCandidate(game, game.view.candidates[0].id, "卷级测试者");
  const draft = game.view.shaping!.personalityOptions[0];
  finalizeCharacterShaping(game, { personalityId: draft.id, keywords: draft.keywords, answers: Object.fromEntries(draft.questions.map((question) => [question.id, question.options[0].id])) });
  awakenCharacter(game);
  selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  return game;
}

function applyBeat(game: ReturnType<typeof playingGame>, action: string, ruleSummary: string, intent = "一般行动") {
  applyActionResult(game, action, { intent, minutes: 60, ruleSummary, fallbackNarrative: ruleSummary, suggestions: [] }, ruleSummary, []);
}

describe("卷级故事导演", () => {
  it("advances only when the next stage has real causal evidence", () => {
    const game = playingGame("story-arc-causal-gates");
    expect(game.view.storyArc).toMatchObject({ arcNumber: 1, stage: "立局", stageIndex: 0 });

    applyBeat(game, "请负责觉醒的魂师说明第一魂环路线", "负责觉醒的魂师列出三种适配方向。", "询问");
    expect(game.view.storyArc?.stage).toBe("主动推进");

    game.world.dynamicEvents.push({ id: "side-herbs", title: "失踪的采药队", kind: "地方", locationId: game.view.locationId!, participantIds: [], detail: "采药队未归。", stakes: 2, status: "可介入", createdYear: 0, createdDay: 1, expiresOrdinal: 40 });
    game.view.tasks.push({ id: "side-herbs", title: "失踪的采药队", kind: "线索", detail: "采药队未归。", status: "进行中" });
    applyBeat(game, "调查失踪的采药队", "沿山路找到一只遗落药篓。", "调查");
    expect(game.view.storyArc?.stage).toBe("主动推进");
    expect(game.view.storyArc?.sideThreads.some((item) => item.title === "失踪的采药队")).toBe(true);

    applyBeat(game, "申请学院培养名额", "申请进入复核，但负责人要求补交路费与监护证明，名额尚未获得。", "申请");
    expect(game.view.storyArc?.stage).toBe("阻力显形");
    expect(game.view.storyArc?.stageGates.find((gate) => gate.stage === "阻力显形")?.evidence).toEqual(expect.arrayContaining([expect.stringContaining("监护证明")]));
  });

  it("requires resistance, reaction, payoff, and player choice before a volume can reach its turn", () => {
    const game = playingGame("story-arc-payoff-gates");
    applyBeat(game, "请负责觉醒的魂师重新测试武魂", "负责觉醒的魂师换过水晶，再次确认武魂形态。", "重新测试");
    applyBeat(game, "申请培养条件", "学院要求监护证明并说明学费，当前只能等待复核。", "申请");
    expect(game.view.storyArc?.stage).toBe("阻力显形");

    applyBeat(game, "去训练场完成能力测试", "导师看完三轮训练记录，确认武魂控制稳定并向学院提交意见。", "训练");
    expect(game.view.storyArc?.stage).toBe("局势扩大");

    applyBeat(game, "向学院落实培养安排", "学院完成录取，说明哪位老师接手、训练场何时能用以及基础食宿。", "录取");
    expect(game.view.storyArc?.stage).toBe("阶段兑现");
    expect(game.view.storyArc?.payoffLedger.some((item) => item.status === "已兑现")).toBe(true);

    applyBeat(game, "正式决定加入学院并签订培养协议", "双方签订培养协议，学院身份与责任正式生效。", "正式决定");
    expect(game.view.storyArc?.stage).toBe("不可逆转折");
    expect(game.view.storyArc?.evidenceRecords.some((item) => item.kind === "重大选择")).toBe(true);
    applyBeat(game, "开始学院第一堂基础课程", "完成第一次基础冥想课程并留下训练记录。", "课程");
    expect(game.view.storyArc?.arcNumber).toBe(1);
    expect(game.view.storyArc?.title).toContain("从觉醒到第一魂环");
    expect(game.view.storyArc?.completedArcTitles).toHaveLength(0);
  });

  it("creates an observable NPC initiative and three era-grounded decision axes", () => {
    for (const era of [1, 2, 3, 4] as const) {
      const game = playingGame(`story-arc-npc-era-${era}`, era);
      const scene = game.view.storyArc?.npcScenes.find((item) => item.status === "等待回应");
      expect(scene?.npcName).toBeTruthy();
      expect(scene?.motive).toMatch(/谈清|食宿|费用|安全|条件|职责/);
      const suggestions = storyArcSuggestions(game);
      expect(suggestions).toHaveLength(3);
      expect(suggestions.every((item) => item.length >= 8 && item.length <= 28)).toBe(true);
      expect(new Set(suggestions).size).toBe(3);
      if (era === 3) expect(`${scene?.action}${suggestions.join("、")}`).not.toContain("学费");
      if (era === 4) expect(`${scene?.action}${suggestions.join("、")}`).not.toMatch(/体检|能力评估/);
    }
  });

  it("keeps the first volume on a causal awakening-to-first-ring arc and makes ignored NPC initiatives leave pressure", () => {
    const game = playingGame("early-growth-directed-arc");
    expect(game.view.storyArc).toMatchObject({ earlyGrowthPhase: "觉醒落地", centralGoal: "让觉醒后的第一步真正落到人和事上" });
    const initialScene = game.view.storyArc!.npcScenes.find((item) => item.status === "等待回应")!;
    const pressureBefore = game.view.storyArc!.pressure;
    game.view.worldTime!.day += 10;
    applyBeat(game, "独立冥想整理魂力", "完成一次独立冥想，没有回应在场人物。", "修炼");
    expect(game.view.storyArc?.npcScenes.find((item) => item.id === initialScene.id)?.status).toBe("已错过");
    expect(game.view.storyArc!.pressure).toBeGreaterThan(pressureBefore);

    game.view.academyApplication = { academyId: "test-academy", academyName: "测试学院", stage: "材料准备", route: "普通学员", fundingType: "家庭自费", fundingSource: "家庭", obligations: ["支付费用"], availableFundingOptions: ["家庭自费"], requirements: ["证明"], evidence: [], fee: 12, passScore: 38, admissionAssessmentName: "觉醒证明与来处查验", assessmentRequired: false };
    applyBeat(game, "申请测试学院", "测试学院登记申请与家庭费用责任，尚未录取。", "申请");
    expect(game.view.storyArc).toMatchObject({ earlyGrowthPhase: "培养路线", centralGoal: expect.stringContaining("学院、导师") });

    game.view.academyLife = { academyName: "测试学院", stage: "共同学习", className: "新生班", teacherName: "严老师", teacherRole: "学院老师", periodLabel: "入学初期", arrivalAction: "跟学院老师看过宿舍和教室", arrangementName: "课程与宿舍安排", assessmentName: "基础课程与实战检查", completionName: "完成第一阶段学院生活", dormitory: "新生宿舍", attendance: 1, courseProgress: 1, practicalProgress: 0, fundingDutyProgress: 1, peerInteractions: 0, standing: 0, discipline: 100, evidence: [], peers: [] };
    game.view.relations.push({ id: "early-teacher", name: "严老师", relation: "学院猎魂带队责任人", impression: "负责课程与首环带队边界", strength: 30, category: "师友" });
    applyBeat(game, "参加新生基础课程", "完成第一堂课程并留下出勤记录。", "学院课程");
    expect(game.view.storyArc).toMatchObject({ earlyGrowthPhase: "学院师承生活", centralConflict: expect.stringContaining("同辈") });

    game.view.hunting = { stage: "需求", ringIndex: 1, recommendations: [], preparation: [], trailProgress: "责任已确认", support: { route: "学院带队", responsibleParty: "严老师", fundingSource: "学院与家庭", authorization: "需签字", sponsorBudget: 6, sponsorSpent: 0, obligations: ["安全课"], evidence: [], status: "已确认" } };
    applyBeat(game, "确认学院首环带队", "严老师登记首环责任、预算和许可边界。", "确认猎魂责任路线");
    expect(game.view.storyArc).toMatchObject({ earlyGrowthPhase: "首环筹备", centralGoal: expect.stringContaining("第一魂环") });
    expect(game.view.storyArc?.earlyGrowthEvidence?.some((item) => item.includes("首环筹备"))).toBe(true);
    expect(game.view.storyArc?.npcScenes.find((item) => item.status === "等待回应")?.action).toContain("花费、成年同行、入林手令与撤退条件");
  });

  it("migrates old count-driven arcs to evidence gates without preserving unsupported progress", () => {
    const game = playingGame("story-arc-migration");
    const legacy = game.view.storyArc!;
    legacy.stage = "不可逆转折";
    legacy.stageIndex = 5;
    delete (legacy as Partial<typeof legacy>).stageGates;
    delete (legacy as Partial<typeof legacy>).evidenceRecords;
    delete (legacy as Partial<typeof legacy>).payoffLedger;
    delete (legacy as Partial<typeof legacy>).npcScenes;
    delete (legacy as Partial<typeof legacy>).sideThreads;
    delete (legacy as Partial<typeof legacy>).arcType;
    game.schemaVersion = 33;
    const migrated = ensureGameState(structuredClone(game));
    expect(migrated.schemaVersion).toBe(52);
    expect(migrated.view.storyArc?.stage).toBe("立局");
    expect(migrated.view.storyArc?.stageGates).toHaveLength(6);
    expect(migrated.view.storyArc?.payoffLedger.length).toBeGreaterThanOrEqual(3);
  });
});
