import { randomUUID } from "node:crypto";
import type {
  CandidatePublic,
  CharacterShapingView,
  CharacterPublic,
  MetaProgressionView,
  NarrativeEntry,
  PersonalitySetup,
  LifeGoalDifficulty,
  CandidateRarity,
  GameEra,
} from "../../shared/game.js";
import type {
  CreateGameInput,
  HiddenCandidate,
  MartialSoulTemplate,
  PersonalityProfile,
  StoredGame,
} from "./model.js";
import { createRandom, integer, pick, weightedPick } from "./random.js";
import { buildActiveEvents, buildIntelligenceView, buildKnownFigures, buildMapHierarchy, buildMapView, createHiddenWorld, inferLocationId, recordIntelligence, revealNpc } from "./world.js";
import { refreshStoryArchive } from "./story-rules.js";
import { worldMapPoint } from "../../shared/world-map.js";
import { EXPANDED_ORIGINS } from "../data/expanded-origins.js";
import { metaSoulById } from "../data/meta-martial-souls.js";
import { buildSystemCoreOrigins } from "../data/system-core-origins.js";
import { MARTIAL_SOUL_GRADE_ORDER, martialSoulGrade, normalizeMartialSoulName } from "../../shared/martial-soul.js";
import { ERA_MARTIAL_SOULS } from "../data/era-martial-souls.js";
import { fixedTraitEffect } from "./traits.js";

interface OriginTemplate {
  id: string;
  name: string;
  summary: string;
  details: string[];
  locations: string[];
  preferredCategories: string[];
  weight: number;
  tier?: CandidatePublic["rarity"];
  route?: string;
  selfKnowledge?: string;
  knownBackgrounds?: string[];
  fixedTraits?: string[];
  roleTags?: string[];
  authority?: string;
  advantage?: string;
  burden?: string;
  innateBonus?: number;
  startingCoins?: number;
  startingItems?: string[];
  startingReputation?: string;
  pressure?: number;
}

const SURNAMES = ["林", "苏", "顾", "沈", "陆", "叶", "程", "江", "白", "宁", "周", "秦"];
const GIVEN_NAMES = ["川", "宁", "昭", "砚", "澜", "遥", "清", "越", "衡", "棠", "烬", "青", "禾", "微"];
const FATHER_GIVEN_NAMES = ["守义", "青禾", "岳山", "德昌", "远林", "成业", "茂生", "长顺"];
const MOTHER_GIVEN_NAMES = ["兰芝", "素琴", "秋娘", "静娴", "春桃", "桂香", "月娥", "秀禾"];
const OFFICER_NAMES = ["素云涛", "韩守成", "顾岩", "赵闻", "林策", "程肃"];
const FAMILY_CLIMATES = [
  "家里规矩重，长辈很少当面夸人",
  "家里护短，遇到外人时总会先站在自家孩子这边",
  "家里精打细算，每一笔修炼花销都记在册上",
  "家里看重名声，觉醒结果会直接影响往来婚契与人情",
  "家里愿意冒险，只要回报足够就肯押上积蓄",
  "家里人各有打算，饭桌上的亲近不妨碍暗中竞争",
] as const;

function dwellingOptions(origin: OriginTemplate, location: string): string[] {
  if (/少宗主|继承人|宗主独子|嫡系/.test(origin.name)) return ["主峰继承人院东厢", "宗主院落第二进独室", "内门议事堂后的少主院", "护山阵内侧的继承人居所", "藏经阁与主峰之间的独院", "宗门核心区的临崖静室"];
  if (/亲传|核心弟子|圣子|圣女/.test(origin.name)) return ["内门弟子院甲字房", "授业长老院外侧弟子房", "核心演武场北侧静室", "藏书楼后的亲传小院", "主殿东侧弟子厢房", "拟态修炼区旁的独院"];
  if (/长老|斗罗|供奉/.test(origin.name)) return ["长老府东侧子弟院", "供奉殿家属区独院", "封号斗罗府邸第二进", "长老演武场后的暖阁", "内城警戒区家属院", "长老私宅藏书室旁卧房"];
  if (/商队|乡道/.test(location)) return ["头车后的篷车", "装药材的二号车厢", "车队东侧折篷", "护卫火堆旁的小帐", "驮兽栏后的旧篷车", "领队车外侧的窄铺位"];
  if (/城堡|府邸|王府|公爵府|山门|剑谷|宗/.test(`${location}${origin.name}`)) return ["东院临竹厢房", "演武场北侧独院", "藏书楼后的青瓦小院", "内门膳堂西侧偏院", "主院第二进暖阁", "护山石阶下的旧执事院"];
  if (/城|学院|街|码头|酒馆|分殿|黑市/.test(location)) return ["东市石桥旁二层木屋", "分殿后巷第三间院子", "南门水井边的灰瓦屋", "旧货栈二楼靠街房", "学院后墙外的窄院", "码头仓房后的木板屋"];
  if (/山|森林|药谷|猎户|采石/.test(`${location}${origin.name}`)) return ["山口第一座石屋", "药圃北边的竹篱小院", "旧猎棚旁的木屋", "溪水拐弯处的双间草房", "背风坡下的半石院", "林场仓棚后的矮屋"];
  return ["村东老槐树下的土院", "水井南侧第三间草房", "晒谷场后的两间瓦屋", "河堤边的木门小院", "村口石桥旁的旧屋", "里正家西侧的窄院"];
}

const BASE_ORIGINS: OriginTemplate[] = [
  {
    id: "village-farmer",
    name: "偏远村庄的农户孩子",
    summary: "家里靠几亩薄田过日子，附近武魂分殿每年只来一次。",
    details: ["去年雨水不好，粮仓底一直没铺满。", "你常替邻居放牛，认得河滩上每一处烂泥坑。", "家里还欠着村长半袋麦种。"],
    locations: ["天斗帝国西南的无名村落", "诺丁城辖下的河谷村", "法斯诺行省北缘村镇"],
    preferredCategories: ["植物", "器武魂", "兽武魂"],
    weight: 22,
  },
  {
    id: "smith-family",
    name: "小城铁匠家庭",
    summary: "你在炉火边长大，衣角总沾着擦不净的黑灰。",
    details: ["父亲接的多是修农具的小活，铺子里很少见到真正的魂导器。", "铺子欠了两个月炭钱，母亲最近总把账本压在枕头底下。", "老师傅不许你碰重锤，却肯教你听铁料的声音。"],
    locations: ["诺丁城南区", "索托城外的工匠街", "星罗北境的军需镇"],
    preferredCategories: ["器武魂", "本体武魂"],
    weight: 15,
  },
  {
    id: "border-guard",
    name: "边境巡守之家",
    summary: "你听着军号和商队的车轮声长大，家里人很少谈巡夜时见过什么。",
    details: ["父亲左腿有旧伤，阴天走路会慢半步。", "你会认几种军旗，却还没被允许碰真正的长枪。", "上个月有支商队没能按时回来，哨镇这几天查得很严。"],
    locations: ["天斗与星罗交界哨镇", "星罗帝国西北边堡", "巴拉克王国边境"],
    preferredCategories: ["兽武魂", "器武魂"],
    weight: 13,
  },
  {
    id: "herbalist",
    name: "采药人的孩子",
    summary: "你认得常用药草，也挨过把毒藤当柴火的骂。",
    details: ["母亲进山后已经晚归两次，最近一次带回来的药篓破了半边。", "你能分清止血草和长得很像的苦叶，只是手法还慢。", "家里晒着一株没人叫得出名字的灰白草根。"],
    locations: ["落日森林外围聚落", "猎魂森林补给镇", "天斗南部丘陵"],
    preferredCategories: ["植物", "本体武魂"],
    weight: 14,
  },
  {
    id: "fallen-clan",
    name: "没落魂师家族旁支",
    summary: "旧宅还挂着先祖画像，库房却只剩发潮的木箱。",
    details: ["家里人嘴上不提复兴，觉醒日前却把族谱擦了三遍。", "主支已经多年不来信，祖母仍留着一把不开刃的旧钥匙。", "你有一位同龄堂亲，家中所有人都在暗中比较你们。"],
    locations: ["天斗城远郊", "索托城旧城区", "星罗帝国一座衰落封地"],
    preferredCategories: ["器武魂", "兽武魂", "植物"],
    weight: 10,
  },
  {
    id: "temple-clerk",
    name: "武魂殿基层人员家庭",
    summary: "家里有人在武魂分殿做杂务，你见过不少孩子哭着走出觉醒室。",
    details: ["负责登记的执事认得你，却没答应在仪式上照顾你。", "你偷偷看过旧名册，知道先天魂力一级也会被郑重记下。", "家里只盼你有魂力，武魂好不好反而没人敢多想。"],
    locations: ["诺丁城武魂分殿附近", "天斗东部主城", "星罗南部行省城"],
    preferredCategories: ["器武魂", "兽武魂", "本体武魂"],
    weight: 9,
  },
  {
    id: "merchant-caravan",
    name: "流动商队的孩子",
    summary: "你跟着车队换过许多住处，会算零钱，也能听出几种口音。",
    details: ["商队今年少了两辆车，领队不肯解释原因。", "你照看的是一匹脾气坏的老驮马，它只肯让你靠近。", "父母打算在下一座城落脚，这话已经说过三年。"],
    locations: ["前往索托城的商路", "天斗帝国中央商道", "星罗北境驿站"],
    preferredCategories: ["器武魂", "兽武魂"],
    weight: 10,
  },
  {
    id: "mystery-arrival",
    name: "身世不明的孩子",
    summary: "六年前，养父母在荒野里捡到了你。那晚的天象很怪，他们一直不肯细说。",
    details: ["襁褓里原本有一块碎玉，三年前忽然失去了光泽。", "养父每逢觉醒日都会失眠，今年尤其严重。", "你身上没有信物，只有左肩一块形状古怪的淡色胎记。"],
    locations: ["落日森林以东的村落", "星斗大森林外围小镇", "海边的偏僻渔村"],
    preferredCategories: ["器武魂", "本体武魂", "植物"],
    weight: 3,
  },
  {
    id: "hunter-family",
    name: "猎户家庭",
    summary: "家里靠兽皮和山货换钱，你很早就学会顺着折断的草茎找路。",
    details: ["父亲的短弓拉力不大，却从不许你空放弓弦。", "后山最近少了几窝野兔，猎户们怀疑有魂兽越过外围。", "墙上挂着一张咬痕很深的旧兽皮，谁问来历都会被岔开。"],
    locations: ["猎魂森林外围村落", "星斗大森林西侧猎户镇", "巴拉克王国北部山村"],
    preferredCategories: ["兽武魂", "器武魂"],
    weight: 13,
  },
  {
    id: "fisher-family",
    name: "河港渔家",
    summary: "你会补网、辨水色，手掌上的细口子总是刚结痂又裂开。",
    details: ["今年汛期来得早，家里的小船撞坏了一侧船舷。", "祖父说深水里有东西跟过他的船，却不肯再去那片河湾。", "你最熟的伙伴是码头上一个爱偷鱼干的瘸腿孩子。"],
    locations: ["天斗南部河港", "索托城外水乡", "星罗北境渡口"],
    preferredCategories: ["兽武魂", "器武魂", "植物"],
    weight: 11,
  },
  {
    id: "academy-servant",
    name: "初级魂师学院雇工家庭",
    summary: "你住在学院后街，隔着围墙听过高年级学生练习魂技。",
    details: ["母亲负责浆洗校服，最怕学生把昂贵布料烧出窟窿。", "门房偶尔把废弃课本留给你，缺页比完整的多。", "工读生宿舍空出过一张床，你已经偷偷看了好几次。"],
    locations: ["诺丁初级魂师学院后街", "索托城初级学院外", "星罗北部行省学院区"],
    preferredCategories: ["器武魂", "本体武魂", "植物"],
    weight: 9,
  },
  {
    id: "minor-noble",
    name: "小贵族的非继承人",
    summary: "家里有姓氏、宅院和一块不大的封地，你分不到最好的老师。",
    details: ["长兄已经显露出家族武魂，长辈谈到你时总会压低声音。", "管家教你礼数，也教你在饭桌上少问一句。", "父亲答应觉醒后再决定你的去处，这通常不是好消息。"],
    locations: ["天斗帝国东部小封地", "巴拉克王国乡间庄园", "星罗帝国边缘领地"],
    preferredCategories: ["兽武魂", "器武魂"],
    weight: 6,
  },
  {
    id: "refugee-family",
    name: "迁徙中的流民家庭",
    summary: "你们搬过三次家，能带走的东西只剩两只木箱和一口旧锅。",
    details: ["父母对故乡闭口不谈，只在夜里偶尔说起那边的口音。", "落脚的村子肯给田，却不肯把你们算作自己人。", "一份写着旧地名的路引被缝在母亲衣领里。"],
    locations: ["法斯诺行省新垦村", "天斗与巴拉克交界聚落", "星罗北境难民营地"],
    preferredCategories: ["植物", "器武魂", "兽武魂"],
    weight: 8,
  },
  {
    id: "tavern-family",
    name: "小镇酒馆家庭",
    summary: "你在酒气、油烟和争吵声里长大，知道客人醉后说的话只能信一半。",
    details: ["后厨藏着一只没上锁的账箱，父亲以为你不知道。", "常住店里的落魄魂师欠了半个月房钱，拿故事抵账。", "最近有几个陌生人反复打听附近的旧矿洞。"],
    locations: ["索托城外商旅镇", "天斗中央商道驿镇", "星罗北境军镇"],
    preferredCategories: ["本体武魂", "器武魂", "兽武魂"],
    weight: 8,
  },
  {
    id: "stone-quarry",
    name: "采石场工人家庭",
    summary: "清晨第一声凿石响起时你就会醒，屋里总有一层薄薄的石粉。",
    details: ["采石场新挖出一层带金属光泽的黑石，管事不许孩子靠近。", "叔父去年伤了腰，家里少了一份工钱。", "你常在废石堆里挑形状顺手的小块，床底已经攒了一筐。"],
    locations: ["天斗西部采石镇", "巴拉克王国丘陵矿场", "星罗北部山口"],
    preferredCategories: ["器武魂", "本体武魂"],
    weight: 9,
  },
  {
    id: "travelling-healer",
    name: "游方医者家庭",
    summary: "你跟着家人替人看伤，药箱里最贵的东西从来不会摆在上层。",
    details: ["父亲能治刀伤，却不愿接魂师留下的伤。", "你记得几张药方，字还没认全，只能靠图形和气味。", "半年前救下的病人留下了一枚无法兑现的旧徽记。"],
    locations: ["前往诺丁城的乡道", "巴拉克王国南部村镇", "星罗东部行省"],
    preferredCategories: ["植物", "本体武魂", "器武魂"],
    weight: 8,
  },
  {
    id: "sect-village",
    name: "魂师宗门附属村民",
    summary: "村里的田地归附近宗门照看，收成也要按规矩交出一份。",
    details: ["外门弟子偶尔来挑杂役，村里人既羡慕又害怕。", "你替宗门看过药圃外围，却从没被准许跨过那道矮墙。", "族叔曾进过宗门，回来后只剩一只不太灵便的右手。"],
    locations: ["天斗东部宗门属村", "巴拉克王国山脚村", "星罗西部魂师领地"],
    preferredCategories: ["植物", "器武魂", "兽武魂"],
    weight: 7,
  },
  {
    id: "seven-treasure-core",
    name: "七宝琉璃宗内门亲传",
    summary: "他从小住在七宝城堡内院，宁风致亲自看过他的启蒙课业。",
    details: ["剑斗罗答应在觉醒后试他三剑，输赢都要记进内门考册。", "宗门已经替他留出一间修炼室，门上还没有挂牌。", "宁荣荣把他当作同辈竞争者，见面时从不肯先服软。"],
    locations: ["七宝琉璃宗城堡内院"],
    preferredCategories: ["器武魂", "兽武魂"],
    weight: 3,
    tier: "稀有",
    route: "上三宗天骄",
    selfKnowledge: "本地人 · 身世明确",
    knownBackgrounds: ["他知道自己已被列入内门亲传名册。觉醒结果会决定由剑斗罗、骨斗罗还是宗门教习接手。"],
    fixedTraits: ["宗门荣誉", "骄傲"],
    roleTags: ["七宝琉璃宗", "权贵", "天才", "正邪皆可"],
  },
  {
    id: "spirit-hall-elder-child",
    name: "武魂殿封号长老之子",
    summary: "他的父亲是长老殿新晋封号斗罗霜戈，名字没有写进公开名册。",
    details: ["教皇殿与长老殿都派人来旁观这次觉醒，谁也没有解释原因。", "父亲只教过他一句话，武魂殿记得住有价值的人。", "侍从昨夜烧掉了一封来自供奉殿的密信。"],
    locations: ["武魂城长老殿东侧府邸"],
    preferredCategories: ["器武魂", "兽武魂", "本体武魂"],
    weight: 2,
    tier: "神话",
    route: "武魂殿权贵",
    selfKnowledge: "本地人 · 身世明确",
    knownBackgrounds: ["他清楚父亲的封号和自己能调动的资源，也知道长老之子的身份会招来监视、拉拢与暗杀。"],
    fixedTraits: ["权势敏感", "好胜"],
    roleTags: ["武魂殿", "权贵", "天才", "反派"],
  },
  {
    id: "hidden-sect-heir",
    name: "隐世太玄剑宗少宗主",
    summary: "太玄剑宗藏在星斗大森林西北断崖后，外界只当那里是一片死谷。",
    details: ["宗门最强的三位长老受旧誓约束，不能轻易离山。", "祖师留下的剑碑已经沉寂百年，却在他出生那晚响过一声。", "宗门库房不缺古物，真正能在斗罗规则下使用的却没有几件。"],
    locations: ["太玄剑宗封山剑谷"],
    preferredCategories: ["器武魂", "本体武魂"],
    weight: 2,
    tier: "神话",
    route: "隐世宗门少主",
    selfKnowledge: "本地人 · 知道宗门真相",
    knownBackgrounds: ["他知道自己是少宗主，也知道宗门所谓无敌只限山门阵势。走出剑谷后，长老不会替他扫平敌人。"],
    fixedTraits: ["自负", "守秘"],
    roleTags: ["原创宗门", "权贵", "天才", "正邪皆可"],
  },
  {
    id: "blue-lightning-heir",
    name: "蓝电霸王龙宗核心嫡系",
    summary: "他的名字写在宗族嫡系谱牒上，出生起就要与同辈争夺雷池名额。",
    details: ["玉罗冕一脉的教习亲自盯着他的体魄训练。", "堂兄已经觉醒出蓝电霸王龙，族里把两人的名字写在同一页。", "宗门不缺资源，缺的是能让所有长老闭嘴的成绩。"],
    locations: ["蓝电霸王龙宗雷霆山门"],
    preferredCategories: ["兽武魂", "本体武魂"],
    weight: 3,
    tier: "稀有",
    route: "兽武魂嫡系",
    selfKnowledge: "本地人 · 身世明确",
    knownBackgrounds: ["他知道自己的族谱、竞争者和宗门规矩。武魂若不是龙类，嫡系身份也保不住体面。"],
    fixedTraits: ["家族责任", "好强"],
    roleTags: ["蓝电霸王龙宗", "权贵", "天才"],
  },
  {
    id: "clear-sky-sealed-branch",
    name: "昊天宗封山支脉遗孤",
    summary: "他住在昊天宗外围旧村，守村人从不许他问山上的路通向哪里。",
    details: ["养父把一枚昊天旧令藏在粮缸底下。", "村中老人见他练力时会停下手里的活，却没人肯教。", "武魂殿的巡查队每隔几年就会来翻一次旧户册。"],
    locations: ["昊天宗封山外围旧村"],
    preferredCategories: ["器武魂", "兽武魂"],
    weight: 3,
    tier: "稀有",
    route: "封山宗门遗脉",
    selfKnowledge: "本地人 · 知道一半",
    knownBackgrounds: ["他知道家里与昊天宗有关，也知道这层关系不能在武魂殿面前说。父母的真正死因仍被瞒着。"],
    fixedTraits: ["戒备", "念旧"],
    roleTags: ["昊天宗", "遗孤", "复仇"],
  },
  {
    id: "heaven-royal-ward",
    name: "天斗皇室旁系封爵子",
    summary: "他有一座不大的王府、二十名护卫，还有一份随时可能被收回的封爵。",
    details: ["雪星亲王送来过启蒙老师，代价是王府在议事时站队。", "太子府每年送礼，礼单比礼物本身更值得琢磨。", "乳母一再提醒他，皇室孩子觉醒得太好未必全是喜事。"],
    locations: ["天斗城南旁系王府"],
    preferredCategories: ["兽武魂", "器武魂"],
    weight: 3,
    tier: "稀有",
    route: "皇室棋局",
    selfKnowledge: "本地人 · 身世明确",
    knownBackgrounds: ["他知道自己的爵位、血缘和两位皇叔的态度。宫廷里有人愿意扶持他，也有人希望他永远只是孩子。"],
    fixedTraits: ["谨言", "权衡"],
    roleTags: ["天斗帝国", "权贵", "阴谋", "正邪皆可"],
  },
  {
    id: "star-luo-contender",
    name: "星罗公爵府竞争子嗣",
    summary: "他出生在星罗军功公爵府，同胞兄长既是家人，也是写进族规的竞争者。",
    details: ["三岁起的失败记录都被管家装订成册。", "母亲替他争来一名魂帝教官，却没争到继承顺位。", "府中没人禁止下毒，只禁止留下证据。"],
    locations: ["星罗城北军功公爵府"],
    preferredCategories: ["兽武魂", "器武魂"],
    weight: 3,
    tier: "稀有",
    route: "星罗生存战",
    selfKnowledge: "本地人 · 身世明确",
    knownBackgrounds: ["他从小就知道竞争失败者会失去什么。亲情存在，但从来排在继承规则后面。"],
    fixedTraits: ["好胜", "警惕"],
    roleTags: ["星罗帝国", "权贵", "反派", "竞争"],
  },
  {
    id: "cultivator-reincarnation",
    name: "异世剑修转生者",
    summary: "他带着前世修行记忆出生，六年里已经确认经脉、灵气与旧世界完全不同。",
    details: ["前世佩剑只剩识海里一道黯淡剑痕。", "能背出的功法很多，能在这具身体上运转的还没有一部。", "他知道自己回不去了，也不准备把这件事告诉养父母。"],
    locations: ["落日森林东侧隐居药谷", "天斗西境山村"],
    preferredCategories: ["器武魂", "本体武魂"],
    weight: 2,
    tier: "传奇",
    route: "修仙世界转生",
    selfKnowledge: "转生者 · 保留完整前世记忆",
    knownBackgrounds: ["他清楚自己来自另一个修行世界，记得剑法、丹理与炼器常识。旧修为已经消失，所有知识都要重新适配魂力与材料。"],
    fixedTraits: ["老成", "求道"],
    roleTags: ["异界体系", "穿越者", "天才", "正邪皆可"],
  },
  {
    id: "modern-transmigrator",
    name: "带着原著记忆的穿越者",
    summary: "他记得斗罗大陆的主要剧情，却不能确定眼前世界是否会照着记忆发展。",
    details: ["六年来见到的地名和制度大多对得上，细节却已经有偏差。", "他能写出现代常识，做不出缺少材料和工艺的成品。", "家人把他偶尔说出的怪话当成孩子做梦。"],
    locations: ["诺丁城辖下商镇", "索托城西侧村庄", "天斗城平民区"],
    preferredCategories: ["器武魂", "本体武魂", "植物"],
    weight: 3,
    tier: "稀有",
    route: "知晓剧情的穿越者",
    selfKnowledge: "穿越者 · 知道原作主线",
    knownBackgrounds: ["他知道唐三、史莱克与武魂殿的大致未来。时间只精确到年份，细节可能因他的行动发生变化。"],
    fixedTraits: ["秘密主义"],
    roleTags: ["穿越者", "剧情知识", "正邪皆可"],
  },
  {
    id: "underworld-heir",
    name: "黑槐会少主",
    summary: "黑槐会替贵族处理见不得光的债务、走私和寻仇，他是会主唯一公开的继承人。",
    details: ["他五岁就学会分辨账本上哪些名字不能念。", "会里有三位魂王，却没有一个人愿意无条件效忠孩子。", "武魂殿执法队刚端掉一处分舵，父亲怀疑内鬼就在身边。"],
    locations: ["索托城地下黑市", "天斗城南旧仓区"],
    preferredCategories: ["兽武魂", "器武魂", "本体武魂"],
    weight: 3,
    tier: "稀有",
    route: "地下势力少主",
    selfKnowledge: "本地人 · 身世明确",
    knownBackgrounds: ["他知道家业靠什么赚钱，也知道父亲手上沾过血。是否接班、洗白或吞掉别人的地盘，由他自己决定。"],
    fixedTraits: ["护短", "手段意识"],
    roleTags: ["原创势力", "反派", "地下世界", "正邪皆可"],
  },
  {
    id: "evil-soul-remnant",
    name: "禁术魂师余脉",
    summary: "他的家族靠吞噬类禁术活下来，三代人都在躲武魂殿的追捕。",
    details: ["家谱最后一页写着不能吸收活人的魂力，旁边却有被刮掉的名字。", "母亲教他隐藏气息，也教他在必要时先下手。", "一名武魂殿执事已经在镇上问起旧姓。"],
    locations: ["星罗北境废弃矿镇", "巴拉克王国沼泽村"],
    preferredCategories: ["本体武魂", "兽武魂", "植物"],
    weight: 2,
    tier: "传奇",
    route: "黑暗传承",
    selfKnowledge: "本地人 · 知道家族禁忌",
    knownBackgrounds: ["他知道家族力量的来源和最低限度的戒律。要守住底线、改良禁术，还是成为真正的掠夺者，游戏不会替他决定。"],
    fixedTraits: ["多疑", "生存本能"],
    roleTags: ["禁术", "反派", "通缉", "正邪皆可"],
  },
  {
    id: "hidden-master-ward",
    name: "隐居魂斗罗的养子",
    summary: "收养他的老人自称普通猎户，却能让千年魂兽隔着山谷转身离开。",
    details: ["老人不肯报封号，只说欠下的仇还没有还完。", "木屋地下锁着一只魂导储物箱，钥匙从不离身。", "他每天练的呼吸和步法不像村里任何一种活计。"],
    locations: ["星斗大森林西侧孤峰", "落日森林北缘旧猎屋"],
    preferredCategories: ["兽武魂", "器武魂", "本体武魂"],
    weight: 4,
    tier: "稀有",
    route: "强者养成",
    selfKnowledge: "本地人 · 知道养父是强者",
    knownBackgrounds: ["他知道养父至少是魂斗罗，也知道老人有仇家。真正来历、武魂和为何收养他仍未说清。"],
    fixedTraits: ["尊师", "戒备"],
    roleTags: ["强者后代", "隐居", "天才"],
  },
  ...EXPANDED_ORIGINS,
];

