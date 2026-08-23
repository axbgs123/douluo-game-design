import { randomUUID } from "node:crypto";
import type {
  CandidatePublic,
  CharacterPublic,
  NarrativeEntry,
  PersonalitySetup,
} from "../../shared/game.js";
import type {
  CreateGameInput,
  HiddenCandidate,
  MartialSoulTemplate,
  PersonalityProfile,
  StoredGame,
} from "./model.js";
import { createRandom, integer, pick, weightedPick } from "./random.js";

interface OriginTemplate {
  id: string;
  name: string;
  summary: string;
  details: string[];
  locations: string[];
  preferredCategories: string[];
  weight: number;
}

const SURNAMES = ["林", "苏", "顾", "沈", "陆", "叶", "程", "江", "白", "宁", "周", "秦"];
const GIVEN_NAMES = ["川", "宁", "昭", "砚", "澜", "遥", "清", "越", "衡", "棠", "烬", "青", "禾", "微"];

const ORIGINS: OriginTemplate[] = [
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
];

const MARTIAL_SOULS: MartialSoulTemplate[] = [
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
];

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
  ];
  for (const [pattern, trait, value] of keywordRules) {
    if (pattern.test(keywordText)) scores[trait] += value;
  }

  const ranked = Object.entries(scores)
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .slice(0, 3)
    .map(([trait, score]) => (score >= 0 ? TRAIT_LABELS[trait][1] : TRAIT_LABELS[trait][0]));

  return { scores, summary: [...new Set([...setup.keywords.slice(0, 2), ...ranked])].slice(0, 4) };
}

function chooseSoul(random: () => number, origin: OriginTemplate): MartialSoulTemplate {
  const choices = MARTIAL_SOULS.map((soul) => ({
    ...soul,
    weight: soul.rarity * (origin.preferredCategories.includes(soul.category) ? 1.8 : 0.65),
  }));
  return weightedPick(random, choices);
}

function eraRelation(offset: number): string {
  if (offset === 0) return "与唐三同年参加武魂觉醒";
  if (offset < 0) return `比唐三觉醒早约 ${Math.abs(offset)} 年`;
  return `比唐三觉醒晚约 ${offset} 年`;
}

function generateName(random: () => number): string {
  const doubleName = random() > 0.55;
  return `${pick(random, SURNAMES)}${pick(random, GIVEN_NAMES)}${doubleName ? pick(random, GIVEN_NAMES) : ""}`;
}

export function generateCandidates(
  seed: string,
  rerollIndex: number,
  gender: "男" | "女",
): HiddenCandidate[] {
  const random = createRandom(`${seed}:candidates:${rerollIndex}`);
  const usedOrigins = new Set<string>();

  return Array.from({ length: 3 }, (_, index) => {
    let origin = weightedPick(random, ORIGINS);
    for (let attempt = 0; usedOrigins.has(origin.id) && attempt < 8; attempt += 1) {
      origin = weightedPick(random, ORIGINS);
    }
    usedOrigins.add(origin.id);

    const soul = chooseSoul(random, origin);
    const offset = integer(random, -20, 20);
    const innateSoulPower = integer(random, soul.soulPowerRange[0], soul.soulPowerRange[1]);
    const name = generateName(random);
    const candidate: CandidatePublic = {
      id: `${rerollIndex}-${index}-${Math.floor(random() * 1_000_000).toString(36)}`,
      name,
      gender,
      eraRelation: eraRelation(offset),
      location: pick(random, origin.locations),
      originName: origin.name,
      originSummary: `${origin.summary}${pick(random, origin.details)}`,
      omens: [pick(random, soul.omens), pick(random, [
        "觉醒日前一夜，你做了一个醒来后便模糊的梦",
        "家中长辈对你的身世似乎隐瞒了一小部分",
        "附近魂师曾评价你的气息比同龄人更稳定",
        "你没有显眼异象，平凡得近乎让人安心",
      ])],
    };

    const giftRoll = random();
    const hiddenGift = origin.id === "mystery-arrival" || giftRoll < 0.025
      ? pick(random, ["残缺丹道传承", "至尊骨雏形", "无名剑典残页", "未激活的因果印记"])
      : undefined;

    return {
      public: candidate,
      martialSoul: soul,
      innateSoulPower,
      hiddenGift,
      physique: pick(random, ["普通", "优秀", "优秀", "顶尖"]),
      spirit: pick(random, ["普通", "优秀", "优秀", "顶尖"]),
      perception: pick(random, ["普通", "优秀", "优秀", "顶尖"]),
    };
  });
}

