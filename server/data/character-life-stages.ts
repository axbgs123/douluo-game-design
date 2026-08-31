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
  stage("tang-san", 0, "唐三", "完成觉醒后准备前往诺丁学院，处理离家、名额与路程", [], 0, 20, 29),
  stage("tang-san", 0, "唐三", "在诺丁学院学习、修炼武魂并处理工读生活与家庭牵挂", [], 6, 30, 19),
  stage("tang-san", 6, "唐三", "与史莱克同伴共同训练，准备真实战斗与魂环成长", ["shrek"], 12, 20),
  stage("tang-san", 13, "唐三", "追查父母旧事、面对昊天宗关系并保护已经建立的同伴", ["shrek", "clear-sky"], 13),
  stage("tang-san", 14, "唐三", "建立唐门现实班底，同时承担亲友、宗门与大陆冲突带来的责任", ["shrek", "clear-sky", "tang-sect"]),
  stage("tang-hao", -6, "唐昊", "在隐居生活中保护唐三，并压住会危及孩子的旧事", [], 12),
  stage("tang-hao", 13, "唐昊", "在旧事逐步浮出水面后处理家人、伤势与宗门之间的责任", []),

  stage("xiao-wu", -6, "小舞", "在熟悉的照料环境中成长，处理当前年龄能够理解的生活问题", [], -1),
  stage("xiao-wu", 0, "小舞", "以普通适龄孩子身份寻找能够生活和学习的地方", [], 0, 1, 30),
  stage("xiao-wu", 0, "小舞", "在诺丁学院处理工读生活、基础修炼与同龄人的日常相处", [], 6, 31, 19),
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

  stage("tang-xiao", -5, "唐啸", "以昊天宗宗主身份维持封山后的宗门秩序，保护族人并处理旧事留下的压力", ["clear-sky"]),
  stage("xue-beng", 0, "雪崩", "以天斗四皇子身份处理皇室生活、学院往来与眼前的政治压力", ["heaven-dou"], 16),
  stage("xue-beng", 17, "雪崩", "在皇室局势公开变化后承担继承、军政与帝国安全责任", ["heaven-dou"]),
  stage("bo-saixi", -20, "波赛西", "主持海神岛秩序与考核，保护岛民并维护海神传承规则", ["sea-god-island"]),
  stage("tang-chen", -20, "杀戮之王", "维持杀戮之都的血腥秩序，对进入者只按当地规则与实际威胁作出反应", ["slaughter-city"]),
  stage("a-yin", -6, "阿银", "在当前生命状态下保存本源并等待能够继续生长的现实条件", []),
  stage("da-ming", -100, "大明", "维持星斗核心区秩序，保护核心族群并警惕进入领地的人类强者", []),
  stage("er-ming", -100, "二明", "守住星斗核心领地和重要族群，对越界威胁采取直接反应", []),
  stage("di-tian", -100, "帝天", "维持星斗核心区秩序与魂兽延续，只处理真正触及核心领地的威胁", []),
  stage("bi-ji", -100, "碧姬", "治疗受伤魂兽、维持族群生存，并缓和会造成无谓损失的冲突", []),
  stage("zi-ji", -100, "紫姬", "守卫星斗核心区并维护地狱魔龙一脉，对外来强者保持戒备", []),
  stage("xiong-jun", -100, "熊君", "扩张自身威势并挑战值得出手的强敌，同时服从核心区不能被毁的底线", []),
  stage("wan-yao-wang", -100, "万妖王", "利用根系与精神感知守住领地，优先控制风险而非无意义追击", []),
  stage("chi-wang", -100, "赤王", "巡守星斗核心区外围并保护族群幼崽，对可靠威胁及时示警", []),
  stage("tian-meng", -100, "天梦冰蚕", "寻找摆脱控制并保存自身本源的机会，不向无法信任的对象暴露计划", [], 10004),
  stage("tian-meng", 10005, "天梦冰蚕", "在存在状态已经改变后维护自身本源，并参与已经建立的魂灵实验", []),
  stage("snow-empress", -100, "雪帝", "维持极北核心圈秩序，保护冰雪族群并应对自身寿限压力", [], 10004),
  stage("snow-empress", 10005, "雪帝", "在本源状态改变后保存意识与力量，处理已经卷入的人类争夺", []),
  stage("ice-empress", -100, "冰帝", "守卫极北之地与冰碧蝎族群，对侵入核心圈的人类保持敌意", [], 9999),
  stage("ice-empress", 10000, "冰帝", "在存在状态改变后维护自身本源，并判断当前合作是否仍值得继续", []),
  stage("xiao-bai", -20, "小白", "守卫海神岛近海、保护族群并执行海神岛当前通行规则", ["sea-god-island"]),
  stage("yu-yuanzhen", -20, "玉元震", "以蓝电霸王龙宗宗主身份维护宗门威望、传承与族人安全", ["blue-lightning"]),
  stage("golden-crocodile", -20, "金鳄斗罗", "履行供奉殿职责，维护天使一脉与武魂殿核心秩序", ["worship-hall", "spirit-hall"]),
  stage("qian-jun", -20, "千钧斗罗", "执行供奉殿交付的守卫与战斗职责，不介入权限之外的地方争端", ["worship-hall"]),
  stage("jiang-mo", -20, "降魔斗罗", "执行供奉殿交付的守卫与战斗职责，以兄弟协同应对高阶威胁", ["worship-hall"]),
  stage("sea-dragon-douluo", -20, "海龙斗罗", "守卫海龙圣柱并主持职责范围内的考核，不替考核者规避代价", ["sea-pillar-guardians"]),
  stage("sea-witch-douluo", -20, "海魔女斗罗", "守卫海魔女圣柱并履行考核职责，对岛外来客保持好奇与边界", ["sea-pillar-guardians"]),
  stage("silver-dragon-sleeping", -100, "银龙王", "在当前生命状态下恢复本源，外界尚无可公开确认的日常行动", []),
  stage("qian-xunji", -20, "千寻疾", "以教皇身份维护教皇殿权力与天使传承利益，调动资源追索重大目标", ["pope-palace", "spirit-hall"], -6),

  stage("du-busi", 9990, "毒不死", "以本体宗宗主身份寻找和保护本体武魂人才，优先维护宗门传承", ["body-sect"]),
  stage("zhongli-wu", 9990, "钟离乌", "统筹圣灵教资源与行动，在暴露风险和扩张收益之间作取舍", ["holy-spirit-cult"]),
  stage("long-xiaoyao", 9990, "龙逍遥", "履行当前承诺并处理圣灵教高阶事务，不向普通成员解释私人旧事", ["holy-spirit-cult"]),
  stage("ye-xishui", 9990, "叶夕水", "维持圣灵教核心权力并推进当前计划，对失败和背叛采取高压处置", ["holy-spirit-cult"]),
  stage("ma-xiaotao", 10000, "马小桃", "以史莱克内院学生身份训练并控制武魂隐患，承担带队与护校责任", ["shrek-inner-court"]),
  stage("dai-yaoheng", 10000, "戴钥衡", "兼顾史莱克内院训练与星罗家族责任，以实际战绩维护队伍", ["shrek-inner-court", "star-luo"]),
  stage("wang-qiuer", 10000, "三眼金猊", "在星斗核心区活动，观察异常变化并维护自身与族群安全", [], 10005),
  stage("wang-qiuer", 10006, "王秋儿", "以当前公开身份了解人类生活、修炼与情感，并保留自己的选择边界", []),
  stage("snow-empress-human", 10005, "雪女", "以当前可见形态保存本源、适应交流并保护自己认可的人", []),

  stage("long-yue", 20000, "龙跃", "以怪物学院核心学员身份训练山龙王武魂并维护星罗方面荣誉", ["star-luo-overseas"]),
  stage("dai-yuner", 20000, "戴云儿", "以星罗皇室成员身份学习、修炼并完成当前交流与家族职责", ["star-luo-overseas"]),
  stage("zhen-hua", 19990, "震华", "主持锻造师协会事务、培养锻造人才并维护神匠作品标准", ["gengxin-smiths"]),
  stage("mu-ye", 19990, "牧野", "维持本体宗传承并考察值得投入的人才，训练要求服从身体承载", ["body-sect"]),
  stage("yun-ming", 19990, "云冥", "主持海神阁与史莱克城安全事务，在学院存续与大陆责任间决策", ["sea-god-pavilion"]),
  stage("ya-li", 19990, "雅莉", "救治伤者、培养治疗人才并守护史莱克，不把救援变成无代价奇迹", ["sea-god-pavilion"]),
  stage("leng-yaozhu", 19990, "冷遥茱", "处理传灵塔职责、魂灵事务与内部关系，保护自己认可的学生", ["spirit-pagoda"]),
  stage("qiangu-dongfeng", 19990, "千古东风", "维护传灵塔权力、资源与家族利益，推进能够扩大组织影响的计划", ["spirit-pagoda"]),
  stage("chen-xinjie", 19990, "陈新杰", "统筹战神殿与海神军团职责，维护联邦安全和军令边界", ["sea-god-army", "war-god-temple"]),
  stage("cao-dezhi", 19990, "曹德智", "兼顾唐门与血神军团职责，维持深渊防线和军中秩序", ["d3-tang-sect", "blood-god-army"]),
  stage("zang-xin", 19990, "臧鑫", "处理唐门传承、组织资源与大陆局势，优先保证宗门能够延续", ["d3-tang-sect"]),
  stage("dark-phoenix", 19990, "冷雨莱", "执行圣灵教高阶任务并维护自身立场，对旧关系保持复杂戒备", ["d3-holy-spirit"]),

  stage("tang-yuge", 30000, "唐雨格", "以史莱克高年级学员身份训练五行麒麟并处理团队与家庭关系", ["shrek-space-command"]),
  stage("bai-ling-admiral", 30012, "白凌", "以第七舰队司令身份统筹舰队任务、人员安全与联邦军令", ["d4-federal-fleet", "d4-seventh-fleet"]),
  stage("wang-tianyu", 29990, "汪天羽", "履行海神阁与史莱克管理职责，维护学院传承、规则与学生安全", ["sea-god-pavilion"]),
  stage("le-gongzi", 30000, "乐公子", "以公众人物身份工作和生活，只处理当前能够确认的记忆与关系", []),
  stage("na-na-teacher", 30000, "娜娜", "以娜娜身份在天斗星生活，履行已经建立的教学与照料责任", []),
  stage("huang-yuanlang", 30000, "皇元朗", "以天龙星上位龙族身份维护家族利益，评估外来者的价值与风险", ["dragon-horse-federation"]),
  stage("zhong-zhichang", 30000, "钟志昌", "履行曙光龙骑士职责，维护龙族秩序并权衡族群长期利益", ["sky-dragon-guild"]),
  stage("luo-lan", 30000, "罗镧", "履行黑恐龙骑士职责，维护自身领地并争取值得培养的龙族人才", ["sky-dragon-guild"]),
  stage("jiang-weiquang", 30000, "江炜强", "以天龙首座身份维护龙族统治、资源与龙马星系权力秩序", ["sky-dragon-guild"]),

  stage("zhao-wuji", 6, "赵无极", "承担史莱克学员实战考察与安全责任，训练严格但不替学生承担所有风险", ["shrek"]),
  stage("dugu-yan", 6, "独孤雁", "以皇斗战队控制系成员身份训练用毒、队伍配合与临场判断", ["heaven-dou", "heaven-royal-academy"]),
  stage("ye-lingling", 6, "叶泠泠", "以皇斗战队治疗系成员身份保存魂力、判断伤势并保护队友", ["heaven-dou", "heaven-royal-academy"]),
  stage("meng-shu", -20, "孟蜀", "与家人共同行动，保护晚辈并按魂环适配、实力和已有约定处理争端", []),
  stage("chao-tianxiang", -20, "朝天香", "与孟蜀共同维持家族安全，在猎魂时先核对目标、归属与晚辈承载能力", []),
  stage("meng-yiran", 6, "孟依然", "在家人陪同下寻找适合魂环，用实战和正面竞争证明自己", []),
  stage("tai-tan", 13, "泰坦", "主持力之一族生计、锻造与族人安全，对新的宗门承诺先核对人与事", [], 13),
  stage("tai-tan", 14, "泰坦", "负责唐门力堂、锻造与建造事务，同时安置族人并核算投入", ["tang-sect"]),
  stage("yang-wudi", 13, "杨无敌", "主持破之一族生计、药物和战斗训练，对外部邀请先看条件与旧怨", [], 13),
  stage("yang-wudi", 14, "杨无敌", "负责唐门药堂与破攻训练，按药材、安全和实际需求决定投入", ["tang-sect"]),
  stage("bai-he", 13, "白鹤", "维持敏之一族生计、侦察与情报能力，在自尊与族人出路之间谈条件", ["speed-clan"], 13),
  stage("bai-he", 14, "白鹤", "负责唐门敏堂的侦察、递信与预警，避免让族人承担无意义损耗", ["speed-clan", "tang-sect"]),
  stage("niu-gao", 13, "牛皋", "主持御之一族住处、工事和生计，对合作方案先看能否安置族人", [], 13),
  stage("niu-gao", 14, "牛皋", "负责唐门御堂、营造与防务，在工期、材料和防守需求之间取舍", ["tang-sect"]),
  stage("xue-xing", -20, "雪星亲王", "维持自身在天斗皇室的权力与人脉，对学院和魂师势力先衡量立场", ["heaven-dou"]),
  stage("qin-ming", 6, "秦明", "以天斗皇家学院教师身份培养皇斗战队，并在规程内维护史莱克出身的责任", ["shrek", "heaven-royal-academy"]),
  stage("yu-tianheng", 6, "玉天恒", "带领皇斗战队完成训练与斗魂，用团队战绩证明宗门嫡系能力", ["blue-lightning", "heaven-royal-academy"]),
  stage("feng-xiaotian", 8, "风笑天", "以神风学院队长身份打磨自创魂技、带队争胜并处理自己表达的感情", ["five-elements"]),
  stage("huo-wu", 8, "火舞", "以炽火学院主力身份研究强敌、调整战术并用正面胜负维护自尊", ["five-elements"]),
  stage("huo-wushuang", 8, "火无双", "带领炽火学院队伍稳住正面攻防，同时看顾妹妹与全队安全", ["five-elements"]),
  stage("shui-binger", 8, "水冰儿", "以天水学院队长身份分配控制、输出与体力，冷静判断是否继续战斗", ["skywater-academy"]),
  stage("hu-yan-zhen", 8, "呼延震", "以象甲宗宗主身份争取资源和声势，同时承担弟子战绩与宗门立场的后果", ["elephant-sect", "spirit-hall"]),
  stage("xie-yue", 8, "邪月", "以武魂殿黄金一代成员身份带队完成比赛和任务，在大局与妹妹安全之间判断", ["spirit-hall"]),
  stage("yan", 8, "焆", "以武魂殿黄金一代成员身份强化正面作战，用行动争取认可而不是要求他人回应", ["spirit-hall"]),
  stage("tang-yuehua", -20, "唐月华", "经营月轩教学、人情与皇室往来，在宗门亲情与公开礼法之间保持分寸", ["clear-sky", "heaven-dou"]),
  stage("salas", 8, "萨拉斯", "以武魂圣殿主教身份监督赛事、记录天才并为武魂殿争取影响", ["spirit-hall"]),
  stage("bai-chenxiang", 13, "白沉香", "以敏之一族年轻成员身份训练速度、侦察与独立生存能力", ["speed-clan"], 13),
  stage("bai-chenxiang", 14, "白沉香", "在唐门和敏之一族事务中承担递信、侦察与队伍生存训练", ["speed-clan", "tang-sect"]),
  stage("lou-gao", 14, "楼高", "主持铁匠协会技艺、工匠与材料事务，对精巧器物先验证结构再决定投入", ["iron-association"]),
  stage("dai-weisi", 8, "戴维斯", "以星罗皇室竞争者身份带队争取战绩，维持已有权位优势并压制直接竞争者", ["star-luo"]),
  stage("zhu-zhuyun", 8, "朱竹云", "在星罗家族竞争中与戴维斯协同，用战绩与判断巩固自身位置", ["star-luo"]),
  stage("yu-luomian", -20, "玉罗冕", "维持蓝电霸王龙宗支脉的血脉、资源与话语权，对外来关系先看家族利益", ["blue-lightning"]),
  stage("sea-horse-douluo", 16, "海马斗罗", "镇守海马圣柱并主持外来者考核，按圣柱反应记录而不替考核者作主", ["sea-pillar-guardians"]),
  stage("sea-spear-douluo", 16, "海矛斗罗", "镇守海矛圣柱并履行战斗考核，使用实际战力守住考核标准", ["sea-pillar-guardians"]),
  stage("sea-illusion-douluo", 16, "海幻斗罗", "镇守海幻圣柱并完成幻境考核，不向参与者提前泄露破解方式", ["sea-pillar-guardians"]),
  stage("sea-star-douluo", 16, "海星斗罗", "镇守海星圣柱并履行考核责任，耐心观察承载与持续作战能力", ["sea-pillar-guardians"]),
  stage("sea-ghost-douluo", 16, "海鬼斗罗", "镇守海鬼圣柱并完成职责内考核，对违反岛上规则的人直接制止", ["sea-pillar-guardians"]),
  stage("purple-pearl", 15, "紫珍珠", "维持海盗团、岛民生计和近海安全，对陌生来客先确认实力、来意与交换条件", ["purple-pearl"]),
  stage("ji-xiang", 15, "吉祥", "在岛上学习医术、处理伤患并照看日常病人，对新的教导先理解再练习", ["purple-pearl"]),
  stage("shao-xin", 4, "邵鑫", "负责史莱克学院食物系教学和后勤保障，根据人数、魂力和训练需求分配支援", ["shrek"]),
  stage("li-yusong", 4, "李郁松", "履行史莱克招生筛选与基础教学责任，按年龄、魂力和实际表现判断", ["shrek"]),
  stage("lu-qibin", 4, "卢奇斌", "负责史莱克控制系教学与团队配合，用训练结果调整队员位置", ["shrek"]),
  stage("shui-yueer", 8, "水月儿", "以天水学院主力队成员身份训练水属性配合，在好胜心与全队战术之间取舍", ["skywater-academy"]),
  stage("xue-wu", 8, "雪舞", "以天水学院辅助系成员身份维持冰雪环境、配合队长并控制魂力消耗", ["skywater-academy"]),
  stage("yu-tianxin", 8, "玉天心", "以雷霆学院队长身份组织雷属性攻势，用战绩维护队伍与宗族声誉", ["blue-lightning"]),
  stage("hu-yan-li", 8, "呼延力", "以象甲宗年轻核心身份训练防御和正面推进，承担宗门战绩压力", ["elephant-sect"]),
  stage("ye-zhiqiu", 6, "叶知秋", "带领苍晖学院学员出行和参赛，护短时也必须考虑学院名声与实力差", ["canghui-academy"]),
  stage("shi-mo", 6, "石墨", "以皇斗战队防御系成员身份守住前排，与兄弟轮换承担冲击", ["heaven-royal-academy"]),
  stage("shi-mo-younger", 6, "石磨", "以皇斗战队防御系成员身份配合兄长保护后排，按队长指令调整站位", ["heaven-royal-academy"]),
  stage("xue-ke", 0, "雪珂", "完成天斗皇室教育、礼仪和日常职责，在权限内了解魂师与学院事务", ["heaven-dou"]),

  stage("ling-luochen", 10003, "凌落宸", "以史莱克内院控制系队员身份完成赛事、维持冰场并保护队伍节奏", ["shrek-inner-court"]),
  stage("nan-qiuqiu", 10007, "南秋秋", "以地龙门年轻成员身份维护宗门声誉，学会将好胜心放进团队任务", [], 10011),
  stage("nan-qiuqiu", 10012, "南秋秋", "以唐门成员身份训练、执行任务并为地龙门留存重建条件", ["peerless-tang-sect"]),
  stage("ye-guyii", 10007, "叶骨衣", "独立追查邪魂师活动，使用神圣天使能力时同时保护无辜与自身行踪", [], 10011),
  stage("ye-guyii", 10012, "叶骨衣", "以唐门成员身份参与对邪魂师任务，遵守情报、同伴和撤离边界", ["peerless-tang-sect"]),

  stage("wu-siduo", 20007, "舞丝朵", "以史莱克学员身份追求核心席位，在班级竞争与临时组队中用战绩说话", ["shrek-inner-court"]),
  stage("mu-chen", 20000, "慕辰", "主持锻造师协会分内事务、作品验收和后辈培养，对天赋投入同时要求稳定练习", ["gengxin-smiths"]),
  stage("a-ruheng", 20014, "阿如恒", "以本体宗传人身份完成先天密法和极限训练，将好战心放在对等对手与正式任务中", ["body-sect"]),
  stage("sima-jinchi", 20014, "司马金驰", "以战神殿强者身份完成军事与比斗任务，追查斩龙刀共鸣时不违背已作承诺", ["war-god-temple"]),

  stage("lan-xiao", 29994, "蓝潇", "履行古魂兽研究与家庭照料责任，在研究价值、收养伦理和孩子安全之间取舍", ["douluo-federation"]),
  stage("nan-cheng", 29994, "南澄", "完成研究所工作并照料家庭，对孩子的身体、学习与异常变化保持具体关注", ["douluo-federation"]),
  stage("ying-luojhong", 30005, "樱落红", "主持史莱克星际专业教学、学员筛选与风险处置，惜才也不跳过考核", ["shrek-space-command"]),
  stage("bai-xiuxiu-dragon", 30013, "秀秀", "在龙马星系潜伏中维持已获认可的公开伪装，完成眼前情报与自保任务", ["dragon-horse-federation"]),

  stage("qian-renxue", -5, "雪清河", "以天斗太子的公开身份完成当前政治职责，维持朝堂与皇室关系", ["heaven-dou"], 16),
  stage("qian-renxue", 17, "千仞雪", "在太子身份秘密公开后处理武魂殿、天使传承与天斗冲突", ["spirit-hall"]),
];

