import type { CandidatePublic } from "../../shared/game.js";
import type { ExpandedOriginTemplate } from "./expanded-origins.js";

interface RoleAxis {
  id: string;
  title: string;
  livelihood: string;
  advantage: string;
  item: string;
  categories: string[];
  trait: string;
  route: string;
  coin: number;
  innate: number;
}

interface AffiliationAxis {
  id: string;
  prefix: string;
  location: string;
  authority: string;
  access: string;
  obligation: string;
  token: string;
  tags: string[];
  coin: number;
  pressure: number;
}

interface ConflictAxis {
  id: string;
  label: string;
  summary: string;
  burden: string;
  trait: string;
  route: string;
  tierBoost: number;
  pressure: number;
  selfKnowledge: string;
}

const ROLES: RoleAxis[] = [
  { id: "array-keeper", title: "护阵房学徒家庭", livelihood: "替魂师势力检查阵基、补刻磨损纹路并记录魂力消耗", advantage: "能辨认基础阵纹、能量节点和防御薄弱处", item: "残旧阵尺", categories: ["器武魂", "本体武魂"], trait: "缜密", route: "阵法与守城", coin: 24, innate: 1 },
  { id: "beast-doctor", title: "驮兽医师家庭", livelihood: "治疗商队驮兽与低阶魂兽留下的撕咬、毒伤和惊厥", advantage: "熟悉兽类骨骼、习性、药量和安抚方法", item: "兽医药囊", categories: ["兽武魂", "植物"], trait: "耐心", route: "兽医与猎魂", coin: 20, innate: 1 },
  { id: "fort-builder", title: "城防工事师家庭", livelihood: "修筑城墙、箭塔、暗门和抵御魂师冲击的缓冲结构", advantage: "掌握工事、防守路线和建筑受力知识", item: "城防结构册", categories: ["器武魂", "本体武魂"], trait: "稳重", route: "工事与领地", coin: 30, innate: 1 },
  { id: "auction-appraiser", title: "拍卖行鉴定师家庭", livelihood: "鉴定药材、矿石、魂导遗物与来路可疑的魂师物品", advantage: "见识广，能估价并识别常见赝品和危险材料", item: "鉴定放大镜", categories: ["器武魂", "本体武魂"], trait: "敏锐", route: "鉴宝与商战", coin: 46, innate: 1 },
  { id: "message-handler", title: "密信递送人家庭", livelihood: "在不能公开联络的势力之间递送口信、暗号和一次性密封文书", advantage: "熟悉暗号、跟踪规避与多条秘密路线", item: "空白密封筒", categories: ["兽武魂", "本体武魂", "器武魂"], trait: "守口", route: "情报与潜行", coin: 28, innate: 1 },
  { id: "soul-chef", title: "魂师膳房主厨家庭", livelihood: "根据训练强度、伤势和武魂属性安排魂师饮食", advantage: "懂食材处理、体力恢复和大规模后勤", item: "膳房香料盒", categories: ["植物", "器武魂"], trait: "务实", route: "食补与后勤", coin: 26, innate: 1 },
  { id: "ring-scribe", title: "猎魂记录员家庭", livelihood: "替猎魂队记录目标年限、地形、伤亡、吸收反应和魂技结果", advantage: "拥有系统的魂兽观察法与猎魂事故案例", item: "猎魂空白册", categories: ["器武魂", "本体武魂"], trait: "好学", route: "魂兽研究", coin: 22, innate: 1 },
  { id: "contract-witness", title: "魂师契约见证人家庭", livelihood: "替雇佣、拜师、交易和宗门附庸契约确认身份与责任", advantage: "熟悉契约漏洞、贵族规矩与势力边界", item: "契约印泥", categories: ["器武魂", "本体武魂"], trait: "审慎", route: "律契与交涉", coin: 38, innate: 1 },
  { id: "herb-broker", title: "药材行中间人家庭", livelihood: "连接采药队、医馆、宗门药堂和不愿露面的特殊买家", advantage: "掌握药价、产地、替代材料和灰色供货渠道", item: "药材行情簿", categories: ["植物", "器武魂"], trait: "圆滑", route: "药商与丹道", coin: 42, innate: 1 },
  { id: "smith-inspector", title: "兵器验收师家庭", livelihood: "替守军和魂师队伍测试兵器强度、魂力传导和批次缺陷", advantage: "能快速判断器械性能与制造问题", item: "验兵铜锤", categories: ["器武魂", "本体武魂"], trait: "严谨", route: "兵器与锻造", coin: 34, innate: 1 },
  { id: "map-surveyor", title: "帝国测绘员家庭", livelihood: "测量道路、河流、领地边界和魂兽活动造成的危险区", advantage: "方向感强，熟悉测距、制图与野外扎营", item: "折叠测距绳", categories: ["器武魂", "兽武魂"], trait: "冷静", route: "地图与探索", coin: 30, innate: 1 },
  { id: "funeral-master", title: "魂师葬仪师家庭", livelihood: "处理高阶魂技留下的遗体、遗物、家徽和未履行的遗嘱", advantage: "熟悉伤势痕迹、魂师礼制和死者势力关系", item: "无主遗物签", categories: ["本体武魂", "器武魂"], trait: "克制", route: "遗愿与旧案", coin: 24, innate: 1 },
  { id: "arena-medic", title: "斗魂场急救员家庭", livelihood: "在斗魂结束后的最短时间止血、固定骨折并判断是否继续比赛", advantage: "见过大量实战伤势，懂临场救治和斗魂规则", item: "斗魂急救包", categories: ["植物", "本体武魂"], trait: "果断", route: "战地医疗", coin: 36, innate: 1 },
  { id: "stable-trainer", title: "魂兽坐骑驯养师家庭", livelihood: "训练温顺魂兽与异种坐骑适应人声、铠具和战场气味", advantage: "具有驯养、骑乘和兽群情绪判断经验", item: "驯兽短哨", categories: ["兽武魂", "本体武魂"], trait: "大胆", route: "驯兽与骑战", coin: 30, innate: 1 },
  { id: "warehouse-counter", title: "宗门库房盘点员家庭", livelihood: "核对魂币、药材、矿石、魂骨匣封条和长老调用记录", advantage: "熟悉资源等级、库房流程与账目异常", item: "库房算盘", categories: ["器武魂", "本体武魂"], trait: "细心", route: "资源与内务", coin: 40, innate: 1 },
  { id: "language-tutor", title: "贵族礼仪与方言教师家庭", livelihood: "教魂师辨认两国口音、贵族称谓和谈判场合的礼节", advantage: "擅长语言、观察身份与跨势力沟通", item: "双国礼仪册", categories: ["本体武魂", "器武魂"], trait: "从容", route: "外交与游说", coin: 44, innate: 1 },
  { id: "river-engineer", title: "水利机关师家庭", livelihood: "维护水闸、灌渠、码头绞盘和抵御水系魂技的泄洪结构", advantage: "掌握水流、机关、民生工程与地方组织", item: "水闸机括图", categories: ["器武魂", "植物"], trait: "责任感", route: "水利与民生", coin: 32, innate: 1 },
  { id: "poison-tester", title: "药堂验毒师家庭", livelihood: "用试纸、动物和微量魂力辨认药中毒性与相克反应", advantage: "懂常见毒物、解毒次序和安全试验方法", item: "七格验毒盒", categories: ["植物", "本体武魂"], trait: "谨慎", route: "毒理与解毒", coin: 34, innate: 1 },
  { id: "training-dummy-maker", title: "魂师训练器具匠家庭", livelihood: "制造负重、移动靶、魂技承压木偶和简易拟态训练器", advantage: "能把抽象训练要求转成可重复的器具方案", item: "活动木偶关节", categories: ["器武魂", "本体武魂"], trait: "巧思", route: "训练与制造", coin: 36, innate: 1 },
  { id: "notice-copyist", title: "城门告示抄录人家庭", livelihood: "替城防与行会誊写通缉、商路和征募告示，并按官印逐张张贴", advantage: "识字且熟悉公开告示、官印和城内道路", item: "旧告示底稿", categories: ["器武魂", "本体武魂"], trait: "好奇", route: "告示与调查", coin: 28, innate: 1 },
];

