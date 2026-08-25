import { randomUUID } from "node:crypto";
import type { StoryArchiveView, StoryConsequenceView } from "../../shared/game.js";
import { CANON_CHARACTERS, FACTIONS, factionActiveAtYear } from "../data/world.js";
import { rulesForEra, type FanfictionRule } from "../data/fanfiction-rules.js";
import type { ActionResolution, StoredGame } from "./model.js";
import type { SceneKnowledgePack } from "./scene-knowledge.js";
import { storyArcSuggestions } from "./story-director.js";

const BASE_SECTIONS = [5, 18, 53, 69, 70, 93, 94, 97, 100];

const ACTION_SECTION_ROUTES: Array<[RegExp, number[]]> = [
  [/猎魂|魂兽|魂环|吸收/, [27, 28, 29, 30, 40, 41, 43, 85]],
  [/攻击|战斗|防御|闪避|逃跑|弱点/, [31, 38, 39, 40, 91, 92]],
  [/修炼|冥想|闭关|突破/, [25, 26, 37, 38, 40, 57, 58]],
  [/问|交谈|打听|拜访|告诉/, [18, 53, 61, 63, 64, 66, 68, 69, 70]],
  [/调查|搜索|观察|研究|线索/, [7, 18, 54, 59, 86, 95]],
  [/前往|旅行|出发|赶路/, [11, 17, 18, 20, 94]],
  [/入学|学院|课程|比赛/, [16, 62, 63, 71, 82, 83]],
  [/加入|投靠|宗门|武魂殿|唐门|势力/, [71, 72, 73, 74, 75, 77, 78, 79, 80, 87]],
  [/传承|炼丹|炼器|异界|修仙|血脉|双生|武魂进化/, [22, 24, 35, 36, 37, 38, 39, 40, 50, 55, 56, 57]],
  [/购买|工作|赚钱|物品|资源/, [13, 14, 20, 57]],
  [/介入|事件|承诺|履行|帮助|阻止/, [59, 68, 70, 81, 86, 87, 88, 89, 93, 95]],
];

const FUTURE_TECH_BY_ERA: Record<1 | 2 | 3 | 4, RegExp | undefined> = {
  1: /斗铠|机甲|星舰|宇宙飞船|传灵塔|升灵台|定装魂导炮|魂导汽车/,
  2: /斗铠|星舰|宇宙飞船|传灵塔|升灵台/,
  3: /星舰|宇宙飞船|天龙星|天马星/,
  4: undefined,
};
const EXTERNAL_POWER = /查克拉|魔力|灵力|仙力|斗气|念能力|恶魔果实|斩魄刀|修仙功法|御剑术/;

function worldDate(game: StoredGame): string {
  const time = game.view.worldTime;
  if (!time) return "时间未定";
  return `${time.era} · 第${time.day}日 ${time.time}`;
}

function impossible(game: StoredGame, reason: string, suggestions: string[], ruleIds: number[]): ActionResolution {
  const name = game.view.character?.name ?? "角色";
  return {
    intent: "规则阻止",
    minutes: 5,
    ruleSummary: reason,
    fallbackNarrative: `${name}在脑中把需要的条件过了一遍，很快停住。眼下连第一步都没有。${reason}`,
    suggestions,
    appliedRuleIds: ruleIds,
  };
}