const ORIGINS: OriginTemplate[] = [
  ...BASE_ORIGINS.map((origin) => ({
    ...origin,
    route: origin.route ?? `身份路线 · ${origin.name}`,
    advantage: origin.advantage ?? origin.summary,
    burden: origin.burden ?? origin.details[0],
    startingItems: origin.startingItems ?? [`${origin.name}的家用信物`],
  })),
  ...buildSystemCoreOrigins(Math.max(0, 1000 - BASE_ORIGINS.length)),
];

export const ERA_BASE_YEARS: Record<GameEra, number> = { 1: 0, 2: 10000, 3: 20000, 4: 30000 };
const ERA_ANCHORS: Record<GameEra, string> = { 1: "唐三觉醒", 2: "霍雨浩离府求学", 3: "唐舞麟觉醒", 4: "蓝轩宇觉醒" };

function laterOrigin(id: string, name: string, summary: string, location: string, tier: CandidateRarity, categories: string[], route: string, authority: string, advantage: string, burden: string): OriginTemplate {
  return { id, name, summary, details: [burden, `${authority}保留着这户人家的正式记录。`, `六岁觉醒结果会直接改变${route}的可行性。`], locations: [location], preferredCategories: categories, weight: tier === "平凡" ? 18 : tier === "优秀" ? 12 : tier === "稀有" ? 7 : 3, tier, route, selfKnowledge: "本地人 · 身份记录明确", fixedTraits: tier === "平凡" ? ["务实"] : ["受过教育", "谨慎"], roleTags: [route, authority], authority, advantage, burden, startingCoins: tier === "平凡" ? 20 : tier === "优秀" ? 80 : tier === "稀有" ? 220 : 500, startingItems: [`${authority}签发的身份牌`], startingReputation: `${authority}登记在册`, pressure: tier === "传奇" ? 4 : tier === "稀有" ? 3 : 2 };
}

const LATER_ERA_ORIGINS: Record<2 | 3 | 4, OriginTemplate[]> = {
  2: [
    laterOrigin("d2-shrek-craft-child", "史莱克城工匠家庭", "家里替学院外城修理普通魂导灯与训练器材。", "史莱克城外城工匠区", "平凡", ["器武魂", "本体武魂"], "史莱克城生活", "史莱克城工匠行会", "熟悉学院外城与基础魂导工具", "家里背着一批维修材料的欠款"),
    laterOrigin("d2-tang-sect-descendant", "衰落唐门旁支后代", "祖辈留下几页暗器图，却没人能证明旁支身份。", "史莱克城唐门旧院附近", "稀有", ["器武魂", "植物"], "唐门复兴", "唐门旧籍保管人", "认识少量暗器零件与唐门旧规", "身份未经当代唐门核心承认"),
    laterOrigin("d2-radiant-engineer", "明都魂导师家庭", "父母在民用魂导工坊工作，家中按图纸和保密等级说话。", "明都平民魂导工坊区", "优秀", ["器武魂", "精神"], "魂导师", "日月帝国工坊署", "从小接触合法的低阶魂导回路", "工坊成果和个人去向受契约约束"),
    laterOrigin("d2-body-sect-omen", "本体武魂异象儿童", "身体某处在魂力检测时出现异常共鸣，引来陌生人的反复询问。", "天魂城南部居民区", "传奇", ["本体武魂"], "本体宗线索", "天魂帝国地方魂师署", "本体武魂可能发生二次觉醒", "本体宗与地方势力都可能争夺培养权"),
    laterOrigin("d2-star-luo-military", "星罗军户魂师家庭", "家中服役记录完整，孩子的培养名额与军功绑定。", "星罗城军户区", "优秀", ["兽武魂", "器武魂"], "帝国军旅", "星罗帝国军务署", "拥有纪律、基础体能和军方推荐渠道", "成年后需履行军役或偿还培养费"),
    laterOrigin("d2-wandering-healer", "天魂乡镇游医之子", "跟着药箱与驮车辗转小镇，见过普通人承担不起治疗费的样子。", "天魂城外药商驿站", "平凡", ["植物", "本体武魂"], "医疗与游历", "地方药师公会", "识别常用药材并熟悉乡镇路线", "没有稳定学院名额与长期住处"),
  ],
  3: [
    laterOrigin("d3-east-sea-worker", "傲来城普通职工家庭", "父母靠工厂的固定薪水维持生活，升入东海学院意味着离家。", "傲来城红山学院居民区", "平凡", ["器武魂", "本体武魂"], "联邦市民", "傲来城居民署", "熟悉基础魂导设备与初等学院生活", "优质魂灵、车票与外地学院费用远超家庭结余"),
    laterOrigin("d3-spirit-pagoda-staff", "传灵塔基层职员子女", "家里负责登记与维护，不接触核心研究。", "传灵塔总部职员区", "优秀", ["精神", "兽武魂"], "传灵师", "传灵塔基层人事处", "了解正规魂灵申请流程", "每一次便利都会留下内部审计记录"),
    laterOrigin("d3-tang-sect-branch", "两万年唐门外门家庭", "家族为唐门经营一处普通联络点。", "史莱克城唐门外务街", "稀有", ["器武魂", "植物"], "现代唐门", "唐门外务堂", "能接触唐门基础训练与合规魂导装备", "必须承担情报纪律与宗门任务"),
    laterOrigin("d3-federal-military", "联邦军官家庭", "家庭生活随调令迁移，档案比邻里关系更稳定。", "联邦明都军属区", "优秀", ["兽武魂", "器武魂"], "联邦军旅", "联邦军务系统", "体能训练、纪律和升学推荐渠道稳定", "个人选择会受到军籍与家庭声誉约束"),
    laterOrigin("d3-shrek-lineage", "史莱克旧校友后代", "长辈留下的不是入学保证，只是一套严格到近乎苛刻的训练记录。", "史莱克城外院家属区", "传奇", ["兽武魂", "器武魂", "精神"], "史莱克考生", "史莱克校友会", "拥有可靠训练方法与校友引荐", "失败会直接击碎家族长期维持的期待"),
    laterOrigin("d3-overseas-exchange", "海外星罗侨居家庭", "家中保留海外星罗户籍，也在联邦长期生活。", "海外星罗城侨民区", "稀有", ["兽武魂", "器武魂"], "跨大陆身份", "海外星罗领事署", "熟悉两套制度并掌握跨海亲缘", "双方都会怀疑其真正立场"),
  ],
  4: [
    laterOrigin("d4-fleet-family", "联邦舰队军属子女", "家庭住址与父母航次一起变化，团聚要按舰队日历计算。", "联邦母舰港军属区", "优秀", ["器武魂", "精神"], "星际舰队", "联邦舰队军务处", "熟悉基础舰船纪律与太空安全", "家人常年执行高风险远航任务"),
    laterOrigin("d4-space-technician", "星际维修技师家庭", "家里修的是运输艇和生命维持设备，不是传奇战舰。", "天罗星航空基地维修区", "平凡", ["器武魂", "本体武魂"], "星际工程", "天罗星技师协会", "掌握基础机械与舱外安全常识", "一场设备事故留下尚未结清的赔偿"),
    laterOrigin("d4-shrek-space", "史莱克星际预备家庭", "长辈以严格训练换来一次预备测试资格。", "史莱克城星际教育区", "稀有", ["精神", "兽武魂", "器武魂"], "史莱克星际考核", "史莱克星际教育署", "拥有模拟舱训练与规范课程", "资格只保留一次且淘汰后不退还资源"),
    laterOrigin("d4-senluo-research", "森罗星生态研究员子女", "从小被教导所有采样都要留下坐标与许可。", "森罗星科研居住区", "优秀", ["植物", "兽武魂"], "魂兽生态", "森罗星生态管理局", "熟悉保护区规则与基础野外观测", "接近魂兽核心区需要严格许可"),
    laterOrigin("d4-ancient-blood", "古魂兽样本异常关联者", "一次常规体检显示出无法归入现有数据库的血脉波动。", "天罗星古魂兽研究所家属区", "传奇", ["兽武魂", "精神"], "血脉谜团", "联邦古魂兽研究所", "异常血脉带来极高成长可能", "身份与样本数据都受到持续监控"),
    laterOrigin("d4-colony-child", "联邦行政星普通家庭", "家里经营小型补给站，所有物资都要等航班。", "天斗星民用航空城", "平凡", ["植物", "器武魂"], "星际生活", "天斗星民政署", "适应行政星生活与长期物资计划", "补给延误会立刻影响全家生计"),
  ],
};

export const BIRTH_PROFILE_COUNT = ORIGINS.length * FAMILY_CLIMATES.length * 6;
export const CORE_ORIGIN_COUNT = ORIGINS.length;
export const CORE_ORIGIN_UNIQUE_NAME_COUNT = new Set(ORIGINS.map((origin) => origin.name)).size;
export const CORE_ORIGIN_MECHANIC_SIGNATURE_COUNT = new Set(ORIGINS.map((origin) => [origin.advantage, origin.burden, origin.route, origin.startingCoins, origin.startingItems?.join("、")].join("|"))).size;