const AFFILIATIONS: AffiliationAxis[] = [
  { id: "seven-outpost", prefix: "七宝商路", location: "七宝琉璃宗西南商道属镇", authority: "七宝琉璃宗外务堂", access: "可接触七宝商队、外务执事和稳定物资渠道", obligation: "每季必须替外务堂完成一次指定差事", token: "七宝外务木牌", tags: ["七宝琉璃宗", "附属势力"], coin: 24, pressure: 2 },
  { id: "blue-vassal", prefix: "蓝电雷谷", location: "蓝电霸王龙宗南麓附庸镇", authority: "蓝电霸王龙宗外事院", access: "可进入雷谷外围训练区并接触龙类魂兽资料", obligation: "附庸家庭必须服从宗族征调与保密规矩", token: "雷谷附籍牌", tags: ["蓝电霸王龙宗", "附属势力"], coin: 20, pressure: 3 },
  { id: "hall-border", prefix: "武魂殿边区", location: "武魂殿北方边区主殿辖镇", authority: "武魂殿边区主殿", access: "拥有觉醒、登记、通缉与基层魂师教育渠道", obligation: "主殿会审查忠诚并优先征用有潜力的孩子", token: "边区主殿通行签", tags: ["武魂殿", "地方教会"], coin: 18, pressure: 3 },
  { id: "heaven-estate", prefix: "天斗皇庄", location: "天斗城东部皇庄", authority: "天斗皇室内务署", access: "能接触皇庄物资、官府文书与贵族雇员", obligation: "皇室内务出现问题时，皇庄人员没有拒绝调查的权利", token: "皇庄雇籍牌", tags: ["天斗帝国", "皇室属地"], coin: 28, pressure: 3 },
  { id: "star-garrison", prefix: "星罗军镇", location: "星罗北境虎牙军镇", authority: "星罗北军第三镇", access: "享有军镇训练、守备情报和边境通行便利", obligation: "战时全家都受军法与征调约束", token: "虎牙军镇户牌", tags: ["星罗帝国", "军方"], coin: 22, pressure: 4 },
  { id: "balak-guild", prefix: "巴拉克商会", location: "巴拉克王国金麦商镇", authority: "金麦联合商会", access: "有商队、仓库、短期借贷与地方人情网络", obligation: "商会救急从不免费，家庭已签下互保责任", token: "金麦商会筹牌", tags: ["巴拉克王国", "商会"], coin: 34, pressure: 2 },
  { id: "soto-undercity", prefix: "索托暗街", location: "索托城南暗街", authority: "索托城地下三行议事桌", access: "能接触黑市、斗魂外围、佣兵与不记名交易", obligation: "暗街保护必须以消息、钱或人情偿还", token: "暗街铜扣", tags: ["索托城", "地下势力", "反派可选"], coin: 30, pressure: 4 },
  { id: "seaside-port", prefix: "瀚海港务", location: "瀚海城东港家属街", authority: "瀚海城港务会", access: "熟悉海船、海魂师、异地货物和沿岸消息", obligation: "港务会与海盗都可能要求家庭暗中协助", token: "瀚海港工牌", tags: ["瀚海城", "海魂师"], coin: 30, pressure: 3 },
  { id: "forest-frontier", prefix: "星斗林缘", location: "星斗大森林西侧联防村", authority: "林缘五村联防会", access: "拥有魂兽预警、猎户互助和森林外围经验", obligation: "魂兽越界时每户都必须出人守村", token: "林缘警哨", tags: ["星斗大森林", "猎魂"], coin: 12, pressure: 4 },
  { id: "free-valley", prefix: "隐谷自由户", location: "落日森林北缘无籍隐谷", authority: "隐谷七户公议", access: "不受大势力日常管束，能自行试验路线与技艺", obligation: "没有官方身份、学院保送和强者兜底", token: "隐谷石刻路标", tags: ["隐居", "自由魂师"], coin: 8, pressure: 2 },
];