export function guardActionByStoryRules(game: StoredGame, action: string): ActionResolution | undefined {
  const year = game.view.worldTime?.year ?? 0;
  const name = game.view.character?.name ?? "角色";
  const age = game.view.character?.age ?? 6;
  const mentionedFactions = FACTIONS.filter((faction) => action.includes(faction.name));
  const hasActiveMention = mentionedFactions.some((faction) => factionActiveAtYear(faction, year));
  const futureFaction = !hasActiveMention ? mentionedFactions.find((faction) => faction.activeFromYear !== undefined && year < faction.activeFromYear) : undefined;
  if (futureFaction) {
    return impossible(game, `${futureFaction.name}在当前年代尚未成立，角色也没有能够接触该组织的当世线索。`, ["核对当前年代", "调查现存的相近势力", "把注意力放回当前组织"], [451, 461, 931, 935]);
  }
  const expiredFaction = !hasActiveMention ? mentionedFactions.find((faction) => !factionActiveAtYear(faction, year)) : undefined;
  if (expiredFaction) {
    return impossible(game, `${expiredFaction.name}已经不再以这个组织形态存在，角色只能调查遗址、史料或后继势力。`, ["调查该势力的历史", "寻找当前时代的后继组织", "核对当地公开势力"], [451, 461, 931, 935]);
  }
  if (age < 18 && /性行为|发生关系|圆房|成人关系|露骨|强迫.*亲密/.test(action)) {
    return impossible(game, `${name}目前仍是未成年人。童年阶段只处理友情、依赖、朦胧情感与正常成长，不进行成人化情节。`, ["与对方正常交谈", "确认彼此边界", "把注意力放回当前生活"], [621, 631, 691]);
  }
  if (age < 18 && /结婚|成婚|求婚|订婚|成为伴侣|确认恋爱|组建家庭|生育|收养孩子/.test(action)) {
    return impossible(game, `${name}的年龄、法律身份和社会权限不足以完成婚姻决定。`, ["表达珍视但不作成人承诺", "与家人或导师交谈", "等年龄与关系成熟后再决定"], [621, 631, 691]);
  }
  if ((game.view.era ?? 1) === 1 && /记者|责任编辑|编辑部|媒体联盟|新闻机构|报社|报刊|报纸|新闻台/.test(action)) {
    return impossible(game,
      "斗一时代没有这些后世新闻机构与职业。公开消息只能依靠地方告示、当面转述、商旅带话或所属势力通告，而且传播速度和可信度都受见证链限制。",
      ["追查最初的见证者", "请地方管事张贴具名告示", "向所属势力提交有凭据的通告"],
      [451, 461, 691, 931],
    );
  }
  if (/^(?:先)?(?:试探一下(?:他|她|对方)?|处理一下|想办法|采取行动|随便做点准备)[。！]?$/u.test(action) && (game.view.combat || game.world.dynamicEvents.some((event) => event.status === "可介入"))) {
    return impossible(game, "这句话在当前情境下可能代表多种后果差异很大的做法，程序不能替玩家选择风险和底线。", ["保持距离，用言语试探", "先调查对方掌握的情报", "明确说明自己的目标与退路"], [681, 691, 921]);
  }
  const futureTech = FUTURE_TECH_BY_ERA[game.view.era ?? 1];
  if (futureTech?.test(action)) {
    const researchOnly = /调查|研究|设想|查资料|寻找遗迹/.test(action);
    if (!researchOnly) return impossible(game,
      `这些成熟技术尚未出现在当前时代。${name}可以追查早期魂导遗物或提出设想，不能直接制造、购买或使用成品。`,
      ["调查附近的魂导遗物", "询问储物魂导器的来历", "先记录这个设想"],
      [451, 461, 481, 751],
    );
  }

  if ((game.view.era ?? 1) === 1 && /魂灵/.test(action) && !/调查|研究|设想|残魂|契约/.test(action)) {
    return impossible(game,
      "魂灵体系在这个时代尚未诞生。若要尝试，必须先找到灵魂、契约和承载方面的证据。",
      ["调查魂兽残魂", "研究魂环中的精神残留", "寻找懂灵魂的导师"],
      [431, 433, 436, 440],
    );
  }

  const canonSpiritAscensionEnergy = (game.view.era ?? 1) >= 3 && /升灵台.{0,10}灵力|灵力.{0,10}升灵台/.test(action);
  if (EXTERNAL_POWER.test(action) && !canonSpiritAscensionEnergy && !game.view.character?.specialSystem && !/调查|研究|寻找|追查|验证|回忆/.test(action)) {
    return impossible(game,
      `${name}目前没有对应传承，不能凭一句行动直接获得外来力量。先寻找来源，才能判断它会被压制、转化还是彻底失效。`,
      ["调查自己的异常征兆", "寻找可能的传承线索", "先修炼现有武魂"],
      [491, 492, 493, 499],
    );
  }

  if (/瞬移|传送到|撕开空间|一步跨越/.test(action) && !/空间|虚空/.test(`${game.view.character?.martialSouls?.map((soul) => `${soul.name}${soul.description}`).join("、") ?? game.view.character?.martialSoul.name ?? ""}${game.view.character?.specialSystem?.abilities.join("、") ?? ""}`)) {
    return impossible(game,
      `${name}没有空间类能力，远距离移动仍要经过路线、时间和途中风险。`,
      ["查看地图", "准备旅费和干粮", "寻找可靠的车队"],
      [165, 166, 168, 932],
    );
  }

  if (year < 14 && /加入唐门|前往唐门|唐门总部|拜访唐门/.test(action)) {
    return impossible(game,
      `当前大陆上还没有公开存在的唐门组织。${name}手里也没有能证明其存在的当世线索。`,
      ["调查大陆上的暗器传闻", "打听新兴魂师组织", "继续眼前计划"],
      [115, 176, 535, 935],
    );
  }

  const directContact = /拜访|拜师|拜.*为师|见到|交谈|询问|告诉|攻击|杀|跟随|寻找/.test(action);
  if (directContact) {
    const npc = Object.values(game.world.npcs).find((item) => action.includes(item.name));
    const definition = npc ? CANON_CHARACTERS.find((item) => item.id === npc.id) : undefined;
    const hasIdentityEvidence = definition ? game.world.intelligenceRecords.some((record) => record.subjectType === "人物" && record.subjectId === definition.id && record.confidence >= 60) || game.world.canonCausalFootprints.some((cause) => cause.affectedNpcIds.includes(definition.id)) : false;
    if (definition?.hidden && npc && npc.name === definition.name && !npc.knownToPlayer && !hasIdentityEvidence) {
      return impossible(game,
        `${name}无法确认这个名字对应现实中的哪一个人，更不能据此直接接触或攻击目标。`,
        ["调查名字的来源", "寻找两条独立证据", "把传闻暂时标为未证实"],
        [18, 53, 54, 66, 69, 931],
      );
    }
    if (definition && npc && !npc.alive) {
      return impossible(game,
        `${name}在当前年代找不到${npc.name}真实存在的线索，不能直接与其见面或交谈。`,
        ["核对当前年代", "调查同名传闻", "把注意力放回身边的人"],
        [13, 66, 931, 935],
      );
    }
  }

  if (/^(我|角色)?(获得|拥有|掌握|觉醒|捡到).*(神器|神位|第二武魂|十万年魂环|百万年魂环)/.test(action)) {
    return impossible(game,
      "玩家可以尝试寻找或争取机缘，不能直接宣布获得结果。来源、承载条件和代价都要经过游戏结算。",
      ["调查对应机缘的来源", "确认自身承载能力", "寻找能够验证传闻的人"],
      [220, 246, 267, 493, 498, 544],
    );
  }
  return undefined;
}

