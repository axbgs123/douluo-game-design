import type { GameEra } from "../../shared/game.js";

export interface WorldSocialLaw {
  id: string;
  era: GameEra | 0;
  category: "历史惯性" | "人物自主" | "人际关系" | "势力制度" | "资源生活" | "信息传播";
  importance: number;
  text: string;
}

export const WORLD_SOCIAL_LAWS: WorldSocialLaw[] = [
  { id: "canon-inertia", era: 0, category: "历史惯性", importance: 1, text: "重要原著事件在没有玩家因果足迹时保持时间、参与者和主要结果惯性；玩家若通过接触人物、影响势力、改变资源或直接介入形成充分因果，事件必须从新状态重新推演，而不是强行回到原著。" },
  { id: "local-autonomy", era: 0, category: "历史惯性", importance: .94, text: "普通人物、地方关系、市场资源、委托和小型冲突不等待玩家触发，会根据时间、地点、职业、利益和已有关系自主变化；这些变化不能无证据改写远方重要事件。" },
  { id: "npc-own-day", era: 0, category: "人物自主", importance: .96, text: "每个具名人物在主角出现前都有当天原本要完成的工作、训练、照料、巡查、交易或私人安排。主角只能打断、帮助、交换或阻碍，不能让对方无事可做地等候。" },
  { id: "personality-is-inertia", era: 0, category: "人物自主", importance: .98, text: "性格是行为倾向而非固定台词。人物在不同年龄、实力、职位、伤势、关系与风险下会使用不同手段，但其重视之物、底线、偏见和惯常判断应连续存在，除非经历足以改变它。" },
  { id: "goal-before-plot", era: 0, category: "人物自主", importance: .96, text: "人物先维护自己的目标、家人、宗门职责、名誉与生存，再考虑帮助主角。原著人物不会因为主角是玩家就主动提供机缘、秘密、收徒名额或忠诚。" },
  { id: "knowledge-boundary", era: 0, category: "人物自主", importance: 1, text: "人物只能根据亲历、被告知、职责档案、可靠调查或公开传闻行动。未公开武魂、血脉、系统、未来事件和远方秘密不得通过直觉被精确识破。" },
  { id: "relationship-evidence", era: 0, category: "人际关系", importance: 1, text: "友情、信任、尊重、敌意与亲密必须由共同经历、履约、利益交换、救助、伤害或长期相处形成。高天赋、高身份和送礼只能提高接触机会，不能自动生成好感。" },
  { id: "relationship-multidimensional", era: 0, category: "人际关系", importance: .93, text: "同一关系可以同时包含亲近、信任、敬重、警惕、利益、亏欠、嫉妒与竞争。人物可以喜欢主角但不同意其决定，也可以合作却不信任。" },
  { id: "favor-is-debt", era: 0, category: "人际关系", importance: .9, text: "帮助会形成可追踪的人情、承诺或立场成本。受助者按性格可能感激、羞耻、警惕或急于偿还；恩情不等于永久服从。" },
  { id: "conflict-memory", era: 0, category: "人际关系", importance: .92, text: "公开羞辱、欺骗、失约、夺取机缘和伤害亲友会留下记忆与社会痕迹。道歉需要承认具体伤害，关系修复需要时间、赔偿或新的可靠行为。" },
  { id: "romance-slow", era: 0, category: "人际关系", importance: .98, text: "感情关系必须服从年龄、共同经历、双方同意、现实处境和原有关系。救命、强大、婚约、原著配对或玩家主动追求都不能直接推导爱情。" },
  { id: "family-first-pressure", era: 0, category: "人际关系", importance: .9, text: "家人与监护人会同时考虑安全、生计、家族名声和培养前途。关心可能表现为阻止、隐瞒、谈条件或要求回报，而不总是无条件支持。" },
  { id: "authority-has-scope", era: 0, category: "势力制度", importance: 1, text: "学院老师、宗门长老、武魂殿执事、贵族、军官和商会负责人各有权限边界。能推荐不等于能录取，能上报不等于能处分，能保护不等于能抹去档案。" },
  { id: "institution-self-interest", era: 0, category: "势力制度", importance: .98, text: "势力投入培养、保护、情报和稀缺资源时会评估回报、忠诚、派系、风险与声誉。天才会引来复测、登记、谈判、争夺与监视，而不是免费获得全部资源。" },
  { id: "record-leaves-trace", era: 0, category: "势力制度", importance: .94, text: "觉醒、入学、猎魂凭证、宗门身份、军籍、交易和违法行为会留下名册、见证人、账目或责任人。想隐瞒必须在记录形成前行动，并承担失败后果。" },
  { id: "minor-guardian", era: 0, category: "势力制度", importance: 1, text: "未成年角色不能无成本独自跨城、签长期契约、进入危险猎魂区或调动家族资产。需要监护、见证、路费、凭证或具体帮助者。" },
  { id: "rare-resource-cost", era: 0, category: "资源生活", importance: 1, text: "魂环、魂骨、拟态场、魂导材料、导师时间、舰船和高阶情报越稀缺，获得流程和交换条件越具体。珍贵资源不能只因一句请求或一次惊叹出现。" },
  { id: "daily-life-grounding", era: 0, category: "资源生活", importance: .92, text: "修炼之外仍有吃住、衣物、路费、课程、工作、照料、伤病和天气。身份与实力改变后，这些日常待遇应可见地变化，形成真正生活在大陆上的感觉。" },
  { id: "market-local", era: 0, category: "资源生活", importance: .86, text: "地方价格、工作、材料和运输受季节、治安、事件、道路与势力控制影响。远方发生大事不会立刻同步改变所有市场，消息和货物都需要传播时间。" },
  { id: "witness-rumor", era: 0, category: "信息传播", importance: .96, text: "事件先由目击者形成带立场的说法，再通过亲属、同门、商旅、告示或当代传播机构扩散。无人目击且没有记录的秘密行动不能自动成为公共消息。" },
  { id: "rumor-distortion", era: 0, category: "信息传播", importance: .88, text: "传闻会遗漏条件、夸大结果或混淆身份。人物根据信源可靠度、与当事人的关系和自身利益决定相信、求证、利用还是沉默。" },
  { id: "d1-awakening-network", era: 1, category: "势力制度", importance: .96, text: "斗一基层公共觉醒依赖武魂殿巡查网络与地方组织；宗门、家族和皇室内部由实际控制名册与培养资源的人主持或监督。" },
  { id: "d1-early-communication", era: 1, category: "信息传播", importance: .9, text: "斗一地方消息主要依靠口耳、告示、信使、商旅和势力通告传播，不生成现代记者、编辑部或实时公共信息网。" },
  { id: "d2-spirit-tool-cost", era: 2, category: "资源生活", importance: .9, text: "斗二魂导器与魂灵相关知识受学院、帝国、研究机构、材料和年代阶段限制。理解概念不等于有图纸、设备、实验资格或成熟服务。" },
  { id: "d3-federal-audit", era: 3, category: "势力制度", importance: .9, text: "斗三传灵塔、学院、联邦、唐门等现代机构拥有实名记录、审计与分级资格；便利通常伴随可追踪的数据、合同和组织责任。" },
  { id: "d4-space-logistics", era: 4, category: "资源生活", importance: .96, text: "斗四跨星球行动依赖船票或舰船、驾驶与指挥资质、船员、燃料、补给和航线许可。个人实力不能替代完整的星际后勤。" },
];
