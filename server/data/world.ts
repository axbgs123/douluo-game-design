export type ImportanceTier = 1 | 2 | 3 | 4 | 5;
import { EXPANDED_CHARACTERS, EXPANDED_EVENTS, EXPANDED_FACTIONS, EXPANDED_LOCATIONS, EXPANDED_SOUL_BEASTS } from "./expanded-world-catalog.js";

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
  deathYear?: number;
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
  activeFromYear?: number;
  activeUntilYear?: number;
  hidden?: boolean;
}

export interface LocationDefinition {
  id: string;
  name: string;
  region: string;
  danger: "安全" | "低" | "中" | "高" | "禁区";
  description: string;
  connections: Array<{ id: string; minutes: number }>;
  availableFromYear?: number;
  hidden?: boolean;
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
  { id: "heaven-royal-academy", name: "天斗皇家学院", kind: "皇家学院", headquartersId: "heaven-royal-academy", inertia: 4, description: "依托皇室资源招收贵族魂师，也有秦明等重视实战的教师。" },
  { id: "five-elements", name: "五元素学院", kind: "学院联盟", headquartersId: "heaven-dou-city", inertia: 3, description: "雷霆、神风、天水、炽火和象甲五所学院的统称，各自专精一种路线。" },
  { id: "elephant-sect", name: "象甲宗", kind: "下四宗", headquartersId: "elephant-sect-fort", inertia: 3, description: "以钻石猛犸和极端防御闻名，与武魂殿关系紧密。" },
  { id: "strength-clan", name: "力之一族", kind: "单属性宗族", headquartersId: "strength-clan-estate", inertia: 3, description: "擅长力量与锻造，脱离昊天宗后在天斗城经营家业。" },
  { id: "defense-clan", name: "御之一族", kind: "单属性宗族", headquartersId: "longxing-city", inertia: 3, description: "擅长防御和建筑，在龙兴城拥有稳定基业。" },
  { id: "speed-clan", name: "敏之一族", kind: "单属性宗族", headquartersId: "heaven-dou-city", inertia: 3, description: "以尖尾雨燕武魂和侦察速度见长，经济状况拮据。" },
  { id: "breaking-clan", name: "破之一族", kind: "单属性宗族", headquartersId: "star-luo-city", inertia: 3, description: "以破魂枪、炼药和纯粹攻击力闻名，对昊天宗积怨很深。" },
  { id: "iron-association", name: "铁匠协会", kind: "行业组织", headquartersId: "gengxin-city", inertia: 2, description: "掌握大陆金属交易和高级锻造人才，总会位于庚辛城。" },
  { id: "sea-god-island", name: "海神岛", kind: "海魂师圣地", headquartersId: "sea-god-island", inertia: 5, description: "由海神斗罗和七圣柱守护，对大陆魂师保持距离。" },
  { id: "slaughter-city", name: "杀戮之都", kind: "封闭试炼地", headquartersId: "slaughter-city", inertia: 5, description: "禁止使用魂技的血腥秩序，由杀戮之王统治。" },
  { id: "purple-pearl", name: "紫珍珠海盗团", kind: "海上势力", headquartersId: "purple-pearl-island", inertia: 2, description: "盘踞近海群岛，在海盗、护航和岛民生计之间维持自己的规矩。" },
  { id: "black-huai", name: "黑槐会", kind: "原创地下组织", headquartersId: "suotuo-city", inertia: 1, description: "替贵族和商会处理走私、追债与秘密委托，内部派系并不稳定。" },
  { id: "taixuan-sword", name: "太玄剑宗", kind: "原创隐世宗门", headquartersId: "taixuan-valley", inertia: 1, description: "依靠封山阵势与残缺剑道传承自保，强者受旧誓限制，不能随意干预大陆。" },
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
  { id: "ice-fire-spring", name: "冰火两仪眼", region: "落日森林深处", danger: "禁区", description: "被毒阵遮蔽的特殊宝地，默认不对外公开。", connections: [{ id: "sunset-forest", minutes: 360 }], hidden: true },
  { id: "seven-treasure-fort", name: "七宝琉璃宗", region: "天斗城外", danger: "安全", description: "守卫严密的宗门驻地。", connections: [{ id: "heaven-dou-city", minutes: 240 }] },
  { id: "spirit-city", name: "武魂城", region: "两大帝国之间", danger: "低", description: "武魂殿总部所在，魂师秩序严格。", connections: [{ id: "heaven-dou-city", minutes: 5760 }, { id: "star-luo-city", minutes: 5760 }] },
  { id: "star-luo-city", name: "星罗城", region: "星罗帝国", danger: "低", description: "星罗帝国首都，军队与皇室力量集中。", connections: [{ id: "spirit-city", minutes: 5760 }] },
  { id: "blue-lightning-mountain", name: "蓝电霸王龙宗", region: "天斗帝国", danger: "低", description: "上三宗之一的宗门驻地。", connections: [{ id: "heaven-dou-city", minutes: 1440 }] },
  { id: "clear-sky-mountain", name: "昊天宗隐居地", region: "天斗帝国群山", danger: "高", description: "道路险峻，外人很难找到。", connections: [{ id: "heaven-dou-city", minutes: 2880 }] },
  { id: "heaven-royal-academy", name: "天斗皇家学院", region: "天斗城外", danger: "安全", description: "建在山林中的皇家学院，师资和拟态修炼场远胜普通学院。", connections: [{ id: "heaven-dou-city", minutes: 90 }, { id: "sunset-forest", minutes: 600 }] },
  { id: "strength-clan-estate", name: "力之一族府邸", region: "天斗城", danger: "低", description: "兼具宗族住地、锻造工坊和仓库的大片院落。", connections: [{ id: "heaven-dou-city", minutes: 35 }] },
  { id: "gengxin-city", name: "庚辛城", region: "星罗帝国", danger: "低", description: "大陆金属之都，铁匠协会总会和庞大金属市场位于此处。", connections: [{ id: "star-luo-city", minutes: 2880 }, { id: "longxing-city", minutes: 2160 }] },
  { id: "longxing-city", name: "龙兴城", region: "两大帝国边界", danger: "低", description: "御之一族扎根的边境城市，也是单属性四宗族聚会地点。", connections: [{ id: "gengxin-city", minutes: 2160 }, { id: "heaven-dou-city", minutes: 3600 }, { id: "star-luo-city", minutes: 3600 }] },
  { id: "elephant-sect-fort", name: "象甲宗山城", region: "天斗帝国南部", danger: "低", description: "石墙厚重，宗门训练场专为大型防御兽武魂修建。", connections: [{ id: "heaven-dou-city", minutes: 2400 }, { id: "suotuo-city", minutes: 2160 }] },
  { id: "hurricane-academy", name: "神风学院", region: "天斗帝国", danger: "安全", description: "专长风属性与飞行魂师，风笑天所在学院。", connections: [{ id: "heaven-dou-city", minutes: 1200 }] },
  { id: "blazing-academy", name: "炽火学院", region: "天斗帝国", danger: "安全", description: "专长火属性武魂，训练场长期保持高温。", connections: [{ id: "heaven-dou-city", minutes: 1080 }] },
  { id: "skywater-academy", name: "天水学院", region: "天斗帝国北部", danger: "安全", description: "只招收女性学员，以水与冰属性配合闻名。", connections: [{ id: "heaven-dou-city", minutes: 1680 }, { id: "extreme-north-edge", minutes: 2880 }] },
  { id: "extreme-north-edge", name: "极北之地外围", region: "斗罗大陆极北", danger: "高", description: "暴雪、低温和冰属性魂兽构成天然屏障，普通补给在这里很快失效。", connections: [{ id: "skywater-academy", minutes: 2880 }, { id: "extreme-north-core", minutes: 2160 }] },
  { id: "extreme-north-core", name: "极北核心圈", region: "斗罗大陆极北", danger: "禁区", description: "极致之冰魂兽统治的生命禁区，冰帝与雪帝在第一部时代已经存在。", connections: [{ id: "extreme-north-edge", minutes: 2160 }] },
  { id: "thunder-academy", name: "雷霆学院", region: "蓝电霸王龙宗势力范围", danger: "安全", description: "专长雷属性攻击，与蓝电霸王龙宗关系深厚。", connections: [{ id: "blue-lightning-mountain", minutes: 360 }, { id: "heaven-dou-city", minutes: 1320 }] },
  { id: "slaughter-city", name: "杀戮之都", region: "大陆地下", danger: "禁区", description: "隔绝外界的血腥试炼地，常规魂技受到限制。", connections: [{ id: "star-luo-city", minutes: 7200 }] },
  { id: "vast-sea-city", name: "瀚海城", region: "天斗帝国西海岸", danger: "低", description: "出海前的重要港口，海魂师、商船和拍卖场聚集。", connections: [{ id: "heaven-dou-city", minutes: 7200 }, { id: "purple-pearl-island", minutes: 2880 }] },
  { id: "purple-pearl-island", name: "紫珍珠岛", region: "西海群岛", danger: "中", description: "海盗团与岛民共同生活的岛屿，外来船只会被严格盘查。", connections: [{ id: "vast-sea-city", minutes: 2880 }, { id: "sea-god-island", minutes: 4320 }] },
  { id: "sea-god-island", name: "海神岛", region: "远海", danger: "禁区", description: "七圣柱环绕的海魂师圣地，考核会按来者情况改变。", connections: [{ id: "purple-pearl-island", minutes: 4320 }, { id: "whale-sea", minutes: 3600 }] },
  { id: "whale-sea", name: "魔鲸海域", region: "远海", danger: "禁区", description: "深海魔鲸王活动的危险海域，普通船只不会靠近。", connections: [{ id: "sea-god-island", minutes: 3600 }] },
  { id: "taixuan-valley", name: "太玄剑宗封山剑谷", region: "星斗大森林西北", danger: "高", description: "原创隐世宗门驻地，山谷阵势能阻隔大部分外来者。", connections: [{ id: "star-dou-edge", minutes: 540 }] },
  { id: "spirit-hall-prison", name: "武魂城裁决地牢", region: "武魂城", danger: "高", description: "关押重要犯人与禁术魂师的地下设施，资料不对普通魂师公开。", connections: [{ id: "spirit-city", minutes: 30 }], hidden: true },
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
  { id: "gui-mei", name: "鬼魅", aliases: ["鬼斗罗"], importance: 4, martialSouls: ["鬼魅"], factionIds: ["spirit-hall"], initialLocationId: "spirit-city", personality: ["寡言", "服从", "行动隐秘"], goals: ["执行教皇命令", "维持武魂殿威慑"], powerSnapshots: [{ year: 8, tier: "封号斗罗", note: "武魂殿长老" }] },
  { id: "yue-guan", name: "月关", aliases: ["菊斗罗"], importance: 4, martialSouls: ["奇茸通天菊"], factionIds: ["spirit-hall"], initialLocationId: "spirit-city", personality: ["讲究", "敏锐", "重视天材地宝"], goals: ["执行教皇命令", "收集珍稀植物"], powerSnapshots: [{ year: 8, tier: "封号斗罗", note: "武魂殿长老" }] },
  { id: "dugu-yan", name: "独孤雁", aliases: [], importance: 3, birthYear: -8, martialSouls: ["碧磷蛇"], factionIds: ["heaven-dou"], initialLocationId: "heaven-dou-city", personality: ["骄傲", "护短", "直率"], goals: ["提升实力", "保护同伴与祖父"], powerSnapshots: [{ year: 8, tier: "魂宗", note: "天斗皇家学院战队" }] },
  { id: "ye-lingling", name: "叶泠泠", aliases: [], importance: 3, martialSouls: ["九心海棠"], factionIds: ["heaven-dou"], initialLocationId: "heaven-dou-city", personality: ["安静", "克制", "专注治疗"], goals: ["延续家族传承", "保护队友"], powerSnapshots: [{ year: 8, tier: "魂宗", note: "天斗皇家学院战队" }] },
  { id: "meng-shu", name: "孟蜀", aliases: ["龙公"], importance: 3, martialSouls: ["龙杖"], factionIds: [], initialLocationId: "star-dou-edge", personality: ["老练", "护短", "看重家族"], goals: ["保护家人", "寻找合适魂环"], powerSnapshots: [{ year: 6, tier: "魂斗罗", note: "与朝天香联手实力更强" }] },
  { id: "chao-tianxiang", name: "朝天香", aliases: ["蛇婆"], importance: 3, martialSouls: ["蛇杖"], factionIds: [], initialLocationId: "star-dou-edge", personality: ["谨慎", "强硬", "护短"], goals: ["保护孟依然", "维持家族利益"], powerSnapshots: [{ year: 6, tier: "魂帝", note: "与孟蜀共同活动" }] },
  { id: "meng-yiran", name: "孟依然", aliases: [], importance: 3, birthYear: -9, martialSouls: ["蛇杖"], factionIds: [], initialLocationId: "star-dou-edge", personality: ["好胜", "直接", "重视家人"], goals: ["获得合适魂环", "证明自身实力"], powerSnapshots: [{ year: 6, tier: "魂尊", note: "在星斗大森林猎魂" }] },
  { id: "tai-tan", name: "泰坦", aliases: ["大力神"], importance: 3, martialSouls: ["大力猩猩"], factionIds: ["clear-sky", "tang-sect"], initialLocationId: "heaven-dou-city", personality: ["忠诚", "强硬", "擅长锻造"], goals: ["维持力之一族", "寻找昊天宗旧主消息"], powerSnapshots: [{ year: 8, tier: "魂斗罗", note: "力之一族族长" }] },
  { id: "yang-wudi", name: "杨无敌", aliases: [], importance: 3, martialSouls: ["破魂枪"], factionIds: ["tang-sect"], initialLocationId: "star-luo-city", personality: ["孤傲", "专注", "恩怨分明"], goals: ["维持破之一族", "钻研药物与攻击"], powerSnapshots: [{ year: 13, tier: "魂斗罗", note: "破之一族族长" }] },
  { id: "bai-he", name: "白鹤", aliases: [], importance: 3, martialSouls: ["尖尾雨燕"], factionIds: ["tang-sect"], initialLocationId: "heaven-dou-city", personality: ["重情", "自尊", "善于侦察"], goals: ["维持敏之一族", "保护族人"], powerSnapshots: [{ year: 13, tier: "魂斗罗", note: "敏之一族族长" }] },
  { id: "niu-gao", name: "牛皋", aliases: [], importance: 3, martialSouls: ["板甲巨犀"], factionIds: ["tang-sect"], initialLocationId: "star-luo-city", personality: ["豪爽", "固执", "重视族人"], goals: ["维持御之一族", "改善族人生计"], powerSnapshots: [{ year: 13, tier: "魂斗罗", note: "御之一族族长" }] },
  { id: "xue-ye", name: "雪夜大帝", aliases: [], importance: 4, martialSouls: [], factionIds: ["heaven-dou"], initialLocationId: "heaven-dou-city", personality: ["克制", "重视平衡", "年迈多疑"], goals: ["维持帝国稳定", "安排继承与盟友"], powerSnapshots: [{ year: 8, tier: "帝国统治者", note: "个人战力并非主要影响来源" }] },
  { id: "xue-xing", name: "雪星亲王", aliases: [], importance: 3, martialSouls: [], factionIds: ["heaven-dou"], initialLocationId: "heaven-dou-city", personality: ["傲慢", "善于权衡", "维护皇室"], goals: ["保住皇室权力", "扶持亲近势力"], powerSnapshots: [{ year: 8, tier: "皇室亲王", note: "影响来自身份与人脉" }] },
  { id: "gu-rong", name: "古榕", aliases: ["骨斗罗"], importance: 4, martialSouls: ["骨龙"], factionIds: ["seven-treasure"], initialLocationId: "seven-treasure-fort", personality: ["诡谲", "护短", "嘴硬心软"], goals: ["守护七宝琉璃宗", "照看宁荣荣"], powerSnapshots: [{ year: 6, soulRank: 95, tier: "超级斗罗", note: "以诡变与空间能力闻名" }] },
  { id: "liu-erlong", name: "柳二龙", aliases: ["杀戮之角"], importance: 4, martialSouls: ["火龙"], factionIds: ["shrek", "blue-lightning"], initialLocationId: "heaven-dou-city", personality: ["直率", "暴烈", "重情", "护短"], goals: ["维持蓝霸学院", "解决与玉小刚的旧事"], powerSnapshots: [{ year: 7, soulRank: 78, tier: "魂圣", note: "黄金铁三角杀戮之角" }] },
  { id: "qin-ming", name: "秦明", aliases: [], importance: 3, martialSouls: ["烈火苍狼"], factionIds: ["shrek", "heaven-royal-academy"], initialLocationId: "heaven-royal-academy", personality: ["温和", "负责", "重视实战"], goals: ["培养皇斗战队", "帮助史莱克后辈"], powerSnapshots: [{ year: 6, soulRank: 62, tier: "魂帝", note: "年轻魂帝，皇斗战队领队" }] },
  { id: "yu-tianheng", name: "玉天恒", aliases: [], importance: 3, birthYear: -13, martialSouls: ["蓝电霸王龙"], factionIds: ["blue-lightning", "heaven-royal-academy"], initialLocationId: "heaven-royal-academy", personality: ["沉稳", "骄傲", "重视队伍"], goals: ["带领皇斗战队", "证明嫡系实力"], powerSnapshots: [{ year: 6, soulRank: 39, tier: "魂尊", note: "皇斗战队队长" }, { year: 8, soulRank: 43, tier: "魂宗", note: "学院精英" }] },
  { id: "feng-xiaotian", name: "风笑天", aliases: [], importance: 3, birthYear: -13, martialSouls: ["疾风双头狼"], factionIds: ["five-elements"], initialLocationId: "hurricane-academy", personality: ["自信", "执着", "重情", "好胜"], goals: ["完善疾风魔狼三十六连斩", "赢得火舞认可"], powerSnapshots: [{ year: 8, soulRank: 44, tier: "魂宗", note: "神风学院战队队长" }] },
  { id: "huo-wu", name: "火舞", aliases: [], importance: 3, birthYear: -12, martialSouls: ["火影"], factionIds: ["five-elements"], initialLocationId: "blazing-academy", personality: ["骄傲", "好胜", "直接"], goals: ["击败强敌", "证明炽火学院"], powerSnapshots: [{ year: 8, soulRank: 43, tier: "魂宗", note: "炽火学院战队灵魂" }] },
  { id: "huo-wushuang", name: "火无双", aliases: [], importance: 2, birthYear: -13, martialSouls: ["独角火暴龙"], factionIds: ["five-elements"], initialLocationId: "blazing-academy", personality: ["稳重", "好胜", "爱护妹妹"], goals: ["带领炽火学院", "保护火舞"], powerSnapshots: [{ year: 8, soulRank: 42, tier: "魂宗", note: "炽火学院战队队长" }] },
  { id: "shui-binger", name: "水冰儿", aliases: [], importance: 3, birthYear: -12, martialSouls: ["冰凤凰"], factionIds: ["five-elements"], initialLocationId: "skywater-academy", personality: ["冷静", "负责", "善于判断"], goals: ["带领天水学院", "掌握冰凤凰力量"], powerSnapshots: [{ year: 8, soulRank: 43, tier: "魂宗", note: "天水学院战队队长" }] },
  { id: "hu-yan-zhen", name: "呼延震", aliases: ["天象"], importance: 3, martialSouls: ["钻石猛犸"], factionIds: ["elephant-sect", "spirit-hall"], initialLocationId: "elephant-sect-fort", personality: ["强势", "护短", "重视宗门"], goals: ["壮大象甲宗", "维持武魂殿支持"], powerSnapshots: [{ year: 8, soulRank: 89, tier: "魂斗罗", note: "象甲宗宗主，防御惊人" }] },
  { id: "xie-yue", name: "邪月", aliases: [], importance: 3, birthYear: -15, martialSouls: ["月刃"], factionIds: ["spirit-hall"], initialLocationId: "spirit-city", personality: ["冷静", "重视妹妹", "服从大局"], goals: ["带领黄金一代", "保护胡列娜"], powerSnapshots: [{ year: 8, soulRank: 52, tier: "魂王", note: "武魂殿黄金一代" }] },
  { id: "yan", name: "焱", aliases: [], importance: 3, birthYear: -15, martialSouls: ["火焰领主"], factionIds: ["spirit-hall"], initialLocationId: "spirit-city", personality: ["强硬", "冲动", "好胜"], goals: ["证明自己", "赢得胡列娜认可"], powerSnapshots: [{ year: 8, soulRank: 52, tier: "魂王", note: "武魂殿黄金一代" }] },
  { id: "qian-daoliu", name: "千道流", aliases: ["天使斗罗", "大供奉"], importance: 5, martialSouls: ["六翼天使"], factionIds: ["spirit-hall"], initialLocationId: "spirit-city", personality: ["威严", "克制", "信奉天使神"], goals: ["守护天使传承", "培养千仞雪"], powerSnapshots: [{ year: 0, soulRank: 99, tier: "绝世斗罗", note: "武魂殿大供奉" }] },
  { id: "tang-xiao", name: "唐啸", aliases: ["啸天斗罗"], importance: 4, martialSouls: ["昊天锤"], factionIds: ["clear-sky"], initialLocationId: "clear-sky-mountain", personality: ["稳重", "顾全宗门", "重情"], goals: ["维持昊天宗", "处理唐昊旧事"], powerSnapshots: [{ year: 13, soulRank: 96, tier: "超级斗罗", note: "昊天宗宗主" }] },
  { id: "tang-yuehua", name: "唐月华", aliases: ["月华夫人"], importance: 3, martialSouls: ["如意环"], factionIds: ["clear-sky", "heaven-dou"], initialLocationId: "heaven-dou-city", personality: ["优雅", "聪慧", "重视亲情"], goals: ["经营月轩", "维护昊天宗与皇室关系"], powerSnapshots: [{ year: 13, soulRank: 9, tier: "贵族礼仪名师", note: "魂力受限，拥有贵族圆环领域" }] },
  { id: "salas", name: "萨拉斯", aliases: ["白金主教"], importance: 3, martialSouls: [], factionIds: ["spirit-hall"], initialLocationId: "heaven-dou-city", personality: ["傲慢", "警觉", "善于施压"], goals: ["扩大武魂殿影响", "监控学院天才"], powerSnapshots: [{ year: 8, tier: "白金主教", note: "天斗城武魂圣殿殿主" }] },
  { id: "xue-beng", name: "雪崩", aliases: ["四皇子"], importance: 4, birthYear: -17, martialSouls: ["天鹅"], factionIds: ["heaven-dou"], initialLocationId: "heaven-dou-city", personality: ["善于伪装", "隐忍", "现实"], goals: ["活过皇室清洗", "等待翻盘机会"], powerSnapshots: [{ year: 7, tier: "皇室学员", note: "以纨绔形象自保" }, { year: 17, tier: "帝国继承人", note: "皇室政变时期" }] },
  { id: "bai-chenxiang", name: "白沉香", aliases: [], importance: 3, birthYear: -7, martialSouls: ["尖尾雨燕"], factionIds: ["speed-clan", "tang-sect"], initialLocationId: "heaven-dou-city", personality: ["骄傲", "好胜", "重视宗族"], goals: ["证明敏之一族", "提升纯敏路线的生存能力"], powerSnapshots: [{ year: 14, tier: "魂宗", note: "敏之一族年轻一代" }] },
  { id: "lou-gao", name: "楼高", aliases: ["神匠"], importance: 3, martialSouls: [], factionIds: ["iron-association"], initialLocationId: "gengxin-city", personality: ["痴迷锻造", "直接", "珍惜技艺"], goals: ["突破铸造极限", "寻找值得研究的精巧器物"], powerSnapshots: [{ year: 14, tier: "神匠与魂圣级魂师", note: "铁匠协会会长" }] },
  { id: "dai-weisi", name: "戴维斯", aliases: [], importance: 3, birthYear: -15, martialSouls: ["白虎"], factionIds: ["star-luo"], initialLocationId: "star-luo-city", personality: ["自信", "冷酷", "重视权位"], goals: ["赢得皇位竞争", "淘汰戴沐白"], powerSnapshots: [{ year: 8, soulRank: 49, tier: "魂宗", note: "星罗皇家学院战队队长" }] },
  { id: "zhu-zhuyun", name: "朱竹云", aliases: [], importance: 3, birthYear: -14, martialSouls: ["幽冥灵猫"], factionIds: ["star-luo"], initialLocationId: "star-luo-city", personality: ["强势", "冷静", "遵循竞争规则"], goals: ["赢得家族竞争", "帮助戴维斯继位"], powerSnapshots: [{ year: 8, soulRank: 47, tier: "魂宗", note: "星罗皇家学院主力" }] },
  { id: "bo-saixi", name: "波赛西", aliases: ["海神斗罗"], importance: 5, martialSouls: ["海神"], factionIds: ["sea-god-island"], initialLocationId: "sea-god-island", personality: ["威严", "平和", "忠于神谕"], goals: ["守护海神岛", "等待海神继承者"], powerSnapshots: [{ year: 0, soulRank: 99, tier: "绝世斗罗", note: "在海神岛可调动海神之力" }] },
  { id: "tang-chen", name: "唐晨", aliases: ["杀戮之王"], importance: 5, martialSouls: ["昊天锤"], factionIds: ["clear-sky", "slaughter-city"], initialLocationId: "slaughter-city", personality: ["豪迈", "重诺", "受侵蚀"], goals: ["完成修罗神考", "摆脱血红九头蝙蝠王控制"], powerSnapshots: [{ year: 0, soulRank: 99, tier: "绝世斗罗", note: "以杀戮之王身份受侵蚀" }] },
  { id: "a-yin", name: "阿银", aliases: ["蓝银皇"], importance: 5, martialSouls: ["蓝银皇"], factionIds: [], initialLocationId: "holy-soul-village", personality: ["温柔", "坚定", "重情"], goals: ["保护唐昊与唐三", "等待生命恢复"], powerSnapshots: [{ year: 0, tier: "蓝银皇种子", note: "献祭后处于重新生长阶段" }, { year: 13, tier: "重塑身体", note: "在冰火两仪眼附近恢复" }] },
  { id: "da-ming", name: "大明", aliases: ["天青牛蟒"], importance: 5, martialSouls: [], factionIds: [], initialLocationId: "star-dou-core", personality: ["沉稳", "重情", "警惕人类"], goals: ["守护小舞", "维持核心区秩序"], powerSnapshots: [{ year: 0, tier: "十万年魂兽", note: "星斗大森林核心霸主" }] },
  { id: "er-ming", name: "二明", aliases: ["泰坦巨猿"], importance: 5, martialSouls: [], factionIds: [], initialLocationId: "star-dou-core", personality: ["直接", "暴烈", "重情"], goals: ["保护小舞", "驱逐核心区入侵者"], powerSnapshots: [{ year: 0, tier: "十万年魂兽", note: "森林之王" }] },
  { id: "di-tian", name: "帝天", aliases: ["兽神", "金眼黑龙王"], importance: 5, martialSouls: [], factionIds: [], initialLocationId: "star-dou-core", personality: ["威严", "克制", "敌视神界", "重视魂兽延续"], goals: ["守护银龙王沉睡之地", "维持星斗核心秩序"], powerSnapshots: [{ year: -100, tier: "八十万年以上凶兽", note: "长期隐于生命之湖更深处，不被人类社会知晓" }] },
  { id: "bi-ji", name: "碧姬", aliases: ["翡翠天鹅"], importance: 5, martialSouls: [], factionIds: [], initialLocationId: "star-dou-core", personality: ["温和", "仁慈", "坚定", "重视族群"], goals: ["治疗受伤魂兽", "减少无意义的人兽冲突"], powerSnapshots: [{ year: -100, tier: "五十万年以上治疗系凶兽", note: "长期生活在星斗核心区" }] },
  { id: "zi-ji", name: "紫姬", aliases: ["地狱魔龙王", "魔后"], importance: 4, martialSouls: [], factionIds: [], initialLocationId: "star-dou-core", personality: ["冷傲", "强势", "护族", "警惕人类"], goals: ["守卫核心区", "清除威胁龙族的入侵者"], powerSnapshots: [{ year: -100, tier: "二十万年以上凶兽", note: "地狱魔龙一脉的高位存在" }] },
  { id: "xiong-jun", name: "熊君", aliases: ["暗金恐爪熊"], importance: 4, martialSouls: [], factionIds: [], initialLocationId: "star-dou-core", personality: ["暴烈", "好战", "骄傲", "不服约束"], goals: ["挑战更强者", "守住自己的领地"], powerSnapshots: [{ year: -100, tier: "四十万年以上凶兽", note: "攻击力位于星斗凶兽前列" }] },
  { id: "wan-yao-wang", name: "万妖王", aliases: ["妖眼魔树"], importance: 4, martialSouls: [], factionIds: [], initialLocationId: "star-dou-core", personality: ["深沉", "耐心", "领地意识强", "擅长观察"], goals: ["扩张植物感知网络", "维持核心区植物族群"], powerSnapshots: [{ year: -100, tier: "五十万年以上植物系凶兽", note: "根系与精神感知覆盖广阔区域" }] },
  { id: "chi-wang", name: "赤王", aliases: ["三头赤魔獒"], importance: 4, martialSouls: [], factionIds: [], initialLocationId: "star-dou-core", personality: ["忠诚", "凶猛", "谨慎", "护幼"], goals: ["执行核心区守卫任务", "保护族群后代"], powerSnapshots: [{ year: -100, tier: "三十万年以上凶兽", note: "拥有三个头颅与强大火属性" }] },
  { id: "tian-meng", name: "天梦冰蚕", aliases: ["天梦"], importance: 5, martialSouls: [], factionIds: [], initialLocationId: "star-dou-core", personality: ["机灵", "惜命", "话多", "渴望自由"], goals: ["保存精神本源", "寻找摆脱凶兽控制的机会"], powerSnapshots: [{ year: -100, tier: "百万年精神系魂兽", note: "第一部时代已被星斗凶兽控制并汲取天地元力" }] },
  { id: "snow-empress", name: "雪帝", aliases: ["冰天雪女", "极北主宰"], importance: 5, martialSouls: [], factionIds: [], initialLocationId: "extreme-north-core", personality: ["清冷", "威严", "守护极北", "厌恶贪婪"], goals: ["维持极北秩序", "保护冰雪族群"], powerSnapshots: [{ year: -100, tier: "六十九万年以上凶兽", note: "在第一部时代已经统治极北核心圈" }] },
  { id: "ice-empress", name: "冰帝", aliases: ["冰碧帝皇蝎"], importance: 5, martialSouls: [], factionIds: [], initialLocationId: "extreme-north-core", personality: ["骄傲", "直接", "重情", "警惕人类"], goals: ["守卫冰碧蝎族群", "追求更高修为"], powerSnapshots: [{ year: -100, tier: "三十九万年以上凶兽", note: "在第一部时代已经生活于极北之地" }] },
  { id: "xiao-bai", name: "小白", aliases: ["魔魂大白鲨之王"], importance: 4, martialSouls: [], factionIds: ["sea-god-island"], initialLocationId: "sea-god-island", personality: ["直率", "骄傲", "忠于海神岛"], goals: ["守护海神岛", "对抗邪魔虎鲸群"], powerSnapshots: [{ year: 0, tier: "十万年海魂兽", note: "海神岛护岛神兽" }] },
];