export function selectNarrativeRules(game: StoredGame, action: string, resolution: ActionResolution): FanfictionRule[] {
  const sections = new Set(BASE_SECTIONS);
  for (const [pattern, routed] of ACTION_SECTION_ROUTES) if (pattern.test(`${action} ${resolution.intent}`)) for (const section of routed) sections.add(section);
  const year = game.view.worldTime?.year ?? 0;
  const era = game.view.era ?? 1;
  const all = rulesForEra(era).filter((rule) => {
    if (era === 1 && /海神阁|联邦议会|星际联邦|圣灵教/.test(rule.text)) return false;
    if ([44, 45, 46, 47, 48, 49, 76].includes(rule.section) && !/(魂灵|魂导|斗铠|机甲|锻造|星舰|传灵塔|升灵台|遗迹)/.test(action)) return false;
    if (rule.section === 73 && year < 12 && !/唐门|暗器|玄天功/.test(action)) return false;
    return true;
  });
  const selected: FanfictionRule[] = [];
  for (const section of sections) {
    const pool = all.filter((rule) => rule.section === section);
    if (!pool.length) continue;
    const take = BASE_SECTIONS.includes(section) ? 1 : 2;
    const start = (game.actionIndex + section) % pool.length;
    for (let index = 0; index < Math.min(take, pool.length); index += 1) selected.push(pool[(start + index) % pool.length]);
  }
  return selected.slice(0, 36);
}

export function violatesCanonChronology(text: string, year: number): boolean {
  const compact = text.replace(/\s+/g, "");
  if (year < 6) {
    const earlyShrekNames = "唐三|小舞|宁荣荣|朱竹清";
    if (new RegExp(`(${earlyShrekNames}).{0,28}(进入|去了|就读|加入|学员).{0,8}史莱克`).test(compact)) return true;
    if (new RegExp(`史莱克.{0,28}(${earlyShrekNames}).{0,12}(学员|入学|就读)`).test(compact)) return true;
  }
  if (year < 8 && /(全大陆高级魂师学院精英大赛|魂师大赛).{0,20}(已经|夺冠|结束|决赛)/.test(compact)) return true;
  if (year < 12 && /(唐门).{0,12}(已经建立|成立|宗主|总部|弟子招募)/.test(compact)) return true;
  const era = year >= 25_000 ? 4 : year >= 15_000 ? 3 : year >= 5_000 ? 2 : 1;
  const unavailableTechnology = era === 1
    ? "斗铠|机甲|星舰|宇宙飞船|传灵塔|升灵台|定装魂导炮|魂导汽车|记者|责任编辑|编辑部|媒体联盟|新闻机构|报社|报刊|报纸|新闻台|媒体报道"
    : era === 2
      ? `斗铠|星舰|宇宙飞船|升灵台${year < 10_012 ? "|传灵塔" : ""}`
      : era === 3
        ? "星舰|宇宙飞船|天龙星|天马星"
        : undefined;
  if (unavailableTechnology) {
    const technology = unavailableTechnology;
    const useClaim = new RegExp(`(${technology}).{0,18}(已经|建成|成立|驾驶|装备|购买|启动|投入使用|列装|制造成功|就在眼前)`);
    const reverseClaim = new RegExp(`(驾驶|装备|购买|启动|乘坐|进入).{0,12}(${technology})`);
    if (useClaim.test(compact) || reverseClaim.test(compact)) return true;
  }
  return false;
}

function narrationOutsideDialogue(text: string): string {
  return text.split(/([“「『][\s\S]*?[”」』])/g).filter((_part, index) => index % 2 === 0).join("");
}

function parseNumberToken(token: string): number {
  if (/^\d+$/.test(token)) return Number(token);
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (token.includes("百")) {
    const [hundreds, rest = ""] = token.split("百");
    return (digits[hundreds] ?? 1) * 100 + (rest ? parseNumberToken(rest.replace(/^零/, "")) : 0);
  }
  if (token.includes("十")) {
    const [tens, ones] = token.split("十");
    return (tens ? digits[tens] ?? 0 : 1) * 10 + (ones ? digits[ones] ?? 0 : 0);
  }
  return digits[token] ?? Number.NaN;
}

