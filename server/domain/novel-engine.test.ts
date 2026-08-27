import { describe, expect, it } from "vitest";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
import { auditNovelEngineNarrative, auditResolutionAlignment, buildNovelEnginePack } from "./novel-engine.js";
import { NarrativeAuditError, NarrativeLogicPreflightError, auditCanonNarrativeVoice, buildCanonNarrativeProfile, narrateWithAuditRetries, narrateWithDeepSeek, narrativePacing, observableCanonEventsForNarration, validateInterpretedAction } from "../services/deepseek.js";
import { auditNarrativeLogicPacket, buildChineseWebnovelSceneCard, buildNarrativeLogicPacket } from "./story-rules.js";
import { buildSceneKnowledgePack } from "./scene-knowledge.js";

function awakened(seed = "novel-engine") {
  const game = createGame({ gender: "男", difficulty: "标准", seed });
  selectCandidate(game, game.view.candidates[0].id);
  const personality = game.view.shaping!.personalityOptions[0];
  finalizeCharacterShaping(game, {
    keywords: personality.keywords,
    answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])),
  });
  awakenCharacter(game);
  selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  return game;
}

const ordinaryResolution = { intent: "调查", minutes: 20, ruleSummary: "确认了屋内陈设，没有获得新物品。", fallbackNarrative: "", suggestions: ["继续观察"] };

