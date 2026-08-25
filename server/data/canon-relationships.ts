import type { GameEra } from "../../shared/game.js";

export interface CanonRelationshipDefinition {
  id: string;
  era: GameEra;
  fromId: string;
  toId: string;
  validFromYear: number;
  validFromDay?: number;
  validUntilYear?: number;
  relation: string;
  basis: string;
  dynamics: string;
  boundary: string;
  importance: number;
}

export const CANON_RELATIONSHIPS: CanonRelationshipDefinition[] = [
  { id: "tangsan-xiaowu-notting", era: 1, fromId: "tang-san", toId: "xiao-wu", validFromYear: 0, validFromDay: 20, relation: "诺丁同学、结义兄妹，后来形成深厚感情", basis: "共同生活、并肩修炼与多次互相保护", dynamics: "唐三偏克制照料，小舞更直接维护；双方都会因对方受威胁而改变计划", boundary: "初见不自动信任，关系必须随共同经历推进；玩家介入可能改变相处密度和选择", importance: 1 },
  { id: "tangsan-yuxiaogang", era: 1, fromId: "tang-san", toId: "yu-xiaogang", validFromYear: 0, validFromDay: 20, relation: "师徒", basis: "理论判断、正式拜师与长期培养", dynamics: "玉小刚以理论和训练负责，唐三重视师恩但仍保留自己的秘密与判断", boundary: "导师有建议和训练权，不拥有主角全部秘密或人生决定权", importance: 1 },
  { id: "tangsan-tanghao", era: 1, fromId: "tang-san", toId: "tang-hao", validFromYear: -6, relation: "父子", basis: "血缘、抚养与阿银旧事", dynamics: "唐昊沉默自责却高度护短，唐三重情并试图理解父亲隐瞒", boundary: "亲情不消除信息差、旧伤和宗门责任", importance: 1 },
  { id: "tanghao-ayin", era: 1, fromId: "tang-hao", toId: "a-yin", validFromYear: -20, relation: "伴侣", basis: "长期相伴、共同面对武魂殿追杀与献祭后果", dynamics: "唐昊的隐居、自责和保护唐三均受这段关系影响", boundary: "阿银的恢复受生命状态和资源限制，不能靠感情直接复原", importance: 1 },
  { id: "ning-rongrong-ning-fengzhi", era: 1, fromId: "ning-rongrong", toId: "ning-fengzhi", validFromYear: -6, relation: "父女", basis: "血缘、宗门继承与长期宠爱", dynamics: "宁风致疼爱女儿，同时必须考虑宗门继承、辅助系保护与政治利益", boundary: "父爱不等于允许女儿无视宗门安全和继承责任", importance: .92 },
  { id: "ning-rongrong-chenxin", era: 1, fromId: "ning-rongrong", toId: "chen-xin", validFromYear: -6, relation: "受长辈宠爱的宗门晚辈", basis: "七宝琉璃宗共同生活与尘心长期保护", dynamics: "尘心对宁荣荣护短，但在剑道、危险和宗门存亡上有自己的判断", boundary: "护短不等于对所有朋友无条件提供封号斗罗力量", importance: .86 },
  { id: "dai-zhu-competition", era: 1, fromId: "dai-mubai", toId: "zhu-zhuqing", validFromYear: -7, relation: "皇室婚约与共同生存竞争者", basis: "星罗皇室和朱家竞争制度", dynamics: "关系同时包含责任、失望、吸引、竞争压力和共同逃离淘汰命运的利益", boundary: "婚约不自动产生爱情或原谅，修复需要行动和共同承担", importance: .94 },
  { id: "oscar-rongrong", era: 1, fromId: "ao-si-ka", toId: "ning-rongrong", validFromYear: 6, relation: "同学、追求与后来伴侣方向", basis: "史莱克共同训练、战斗和奥斯卡为缩小差距付出的长期行动", dynamics: "身份与战力差距形成现实门槛，宁荣荣的认可来自长期可靠性而非一次表白", boundary: "感情可被玩家因果改变，不因原著配对强制成立", importance: .85 },
  { id: "bibi-qianrenxue", era: 1, fromId: "bibi-dong", toId: "qian-renxue", validFromYear: -15, relation: "母女与权力冲突", basis: "血缘、创伤、天使传承和武魂殿权力结构", dynamics: "关系包含排斥、控制、期待、怨恨与难以直接表达的亲情", boundary: "不能压缩成单纯仇恨或无条件母爱，双方都有独立政治目标", importance: 1 },
  { id: "daming-erming-xiaowu", era: 1, fromId: "da-ming", toId: "xiao-wu", validFromYear: -100, relation: "魂兽族群亲友与保护者", basis: "星斗核心区长期共同生活", dynamics: "大明沉稳评估风险，二明更直接护卫；对人类和小舞选择的态度并不完全相同", boundary: "保护小舞不代表信任所有与她亲近的人类", importance: .92 },
  { id: "erming-xiaowu", era: 1, fromId: "er-ming", toId: "xiao-wu", validFromYear: -100, relation: "魂兽族群亲友与直接保护者", basis: "星斗核心区长期共同生活", dynamics: "二明表达更直接、更容易用行动驱逐威胁，也会尊重小舞已经明确作出的选择", boundary: "保护小舞不代表信任所有人类，也不能替小舞决定全部关系", importance: .92 },
  { id: "huo-wu-feng-xiaotian", era: 1, fromId: "huo-wu", toId: "feng-xiaotian", validFromYear: 7, relation: "学院竞争、单向追求与后续理解", basis: "五元素学院竞争及风笑天长期关注", dynamics: "火舞重视胜负和自尊，风笑天会为她改变战术但也有自己的队长责任", boundary: "追求和让赛不保证得到感情认可", importance: .72 },
  { id: "d2-yuhao-tianmeng", era: 2, fromId: "huo-yuhao", toId: "tian-meng", validFromYear: 10000, relation: "魂灵式共生伙伴与引路者", basis: "精神本源结合、共同求生和利益绑定", dynamics: "天梦机灵惜命并主动规划，霍雨浩获得帮助同时承担暴露与承载风险", boundary: "天梦提供知识和能力来源，不替霍雨浩完成修炼与人生选择", importance: 1 },
  { id: "d2-yuhao-wangdonger", era: 2, fromId: "huo-yuhao", toId: "tang-wutong", validFromYear: 10000, relation: "以王冬身份相识的同学、室友、战斗搭档与感情发展", basis: "长期共同学习、武魂融合与生死经历", dynamics: "关系从摩擦、竞争和信任逐步变化，不是见面即命定亲密", boundary: "身份秘密与外部安排会制造真实信息差，玩家因果可以改变进程", importance: 1 },
  { id: "d2-beibei-tangya", era: 2, fromId: "bei-bei", toId: "tang-ya", validFromYear: 9998, relation: "伴侣方向与唐门共同责任", basis: "共同维持衰落唐门及长期感情", dynamics: "贝贝的温和与承担、唐雅的复兴压力和失控风险同时影响关系", boundary: "感情不能替代宗门资源、伤势与邪化问题的解决", importance: .88 },
  { id: "d2-xuanshui-shrek", era: 2, fromId: "xuan-lao", toId: "huo-yuhao", validFromYear: 10002, relation: "学院长辈与重点学生", basis: "史莱克培养、天赋评估与共同危机", dynamics: "玄老会保护和指导，也受学院责任、旧日失败与大陆局势约束", boundary: "重视不等于跳过学院考核或无条件提供最高资源", importance: .82 },
  { id: "d3-wulin-gu-yue", era: 3, fromId: "tang-wulin", toId: "gu-yue-na", validFromYear: 20000, relation: "同学、战斗伙伴与跨阵营感情核心", basis: "长期并肩成长、武魂与血脉共鸣、共同团队经历", dynamics: "个人感情与魂兽族群、银龙王身份和人类世界责任持续冲突", boundary: "感情不能自动消除阵营目标和身份秘密，选择可以被玩家因果改变", importance: 1 },
  { id: "d3-shrek-team", era: 3, fromId: "tang-wulin", toId: "xie-xie", validFromYear: 20000, relation: "同学、队友与长期伙伴", basis: "共同训练、冲突磨合和固定队伍战斗", dynamics: "谢邂有自己的自尊、感情和敏攻路线，不只是主角的随从", boundary: "队友可以不同意主角、失败或优先处理自己的关系责任", importance: .82 },
  { id: "d4-xuanyu-xiuxiu", era: 4, fromId: "lan-xuanyu", toId: "bai-xiuxiu", validFromYear: 30000, relation: "同学、队友与感情发展", basis: "共同训练、龙神血脉相关经历和星际任务", dynamics: "亲近与各自身份、族群记忆和战斗责任同时存在", boundary: "感情不能替代星际任务、团队职责或血脉风险", importance: .92 },
  { id: "d4-xuanyu-nana", era: 4, fromId: "lan-xuanyu", toId: "na-na-teacher", validFromYear: 30000, relation: "学生与重要引导者", basis: "武魂指导、血脉共鸣与持续保护", dynamics: "娜娜会保护并指导，但自身记忆、身份和力量状态限制其表达", boundary: "未核验前任何人物不能据此推断隐藏血缘，指导不等于替代家庭和学院", importance: 1 },
  { id: "d4-xuanyu-parents", era: 4, fromId: "lan-xuanyu", toId: "lan-xiao", validFromYear: 29994, relation: "养育家庭中的父子", basis: "长期抚养、研究背景与真实家庭生活", dynamics: "父母会在安全、教育、研究伦理和孩子选择之间权衡", boundary: "爱护不等于公开全部秘密，也不等于能调动军方或学院最高资源", importance: .88 },
];
