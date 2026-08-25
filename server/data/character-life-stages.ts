export interface CharacterLifeStageDefinition {
  characterId: string;
  validFromYear: number;
  validFromDay?: number;
  validUntilYear?: number;
  validUntilDay?: number;
  publicName: string;
  currentGoal: string;
  publicFactionIds: string[];
}

const stage = (characterId: string, validFromYear: number, publicName: string, currentGoal: string, publicFactionIds: string[] = [], validUntilYear?: number, validFromDay = 1, validUntilDay = 360): CharacterLifeStageDefinition => ({ characterId, validFromYear, validFromDay, validUntilYear, validUntilDay, publicName, currentGoal, publicFactionIds });

export const CHARACTER_LIFE_STAGES: CharacterLifeStageDefinition[] = [
  stage("tang-san", -6, "唐三", "与父亲在圣魂村生活，完成力所能及的家务与自身基础练习", [], -1),
  stage("tang-san", 0, "唐三", "在诺丁学院学习、修炼武魂并处理父亲离开后留下的问题", [], 6, 1, 19),
  stage("tang-san", 6, "唐三", "与史莱克同伴共同训练，准备真实战斗与魂环成长", ["shrek"], 12, 20),
  stage("tang-san", 13, "唐三", "追查父母旧事、面对昊天宗关系并保护已经建立的同伴", ["shrek", "clear-sky"], 13),
  stage("tang-san", 14, "唐三", "建立唐门现实班底，同时承担亲友、宗门与大陆冲突带来的责任", ["shrek", "clear-sky", "tang-sect"]),
  stage("tang-hao", -6, "唐昊", "在带伤隐居状态下保护唐三，并隐藏会危及孩子的旧案信息", []),

  stage("huo-yuhao", 9989, "霍雨浩", "在白虎公爵府边缘生活，积累离开与独立生存所需的能力", [], 9999),
  stage("huo-yuhao", 10000, "霍雨浩", "离开公爵府后先求生、寻找魂师成长机会并确认自己的道路", [], 10000, 1, 14),
  stage("huo-yuhao", 10000, "霍雨浩", "履行刚刚建立的唐门关系，并争取进入史莱克学习的现实资格", ["peerless-tang-sect"], 10000, 15, 29),
  stage("huo-yuhao", 10000, "霍雨浩", "以史莱克外院新生与唐门成员身份学习、考核并建立同伴关系", ["peerless-tang-sect", "shrek-era2-academy"], 10005, 30),
  stage("huo-yuhao", 10006, "霍雨浩", "承担史莱克重点学生与唐门成员的修炼、同伴和外部危机责任", ["peerless-tang-sect", "shrek-inner-court"], 10011),
  stage("huo-yuhao", 10012, "霍雨浩", "在战争压力下推进魂灵制度、唐门与同伴安全", ["peerless-tang-sect", "shrek-inner-court"]),

  stage("tang-wutong", 9989, "王冬", "在既有安排下成长，尚未向外界公开真实身世", [], 9999),
  stage("tang-wutong", 10000, "王冬", "以当前公开身份等待史莱克入学，尚未形成后来的同学关系", [], 10000, 1, 29),
  stage("tang-wutong", 10000, "王冬", "以史莱克外院新生身份学习、竞争并逐步建立同伴关系", ["shrek-era2-academy"], 10005, 30),
  stage("tang-wutong", 10006, "王冬儿", "以史莱克内院学生身份处理修炼、同伴和自身身份疑问", ["shrek-inner-court"], 10011),
  stage("tang-wutong", 10012, "唐舞桐", "在已经公开的身份与关系基础上承担史莱克和同伴责任", ["shrek-inner-court"]),
  stage("xiao-xiao", 10000, "萧萧", "等待史莱克入学与新生分班，尚未形成后来的固定团队", [], 10000, 1, 29),
  stage("xiao-xiao", 10000, "萧萧", "以史莱克外院新生身份学习双生武魂控制并参与新生考核", ["shrek-era2-academy"], 10005, 30),
  stage("xiao-xiao", 10006, "萧萧", "以内院学生身份继续双生武魂修炼并承担同伴责任", ["shrek-inner-court"]),

  stage("tang-wulin", 19994, "唐舞麟", "在家庭生活中成长，期待觉醒武魂并减轻父母负担", [], 19999),
  stage("tang-wulin", 20000, "唐舞麟", "进入魂师班学习基础冥想，同时通过锻造劳动积累魂灵费用", [], 20002),
  stage("tang-wulin", 20003, "唐舞麟", "在东海学院零班训练、锻造并与同龄队友磨合", ["d3-tang-sect"], 20006),
  stage("tang-wulin", 20007, "唐舞麟", "以史莱克学生和团队成员身份承担训练、竞争与同伴责任", ["d3-tang-sect", "d3-shrek-seven"], 20013),
  stage("tang-wulin", 20014, "唐舞麟", "在血神军团与深渊威胁中承担军人、唐门和史莱克责任", ["d3-tang-sect", "d3-shrek-seven", "blood-god-army"]),

  stage("gu-yue-na", 20000, "古月", "以普通孩子身份生活，真实来历和阵营目标没有向人类公开", [], 20002),
  stage("gu-yue-na", 20003, "古月", "在东海学院零班学习并观察人类魂师与同伴", [], 20006),
  stage("gu-yue-na", 20007, "古月", "以史莱克团队成员身份行动，同时继续隐藏不能公开的真实来历", ["d3-shrek-seven"], 20015),
  stage("gu-yue-na", 20016, "古月娜", "在身份与立场已经公开变化后处理传灵塔、人类与魂兽冲突", ["spirit-pagoda"]),

  stage("lan-xuanyu", 29994, "蓝轩宇", "在养育家庭与研究所环境中成长，尚未形成后世身份与责任", [], 29999),
  stage("lan-xuanyu", 30000, "蓝轩宇", "完成武魂觉醒与家庭安排，开始基础魂力学习", [], 30000),
  stage("lan-xuanyu", 30001, "蓝轩宇", "参加高能少年班训练，与同龄伙伴建立真实协作", [], 30004),
  stage("lan-xuanyu", 30005, "蓝轩宇", "参加史莱克学习、考核和团队任务", ["shrek-space-command"], 30011),
  stage("lan-xuanyu", 30012, "蓝轩宇", "进入联邦舰队后承担岗位、任务与团队安全责任", ["shrek-space-command", "d4-federal-fleet"]),

  stage("bai-xiuxiu", 29994, "冻千秋", "以冻千秋身份成长，尚未公开后来的姓名与经历", [], 30004),
  stage("bai-xiuxiu", 30005, "冻千秋", "以史莱克学生和队友身份参加考核与训练", ["shrek-space-command"], 30005),
  stage("bai-xiuxiu", 30006, "白秀秀", "在已经发生的身份变化后承担史莱克团队与自身族群责任", ["shrek-space-command"], 30011),
  stage("bai-xiuxiu", 30012, "白秀秀", "进入联邦舰队后承担岗位、任务与同伴安全责任", ["shrek-space-command", "d4-federal-fleet"]),

  stage("qian-renxue", -5, "雪清河", "维持天斗太子公开身份并完成当前政治职责，真实身份仍然保密", ["heaven-dou"], 16),
  stage("qian-renxue", 17, "千仞雪", "在太子身份秘密公开后处理武魂殿、天使传承与天斗冲突", ["spirit-hall"]),
];

function ordinal(year: number, day: number): number { return year * 360 + day; }

export function characterLifeStageAtDate(characterId: string, year: number, day = 1): CharacterLifeStageDefinition | undefined {
  const current = ordinal(year, day);
  return CHARACTER_LIFE_STAGES.filter((item) => item.characterId === characterId && ordinal(item.validFromYear, item.validFromDay ?? 1) <= current && ordinal(item.validUntilYear ?? 100_000, item.validUntilDay ?? 360) >= current).sort((left, right) => ordinal(right.validFromYear, right.validFromDay ?? 1) - ordinal(left.validFromYear, left.validFromDay ?? 1))[0];
}