const CONFLICTS: ConflictAxis[] = [
  { id: "debt", label: "背着救命债", summary: "三年前家里为救一名重伤亲人欠下无法按时还清的人情与魂币。", burden: "债主可以要求一次不能公开拒绝的危险差事", trait: "知恩", route: "偿债或反制", tierBoost: 0, pressure: 2, selfKnowledge: "本地人 · 清楚债务对象与最后期限" },
  { id: "missing", label: "掌事者失踪", summary: "负责维持家庭生计的长辈在一次正常外出后失踪，只留下不完整路线。", burden: "收入来源正在中断，追查又可能触及长辈隐瞒的敌人", trait: "执着", route: "寻人旧案", tierBoost: 1, pressure: 3, selfKnowledge: "本地人 · 知道失踪前最后一段可靠行踪" },
  { id: "lineage", label: "藏有异脉", summary: "家谱与日常身份对不上，一名长辈坚持觉醒前绝不能查验血脉。", burden: "血脉公开后可能改变归属，也会引来主家追索", trait: "守秘", route: "血脉抉择", tierBoost: 2, pressure: 4, selfKnowledge: "本地人 · 知道自己的血缘记录被人为改过" },
  { id: "rival", label: "同门夺位", summary: "同龄竞争者拥有相近资源与更早的支持者，两人的结果会决定唯一名额。", burden: "失败会失去培养资格，胜利也会留下一个熟悉自己的敌人", trait: "好胜", route: "资格竞争", tierBoost: 1, pressure: 3, selfKnowledge: "本地人 · 清楚竞争规则、对手与唯一名额" },
  { id: "sealed-item", label: "保管禁物", summary: "家中被迫保管一件封存物，封条近期出现了并非自然磨损的裂痕。", burden: "禁物不能使用、丢失或上交错误的人，任何选择都可能得罪势力", trait: "戒备", route: "封存物谜案", tierBoost: 2, pressure: 5, selfKnowledge: "本地人 · 知道封存物存在，但不知道里面究竟是什么" },
];

