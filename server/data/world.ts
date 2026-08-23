export type ImportanceTier = 1 | 2 | 3 | 4 | 5;

export interface PowerSnapshotDefinition {
  year: number;
  soulRank?: number;
  tier: string;
  note: string;
}

export interface CanonCharacterDefinition {
  id: string;
  name: string;
  aliases: string[];
  importance: ImportanceTier;
  birthYear?: number;
  martialSouls: string[];
  factionIds: string[];
  initialLocationId: string;
  personality: string[];
  goals: string[];
  powerSnapshots: PowerSnapshotDefinition[];
}

export interface FactionDefinition {
  id: string;
  name: string;
  kind: string;
  headquartersId: string;
  inertia: ImportanceTier;
  description: string;
}

export interface LocationDefinition {
  id: string;
  name: string;
  region: string;
  danger: "安全" | "低" | "中" | "高" | "禁区";
  description: string;
  connections: Array<{ id: string; minutes: number }>;
}

export interface CanonEventDefinition {
  id: string;
  year: number;
  title: string;
  locationId?: string;
  participantIds: string[];
  inertia: ImportanceTier;
  publicSummary: string;
}

export interface SoulBeastDefinition {
  id: string;
  name: string;
  habitats: string[];
  attributes: string[];
  ageRange: [number, number];
  danger: number;
  possibleSkills: string[];
  description: string;
}

export const FACTIONS: FactionDefinition[] = [
  { id: "spirit-hall", name: "武魂殿", kind: "大陆魂师组织", headquartersId: "spirit-city", inertia: 5, description: "掌握觉醒网络、魂师登记和大量高阶战力。" },
  { id: "heaven-dou", name: "天斗帝国", kind: "帝国", headquartersId: "heaven-dou-city", inertia: 5, description: "北方帝国，贵族与魂师势力彼此牵制。" },
  { id: "star-luo", name: "星罗帝国", kind: "帝国", headquartersId: "star-luo-city", inertia: 5, description: "军政强势，皇室继承竞争残酷。" },
  { id: "shrek", name: "史莱克学院", kind: "学院", headquartersId: "shrek-village", inertia: 4, description: "规模很小，只招收天赋与实战能力突出的学生。" },
  { id: "seven-treasure", name: "七宝琉璃宗", kind: "上三宗", headquartersId: "seven-treasure-fort", inertia: 5, description: "大陆最强辅助宗门，财力和人脉雄厚。" },
  { id: "blue-lightning", name: "蓝电霸王龙宗", kind: "上三宗", headquartersId: "blue-lightning-mountain", inertia: 5, description: "以蓝电霸王龙武魂传承闻名。" },
  { id: "clear-sky", name: "昊天宗", kind: "上三宗", headquartersId: "clear-sky-mountain", inertia: 5, description: "封山隐退的强攻系宗门。" },
  { id: "tang-sect", name: "唐门", kind: "新兴宗门", headquartersId: "heaven-dou-city", inertia: 3, description: "尚未建立；满足历史条件后出现。" },
];