const BASE_MARTIAL_SOULS: MartialSoulTemplate[] = [
  {
    id: "blue-silver-grass",
    name: "蓝银草",
    category: "植物",
    description: "大陆随处可见的蓝银草。它看似弱小，兼容性却远高于多数人的想象。",
    rarity: 18,
    soulPowerRange: [0, 4],
    omens: ["靠近你掌心的野草总比别处更有韧性", "你能分辨泥土中极细微的水分变化"],
  },
  {
    id: "ink-bamboo",
    name: "墨纹竹",
    category: "植物",
    description: "竹节带着墨色纹理，兼有韧性、穿刺和微弱的魂力传导能力。",
    rarity: 9,
    soulPowerRange: [2, 7],
    omens: ["你折下的细枝很少从纹理处断裂", "雨落竹叶的声音总让你异常专注"],
  },
  {
    id: "wind-vine",
    name: "听风藤",
    category: "植物",
    description: "细藤会随气流轻颤，适合感知、缠绕与速度干扰方向。",
    rarity: 10,
    soulPowerRange: [1, 6],
    omens: ["闭上眼后，你仍能察觉窗缝吹来的风", "细绳在你手里仿佛更容易找到落点"],
  },
  {
    id: "forged-hammer",
    name: "百锻锤",
    category: "器武魂",
    description: "一柄结构朴素的铸锤，重量与魂力传导都很稳定。",
    rarity: 13,
    soulPowerRange: [1, 6],
    omens: ["你对金属敲击声的细微差别格外敏感", "同龄人很难长时间握住你常用的工具"],
  },
  {
    id: "iron-spear",
    name: "铁脊长枪",
    category: "器武魂",
    description: "枪杆如脊骨般分节，适合直线突击，也保留继续进化的空间。",
    rarity: 8,
    soulPowerRange: [3, 8],
    omens: ["你投出的木杆总能比预想中更直", "面对冲来的牲畜时，你很少本能后退"],
  },
  {
    id: "clear-mirror",
    name: "明心镜",
    category: "器武魂",
    description: "一面微光古镜，可能向精神感知、幻象辨识或辅助方向成长。",
    rarity: 5,
    soulPowerRange: [4, 9],
    omens: ["你偶尔能从倒影中先一步察觉身后动静", "谎言会让你产生难以解释的不适"],
  },
  {
    id: "ash-falcon",
    name: "青灰隼",
    category: "兽武魂",
    description: "并不以血脉高贵著称的猛禽武魂，视觉和短距爆发值得期待。",
    rarity: 12,
    soulPowerRange: [2, 7],
    omens: ["极远处移动的小点很难逃过你的眼睛", "站在高处会让你平静而不是害怕"],
  },
  {
    id: "stoneback-turtle",
    name: "岩背龟",
    category: "兽武魂",
    description: "偏向防御与耐力的龟类武魂，行动不快，但根基沉稳。",
    rarity: 11,
    soulPowerRange: [1, 6],
    omens: ["跌倒和碰撞很少让你真正受伤", "你能在寒冷水中坚持很久"],
  },
  {
    id: "spirit-eyes",
    name: "灵眸",
    category: "本体武魂",
    description: "以双眼为核心的本体武魂，初期力量有限，却拥有罕见的精神成长空间。",
    rarity: 3,
    soulPowerRange: [3, 9],
    omens: ["你能记住只看过一瞬的复杂纹样", "情绪激烈时，周围的一切似乎会短暂变慢"],
  },
  {
    id: "star-book",
    name: "星痕书",
    category: "器武魂",
    description: "空白书页上浮动着细碎星痕，能力方向尚不明确。",
    rarity: 2,
    soulPowerRange: [5, 10],
    omens: ["你反复梦见一页写不出文字的书", "晴夜里，你总能很快找到方向"],
  },
  { id: "copper-coin", name: "方孔铜钱", category: "器武魂", description: "一枚边缘磨损的铜钱，可能向判断、交换或轨迹干扰成长。", rarity: 10, soulPowerRange: [1, 6], omens: ["你抛出的铜钱落地时很少弹远", "你对价钱和数量记得格外牢"] },
  { id: "silk-thread", name: "缚魂丝", category: "器武魂", description: "肉眼很难看清的细丝，韧性会随魂力提高。", rarity: 7, soulPowerRange: [3, 8], omens: ["你打的绳结很少自行松开", "手指能察觉极轻的拉扯"] },
  { id: "blackwood-bow", name: "黑木弓", category: "器武魂", description: "弓身朴素，擅长蓄力、远射和标记目标。", rarity: 10, soulPowerRange: [2, 7], omens: ["你能估准石子落下的位置", "拉紧的绳弦声会让你立刻安静"] },
  { id: "medicine-cauldron", name: "青纹药鼎", category: "器武魂", description: "带有浅青纹路的小鼎，对药性与火候十分敏感。", rarity: 4, soulPowerRange: [4, 9], omens: ["草药煮开前你就能闻出变化", "靠近炉火时掌心会微微发热"] },
  { id: "moon-wolf", name: "灰月狼", category: "兽武魂", description: "耐力和群体配合出色的狼类武魂，夜间感知较强。", rarity: 9, soulPowerRange: [2, 8], omens: ["夜路上你很少走错方向", "远处犬吠里细小的变化瞒不过你"] },
  { id: "cloud-deer", name: "踏云鹿", category: "兽武魂", description: "体态轻盈的鹿类武魂，适合移动、辅助与危险感知。", rarity: 7, soulPowerRange: [3, 8], omens: ["你落脚时很少踩断枯枝", "陌生动物通常不太排斥你"] },
  { id: "iron-mantis", name: "铁臂螳螂", category: "兽武魂", description: "前肢锋利，短距离爆发强，持续作战能力普通。", rarity: 8, soulPowerRange: [2, 8], omens: ["你挥动短棍时总爱走最短路线", "手臂被划伤后恢复得比别处快"] },
  { id: "sand-fox", name: "沙耳狐", category: "兽武魂", description: "擅长听觉、隐匿与制造误判的小型兽武魂。", rarity: 11, soulPowerRange: [1, 7], omens: ["隔墙说话也很难瞒过你", "你在松软地面上留下的脚印很浅"] },
  { id: "blood-thorn", name: "赤棘藤", category: "植物", description: "带有细刺的藤蔓，能从受伤与压力中加快生长。", rarity: 8, soulPowerRange: [2, 8], omens: ["带刺植物很少真正扎伤你", "沾过你血的野草会短暂变红"] },
  { id: "sleeping-lotus", name: "眠心莲", category: "植物", description: "气息安静的莲花武魂，可能影响精神、睡眠与恢复。", rarity: 5, soulPowerRange: [4, 9], omens: ["哭闹的婴儿在你身边容易睡着", "你能清楚记住醒来前最后一个梦"] },
  { id: "bone-mark", name: "骨纹", category: "本体武魂", description: "浮现在骨骼上的纹路，强化方向取决于长期承受的训练。", rarity: 5, soulPowerRange: [3, 9], omens: ["重活之后你的骨头会微微发热", "旧伤处偶尔浮出浅色纹路"] },
  { id: "spirit-voice", name: "灵音", category: "本体武魂", description: "以声音和呼吸为核心的本体武魂，适合控制、辅助或精神震荡。", rarity: 6, soulPowerRange: [3, 8], omens: ["你很容易模仿只听过一次的声音", "压低嗓音时周围人会不自觉安静"] },
  { id: "seven-treasure-pagoda", name: "七宝琉璃塔", category: "器武魂", description: "七宝琉璃宗核心传承武魂，拥有极强的多方向增幅能力，也受七层限制。", rarity: 1, soulPowerRange: [6, 10], omens: ["彩色玻璃在你手中会折出比常人更多的光层", "你能同时记住几个人不同的呼吸节奏"] },
  { id: "blue-lightning-dragon", name: "蓝电霸王龙", category: "兽武魂", description: "顶级强攻系龙武魂，魂力提升后会逐步出现龙化特征。", rarity: 1, soulPowerRange: [7, 10], omens: ["雷雨天里你的右臂会微微发麻", "暴怒时瞳孔深处偶尔掠过蓝紫电光"] },
  { id: "clear-sky-hammer", name: "昊天锤", category: "器武魂", description: "昊天宗直系传承的顶级器武魂，以力量、爆发与锤法体系闻名。", rarity: 1, soulPowerRange: [6, 10], omens: ["你握住重物时掌心会出现黑色锤纹", "再沉的铁块到了你手里也比看上去轻"] },
  { id: "frost-halberd", name: "霜戈", category: "器武魂", description: "继承自封号长老一脉的长兵器武魂，寒气与破甲能力会随魂环成形。", rarity: 1, soulPowerRange: [7, 10], omens: ["你触碰金属后表面偶尔会凝出薄霜", "梦里总有长刃劈开风雪的声音"] },
  { id: "taixuan-sword-embryo", name: "太玄剑胎", category: "器武魂", description: "太玄剑宗数代未曾出现的传承武魂，初醒时只是一道无锋剑胚。", rarity: 1, soulPowerRange: [6, 10], omens: ["宗门剑碑在你靠近时会发出极轻的回声", "你握任何木条都会本能校正剑尖方向"] },
  { id: "royal-swan", name: "鎏金天鹅", category: "兽武魂", description: "天斗皇室天鹅武魂的良性变异，兼具飞行、光与统御型辅助潜力。", rarity: 2, soulPowerRange: [5, 10], omens: ["白色飞鸟很少躲开你的靠近", "阳光照在肩背时会留下短暂金纹"] },
  { id: "blood-shadow-vine", name: "噬影血藤", category: "植物", description: "禁术家族中偶尔出现的吞噬型植物武魂，成长很快，失控风险也高。", rarity: 1, soulPowerRange: [5, 10], omens: ["受伤时附近阴影里的藤草会朝你偏转", "你能闻到旁人魂力剧烈消耗后的气味"] },
  { id: "void-ledger", name: "无字命册", category: "器武魂", description: "能记录因果痕迹的空白册页，前期能力弱，成长方向取决于长期选择。", rarity: 2, soulPowerRange: [5, 10], omens: ["你写下的日期很少记错", "偶尔会梦见一页页没有文字的旧纸"] },
];

const seenSoulNames = new Set<string>();
const MARTIAL_SOULS: MartialSoulTemplate[] = [...BASE_MARTIAL_SOULS, ...ERA_MARTIAL_SOULS].map((soul) => {
  const name = normalizeMartialSoulName(soul.name);
  const sourceEra = soul.sourceEra ?? (/蓝银草|七宝琉璃塔|蓝电霸王龙|昊天锤/.test(name) ? 1 : "原创");
  return { ...soul, name, sourceEra, grade: soul.grade ?? martialSoulGrade(name, soul.metaRarity, soul.soulPowerRange[1]) };
}).filter((soul) => seenSoulNames.has(soul.name) ? false : (seenSoulNames.add(soul.name), true));

export const MARTIAL_SOUL_CATALOG_STATS = {
  total: MARTIAL_SOULS.length,
  bySource: Object.fromEntries([1, 2, 3, 4, "原创"].map((source) => [source, MARTIAL_SOULS.filter((soul) => soul.sourceEra === source).length])),
};

const TRAIT_LABELS: Record<string, [string, string]> = {
  courage: ["谨慎", "勇敢"],
  empathy: ["冷静自持", "富有同理心"],
  integrity: ["结果导向", "重视承诺"],
  independence: ["尊重秩序", "独立不驯"],
  patience: ["行动果断", "谋定后动"],
  ambition: ["安于稳健", "渴望力量"],
};

const ANSWER_SCORES: Record<string, Partial<Record<keyof typeof TRAIT_LABELS, number>>> = {
  rush: { courage: 2, empathy: 2, patience: -1 }, observe: { courage: 1, patience: 2 }, leave: { courage: -2, patience: 1 },
  keep: { integrity: 2 }, negotiate: { integrity: 1, patience: 2 }, opportunity: { ambition: 2, integrity: -1 },
  obey: { independence: -2 }, question: { independence: 1, patience: 1 }, resist: { independence: 2, courage: 1 },
  give: { empathy: 2, courage: 1 }, share: { empathy: 1, patience: 2 }, take: { empathy: -2, ambition: 1 },
  intervene: { courage: 2, empathy: 2 }, scheme: { empathy: 1, patience: 2 }, ignore: { empathy: -2 },
  reject: { ambition: -2, patience: 1 }, study: { patience: 2, ambition: 1 }, accept: { ambition: 2, courage: 1 },
  calm: { patience: 2 }, retort: { independence: 1 }, fight: { courage: 2, patience: -2 },
  prevent: { empathy: 2, courage: 2 }, investigate: { patience: 2, integrity: 1 }, protect_self: { courage: -1, patience: 1 },
  loyal: { integrity: 2, empathy: 1 }, bargain: { patience: 2, ambition: 1 }, betray: { integrity: -2, ambition: 2 },
  mercy: { empathy: 2 }, exploit: { empathy: -2, ambition: 2 }, eliminate: { empathy: -2, courage: 2, patience: -1 },
  reveal: { integrity: 2, courage: 1 }, hide: { patience: 2, independence: 1 }, deceive: { integrity: -2, patience: 1 },
  risk: { courage: 2, ambition: 2 }, wait: { patience: 2 }, withdraw: { courage: -2, patience: 1 },
  protect: { empathy: 2, integrity: 1 }, use_them: { ambition: 2, empathy: -1 }, abandon: { empathy: -2, independence: 1 },
};

function createEntry(kind: NarrativeEntry["kind"], text: string): NarrativeEntry {
  return { id: randomUUID(), kind, text, createdAt: new Date().toISOString() };
}

export function derivePersonality(setup: PersonalitySetup): PersonalityProfile {
  const scores: Record<string, number> = Object.fromEntries(
    Object.keys(TRAIT_LABELS).map((trait) => [trait, 0]),
  );

  for (const answer of Object.values(setup.answers)) {
    const changes = ANSWER_SCORES[answer] ?? {};
    for (const [trait, value] of Object.entries(changes)) {
      scores[trait] = (scores[trait] ?? 0) + (value ?? 0);
    }
  }

  const keywordText = setup.keywords.join("");
  const keywordRules: Array<[RegExp, string, number]> = [
    [/勇|果断|无畏/, "courage", 2], [/谨慎|胆小|稳重/, "courage", -2],
    [/善良|温柔|重情/, "empathy", 2], [/冷漠|自私|现实/, "empathy", -2],
    [/守信|正直|忠诚/, "integrity", 2], [/功利|不择手段/, "integrity", -2],
    [/自由|叛逆|独立/, "independence", 2], [/听话|守序/, "independence", -2],
    [/耐心|谋略|冷静/, "patience", 2], [/冲动|急躁/, "patience", -2],
    [/野心|好强|求道/, "ambition", 2], [/淡泊|知足/, "ambition", -2],
    [/好胜|自负|控制欲|表演意识|执着/, "ambition", 2],
    [/审慎|戒备|多疑|警觉|严谨|缜密|细心/, "patience", 2],
    [/大胆|果断|好战|凶狠/, "courage", 2],
    [/知恩|护短|仁心|责任感|共情|重情/, "empathy", 2],
    [/现实|精明|圆滑|权衡|手段意识/, "integrity", -1],
    [/守口|守秘|秘密主义|谨言/, "independence", 1],
  ];
  for (const [pattern, trait, value] of keywordRules) {
    if (pattern.test(keywordText)) scores[trait] += value;
  }

  const ranked = Object.entries(scores)
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .filter(([, score]) => score !== 0)
    .slice(0, 3)
    .map(([trait, score]) => (score >= 0 ? TRAIT_LABELS[trait][1] : TRAIT_LABELS[trait][0]));

  return { scores, summary: [...new Set([...setup.keywords.slice(0, 2), ...ranked])].slice(0, 4) };
}

type WeightPreferences = MetaProgressionView["weightPreferences"];

const ORIGIN_PREFERENCE_IDS: Record<string, string[]> = {
  平民: ["village-farmer", "smith-family", "herbalist", "hunter-family", "fisher-family", "stone-quarry"],
  魂师家庭: ["fallen-clan", "temple-clerk", "academy-servant", "minor-noble", "sect-village"],
  漂泊: ["merchant-caravan", "refugee-family", "travelling-healer", "border-guard", "tavern-family"],
  权贵: ["seven-treasure-core", "spirit-hall-elder-child", "blue-lightning-heir", "heaven-royal-ward", "star-luo-contender"],
  天骄: ["seven-treasure-core", "blue-lightning-heir", "hidden-sect-heir", "hidden-master-ward", "cultivator-reincarnation"],
  反派: ["spirit-hall-elder-child", "star-luo-contender", "underworld-heir", "evil-soul-remnant"],
  穿越: ["cultivator-reincarnation", "modern-transmigrator"],
  特殊: ["mystery-arrival", "fallen-clan", "sect-village", "hidden-sect-heir", "cultivator-reincarnation", "modern-transmigrator", "underworld-heir", "evil-soul-remnant"],
};

function originPool(preferences?: WeightPreferences, era: GameEra = 1): OriginTemplate[] {
  const preferredIds = ORIGIN_PREFERENCE_IDS[preferences?.origin ?? "均衡"] ?? [];
  const preference = preferences?.origin ?? "均衡";
  const matchesGeneratedPreference = (origin: OriginTemplate): boolean => {
    const text = `${origin.name} ${(origin.roleTags ?? []).join(" ")} ${origin.route ?? ""}`;
    if (preference === "平民") return /商会|自由户|属镇|附庸|工匠|医疗|后勤|药商|测绘/.test(text);
    if (preference === "魂师家庭") return /宗门|魂师|武魂殿|猎魂|训练/.test(text);
    if (preference === "漂泊") return /瀚海|情报|探索|商路|自由魂师|寻人/.test(text);
    if (preference === "权贵") return /皇室|七宝|蓝电|星罗|天斗/.test(text);
    if (preference === "天骄") return ["传奇", "神话"].includes(origin.tier ?? "平凡");
    if (preference === "反派") return /地下|暗街|禁物|毒|夺位|反派/.test(text);
    if (preference === "穿越") return /穿越|转生|修仙|异界/.test(text);
    if (preference === "特殊") return /异脉|禁物|旧案|血脉|遗迹|残魂|实验|诅咒/.test(text);
    return false;
  };
  const pool = era === 1 ? ORIGINS : LATER_ERA_ORIGINS[era];
  return pool.map((origin) => ({ ...origin, weight: origin.weight * (preferredIds.includes(origin.id) || matchesGeneratedPreference(origin) ? 2.4 : 1) }));
}

function resolvedOriginTier(origin: OriginTemplate): CandidateRarity {
  return origin.tier ?? (origin.id === "mystery-arrival" ? "稀有" : ["minor-noble", "fallen-clan", "sect-village"].includes(origin.id) ? "优秀" : "平凡");
}

function chooseSoul(random: () => number, origin: OriginTemplate, preferences?: WeightPreferences, excludedIds: string[] = [], era: GameEra = 1): MartialSoulTemplate {
  const preferredCategory = preferences?.martialSoul;
  const originSoulIds: Record<string, string[]> = {
    "seven-treasure-core": ["seven-treasure-pagoda", "clear-mirror", "star-book"],
    "spirit-hall-elder-child": ["frost-halberd", "spirit-eyes", "star-book", "iron-spear"],
    "hidden-sect-heir": ["taixuan-sword-embryo", "spirit-eyes", "clear-mirror"],
    "blue-lightning-heir": ["blue-lightning-dragon"],
    "clear-sky-sealed-branch": ["clear-sky-hammer", "forged-hammer", "iron-spear"],
    "heaven-royal-ward": ["royal-swan", "clear-mirror", "star-book"],
    "cultivator-reincarnation": ["taixuan-sword-embryo", "star-book", "medicine-cauldron", "spirit-eyes"],
    "modern-transmigrator": ["void-ledger", "spirit-eyes", "star-book", "clear-mirror"],
    "evil-soul-remnant": ["blood-shadow-vine", "bone-mark", "blood-thorn"],
  };
  const forced = originSoulIds[origin.id];
  const identityTier = resolvedOriginTier(origin);
  const identityIndex = MARTIAL_SOUL_GRADE_ORDER.indexOf(identityTier);
  const forcedSource = forced ? MARTIAL_SOULS.filter((soul) => forced.includes(soul.id) && !excludedIds.includes(soul.id)) : [];
  const eraCompatible = (soul: MartialSoulTemplate) => soul.sourceEra === undefined || soul.sourceEra === "原创" || soul.sourceEra === "局外" || (typeof soul.sourceEra === "number" && soul.sourceEra <= era);
  const baseSource = forcedSource.length ? forcedSource.filter(eraCompatible) : MARTIAL_SOULS.filter((soul) => !excludedIds.includes(soul.id) && eraCompatible(soul));
  const compatibleSource = baseSource.filter((soul) => MARTIAL_SOUL_GRADE_ORDER.indexOf(soul.grade ?? "平凡") >= identityIndex);
  const source = compatibleSource.length ? compatibleSource : baseSource;
  const identityText = `${origin.id} ${origin.name} ${origin.summary} ${origin.route ?? ""} ${(origin.roleTags ?? []).join(" ")} ${origin.locations.join(" ")}`;
  const choices = source.map((soul) => ({
    ...soul,
    weight: soul.rarity
      * (origin.preferredCategories.some((category) => soul.category.includes(category) || category.includes(soul.category)) ? 1.8 : 0.65)
      * (soul.grade === identityTier ? 2.4 : 1)
      * ((soul.affinityTags ?? []).some((tag) => identityText.includes(tag)) ? 5 : soul.lineageBound ? 0.04 : 1)
      * (preferredCategory && preferredCategory !== "均衡" && soul.category === preferredCategory ? 2.25 : 1),
  }));
  return weightedPick(random, choices);
}

