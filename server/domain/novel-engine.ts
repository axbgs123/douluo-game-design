import type { ActionResolution, StoredGame } from "./model.js";

export type NovelModuleId = "continuity" | "world" | "expand" | "human" | "dialogue" | "fanfic" | "goldfinger" | "character" | "emotion";

export interface NovelEnginePack {
  enabled: boolean;
  activeModules: Array<{ id: NovelModuleId; reason: string }>;
  prompt: string;
}

const MODULE_RULES: Record<NovelModuleId, string[]> = {
  continuity: [
    "人物行为必须由既有性格、动机、关系和当前处境支撑，不能为推进剧情突然降智或转性。",
    "钱、物品、魂力、伤势、位置、身份暴露、承诺和关系只能按程序结果变化；正文不得暗增暗减。",
    "谁知道什么必须服从情报来源与知情记录；模型知道、作者知道不等于角色知道。",
    "伤势、疲劳、毒、瓶颈和倒计时要连续存在，除非程序结果明确处理。",
    "战力表现服从当前等级、魂环、能力、地形和程序胜负；禁止用气势或临场顿悟改写结果。",
    "相对时间必须落回 worldTime；人物年龄、季节、旅行距离和原作节点不得前后漂移。",
  ],
  world: [
    "世界数据库是唯一事实来源。力量、势力、政治、货币、地理和历史规则不能临时改口。",
    "人物行动受地点、路程、权限、资源、法律与势力范围限制；不能跳过旅行、门禁或准备。",
    "冲突应从当前世界状态自然长出；环境只写会影响行动、情绪或判断的具体部分。",
    "世界会因已记录的行动改变，但没有玩家因果足迹时，原作关键节点保持既定惯性。",
  ],
  expand: [
    "只写本次程序结果覆盖的场景，不补写结果之后的新决定，不替玩家推进下一项重大行动。",
    "正文从正在发生的动作、声音或触感切入；用动作、对话、心理和环境交替推进。",
    "采用第三人称限知，贴着主角当下可感知、可回忆、可推断的范围；换视角必须另起明确场景。",
    "段落长短和句长要有变化，重要处放慢，普通赶路与重复劳动压缩。",
    "结尾停在新的局面、问题或可行动处，不写作者总结、规则说明或强行升华。",
    "跑腿、翻找、重复询问、普通训练步骤和无风险手续合并概述；一个次要行动最多保留一个有效细节。",
    "建议应推进到下一项有意义的调查、关系、修炼或势力决定，不要连续推荐‘再观察一下、再问一句、再检查一次’。",
  ],
  human: [
    "保留一点不体面、迟疑、误判或没说完的话，让人物像活人，但不能借此替玩家作重大决定。",
    "次要情绪与关系可以留白，主线因果和程序结果必须清楚。",
    "避免每个人都做最理性、最周全、最礼貌的反应；微小反应应符合既有性格证据。",
    "不把每段都解释成完整闭环，不用旁白替人物总结人生道理。",
  ],
  dialogue: [
    "每句台词至少承担推进、试探、遮掩、冲突或关系表达中的一种作用，避免闲聊式复述设定。",
    "根据年龄、身份、教育、阵营和性格区分句长、用词、礼貌程度与回避方式。",
    "允许打断、答非所问、半句话和潜台词；不要让所有人用同一种完整书面腔。",
    "情绪优先由台词选择和一个动作表现，少用‘愤怒地说’之类副词。",
  ],
  fanfic: [
    "原作人物保留核心经历、能力架构、利益与人格惯性；偏移必须能追溯到玩家真实造成的因果。",
    "原创人物、势力、道具与功法可以出现，但必须嵌入斗罗力量、资源、地理和政治结构。",
    "不得提前使用未来时代组织、技术、称号和事件结果；不得把读者的原作知识塞给本地角色。",
    "不复述或拼接原著段落，只围绕当前玩家行动写原创场景。",
    "当前时代的社会会对异常天赋作出制度性反应：先天高魂力、满魂力、顶级或多生武魂应引起当代家族、学院、宗门或官方机构的登记、招揽、试探与保护，而不是只得到一句惊叹。",
  ],
  goldfinger: [
    "特殊体系和金手指只能放大主角的选择与努力，不能替主角自动完成目标。",
    "能力必须有当前阶段、承载条件、资源消耗、风险或代价，不能一句话解锁万能效果。",
    "外来体系先受斗罗世界压制并逐步适配；未被程序解锁的能力只可作为猜测或失败尝试。",
    "新能力的成长必须与既有来源、实验、修炼或主线谜团相连。",
  ],
  character: [
    "主要人物要保留自己的目标、底线、偏见和主动性；NPC不是只等主角触发的功能按钮。",
    "关系变化必须由本次具体言行引起，并符合既有亲近、信任、敬重、戒备和利益。",
    "人物第一次有效登场时，用身份、与事件的关系和一个可记忆细节完成锚定，避免档案式介绍。",
    "反派与竞争者也会评估风险、利用资源和拒绝不利请求，不能只为送经验而行动。",
  ],
  emotion: [
    "情绪用一到两个准确的神态、动作、生理反应、物件或潜台词表现，不堆满五感。",
    "避免直接写‘他很愤怒、她感到无比悲伤、内心充满震惊’，让读者从表现中判断。",
    "情绪承接上一段和关系轨迹；剧烈跳变必须有本次事件作为过渡。",
    "克制不等于无情，爆发也不能抹掉年龄、身份、伤势与现场后果。",
  ],
};