export function auditNarrative(game: StoredGame, text: string): string[] {
  const issues: string[] = [];
  const outside = narrationOutsideDialogue(text);
  if (/(^|[。！？\n])\s*我/.test(outside) || /我的/.test(outside)) issues.push("正文出现第一人称叙述");
  if (/(^|[。！？\n])\s*(首先|其次|最后)[，,:：]|值得注意的是|这意味着|本质上|总而言之|综上所述|不是.{0,18}而是/.test(text)) issues.push("正文含有模板化表达");
  if (violatesCanonChronology(text, game.view.worldTime?.year ?? 0)) issues.push("正文违反当前时代或原作时间线");
  for (const npc of Object.values(game.world.npcs)) {
    const escapedName = npc.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rankClaims = [
      ...text.matchAll(new RegExp(`${escapedName}.{0,12}?([零一二三四五六七八九十百两\\d]{1,4})级`, "g")),
      ...text.matchAll(new RegExp(`([零一二三四五六七八九十百两\\d]{1,4})级.{0,12}?${escapedName}`, "g")),
    ];
    for (const claim of rankClaims) {
      const rank = parseNumberToken(claim[1]);
      const publicPower = game.view.knownFigures.find((figure) => figure.id === npc.id)?.knownPower;
      if (npc.soulRank === undefined || Math.abs(rank - npc.soulRank) > 3 || publicPower !== `${rank} 级`) {
        issues.push(`正文提前泄露或写错${npc.name}在当前年份的魂力`);
        break;
      }
    }
    const ageClaim = text.match(new RegExp(`${escapedName}.{0,8}?([零一二三四五六七八九十百两\\d]{1,4})岁`));
    if (ageClaim && (npc.age === undefined || parseNumberToken(ageClaim[1]) !== npc.age)) issues.push(`正文写错${npc.name}在当前年份的年龄`);
    const definition = CANON_CHARACTERS.find((item) => item.id === npc.id);
    if (definition && npc.alive) {
      const reliableIdentityText = game.world.intelligenceRecords.filter((record) => record.subjectType === "人物" && record.subjectId === npc.id && record.confidence >= 85 && record.status === "确定" && /交叉核验|身份核验|密档/.test(record.source)).map((record) => `${record.title}${record.detail}`).join("；");
      const futureNames = [definition.name, ...definition.aliases].filter((name, index, all) => name !== npc.name && all.indexOf(name) === index && !reliableIdentityText.includes(name));
      if (futureNames.some((name) => text.includes(name))) issues.push(`正文提前使用${npc.name}尚未公开的后期姓名、称号或身份`);
      const currentFactions = new Set(npc.factionIds);
      const unavailableFactions = definition.factionIds.filter((id) => !currentFactions.has(id)).map((id) => FACTIONS.find((faction) => faction.id === id)?.name).filter((name): name is string => Boolean(name));
      if (unavailableFactions.some((faction) => new RegExp(`${escapedName}.{0,24}${faction}|${faction}.{0,24}${escapedName}`).test(text))) issues.push(`正文提前写入${npc.name}尚未形成的势力归属`);
    }
  }
  if ((text.match(/！/g)?.length ?? 0) >= 5) issues.push("正文依赖连续感叹号制造强度");
  if (/先天满魂力|水晶球.{0,20}(?:冲到顶|完全亮起)/.test(text) && !/停笔|复测|上报|登记|招揽|议论|围观|惊|愣|僵|变色|叫停/.test(text)) {
    issues.push("异常觉醒结果没有引发主持者、监护者或围观者的具体反应");
  }
  if (text.length > 4800) issues.push("单次正文过长");
  return issues;
}

const GENERIC_SUGGESTION = /^(?:查看地图|查看新事件|观察周围|继续行动|想办法|保持谨慎|深入了解|进一步探索|先做准备|暂时退开|了解情况|把眼前的事情做完|回应身边正在等的人|转去推进当前人生目标)[。！]?$/;

function normalizedSuggestion(value: string): string {
  return value.replace(/[，。！？、；：\s]/g, "").replace(/^(?:先|尝试|主动|立即|继续)/, "");
}

function publicAndHiddenSoulNames(game: StoredGame): { publicNames: string[]; hiddenNames: string[] } {
  const souls = game.view.character?.martialSouls ?? [];
  const publicIndices = new Set(game.view.character?.publiclyKnownMartialSoulIndices ?? (souls.length ? [0] : []));
  return {
    publicNames: souls.filter((_, index) => publicIndices.has(index)).map((soul) => soul.name),
    hiddenNames: souls.filter((_, index) => !publicIndices.has(index)).map((soul) => soul.name),
  };
}

function leaksUnavailableKnowledge(game: StoredGame, suggestion: string): boolean {
  const { hiddenNames } = publicAndHiddenSoulNames(game);
  if (hiddenNames.some((name) => suggestion.includes(name)) && /告诉|询问|请教|展示|公开|上报|登记|交给|向/.test(suggestion)) return true;
  const knownNames = new Set([
    ...game.view.knownFigures.map((figure) => figure.name),
    ...game.view.relations.map((relation) => relation.name),
  ]);
  const unknownCanonFigure = CANON_CHARACTERS.find((figure) =>
    (suggestion.includes(figure.name) || figure.aliases.some((alias) => suggestion.includes(alias))) && !knownNames.has(figure.name),
  );
  return Boolean(unknownCanonFigure);
}

function isNearDuplicate(left: string, right: string): boolean {
  const a = normalizedSuggestion(left);
  const b = normalizedSuggestion(right);
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const intent = (value: string) => /询问|追问|请教|打听/.test(value) ? "问" : /测试|召唤|验证|检查|复测/.test(value) ? "测" : /隐藏|保密|暂不|隐瞒/.test(value) ? "藏" : /加入|接受|签署|答应/.test(value) ? "投" : "";
  return Boolean(intent(a) && intent(a) === intent(b) && (a.length < 12 || b.length < 12));
}