export function martialSoulMultiplicity(roll: number, tier: CandidateRarity, specialLineage = false): 1 | 2 | 3 {
  const tripleChance = specialLineage ? 0.012 : tier === "神话" ? 0.0012 : tier === "传奇" ? 0.00035 : 0.00008;
  const twinChance = specialLineage ? 0.24 : tier === "神话" ? 0.032 : tier === "传奇" ? 0.014 : tier === "稀有" ? 0.006 : tier === "优秀" ? 0.0025 : 0.001;
  if (roll < tripleChance) return 3;
  if (roll < tripleChance + twinChance) return 2;
  return 1;
}

function martialSoulCount(random: () => number, origin: OriginTemplate): 1 | 2 | 3 {
  const tier = resolvedOriginTier(origin);
  const strongMultiLineage = origin.id === "twin-omen-family" || /双生武魂|多武魂/.test(`${origin.name} ${(origin.roleTags ?? []).join(" ")}`);
  const mutationHint = /异脉|实验|变异/.test(`${origin.name} ${(origin.roleTags ?? []).join(" ")}`);
  const roll = random();
  if (strongMultiLineage) return martialSoulMultiplicity(roll, tier, true);
  if (mutationHint) {
    if (roll < 0.002) return 3;
    if (roll < 0.052) return 2;
  }
  return martialSoulMultiplicity(roll, tier, false);
}

function chooseMartialSouls(random: () => number, origin: OriginTemplate, preferences?: WeightPreferences, era: GameEra = 1): MartialSoulTemplate[] {
  const count = martialSoulCount(random, origin);
  const selected: MartialSoulTemplate[] = [];
  for (let index = 0; index < count; index += 1) selected.push(chooseSoul(random, origin, preferences, selected.map((soul) => soul.id), era));
  return selected;
}

function eraRelation(year: number, era: GameEra): string {
  const offset = year - ERA_BASE_YEARS[era];
  const anchor = ERA_ANCHORS[era];
  if (offset === 0) return `在${anchor}的基准年参加武魂觉醒`;
  if (offset < 0) return `比${anchor}基准年早约 ${Math.abs(offset)} 年`;
  return `比${anchor}基准年晚约 ${offset} 年`;
}

function generateName(random: () => number): string {
  const doubleName = random() > 0.55;
  return `${pick(random, SURNAMES)}${pick(random, GIVEN_NAMES)}${doubleName ? pick(random, GIVEN_NAMES) : ""}`;
}

function thirdPersonClue(text: string, name: string, gender: "男" | "女"): string {
  const pronoun = gender === "女" ? "她" : "他";
  return text
    .replaceAll("你的", `${pronoun}的`)
    .replaceAll("你", pronoun)
    .replace(/(^|[，。；！？\s])他(?=[的从在会能已也不只要把记知清带五六三每手名自保来出生住])/g, `$1${pronoun}`)
    .replace(new RegExp(`^${pronoun}`), name);
}

function specificOrigin(
  random: () => number,
  origin: OriginTemplate,
  initialLocation: string,
  characterName: string,
): Pick<CandidatePublic, "originName" | "originSummary" | "originFacts" | "startingRelations" | "location" | "dwelling" | "birthProfileId" | "household" | "residence"> {
  const familySurname = characterName.slice(0, 1);
  const guardian = `${familySurname}${pick(random, FATHER_GIVEN_NAMES)}`;
  const secondGuardian = `${pick(random, SURNAMES)}${pick(random, MOTHER_GIVEN_NAMES)}`;
  const officer = pick(random, OFFICER_NAMES);
  const detail = pick(random, origin.details);
  let location = initialLocation;
  let originName = origin.name;
  let authority = `${location}里正 ${pick(random, SURNAMES)}伯安`;
  let livelihood = origin.summary;
  let obligation = detail;
  const familyClimateIndex = integer(random, 0, FAMILY_CLIMATES.length - 1);

  if (origin.id === "sect-village") {
    const variant = pick(random, [
      { name: "七宝琉璃宗青禾药庄佃户", location: "七宝琉璃宗东南青禾村", authority: "七宝琉璃宗外务堂青禾药庄", livelihood: "家里替七宝琉璃宗照料止血草和宁神花，每年按册交药。", obligation: "药庄管事下月会挑两名识字孩子进外院做杂役。" },
      { name: "蓝电霸王龙宗雷谷属村牧户", location: "蓝电霸王龙宗西麓雷谷村", authority: "蓝电霸王龙宗外事院雷谷执事", livelihood: "家里替宗门放养驮兽，也负责清理山门外的雷击木。", obligation: "外事院刚补发一份欠了半年的驮兽草料钱。" },
      { name: "七宝琉璃宗商道护庄村民", location: "天斗城西南七宝商道护庄", authority: "七宝琉璃宗商队护卫所", livelihood: "村里替七宝商队修车、喂马并轮值守夜，收成按户折成役期。", obligation: "最近一支商队误了归期，护卫所正在逐户问话。" },
    ]);
    ({ name: originName, location, authority, livelihood, obligation } = variant);
  } else {
    const authorityByOrigin: Record<string, string> = {
      "village-farmer": `${location}里正 ${pick(random, SURNAMES)}伯安`,
      "smith-family": `${location}百炼铁匠铺`,
      "border-guard": `${location}第三巡守队`,
      herbalist: `${location}采药行会`,
      "fallen-clan": `${familySurname}氏旧宅旁支族老会`,
      "temple-clerk": `${location}武魂分殿`,
      "merchant-caravan": "永顺商队",
      "mystery-arrival": `${location}收养家庭`,
      "hunter-family": `${location}猎户互助队`,
      "fisher-family": `${location}东平码头渔行`,
      "academy-servant": `${location}后勤处`,
      "minor-noble": `${familySurname}氏乡间庄园`,
      "refugee-family": `${location}新垦户名册`,
      "tavern-family": `${location}归雁酒馆`,
      "stone-quarry": `${location}青崖采石场`,
      "travelling-healer": `${guardian}的游方药箱`,
      "seven-treasure-core": "七宝琉璃宗内门议事堂",
      "spirit-hall-elder-child": "武魂殿长老殿",
      "hidden-sect-heir": "太玄剑宗宗主一脉",
      "blue-lightning-heir": "蓝电霸王龙宗嫡系族谱",
      "clear-sky-sealed-branch": "昊天宗封山支脉",
      "heaven-royal-ward": "天斗皇室宗正名册",
      "star-luo-contender": "星罗军功公爵府",
      "cultivator-reincarnation": `${location}收养家庭`,
      "modern-transmigrator": `${location}户籍`,
      "underworld-heir": "黑槐会总舵",
      "evil-soul-remnant": "被武魂殿通缉的旧姓家族",
      "hidden-master-ward": "隐居魂斗罗门下",
    };
    authority = origin.authority ?? authorityByOrigin[origin.id] ?? authority;
    const nameByOrigin: Record<string, string> = {
      "village-farmer": `${location}田户家庭`,
      "smith-family": `${location}百炼铁匠铺家庭`,
      "border-guard": `${location}第三巡守队军户`,
      herbalist: `${location}采药行会医家`,
      "fallen-clan": `${familySurname}氏旧宅魂师旁支`,
      "temple-clerk": `${location}武魂分殿杂役家庭`,
      "merchant-caravan": "永顺商队随行家庭",
      "mystery-arrival": `${location}无籍收养家庭`,
      "hunter-family": `${location}猎户互助队家庭`,
      "fisher-family": `${location}东平码头渔户`,
      "academy-servant": `${location}后勤雇工家庭`,
      "minor-noble": `${familySurname}氏乡间庄园旁支`,
      "refugee-family": `${location}新垦户家庭`,
      "tavern-family": `${location}归雁酒馆家庭`,
      "stone-quarry": `${location}青崖采石场石工家庭`,
      "travelling-healer": `${guardian}的游方医家`,
    };
    originName = nameByOrigin[origin.id] ?? origin.name;
  }

  const specialRelations: Record<string, CandidatePublic["startingRelations"]> = {
    "seven-treasure-core": [
      { name: "宁远山", relation: "内门监护人", impression: "既盼他成材，也会把失误如实写进宗门考册", faction: "七宝琉璃宗", strength: 68, category: "亲属" },
      { name: "宁风致", relation: "宗主与启蒙导师", impression: "愿意给机会，尚未决定投入多少资源", faction: "七宝琉璃宗", strength: 34, category: "师友" },
      { name: "尘心", relation: "候选授业者", impression: "只看剑心、天赋与临阵反应", faction: "七宝琉璃宗", strength: 18, category: "师友" },
    ],
    "spirit-hall-elder-child": [
      { name: "凌峥（霜戈斗罗）", relation: "父亲", impression: "要求很高，必要时也会动用长老资源护子", faction: "武魂殿", strength: 73, category: "亲属" },
      { name: "沈静娴", relation: "母亲", impression: "熟悉武魂城的规矩，比父亲更在意孩子能否活得长久", faction: "武魂殿", strength: 82, category: "亲属" },
      { name: "长老殿侍从长魏崇", relation: "家臣", impression: "忠于霜戈斗罗，对继承人仍在观察", faction: "武魂殿", strength: 41, category: "势力" },
    ],
    "hidden-sect-heir": [
      { name: "顾玄一", relation: "父亲与宗主", impression: "不会溺爱少宗主，更不许借长辈实力横行", faction: "太玄剑宗", strength: 76, category: "亲属" },
      { name: "商青蘅", relation: "母亲与药堂首座", impression: "已替他准备好失败后的退路", faction: "太玄剑宗", strength: 84, category: "亲属" },
      { name: "守碑长老闻九", relation: "启蒙老师", impression: "认为天赋不如心性可靠", faction: "太玄剑宗", strength: 56, category: "师友" },
    ],
    "blue-lightning-heir": [
      { name: "玉承雷", relation: "父亲", impression: "把孩子视作嫡系一脉翻身的希望", faction: "蓝电霸王龙宗", strength: 72, category: "亲属" },
      { name: "柳静娴", relation: "母亲", impression: "不愿孩子被族内竞争磨成只知胜负的人", faction: "蓝电霸王龙宗", strength: 79, category: "亲属" },
      { name: "雷池教习玉川", relation: "宗门教习", impression: "觉醒结果达到门槛才会真正收徒", faction: "蓝电霸王龙宗", strength: 24, category: "师友" },
    ],
    "clear-sky-sealed-branch": [
      { name: "唐守岳", relation: "养父", impression: "宁肯孩子平凡，也不愿旧事再次找上门", faction: "昊天宗", strength: 80, category: "亲属" },
      { name: "白兰芝", relation: "养母", impression: "知道更多真相，却答应过暂时不说", strength: 84, category: "亲属" },
      { name: "旧村守门人唐烈", relation: "支脉长辈", impression: "会在暗处判断他是否值得送回山门", faction: "昊天宗", strength: 35, category: "势力" },
    ],
    "heaven-royal-ward": [
      { name: "雪临川", relation: "父亲", impression: "爱孩子，也把孩子当作王府继续存在的筹码", faction: "天斗帝国", strength: 70, category: "亲属" },
      { name: "叶静娴", relation: "母亲", impression: "更担心宫廷站队，不愿他过早出风头", faction: "天斗帝国", strength: 80, category: "亲属" },
      { name: "王府教习韩策", relation: "启蒙教官", impression: "拿着雪星亲王的俸禄，也收太子府的礼", faction: "天斗帝国", strength: 29, category: "师友" },
    ],
    "star-luo-contender": [
      { name: "戴岳衡", relation: "父亲", impression: "只承认能从继承竞争中活下来的孩子", faction: "星罗帝国", strength: 55, category: "亲属" },
      { name: "朱静娴", relation: "母亲", impression: "替他争资源，也要求他学会对亲人留一手", faction: "星罗帝国", strength: 69, category: "亲属" },
      { name: "公爵府魂帝教官罗铮", relation: "教官", impression: "服从家主，不会因年幼而降低训练标准", faction: "星罗帝国", strength: 31, category: "师友" },
    ],
    "underworld-heir": [
      { name: "顾黑槐", relation: "父亲与会主", impression: "护短，却只会把能守住位置的人当继承人", faction: "黑槐会", strength: 74, category: "亲属" },
      { name: "程素琴", relation: "母亲与账房", impression: "希望孩子掌权，也暗中留着一条退路", faction: "黑槐会", strength: 78, category: "亲属" },
      { name: "刑堂主燕七", relation: "父亲旧部", impression: "表面恭敬，实际在等觉醒结果", faction: "黑槐会", strength: 26, category: "势力" },
    ],
    "hidden-master-ward": [
      { name: "岳山老人", relation: "养父与启蒙老师", impression: "愿意护他长大，不会替他赢下自己的战斗", strength: 82, category: "亲属" },
      { name: "林秋娘", relation: "山下药师", impression: "把他当亲外甥照看，也害怕老人过去的仇家", strength: 70, category: "亲属" },
      { name: officer, relation: "武魂殿巡查执事", impression: "觉得这户隐居人家的底细不太干净", faction: "武魂殿", strength: 9, category: "势力" },
    ],
  };
  const specialFamilies: Record<string, string> = {
    "seven-treasure-core": "内门监护人宁远山；宗主宁风致亲自过问课业",
    "spirit-hall-elder-child": "父亲凌峥是霜戈斗罗；母亲沈静娴",
    "hidden-sect-heir": "父亲顾玄一是宗主；母亲商青蘅执掌药堂",
    "blue-lightning-heir": "父亲玉承雷；母亲柳静娴",
    "clear-sky-sealed-branch": "养父唐守岳；养母白兰芝",
    "heaven-royal-ward": "父亲雪临川有旁系封爵；母亲叶静娴",
    "star-luo-contender": "父亲戴岳衡是军功公爵；母亲朱静娴",
    "underworld-heir": "父亲顾黑槐是会主；母亲程素琴掌管暗账",
    "hidden-master-ward": "养父岳山老人；山下药师林秋娘常来照看",
  };

  const dwellings = dwellingOptions(origin, location);
  const dwellingIndex = integer(random, 0, dwellings.length - 1);
  const dwelling = `${location} · ${authority}管辖区 · ${dwellings[dwellingIndex]}`;
  const specialStartingRelations = specialRelations[origin.id];
  const householdVariants = ["双亲家庭", "单亲父亲", "单亲母亲", "孤儿", "祖辈抚养", "收养家庭", "宗门共同抚养", "师徒监护", "商队集体抚养", "兄姐抚养", "寄居亲族", "家臣监护"] as const;
  let householdStructure: typeof householdVariants[number] = pick(random, householdVariants);
  if (/孤儿|遗孤|无籍/.test(`${origin.name}${origin.summary}`)) householdStructure = "孤儿";
  else if (/收养|养子|养女/.test(`${origin.name}${origin.summary}`)) householdStructure = "收养家庭";
  else if (/商队/.test(`${origin.name}${location}`)) householdStructure = "商队集体抚养";
  else if (/亲传|弟子/.test(origin.name)) householdStructure = "师徒监护";
  else if (/少宗主|核心|嫡系|皇室|公爵|长老|斗罗|继承/.test(origin.name)) householdStructure = random() < .72 ? "双亲家庭" : "家臣监护";
  const sibling = `${familySurname}${pick(random, GIVEN_NAMES)}${pick(random, GIVEN_NAMES)}`;
  const grandparent = `${familySurname}${pick(random, FATHER_GIVEN_NAMES)}`;
  const genericHouseholds: Record<typeof householdVariants[number], { summary: string; members: CandidatePublic["household"]["members"]; relations: CandidatePublic["startingRelations"] }> = {
    "双亲家庭": { summary: `${guardian}与${secondGuardian}共同抚养，家中决定通常要经过两人商量。`, members: [{ name: guardian, role: "父亲", note: "负责家庭主要生计" }, { name: secondGuardian, role: "母亲", note: "掌管日常开支与照料" }], relations: [{ name: guardian, relation: "父亲", impression: "盼着孩子觉醒，又怕结果招来麻烦", strength: 78, category: "亲属" }, { name: secondGuardian, relation: "母亲", impression: "提前收好了路上要用的干粮和旧衣", strength: 82, category: "亲属" }] },
    "单亲父亲": { summary: `${guardian}独自抚养孩子，另一位亲生家长的去向有明确记录或仍待调查。`, members: [{ name: guardian, role: "父亲", note: "一人承担生计与监护" }], relations: [{ name: guardian, relation: "父亲", impression: "不善表达，但把觉醒需要的费用提前留了出来", strength: 86, category: "亲属" }] },
    "单亲母亲": { summary: `${secondGuardian}独自抚养孩子，家中没有默认存在但从未出场的父亲。`, members: [{ name: secondGuardian, role: "母亲", note: "一人承担生计与监护" }], relations: [{ name: secondGuardian, relation: "母亲", impression: "对外很强硬，回家后才会谈担忧", strength: 87, category: "亲属" }] },
    "孤儿": { summary: `孩子没有可确认的在世父母，由${authority}登记并提供最低限度照看。`, members: [{ name: `${location}公养舍`, role: "集体监护", note: "负责食宿，不等同于亲属关系" }], relations: [{ name: `${location}公养舍管事`, relation: "监护人", impression: "按名册照看所有孩子，不会无条件偏爱任何一人", strength: 42, category: "其他" }] },
    "祖辈抚养": { summary: `${grandparent}负责抚养，父母可能亡故、失踪、服役或长期在外。`, members: [{ name: grandparent, role: "祖父或外祖父", note: "年纪已大，仍维持家庭" }], relations: [{ name: grandparent, relation: "祖辈监护人", impression: "把许多旧事压在心里，只希望孩子先平安长大", strength: 89, category: "亲属" }] },
    "收养家庭": { summary: `${guardian}在户籍或宗门名册上是养父，收养原因有记录，不强行补写亲生父母。`, members: [{ name: guardian, role: "养父", note: "拥有正式监护关系" }], relations: [{ name: guardian, relation: "养父", impression: "愿意保护孩子，也保留着关于来历的一部分秘密", strength: 84, category: "亲属" }] },
    "宗门共同抚养": { summary: `孩子由${authority}统一安排食宿、教习与轮值监护，亲缘不是主要纽带。`, members: [{ name: `${authority}教养院`, role: "宗门监护", note: "由数名教习轮值照看" }], relations: [{ name: `${authority}教养执事`, relation: "宗门监护人", impression: "会依据纪律、天赋和贡献调整资源", strength: 48, category: "势力" }] },
    "师徒监护": { summary: `${guardian}既是监护人也是启蒙老师，生活与修炼规矩无法完全分开。`, members: [{ name: guardian, role: "师父与监护人", note: "负责生活和启蒙训练" }], relations: [{ name: guardian, relation: "师父与监护人", impression: "护短但不纵容，最看重是否肯吃苦", strength: 76, category: "师友" }] },
    "商队集体抚养": { summary: `孩子随商队长大，由领队、账房和护卫轮流照看，没有固定不变的家庭日程。`, members: [{ name: "永顺商队", role: "集体监护", note: "多名成年人共同承担照看" }], relations: [{ name: "永顺商队老账房", relation: "长辈", impression: "会留饭，也会把弄坏的货物记到账上", strength: 66, category: "其他" }] },
    "兄姐抚养": { summary: `${sibling}是主要监护人，为维持生活已经提前承担成年人的工作。`, members: [{ name: sibling, role: "兄姐", note: "实际承担监护和生计" }], relations: [{ name: sibling, relation: "兄姐与监护人", impression: "嘴上嫌麻烦，遇事却总会先挡在前面", strength: 88, category: "亲属" }] },
    "寄居亲族": { summary: `孩子寄住在${guardian}一家，吃住有保障，但资源分配会先考虑亲生子女。`, members: [{ name: guardian, role: "叔伯或舅父", note: "提供住所并代行监护" }], relations: [{ name: guardian, relation: "寄居亲族", impression: "愿意尽责任，但会清楚计算家里的承受能力", strength: 58, category: "亲属" }] },
    "家臣监护": { summary: `父母或身份核心人物并不负责日常生活，由${guardian}这名家臣长期监护。`, members: [{ name: guardian, role: "家臣监护人", note: "忠诚首先指向家族或势力" }], relations: [{ name: guardian, relation: "家臣监护人", impression: "照顾细致，但遇到家族命令时会优先服从上级", strength: 62, category: "势力" }] },
  };
  const genericHousehold = genericHouseholds[householdStructure];
  const startingRelations = specialStartingRelations ?? [...genericHousehold.relations, { name: officer, relation: "武魂殿巡查执事", impression: "只按名册与觉醒结果办事", faction: "武魂殿", strength: 8, category: "势力" }];
  const householdMembers = specialStartingRelations
    ? specialStartingRelations.filter((item) => item.category === "亲属" || /监护|养父|养母|父亲|母亲/.test(item.relation)).map((item) => ({ name: item.name, role: item.relation, note: item.impression }))
    : genericHousehold.members;
  const district = /宗|殿|府|堡|山门|剑谷/.test(`${authority}${location}`) ? `${authority}核心或附属居住区` : `${location}户籍辖区`;
  const room = /独院|暖阁|静室|卧房/.test(dwellings[dwellingIndex]) ? dwellings[dwellingIndex] : `${dwellings[dwellingIndex]}内侧卧房`;
  return {
    location,
    dwelling,
    birthProfileId: `${origin.id}-${familyClimateIndex + 1}-${dwellingIndex + 1}`,
    originName,
    originSummary: `${livelihood}${obligation}`,
    originFacts: [
      { label: "家庭", value: `${specialFamilies[origin.id] ?? `${householdStructure}：${genericHousehold.summary}`}；${FAMILY_CLIMATES[familyClimateIndex]}` },
      { label: "归属", value: authority },
      { label: "生计", value: livelihood },
      { label: "眼前事", value: obligation },
      { label: "开局优势", value: origin.advantage ?? "身份没有额外保障，成长主要依靠自己的选择与积累。" },
      { label: "身份代价", value: origin.burden ?? "资源有限，但暂时也没有高层势力把他当作棋子。" },
    ],
    startingRelations,
    household: { structure: specialStartingRelations ? (/养父|养母/.test(specialStartingRelations.map((item) => item.relation).join("")) ? "收养家庭" : /监护/.test(specialStartingRelations.map((item) => item.relation).join("")) ? "家臣监护" : "身份专属家庭") : householdStructure, summary: specialFamilies[origin.id] ?? genericHousehold.summary, members: householdMembers },
    residence: {
      region: location,
      settlement: location,
      district,
      building: dwellings[dwellingIndex],
      room,
      security: /长老|斗罗|宗主|核心|嫡系|皇室|公爵/.test(origin.name) ? "有固定守卫、身份核验与势力内部巡查" : /宗|殿|府|堡/.test(authority) ? "受所属势力外围巡查保护" : "依靠门闩、邻里与当地治安",
      nearby: [authority, `${location}觉醒点`, /城|宗|殿|府/.test(location) ? `${location}集市` : `${location}水井或公共空地`],
    },
  };
}