export const LOCATIONS: LocationDefinition[] = [
  { id: "holy-soul-village", name: "圣魂村", region: "法斯诺行省", danger: "安全", description: "诺丁城外的小村庄，以农田和铁匠铺为主。", connections: [{ id: "notting-city", minutes: 240 }] },
  { id: "notting-city", name: "诺丁城", region: "法斯诺行省", danger: "安全", description: "拥有武魂分殿和初级魂师学院的边境小城。", connections: [{ id: "holy-soul-village", minutes: 240 }, { id: "notting-academy", minutes: 20 }, { id: "soul-hunting-forest", minutes: 720 }, { id: "suotuo-city", minutes: 2880 }] },
  { id: "notting-academy", name: "诺丁初级魂师学院", region: "诺丁城", danger: "安全", description: "教授魂师基础知识，也接收工读生。", connections: [{ id: "notting-city", minutes: 20 }] },
  { id: "soul-hunting-forest", name: "猎魂森林", region: "天斗帝国", danger: "中", description: "由帝国圈养和管理的低阶魂兽森林，进入需要凭证。", connections: [{ id: "notting-city", minutes: 720 }, { id: "suotuo-city", minutes: 1440 }] },
  { id: "suotuo-city", name: "索托城", region: "巴拉克王国", danger: "低", description: "商业繁荣，拥有大斗魂场和多所魂师学院。", connections: [{ id: "notting-city", minutes: 2880 }, { id: "shrek-village", minutes: 90 }, { id: "star-dou-edge", minutes: 1440 }, { id: "heaven-dou-city", minutes: 4320 }] },
  { id: "shrek-village", name: "史莱克学院旧址", region: "索托城外", danger: "低", description: "建在村庄里的小型学院，训练条件简陋。", connections: [{ id: "suotuo-city", minutes: 90 }, { id: "star-dou-edge", minutes: 1320 }] },
  { id: "star-dou-edge", name: "星斗大森林外围", region: "大陆中部", danger: "高", description: "野生魂兽密集，越过外围后危险迅速上升。", connections: [{ id: "suotuo-city", minutes: 1440 }, { id: "shrek-village", minutes: 1320 }, { id: "star-dou-core", minutes: 720 }] },
  { id: "star-dou-core", name: "星斗大森林核心区", region: "大陆中部", danger: "禁区", description: "高年限魂兽活动区域，普通魂师不应进入。", connections: [{ id: "star-dou-edge", minutes: 720 }] },
  { id: "heaven-dou-city", name: "天斗城", region: "天斗帝国", danger: "安全", description: "帝国首都，学院、宗门和权力机关集中。", connections: [{ id: "suotuo-city", minutes: 4320 }, { id: "sunset-forest", minutes: 720 }, { id: "seven-treasure-fort", minutes: 240 }, { id: "spirit-city", minutes: 5760 }] },
  { id: "sunset-forest", name: "落日森林", region: "天斗城外", danger: "高", description: "野生魂兽森林，内部地形复杂。", connections: [{ id: "heaven-dou-city", minutes: 720 }, { id: "ice-fire-spring", minutes: 360 }] },
  { id: "ice-fire-spring", name: "冰火两仪眼", region: "落日森林深处", danger: "禁区", description: "被毒阵遮蔽的特殊宝地，默认不对外公开。", connections: [{ id: "sunset-forest", minutes: 360 }] },
  { id: "seven-treasure-fort", name: "七宝琉璃宗", region: "天斗城外", danger: "安全", description: "守卫严密的宗门驻地。", connections: [{ id: "heaven-dou-city", minutes: 240 }] },
  { id: "spirit-city", name: "武魂城", region: "两大帝国之间", danger: "低", description: "武魂殿总部所在，魂师秩序严格。", connections: [{ id: "heaven-dou-city", minutes: 5760 }, { id: "star-luo-city", minutes: 5760 }] },
  { id: "star-luo-city", name: "星罗城", region: "星罗帝国", danger: "低", description: "星罗帝国首都，军队与皇室力量集中。", connections: [{ id: "spirit-city", minutes: 5760 }] },
  { id: "blue-lightning-mountain", name: "蓝电霸王龙宗", region: "天斗帝国", danger: "低", description: "上三宗之一的宗门驻地。", connections: [{ id: "heaven-dou-city", minutes: 1440 }] },
  { id: "clear-sky-mountain", name: "昊天宗隐居地", region: "天斗帝国群山", danger: "高", description: "道路险峻，外人很难找到。", connections: [{ id: "heaven-dou-city", minutes: 2880 }] },
];