const RARITIES: CandidatePublic["rarity"][] = ["平凡", "优秀", "稀有", "传奇", "神话"];

function rarityFor(role: RoleAxis, affiliation: AffiliationAxis, conflict: ConflictAxis): CandidatePublic["rarity"] {
  const score = role.innate + conflict.tierBoost + (affiliation.pressure >= 4 ? 1 : 0);
  return RARITIES[Math.max(0, Math.min(RARITIES.length - 1, score))];
}

export function buildSystemCoreOrigins(limit: number): ExpandedOriginTemplate[] {
  const generated: ExpandedOriginTemplate[] = [];
  for (const role of ROLES) for (const affiliation of AFFILIATIONS) for (const conflict of CONFLICTS) {
    const tier = rarityFor(role, affiliation, conflict);
    const advantage = `${role.advantage}；${affiliation.access}`;
    const burden = `${conflict.burden}；${affiliation.obligation}`;
    generated.push({
      id: `system-${affiliation.id}-${role.id}-${conflict.id}`,
      name: `${affiliation.prefix}${role.title}·${conflict.label}`,
      summary: `家里${role.livelihood}。${conflict.summary}`,
      details: [conflict.summary, affiliation.obligation, burden],
      locations: [affiliation.location],
      preferredCategories: role.categories,
      weight: tier === "平凡" ? 7 : tier === "优秀" ? 6 : tier === "稀有" ? 4 : tier === "传奇" ? 2 : 0.7,
      tier,
      route: `${role.route} · ${conflict.route}`,
      selfKnowledge: conflict.selfKnowledge,
      fixedTraits: [role.trait, conflict.trait],
      roleTags: [...affiliation.tags, role.route, conflict.route],
      authority: affiliation.authority,
      advantage,
      burden,
      innateBonus: Math.min(3, role.innate + Math.floor(conflict.tierBoost / 2)),
      startingCoins: role.coin + affiliation.coin,
      startingItems: [role.item, affiliation.token],
      startingReputation: tier === "神话" ? "多方势力重点留意" : tier === "传奇" ? "所属圈子中的重点后辈" : tier === "稀有" ? "所属组织已经留名" : "当地普通熟面孔",
      pressure: Math.min(5, Math.max(1, affiliation.pressure + conflict.pressure - 2)),
    });
    if (generated.length >= limit) return generated;
  }
  return generated;
}