export function groundedNarrativeSuggestions(game: StoredGame): string[] {
  const character = game.view.character;
  if (!character) return [];
  const awakeningTask = game.view.tasks.find((task) => task.status !== "完成" && /觉醒|培养评估|亲自复核/.test(`${task.id}${task.title}${task.detail}`));
  if (game.view.status === "awakening" || game.view.status === "life_goal_selection" || awakeningTask) {
    const awakeningRelation = game.view.relations.find((relation) => /觉醒主持|觉醒/.test(`${relation.relation}${relation.impression}`));
    const faction = awakeningRelation?.faction;
    const { publicNames, hiddenNames } = publicAndHiddenSoulNames(game);
    const mainSoul = publicNames[0] ?? character.martialSoul.name;
    const originText = `${character.originName}${character.originSummary}${character.knownBackground}${character.originBurden}`;
    const unbound = /凭空|异界|无户籍|没有亲人|无牵无挂|来历不明/.test(originText);
    const guardian = game.view.relations.find((relation) => relation.category === "亲属" || /父|母|祖|养父|养母|监护|叔|婶/.test(relation.relation));
    const era = game.view.era ?? 1;
    const growth = character.innateSoulPower >= 10
      ? "请主持者用备用水晶复测魂力"
      : ({ 1: "请主持者说明第一魂环的适配方向", 2: "请主持者复测魂力与武魂特征", 3: "请传灵师确认魂力与魂师班资格", 4: "请主持者完成魂力测试并登记觉醒结果" } as const)[era];
    const guardianPlan = guardian ? ({
      1: `和${guardian.name}商量学院名额、路费与猎魂帮助`,
      2: `和${guardian.name}商量学院报名、食宿与第一魂环`,
      3: `把觉醒结果告诉${guardian.name}，确认魂师班与后续魂灵费用`,
      4: `和${guardian.name}确认魂力测试、入学与档案范围`,
    } as const)[era] : ({
      1: "追问工读名额、路费与猎魂协助",
      2: "询问学院报名、住处与第一魂环帮助",
      3: "询问魂师班报到时间与后续魂灵费用",
      4: "询问魂力测试、入学安排与档案权限",
    } as const)[era];
    const institution = unbound
      ? "请主持者先落实临时身份和今晚住处"
      : faction
        ? `听完${faction}的培养条件再表态`
        : guardianPlan;
    const secret = hiddenNames.length
      ? "暂不显露第二武魂，回住处后单独测试"
      : character.innateSoulPower >= 7 || ["传奇", "神话"].includes(character.martialSoul.grade ?? "平凡")
        ? "请求主持者暂缓外传武魂细节"
        : era === 4 ? "暂缓外传异常细节，先完成魂力测试" : `回住处练习${mainSoul}的收放与魂力消耗`;
    return [growth, institution, secret];
  }
  if (game.view.combat) return ["拉开距离观察对手起手", "利用地形掩护侧翼", "保留退路试探一次弱点"];
  if (game.view.hunting && game.view.hunting.stage !== "完成") {
    const target = game.view.hunting.targetName ?? "目标魂兽";
    return [`核对${target}留下的踪迹`, "检查退路、药物与吸收准备", "向同行者确认撤退暗号"];
  }
  const systemAction = character.specialSystem?.actions?.[0]?.command;
  const currentStep = game.view.chapterObjective?.steps.find((step) => step.status === "进行中");
  const activeTask = game.view.tasks.find((task) => task.status !== "完成");
  return [
    systemAction,
    currentStep ? currentStep.text : undefined,
    activeTask ? `处理「${activeTask.title}」的下一项具体条件` : undefined,
  ].filter((item): item is string => Boolean(item));
}

export function buildChineseWebnovelSceneCard(game: StoredGame, resolution: ActionResolution): Record<string, unknown> {
  const { publicNames, hiddenNames } = publicAndHiddenSoulNames(game);
  return {
    immediateProblem: game.view.chapterObjective?.title ?? resolution.intent,
    currentStep: game.view.chapterObjective?.steps.find((step) => step.status === "进行中")?.text,
    availablePeople: game.view.relations.slice(0, 12).map(({ name, relation, faction }) => ({ name, relation, faction })),
    availableInstitutions: [...new Set([...game.view.affiliations.map((item) => item.name), ...game.view.relations.map((item) => item.faction).filter(Boolean)])],
    publicFacts: { martialSouls: publicNames, soulPower: game.view.character?.innateSoulPower, location: game.view.location },
    protagonistSecrets: { hiddenMartialSouls: hiddenNames, specialSystem: game.view.character?.specialSystem?.name },
    unresolvedPromises: game.storyMemory.openThreads.slice(0, 8),
    storyArc: game.view.storyArc ? { title: game.view.storyArc.title, stage: game.view.storyArc.stage, goal: game.view.storyArc.centralGoal, conflict: game.view.storyArc.centralConflict, opposingForce: game.view.storyArc.opposingForce, payoff: game.view.storyArc.promisedPayoff, payoffLedger: game.view.storyArc.payoffLedger, nextGate: game.view.storyArc.stageGates[game.view.storyArc.stageIndex + 1], activeNpcScene: game.view.storyArc.npcScenes.find((scene) => scene.status === "等待回应"), sideThreads: game.view.storyArc.sideThreads, irreversibleTurn: game.view.storyArc.irreversibleTurn, pressure: game.view.storyArc.pressure } : undefined,
    reactionChain: ["谁目击", "谁有权限", "谁获益或受损", "立即反应", "留下何种记录、关系或代价"],
    choiceVectors: ["成长或资源", "关系或势力", "秘密或风险"],
    deterministicSuggestions: storyArcSuggestions(game),
  };
}

export interface NarrativeLogicPacket {
  version: "narrative-logic.v1";
  stateVersion: string;
  constraintsVersion: string;
  canonAnchor: {
    era: 1 | 2 | 3 | 4;
    year: number;
    day: number;
    location: string;
    publicIdentity: string;
    publicMartialSouls: string[];
    hiddenMartialSouls: string[];
    relevantCausalFootprints: string[];
  };
  protagonistContract: {
    desire: string;
    availableInformation: Array<{ name: string; fact: string; source: string }>;
    authority: string;
    resources: string[];
    action: string;
    fixedConsequence: string;
  };
  participantContracts: Array<{
    name: string;
    desire: string;
    knownFrom: string[];
    knowledgeLimit: string;
    authority: string;
    reactionObligation: string;
  }>;
  reactionChain: {
    witnesses: string[];
    authorityHolders: string[];
    interestsAtStake: string[];
    requiredImmediateReactions: string[];
    requiredTraces: string[];
    sceneScaleRule: string;
  };
  continuityContract: {
    requiredStateChanges: string[];
    preserveExactly: string[];
    forbiddenInventions: string[];
    openThreads: string[];
  };
}

