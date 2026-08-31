import type { MartialSoulRarity, SoulBoneSlot } from "./game.js";

export type HeirloomEffectKind = "soulMasterLedger" | "seaVessel" | "foundationHerb" | "storageSoulTool" | "overlimitRing" | "crystalHerb" | "ringAssessment" | "flyingClaw" | "crossbow" | "livingStorage" | "causalReview" | "memoryAnchor";

export interface HeirloomDefinition {
  id: string;
  name: string;
  rarity: Extract<MartialSoulRarity, "紫色" | "金色" | "红色">;
  description: string;
  effect: string;
  trigger: string;
  effectKind: HeirloomEffectKind;
  actionCommand?: string;
  maxUses: number;
  drawWeight: number;
  summonable: boolean;
  legacyNames?: string[];
  soulBoneSkills?: Array<{ name: string; effect: string; actionCommand: string }>;
  soulBone?: {
    slot: SoulBoneSlot;
    years: number;
    fusionCommand: string;
    attributeBonuses: { physique: number; spirit: number; perception: number };
    skills: Array<{ name: string; effect: string; actionCommand: string; fatigueCost: number; cooldownActions: number; soulPowerCost: number }>;
  };
  provenance: "原著确认类别" | "原著具名唯一物" | "用户授权同人机缘" | "原著类别·同人具体魂骨";
  canonEvidence: string;
  canonImpact?: string;
  displacedOwnerNames?: string[];
  artifactMechanics?: { originEra: 1 | 2 | 3 | 4; durabilityMax: number; durabilityCost: number; ammoMax?: number; repairCost: number };
}