export const CANON_CHARACTERS: CanonCharacterDefinition[] = [
  { id: "tang-san", name: "唐三", aliases: [], importance: 5, birthYear: -6, martialSouls: ["蓝银草", "昊天锤"], factionIds: ["shrek", "clear-sky", "tang-sect"], initialLocationId: "holy-soul-village", personality: ["克制", "重情", "谨慎", "意志坚定"], goals: ["保护亲友", "追寻身世", "重建唐门"], powerSnapshots: [{ year: 0, soulRank: 10, tier: "初次觉醒", note: "先天满魂力" }, { year: 6, soulRank: 29, tier: "大魂师", note: "准备进入史莱克学院" }, { year: 8, soulRank: 40, tier: "魂宗", note: "全大陆高级魂师学院精英大赛时期" }, { year: 13, soulRank: 59, tier: "魂王", note: "五年之约前后" }] },
  { id: "xiao-wu", name: "小舞", aliases: [], importance: 5, birthYear: -6, martialSouls: ["柔骨兔"], factionIds: ["shrek"], initialLocationId: "star-dou-core", personality: ["直率", "重情", "敢爱敢恨"], goals: ["在人类世界生活", "保护重要的人"], powerSnapshots: [{ year: 0, soulRank: 10, tier: "初次入学", note: "化形魂兽身份隐藏" }, { year: 6, soulRank: 29, tier: "大魂师", note: "进入史莱克学院" }, { year: 8, soulRank: 40, tier: "魂宗", note: "魂师大赛时期" }] },
  { id: "tang-hao", name: "唐昊", aliases: ["昊天斗罗"], importance: 5, martialSouls: ["昊天锤"], factionIds: ["clear-sky"], initialLocationId: "holy-soul-village", personality: ["沉默", "重情", "自责", "护短"], goals: ["保护唐三", "等待复活阿银的机会"], powerSnapshots: [{ year: 0, soulRank: 95, tier: "超级斗罗", note: "带伤隐居" }, { year: 13, soulRank: 97, tier: "超级斗罗", note: "旧伤处理后" }] },
  { id: "yu-xiaogang", name: "玉小刚", aliases: ["大师"], importance: 5, martialSouls: ["罗三炮"], factionIds: ["blue-lightning", "shrek"], initialLocationId: "notting-academy", personality: ["理性", "固执", "自尊", "重视理论"], goals: ["证明武魂理论", "培养弟子"], powerSnapshots: [{ year: 0, soulRank: 29, tier: "大魂师", note: "长期受武魂缺陷限制" }] },
  { id: "dai-mubai", name: "戴沐白", aliases: ["邪眸白虎"], importance: 4, birthYear: -9, martialSouls: ["白虎"], factionIds: ["shrek", "star-luo"], initialLocationId: "star-luo-city", personality: ["骄傲", "豪爽", "有担当"], goals: ["摆脱皇室淘汰", "保护同伴"], powerSnapshots: [{ year: 6, soulRank: 37, tier: "魂尊", note: "史莱克学员" }, { year: 8, soulRank: 45, tier: "魂宗", note: "魂师大赛时期" }] },
  { id: "zhu-zhuqing", name: "朱竹清", aliases: ["幽冥灵猫"], importance: 4, birthYear: -7, martialSouls: ["幽冥灵猫"], factionIds: ["shrek", "star-luo"], initialLocationId: "star-luo-city", personality: ["冷静", "自律", "执着"], goals: ["改变被淘汰的命运", "追上戴沐白"], powerSnapshots: [{ year: 6, soulRank: 27, tier: "大魂师", note: "进入史莱克学院" }, { year: 8, soulRank: 40, tier: "魂宗", note: "魂师大赛时期" }] },
  { id: "ning-rongrong", name: "宁荣荣", aliases: ["七宝琉璃"], importance: 4, birthYear: -6, martialSouls: ["七宝琉璃塔"], factionIds: ["shrek", "seven-treasure"], initialLocationId: "seven-treasure-fort", personality: ["聪明", "骄傲", "重视同伴"], goals: ["证明自己", "守护宗门"], powerSnapshots: [{ year: 6, soulRank: 26, tier: "大魂师", note: "进入史莱克学院" }, { year: 8, soulRank: 40, tier: "魂宗", note: "魂师大赛时期" }] },
  { id: "ao-si-ka", name: "奥斯卡", aliases: ["香肠专卖"], importance: 4, birthYear: -8, martialSouls: ["香肠"], factionIds: ["shrek"], initialLocationId: "shrek-village", personality: ["机灵", "坚韧", "重感情"], goals: ["成为强大的食物系魂师", "获得认可"], powerSnapshots: [{ year: 6, soulRank: 29, tier: "大魂师", note: "史莱克学员" }, { year: 8, soulRank: 41, tier: "魂宗", note: "魂师大赛时期" }] },
  { id: "ma-hongjun", name: "马红俊", aliases: ["邪火凤凰"], importance: 4, birthYear: -7, martialSouls: ["邪火凤凰"], factionIds: ["shrek"], initialLocationId: "shrek-village", personality: ["直率", "贪吃", "重义气"], goals: ["控制邪火", "成为强攻系魂师"], powerSnapshots: [{ year: 6, soulRank: 28, tier: "大魂师", note: "史莱克学员" }, { year: 8, soulRank: 43, tier: "魂宗", note: "魂师大赛时期" }] },
  { id: "flender", name: "弗兰德", aliases: ["四眼猫鹰"], importance: 4, martialSouls: ["猫鹰"], factionIds: ["shrek"], initialLocationId: "shrek-village", personality: ["护短", "务实", "吝啬", "重视学生"], goals: ["维持史莱克学院", "培养怪物学员"], powerSnapshots: [{ year: 6, soulRank: 78, tier: "魂圣", note: "史莱克院长" }] },
  { id: "zhao-wuji", name: "赵无极", aliases: ["不动明王"], importance: 3, martialSouls: ["大力金刚熊"], factionIds: ["shrek"], initialLocationId: "shrek-village", personality: ["强硬", "护短", "实战派"], goals: ["训练学生", "保护学院"], powerSnapshots: [{ year: 6, soulRank: 76, tier: "魂圣", note: "史莱克副院长" }] },
  { id: "ning-fengzhi", name: "宁风致", aliases: ["宁宗主"], importance: 5, martialSouls: ["七宝琉璃塔"], factionIds: ["seven-treasure", "heaven-dou"], initialLocationId: "seven-treasure-fort", personality: ["温和", "理性", "善于权衡"], goals: ["维持宗门安全", "寻找突破武魂限制的可能"], powerSnapshots: [{ year: 6, soulRank: 79, tier: "魂圣", note: "七宝琉璃宗宗主" }] },
  { id: "chen-xin", name: "尘心", aliases: ["剑斗罗"], importance: 4, martialSouls: ["七杀剑"], factionIds: ["seven-treasure"], initialLocationId: "seven-treasure-fort", personality: ["孤傲", "专注", "护短"], goals: ["追求剑道", "守护宗门"], powerSnapshots: [{ year: 6, soulRank: 96, tier: "超级斗罗", note: "七宝琉璃宗护宗长老" }] },
  { id: "dugu-bo", name: "独孤博", aliases: ["毒斗罗"], importance: 4, martialSouls: ["碧磷蛇皇"], factionIds: ["heaven-dou"], initialLocationId: "ice-fire-spring", personality: ["孤僻", "护短", "恩怨分明"], goals: ["解决家族毒患", "保护独孤雁"], powerSnapshots: [{ year: 7, soulRank: 91, tier: "封号斗罗", note: "受自身剧毒反噬" }] },
  { id: "bibi-dong", name: "比比东", aliases: ["教皇"], importance: 5, martialSouls: ["死亡蛛皇", "噬魂蛛皇"], factionIds: ["spirit-hall"], initialLocationId: "spirit-city", personality: ["冷静", "强势", "多疑", "意志极强"], goals: ["掌控武魂殿", "改变大陆权力结构"], powerSnapshots: [{ year: 6, tier: "封号斗罗顶尖", note: "武魂殿教皇，真实能力严格保密" }, { year: 13, soulRank: 99, tier: "绝世斗罗", note: "接近神位终考阶段" }] },
  { id: "qian-renxue", name: "千仞雪", aliases: ["雪清河"], importance: 5, martialSouls: ["六翼天使"], factionIds: ["spirit-hall", "heaven-dou"], initialLocationId: "heaven-dou-city", personality: ["克制", "骄傲", "善于伪装"], goals: ["完成天斗潜伏", "继承天使神位"], powerSnapshots: [{ year: 6, tier: "魂师精英", note: "以雪清河身份潜伏" }, { year: 13, tier: "封号斗罗以上", note: "天使神考阶段" }] },
  { id: "huliena", name: "胡列娜", aliases: ["武魂殿圣女"], importance: 4, martialSouls: ["妖狐"], factionIds: ["spirit-hall"], initialLocationId: "spirit-city", personality: ["聪明", "坚韧", "重视同伴"], goals: ["证明自己", "完成教皇交付的任务"], powerSnapshots: [{ year: 8, soulRank: 51, tier: "魂王", note: "武魂殿黄金一代" }] },
];