function relationAuthority(relation: StoredGame["view"]["relations"][number]): string {
  if (/宗主|长老|院长|教委|执事|官|主审|复核|监护|父|母|师/.test(`${relation.relation}${relation.name}`)) return `${relation.relation}可在职责范围内处理或上报`;
  return `${relation.relation}只能表达立场、提供亲历信息或提出请求`;
}

export function buildNarrativeLogicPacket(game: StoredGame, playerInput: string, resolution: ActionResolution, sceneKnowledge: SceneKnowledgePack): NarrativeLogicPacket {
  const { publicNames, hiddenNames } = publicAndHiddenSoulNames(game);
  const onSceneNpcs = Object.values(game.world.npcs).filter((npc) => npc.alive && npc.knownToPlayer && npc.locationId === game.view.locationId);
  const knowledgeByNpc = new Map(sceneKnowledge.entries.filter((entry) => entry.kind === "人物").map((entry) => [entry.name, entry]));
  const participantRelations = game.view.relations.filter((relation) => onSceneNpcs.some((npc) => npc.name === relation.name) || knowledgeByNpc.has(relation.name));
  const awakeningRelation = game.view.relations.find((relation) => /觉醒主持|觉醒魂师|主持觉醒/.test(`${relation.relation}${relation.impression}`));
  if (awakeningRelation && !participantRelations.includes(awakeningRelation)) participantRelations.push(awakeningRelation);
  const activeNpcScene = game.view.storyArc?.npcScenes.find((scene) => scene.status === "等待回应");
  const activeSceneRelation = activeNpcScene && game.view.relations.find((relation) => relation.name === activeNpcScene.npcName);
  if (activeSceneRelation && !participantRelations.includes(activeSceneRelation)) participantRelations.push(activeSceneRelation);
  const participants = participantRelations.slice(0, 12).map((relation) => {
    const npc = onSceneNpcs.find((item) => item.name === relation.name);
    const knowledge = knowledgeByNpc.get(relation.name);
    const plan = npc?.activePlan;
    return {
      name: relation.name,
      desire: plan?.desire ?? npc?.currentGoal ?? (/监护|父|母/.test(relation.relation) ? "先保证孩子安全，再决定能承担多少培养代价" : `${relation.relation}会先维护自己的职责、利益与风险边界`),
      knownFrom: [knowledge ? `${knowledge.reason}：${knowledge.fact}` : undefined, ...(plan?.informationBoundary ?? []), ...(npc?.episodicMemory.slice(-3).map((item) => `${item.witnessed ? "亲历" : item.source}：${item.text}`) ?? [])].filter((item): item is string => Boolean(item)).slice(0, 8),
      knowledgeLimit: `只能使用亲历、可靠转述、已登记情报和当前公开的${publicNames.join("、") || "武魂信息"}；不得知道隐藏武魂、系统或未来事件`,
      authority: plan?.authority ?? relationAuthority(relation),
      reactionObligation: plan ? `当前正准备“${plan.nextAction}”；主角触及其欲望、责任或资源时，必须调整计划并留下动作、台词、拒绝、上报或记录` : "主角行动触及其利益、职责或已知关系时，必须给出动作、台词、拒绝、上报或记录中的至少一种反应",
    };
  });
  const authorityHolders = participants.filter((item) => /可在职责范围内|可以主持|可以影响|可以执行/.test(item.authority)).map((item) => item.name);
  const exceptionalAwakening = Boolean(game.view.character && game.view.character.innateSoulPower >= 10 && (game.view.status === "awakening" || /觉醒|满魂力|复测|培养条件|主持者/.test(`${playerInput}${resolution.intent}${resolution.ruleSummary}`)));
  const requiredImmediateReactions = exceptionalAwakening
    ? ["现场主持者复测或核对记录", "有权限者登记并决定上报范围", "监护或所属势力讨论培养条件、安置与代价"]
    : participants.length ? ["利益或职责被触及的在场人物作出具体反应"] : ["没有可用见证者时，不得凭空制造远方人物反应"];
  const requiredStateChanges = [
    resolution.minutes > 0 ? `时间推进 ${resolution.minutes} 分钟` : undefined,
    resolution.systemMessages?.length ? `留下程序凭据：${resolution.systemMessages.join("；")}` : undefined,
    /失败|阻止|受伤|消耗|失去/.test(resolution.ruleSummary) ? "保留失败、消耗、伤势或被阻止的后果" : undefined,
    /获得|完成|加入|提升|确认|登记/.test(resolution.ruleSummary) ? "保留已经结算的收益、进度、身份或记录" : undefined,
  ].filter((item): item is string => Boolean(item));
  const resources = [
    `魂力：${game.view.character?.soulRank ?? 0}级`,
    `魂币：${game.view.character?.coins ?? 0}`,
    `位置：${game.view.location ?? "未知"}`,
    `随身物品：${game.view.inventory.slice(0, 8).join("、") || "无"}`,
    game.view.combat ? `战斗状态：${game.view.combat.playerCondition}` : undefined,
    game.view.hunting ? `猎魂阶段：${game.view.hunting.stage}` : undefined,
  ].filter((item): item is string => Boolean(item));
  return {
    version: "narrative-logic.v1",
    stateVersion: `schema-${game.schemaVersion}:revision-${game.revision}:action-${game.actionIndex}`,
    constraintsVersion: `era-${game.view.era}:canon-year-${game.view.worldTime?.year ?? 0}`,
    canonAnchor: {
      era: game.view.era ?? 1,
      year: game.view.worldTime?.year ?? 0,
      day: game.view.worldTime?.day ?? 1,
      location: game.view.location ?? "未知地点",
      publicIdentity: `${game.view.character?.name ?? "角色"}；${game.view.character?.originName ?? "身份未定"}`,
      publicMartialSouls: publicNames,
      hiddenMartialSouls: hiddenNames,
      relevantCausalFootprints: game.world.canonCausalFootprints.filter((item) => (item.expiresOrdinal ?? Number.POSITIVE_INFINITY) >= (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1) && (item.source !== "历史分支结算" || game.view.canonInfluences.some((view) => view.id === item.id))).slice(-8).map((item) => item.description),
    },
    protagonistContract: {
      desire: playerInput.trim(),
      availableInformation: sceneKnowledge.entries.map((entry) => ({ name: entry.name, fact: entry.fact, source: entry.reason })),
      authority: /无法完成|规则阻止/.test(resolution.intent) ? "本次行动没有满足程序门槛，只能经历被拒绝或失败" : "只能执行玩家提出且程序已经结算的行动，不能越过下一项重大选择",
      resources,
      action: resolution.intent,
      fixedConsequence: resolution.ruleSummary,
    },
    participantContracts: participants,
    reactionChain: {
      witnesses: [...new Set([...onSceneNpcs.map((npc) => npc.name), ...participants.map((item) => item.name)])],
      authorityHolders,
      interestsAtStake: [...new Set(participantRelations.map((relation) => `${relation.name}：${relation.faction ?? relation.relation}的职责、利益、关系或风险`))],
      requiredImmediateReactions,
      requiredTraces: [...requiredStateChanges, "正文结尾落在本次生活变化上：可以是成长回报、关系变化、情绪余波、下一步目标或风险，不强制制造谜题"],
      sceneScaleRule: participants.length >= 3 ? `本场至少有${participants.length}名重要在场者，不得在中段塌缩成只有主角与一名 NPC 的双人对白` : "保持实际在场人数；不得凭空增减见证者",
    },
    continuityContract: {
      requiredStateChanges,
      preserveExactly: [resolution.ruleSummary, `worldTime=${game.view.worldTime?.year ?? 0}年${game.view.worldTime?.day ?? 1}日`, `location=${game.view.location ?? "未知"}`],
      forbiddenInventions: ["改变胜负、时间、伤势、物品、魂力、关系或任务状态", "让 NPC 知道隐藏武魂、系统、未来事件或未公开身份", "替玩家完成结果之后的新决定", "遗漏已在场的重要人物使场景规模悄悄缩小"],
      openThreads: game.storyMemory.openThreads.slice(0, 8),
    },
  };
}