export function createGame(input: CreateGameInput): StoredGame {
  const id = randomUUID();
  const seed = input.seed?.trim() || randomUUID();
  const now = new Date().toISOString();
  const profile = derivePersonality(input.personality);
  const hiddenCandidates = generateCandidates(seed, 0, input.gender);

  return {
    hiddenCandidates,
    personalityProfile: profile,
    actionIndex: 0,
    view: {
      id,
      seed,
      status: "candidate_selection",
      difficulty: input.difficulty,
      speed: "标准",
      personality: input.personality,
      personalitySummary: profile.summary,
      rerollIndex: 0,
      candidates: hiddenCandidates.map((candidate) => candidate.public),
      narrative: [createEntry("system", "这一轮有三个人。先看出身和征兆，武魂要等选定后才会揭晓。")],
      suggestions: [],
      relations: [],
      tasks: [],
      inventory: [],
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function rerollCandidates(game: StoredGame): void {
  const nextIndex = game.view.rerollIndex + 1;
  game.hiddenCandidates = generateCandidates(
    game.view.seed,
    nextIndex,
    game.view.candidates[0]?.gender ?? "男",
  );
  game.view.rerollIndex = nextIndex;
  game.view.candidates = game.hiddenCandidates.map((candidate) => candidate.public);
  game.view.selectedCandidateId = undefined;
  game.view.updatedAt = new Date().toISOString();
}

export function selectCandidate(game: StoredGame, candidateId: string): void {
  const candidate = game.hiddenCandidates.find((item) => item.public.id === candidateId);
  if (!candidate) throw new Error("候选角色不存在或已经失效");

  game.view.selectedCandidateId = candidateId;
  game.view.status = "awakening";
  game.view.location = candidate.public.location;
  game.view.worldTime = { era: candidate.public.eraRelation, day: 1, time: "08:00" };
  game.view.narrative = [createEntry("narration", buildAwakeningPrelude(candidate, game.personalityProfile))];
  game.view.suggestions = ["观察主持觉醒的魂师", "回想家人对今日的态度", "安静等待自己的名字被叫到"];
  game.view.updatedAt = new Date().toISOString();
}

function buildAwakeningPrelude(candidate: HiddenCandidate, profile: PersonalityProfile): string {
  const firstPersonOrigin = candidate.public.originSummary
    .replaceAll("你的", "我的")
    .replaceAll("你", "我");
  return [
    `天刚亮，${candidate.public.location}的石路还带着夜里的凉气。今天轮到六岁的孩子觉醒，门外已经挤了不少人。`,
    `我叫${candidate.public.name}，家里是${candidate.public.originName}。${firstPersonOrigin}`,
    `队伍一点点往前挪。主持仪式的魂师翻着名册，头也没抬。我把手藏进袖口，${profile.summary.includes("勇敢") ? "脚尖已经朝向阵法" : "指甲在掌心掐出一道浅印"}。`,
    "六块黑石摆在地上，边角磨得发亮。前一个孩子哭着跑出去。执事喊了我的名字。",
  ].join("\n\n");
}

export function awakenCharacter(game: StoredGame): CharacterPublic {
  const selected = game.hiddenCandidates.find(
    (candidate) => candidate.public.id === game.view.selectedCandidateId,
  );
  if (!selected) throw new Error("请先选择角色");

  const character: CharacterPublic = {
    ...selected.public,
    martialSoul: {
      name: selected.martialSoul.name,
      category: selected.martialSoul.category,
      description: selected.martialSoul.description,
    },
    innateSoulPower: selected.innateSoulPower,
    soulRank: selected.innateSoulPower,
    abilityDescriptors: {
      physique: selected.physique,
      spirit: selected.spirit,
      perception: selected.perception,
    },
    personalityTraits: game.personalityProfile.summary,
  };

  game.view.character = character;
  game.view.status = "playing";
  game.view.inventory = ["旧布包", "半日干粮"];
  game.view.relations = [
    { name: "家人", relation: "亲属", impression: "期待中带着担忧" },
    { name: "觉醒魂师", relation: "初识", impression: selected.innateSoulPower >= 7 ? "明显重视" : "公事公办" },
  ];
  game.view.tasks = selected.innateSoulPower > 0
    ? [{ title: "决定魂师之路", kind: "计划", detail: "了解武魂方向，并寻找适合自己的成长道路。" }]
    : [{ title: "理解觉醒结果", kind: "线索", detail: "没有显现先天魂力并不等于所有道路都已断绝。" }];
  game.view.narrative.push(createEntry("narration", buildAwakeningResult(selected)));
  game.view.suggestions = selected.innateSoulPower > 0
    ? ["询问我的先天魂力意味着什么", "观察家人与旁人的反应", "尝试第一次主动召唤武魂"]
    : ["追问是否存在重新检测的方法", "观察武魂本身还有没有异常", "先接受结果，回去查找其他道路"];
  game.view.updatedAt = new Date().toISOString();
  return character;
}

function buildAwakeningResult(candidate: HiddenCandidate): string {
  const powerText = candidate.innateSoulPower === 10
    ? "手一贴上水晶球，白光猛地涨开。执事抓住我的手腕又测了一次。先天满魂力。"
    : candidate.innateSoulPower > 0
      ? `水晶球亮了，刻度停在先天魂力 ${candidate.innateSoulPower} 级。执事低头记下数字。`
      : "水晶球一直没亮。执事等了两息，才把它从我手下抽走。";

  return [
    "我踩进六角阵。金色光点贴着小腿往上钻，皮肤又麻又痒。右手忽然一沉，我差点把胳膊甩出去。",
    `掌心里出现了${candidate.martialSoul.name}。${candidate.martialSoul.description}`,
    powerText,
    "门外有人踮脚往里看。家里人还不知道结果，我先听见自己喘了一口气。",
  ].join("\n\n");
}

export function publicView(game: StoredGame) {
  return game.view;
}