export function generateCandidates(
  seed: string,
  rerollIndex: number,
  gender: "男" | "女",
  preferences?: WeightPreferences,
  giftBonus = 0,
  era: GameEra = 1,
): HiddenCandidate[] {
  const random = createRandom(`${seed}:candidates:${rerollIndex}`);
  const usedOrigins = new Set<string>();
  const origins = originPool(preferences, era);

  return Array.from({ length: 3 }, (_, index) => {
    const slotOrigins = index === 1
      ? origins.filter((item) => (item.tier ?? (["minor-noble", "fallen-clan", "sect-village"].includes(item.id) ? "优秀" : "平凡")) !== "平凡")
      : index === 2
        ? origins.filter((item) => ["稀有", "传奇", "神话"].includes(item.tier ?? "平凡"))
        : origins;
    let origin = weightedPick(random, slotOrigins);
    for (let attempt = 0; usedOrigins.has(origin.id) && attempt < 8; attempt += 1) {
      origin = weightedPick(random, slotOrigins);
    }
    usedOrigins.add(origin.id);

    const martialSouls = chooseMartialSouls(random, origin, preferences, era);
    const soul = martialSouls[0];
    const offset = ERA_BASE_YEARS[era] + integer(random, -5, 5);
    const talentFloor = origin.tier === "神话" ? 8 : origin.tier === "传奇" ? 7 : origin.tier === "稀有" ? 5 : 0;
    const innateSoulPower = Math.min(10, Math.max(talentFloor, integer(random, soul.soulPowerRange[0], soul.soulPowerRange[1]) + (origin.innateBonus ?? 0)));
    let name = generateName(random);
    const lineageSurnames: Record<string, string[]> = {
      "seven-treasure-core": ["宁"],
      "spirit-hall-elder-child": ["凌"],
      "hidden-sect-heir": ["顾"],
      "blue-lightning-heir": ["玉"],
      "clear-sky-sealed-branch": ["唐"],
      "heaven-royal-ward": ["雪"],
      "star-luo-contender": ["戴", "朱"],
      "underworld-heir": ["顾"],
    };
    const lineage = lineageSurnames[origin.id];
    if (lineage) name = `${pick(random, lineage)}${name.slice(1)}`;
    const concreteOrigin = specificOrigin(random, origin, pick(random, origin.locations), name);
    const locationId = inferLocationId(concreteOrigin.location);
    const mapPoint = worldMapPoint(locationId);
    const houseAngle = random() * Math.PI * 2;
    const houseRadius = 1.2 + random() * 1.6;
    const candidate: CandidatePublic = {
      id: `${rerollIndex}-${index}-${Math.floor(random() * 1_000_000).toString(36)}`,
      name,
      gender,
      eraRelation: eraRelation(offset, era),
      birthYearOffset: offset,
      location: concreteOrigin.location,
      locationId,
      dwelling: concreteOrigin.dwelling,
      mapX: Math.max(3, Math.min(97, mapPoint.x + Math.cos(houseAngle) * houseRadius)),
      mapY: Math.max(4, Math.min(94, mapPoint.y + Math.sin(houseAngle) * houseRadius)),
      birthProfileId: concreteOrigin.birthProfileId,
      originName: concreteOrigin.originName,
      originSummary: concreteOrigin.originSummary,
      originFacts: concreteOrigin.originFacts,
      startingRelations: concreteOrigin.startingRelations,
      household: concreteOrigin.household,
      residence: concreteOrigin.residence,
      route: origin.route ?? (origin.id === "mystery-arrival" ? "身世谜团" : "本地成长"),
      rarity: resolvedOriginTier(origin),
      selfKnowledge: origin.selfKnowledge ?? (origin.id === "mystery-arrival" ? "本地人 · 身世未知" : "本地人 · 身世明确"),
      knownBackground: thirdPersonClue(pick(random, origin.knownBackgrounds ?? [origin.id === "mystery-arrival" ? "你知道自己是被收养的，亲生父母和那块碎玉的来历都没人肯说。" : "你知道家里靠什么生活，也认得每天会见到的人。更深的秘密是否存在，还要靠经历确认。"]), name, gender),
      fixedTraits: origin.fixedTraits ?? [],
      originAdvantage: origin.advantage ?? "没有身份红利，行动自由度较高。",
      originBurden: origin.burden ?? "资源普通，关键机会需要亲自争取。",
      omens: [thirdPersonClue(pick(random, soul.omens), name, gender), thirdPersonClue(martialSouls.length > 1 ? (martialSouls.length === 2 ? "觉醒前的梦里曾先后出现两种互不相同的轮廓" : "觉醒阵附近的黑石曾连续三次产生不同方向的微光") : pick(random, [
        "觉醒日前一夜，你做了一个醒来后便模糊的梦",
        "家中长辈对你的身世似乎隐瞒了一小部分",
        "附近魂师曾评价你的气息比同龄人更稳定",
        "你没有显眼异象，平凡得近乎让人安心",
      ]), name, gender)],
    };
    candidate.originSummary = thirdPersonClue(candidate.originSummary, name, gender);
    candidate.originFacts = candidate.originFacts.map((fact) => ({ ...fact, value: thirdPersonClue(fact.value, name, gender) }));

    const giftRoll = random();
    const giftPreference = preferences?.gift ?? "均衡";
    const giftChance = (giftPreference === "朴素" ? 0.008 : giftPreference === "奇遇" ? 0.055 : giftPreference === "异界体系" ? 0.04 : 0.025) + giftBonus;
    const giftPool = giftPreference === "异界体系"
      ? ["残缺丹道传承", "无名剑典残页", "未激活的因果印记", "受压制的修行法门", "炼器宗残卷", "残缺阵道传承", "沉睡的山海血脉", "一缕受损剑魂"]
      : ["残缺丹道传承", "至尊骨雏形", "无名剑典残页", "未激活的因果印记", "武魂二次觉醒线索", "先祖残魂的记忆", "异常魂力回路", "可成长的精神空间"];
    const disclosedOriginGifts: Record<string, string> = {
      "cultivator-reincarnation": "受压制的前世修行法门",
      "modern-transmigrator": "原作剧情时间线记忆",
      "evil-soul-remnant": "家族吞噬禁术",
    };
    const hiddenGift = disclosedOriginGifts[origin.id] ?? (origin.id === "mystery-arrival" || giftRoll < giftChance
      ? pick(random, giftPool)
      : undefined);

    return {
      public: candidate,
      originId: origin.id,
      roleTags: origin.roleTags ?? [origin.id === "mystery-arrival" ? "身世谜团" : "本地人"],
      martialSoul: soul,
      martialSouls,
      innateSoulPower,
      hiddenGift,
      physique: pick(random, ["普通", "优秀", "优秀", "顶尖"]),
      spirit: pick(random, ["普通", "优秀", "优秀", "顶尖"]),
      perception: pick(random, ["普通", "优秀", "优秀", "顶尖"]),
      originStart: {
        coins: origin.startingCoins ?? (origin.tier === "神话" ? 90 : origin.tier === "传奇" ? 60 : origin.tier === "稀有" ? 36 : origin.tier === "优秀" ? 22 : 12),
        items: origin.startingItems ?? [],
        reputation: origin.startingReputation ?? (origin.tier === "神话" ? "受多方关注" : origin.tier === "传奇" ? "小有名声" : "默默无闻"),
        advantage: origin.advantage ?? "行动自由度较高",
        burden: origin.burden ?? "资源需要自行积累",
        pressure: origin.pressure ?? (origin.tier === "神话" ? 5 : origin.tier === "传奇" ? 4 : origin.tier === "稀有" ? 3 : origin.tier === "优秀" ? 2 : 1),
      },
    };
  });
}

const GENERAL_LIFE_GOALS = [
  "在十八岁前成为魂王，并拥有一套经得起实战的自创魂技体系",
  "带领自己的队伍闯进全大陆高级魂师学院精英大赛前三名",
  "建立一个至少拥有三名魂圣坐镇、能保护一座城市的宗门",
  "在二十五岁前获得封号，并让封号传遍两大帝国",
  "整理出一套普通平民也能学习的魂师启蒙方法，并在十座村镇试行",
  "亲自记录一百种魂兽的习性、弱点与适配武魂，编成可用的猎魂图鉴",
  "找到一块十万年魂骨的可靠线索，并决定夺取、交易还是放弃",
  "让家人脱离现在的债务、追捕或依附关系，拥有一处不会被随意夺走的家",
  "培养三名出身普通的弟子，让其中至少一人成为魂帝",
  "查清自己的血脉、收养或前世之谜，并让所有参与隐瞒的人付出对应代价",
  "掌控一座主城的地下情报与交易网络，不再受任何单一势力摆布",
  "成为大陆最难被收买的自由魂师，让三大势力都必须平等谈条件",
  "推动武魂殿统一魂师秩序，并在新秩序里取得独立席位",
  "拆散武魂殿在地方的控制网络，保住至少三个拒绝归附的魂师势力",
  "夺走一位原作天才最关键的机缘，承受由此产生的追杀与历史偏差",
  "救下一位原本会死去的重要人物，并保证改变不是靠无代价奇迹",
  "成为大陆公认的第一辅助魂师，让强攻系封号斗罗主动请求合作",
  "走出一条不依赖传统猎杀的成长路线，并完成至少三个可重复验证的阶段",
  "进入杀戮之都并活着取得杀神领域，同时守住自己预先定下的底线",
  "登上海神岛完成至少黑级考核，再决定是否继续追逐神位",
  "收服或吞并三个敌对家族，把它们真正变成自己的资源和责任",
  "建立一支只听从自己命令的精锐魂师队，左右一次帝国级战争的胜负",
  "让曾经轻视自己的人公开承认判断错误，但不依靠长辈替自己出手",
  "找到能够延长亲人寿命或修复武魂缺陷的方法，并完成一次真实验证",
];

const ERA_LIFE_GOALS: Record<GameEra, string[]> = {
  1: GENERAL_LIFE_GOALS,
  2: ["进入史莱克学院并成为能够独立执行监察任务的内院学员", "掌握一套可复现的魂导器制作路线并完成五级魂导师认证", "帮助衰落的唐门建立稳定的暗器与魂导器收入", "提出一种不依赖猎杀的魂兽力量承载实验并完成三次验证", "带领队伍进入全大陆高级魂师学院斗魂大赛前四名", "在日月帝国与原属斗罗大陆势力之间建立一条可靠情报线"],
  3: ["进入史莱克学院并完成一字斗铠的独立设计与制造", "成为传灵师并揭开一次非法魂灵交易链", "带领固定团队通过史莱克内院考核", "加入血神军团并在深渊防线获得正式功勋", "建立一支能够同时运用武魂、魂灵、机甲与斗铠的战斗小队", "在联邦与海外星罗交流中完成一次不依赖武力的重大任务"],
  4: ["考入史莱克学院星际实验班并成为可靠的战舰指挥者", "带领团队取得一艘合法执行探索任务的小型战舰", "完成森罗星与精灵星的两次跨星球生态调查", "建立一套武魂、魂灵、机甲与星战指挥协同训练法", "进入联邦舰队并完成一次无人员损失的高风险救援", "调查自身血脉异常，同时阻止研究数据被任何势力独占"],
};

const ORIGIN_GOALS: Record<string, string[]> = {
  "seven-treasure-core": [
    "在宁荣荣离宗前进入七宝琉璃宗继承序列前三，并让剑、骨两位斗罗都认可他的道路",
    "找到七宝琉璃塔突破七层限制的可验证方法，决定公开给宗门还是据为己有",
    "在武魂殿袭击发生前改造宗门防线，让七宝城堡少死一半的人",
  ],
  "spirit-hall-elder-child": [
    "在二十岁前进入武魂殿长老殿，并建立一支不依附教皇派或供奉派的班底",
    "帮助父亲晋升九十五级，随后亲手决定长老一脉在大陆战争中的立场",
    "取代黄金一代中的一人，代表武魂殿赢下魂师大赛冠军",
  ],
  "hidden-sect-heir": [
    "破解太玄剑宗封山旧誓，让宗门能在不依赖护山阵势的情况下立足大陆",
    "在十五岁前走完祖师剑碑九层，并用斗罗世界的魂环重建旧剑道",
    "带领太玄剑宗公开入世，迫使上三宗承认它的席位",
  ],
  "blue-lightning-heir": [
    "在十二岁前取得雷池第一席，压过同辈嫡系并获得宗门核心传承",
    "改变蓝电霸王龙宗覆灭的结局，至少提前找出一个潜伏的内应",
    "让自己的武魂完成一次龙血进化，同时避免沦为只靠血脉的宗门工具",
  ],
  "clear-sky-sealed-branch": [
    "查清父母与昊天宗封山的关系，在十八岁前带着证据走上山门",
    "让昊天宗提前结束封山，并承担宗门重新入世后招来的武魂殿压力",
    "找到一条不依靠昊天锤血脉也能获得宗门承认的道路",
  ],
  "heaven-royal-ward": [
    "在雪夜大帝病重前查明太子府的异常，并决定揭发、合作还是借机夺权",
    "保住旁系王府的封爵和领地，再让五名有实权的贵族公开效忠",
    "进入天斗帝国继承棋局，成为摄政者、皇帝或真正操盘的人",
  ],
  "star-luo-contender": [
    "在十八岁前赢下公爵府继承竞争，同时决定败者是死、流放还是成为盟友",
    "建立一支能与星罗皇室幽冥白虎抗衡的战队，改写家族的依附关系",
    "逃离星罗继承制度后带着足够实力归来，亲手废掉那套规则",
  ],
  "cultivator-reincarnation": [
    "把一部前世剑诀改造成能与魂环共存的九层功法，并亲自修到第五层",
    "在斗罗大陆重建丹道，炼出三种能被魂师重复使用且副作用可控的丹药",
    "找回识海中的残损剑魂，并让它在斗罗世界规则下成为真正可成长的力量",
  ],
  "modern-transmigrator": [
    "利用剧情记忆救下一名原本会死的重要人物，并接受时间线偏移后的未知后果",
    "在不直接依附唐三的情况下进入大陆核心舞台，证明自己不是原作的旁观者",
    "核实记忆中的十个关键节点，建立一份会随蝴蝶效应修订的秘密时间线",
  ],
  "underworld-heir": [
    "在十二岁前找出黑槐会内鬼，决定公开审判、秘密处置还是反过来利用",
    "吞并索托城三处分裂的地下势力，让黑槐会从替人办脏事变成真正的规则制定者",
    "洗掉黑槐会最危险的生意，同时保住情报网、财富和忠于自己的旧部",
  ],
  "evil-soul-remnant": [
    "在不吞噬无辜者的前提下改良家族禁术，修到魂圣并摆脱武魂殿追捕",
    "接受禁术的掠夺道路，在二十岁前成为令两大帝国通缉的邪魂师首领",
    "找出家谱中被刮掉的名字，判断家族戒律究竟是救命规则还是失败者的谎言",
  ],
};

