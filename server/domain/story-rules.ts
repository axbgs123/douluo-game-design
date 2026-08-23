import { randomUUID } from "node:crypto";
import type { StoryArchiveView, StoryConsequenceView } from "../../shared/game.js";
import { CANON_CHARACTERS, FACTIONS } from "../data/world.js";
import { rulesForEra, type FanfictionRule } from "../data/fanfiction-rules.js";
import type { ActionResolution, StoredGame } from "./model.js";

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
  const futureFaction = FACTIONS.find((faction) => faction.activeFromYear !== undefined && year < faction.activeFromYear && action.includes(faction.name));
  if (futureFaction) {
    return impossible(game, `${futureFaction.name}在当前年代尚未成立，角色也没有能够接触该组织的当世线索。`, ["核对当前年代", "调查现存的相近势力", "把注意力放回当前组织"], [451, 461, 931, 935]);
  }
  const expiredFaction = FACTIONS.find((faction) => faction.activeUntilYear !== undefined && year > faction.activeUntilYear && action.includes(faction.name));
  if (expiredFaction) {
    return impossible(game, `${expiredFaction.name}已经不再以这个组织形态存在，角色只能调查遗址、史料或后继势力。`, ["调查该势力的历史", "寻找当前时代的后继组织", "核对当地公开势力"], [451, 461, 931, 935]);
  }
  if (age < 18 && /性行为|发生关系|圆房|成人关系|露骨|强迫.*亲密/.test(action)) {
    return impossible(game, `${name}目前仍是未成年人。童年阶段只处理友情、依赖、朦胧情感与正常成长，不进行成人化情节。`, ["与对方正常交谈", "确认彼此边界", "把注意力放回当前生活"], [621, 631, 691]);
  }
  if (age < 16 && /结婚|成婚|求婚/.test(action)) {
    return impossible(game, `${name}的年龄、法律身份和社会权限不足以完成婚姻决定。`, ["表达珍视但不作成人承诺", "与家人或导师交谈", "等年龄与关系成熟后再决定"], [621, 631, 691]);
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

  if (EXTERNAL_POWER.test(action) && !game.view.character?.specialSystem && !/调查|研究|寻找|追查|验证|回忆/.test(action)) {
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

  if (year < 12 && /加入唐门|前往唐门|唐门总部|拜访唐门/.test(action)) {
    return impossible(game,
      `当前大陆上还没有公开存在的唐门组织。${name}手里也没有能证明其存在的当世线索。`,
      ["调查大陆上的暗器传闻", "打听新兴魂师组织", "继续眼前计划"],
      [115, 176, 535, 935],
    );
  }

  const directContact = /拜访|拜师|拜.*为师|见到|交谈|询问|告诉|攻击|杀|跟随|寻找/.test(action);
  if (directContact) {
    const definition = CANON_CHARACTERS.find((item) => action.includes(item.name) || item.aliases.some((alias) => action.includes(alias)));
    const npc = definition ? game.world.npcs[definition.id] : undefined;
    const hasIdentityEvidence = definition ? game.world.intelligenceRecords.some((record) => record.subjectType === "人物" && record.subjectId === definition.id && record.confidence >= 60) || game.world.canonCausalFootprints.some((cause) => cause.affectedNpcIds.includes(definition.id)) : false;
    if (definition?.hidden && npc && !npc.knownToPlayer && !hasIdentityEvidence) {
      return impossible(game,
        `${name}无法确认这个名字对应现实中的哪一个人，更不能据此直接接触或攻击目标。`,
        ["调查名字的来源", "寻找两条独立证据", "把传闻暂时标为未证实"],
        [18, 53, 54, 66, 69, 931],
      );
    }
    if (definition && npc && !npc.alive) {
      return impossible(game,
        `${name}在当前年代找不到${definition.name}真实存在的线索，不能直接与其见面或交谈。`,
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
  if (year < 10_000) {
    const technology = "斗铠|机甲|星舰|宇宙飞船|传灵塔|升灵台|定装魂导炮|魂导汽车";
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
  if (/首先|其次|最后|值得注意的是|这意味着|本质上|总而言之|综上所述|不是.{0,18}而是/.test(text)) issues.push("正文含有模板化表达");
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
  }
  if ((text.match(/！/g)?.length ?? 0) >= 5) issues.push("正文依赖连续感叹号制造强度");
  if (text.length > 4800) issues.push("单次正文过长");
  return issues;
}

export function sanitizeNarrativeSuggestions(game: StoredGame, suggestions: string[], fallback: string[]): string[] {
  const safe = suggestions
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !violatesCanonChronology(item, game.view.worldTime?.year ?? 0))
    .filter((item) => !/直接获得|必定成功|无代价|立刻成神/.test(item));
  return [...new Set([...safe, ...fallback])].slice(0, 3);
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
  const current = game.view.storyArchive ?? { summary: "", openThreads: [], keyChoices: [], recentConsequences: [], continuity: [] };
  const time = game.view.worldTime;
  const causal = game.world.canonCausalFootprints.length;
  current.summary = game.storyMemory.summary;
  current.openThreads = [...new Set([...game.storyMemory.openThreads, ...game.view.tasks.filter((task) => task.status !== "完成").map((task) => task.title)])].slice(0, 12);
  current.keyChoices = game.storyMemory.keyChoices.slice(-12).reverse();
  current.continuity = [
    { label: "年代", detail: time ? `${worldDate(game)}，角色${game.view.character?.age ?? 6}岁` : "尚未正式进入时间线", status: "稳定" },
    { label: "原作", detail: causal ? `已有${causal}条主角因果记录，相关节点可能变化` : "主角尚未触及关键因果，原作照常推进", status: causal ? "变化" : "稳定" },
    { label: "线索", detail: current.openThreads.length ? `${current.openThreads.length}件事仍未解决` : "眼前没有未决线索", status: current.openThreads.length >= 8 ? "留意" : "稳定" },
    { label: "状态", detail: game.view.character ? `${game.view.character.condition}，${game.view.character.fatigue}` : "等待武魂觉醒", status: /重伤|濒死|死亡/.test(game.view.character?.condition ?? "") ? "留意" : "稳定" },
  ];
  game.view.storyArchive = current;
  return current;
}