export const CANON_EVENTS: CanonEventDefinition[] = [
  { id: "tang-awakening", year: 0, title: "唐三与小舞进入诺丁学院", locationId: "notting-academy", participantIds: ["tang-san", "xiao-wu", "yu-xiaogang"], inertia: 5, publicSummary: "诺丁学院迎来两名先天满魂力的新生。" },
  { id: "shrek-enrollment", year: 6, title: "史莱克七怪聚首", locationId: "shrek-village", participantIds: ["tang-san", "xiao-wu", "dai-mubai", "zhu-zhuqing", "ning-rongrong", "ao-si-ka", "ma-hongjun"], inertia: 5, publicSummary: "数名年轻魂师进入史莱克学院。" },
  { id: "academy-tournament", year: 8, title: "全大陆高级魂师学院精英大赛", locationId: "spirit-city", participantIds: ["tang-san", "xiao-wu", "dai-mubai", "zhu-zhuqing", "ning-rongrong", "ao-si-ka", "ma-hongjun", "bibi-dong", "huliena"], inertia: 5, publicSummary: "两大帝国与武魂殿共同关注的学院赛事举行。" },
  { id: "five-year-reunion", year: 13, title: "史莱克五年之约", locationId: "heaven-dou-city", participantIds: ["tang-san", "dai-mubai", "zhu-zhuqing", "ning-rongrong", "ao-si-ka", "ma-hongjun"], inertia: 4, publicSummary: "昔日史莱克学员约定重聚。" },
  { id: "continental-war", year: 18, title: "大陆战争进入决战", locationId: "spirit-city", participantIds: ["tang-san", "bibi-dong", "qian-renxue"], inertia: 5, publicSummary: "帝国与武魂帝国的冲突改写大陆秩序。" },
];