interface PersonalityArchetype {
  title: string;
  keywords: string[];
  description: string;
  tone: "正" | "中" | "暗";
}

const PERSONALITY_ARCHETYPES: PersonalityArchetype[] = [
  { title: "冷面野心家", keywords: ["野心勃勃", "克制", "记仇"], description: "愿意等，也愿意下狠手，只是不喜欢把底牌摆出来。", tone: "暗" },
  { title: "笑面谋士", keywords: ["圆滑", "多疑", "善于伪装"], description: "习惯先听完每个人的话，再决定谁可以利用。", tone: "暗" },
  { title: "骄横天才", keywords: ["狂傲", "好战", "护短"], description: "吃软不吃硬，对自己人很好，对敌人没多少耐心。", tone: "中" },
  { title: "利己生存者", keywords: ["现实", "利己", "能屈能伸"], description: "先确保自己活下来，感情和道义都要排在承受得起之后。", tone: "暗" },
  { title: "偏执求道者", keywords: ["求道", "专注", "淡漠"], description: "对力量本身比名声更感兴趣，也可能忽略身边的人。", tone: "中" },
  { title: "守序继承人", keywords: ["守诺", "审慎", "责任感"], description: "愿意接住身份带来的责任，但不会盲从每一条旧规矩。", tone: "正" },
  { title: "锋利理想家", keywords: ["正直", "勇敢", "不妥协"], description: "看不惯的事会管，代价真落到头上时也得自己扛。", tone: "正" },
  { title: "温和实干派", keywords: ["重情", "耐心", "务实"], description: "不爱喊口号，答应的事会一点点做完。", tone: "正" },
  { title: "自由冒险者", keywords: ["好奇", "大胆", "厌恶束缚"], description: "对未知有兴趣，很容易因为一条新线索改掉原计划。", tone: "中" },
  { title: "懒散聪明人", keywords: ["懒散", "聪明", "享乐"], description: "能省力就不硬撑，真正被逼到角落时反而很清醒。", tone: "中" },
  { title: "沉默复仇者", keywords: ["隐忍", "记仇", "执行力强"], description: "不会轻易原谅，也不急着让仇人知道自己在等。", tone: "暗" },
  { title: "危险的保护者", keywords: ["护短", "果断", "手段激烈"], description: "愿意为少数在意的人伤害更多陌生人。", tone: "暗" },
  { title: "清醒的善人", keywords: ["善良", "有边界", "谨慎"], description: "肯帮人，但会先看清自己能不能承担后果。", tone: "正" },
  { title: "天生领袖", keywords: ["自信", "善于用人", "控制欲"], description: "习惯站在队伍中央，也很难容忍命令被忽视。", tone: "中" },
  { title: "孤狼", keywords: ["独立", "戒备", "不欠人情"], description: "不轻易信人，接受帮助后反而会记得很久。", tone: "中" },
  { title: "投机赌徒", keywords: ["冒险", "敏锐", "贪心"], description: "看得见机会，也常常低估失败以后要还的债。", tone: "暗" },
];

function dynamicQuestions(candidate: HiddenCandidate, traits: string[], random: () => number) {
  const traitText = traits.join("、");
  const identityPrompt = candidate.roleTags.includes("武魂殿")
    ? "父亲让你把一名无辜执事推出去顶罪，这能保住长老一脉的秘密。你会？"
    : candidate.roleTags.includes("七宝琉璃宗")
      ? "宗门发现一名平民天才，但培养他会分走原本属于你的资源。你会？"
      : candidate.roleTags.includes("穿越者")
        ? "你记得一场悲剧会在几年后发生，提前说出真相也可能让所有人怀疑你的来历。你会？"
        : candidate.roleTags.includes("反派")
          ? "手下抓到一个知道组织秘密的孩子，留着可能有用，也可能招来追查。你会？"
          : `身为${candidate.public.originName}，长辈要求你替家里隐瞒一件会伤害外人的事。你会？`;
  const questions = [
    { id: "identity", prompt: identityPrompt, options: [{ id: "protect", label: "先护住自己人" }, { id: "bargain", label: "找一个双方都付代价的办法" }, { id: "reveal", label: "拒绝隐瞒并说出真相" }] },
    { id: "rival", prompt: /记仇|冷酷|利己|野心/.test(traitText) ? "一个曾羞辱你的同龄天才如今重伤，只有你知道。你会？" : "一直与你竞争的同龄人重伤求助，救他会失去眼前机缘。你会？", options: [{ id: "mercy", label: "先救人，胜负以后再算" }, { id: "bargain", label: "救他，但要他欠下明确代价" }, { id: "exploit", label: "拿走机缘，让他自己承担" }] },
    { id: "secret", prompt: candidate.roleTags.includes("穿越者") || candidate.roleTags.includes("异界体系") ? "最信任的人已经察觉你的知识来源异常，继续撒谎可能伤害关系。你会？" : "你发现家中长辈隐瞒的秘密会改变自己的继承位置。你会？", options: [{ id: "reveal", label: "坦白自己知道的部分" }, { id: "hide", label: "继续观察，不急着摊牌" }, { id: "deceive", label: "制造假线索试探所有人" }] },
    { id: "power", prompt: /求道|野心|贪心|好战/.test(traitText) ? "一门禁术能让修炼速度暴涨，第一次代价只会落在陌生人身上。你会？" : "一门危险秘法能解决眼前危机，但后果暂时算不清。你会？", options: [{ id: "reject", label: "不用无法控制的力量" }, { id: "study", label: "先拆解原理和代价" }, { id: "accept", label: "先拿到力量再处理后果" }] },
    { id: "followers", prompt: /控制欲|领袖|护短/.test(traitText) ? "忠于你的下属违抗命令救了许多人，却让计划彻底失败。你会？" : "同伴违背约定，却确实救下了更多人。你会？", options: [{ id: "mercy", label: "认可结果，再重定规矩" }, { id: "bargain", label: "功过分开，各自结算" }, { id: "eliminate", label: "不能控制的人不能留在核心" }] },
    { id: "defeat", prompt: "一次公开失败让家族、宗门或同伴蒙羞，翻盘需要押上你尚未掌握的力量。你会？", options: [{ id: "risk", label: "当场押上所有筹码" }, { id: "wait", label: "认下失败，准备下一次" }, { id: "withdraw", label: "退出争夺，先保住剩余资源" }] },
    { id: "loyalty", prompt: "最亲近的人与你的人生目标发生冲突，而且双方都没有退让余地。你会？", options: [{ id: "loyal", label: "暂时放下目标，保住这段关系" }, { id: "bargain", label: "把条件和底线都谈清楚" }, { id: "betray", label: "目标优先，必要时先下手" }] },
    { id: "weak", prompt: "一个没有背景的弱者掌握了你需要的线索，他不愿交易。你会？", options: [{ id: "mercy", label: "继续说服，接受他拒绝" }, { id: "bargain", label: "找到他真正需要的筹码" }, { id: "exploit", label: "逼他交出线索" }] },
  ];
  const extras = questions.slice(1).sort(() => random() - 0.5).slice(0, 5);
  return [questions[0], ...extras];
}

export function lifeGoalDifficulty(goal: string): LifeGoalDifficulty {
  if (/成神|神位|百级|大陆公认的第一|封号传遍|统一魂师|帝国级战争|杀神领域|海神岛|十万年魂骨|改写|改变.*覆灭|左右.*战争|取代黄金一代|公开入世.*上三宗/.test(goal)) return "极难";
  if (/魂王|魂帝|魂圣|魂斗罗|封号|大赛前三|建立.*宗门|三名|十座|一百种|掌控一座|吞并|继承序列|核心传承|重建|第五层|救下一名|进入大陆核心/.test(goal)) return "困难";
  return "普通";
}

function martialSoulGoalPotential(candidate: HiddenCandidate): number {
  const colorBonus: Record<string, number> = { 白色: 0, 蓝色: 1, 紫色: 2, 金色: 3, 红色: 5, 七彩: 6 };
  const souls = candidate.martialSouls?.length ? candidate.martialSouls : [candidate.martialSoul];
  const strongest = Math.max(...souls.map((soul) => soul.soulPowerRange[1] + (colorBonus[soul.metaRarity ?? ""] ?? 0)));
  return Math.min(12, strongest + Math.floor(candidate.innateSoulPower / 5) + Math.max(0, souls.length - 1));
}

function goalWeight(candidate: HiddenCandidate, goal: string, tailored: Set<string>): number {
  const potential = martialSoulGoalPotential(candidate);
  const difficulty = lifeGoalDifficulty(goal);
  const base = potential >= 11
    ? ({ 普通: 1, 困难: 4, 极难: 8 } as const)[difficulty]
    : potential >= 8
      ? ({ 普通: 2, 困难: 5, 极难: 3 } as const)[difficulty]
      : ({ 普通: 6, 困难: 2.5, 极难: 0.7 } as const)[difficulty];
  return base * (tailored.has(goal) ? 2.4 : 1);
}

function lifeGoalOptions(candidate: HiddenCandidate, seed: string, rerollIndex: number): string[] {
  const random = createRandom(`${seed}:goals:${candidate.public.id}:${rerollIndex}`);
  const tailored = new Set(ORIGIN_GOALS[candidate.originId] ?? []);
  const year = candidate.public.birthYearOffset ?? 0;
  const era: GameEra = year >= 25000 ? 4 : year >= 15000 ? 3 : year >= 5000 ? 2 : 1;
  const remaining = [...new Set([...tailored, ...ERA_LIFE_GOALS[era]])];
  const selected: string[] = [];
  while (selected.length < 3 && remaining.length) {
    const choice = weightedPick(random, remaining.map((goal) => ({ goal, weight: goalWeight(candidate, goal, tailored) })));
    selected.push(choice.goal);
    remaining.splice(remaining.indexOf(choice.goal), 1);
  }
  return selected;
}

function personalityOptions(candidate: HiddenCandidate, seed: string, rerollIndex: number): CharacterShapingView["personalityOptions"] {
  const random = createRandom(`${seed}:personalities:${candidate.public.id}:${rerollIndex}`);
  const used = new Set<string>();
  const pools = [PERSONALITY_ARCHETYPES, PERSONALITY_ARCHETYPES.filter((item) => item.tone === "正"), PERSONALITY_ARCHETYPES.filter((item) => item.tone === "暗"), PERSONALITY_ARCHETYPES];
  return pools.map((pool, index) => {
    let archetype = pick(random, pool);
    for (let attempt = 0; used.has(archetype.title) && attempt < 12; attempt += 1) archetype = pick(random, pool);
    used.add(archetype.title);
    const keywords = [...new Set([...candidate.public.fixedTraits, ...archetype.keywords])];
    return {
      id: `${rerollIndex}-${index}-${archetype.title}`,
      title: archetype.title,
      keywords,
      description: archetype.description,
      questions: dynamicQuestions(candidate, keywords, random),
    };
  });
}

function buildShaping(game: StoredGame, goalRerollIndex = 0, personalityRerollIndex = 0, goalLocks: boolean[] = [false, false, false], previousGoals?: string[], includeGoals = true): CharacterShapingView {
  const candidate = game.hiddenCandidates.find((item) => item.public.id === game.view.selectedCandidateId);
  if (!candidate) throw new Error("请先选择角色");
  const freshGoals = includeGoals ? lifeGoalOptions(candidate, game.view.seed, goalRerollIndex) : [];
  const goals = freshGoals.map((goal, index) => goalLocks[index] && previousGoals?.[index] ? previousGoals[index] : goal);
  return {
    goalRerollIndex,
    personalityRerollIndex,
    goalRerollsUsed: goalRerollIndex,
    goalLocks,
    lifeGoalOptions: goals,
    lifeGoalDifficulties: goals.map(lifeGoalDifficulty),
    personalityOptions: personalityOptions(candidate, game.view.seed, personalityRerollIndex),
    fixedTraits: candidate.public.fixedTraits,
    fixedTraitEffects: candidate.public.fixedTraits.map((trait) => ({ trait, effect: fixedTraitEffect(trait) })),
  };
}

export function rerollCharacterShaping(game: StoredGame, part: "goals" | "personality", lockedSlots: number[] = []): void {
  const current = game.view.shaping ?? buildShaping(game);
  if (part === "goals" && current.goalRerollsUsed >= 3) throw new Error("人生目标的三次免费刷新已经用完");
  const locks = part === "goals" ? [0, 1, 2].map((index) => lockedSlots.includes(index)) : current.goalLocks;
  game.view.shaping = buildShaping(
    game,
    part === "goals" ? current.goalRerollIndex + 1 : current.goalRerollIndex,
    part === "personality" ? current.personalityRerollIndex + 1 : current.personalityRerollIndex,
    locks,
    current.lifeGoalOptions,
    part === "goals",
  );
  game.view.updatedAt = new Date().toISOString();
}

export function finalizeCharacterShaping(game: StoredGame, input: { personalityId?: string; keywords: string[]; answers: Record<string, string> }): void {
  if (game.view.status !== "character_shaping") throw new Error("当前不处于角色塑造阶段");
  const candidate = game.hiddenCandidates.find((item) => item.public.id === game.view.selectedCandidateId);
  if (!candidate) throw new Error("请先选择角色");
  if (input.personalityId) {
    const selected = game.view.shaping?.personalityOptions.find((option) => option.id === input.personalityId);
    if (!selected) throw new Error("性格方案已经失效，请重新选择");
    const expectedQuestionIds = new Set(selected.questions.map((question) => question.id));
    if (Object.keys(input.answers).some((id) => !expectedQuestionIds.has(id))) throw new Error("答案包含不属于当前性格方案的题目");
    for (const question of selected.questions) {
      if (!question.options.some((option) => option.id === input.answers[question.id])) throw new Error("请完成当前性格方案的全部情境题");
    }
  }
  const keywords = [...new Set([...candidate.public.fixedTraits, ...input.keywords.map((item) => item.trim()).filter(Boolean)])].slice(0, 8);
  if (keywords.length < 3) throw new Error("至少需要三个性格关键词");
  const setup: PersonalitySetup = { keywords, answers: input.answers };
  const profile = derivePersonality(setup);
  game.personalityProfile = profile;
  game.view.personality = setup;
  game.view.personalitySummary = profile.summary;
  game.view.status = "awakening";
  game.view.narrative = [createEntry("narration", buildAwakeningPrelude(candidate, profile))];
  const scores = profile.scores;
  game.view.suggestions = [
    scores.patience >= 2 ? "留意觉醒魂师检查阵法的顺序" : scores.courage >= 2 ? "走近阵法观察六块黑石" : "站在家人身边等候点名",
    scores.empathy >= 2 ? "安慰前一个觉醒失败的孩子" : scores.ambition >= 2 ? "打听今天有没有先天高魂力的孩子" : "听一听门外家长的议论",
    scores.independence >= 2 ? "直接询问觉醒时该注意什么" : "把家人临行前的话再想一遍",
  ];
  game.view.updatedAt = new Date().toISOString();
}

export function selectLifeGoal(game: StoredGame, lifeGoal: string): void {
  if (game.view.status !== "life_goal_selection" || !game.view.character) throw new Error("当前不处于人生目标选择阶段");
  const goal = lifeGoal.trim();
  if (goal.length < 6) throw new Error("人生目标需要写得更具体");
  game.view.lifeGoal = goal;
  game.view.runProgress.lifeGoal = goal;
  game.view.tasks = [
    { id: "life-goal", title: goal, kind: "计划", detail: "这是角色在看清自身武魂后选定的人生方向。", status: "进行中" },
    ...game.view.tasks.filter((task) => task.id !== "life-goal"),
  ];
  game.view.status = "playing";
  game.view.shaping = undefined;
  game.storyMemory.openThreads = [...new Set([goal, ...game.storyMemory.openThreads])].slice(0, 12);
  game.view.updatedAt = new Date().toISOString();
  refreshStoryArchive(game);
}