describe("增强小说引擎", () => {
  it("rejects semantic interpretations that invent results or protected entities", () => {
    const game = awakened("semantic-boundary");
    game.view.inventory.push("武魂殿令牌");
    expect(validateInterpretedAction(game, "观察周围", "调查后已经获得武魂殿令牌")).toBe("观察周围");
    expect(validateInterpretedAction(game, "等待一天", "等待十天")).toBe("等待一天");
    expect(validateInterpretedAction(game, "询问附近的路", "攻击附近的人")).toBe("询问附近的路");
    expect(validateInterpretedAction(game, "谨慎前往诺丁城", "谨慎前往诺丁城")).toBe("谨慎前往诺丁城");
  });
  it("always loads the portable core modules without exposing author workflows", () => {
    const pack = buildNovelEnginePack(awakened(), "观察屋内", ordinaryResolution);
    expect(pack.activeModules.map((module) => module.id)).toEqual(["continuity", "world", "expand", "human", "fanfic"]);
    expect(pack.prompt).toContain("第三人称限知");
    expect(pack.prompt).not.toMatch(/投稿|番茄|第一人称|作者后台/);
    expect(pack.prompt.length).toBeLessThan(6500);
  });

  it("compiles a hard causality and continuity contract before narration", () => {
    const game = awakened("logic-preflight");
    const knowledge = buildSceneKnowledgePack(game, "调查觉醒记录");
    const packet = buildNarrativeLogicPacket(game, "调查觉醒记录", { ...ordinaryResolution, minutes: 45, ruleSummary: "看过负责觉醒的魂师留下的姓名，但没有取得原件。" }, knowledge);
    expect(packet.version).toBe("narrative-logic.v1");
    expect(packet.protagonistContract).toMatchObject({ desire: "调查觉醒记录", action: "调查", fixedConsequence: "看过负责觉醒的魂师留下的姓名，但没有取得原件。" });
    expect(packet.generationContract.requiredBeats).toHaveLength(4);
    expect(packet.generationContract.forbiddenClaims).toContain("新增未持有物品、未结算能力或未知NPC");
    expect(packet.continuityContract.requiredStateChanges).toContain("时间推进 45 分钟");
    expect(packet.continuityContract.forbiddenInventions).toContain("让 NPC 知道隐藏武魂、系统、未来事件或未公开身份");
    expect(packet.reactionChain.requiredTraces.at(-1)).toContain("不强制制造谜题");
    expect(auditNarrativeLogicPacket(packet)).toEqual([]);
  });

  it("removes NPC participants and supplies a positive scene blueprint before private-soul narration", () => {
    const game = awakened("private-generation-contract");
    const first = game.view.character!.martialSouls[0];
    game.view.character!.martialSouls = [first, { ...first, name: "太玄剑胎", category: "器武魂", sourceEra: "原创", description: "一道无锋剑形武魂，能力尚未验证。", cultivationState: "未修炼" }];
    game.view.character!.publiclyKnownMartialSoulIndices = [0];
    const resolution = { ...ordinaryResolution, intent: "私下测试隐藏武魂", ruleSummary: "独自在住处确认太玄剑胎能够短暂显形；没有NPC在场，没有新能力或灵智。" };
    const packet = buildNarrativeLogicPacket(game, "回静室单独感应太玄剑胎的状态", resolution, buildSceneKnowledgePack(game, "回静室单独感应太玄剑胎的状态"));
    expect(packet.participantContracts).toEqual([]);
    expect(packet.reactionChain.witnesses).toEqual([]);
    expect(packet.reactionChain.requiredImmediateReactions).toEqual(["本场无人旁观；玩家完成行动后秘密仍只由本人知道，不产生NPC反应"]);
    expect(packet.generationContract.sceneGoal).toContain("只完成隐藏武魂太玄剑胎");
    expect(packet.generationContract.requiredBeats).toEqual(expect.arrayContaining([expect.stringContaining("短暂显形"), expect.stringContaining("主动停止") ]));
    expect(packet.generationContract.forbiddenClaims).toEqual(expect.arrayContaining([expect.stringContaining("木匣"), expect.stringContaining("灵智"), expect.stringContaining("新魂技") ]));
    expect(packet.generationContract.originalEntityBoundary).toContain("同人原创/局外实体而非原著实体");
    expect(buildChineseWebnovelSceneCard(game, resolution)).toMatchObject({ availablePeople: [], availableInstitutions: [], unresolvedPromises: [], storyArc: undefined });
    expect(auditNarrativeLogicPacket(packet)).toEqual([]);
  });

  it("blocks narration when the preflight packet loses desire, consequence or state change", () => {
    const game = awakened("logic-preflight-block");
    const packet = buildNarrativeLogicPacket(game, "调查", ordinaryResolution, buildSceneKnowledgePack(game, "调查"));
    packet.protagonistContract.desire = "";
    packet.protagonistContract.fixedConsequence = "";
    packet.continuityContract.requiredStateChanges = [];
    expect(auditNarrativeLogicPacket(packet)).toEqual(expect.arrayContaining(["逻辑预检缺少主角当前欲望或玩家行动", "逻辑预检缺少不可改写的程序后果", "逻辑预检没有任何可追踪状态变化"]));
  });

  it("does not demand an awakening authority for an unrelated later training action", () => {
    const game = awakened("logic-preflight-unrelated-training");
    game.view.character!.innateSoulPower = 10;
    game.view.relations = game.view.relations.filter((relation) => !/觉醒|执事|主持/.test(`${relation.name}${relation.relation}${relation.impression}`));
    const packet = buildNarrativeLogicPacket(game, "与同伴训练生命防线连携", { ...ordinaryResolution, intent: "固定连携训练", minutes: 180, ruleSummary: "三人完成一轮共同训练，熟练度与疲劳已结算。" }, buildSceneKnowledgePack(game, "与同伴训练生命防线连携"));
    expect(auditNarrativeLogicPacket(packet)).not.toContain("异常事件需要制度反应，但逻辑预检找不到有权限的现场人物");
  });

  it("sends only player-known past events and never sends future event titles to narration context", () => {
    const game = awakened("observable-canon-events");
    expect(game.world.firedCanonEvents).toContain("ayin-sacrifice");
    expect(observableCanonEventsForNarration(game).some((event) => event.id === "ayin-sacrifice")).toBe(false);
    game.view.news.push({ id: "ayin-sacrifice", title: "阿银旧案已核实", detail: "可靠档案确认了阿银旧案。", date: "当前" });
    expect(observableCanonEventsForNarration(game).some((event) => event.id === "ayin-sacrifice")).toBe(true);
    expect(observableCanonEventsForNarration(game).some((event) => event.year > (game.view.worldTime?.year ?? 0))).toBe(false);
  });

  it("routes dialogue, character, emotion and goldfinger only when relevant", () => {
    const game = awakened("novel-engine-routing");
    game.view.character!.specialSystem = { name: "残缺丹道", stage: "入门", progress: "12%", abilities: ["辨药"], resourceHint: "需要本地药材" };
    const pack = buildNovelEnginePack(game, "质问导师为什么隐瞒传承，并压住愤怒", { ...ordinaryResolution, intent: "交谈" });
    const ids = pack.activeModules.map((module) => module.id);
    expect(ids).toEqual(expect.arrayContaining(["dialogue", "character", "emotion", "goldfinger"]));
  });

  it("uses era-specific lived experience instead of a generic mystery voice", () => {
    const lifeResolution = { ...ordinaryResolution, intent: "一般行动", ruleSummary: "和家人吃完晚饭，关系与疲劳状态已经结算。" };
    const profiles = ([1, 2, 3, 4] as const).map((era) => {
      const game = createGame({ era, gender: "男", difficulty: "标准", seed: `canon-prose-${era}` });
      return buildCanonNarrativeProfile(game, "回家吃饭并和家人谈今天的事", lifeResolution);
    });
    expect(profiles.map((profile) => profile.sceneMode)).toEqual(["生活成长", "生活成长", "生活成长", "生活成长"]);
    expect(profiles[0].eraTexture).toContain("家庭生计");
    expect(profiles[1].eraTexture).toContain("谋生本领");
    expect(profiles[2].eraTexture).toContain("家庭安慰");
    expect(profiles[3].eraTexture).toContain("岗位命令");
    const routine = buildCanonNarrativeProfile(awakened("routine-not-mystery"), "回家吃饭", lifeResolution);
    expect(auditCanonNarrativeVoice("桌上多了一件神秘的旧物，这又是一个新的谜团，一切都没有那么简单。", routine)).toContain("非调查场景被写成了解密或谜团推进");
    expect(auditCanonNarrativeVoice("他盯着旧纸，心想这上面记的恐怕不只是魂环。", routine)).toContain("非调查场景被写成了解密或谜团推进");
    const investigation = buildCanonNarrativeProfile(awakened("actual-mystery"), "调查失踪证据", ordinaryResolution);
    expect(auditCanonNarrativeVoice("这是一件神秘的旧物，也是一个新的谜团。", investigation)).toEqual([]);
  });

  it("does not present mature soul-spirit institutions as ordinary early-era-two life", () => {
    const game = awakened("era-two-before-soul-spirit-system");
    game.view.era = 2;
    game.view.worldTime = { era: "霍雨浩离府求学基准年", year: 10_000, day: 1, time: "08:00", season: "春" };
    expect(buildCanonNarrativeProfile(game, "参加基础课程", ordinaryResolution).eraTexture).toContain("成熟魂灵体系和传灵塔尚未成立");
    game.view.worldTime.year = 10_012;
    expect(buildCanonNarrativeProfile(game, "调查魂灵研究", ordinaryResolution).eraTexture).toContain("已经形成证据的魂灵研究");
  });

  it("can be disabled without leaving hidden prompt fragments", () => {
    expect(buildNovelEnginePack(awakened("novel-engine-off"), "观察", ordinaryResolution, false)).toEqual({ enabled: false, activeModules: [], prompt: "" });
  });

  it("rejects backstage leakage, shouted emotions and cost-free cheats", () => {
    const game = awakened("novel-engine-audit");
    game.view.character!.specialSystem = { name: "因果印记", stage: "未激活", progress: "0%", abilities: [], resourceHint: "未知" };
    const pack = buildNovelEnginePack(game, "尝试激活金手指", { ...ordinaryResolution, intent: "参悟特殊体系" });
    expect(auditNovelEngineNarrative(game, "程序判定已经完成，玩家获得胜利。", pack)).toContain("正文泄露后台叙事机制");
    expect(auditNovelEngineNarrative(game, "主角赢下训练后，系统替两人宣布成为朋友。", pack)).toContain("正文泄露后台叙事机制");
    expect(auditNovelEngineNarrative(game, "他感到无比愤怒。", pack)).toContain("正文直接喊出情绪而没有外显");
    expect(auditNovelEngineNarrative(game, "印记从此可以毫无代价无限使用。", pack)).toContain("特殊体系被写成无代价万能能力");
    expect(auditNovelEngineNarrative(game, "印记目前不能无限使用，每次都会留下头痛。", pack)).not.toContain("特殊体系被写成无代价万能能力");
  });

  it("rejects replacing a private hidden-soul test with an NPC cultivation meeting", () => {
    const resolution = { ...ordinaryResolution, intent: "私下测试隐藏武魂", ruleSummary: "独自在住处测试太玄剑胎，没有NPC在场。" };
    expect(auditResolutionAlignment("他刚准备测试，门外弟子便来传话，请他去议事堂定培养方案。", resolution)).toContain("私下测试被擅自改成NPC传唤或培养会议");
    expect(auditResolutionAlignment("他关好门，独自让太玄剑胎短暂显形，记住重量后立刻收回。", resolution)).toEqual([]);
    expect(auditResolutionAlignment("他关好门，独自感应太玄剑胎，睁眼后记起下午议事堂还有已经安排好的议事。", resolution, "回静室单独感应太玄剑胎的状态")).toEqual([]);
    expect(auditResolutionAlignment("他完成感应后便前往议事堂，长老当场召见了他。", resolution, "回静室单独感应太玄剑胎的状态")).toEqual(expect.arrayContaining(["独处或保密行动被无依据的NPC来访、传唤或会议打断", "私下测试被擅自改成NPC传唤或培养会议"]));
    expect(auditResolutionAlignment("他独自感应剑胎时想起长老早先说过的话，随后收回魂力。", resolution, "回静室单独感应太玄剑胎的状态")).toEqual([]);
    expect(auditResolutionAlignment("太玄剑胎忽然回应了他的魂力，又传来一阵拒绝与警告。", resolution, "回静室单独感应太玄剑胎的状态")).toContain("正文凭空赋予隐藏武魂灵智或主动意志");
    expect(auditResolutionAlignment("太玄剑胎没有回应，只在魂力靠近时显出冰凉触感。", resolution, "回静室单独感应太玄剑胎的状态")).not.toContain("正文凭空赋予隐藏武魂灵智或主动意志");
    const vineResolution = { ...resolution, ruleSummary: "独自在住处确认隐藏武魂霜纹藤确实能够显形；没有灵智或新能力。" };
    expect(auditResolutionAlignment("霜纹藤主动回应了他的呼唤，显露出择主意志。", vineResolution, "独自感应霜纹藤")).toContain("正文凭空赋予隐藏武魂灵智或主动意志");
    expect(auditResolutionAlignment("他把养剑木匣放到桌边，独自测试武魂。", resolution)).toContain("正文为私下测试凭空增加未持有物品");
    const ownedGame = awakened("owned-private-test-items");
    ownedGame.view.inventory.push("养剑木匣");
    ownedGame.view.character!.martialSouls[0].description = "初醒时呈无锋剑胚形态。";
    expect(auditResolutionAlignment("他把养剑木匣放在身边，确认无锋剑胚形态后收回武魂。", resolution, "独自测试武魂", ownedGame)).not.toContain("正文为私下测试凭空增加未持有物品");
    expect(auditResolutionAlignment("他独自取出备用水晶，再次复测先天魂力。", resolution)).toContain("正文重复已经完成的觉醒复测");
    expect(auditResolutionAlignment("他独自翻阅密密麻麻的记录，确认收放与承载都已达到上限。", resolution)).toContain("正文凭空补造程序未结算的精确测试结论");
  });

  it("protects player action ownership across ordinary action families", () => {
    expect(auditResolutionAlignment("门外忽然有人敲门，请他去议事堂。", ordinaryResolution, "独自在屋里测试新能力"))
      .toEqual(expect.arrayContaining(["正文没有出现玩家测试或试用行动的可见执行证据", "独处或保密行动被无依据的NPC来访、传唤或会议打断"]));
    expect(auditResolutionAlignment("他关好门，试着催动那股力量，确认能够收回后才停下。", ordinaryResolution, "独自在屋里测试新能力")).toEqual([]);
    const delayed = `${"他被叫去议事堂听众人商量培养方案。".repeat(14)}回屋以后，他才试着催动那股力量。`;
    expect(auditResolutionAlignment(delayed, ordinaryResolution, "测试新能力")).toContain("玩家行动直到正文后半段才出现，前文已被其他剧情抢占");
    expect(auditResolutionAlignment("他问清费用后，又决定前往议事堂。", ordinaryResolution, "询问本月食宿费用"))
      .toContain("正文替玩家作出了程序结果之后的新增重大决定");
    expect(auditResolutionAlignment("他问清本月食宿要花多少钱，没有替自己决定下一步。", ordinaryResolution, "询问本月食宿费用")).toEqual([]);
    expect(auditResolutionAlignment("两家从公开议题中选择优先项，再分别核验来源。", ordinaryResolution, "让媒体联盟共同核验优先议题")).toEqual([]);
  });

  it("rejects newly invented local authority figures and original-soul mechanics", () => {
    const game = awakened("semantic-invention-audit");
    game.view.character!.martialSouls[0] = { ...game.view.character!.martialSouls[0], name: "先天道体", sourceEra: "局外", description: "对相容修炼体系有较高理解力，但必须逐级修炼。" };
    const general = { ...ordinaryResolution, intent: "一般行动", ruleSummary: "完成当前能力范围内的一般行动，没有获得确定性奖励。" };
    expect(auditResolutionAlignment("齐长老说先天道体吃根基，根基越厚，魂环品质就越高。", general, "询问测试结果", game))
      .toEqual(expect.arrayContaining(["正文凭空增加未登记人物齐长老", "正文为原创或局外武魂补造程序未声明的能力规律"]));
    expect(auditResolutionAlignment("闻九只让他按已经确认的方法收回先天道体，没有补充新的能力结论。", general, "练习收放", game)).toEqual([]);
  });

  it("compresses minor actions while preserving space for consequential scenes", () => {
    const game = awakened("pacing");
    expect(narrativePacing(game, "翻找抽屉并整理旧衣", { ...ordinaryResolution, intent: "一般行动" }).kind).toBe("略写");
    expect(narrativePacing(game, "在魂环吸收中决定是否冒险", { ...ordinaryResolution, intent: "魂环吸收", ruleSummary: "这是可能重伤的重大选择" }).kind).toBe("关键");
    expect(narrativePacing(game, "回住处单独测试第二武魂", { ...ordinaryResolution, intent: "私下测试隐藏武魂" }).target).toBe("500至850字");
  });

  it("rejects fluent prose that ignores an accountable historical result", () => {
    expect(auditResolutionAlignment("他在屋里安静等过了一天。", { ...ordinaryResolution, intent: "提交历史权益主张" })).toContain("正文没有呈现历史权益受理");
    expect(auditResolutionAlignment("受理员核过送达名册，收下费用并签出待审回单。", { ...ordinaryResolution, intent: "提交历史权益主张" })).toEqual([]);
    expect(auditResolutionAlignment("裁定只承认档案查阅权，没有移交旧产权。", { ...ordinaryResolution, intent: "参加历史权益听证" })).toEqual([]);
    expect(auditResolutionAlignment("他租下今天的铺面，付清启动款，为新主体登记。", { ...ordinaryResolution, intent: "投资成立当代新主体" })).toEqual([]);
    expect(auditResolutionAlignment("两家编辑把一个议题排到最前，另一个因人力不足延后。", { ...ordinaryResolution, intent: "设置媒体联盟议程" })).toEqual([]);
    expect(auditResolutionAlignment("他在屋里安静等过了一天。", { ...ordinaryResolution, intent: "媒体联盟共同核验" })).toContain("正文没有呈现联盟共同核验");
    expect(auditResolutionAlignment("更正编号保留在修复页，两名编辑各有独立复核栏。", { ...ordinaryResolution, intent: "登记媒体联盟修复计划" })).toEqual([]);
    expect(auditResolutionAlignment("他们只是重新开会。", { ...ordinaryResolution, intent: "媒体联盟受限恢复" })).toContain("正文没有呈现联盟受限恢复");
    expect(auditResolutionAlignment("资源室核对新调查和双编辑复核后，只补回一枚核验签。", { ...ordinaryResolution, intent: "补充媒体联盟核验资源" })).toEqual([]);
    expect(auditResolutionAlignment("第三家机构只进入候选准入栏，责任编辑和来源边界另页登记。", { ...ordinaryResolution, intent: "登记第三媒体联盟候选" })).toEqual([]);
    expect(auditResolutionAlignment("大家同意一起工作。", { ...ordinaryResolution, intent: "批准第三媒体加入联盟" })).toContain("正文没有呈现第三媒体准入结果");
    expect(auditResolutionAlignment("退出申请进入复核栏，旧责任和共享资源都没有被带走。", { ...ordinaryResolution, intent: "登记媒体联盟成员退出" })).toEqual([]);
    expect(auditResolutionAlignment("成员退出后转入历史责任栏，人数不足使共享资源冻结。", { ...ordinaryResolution, intent: "批准媒体联盟成员退出" })).toEqual([]);
    expect(auditResolutionAlignment("替补只进入候选栏，等待独立调查。", { ...ordinaryResolution, intent: "登记媒体联盟替补候选" })).toEqual([]);
    expect(auditResolutionAlignment("替补经分别复核后准入，旧成员历史责任仍保留。", { ...ordinaryResolution, intent: "批准替补媒体加入联盟" })).toEqual([]);
  });

  it("automatically regenerates with the previous audit reasons", async () => {
    const game = awakened("automatic-regeneration");
    const guidance: string[][] = [];
    const narrator = (async (_game: typeof game, _input: string, _resolution: typeof ordinaryResolution, _signal?: AbortSignal, retryGuidance: string[] = []) => {
      guidance.push(retryGuidance);
      if (guidance.length < 3) throw new NarrativeAuditError([guidance.length === 1 ? "时间线错误" : "人物知情越界"]);
      return { narrative: "他把能确认的事情记了下来。", suggestions: ["继续调查", "询问家人", "检查地图"] };
    }) as typeof narrateWithDeepSeek;
    const retries: number[] = [];
    const result = await narrateWithAuditRetries(game, "调查", ordinaryResolution, undefined, (attempt) => retries.push(attempt), narrator);
    expect(result?.narrative).toContain("记了下来");
    expect(retries).toEqual([2, 3]);
    expect(guidance[1]).toEqual(["时间线错误"]);
    expect(guidance[2]).toEqual(["人物知情越界"]);
  });

  it("does not spend retries when deterministic logic preflight fails", async () => {
    const game = awakened("logic-preflight-no-retry");
    const attempts: number[] = [];
    const narrator = (async () => { throw new NarrativeLogicPreflightError(["缺少权限人"]); }) as typeof narrateWithDeepSeek;
    await expect(narrateWithAuditRetries(game, "调查", ordinaryResolution, undefined, (attempt) => attempts.push(attempt), narrator)).rejects.toBeInstanceOf(NarrativeLogicPreflightError);
    expect(attempts).toEqual([]);
  });
});
