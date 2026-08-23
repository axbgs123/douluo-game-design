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
  locations: string[];
  preferredCategories: string[];
  weight: number;
}

const SURNAMES = ["林", "苏", "顾", "沈", "陆", "叶", "程", "江", "白", "宁", "周", "秦"];
const GIVEN_NAMES = ["川", "宁", "昭", "砚", "澜", "遥", "清", "越", "衡", "棠", "烬", "青", "禾", "微"];

const ORIGINS: OriginTemplate[] = [
  {
    id: "village-farmer",
    name: "偏远村庄的农户之子",
    summary: "家中薄田勉强度日，附近武魂分殿每年只来一次。你熟悉土地、季节和贫穷的分量。",
    locations: ["天斗帝国西南的无名村落", "诺丁城辖下的河谷村", "法斯诺行省北缘村镇"],
    preferredCategories: ["植物", "器武魂", "兽武魂"],
    weight: 22,
  },
  {
    id: "smith-family",
    name: "小城铁匠家庭",
    summary: "炉火、铁屑和欠账构成了你的童年。家里相信一门手艺比空想可靠。",
    locations: ["诺丁城南区", "索托城外的工匠街", "星罗北境的军需镇"],
    preferredCategories: ["器武魂", "本体武魂"],
    weight: 15,
  },
  {
    id: "border-guard",
    name: "边境巡守之家",
    summary: "你从小听着军号和商队传闻长大，家中有人懂得辨路、守夜与在危险前闭嘴。",
    locations: ["天斗与星罗交界哨镇", "星罗帝国西北边堡", "巴拉克王国边境"],
    preferredCategories: ["兽武魂", "器武魂"],
    weight: 13,
  },
  {
    id: "herbalist",
    name: "采药人的孩子",
    summary: "你认识常见药草，也知道森林从不因为一个孩子而变得仁慈。",
    locations: ["落日森林外围聚落", "猎魂森林补给镇", "天斗南部丘陵"],
    preferredCategories: ["植物", "本体武魂"],
    weight: 14,
  },
  {
    id: "fallen-clan",
    name: "没落魂师家族旁支",
    summary: "旧宅里还留着先祖画像，但值钱的东西已经所剩无几。家人对你的觉醒抱有不愿承认的期待。",
    locations: ["天斗城远郊", "索托城旧城区", "星罗帝国一座衰落封地"],
    preferredCategories: ["器武魂", "兽武魂", "植物"],
    weight: 10,
  },
  {
    id: "temple-clerk",
    name: "武魂殿基层人员家庭",
    summary: "你见过更多觉醒仪式，也比同龄人更早明白天赋会怎样改变一个人的待遇。",
    locations: ["诺丁城武魂分殿附近", "天斗东部主城", "星罗南部行省城"],
    preferredCategories: ["器武魂", "兽武魂", "本体武魂"],
    weight: 9,
  },
  {
    id: "merchant-caravan",
    name: "流动商队的孩子",
    summary: "道路是你的故乡。你会算零钱、辨口音，也见过消息如何比货物更值钱。",
    locations: ["前往索托城的商路", "天斗帝国中央商道", "星罗北境驿站"],
    preferredCategories: ["器武魂", "兽武魂"],
    weight: 10,
  },
  {
    id: "mystery-arrival",
    name: "来历成谜的养子",
    summary: "六年前，有人在异常天象后的荒野中发现了你。养父母从不愿详谈那一夜。",
    locations: ["落日森林以东的村落", "星斗大森林外围小镇", "海边的偏僻渔村"],
    preferredCategories: ["器武魂", "本体武魂", "植物"],
    weight: 3,
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
    const offset = integer(random, -120, 24);
    const innateSoulPower = integer(random, soul.soulPowerRange[0], soul.soulPowerRange[1]);
    const name = generateName(random);
    const candidate: CandidatePublic = {
      id: `${rerollIndex}-${index}-${Math.floor(random() * 1_000_000).toString(36)}`,
      name,
      gender,
      eraRelation: eraRelation(offset),
      location: pick(random, origin.locations),
      originName: origin.name,
      originSummary: origin.summary,
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
      narrative: [createEntry("system", "命运尚未落笔。三段人生在你面前展开，但武魂仍藏在觉醒日的光芒之后。")],
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
    `六岁这一年的觉醒日，${candidate.public.location}比往常醒得更早。`,
    `我叫${candidate.public.name}，出身于${candidate.public.originName}。${firstPersonOrigin}`,
    `人群缓慢向前移动。主持仪式的魂师没有多看我一眼，而我把手指藏进袖口，压住了${profile.summary.includes("勇敢") ? "想要立刻上前的冲动" : "不愿被旁人看见的紧张"}。`,
    "黑色石块在地面排成六角，淡金色光点悬在其中。再过片刻，就轮到我走进阵法。我的武魂是什么，没有人知道。",
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
    ? "水晶球骤然亮起，光芒几乎填满整个掌心——先天满魂力。"
    : candidate.innateSoulPower > 0
      ? `水晶球中升起清晰的光，刻度停在先天魂力 ${candidate.innateSoulPower} 级。`
      : "水晶球没有显出可辨认的魂力光芒。四周短暂安静下来。";

  return [
    "我走进六角阵，温热的金色光点从脚边升起，像被无形的风推入身体。掌心先是一沉，随后有什么东西挣脱了沉睡。",
    `那是我的武魂——${candidate.martialSoul.name}。${candidate.martialSoul.description}`,
    powerText,
    "旁人的目光发生了变化，但觉醒只给出了起点。它没有替我决定要成为怎样的人。",
  ].join("\n\n");
}

export function publicView(game: StoredGame) {
  return game.view;
}