export function createGame(input: CreateGameInput, meta?: MetaProgressionView): StoredGame {
  const id = randomUUID();
  const seed = input.seed?.trim() || randomUUID();
  const now = new Date().toISOString();
  const initialPersonality = input.personality ?? { keywords: [], answers: {} };
  const profile = derivePersonality(initialPersonality);
  const era = input.era ?? 1;
  const eraName = ({ 1: "斗罗大陆", 2: "绝世唐门", 3: "龙王传说", 4: "终极斗罗" } as const)[era];
  const hiddenCandidates = generateCandidates(seed, 0, input.gender, meta?.weightPreferences, (meta?.purchasedUpgrades["命运余量"] ?? 0) * 0.01, era);
  const enabledCodexSouls = meta?.martialSoulCodex.filter((entry) => entry.enabled && entry.completedRuns > 0) ?? [];
  const codexRandom = createRandom(`${seed}:enabled-codex-souls`);
  for (const candidate of hiddenCandidates) {
    if (!enabledCodexSouls.length || codexRandom() >= 0.12) continue;
    const identityIndex = MARTIAL_SOUL_GRADE_ORDER.indexOf(candidate.public.rarity);
    const compatibleCodexSouls = enabledCodexSouls.filter((entry) => MARTIAL_SOUL_GRADE_ORDER.indexOf(martialSoulGrade(entry.name, entry.rarity, Math.max(...entry.initialSoulPowers, 0))) >= identityIndex);
    if (!compatibleCodexSouls.length) continue;
    const entry = pick(codexRandom, compatibleCodexSouls);
    const definition = metaSoulById(entry.id);
    const replacement = definition ?? {
      id: entry.id,
      name: entry.name,
      category: entry.category,
      description: entry.description,
      rarity: 1,
      soulPowerRange: [Math.min(...entry.initialSoulPowers, 1), Math.max(...entry.initialSoulPowers, 10)] as [number, number],
      omens: [`${entry.name}曾在梦里留下轮廓`, `魂力对${entry.name}的意象产生共鸣`],
      metaRarity: entry.rarity,
      sourceEra: "局外" as const,
    };
    candidate.martialSoul = { ...replacement, sourceEra: replacement.sourceEra ?? "局外", grade: martialSoulGrade(replacement.name, replacement.metaRarity, replacement.soulPowerRange[1]) };
    candidate.martialSouls = [candidate.martialSoul, ...(candidate.martialSouls ?? []).filter((soul) => soul.id !== candidate.martialSoul.id).slice(0, 2)];
    candidate.innateSoulPower = Math.max(candidate.innateSoulPower, integer(codexRandom, candidate.martialSoul.soulPowerRange[0], candidate.martialSoul.soulPowerRange[1]));
  }

  const initialLocationId = inferLocationId(hiddenCandidates[0]?.public.location ?? "诺丁城");
  const world = createHiddenWorld(hiddenCandidates[0]?.public.birthYearOffset ?? 0, initialLocationId);
  const game: StoredGame = {
    schemaVersion: 10,
    revision: 0,
    hiddenCandidates,
    personalityProfile: profile,
    actionIndex: 0,
    world,
    storyMemory: {
      summary: "六岁的主角即将参加武魂觉醒，人生尚未真正开始。",
      openThreads: ["武魂觉醒结果", "家人与出身中尚未说清的细节"],
      keyChoices: [],
      npcNotes: {},
      chapterNumber: 1,
      chapterTitle: "觉醒之日",
      lastUpdatedAction: 0,
    },
    legacy: { upgrades: { ...(meta?.purchasedUpgrades ?? {}) }, equippedHeirloom: meta?.equippedHeirloom },
    view: {
      id,
      seed,
      era,
      status: "candidate_selection",
      difficulty: input.difficulty,
      speed: "标准",
      personality: initialPersonality,
      personalitySummary: profile.summary,
      lifeGoal: input.lifeGoal?.trim() || "尚未决定",
      rerollIndex: 0,
      candidateRerollsUsed: 0,
      candidatePaidRerolls: 0,
      birthProfileCount: era === 1 ? BIRTH_PROFILE_COUNT : LATER_ERA_ORIGINS[era].length * FAMILY_CLIMATES.length * 6,
      candidates: hiddenCandidates.map((candidate) => candidate.public),
      narrative: [createEntry("system", `这一轮从${eraName}时代抽出三个人。先看出身和征兆，武魂要等选定后才会揭晓。`)],
      suggestions: [],
      relations: [],
      npcRelations: [],
      reputations: [],
      tasks: [],
      inventory: [],
      inventoryLoad: { used: 0, capacity: 18, state: "轻便", storage: [] },
      professions: [],
      managedFactions: [],
      economy: { cash: 0, bankBalance: 0, debt: 0, salary: 0, bounty: 0, blackMarketAccess: false, transactions: [] },
      map: [],
      mapHierarchy: { continentName: "斗罗大陆", settlementName: "尚未选定", buildingName: "尚未选定", nodes: [] },
      mapPins: [],
      news: [],
      activeEvents: [],
      canonInfluences: [],
      storyArchive: {
        summary: "六岁的主角即将参加武魂觉醒，人生尚未真正开始。",
        openThreads: ["武魂觉醒结果", "家人与出身中尚未说清的细节"],
        keyChoices: [],
        recentConsequences: [],
        continuity: [],
      },
      knownFigures: [],
      intelligence: [],
      affiliations: [],
      chapter: { number: 1, title: "觉醒之日", summary: "六岁的主角正等着武魂觉醒。" },
      runProgress: {
        lifeGoal: input.lifeGoal?.trim() || "尚未决定",
        highestSoulRank: 0,
        discoveries: 0,
        relationshipsBuilt: 0,
        historicalImpact: 0,
        completedHunts: 0,
      },
      createdAt: now,
      updatedAt: now,
    },
  };
  game.view.map = buildMapView(game);
  game.view.mapHierarchy = buildMapHierarchy(game);
  game.view.intelligence = buildIntelligenceView(game);
  game.view.knownFigures = buildKnownFigures(game);
  game.view.activeEvents = buildActiveEvents(game);
  refreshStoryArchive(game);
  return game;
}

export function createEraSuccessor(parent: StoredGame, meta?: MetaProgressionView): StoredGame {
  const sourceEra = parent.view.era ?? 1;
  if (parent.view.status !== "ended" || !parent.view.runProgress.settlement?.qualified) throw new Error("只有完成结算并达到有效周目条件，才能建立连续世界线");
  if (sourceEra >= 4) throw new Error("斗四已经是当前连续世界线的最后开放时代");
  const targetEra = (sourceEra + 1) as 2 | 3 | 4;
  const ancestor = parent.view.character;
  if (!ancestor) throw new Error("结算存档缺少可继承的人物记录");
  const priorGeneration = parent.view.worldInheritance?.generation ?? 0;
  const legacyArtifact = `旧世档案 · ${ancestor.name}`;
  const inheritedEchoes = [
    `${ancestor.name}在第${sourceEra}时代以“${parent.view.runProgress.settlement.ending}”留下记载`,
    `旧世最高魂力${parent.view.runProgress.highestSoulRank}级，历史影响${parent.world.metrics.historicalImpact}`,
    ...parent.world.canonCausalFootprints.slice(-2).map((footprint) => footprint.description),
  ].slice(0, 4);
  const worldInheritance = {
    generation: priorGeneration + 1,
    sourceEra,
    targetEra,
    ancestorName: ancestor.name,
    ending: parent.view.runProgress.settlement.ending,
    highestSoulRank: parent.view.runProgress.highestSoulRank,
    historicalImpact: parent.world.metrics.historicalImpact,
    legacyArtifact,
    echoes: inheritedEchoes,
  } as const;
  const successor = createGame({ era: targetEra, gender: ancestor.gender, difficulty: parent.view.difficulty, seed: `${parent.view.seed}:generation:${targetEra}:${parent.revision}` }, meta);
  successor.view.id = parent.view.id;
  successor.revision = parent.revision;
  successor.view.createdAt = parent.view.createdAt;
  successor.view.updatedAt = new Date().toISOString();
  successor.view.worldInheritance = worldInheritance;
  successor.legacy.worldInheritance = worldInheritance;
  successor.view.narrative.unshift(createEntry("system", `连续世界线 · 第 ${worldInheritance.generation + 1} 代。${ancestor.name}的时代已经过去，留下的不是原样等级，而是可被调查、质疑和改变的历史。`));
  for (const candidate of successor.hiddenCandidates) {
    candidate.public.originFacts = [...candidate.public.originFacts, { label: "旧世回声", value: `${legacyArtifact}由家族或保管机构传到这一代，真实性仍需核验。` }];
    candidate.public.omens = [...candidate.public.omens, `幼年时曾反复梦见${ancestor.name}留下的一段模糊旧史`];
  }
  successor.view.candidates = successor.hiddenCandidates.map((candidate) => candidate.public);
  return successor;
}

export function rerollCandidates(game: StoredGame, preferences?: WeightPreferences, lockedSlots: number[] = []): void {
  const nextIndex = game.view.rerollIndex + 1;
  const fresh = generateCandidates(
    game.view.seed,
    nextIndex,
    game.view.candidates[0]?.gender ?? "男",
    preferences,
    (game.legacy.upgrades["命运余量"] ?? 0) * 0.01,
    game.view.era ?? 1,
  );
  const locks = new Set(lockedSlots.filter((slot) => slot >= 0 && slot < 3));
  game.hiddenCandidates = fresh.map((candidate, index) => locks.has(index) ? game.hiddenCandidates[index] ?? candidate : candidate);
  const inheritance = game.legacy.worldInheritance;
  if (inheritance) for (const candidate of game.hiddenCandidates) {
    if (!candidate.public.originFacts.some((fact) => fact.label === "旧世回声")) candidate.public.originFacts.push({ label: "旧世回声", value: `${inheritance.legacyArtifact}由家族或保管机构传到这一代，真实性仍需核验。` });
    if (!candidate.public.omens.some((omen) => omen.includes(inheritance.ancestorName))) candidate.public.omens.push(`幼年时曾反复梦见${inheritance.ancestorName}留下的一段模糊旧史`);
  }
  game.view.rerollIndex = nextIndex;
  game.view.candidateRerollsUsed += 1;
  game.view.candidates = game.hiddenCandidates.map((candidate) => candidate.public);
  game.view.selectedCandidateId = undefined;
  game.view.updatedAt = new Date().toISOString();
  refreshStoryArchive(game);
}

export function selectCandidate(game: StoredGame, candidateId: string, customName?: string, forcedSoul?: MartialSoulTemplate): void {
  const candidate = game.hiddenCandidates.find((item) => item.public.id === candidateId);
  if (!candidate) throw new Error("候选角色不存在或已经失效");
  if (forcedSoul) {
    candidate.martialSoul = { ...forcedSoul, sourceEra: forcedSoul.sourceEra ?? "局外", grade: forcedSoul.grade ?? martialSoulGrade(forcedSoul.name, forcedSoul.metaRarity, forcedSoul.soulPowerRange[1]) };
    candidate.martialSouls = [candidate.martialSoul, ...(candidate.martialSouls ?? []).filter((soul) => soul.id !== candidate.martialSoul.id).slice(0, 2)];
    candidate.innateSoulPower = Math.max(candidate.innateSoulPower, integer(createRandom(`${game.view.seed}:codex-soul:${forcedSoul.id}`), forcedSoul.soulPowerRange[0], forcedSoul.soulPowerRange[1]));
    candidate.public.omens[0] = thirdPersonClue(forcedSoul.omens[0] ?? `${forcedSoul.name}的轮廓曾在梦里出现`, candidate.public.name, candidate.public.gender);
    game.legacy.plannedMartialSoulId = forcedSoul.id;
  }

  const chosenName = customName?.trim();
  if (chosenName) {
    const oldName = candidate.public.name;
    candidate.public.name = chosenName;
    candidate.public.originSummary = candidate.public.originSummary.replaceAll(oldName, chosenName);
    candidate.public.originFacts = candidate.public.originFacts.map((fact) => ({ ...fact, value: fact.value.replaceAll(oldName, chosenName) }));
    candidate.public.omens = candidate.public.omens.map((omen) => omen.replaceAll(oldName, chosenName));
  }

  game.view.selectedCandidateId = candidateId;
  game.view.status = "character_shaping";
  game.view.location = candidate.public.dwelling;
  game.view.locationId = candidate.public.locationId;
  game.world = createHiddenWorld(candidate.public.birthYearOffset ?? 0, game.view.locationId);
  game.view.worldTime = { era: candidate.public.eraRelation, year: candidate.public.birthYearOffset ?? 0, day: 1, time: "08:00", season: "春" };
  game.view.map = buildMapView(game);
  recordIntelligence(game, { subjectType: "地点", subjectId: candidate.public.locationId, title: candidate.public.location, detail: `${candidate.public.residence.district}；住处为${candidate.public.residence.building}，主角日常使用${candidate.public.residence.room}。`, source: "六年日常生活", confidence: 100, status: "确定" });
  game.view.mapHierarchy = buildMapHierarchy(game);
  game.view.candidates = game.hiddenCandidates.map((item) => item.public);
  game.view.shaping = buildShaping(game, 0, 0, [false, false, false], undefined, false);
  game.view.narrative = [
    createEntry("system", `${candidate.public.name}已经选定。接下来再决定${candidate.public.gender === "女" ? "她" : "他"}会成为什么样的人。`),
    ...(game.view.worldInheritance ? [createEntry("system", `旧世回声 · ${game.view.worldInheritance.legacyArtifact}会在觉醒后成为可调查的家族线索。`)] : []),
  ];
  game.view.suggestions = [];
  game.view.updatedAt = new Date().toISOString();
}

function buildAwakeningPrelude(candidate: HiddenCandidate, profile: PersonalityProfile): string {
  const pronoun = candidate.public.gender === "女" ? "她" : "他";
  const thirdPersonOrigin = candidate.public.originSummary
    .replaceAll("你的", `${pronoun}的`)
    .replaceAll("你", pronoun);
  const reaction = profile.scores.courage >= 2 ? "脚尖已经朝向阵法" : profile.scores.patience >= 2 ? "目光沿着六块黑石慢慢看了一圈" : "指甲在掌心掐出一道浅印";
  const specialIdentity = /亲传|嫡系|少宗主|封号|封爵|竞争子嗣|转生者|穿越者|少主|余脉|养子/.test(candidate.public.originName);
  const identityLine = `${specialIdentity ? `${candidate.public.name}的身份是${candidate.public.originName}` : `${candidate.public.name}生在${candidate.public.originName}`}。${thirdPersonOrigin}`;
  const scenes: Record<string, [string, string, string]> = {
    "seven-treasure-core": [
      "七宝城堡的内院刚开门，觉醒厅外已经站着宗门教习和几名同龄孩子。宁风致没有坐主位，只在屏风后留了一盏茶。",
      `${candidate.public.name}跟着宁远山走到阵前。尘心靠在窗边，视线在${pronoun}的手腕上停了一瞬。${candidate.public.name}${reaction}。`,
      `六块黑石嵌进七宝纹地砖。教习合上内门考册，叫了${candidate.public.name}的名字。`,
    ],
    "spirit-hall-elder-child": [
      "武魂城长老殿东厅封了门。教皇殿和供奉殿各来一人，隔着长桌谁也不先开口。",
      `霜戈斗罗没有靠近，只把自己的长戈横在膝前。${candidate.public.name}${reaction}，侍从长魏崇悄悄退到门边。`,
      `觉醒阵旁摆着两颗备用水晶球。主持仪式的红衣主教核对完家徽，叫${candidate.public.name}入阵。`,
    ],
    "hidden-sect-heir": [
      "晨雾压在太玄剑谷里，宗门没有敲钟。觉醒堂只来了宗主夫妇、守碑长老和两名负责封阵的弟子。",
      `守碑长老闻九把六块黑石逐一擦净。${candidate.public.name}${reaction}，谷外的剑鸣隔着山壁传进来，很轻。`,
      `顾玄一亲手关上堂门。闻九没有念少宗主的尊称，只叫了${candidate.public.name}的名字。`,
    ],
    "blue-lightning-heir": [
      "雷霆山门上空压着低云，雷池教习把觉醒阵搬到露天石台。嫡系长老坐了半圈，谁也没谈亲情。",
      `同辈的名字和结果已经写在石榜上。${candidate.public.name}${reaction}，右臂被潮湿空气激得微微发麻。`,
      `远处落下一道闷雷。教习玉川抬手示意，轮到${candidate.public.name}。`,
    ],
    "heaven-royal-ward": [
      "王府把会客厅腾了出来，窗外有皇室护卫换岗。太子府与雪星亲王送来的两名见证人坐在不同方向。",
      `乳母替${candidate.public.name}理平衣领，又立刻退开。${candidate.public.name}${reaction}，没有去看桌上那两份礼单。`,
      `宫廷魂师展开天鹅纹名册，声音不高，厅里却一下安静。`,
    ],
    "star-luo-contender": [
      "公爵府训练场没有家宴，只有教官、医师和负责记录输赢的管家。长兄的觉醒成绩挂在最显眼的位置。",
      `魂帝教官罗铮检查完阵石。${candidate.public.name}${reaction}，母亲站在廊下，没有出声鼓励。`,
      `管家翻到空白的一页。罗铮叫${candidate.public.name}上前，计时沙漏随即倒转。`,
    ],
    "cultivator-reincarnation": [
      `天刚亮，${candidate.public.location}的觉醒室还带着药草和潮土的气味。对旁人来说今天才是开始，${candidate.public.name}已经等了六年。`,
      `${candidate.public.name}把前世所知的经脉、灵根和眼前阵石一一对照，仍找不到完全相同的东西。${pronoun}${reaction}。`,
      `执事摆好六块黑石，叫了${candidate.public.name}的名字。识海里的黯淡剑痕没有回应。`,
    ],
    "modern-transmigrator": [
      `天刚亮，${candidate.public.location}的觉醒队伍已经排到街角。${candidate.public.name}记得原作写过这一天，却从没想过等待会这么慢。`,
      `${pronoun}又核对了一遍年份和地点。剧情只能当旧地图，眼前每张脸都没有写在书里。${candidate.public.name}${reaction}。`,
      `六块黑石亮起边角的金纹。执事念到${candidate.public.name}，${pronoun}把时间线笔记留在了家人的包里。`,
    ],
    "underworld-heir": [
      "黑槐会包下了武魂分殿后厅。刑堂主带来的人守住两扇门，登记执事收了钱，脸色仍不好看。",
      `顾黑槐没有教孩子该笑还是该怕。${candidate.public.name}${reaction}，先记住了厅里每个人站的位置。`,
      `觉醒阵摆好后，执事只念名字，没有念黑槐会少主这层身份。`,
    ],
    "evil-soul-remnant": [
      "觉醒仪式设在一座陌生小镇。母亲换了姓氏，路引也是真的，只是负责登记的武魂殿执事在旧姓那一栏停得太久。",
      `${candidate.public.name}记得家谱上的戒律，也认得门外那双巡查队的靴子。${pronoun}${reaction}。`,
      `执事把水晶球转了半圈，示意${candidate.public.name}站进阵里。母亲的手已经按在藏药的位置。`,
    ],
  };
  const scene = scenes[candidate.originId] ?? [
    `天刚亮，${candidate.public.location}的石路还带着夜里的凉气。今天轮到六岁的孩子觉醒，门外已经挤了不少人。`,
    `队伍一点点往前挪。主持仪式的魂师翻着名册，头也没抬。${candidate.public.name}${reaction}。`,
    `六块黑石摆在地上，边角磨得发亮。前一个孩子哭着跑出去。执事念出了${candidate.public.name}的名字。`,
  ];
  return [scene[0], identityLine, scene[1], scene[2]].join("\n\n");
}

