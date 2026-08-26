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
  stage("tang-san", 0, "唐三", "与父亲在圣魂村生活，完成武魂觉醒并弄清眼前能够走的路", [], 0, 1, 19),
  stage("tang-san", 0, "唐三", "在诺丁学院学习、修炼武魂并处理工读生活与家庭牵挂", [], 6, 20, 19),
  stage("tang-san", 6, "唐三", "与史莱克同伴共同训练，准备真实战斗与魂环成长", ["shrek"], 12, 20),
  stage("tang-san", 13, "唐三", "追查父母旧事、面对昊天宗关系并保护已经建立的同伴", ["shrek", "clear-sky"], 13),
  stage("tang-san", 14, "唐三", "建立唐门现实班底，同时承担亲友、宗门与大陆冲突带来的责任", ["shrek", "clear-sky", "tang-sect"]),
  stage("tang-hao", -6, "唐昊", "在隐居生活中保护唐三，并压住会危及孩子的旧事", [], 12),
  stage("tang-hao", 13, "唐昊", "在旧事逐步浮出水面后处理家人、伤势与宗门之间的责任", []),

  stage("xiao-wu", -6, "小舞", "在熟悉的照料环境中成长，处理当前年龄能够理解的生活问题", [], -1),
  stage("xiao-wu", 0, "小舞", "以普通适龄孩子身份寻找能够生活和学习的地方", [], 0, 1, 19),
  stage("xiao-wu", 0, "小舞", "在诺丁学院处理工读生活、基础修炼与同龄人的日常相处", [], 6, 20, 19),
  stage("xiao-wu", 6, "小舞", "作为史莱克学员参加训练和实战，同时保护自己的私人边界", ["shrek"], undefined, 20),

  stage("dai-mubai", -9, "戴沐白", "面对星罗家族竞争压力，提升实力并寻找能够活下去的道路", ["star-luo"], 3),
  stage("dai-mubai", 4, "戴沐白", "离开原有家族环境后在索托一带修炼，同时警惕星罗竞争继续追来", ["star-luo"], 6, 1, 19),
  stage("dai-mubai", 6, "戴沐白", "以史莱克年长学员身份训练、带队并面对没有消失的星罗竞争", ["shrek", "star-luo"], undefined, 20),

  stage("zhu-zhuqing", -7, "朱竹清", "在星罗家族竞争中坚持修炼与自保，寻找改变处境的现实机会", ["star-luo"], 6, 1, 19),
  stage("zhu-zhuqing", 6, "朱竹清", "以史莱克学员身份追赶实力差距，并判断哪些同伴真正可靠", ["shrek", "star-luo"], undefined, 20),

  stage("ning-rongrong", -6, "宁荣荣", "在七宝琉璃宗家庭与宗门环境中成长，接受启蒙并处理眼前的同龄人相处", ["seven-treasure"], 6, 1, 19),
  stage("ning-rongrong", 6, "宁荣荣", "以七宝琉璃宗弟子和史莱克学员身份学习配合，并承担自己答应的事", ["seven-treasure", "shrek"], undefined, 20),

  stage("ao-si-ka", 4, "奥斯卡", "在史莱克学院修炼食物系武魂，设法证明辅助魂师也能独立承担风险", ["shrek"], 7),
  stage("ao-si-ka", 8, "奥斯卡", "在团队实战与个人成长之间寻找不依赖他人保护的道路", ["shrek"]),

  stage("ma-hongjun", 4, "马红俊", "在史莱克学院接受训练，学习控制武魂缺陷而不是任由其支配生活", ["shrek"], 7),
  stage("ma-hongjun", 8, "马红俊", "以强攻系魂师身份继续修炼，并承担团队作战中的位置与风险", ["shrek"]),

  stage("yu-xiaogang", -3, "玉小刚", "客居诺丁学院整理武魂理论，在实际教学机会出现前继续验证自己的判断", [], 6),
  stage("yu-xiaogang", 7, "玉小刚", "参与史莱克教学与训练安排，用实际结果检验理论并承担学生安全责任", ["shrek"]),

  stage("flender", -3, "弗兰德", "维持规模很小的史莱克学院，在钱、人手和招生标准之间作取舍", ["shrek"]),

  stage("bibi-dong", -3, "比比东", "以武魂殿教皇身份维持内部权力、人才体系与对外秩序", ["spirit-hall"]),

  stage("ning-fengzhi", -20, "宁风致", "以七宝琉璃宗宗主身份维持宗门安全、产业与对外关系", ["seven-treasure", "heaven-dou"]),
  stage("chen-xin", -20, "尘心", "守护七宝琉璃宗并继续磨炼七杀剑，对陌生天才先观察再决定是否指点", ["seven-treasure"]),
  stage("gu-rong", -20, "古榕", "守护七宝琉璃宗与核心家人，对可能威胁宗门的人保持戒备", ["seven-treasure"]),
  stage("dugu-bo", -20, "独孤博", "维持与天斗皇室的有限往来，处理个人修炼与家人安全", ["heaven-dou"]),
  stage("huliena", 0, "胡列娜", "在武魂殿接受训练与考核，证明自己能够承担更重要的任务", ["spirit-hall"], 7),
  stage("huliena", 8, "胡列娜", "以武魂殿黄金一代成员身份参加竞争并完成教皇交付的当前任务", ["spirit-hall"]),
  stage("gui-mei", -20, "鬼魅", "在武魂殿权限范围内执行教皇命令，优先保证行动隐蔽与结果可控", ["spirit-hall"]),
  stage("yue-guan", -20, "月关", "执行武魂殿当前任务，同时留意值得研究或争取的珍稀植物", ["spirit-hall"]),
  stage("qian-daoliu", -20, "千道流", "维持供奉殿与天使传承秩序，不直接插手没有触及其职责的地方事务", ["spirit-hall"]),
  stage("liu-erlong", 0, "柳二龙", "经营蓝霸学院、保护学生并处理学院眼前的招生与生计", [], 6),
  stage("liu-erlong", 7, "柳二龙", "参与史莱克学院教学与安全事务，同时处理已经重逢的旧关系", ["shrek"]),
  stage("xue-ye", -20, "雪夜大帝", "维持天斗帝国稳定，在皇室继承、贵族与魂师势力之间保持平衡", ["heaven-dou"]),

  stage("huo-yuhao", 9989, "霍雨浩", "在白虎公爵府边缘生活，积累离开与独立生存所需的能力", [], 9999),
  stage("huo-yuhao", 10000, "霍雨浩", "离开公爵府后先求生、寻找魂师成长机会并确认自己的道路", [], 10000, 1, 14),
  stage("huo-yuhao", 10000, "霍雨浩", "履行刚刚建立的唐门关系，并争取进入史莱克学习的现实资格", ["peerless-tang-sect"], 10000, 15, 29),
  stage("huo-yuhao", 10000, "霍雨浩", "以史莱克外院新生与唐门成员身份学习、考核并建立同伴关系", ["peerless-tang-sect", "shrek-era2-academy"], 10005, 30),
  stage("huo-yuhao", 10006, "霍雨浩", "承担史莱克重点学生与唐门成员的修炼、同伴和外部危机责任", ["peerless-tang-sect", "shrek-inner-court"], 10011),
  stage("huo-yuhao", 10012, "霍雨浩", "在战争压力下推进魂灵制度、唐门与同伴安全", ["peerless-tang-sect", "shrek-inner-court"]),

  stage("tang-wutong", 9989, "王冬", "在既有家庭安排下成长，完成当前年龄的修炼与学习", [], 9999),
  stage("tang-wutong", 10000, "王冬", "准备史莱克入学，先处理报名、住处与新生考核", [], 10000, 1, 29),
  stage("tang-wutong", 10000, "王冬", "以史莱克外院新生身份学习、竞争并逐步建立同伴关系", ["shrek-era2-academy"], 10005, 30),
  stage("tang-wutong", 10006, "王冬儿", "以史莱克内院学生身份处理修炼、考核与已经形成的同伴关系", ["shrek-inner-court"], 10011),
  stage("tang-wutong", 10012, "唐舞桐", "在已经公开的身份与关系基础上承担史莱克和同伴责任", ["shrek-inner-court"]),
  stage("xiao-xiao", 10000, "萧萧", "准备史莱克入学与新生分班，先面对眼前的报名和考核", [], 10000, 1, 29),
  stage("xiao-xiao", 10000, "萧萧", "以史莱克外院新生身份学习双生武魂控制并参与新生考核", ["shrek-era2-academy"], 10005, 30),
  stage("xiao-xiao", 10006, "萧萧", "以内院学生身份继续双生武魂修炼并承担同伴责任", ["shrek-inner-court"]),

  stage("bei-bei", 10000, "贝贝", "兼顾史莱克学习与唐门现实生计，寻找愿意了解唐门且能够承担责任的人", ["peerless-tang-sect", "shrek-inner-court"]),
  stage("tang-ya", 10000, "唐雅", "维持衰落唐门的传承与生计，在招收成员前先判断对方是否可信", ["peerless-tang-sect"]),
  stage("xu-sanshi", 10000, "徐三石", "以史莱克学生身份修炼玄冥龟武魂，处理考核、同伴与自己的承诺", ["shrek-inner-court"]),
  stage("jiang-nannan", 10000, "江楠楠", "在史莱克学习并改善家庭处境，对越过边界的接近保持明确拒绝", ["shrek-inner-court"]),
  stage("he-caitou", 10000, "和菜头", "在史莱克魂导系学习、制作并完成训练任务，只公开当前学员身份", ["peerless-tang-sect", "shrek-inner-court"]),
  stage("juzi", 10000, "橘子", "在日月皇家魂导师学院学习与完成当前任务，把个人情绪留在职责之后", ["sun-moon-empire", "sun-moon-royal-academy"]),
  stage("xiao-hongchen", 10000, "笑红尘", "在明德堂资源与考核体系内提升魂导能力，维护自身与家族声望", ["mingde-hall"]),
  stage("meng-hongchen", 10000, "梦红尘", "在明德堂训练武魂与魂导器，争取用实际成绩获得认可", ["mingde-hall"]),
  stage("jing-hongchen", 9990, "镜红尘", "主持明德堂的研究、人才与资源分配，优先维护日月魂导体系利益", ["mingde-hall"]),
  stage("mu-en", 9990, "穆恩", "守住史莱克传承与海神阁职责，只在真正触及学院根基时动用最高权限", ["sea-god-pavilion"]),
  stage("xuan-lao", 10000, "玄老", "保护史莱克学员并承担带队与考察责任，不替年轻人抹去全部风险", ["sea-god-pavilion"]),

  stage("tang-wulin", 19994, "唐舞麟", "在家庭生活中成长，期待觉醒武魂并减轻父母负担", [], 19999),
  stage("tang-wulin", 20000, "唐舞麟", "进入魂师班学习基础冥想，同时通过锻造劳动积累魂灵费用", [], 20002),
  stage("tang-wulin", 20003, "唐舞麟", "在东海学院零班训练、锻造并与同龄队友磨合", ["d3-tang-sect"], 20006),
  stage("tang-wulin", 20007, "唐舞麟", "以史莱克学生和团队成员身份承担训练、竞争与同伴责任", ["d3-tang-sect", "d3-shrek-seven"], 20013),
  stage("tang-wulin", 20014, "唐舞麟", "在血神军团与深渊威胁中承担军人、唐门和史莱克责任", ["d3-tang-sect", "d3-shrek-seven", "blood-god-army"]),

  stage("gu-yue-na", 20000, "古月", "以普通孩子身份生活，处理当前年龄的修炼、学习与日常选择", [], 20002),
  stage("gu-yue-na", 20003, "古月", "在东海学院零班学习并观察人类魂师与同伴", [], 20006),
  stage("gu-yue-na", 20007, "古月", "以史莱克团队成员身份训练、考核并处理已经形成的同伴关系", ["d3-shrek-seven"], 20015),
  stage("gu-yue-na", 20016, "古月娜", "在身份与立场已经公开变化后处理传灵塔、人类与魂兽冲突", ["spirit-pagoda"]),

  stage("xie-xie", 20000, "谢邂", "在家庭与初等学习环境中修炼武魂，处理好胜心带来的同龄冲突", [], 20002),
  stage("xie-xie", 20003, "谢邂", "在东海学院训练、竞争并学习与同组成员配合", [], 20006),
  stage("xie-xie", 20007, "谢邂", "以当代史莱克团队成员身份训练、执行任务并保护自己认可的人", ["d3-shrek-seven"]),
  stage("xu-xiaoyan", 20000, "许小言", "在家庭与初等学习环境中掌握星光武魂的时间和环境限制", [], 20002),
  stage("xu-xiaoyan", 20003, "许小言", "在东海学院学习控制与团队配合，用实际训练争取留下的资格", [], 20006),
  stage("xu-xiaoyan", 20007, "许小言", "以当代史莱克团队控制系成员身份训练并承担协同责任", ["d3-shrek-seven"]),
  stage("ye-xinglan", 20000, "叶星澜", "以史莱克学生身份磨炼星神剑，在竞争中坚持自己的标准", ["shrek-inner-court"], 20006),
  stage("ye-xinglan", 20007, "叶星澜", "以当代史莱克团队成员身份追求剑道与实战能力，并承担任务责任", ["d3-shrek-seven"]),
  stage("yuanen-yehui", 20000, "原恩夜辉", "在史莱克学习和修炼，对个人身体、家庭与武魂信息保持清楚边界", ["shrek-inner-court"], 20006),
  stage("yuanen-yehui", 20007, "原恩夜辉", "以当代史莱克团队成员身份训练并处理已经公开的家庭与武魂问题", ["d3-shrek-seven"]),
  stage("yue-zhengyu", 20000, "乐正宇", "在史莱克学习并维护神圣天使家族要求，用实战证明自己而非只靠出身", ["shrek-inner-court"], 20006),
  stage("yue-zhengyu", 20007, "乐正宇", "以当代史莱克团队成员身份训练、执行任务并承担自己作出的承诺", ["d3-shrek-seven"]),
  stage("xu-lizhi", 20000, "徐笠智", "以史莱克学生身份修炼食物系武魂，同时训练不依赖他人保护的生存能力", ["shrek-inner-court"], 20006),
  stage("xu-lizhi", 20007, "徐笠智", "以当代史莱克团队食物系成员身份提供支援并承担前线风险", ["d3-shrek-seven"]),

  stage("lan-xuanyu", 29994, "蓝轩宇", "在家庭与研究所生活环境中成长，处理当前年龄的学习和家庭关系", [], 29999),
  stage("lan-xuanyu", 30000, "蓝轩宇", "完成武魂觉醒与家庭安排，开始基础魂力学习", [], 30000),
  stage("lan-xuanyu", 30001, "蓝轩宇", "参加高能少年班训练，与同龄伙伴建立真实协作", [], 30004),
  stage("lan-xuanyu", 30005, "蓝轩宇", "参加史莱克学习、考核和团队任务", ["shrek-space-command"], 30011),
  stage("lan-xuanyu", 30012, "蓝轩宇", "进入联邦舰队后承担岗位、任务与团队安全责任", ["shrek-space-command", "d4-federal-fleet"]),

  stage("bai-xiuxiu", 29994, "冻千秋", "以冻千秋的公开身份成长，处理当前修炼、学习和人际关系", [], 30004),
  stage("bai-xiuxiu", 30005, "冻千秋", "以史莱克学生和队友身份参加考核与训练", ["shrek-space-command"], 30005),
  stage("bai-xiuxiu", 30006, "白秀秀", "在已经发生的身份变化后承担史莱克团队与自身族群责任", ["shrek-space-command"], 30011),
  stage("bai-xiuxiu", 30012, "白秀秀", "进入联邦舰队后承担岗位、任务与同伴安全责任", ["shrek-space-command", "d4-federal-fleet"]),

  stage("qian-lei", 30000, "钱磊", "参加天罗学院的课程与训练，学习控制召唤结果并与同学建立配合", [], 30004),
  stage("qian-lei", 30005, "钱磊", "进入史莱克星际培养体系后训练召唤、团队协同与任务生存", ["shrek-space-command"]),
  stage("liu-feng", 30000, "刘锋", "参加天罗学院的课程与训练，用持续练习弥补武魂与身体限制", [], 30004),
  stage("liu-feng", 30005, "刘锋", "进入史莱克星际培养体系后训练速度、突击与团队协同", ["shrek-space-command"]),
  stage("lan-mengqin", 30000, "蓝梦琴", "在当前学院与家庭安排下修炼双生武魂，判断合作对象是否可靠", [], 30004),
  stage("lan-mengqin", 30005, "蓝梦琴", "进入史莱克星际培养体系后训练双生武魂、治疗与团队协同", ["shrek-space-command"]),
  stage("yuanen-huihui", 30000, "原恩辉辉", "在家人与学院安排下学习、修炼并处理自己的身体与血脉问题", [], 30004),
  stage("yuanen-huihui", 30005, "原恩辉辉", "进入史莱克星际培养体系后训练远程作战并承担团队任务", ["shrek-space-command"]),

  stage("qian-renxue", -5, "雪清河", "以天斗太子的公开身份完成当前政治职责，维持朝堂与皇室关系", ["heaven-dou"], 16),
  stage("qian-renxue", 17, "千仞雪", "在太子身份秘密公开后处理武魂殿、天使传承与天斗冲突", ["spirit-hall"]),
];

function ordinal(year: number, day: number): number { return year * 360 + day; }

export function characterLifeStageAtDate(characterId: string, year: number, day = 1): CharacterLifeStageDefinition | undefined {
  const current = ordinal(year, day);
  return CHARACTER_LIFE_STAGES.filter((item) => item.characterId === characterId && ordinal(item.validFromYear, item.validFromDay ?? 1) <= current && ordinal(item.validUntilYear ?? 100_000, item.validUntilDay ?? 360) >= current).sort((left, right) => ordinal(right.validFromYear, right.validFromDay ?? 1) - ordinal(left.validFromYear, left.validFromDay ?? 1))[0];
}

export const CHARACTER_LIFE_STAGE_CHARACTER_COUNT = new Set(CHARACTER_LIFE_STAGES.map((item) => item.characterId)).size;