function addModule(modules: Map<NovelModuleId, string>, id: NovelModuleId, reason: string): void {
  if (!modules.has(id)) modules.set(id, reason);
}

export function buildNovelEnginePack(game: StoredGame, playerInput: string, resolution: ActionResolution, enabled = true): NovelEnginePack {
  if (!enabled) return { enabled: false, activeModules: [], prompt: "" };
  const scene = `${playerInput} ${resolution.intent} ${resolution.ruleSummary}`;
  const modules = new Map<NovelModuleId, string>();
  addModule(modules, "continuity", "每次行动都要守住时间、资源、知情、伤势和战力连续性");
  addModule(modules, "world", "斗罗世界状态与原作因果是场景边界");
  addModule(modules, "expand", "把程序结果写成第三人称限知场景");
  addModule(modules, "human", "减少说明书感并保留自然留白");
  addModule(modules, "fanfic", "当前作品是受原作架构约束的互动同人");

  if (/问|说|交谈|对话|谈判|争辩|威胁|请求|拜访|承诺|拒绝|导师|家人/.test(scene)) addModule(modules, "dialogue", "场景包含人物交锋或信息交换");
  if (/人物|关系|朋友|同伴|家人|导师|拜师|背叛|敌人|反派|宗门|势力|加入|离开/.test(scene)) addModule(modules, "character", "行动会检验人物动机或改变关系");
  if (/伤|死|复活|害怕|愤怒|悲伤|委屈|震惊|失望|亲密|告别|背叛|牺牲|失败/.test(scene)) addModule(modules, "emotion", "场景存在需要外显而非直说的情绪变化");
  if (game.view.character?.specialSystem || /金手指|系统|传承|修仙|异界|血脉|吞噬|复制|模拟|签到|空间|功法|炼丹|炼器|阵法/.test(scene)) addModule(modules, "goldfinger", "行动涉及特殊体系、外来力量或成长捷径");

  const activeModules = [...modules].map(([id, reason]) => ({ id, reason }));
  const prompt = [
    "内部小说引擎已启用。以下内容只约束写法，不得出现在正文中，也不得覆盖 fixedRuleResult。",
    ...activeModules.flatMap(({ id }) => [`[${id}]`, ...MODULE_RULES[id].map((rule) => `- ${rule}`)]),
  ].join("\n");
  return { enabled: true, activeModules, prompt };
}

function narrationOutsideDialogue(text: string): string {
  return text.split(/([“][\s\S]*?[”])/g).filter((_part, index) => index % 2 === 0).join("");
}

export function auditNovelEngineNarrative(game: StoredGame, text: string, pack: NovelEnginePack): string[] {
  if (!pack.enabled) return [];
  const issues: string[] = [];
  const outside = narrationOutsideDialogue(text);
  if (/(玩家|程序判定|固定结果|规则包|小说引擎|写作模块|语言模型|AI|技能)/i.test(outside)) issues.push("正文泄露后台叙事机制");
  if (/[✦✨◆●▪★◇❖➤]/.test(text)) issues.push("正文含有装饰符号");
  if (/(他|她|\S{1,4})(感到|感觉到|内心充满|心中涌起)(非常|无比|极其|十分)?(愤怒|悲伤|痛苦|震惊|失望|委屈|喜悦)/.test(outside)) issues.push("正文直接喊出情绪而没有外显");
  if (/生活总是|人生就是|命运总会|这是一个.{0,12}的时代/.test(outside)) issues.push("正文出现空泛升华");
  if ((pack.activeModules.some((module) => module.id === "goldfinger")) && /(?:从此|现在|已经|可以|能够|变得).{0,12}(?:毫无代价|无需任何代价|无条件使用|无限使用|立刻掌握全部|自动完成)/.test(text)) issues.push("特殊体系被写成无代价万能能力");
  if (game.view.character && new RegExp(`${game.view.character.name}.{0,16}(替玩家|自行决定重大选择)`).test(outside)) issues.push("正文替玩家作出重大决定");
  return issues;
}

export function auditResolutionAlignment(text: string, resolution: ActionResolution): string[] {
  const requiredByIntent: Array<[RegExp, RegExp, string]> = [
    [/核验旧世档案/, /档案|目录|谱牒|账册|记录|证据|印记|年代/, "正文没有呈现旧世档案核验"],
    [/调查当代权属/, /登记|权属|产权|旧址|现权利|保管人/, "正文没有呈现当代权属调查"],
    [/提交历史权益主张/, /受理|提交|主张|送达|公示|费用|待审/, "正文没有呈现历史权益受理"],
    [/参加历史权益听证/, /听证|审理|裁定|承认|驳回|异议/, "正文没有呈现听证裁定"],
    [/投资成立当代新主体/, /投资|登记|新主体|新社|铺面|场地|启动/, "正文没有呈现当代投资与新设主体"],
    [/提议跨地区媒体联盟/, /联盟|提案|共同议题|异地查证/, "正文没有呈现媒体联盟提案"],
    [/启动媒体核验联盟/, /联盟|试运行|共享|签字|核验资源/, "正文没有呈现媒体联盟启动"],
    [/设置媒体联盟议程/, /优先|排期|延后|议题/, "正文没有呈现媒体议程取舍"],
    [/媒体联盟共同核验/, /共同核验|查证|回函|签收|共享资源/, "正文没有呈现联盟共同核验"],
  ];
  const requirement = requiredByIntent.find(([intent]) => intent.test(resolution.intent));
  return requirement && !requirement[1].test(text) ? [requirement[2]] : [];
}