export function auditNarrativeLogicPacket(packet: NarrativeLogicPacket): string[] {
  const issues: string[] = [];
  if (!packet.protagonistContract.desire.trim()) issues.push("逻辑预检缺少主角当前欲望或玩家行动");
  if (!packet.protagonistContract.action.trim()) issues.push("逻辑预检缺少程序动作");
  if (!packet.protagonistContract.fixedConsequence.trim()) issues.push("逻辑预检缺少不可改写的程序后果");
  if (!packet.canonAnchor.location.trim() || packet.canonAnchor.location === "未知地点") issues.push("逻辑预检缺少当前地点");
  if (packet.canonAnchor.publicMartialSouls.some((name) => packet.canonAnchor.hiddenMartialSouls.includes(name))) issues.push("公开武魂与隐藏武魂边界冲突");
  if (!packet.continuityContract.requiredStateChanges.length) issues.push("逻辑预检没有任何可追踪状态变化");
  if (/至少有(\d+)名/.test(packet.reactionChain.sceneScaleRule) && packet.reactionChain.witnesses.length < Number(packet.reactionChain.sceneScaleRule.match(/至少有(\d+)名/)?.[1] ?? 0)) issues.push("多人场景的见证者与参与者数量不一致");
  if (packet.reactionChain.requiredImmediateReactions.some((item) => /主持者|有权限者/.test(item)) && !packet.reactionChain.authorityHolders.length) issues.push("异常事件需要制度反应，但逻辑预检找不到有权限的现场人物");
  return issues;
}

export function sanitizeNarrativeSuggestions(game: StoredGame, suggestions: string[], fallback: string[]): string[] {
  const sanitize = (items: string[]) => items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.length > 28 ? item.slice(0, 28) : item)
    .filter((item) => !violatesCanonChronology(item, game.view.worldTime?.year ?? 0))
    .filter((item) => !/直接获得|必定成功|保证成功|无代价|立刻成神/.test(item))
    .filter((item) => !/指出第一处缺陷/.test(item))
    .filter((item) => !GENERIC_SUGGESTION.test(item))
    .filter((item) => !leaksUnavailableKnowledge(game, item));
  const tactical = Boolean(game.view.combat || (game.view.hunting && game.view.hunting.stage !== "完成"));
  const opening = game.actionIndex === 0 && game.view.tasks.some((task) => task.status !== "完成" && /觉醒|培养评估|亲自复核/.test(`${task.id}${task.title}${task.detail}`));
  const arcSuggestions = sanitize(storyArcSuggestions(game));
  const grounded = sanitize(groundedNarrativeSuggestions(game));
  const ordered = tactical || opening ? [...grounded, ...arcSuggestions, ...sanitize(fallback), ...sanitize(suggestions)] : [...arcSuggestions, ...sanitize(suggestions), ...sanitize(fallback), ...grounded];
  const result: string[] = [];
  for (const item of ordered) {
    if (result.some((existing) => isNearDuplicate(existing, item))) continue;
    result.push(item);
    if (result.length === 3) break;
  }
  return result;
}

