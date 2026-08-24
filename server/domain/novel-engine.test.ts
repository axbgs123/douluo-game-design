import { describe, expect, it } from "vitest";
import { awakenCharacter, createGame, finalizeCharacterShaping, selectCandidate, selectLifeGoal } from "./generator.js";
import { auditNovelEngineNarrative, auditResolutionAlignment, buildNovelEnginePack } from "./novel-engine.js";
import { NarrativeAuditError, NarrativeLogicPreflightError, narrateWithAuditRetries, narrateWithDeepSeek, narrativePacing, validateInterpretedAction } from "../services/deepseek.js";
import { auditNarrativeLogicPacket, buildNarrativeLogicPacket } from "./story-rules.js";
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
    const packet = buildNarrativeLogicPacket(game, "调查觉醒记录", { ...ordinaryResolution, minutes: 45, ruleSummary: "核对了主持者签名，但没有取得封存原件。" }, knowledge);
    expect(packet.version).toBe("narrative-logic.v1");
    expect(packet.protagonistContract).toMatchObject({ desire: "调查觉醒记录", action: "调查", fixedConsequence: "核对了主持者签名，但没有取得封存原件。" });
    expect(packet.continuityContract.requiredStateChanges).toContain("时间推进 45 分钟");
    expect(packet.continuityContract.forbiddenInventions).toContain("让 NPC 知道隐藏武魂、系统、未来事件或未公开身份");
    expect(packet.reactionChain.requiredTraces.at(-1)).toContain("可行动问题、责任或风险");
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

  it("routes dialogue, character, emotion and goldfinger only when relevant", () => {
    const game = awakened("novel-engine-routing");
    game.view.character!.specialSystem = { name: "残缺丹道", stage: "入门", progress: "12%", abilities: ["辨药"], resourceHint: "需要本地药材" };
    const pack = buildNovelEnginePack(game, "质问导师为什么隐瞒传承，并压住愤怒", { ...ordinaryResolution, intent: "交谈" });
    const ids = pack.activeModules.map((module) => module.id);
    expect(ids).toEqual(expect.arrayContaining(["dialogue", "character", "emotion", "goldfinger"]));
  });

  it("can be disabled without leaving hidden prompt fragments", () => {
    expect(buildNovelEnginePack(awakened("novel-engine-off"), "观察", ordinaryResolution, false)).toEqual({ enabled: false, activeModules: [], prompt: "" });
  });

  it("rejects backstage leakage, shouted emotions and cost-free cheats", () => {
    const game = awakened("novel-engine-audit");
    game.view.character!.specialSystem = { name: "因果印记", stage: "未激活", progress: "0%", abilities: [], resourceHint: "未知" };
    const pack = buildNovelEnginePack(game, "尝试激活金手指", { ...ordinaryResolution, intent: "参悟特殊体系" });
    expect(auditNovelEngineNarrative(game, "程序判定已经完成，玩家获得胜利。", pack)).toContain("正文泄露后台叙事机制");
    expect(auditNovelEngineNarrative(game, "他感到无比愤怒。", pack)).toContain("正文直接喊出情绪而没有外显");
    expect(auditNovelEngineNarrative(game, "印记从此可以毫无代价无限使用。", pack)).toContain("特殊体系被写成无代价万能能力");
    expect(auditNovelEngineNarrative(game, "印记目前不能无限使用，每次都会留下头痛。", pack)).not.toContain("特殊体系被写成无代价万能能力");
  });

  it("compresses minor actions while preserving space for consequential scenes", () => {
    const game = awakened("pacing");
    expect(narrativePacing(game, "翻找抽屉并整理旧衣", { ...ordinaryResolution, intent: "一般行动" }).kind).toBe("略写");
    expect(narrativePacing(game, "在魂环吸收中决定是否冒险", { ...ordinaryResolution, intent: "魂环吸收", ruleSummary: "这是可能重伤的重大选择" }).kind).toBe("关键");
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