export const CANON_EVENTS: CanonEventDefinition[] = [
  { id: "tang-awakening", year: 0, title: "唐三与小舞进入诺丁学院", locationId: "notting-academy", participantIds: ["tang-san", "xiao-wu", "yu-xiaogang"], inertia: 5, publicSummary: "诺丁学院迎来两名先天满魂力的新生。" },
  { id: "shrek-enrollment", year: 6, title: "史莱克七怪聚首", locationId: "shrek-village", participantIds: ["tang-san", "xiao-wu", "dai-mubai", "zhu-zhuqing", "ning-rongrong", "ao-si-ka", "ma-hongjun"], inertia: 5, publicSummary: "数名年轻魂师进入史莱克学院。" },
  { id: "shrek-relocation", year: 7, title: "史莱克学院迁入天斗城", locationId: "heaven-dou-city", participantIds: ["flender", "yu-xiaogang", "zhao-wuji", "tang-san"], inertia: 4, publicSummary: "一所来自索托城的小学院在天斗城重新落脚。" },
  { id: "academy-tournament", year: 8, title: "全大陆高级魂师学院精英大赛", locationId: "spirit-city", participantIds: ["tang-san", "xiao-wu", "dai-mubai", "zhu-zhuqing", "ning-rongrong", "ao-si-ka", "ma-hongjun", "bibi-dong", "huliena"], inertia: 5, publicSummary: "两大帝国与武魂殿共同关注的学院赛事举行。" },
  { id: "pope-palace-conflict", year: 9, title: "教皇殿前的冲突", locationId: "spirit-city", participantIds: ["tang-san", "xiao-wu", "tang-hao", "bibi-dong", "gui-mei", "yue-guan"], inertia: 5, publicSummary: "大赛结束后的冲突使多方关系骤然紧张，公开消息受到严格控制。" },
  { id: "five-year-reunion", year: 13, title: "史莱克五年之约", locationId: "heaven-dou-city", participantIds: ["tang-san", "dai-mubai", "zhu-zhuqing", "ning-rongrong", "ao-si-ka", "ma-hongjun"], inertia: 4, publicSummary: "昔日史莱克学员约定重聚。" },
  { id: "tang-sect-founded", year: 14, title: "唐门在天斗城立足", locationId: "heaven-dou-city", participantIds: ["tang-san", "tai-tan", "bai-he", "niu-gao", "yang-wudi", "ning-rongrong"], inertia: 4, publicSummary: "一个结合多个单属性家族的新兴魂师势力开始活动。" },
  { id: "seven-treasure-attack", year: 15, title: "七宝琉璃宗遇袭", locationId: "seven-treasure-fort", participantIds: ["ning-fengzhi", "chen-xin", "bibi-dong"], inertia: 5, publicSummary: "上三宗遭到突然袭击，大陆魂师势力开始重新站队。" },
  { id: "heaven-dou-coup", year: 17, title: "天斗皇室局势突变", locationId: "heaven-dou-city", participantIds: ["qian-renxue", "xue-ye", "xue-xing", "tang-san", "dugu-bo"], inertia: 5, publicSummary: "围绕皇位与太子身份的争夺公开化，天斗城进入戒严。" },
  { id: "continental-war", year: 18, title: "大陆战争进入决战", locationId: "spirit-city", participantIds: ["tang-san", "bibi-dong", "qian-renxue"], inertia: 5, publicSummary: "帝国与武魂帝国的冲突改写大陆秩序。" },
  { id: "suotuo-spirit-arena", year: 6, title: "史莱克学员进入索托大斗魂场", locationId: "suotuo-city", participantIds: ["tang-san", "xiao-wu", "dai-mubai", "zhu-zhuqing", "ning-rongrong", "ao-si-ka", "ma-hongjun"], inertia: 3, publicSummary: "一支年轻魂师队伍在索托大斗魂场连续参赛。" },
  { id: "imperial-team-battle", year: 6, title: "史莱克战队与皇斗战队交锋", locationId: "suotuo-city", participantIds: ["tang-san", "qin-ming", "yu-tianheng", "dugu-yan", "ye-lingling"], inertia: 4, publicSummary: "两支天才战队的交锋改变了多名教师和学员的去向。" },
  { id: "ice-fire-herbs", year: 7, title: "冰火两仪眼仙草被取用", locationId: "ice-fire-spring", participantIds: ["tang-san", "dugu-bo"], inertia: 5, publicSummary: "落日森林深处的一批珍稀药草改变了数名年轻魂师的根基。" },
  { id: "golden-triangle-reunion", year: 7, title: "黄金铁三角重聚", locationId: "heaven-dou-city", participantIds: ["flender", "yu-xiaogang", "liu-erlong"], inertia: 3, publicSummary: "昔日黄金铁三角在蓝霸学院重聚。" },
  { id: "five-elements-clash", year: 8, title: "史莱克迎战五元素学院", locationId: "heaven-dou-city", participantIds: ["tang-san", "feng-xiaotian", "huo-wu", "shui-binger"], inertia: 4, publicSummary: "预选赛中，多支元素学院与史莱克战队争夺出线位置。" },
  { id: "slaughter-training", year: 11, title: "唐三与胡列娜进入杀戮之都", locationId: "slaughter-city", participantIds: ["tang-san", "huliena", "tang-chen"], inertia: 5, publicSummary: "两名年轻魂师先后进入与外界隔绝的杀戮之都。" },
  { id: "clear-sky-return", year: 13, title: "唐三返回昊天宗", locationId: "clear-sky-mountain", participantIds: ["tang-san", "tang-xiao", "tang-yuehua"], inertia: 4, publicSummary: "唐昊之子带着昊天令返回封山宗门。" },
  { id: "single-clans-gather", year: 14, title: "单属性四宗族聚会", locationId: "longxing-city", participantIds: ["tang-san", "tai-tan", "bai-he", "niu-gao", "yang-wudi", "bai-chenxiang"], inertia: 4, publicSummary: "脱离昊天宗的四个单属性宗族重新讨论联合与去向。" },
  { id: "gengxin-forging", year: 14, title: "唐门接触铁匠协会", locationId: "gengxin-city", participantIds: ["tang-san", "tai-tan", "lou-gao"], inertia: 3, publicSummary: "暗器设计与大陆最高水平的锻造技艺开始接触。" },
  { id: "sea-voyage", year: 15, title: "史莱克众人由瀚海城出海", locationId: "vast-sea-city", participantIds: ["tang-san", "xiao-wu", "dai-mubai", "zhu-zhuqing", "ning-rongrong", "ao-si-ka", "ma-hongjun"], inertia: 4, publicSummary: "一支年轻魂师队伍从瀚海城驶向危险远海。" },
  { id: "sea-god-trials", year: 16, title: "海神岛考核开启", locationId: "sea-god-island", participantIds: ["tang-san", "bo-saixi", "xiao-bai"], inertia: 5, publicSummary: "海神岛为大陆来客开启不同等级的考核。" },
  { id: "soul-hunt-operation", year: 15, title: "武魂殿猎魂行动", locationId: "seven-treasure-fort", participantIds: ["bibi-dong", "ning-fengzhi", "chen-xin", "gu-rong", "yu-tianheng"], inertia: 5, publicSummary: "针对上三宗的大规模袭击同时展开，宗门格局受到重创。" },
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
  { id: "soft-bone-rabbit", name: "柔骨兔", habitats: ["soul-hunting-forest", "star-dou-edge"], attributes: ["速度", "柔韧"], ageRange: [10, 1200], danger: 1, possibleSkills: ["弹跳强化", "柔身闪避"], description: "警觉的小型魂兽，擅长突然变向。" },
  { id: "iron-horn-ox", name: "铁角蛮牛", habitats: ["soul-hunting-forest", "star-dou-edge"], attributes: ["力量", "防御"], ageRange: [80, 5000], danger: 3, possibleSkills: ["蛮牛冲撞", "铁角护体"], description: "脾气暴躁，正面冲击很强。" },
  { id: "mirror-fox", name: "镜影狐", habitats: ["sunset-forest", "star-dou-edge"], attributes: ["幻象", "速度"], ageRange: [300, 9000], danger: 3, possibleSkills: ["镜影分身", "气息混淆"], description: "会用残影误导追踪者，很少正面缠斗。" },
  { id: "flame-lion", name: "赤焰狮", habitats: ["sunset-forest", "star-dou-edge"], attributes: ["火", "力量"], ageRange: [400, 15000], danger: 4, possibleSkills: ["烈焰冲击", "火焰护身"], description: "领地意识强，受伤后火焰更加不稳定。" },
  { id: "blue-silver-vine", name: "蓝银藤魂兽", habitats: ["soul-hunting-forest", "star-dou-edge"], attributes: ["植物", "生命"], ageRange: [20, 4000], danger: 1, possibleSkills: ["生命感应", "藤蔓再生"], description: "生命力旺盛，通常依附在水源附近。" },
  { id: "thorn-boar", name: "棘甲山猪", habitats: ["soul-hunting-forest", "sunset-forest"], attributes: ["防御", "反伤"], ageRange: [100, 7000], danger: 3, possibleSkills: ["棘甲", "野蛮突进"], description: "背部硬刺会在受击时竖起。" },
  { id: "dream-moth", name: "梦粉蛾", habitats: ["sunset-forest", "star-dou-edge"], attributes: ["精神", "睡眠"], ageRange: [200, 8000], danger: 3, possibleSkills: ["催眠鳞粉", "梦境扰动"], description: "翅粉能让人反应迟缓，火光会刺激它攻击。" },
  { id: "water-arrow-snake", name: "水箭蛇", habitats: ["star-dou-edge", "sunset-forest"], attributes: ["水", "穿刺"], ageRange: [50, 3500], danger: 2, possibleSkills: ["水箭", "水下感知"], description: "常藏在浅水与芦苇间，攻击距离比外表更远。" },
  { id: "crypt-spider", name: "地穴魔蛛", habitats: ["star-dou-edge", "star-dou-core"], attributes: ["控制", "蛛网", "土"], ageRange: [1000, 30000], danger: 5, possibleSkills: ["蛛网牢笼", "地穴突袭"], description: "会提前布置陷阱，把战场变成巢穴的一部分。" },
  { id: "jade-bamboo", name: "碧玉竹", habitats: ["sunset-forest", "star-dou-edge"], attributes: ["植物", "韧性", "穿刺"], ageRange: [100, 10000], danger: 2, possibleSkills: ["竹影突刺", "韧性增幅"], description: "移动能力很弱，成片生长后极难靠近。" },
  { id: "titan-giant-ape", name: "泰坦巨猿", habitats: ["star-dou-core"], attributes: ["力量", "重力", "土"], ageRange: [100000, 100000], danger: 5, possibleSkills: ["重力领域", "泰坦之力"], description: "星斗大森林核心霸主，力量远超普通十万年魂兽。" },
  { id: "azure-bull-python", name: "天青牛蟒", habitats: ["star-dou-core"], attributes: ["水", "雷", "迟缓领域"], ageRange: [100000, 100000], danger: 5, possibleSkills: ["迟缓领域", "天青寂灭雷霆"], description: "栖息在生命之湖，智慧和实力都处于魂兽顶层。" },
  { id: "dark-devilgod-tiger", name: "暗魔邪神虎", habitats: ["star-dou-core"], attributes: ["邪恶", "空间", "时间", "雷"], ageRange: [60000, 70000], danger: 5, possibleSkills: ["生死竞技场", "邪神钩", "时空倒退"], description: "极端危险且能吞噬成长的异种虎类魂兽。" },
  { id: "pink-queen", name: "粉红娘娘", habitats: ["sunset-forest"], attributes: ["毒", "亢奋", "群体"], ageRange: [3000, 5000], danger: 4, possibleSkills: ["亢奋毒雾", "群体号令"], description: "粉红女郎族群首领，毒雾会扰乱判断和情绪。" },
  { id: "pink-maiden", name: "粉红女郎", habitats: ["sunset-forest"], attributes: ["毒", "群居"], ageRange: [100, 3000], danger: 2, possibleSkills: ["粉红毒雾", "气息联结"], description: "常以大群活动，个体不强，数量足以拖垮猎魂队。" },
  { id: "earth-king", name: "大地之王", habitats: ["sunset-forest"], attributes: ["火", "土", "爆裂"], ageRange: [3000, 5000], danger: 4, possibleSkills: ["岩浆裂地", "炽热甲壳"], description: "蝎类魂兽，攻击中同时带有震荡和高温。" },
  { id: "ghost-tiger", name: "鬼虎", habitats: ["sunset-forest", "star-dou-edge"], attributes: ["速度", "暗", "分身"], ageRange: [1000, 10000], danger: 4, possibleSkills: ["鬼影分身", "潜影突袭"], description: "会用高速和影像误判围猎目标。" },
  { id: "mirror-beast", name: "镜影兽", habitats: ["star-dou-edge"], attributes: ["复制", "幻象", "精神"], ageRange: [5000, 30000], danger: 4, possibleSkills: ["镜像复制", "能力映照"], description: "稀少的精神系魂兽，魂技方向与复制、镜像相关。" },
  { id: "three-eyed-fox", name: "三眼魔狐", habitats: ["star-dou-core"], attributes: ["精神", "魅惑", "幻象"], ageRange: [10000, 70000], danger: 4, possibleSkills: ["精神凝聚", "魅惑增幅"], description: "第三只眼能集中精神力，极擅长动摇目标心神。" },
  { id: "scale-armored-beast", name: "鳞甲兽", habitats: ["star-dou-edge", "sunset-forest"], attributes: ["防御", "力量"], ageRange: [500, 12000], danger: 3, possibleSkills: ["鳞甲护体", "冲角"], description: "全身覆有厚重鳞片，适合防御系与力量系魂师。" },
  { id: "thousand-ant-emperor", name: "千钧蚁皇", habitats: ["star-dou-core"], attributes: ["力量", "甲壳", "群体"], ageRange: [90000, 90000], danger: 5, possibleSkills: ["纯粹力量增幅", "蚁皇甲"], description: "三只接近十万年修为的蚁皇共同活动，力量极端集中。" },
  { id: "blue-silver-king", name: "蓝银王", habitats: ["star-dou-core"], attributes: ["植物", "生命", "感知"], ageRange: [85000, 85000], danger: 2, possibleSkills: ["蓝银领域引导", "生命唤醒"], description: "蓝银草族群中的高位存在，拥有完整智慧。" },
  { id: "evil-orca-king", name: "邪魔虎鲸王", habitats: ["whale-sea", "sea-god-island"], attributes: ["水", "嗜血", "声波"], ageRange: [100000, 100000], danger: 5, possibleSkills: ["邪魔虎鲸镜之灭", "鲸涛冲击"], description: "统治邪魔虎鲸群的十万年海魂兽，与魔魂大白鲨群长期敌对。" },
  { id: "demon-great-white-shark", name: "魔魂大白鲨", habitats: ["sea-god-island"], attributes: ["水", "速度", "群猎"], ageRange: [1000, 100000], danger: 5, possibleSkills: ["绝望光波", "鲨齿撕裂"], description: "海洋捕猎者，速度和攻击性远超同年限普通海魂兽。" },
  { id: "deep-sea-demon-whale", name: "深海魔鲸王", habitats: ["whale-sea"], attributes: ["水", "雷", "吞噬", "领域"], ageRange: [900000, 999999], danger: 5, possibleSkills: ["魔鲸领域", "海啸冲击", "能量吞噬"], description: "接近百万年层次的海洋霸主，常规封号斗罗也难以抗衡。" },
  { id: "ten-headed-sun-snake", name: "十首烈阳蛇", habitats: ["slaughter-city"], attributes: ["火", "剧毒", "洪荒异种"], ageRange: [30000, 100000], danger: 5, possibleSkills: ["烈阳蛇火", "内丹爆发"], description: "地狱路中的洪荒异种，不完全遵循普通魂兽分类。" },
  { id: "blood-bat", name: "血蝙蝠", habitats: ["slaughter-city"], attributes: ["吸血", "飞行", "群体"], ageRange: [100, 10000], danger: 3, possibleSkills: ["血雾", "超声定位"], description: "地狱路上成群活动，会被血腥气味吸引。" },
  { id: "nine-headed-bat-king", name: "血红九头蝙蝠王", habitats: ["slaughter-city"], attributes: ["精神侵蚀", "寄生", "飞行"], ageRange: [100000, 100000], danger: 5, possibleSkills: ["精神寄生", "九首再生"], description: "能够侵蚀强者意识的异兽，与杀戮之王的异常密切相关。" },
  { id: "sea-arrow-fish", name: "箭形鱼", habitats: ["vast-sea-city", "purple-pearl-island"], attributes: ["水", "穿刺", "速度"], ageRange: [10, 2000], danger: 2, possibleSkills: ["水箭突刺", "鱼群加速"], description: "会成群跃出海面，攻击轨迹近似高速箭矢。" },
  { id: "devil-soul-octopus", name: "魔魂章鱼", habitats: ["purple-pearl-island", "whale-sea"], attributes: ["水", "控制", "墨毒"], ageRange: [500, 30000], danger: 4, possibleSkills: ["触手牢笼", "墨雾遮蔽"], description: "擅长缠绕船体和用墨雾切断视野。" },
  { id: "golden-stripe-shark", name: "金纹虎鲨", habitats: ["purple-pearl-island", "whale-sea"], attributes: ["水", "力量", "速度"], ageRange: [1000, 20000], danger: 4, possibleSkills: ["虎鲨冲撞", "金纹强化"], description: "近海少见的强攻型海魂兽，受伤后会持续追击。" },
  { id: "sea-star-king", name: "海星王", habitats: ["sea-god-island"], attributes: ["水", "吸附", "再生"], ageRange: [10000, 80000], danger: 4, possibleSkills: ["多重吸附", "断肢再生"], description: "体型巨大的海星类魂兽，擅长控制地形与持续消耗。" },
  { id: "thunder-eagle", name: "雷鹰", habitats: ["blue-lightning-mountain", "star-dou-edge"], attributes: ["雷", "飞行", "感知"], ageRange: [100, 15000], danger: 3, possibleSkills: ["雷羽", "高空锁定"], description: "常在雷暴前后活动，适合雷属性和飞行武魂。" },
  { id: "fire-cloud-crane", name: "火云鹤", habitats: ["sunset-forest"], attributes: ["火", "飞行", "辅助"], ageRange: [100, 12000], danger: 3, possibleSkills: ["火云幕", "灼热羽翼"], description: "火属性飞禽，攻击性不强，却极难靠近。" },
  { id: "ice-jade-swan", name: "冰玉天鹅", habitats: ["skywater-academy", "star-dou-edge"], attributes: ["冰", "水", "净化"], ageRange: [500, 20000], danger: 3, possibleSkills: ["冰羽守护", "寒雾净化"], description: "北方湖泊中的稀有魂兽，常被辅助与控制系魂师关注。" },
  { id: "shadow-leopard", name: "幽影豹", habitats: ["star-dou-edge", "sunset-forest"], attributes: ["暗", "速度", "潜行"], ageRange: [100, 10000], danger: 3, possibleSkills: ["影遁", "背袭"], description: "习惯跟踪落单目标，很少在正面留下痕迹。" },
  { id: "golden-earth-dragon", name: "黄金地龙", habitats: ["star-dou-core"], attributes: ["龙", "土", "力量"], ageRange: [5000, 50000], danger: 5, possibleSkills: ["地龙翻身", "黄金龙甲"], description: "拥有稀薄真龙血脉，领地意识极强。" },
  { id: "soul-devouring-spider", name: "噬魂魔蛛", habitats: ["star-dou-core", "sunset-forest"], attributes: ["精神", "毒", "吞噬"], ageRange: [3000, 40000], danger: 5, possibleSkills: ["噬魂蛛网", "精神毒刺"], description: "会沿着精神波动追猎，魂师越慌乱越容易被锁定。" },
  { id: "gold-eyed-black-dragon", name: "金眼黑龙王", habitats: ["star-dou-core"], attributes: ["龙", "黑暗", "空间"], ageRange: [800000, 900000], danger: 5, possibleSkills: ["龙神爪", "黑暗空间封锁"], description: "星斗核心区真正的兽神血脉，通常不会被普通魂师发现。" },
  { id: "emerald-swan", name: "翡翠天鹅", habitats: ["star-dou-core"], attributes: ["生命", "治疗", "净化"], ageRange: [10000, 600000], danger: 4, possibleSkills: ["生命治愈", "翡翠守护"], description: "极少主动杀戮的高位治疗系魂兽。" },
  { id: "dark-gold-terrorclaw-bear", name: "暗金恐爪熊", habitats: ["star-dou-core", "star-dou-edge"], attributes: ["力量", "暗金", "撕裂"], ageRange: [1000, 500000], danger: 5, possibleSkills: ["暗金恐爪", "躯干强化"], description: "同年限战力远超普通魂兽，正面撕裂能力极强。" },
  { id: "demon-eye-tree", name: "妖眼魔树", habitats: ["star-dou-core"], attributes: ["植物", "精神", "控制"], ageRange: [10000, 600000], danger: 5, possibleSkills: ["精神凝视", "根域封锁"], description: "能够通过根系和精神波动掌握大片森林。" },
  { id: "three-headed-scarlet-demon-mastiff", name: "三头赤魔獒", habitats: ["star-dou-core"], attributes: ["火", "力量", "三首"], ageRange: [10000, 400000], danger: 5, possibleSkills: ["赤魔烈焰", "三首合击"], description: "三个头颅可以同时锁定不同方向的敌人。" },
  { id: "skydream-iceworm", name: "天梦冰蚕", habitats: ["star-dou-core", "extreme-north-core"], attributes: ["精神", "冰", "本源"], ageRange: [1000000, 1000000], danger: 4, possibleSkills: ["精神探测", "精神共享", "冰蚕遗蜕"], description: "修为极高而实战特殊的精神系魂兽，第一部时代已经存在。" },
  { id: "ice-heaven-snow-woman", name: "冰天雪女", habitats: ["extreme-north-core"], attributes: ["极致之冰", "雪", "领域"], ageRange: [600000, 700000], danger: 5, possibleSkills: ["帝寒天", "雪舞耀阳", "大寒无雪"], description: "得天独厚的冰雪精灵，极北之地的主宰。" },
  { id: "ice-jade-emperor-scorpion", name: "冰碧帝皇蝎", habitats: ["extreme-north-core"], attributes: ["极致之冰", "蝎", "帝皇"], ageRange: [300000, 400000], danger: 5, possibleSkills: ["冰帝之螯", "永冻之域"], description: "冰碧蝎族群中的帝皇血脉，防御和极寒同样强大。" },
];

function appendUnique<T>(target: T[], additions: T[], key: (item: T) => string): void {
  const existing = new Set(target.map(key));
  for (const item of additions) if (!existing.has(key(item))) { target.push(item); existing.add(key(item)); }
}

appendUnique(FACTIONS, EXPANDED_FACTIONS, (item) => item.id);
appendUnique(LOCATIONS, EXPANDED_LOCATIONS, (item) => item.id);
appendUnique(CANON_CHARACTERS, EXPANDED_CHARACTERS, (item) => item.id);
appendUnique(CANON_EVENTS, EXPANDED_EVENTS, (item) => item.id);
appendUnique(SOUL_BEASTS, EXPANDED_SOUL_BEASTS, (item) => item.id);

export function locationById(id: string): LocationDefinition | undefined {
  return LOCATIONS.find((location) => location.id === id);
}

export function soulBeastById(id: string): SoulBeastDefinition | undefined {
  return SOUL_BEASTS.find((beast) => beast.id === id);
}

export function characterById(id: string): CanonCharacterDefinition | undefined {
  return CANON_CHARACTERS.find((character) => character.id === id);
}