function ordinal(year: number, day: number): number { return year * 360 + day; }

const CHARACTER_LIFE_STAGES_BY_ID = new Map<string, CharacterLifeStageDefinition[]>();
for (const item of CHARACTER_LIFE_STAGES) {
  const entries = CHARACTER_LIFE_STAGES_BY_ID.get(item.characterId) ?? [];
  entries.push(item);
  CHARACTER_LIFE_STAGES_BY_ID.set(item.characterId, entries);
}
for (const entries of CHARACTER_LIFE_STAGES_BY_ID.values()) entries.sort((left, right) => ordinal(right.validFromYear, right.validFromDay ?? 1) - ordinal(left.validFromYear, left.validFromDay ?? 1));

export function characterLifeStageAtDate(characterId: string, year: number, day = 1): CharacterLifeStageDefinition | undefined {
  const current = ordinal(year, day);
  return CHARACTER_LIFE_STAGES_BY_ID.get(characterId)?.find((item) => ordinal(item.validFromYear, item.validFromDay ?? 1) <= current && ordinal(item.validUntilYear ?? 100_000, item.validUntilDay ?? 360) >= current);
}

export const CHARACTER_LIFE_STAGE_CHARACTER_COUNT = new Set(CHARACTER_LIFE_STAGES.map((item) => item.characterId)).size;