export const SOUL_BEASTS: SoulBeastDefinition[] = [
  { id: "wind-baboon", name: "风狒狒", habitats: ["soul-hunting-forest", "star-dou-edge"], attributes: ["风", "力量"], ageRange: [10, 160], danger: 1, possibleSkills: ["风压", "冲撞"], description: "群居的低阶魂兽，动作快，个体威胁有限。" },
  { id: "lone-wolf", name: "幽冥狼", habitats: ["soul-hunting-forest", "star-dou-edge"], attributes: ["速度", "暗"], ageRange: [30, 600], danger: 2, possibleSkills: ["幽影突袭", "狼嚎震慑"], description: "擅长夜间追踪和包围。" },
  { id: "datura-snake", name: "曼陀罗蛇", habitats: ["soul-hunting-forest", "star-dou-edge"], attributes: ["毒", "韧性"], ageRange: [100, 1800], danger: 3, possibleSkills: ["毒性缠绕", "蛇身强化"], description: "毒性会随年限增强，鳞甲坚韧。" },
  { id: "iron-shell-turtle", name: "铁甲龟", habitats: ["soul-hunting-forest", "sunset-forest"], attributes: ["防御", "土"], ageRange: [50, 2400], danger: 2, possibleSkills: ["甲盾", "震地"], description: "移动缓慢，防御远强于攻击。" },
  { id: "green-vine", name: "青藤魂兽", habitats: ["soul-hunting-forest", "sunset-forest"], attributes: ["植物", "控制"], ageRange: [20, 900], danger: 2, possibleSkills: ["藤蔓缠绕", "生长恢复"], description: "伪装成普通植物，适合控制系武魂。" },
  { id: "golden-owl", name: "金眼夜枭", habitats: ["star-dou-edge", "sunset-forest"], attributes: ["精神", "飞行"], ageRange: [200, 3200], danger: 3, possibleSkills: ["夜视", "精神尖啸"], description: "警觉且难以接近，夜间战力更强。" },
  { id: "cockscomb-snake", name: "凤尾鸡冠蛇", habitats: ["star-dou-edge"], attributes: ["速度", "飞行"], ageRange: [500, 4000], danger: 3, possibleSkills: ["高速飞行", "速度增幅"], description: "本身攻击性有限，逃跑速度极快。" },
  { id: "human-faced-spider", name: "人面魔蛛", habitats: ["star-dou-edge", "star-dou-core"], attributes: ["毒", "控制", "吞噬"], ageRange: [500, 12000], danger: 5, possibleSkills: ["蛛网束缚", "剧毒突刺"], description: "攻击性强，毒素危险，越级猎杀风险极高。" },
  { id: "earth-bear", name: "大地暴熊", habitats: ["star-dou-edge", "sunset-forest"], attributes: ["力量", "土"], ageRange: [300, 8000], danger: 4, possibleSkills: ["大地震击", "狂暴强化"], description: "正面力量强，领地意识明显。" },
  { id: "mist-deer", name: "雾隐鹿", habitats: ["star-dou-edge", "sunset-forest"], attributes: ["感知", "幻雾"], ageRange: [100, 5000], danger: 2, possibleSkills: ["雾隐", "危险感知"], description: "很少主动攻击，极难追踪。" },
  { id: "thunder-lizard", name: "雷纹蜥", habitats: ["sunset-forest", "star-dou-edge"], attributes: ["雷", "爆发"], ageRange: [400, 9000], danger: 4, possibleSkills: ["雷击", "电流护体"], description: "爆发力强，受伤后更加凶暴。" },
  { id: "crystal-scorpion", name: "晶甲蝎", habitats: ["sunset-forest"], attributes: ["金属", "毒"], ageRange: [200, 6000], danger: 4, possibleSkills: ["晶甲", "毒尾穿刺"], description: "甲壳坚硬，尾刺能穿透轻甲。" },
];

export function locationById(id: string): LocationDefinition | undefined {
  return LOCATIONS.find((location) => location.id === id);
}

export function soulBeastById(id: string): SoulBeastDefinition | undefined {
  return SOUL_BEASTS.find((beast) => beast.id === id);
}

export function characterById(id: string): CanonCharacterDefinition | undefined {
  return CANON_CHARACTERS.find((character) => character.id === id);
}