function consequenceTone(result: ActionResolution): StoryConsequenceView["tone"] {
  if (/失败|受伤|死亡|袭击|危险|阻止/.test(`${result.intent}${result.ruleSummary}`)) return "危险";
  if (/获得|提升|成功|完成|加入|拜师/.test(result.ruleSummary)) return "收获";
  if (/历史|偏差|承诺|选择|事件/.test(`${result.intent}${result.ruleSummary}`)) return "转折";
  return "普通";
}

export function recordStoryConsequence(game: StoredGame, action: string, result: ActionResolution): void {
  const archive = game.view.storyArchive;
  archive.recentConsequences.unshift({ id: randomUUID(), action: action.slice(0, 80), result: result.ruleSummary.slice(0, 180), date: worldDate(game), tone: consequenceTone(result) });
  archive.recentConsequences = archive.recentConsequences.slice(0, 24);
  if (result.intent !== "无法完成" && result.intent !== "规则阻止") {
    const meaningful = /加入|拜师|承诺|袭击|介入|魂环|突破|入学/.test(`${result.intent}${action}`);
    if (meaningful) game.storyMemory.keyChoices = [...game.storyMemory.keyChoices, `${worldDate(game)}，${action.slice(0, 100)}`].slice(-20);
    const line = `${game.view.character?.name ?? "角色"}${result.ruleSummary.replace(/^完成/, "完成了")}`;
    game.storyMemory.summary = `${game.storyMemory.summary} ${line}`.trim().slice(-2200);
  }
  const completed = new Set(game.view.tasks.filter((task) => task.status === "完成").map((task) => task.title));
  game.storyMemory.openThreads = [...new Set([
    ...game.view.tasks.filter((task) => task.status !== "完成").map((task) => task.title),
    ...game.storyMemory.openThreads.filter((thread) => !completed.has(thread)),
  ])].slice(0, 12);
  game.view.chapter.summary = game.storyMemory.summary.slice(-260);
  refreshStoryArchive(game);
}

export function refreshStoryArchive(game: StoredGame): StoryArchiveView {
  const current = game.view.storyArchive ?? { summary: "", openThreads: [], keyChoices: [], recentConsequences: [], continuity: [], localConsequences: [] };
  const time = game.view.worldTime;
  const causal = game.world.canonCausalFootprints.length;
  current.summary = game.storyMemory.summary;
  current.openThreads = [...new Set([...game.storyMemory.openThreads, ...game.view.tasks.filter((task) => task.status !== "完成").map((task) => task.title)])].slice(0, 12);
  current.keyChoices = game.storyMemory.keyChoices.slice(-12).reverse();
  const currentOrdinal = (time?.year ?? 0) * 360 + (time?.day ?? 1);
  current.localConsequences = game.world.localConsequences.filter((item) => item.status === "生效中" && item.locationId === game.view.locationId).map((item) => ({ id: item.id, kind: item.kind, summary: item.summary, magnitude: item.magnitude, remainingDays: Math.max(0, item.expiresOrdinal - currentOrdinal) })).slice(-12).reverse();
  current.continuity = [
    ...(game.view.storyArc ? [{ label: "本卷", detail: `${game.view.storyArc.stage} · ${game.view.storyArc.centralGoal} · 压力${game.view.storyArc.pressure}`, status: game.view.storyArc.pressure >= 70 ? "留意" as const : game.view.storyArc.stageIndex >= 4 ? "变化" as const : "稳定" as const }] : []),
    ...(game.view.storyArc?.stageGates[game.view.storyArc.stageIndex + 1] ? [{ label: "阶段门槛", detail: game.view.storyArc.stageGates[game.view.storyArc.stageIndex + 1].requirement, status: "留意" as const }] : []),
    ...(game.view.storyArc?.payoffLedger.some((item) => item.status !== "已兑现") ? [{ label: "兑现债务", detail: game.view.storyArc.payoffLedger.filter((item) => item.status !== "已兑现").slice(0, 2).map((item) => item.label).join("；"), status: "留意" as const }] : []),
    ...(game.view.storyArc?.npcScenes.some((item) => item.status === "等待回应") ? [{ label: "主动来人", detail: game.view.storyArc.npcScenes.find((item) => item.status === "等待回应")!.action, status: "变化" as const }] : []),
    { label: "年代", detail: time ? `${worldDate(game)}，角色${game.view.character?.age ?? 6}岁` : "尚未正式进入时间线", status: "稳定" },
    { label: "原作", detail: causal ? `已有${causal}条主角因果记录，相关节点可能变化` : "主角尚未触及关键因果，原作照常推进", status: causal ? "变化" : "稳定" },
    { label: "线索", detail: current.openThreads.length ? `${current.openThreads.length}件事仍未解决` : "眼前没有未决线索", status: current.openThreads.length >= 8 ? "留意" : "稳定" },
    { label: "地方后果", detail: game.world.localConsequences.filter((item) => item.status === "生效中").length ? `${game.world.localConsequences.filter((item) => item.status === "生效中").length}项错过事件后果仍在改变供需、治安、关系或势力` : "当前没有持续生效的地方事件后果", status: game.world.localConsequences.some((item) => item.status === "生效中" && item.magnitude >= 4) ? "变化" : game.world.localConsequences.some((item) => item.status === "生效中") ? "留意" : "稳定" },
    { label: "状态", detail: game.view.character ? `${game.view.character.condition}，${game.view.character.fatigue}` : "等待武魂觉醒", status: /重伤|濒死|死亡/.test(game.view.character?.condition ?? "") ? "留意" : "稳定" },
  ];
  game.view.storyArchive = current;
  return current;
}