export function awakenCharacter(game: StoredGame): CharacterPublic {
  const selected = game.hiddenCandidates.find(
    (candidate) => candidate.public.id === game.view.selectedCandidateId,
  );
  if (!selected) throw new Error("请先选择角色");

  const soulTemplates = selected.martialSouls?.length ? selected.martialSouls : [selected.martialSoul];
  const identityText = `${selected.originId} ${selected.public.originName} ${selected.public.originSummary} ${selected.public.route} ${selected.roleTags.join(" ")}`;
  const soulViews = soulTemplates.map((soul, index) => ({
    name: soul.name,
    category: soul.category,
    description: soul.description,
    rarity: soul.metaRarity,
    grade: soul.grade ?? martialSoulGrade(soul.name, soul.metaRarity, soul.soulPowerRange[1]),
    sourceEra: soul.sourceEra ?? "原创" as const,
    cultivationState: index === 0 ? "主修" as const : "未修炼" as const,
    originFit: soul.sourceEra === "局外"
      ? "由局外图鉴指定，不受本次出身权重限制。"
      : (soul.affinityTags ?? []).some((tag) => identityText.includes(tag))
        ? "与血脉、家族或成长环境高度契合。"
        : soul.lineageBound
          ? "属于极低概率的隐性血脉或返祖觉醒，来源需要在剧情中追查。"
          : selected.public.originName.includes("变异") || selected.roleTags.some((tag) => /实验|异脉|变异|谜团/.test(tag))
            ? "与身份中的变异征兆相符。"
            : "与出身常见方向并不完全一致，可能是自然变异。",
  }));
  const character: CharacterPublic = {
    ...selected.public,
    age: 6,
    martialSoul: soulViews[0],
    martialSouls: soulViews,
    innateSoulPower: selected.innateSoulPower,
    soulRank: selected.innateSoulPower,
    cultivationProgress: selected.innateSoulPower >= 10 ? "等待第一魂环" : "刚刚起步",
    condition: "良好",
    fatigue: "轻松",
    coins: selected.originStart?.coins ?? 12,
    reputation: selected.originStart?.reputation ?? "默默无闻",
    injuries: [],
    soulRings: [],
    activeMartialSoulIndex: 0,
    soulRingSets: [[]],
    soulSpirits: [],
    battleArmors: [],
    abilityDescriptors: {
      physique: selected.physique,
      spirit: selected.spirit,
      perception: selected.perception,
    },
    personalityTraits: game.personalityProfile.summary,
  };

  if (selected.originId === "cultivator-reincarnation") {
    character.revealedGift = "前世修行记忆完整保留，修为归零，功法尚未适配魂力";
    character.specialSystem = { name: "前世剑修传承", stage: "斗罗适配 · 未入门", progress: "0%", abilities: ["剑理记忆", "经脉辨识"], resourceHint: "需要结合武魂、魂环与当地材料逐步验证" };
  } else if (selected.originId === "modern-transmigrator") {
    character.revealedGift = "知道原作主要时间线；越受玩家影响，记忆越不可靠";
  } else if (selected.originId === "evil-soul-remnant") {
    character.revealedGift = "知道家族禁术的入门方法与戒律";
    character.specialSystem = { name: "家族吞噬禁术", stage: "封存 · 可选择是否修炼", progress: "0%", abilities: ["隐藏异常气息"], resourceHint: "修炼会带来道德、追捕和身体风险" };
  }

  game.view.character = character;
  game.view.status = "life_goal_selection";
  game.view.shaping = buildShaping(game, 0, game.view.shaping?.personalityRerollIndex ?? 0, [false, false, false], undefined, true);
  const originStart: Record<string, { coins: number; reputation: string; inventory: string[]; affiliation?: { id: string; name: string; role: string } }> = {
    "seven-treasure-core": { coins: 800, reputation: "七宝内门熟面孔", inventory: ["七宝琉璃宗内门令", "精制行囊", "三日干粮", "备用金票"], affiliation: { id: "seven-treasure", name: "七宝琉璃宗", role: "内门亲传候选" } },
    "spirit-hall-elder-child": { coins: 700, reputation: "长老殿嫡系", inventory: ["长老殿家徽", "武魂城通行令", "精制护身软甲", "金魂币袋"], affiliation: { id: "spirit-hall", name: "武魂殿", role: "长老嫡系" } },
    "hidden-sect-heir": { coins: 240, reputation: "山门内人人认识", inventory: ["太玄少宗主剑令", "封山阵路图", "养剑木匣", "三日干粮"], affiliation: { id: "taixuan-sword", name: "太玄剑宗", role: "少宗主" } },
    "blue-lightning-heir": { coins: 500, reputation: "蓝电嫡系后辈", inventory: ["蓝电霸王龙宗嫡系令", "雷池候选牌", "淬体药膏"], affiliation: { id: "blue-lightning", name: "蓝电霸王龙宗", role: "核心嫡系" } },
    "clear-sky-sealed-branch": { coins: 60, reputation: "封山旧村后辈", inventory: ["残缺昊天旧令", "粗布行囊", "山路干粮"], affiliation: { id: "clear-sky", name: "昊天宗", role: "身份未核实的封山支脉" } },
    "heaven-royal-ward": { coins: 1000, reputation: "皇室旁系子弟", inventory: ["旁系王府徽章", "皇城通行文书", "精制短披风", "金魂币袋"], affiliation: { id: "heaven-dou", name: "天斗帝国", role: "旁系封爵子" } },
    "star-luo-contender": { coins: 850, reputation: "军功公爵府候选人", inventory: ["星罗公爵府身份牌", "训练记录册", "轻质护腕", "金魂币袋"], affiliation: { id: "star-luo", name: "星罗帝国", role: "公爵府竞争子嗣" } },
    "cultivator-reincarnation": { coins: 25, reputation: "药谷里的早熟孩子", inventory: ["养父的旧药囊", "自制木剑", "前世口诀默写残页"] },
    "modern-transmigrator": { coins: 18, reputation: "爱说怪话的孩子", inventory: ["自制时间线笔记", "炭笔", "旧布包", "半日干粮"] },
    "underworld-heir": { coins: 450, reputation: "黑槐会少主", inventory: ["黑槐木牌", "暗账缩本", "袖中短刃", "应急钱袋"], affiliation: { id: "black-huai", name: "黑槐会", role: "少主" } },
    "evil-soul-remnant": { coins: 35, reputation: "旧姓避难者", inventory: ["禁术戒律残页", "遮掩气息的草药", "伪造路引", "旧布包"] },
    "hidden-master-ward": { coins: 80, reputation: "山里老猎人的养子", inventory: ["养父磨钝的猎刀", "呼吸步法木册", "疗伤药包", "两日干粮"] },
  };
  const start = originStart[selected.originId];
  if (start) {
    character.coins = start.coins;
    character.reputation = start.reputation;
    game.view.inventory = [...start.inventory];
    game.view.affiliations = start.affiliation ? [{ ...start.affiliation, reputation: "身份已确认", joinedAt: "出生" }] : [];
  } else {
    game.view.inventory = [...(selected.originStart?.items ?? []), "旧布包", "半日干粮"];
  }
  game.world.flags.destinyPressure = selected.originStart?.pressure ?? 1;
  game.world.flags.originAdvantage = selected.originStart?.advantage ?? selected.public.originAdvantage;
  game.world.flags.originBurden = selected.originStart?.burden ?? selected.public.originBurden;
  if (game.legacy.equippedHeirloom) game.view.inventory.push(game.legacy.equippedHeirloom);
  const inheritance = game.legacy.worldInheritance;
  if (inheritance && !game.view.inventory.includes(inheritance.legacyArtifact)) game.view.inventory.push(inheritance.legacyArtifact);
  const foundationLevel = game.legacy.upgrades["稳固根基"] ?? 0;
  if (foundationLevel > 0) {
    game.world.healthPoints = Math.min(100, game.world.healthPoints + foundationLevel * 5);
    game.world.flags.legacyFoundation = foundationLevel;
  }
  const loreLevel = game.legacy.upgrades["旧世见闻"] ?? 0;
  if (loreLevel > 0) {
    const nearby = Object.values(game.world.npcs).filter((npc) => npc.locationId === game.view.locationId).slice(0, loreLevel);
    for (const npc of nearby) revealNpc(game, npc.id);
    if (nearby.length) game.view.narrative.push(createEntry("system", `旧世见闻 · 认出了${nearby.map((npc) => npc.name).join("、")}`));
  }
  game.view.relations = selected.public.startingRelations.map((relation, index) => {
    const strength = relation.strength ?? 10;
    return {
      ...relation,
      impression: index === 2 && selected.innateSoulPower >= 7 ? "已经记住这次少见的觉醒结果" : relation.impression,
      dimensions: { closeness: relation.category === "敌对" ? -strength : strength, trust: Math.round(strength * .8), respect: Math.round(strength * .45), sharedInterest: 0, vigilance: relation.category === "敌对" ? strength : 5, hostility: relation.category === "敌对" ? strength : 0, favorDebt: 0, identityKnowledge: Math.min(100, strength + 10) },
      history: [{ date: "出生至觉醒日", reason: "共同生活、监护或身份归属形成的初始关系", changes: "初始关系" }],
    };
  });
  game.view.tasks = selected.innateSoulPower > 0
    ? [{ id: "first-ring", title: "获得第一魂环", kind: "修炼需求", detail: "魂力达到十级后，完成一次完整猎魂。", status: "进行中" }]
    : [{ title: "理解觉醒结果", kind: "线索", detail: "没有显现先天魂力并不等于所有道路都已断绝。" }];
  if (inheritance) {
    game.view.tasks.push({ id: "inherited-worldline", title: `核验${inheritance.ancestorName}留下的旧世档案`, kind: "线索", detail: `档案跨越约万年，记录了“${inheritance.ending}”，但传抄、势力宣传与历史偏移都可能改变内容。`, status: "进行中" });
    recordIntelligence(game, { subjectType: "事件", subjectId: `world-inheritance-${inheritance.generation}`, title: `${inheritance.ancestorName}的旧世记录`, detail: inheritance.echoes.join("；"), source: inheritance.legacyArtifact, confidence: 55, status: "推测" });
    game.world.flags.inheritedWorldlineGeneration = inheritance.generation;
    game.world.flags.inheritedHistoricalImpact = inheritance.historicalImpact;
    game.view.narrative.push(createEntry("system", `世代继承 · 获得${inheritance.legacyArtifact}。它只提供有偏差可能的历史线索，不直接继承魂力、魂环或装备战力。`));
  }
  if (selected.originId === "cultivator-reincarnation") game.view.tasks.push({ id: "adapt-cultivation", title: "验证前世修行法", kind: "计划", detail: "先完成一条能安全运转的魂力经脉路线。", status: "进行中" });
  if (selected.originId === "modern-transmigrator") game.view.tasks.push({ id: "verify-timeline", title: "核实剧情时间线", kind: "线索", detail: "先确认当前年份、唐三位置和已经发生的关键节点。", status: "进行中" });
  if (selected.originId === "evil-soul-remnant") game.view.tasks.push({ id: "forbidden-choice", title: "决定是否接触家族禁术", kind: "计划", detail: "戒律、收益和代价都已经知道，是否修炼仍由角色决定。", status: "进行中" });
  if ((selected.originStart?.pressure ?? 1) >= 3) game.view.tasks.push({ id: "identity-burden", title: "处理身份带来的第一场麻烦", kind: "线索", detail: selected.originStart?.burden ?? selected.public.originBurden, status: "进行中", destinationId: selected.public.locationId });
  const soulGrades = soulViews.map((soul) => MARTIAL_SOUL_GRADE_ORDER.indexOf(soul.grade ?? "平凡"));
  const highAttention = selected.innateSoulPower >= 7 || (selected.innateSoulPower > 0 && (soulViews.length > 1 || Math.max(...soulGrades) >= MARTIAL_SOUL_GRADE_ORDER.indexOf("传奇")));
  if (highAttention) {
    const isHallIdentity = selected.roleTags.some((tag) => /武魂殿/.test(tag)) || game.view.affiliations.some((affiliation) => affiliation.id === "spirit-hall");
    const hasMajorFaction = game.view.affiliations.some((affiliation) => ["seven-treasure", "blue-lightning", "clear-sky", "star-luo", "heaven-dou", "taixuan-sword"].includes(affiliation.id));
    const attentionLevel = selected.innateSoulPower === 10 || soulViews.length > 1 || Math.max(...soulGrades) >= MARTIAL_SOUL_GRADE_ORDER.indexOf("神话") ? "最高优先" : "重点";
    game.world.flags.awakeningAttention = attentionLevel;
    const awakeningRelation = game.view.relations.find((relation) => /觉醒|执事|武魂殿/.test(`${relation.relation}${relation.name}${relation.faction ?? ""}`));
    if (awakeningRelation) {
      awakeningRelation.impression = isHallIdentity ? "将觉醒结果列入内部培养评估" : hasMajorFaction ? "既想上报天赋，也在衡量所属势力的态度" : "已经封存觉醒记录，准备上报主殿并正式接触";
      awakeningRelation.history = [...(awakeningRelation.history ?? []), { date: `原作 ${game.view.worldTime?.year ?? 0} 年第 ${game.view.worldTime?.day ?? 1} 日`, reason: `${selected.innateSoulPower}级先天魂力与${soulViews.length > 1 ? `${soulViews.length}生武魂` : soulViews[0].name}引起注意`, changes: `武魂殿关注提升至${attentionLevel}` }];
    }
    game.view.tasks.push({ id: "awakening-recruitment", title: isHallIdentity ? "回应武魂殿内部培养评估" : "决定如何回应武魂殿的正式接触", kind: "线索", detail: isHallIdentity ? "长老殿、教皇殿或地方主殿会重新核定培养路线；接受哪一方仍由角色决定。" : hasMajorFaction ? "武魂殿会登记并提出接触，原属势力也会介入条件谈判。" : "当地执事会向主殿上报，并提供登记、学院、导师或加入武魂殿的条件。", status: "进行中", destinationId: selected.public.locationId, deadline: "约十日内会有正式来人" });
    const year = game.view.worldTime?.year ?? 0;
    const day = game.view.worldTime?.day ?? 1;
    game.world.dynamicEvents.push({ id: `awakening-attention-${game.view.id}`, title: isHallIdentity ? "武魂殿内部培养评估" : "武魂殿的正式接触", kind: "势力", locationId: selected.public.locationId, participantIds: [], detail: isHallIdentity ? "觉醒记录已进入内部渠道，不同派系会给出不同培养条件。" : hasMajorFaction ? "地方武魂殿已上报结果；来人既会招揽，也会试探原属势力底线。" : "地方执事已封存觉醒记录并上报主殿，正式招揽不会只停留在口头夸赞。", stakes: attentionLevel === "最高优先" ? 5 : 3, status: "可介入", createdYear: year, createdDay: day, expiresOrdinal: year * 360 + day + 10 });
    character.reputation = selected.innateSoulPower === 10 ? "武魂殿重点记录的先天满魂力" : `${selected.innateSoulPower}级先天魂力新秀`;
  }
  game.view.chapterObjective = {
    title: selected.innateSoulPower > 0 ? "让觉醒结果真正变成第一步" : "确认无魂力之后仍有哪些路",
    stakes: selected.originStart?.burden ?? selected.public.originBurden,
    destinationId: selected.public.locationId,
    steps: selected.innateSoulPower > 0
      ? [
          { id: "understand", text: "向可靠的人弄清武魂与先天魂力意味着什么", status: "进行中" },
          { id: "summon", text: "完成第一次主动召唤并确认武魂特性", status: "未开始" },
          { id: "path", text: "确定入学、拜师、宗门或独自修炼中的近期路线", status: "未开始" },
        ]
      : [
          { id: "recheck", text: "确认觉醒阵、水晶球和身体是否存在异常", status: "进行中" },
          { id: "alternate", text: "查找体魄、知识或特殊体系的替代成长线", status: "未开始" },
          { id: "commit", text: "选定下一阶段愿意付出代价的道路", status: "未开始" },
        ],
  };
  game.storyMemory.openThreads = selected.innateSoulPower > 0
    ? ["家人与出身中尚未说清的细节", "获得第一魂环"]
    : ["家人与出身中尚未说清的细节", "理解觉醒结果"];
  game.storyMemory.summary = `${selected.public.name}在${selected.public.location}完成武魂觉醒，${soulViews.length === 1 ? "武魂" : soulViews.length === 2 ? "双生武魂" : "三生武魂"}为${soulViews.map((soul) => soul.name).join("、")}，先天魂力${selected.innateSoulPower}级。`;
  game.view.narrative.push(createEntry("narration", buildAwakeningResult(selected)));
  game.view.suggestions = selected.innateSoulPower > 0
    ? highAttention ? ["询问武魂殿能够提供哪些具体培养条件", "先和家人或所属势力商量立场", "测试主武魂并记录其限制"] : [`询问${selected.innateSoulPower}级先天魂力该怎么修炼`, "观察家人与旁人的反应", "尝试第一次主动召唤武魂"]
    : ["追问是否存在重新检测的方法", "观察武魂本身还有没有异常", "先接受结果，回去查找其他道路"];
  game.view.updatedAt = new Date().toISOString();
  game.view.runProgress.highestSoulRank = character.soulRank;
  game.view.economy.cash = character.coins;
  game.view.reputations = [{ scope: selected.public.location, publicName: character.name, reputation: character.reputation, heat: 0, source: "户籍、家庭与觉醒记录" }];
  refreshStoryArchive(game);
  return character;
}

function buildAwakeningResult(candidate: HiddenCandidate): string {
  const name = candidate.public.name;
  const pronoun = candidate.public.gender === "女" ? "她" : "他";
  const powerText = candidate.innateSoulPower === 10
    ? `手掌刚贴上水晶球，白光便猛地涨开。执事抓住${pronoun}的手腕又测了一次。先天满魂力。`
    : candidate.innateSoulPower > 0
      ? `水晶球亮了，刻度停在先天魂力 ${candidate.innateSoulPower} 级。执事低头记下数字。`
      : `水晶球一直没亮。执事等了两息，才把它从${pronoun}手下抽走。`;

  const souls = candidate.martialSouls?.length ? candidate.martialSouls : [candidate.martialSoul];
  const soulCountText = souls.length === 1 ? "武魂" : souls.length === 2 ? "双生武魂" : "三生武魂";
  const soulLines = souls.map((soul, index) => `${index === 0 ? `${pronoun}的掌心里` : `紧接着，第 ${index + 1} 道魂力轮廓中`}出现了${soul.name}。这是${soul.category}。${soul.description}`);
  const hallIdentity = candidate.roleTags.some((tag) => /武魂殿/.test(tag));
  const attentionText = candidate.innateSoulPower === 10 || souls.length > 1
    ? hallIdentity
      ? "执事没有当众议论，只把记录纸折进带封印的夹层，示意旁边的人立刻送往主殿。内部培养评估会在今天开始。"
      : "执事把水晶球又测了一遍，随后封住记录，要求家人暂时别走。这样的结果必须上报主殿，武魂殿会派人正式谈培养与归属。"
    : candidate.innateSoulPower >= 7
      ? "执事在魂力等级下面画了两道线，说明这份记录会作为重点天赋上报，之后会有人来谈学院与培养条件。"
      : "";
  return [
    `${name}踩进六角阵。金色光点贴着小腿往上钻，皮肤又麻又痒。右手忽然一沉，${pronoun}差点把胳膊甩出去。`,
    souls.length > 1 ? `阵中的光没有立刻散去。负责觉醒的魂师重新数了一遍魂力轮廓——${soulCountText}。` : "",
    ...soulLines,
    powerText,
    attentionText,
    `门外有人踮脚往里看。家里人还不知道结果，${pronoun}先听见自己喘了一口气。`,
  ].filter(Boolean).join("\n\n");
}

export function publicView(game: StoredGame) {
  return game.view;
}