export const HEIRLOOMS: HeirloomDefinition[] = [
  { id: "heirloom-field-notes", name: "魂师手札", legacyNames: ["猎魂手记", "猎魂人实勘手记"], rarity: "紫色", description: "武魂殿为注册魂师建立的身份手札与编号记录。", effect: "每局最多领取3个月补贴：魂师每月1金魂币、大魂师10、魂尊及以上100；必须达到对应等级且每30天只能领取一次。", trigger: "凭魂师手札领取本月补贴", effectKind: "soulMasterLedger", actionCommand: "凭魂师手札领取本月补贴", provenance: "原著确认类别", canonEvidence: "斗一原文记载魂师注册、手札编号与分等级月补贴", maxUses: 3, drawWeight: 16, summonable: true },
  { id: "heirloom-worn-map", name: "龙渊艇", legacyNames: ["旧大陆行图", "魂师驿路总图"], rarity: "金色", description: "能够以魂力展开、容纳多人并在浅海航行和下潜的上古魂导器。", effect: "每局最多展开2次；下一次海上旅行耗时降低70%，并能抵挡一次不超过百年魂兽级别的环境攻击。深海和高阶海魂兽仍然危险。", trigger: "展开龙渊艇并进行海上旅行", effectKind: "seaVessel", actionCommand: "展开龙渊艇准备海上航行", provenance: "原著具名唯一物", canonEvidence: "斗一瀚海城拍卖场明确介绍龙渊艇的容量、下潜与防御边界", canonImpact: "原著中唐三在瀚海城拍得龙渊艇；玩家持有后，该所有权与后续海上路线必须改写", displacedOwnerNames: ["唐三"], artifactMechanics: { originEra: 1, durabilityMax: 100, durabilityCost: 20, repairCost: 80 }, maxUses: 2, drawWeight: 4, summonable: true },
  { id: "heirloom-meditation-bead", name: "九品紫芝", legacyNames: ["静心木珠", "拟态修炼室借用牌"], rarity: "金色", description: "具有固本培元、益气增功作用的极品灵芝，原著中帮助大师突破并持续提升。", effect: "每局一次，服用并炼化后获得120点训练进度、健康恢复至满、疲劳清零；不会越过魂环瓶颈，药效结算耗时一天。", trigger: "主动服用九品紫芝并完整炼化", effectKind: "foundationHerb", actionCommand: "服用九品紫芝并炼化药力", provenance: "原著具名唯一物", canonEvidence: "斗一原文明确九品紫芝固本培元、益气增功并帮助大师突破", canonImpact: "原著中九品紫芝由唐三交给大师；玩家持有后，大师的突破资源与后续实力时间线必须重算", displacedOwnerNames: ["唐三", "玉小刚", "大师"], maxUses: 1, drawWeight: 3, summonable: true },
  { id: "heirloom-trade-token", name: "小型储物魂导器", legacyNames: ["商路信牌", "商会预存金牌"], rarity: "紫色", description: "斗一时期罕见的传世储物魂导器，制作方法大多已经失传。", effect: "被动增加40点随身容量；只能存放死物，需要魂力完成存取，不能凭空减轻物品重量或装入活物。", trigger: "携带后持续生效", effectKind: "storageSoulTool", provenance: "原著确认类别", canonEvidence: "斗一原文通过二十四桥明月夜说明储物魂导器及其稀少性", artifactMechanics: { originEra: 1, durabilityMax: 80, durabilityCost: 0, repairCost: 40 }, maxUses: 1, drawWeight: 12, summonable: true },
  { id: "heirloom-sect-letter", name: "同人机缘·超限神赐魂环", legacyNames: ["无署名荐书", "高阶魂师引荐函"], rarity: "红色", description: "参考原著神赐魂环机制扩展出的用户授权同人机缘；不是海神考核奖励。", effect: "每局一次，在当前武魂达到十级瓶颈且缺少对应魂环时，按武魂品质、体魄、精神、血脉、魂骨与环位直接赋予超限魂环和适配魂技；第一魂环至少千年。", trigger: "当前主修武魂达到十级瓶颈且对应魂环槽为空", effectKind: "overlimitRing", actionCommand: "使用超限神赐魂环突破瓶颈", provenance: "用户授权同人机缘", canonEvidence: "原著确认神赐魂环无需猎杀且按承受能力赋予；超限倍数和开局抽取属于用户授权同人扩展", maxUses: 1, drawWeight: 0.45, summonable: true },
  { id: "heirloom-soul-lamp", name: "水晶血龙参", legacyNames: ["温魂灯芯", "战地治疗药匣"], rarity: "红色", description: "原著明确极其珍贵、药性霸道的水晶血龙参。", effect: "每局一次，服用并承受药力后清除普通伤势、健康回满、疲劳清零并获得180点训练进度；体魄不足者会进入三日药力适应期。", trigger: "主动服用水晶血龙参并有人护法", effectKind: "crystalHerb", actionCommand: "服用水晶血龙参", provenance: "原著具名唯一物", canonEvidence: "斗一原文明确水晶血龙参的品级、珍贵与霸道药性", canonImpact: "原著中水晶血龙参由白鹤交给唐三并影响小舞复生路线；玩家持有后该资源链必须重算", displacedOwnerNames: ["白鹤", "唐三", "小舞"], maxUses: 1, drawWeight: 0.55, summonable: true },
  { id: "heirloom-ring-ruler", name: "武魂殿猎魂森林手令", legacyNames: ["魂环量尺", "魂斗罗护环契"], rarity: "金色", description: "两份已核验的一次性低阶手令；圈养猎魂森林必须持武魂殿手令进入。", effect: "每局最多2次，在进入受管控低阶猎魂森林时提交一份手令；仍需瓶颈、成年同行者、补给与准备。手令不帮助吸收魂环。", trigger: "准备进入受管控猎魂森林且尚无入林凭证", effectKind: "ringAssessment", provenance: "原著确认类别", canonEvidence: "斗一原文明确猎魂森林手令、等级与担保/交回规则", maxUses: 2, drawWeight: 5, summonable: true },
  { id: "heirloom-oath-seal", name: "飞天神爪", legacyNames: ["守诺印泥", "双方誓约见证书"], rarity: "金色", description: "唐三制造的机械工具，能够抓取、攀爬并借钢索快速移动。", effect: "每局最多使用3次；战斗中可强制拉开距离或撤到可达掩体，非战斗中可跨越一次普通攀爬障碍。不能无视封锁、空间距离或高阶攻击。", trigger: "主动使用飞天神爪移动", effectKind: "flyingClaw", actionCommand: "使用飞天神爪快速移动", provenance: "原著具名唯一物", canonEvidence: "斗一原文展示飞天神爪的金属爪、钢索、抓取与辅助移动功能", canonImpact: "原著中飞天神爪由唐三制造并交给伙伴使用；玩家提前持有会改变唐三暗器制造与队伍装备线", displacedOwnerNames: ["唐三"], artifactMechanics: { originEra: 1, durabilityMax: 80, durabilityCost: 15, repairCost: 45 }, maxUses: 3, drawWeight: 3.5, summonable: true },
  { id: "heirloom-forge-core", name: "诸葛神弩", legacyNames: ["百炼炉心", "庚辛城材料保价契", "庚辛城备用材料匣"], rarity: "红色", description: "唐门机括类强力暗器，需要提前上好机璜并保留弩箭。", effect: "每局最多发射3次；战斗中造成高额穿透伤害，对魂力差距过大的高阶防御者仍可能无效。用尽后需要真实材料和工艺重新装填。", trigger: "战斗中使用已上机璜的诸葛神弩", effectKind: "crossbow", actionCommand: "发射诸葛神弩", provenance: "原著具名唯一物", canonEvidence: "斗一原文多次说明诸葛神弩的机括、上弦、威力与对强者的限制", canonImpact: "原著中诸葛神弩由唐三依据前世唐门知识制造；玩家提前持有会改变暗器技术扩散和唐三装备线", displacedOwnerNames: ["唐三"], artifactMechanics: { originEra: 1, durabilityMax: 70, durabilityCost: 8, ammoMax: 3, repairCost: 60 }, maxUses: 3, drawWeight: 0.75, summonable: true },
  { id: "heirloom-star-compass", name: "如意百宝囊", legacyNames: ["星痕罗盘", "飞行魂师护送契"], rarity: "红色", description: "能够储存活物的特殊魂导器，原著中由独孤博送给唐三。", effect: "被动增加80点特殊储存容量，可保存活体植物与小型生命；不能绕过收服、同意、空气、食物和体型限制。", trigger: "携带后持续生效", effectKind: "livingStorage", provenance: "原著具名唯一物", canonEvidence: "斗一原文明确如意百宝囊与普通储物魂导器不同，可以装活物", canonImpact: "原著中独孤博将其送给唐三；玩家持有后，唐三与独孤博的赠礼、人情和小舞携带路线必须改写", displacedOwnerNames: ["独孤博", "唐三", "小舞"], artifactMechanics: { originEra: 1, durabilityMax: 100, durabilityCost: 0, repairCost: 100 }, maxUses: 1, drawWeight: 0.6, summonable: true },
  { id: "heirloom-causal-thread", name: "外附魂骨·护心甲", legacyNames: ["因果残线"], rarity: "红色", description: "原著外附魂骨类别下的同人具体魂骨，必须先融合。", effect: "融合后体魄+18、精神+4；魂技“护心骨甲”每局3次，魂力35、疲劳25、冷却5次行动，抵消一次非死亡重创的新增身体损伤。", trigger: "先融合魂骨，再发动护心骨甲", effectKind: "causalReview", actionCommand: "融合外附魂骨·护心甲", soulBoneSkills: [{ name: "护心骨甲", effect: "骨甲包覆躯干与经脉，抵消下一次非死亡重创造成的新增身体损伤；不抵消战斗结果。", actionCommand: "发动外附魂骨护住下一次重创" }], soulBone: { slot: "外附", years: 30000, fusionCommand: "融合外附魂骨·护心甲", attributeBonuses: { physique: 18, spirit: 4, perception: 2 }, skills: [{ name: "护心骨甲", effect: "骨甲包覆躯干与经脉，抵消下一次非死亡重创造成的新增身体损伤；不抵消战斗结果。", actionCommand: "发动外附魂骨护住下一次重创", fatigueCost: 25, cooldownActions: 5, soulPowerCost: 35 }] }, provenance: "原著类别·同人具体魂骨", canonEvidence: "原著确认外附魂骨独立于正常六部位并能带来强大魂骨技能", maxUses: 3, drawWeight: 0.8, summonable: true },
  { id: "heirloom-time-anchor", name: "万年头部魂骨·凝神", legacyNames: ["岁月锚钉"], rarity: "红色", description: "原著头部魂骨类别下的同人具体魂骨，必须先融合。", effect: "融合后精神+20、感知+16；魂技“凝神增幅”每局3次，魂力30、疲劳20、冷却3次行动，每次强化随后5次有效成长，每次+25。", trigger: "先融合魂骨，再发动凝神增幅", effectKind: "memoryAnchor", actionCommand: "融合万年头部魂骨·凝神", soulBoneSkills: [{ name: "凝神增幅", effect: "五次有效成长中保持高度专注，每次获得25点对应成长；不缩短真实时间。", actionCommand: "发动凝神魂骨技强化五次成长" }], soulBone: { slot: "头部", years: 10000, fusionCommand: "融合万年头部魂骨·凝神", attributeBonuses: { physique: 2, spirit: 20, perception: 16 }, skills: [{ name: "凝神增幅", effect: "五次有效成长中保持高度专注，每次获得25点对应成长；不缩短真实时间。", actionCommand: "发动凝神魂骨技强化五次成长", fatigueCost: 20, cooldownActions: 3, soulPowerCost: 30 }] }, provenance: "原著类别·同人具体魂骨", canonEvidence: "原著确认头部魂骨珍贵并可附带、发动魂骨技能", maxUses: 3, drawWeight: 0.6, summonable: true },
  { id: "heirloom-old-hunt-notes", name: "旧猎魂笔记", rarity: "紫色", description: "旧版本兼容条目，不进入新召唤池。", effect: "保留旧存档读取，不作为当前原著遗物设计。", trigger: "旧存档兼容", effectKind: "soulMasterLedger", provenance: "用户授权同人机缘", canonEvidence: "兼容旧存档，不宣称原著实体", maxUses: 0, drawWeight: 0, summonable: false },
];

export function heirloomByName(name?: string): HeirloomDefinition | undefined {
  return HEIRLOOMS.find((item) => item.name === name || item.legacyNames?.includes(name ?? ""));
}

export function currentHeirloomName(name?: string): string | undefined {
  return heirloomByName(name)?.name ?? name;
}
