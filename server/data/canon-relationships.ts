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
  { id: "tangsan-xiaowu-notting", era: 1, fromId: "tang-san", toId: "xiao-wu", validFromYear: 0, validFromDay: 31, relation: "诺丁同学与刚建立的结义兄妹关系", basis: "七舍相识、冲突后的同学生活与当时已经发生的结义", dynamics: "唐三偏克制，小舞表达更直接；此时信任仍需通过共同生活形成", boundary: "当前只按同学、结义和已经发生的共同生活处理关系", importance: 1 },
  { id: "tangsan-yuxiaogang", era: 1, fromId: "tang-san", toId: "yu-xiaogang", validFromYear: 0, validFromDay: 32, relation: "刚正式建立的师徒关系", basis: "玉小刚完成当时的理论判断，唐三已经作出拜师选择", dynamics: "玉小刚开始承担理论与训练责任，唐三仍保留自己的秘密与判断", boundary: "导师有建议和训练权，不拥有学生全部秘密或人生决定权", importance: 1 },
  { id: "tangsan-tanghao", era: 1, fromId: "tang-san", toId: "tang-hao", validFromYear: -6, relation: "父子", basis: "血缘、抚养与阿银旧事", dynamics: "唐昊沉默自责却高度护短，唐三重情并试图理解父亲隐瞒", boundary: "亲情不消除信息差、旧伤和宗门责任", importance: 1 },
  { id: "tanghao-ayin", era: 1, fromId: "tang-hao", toId: "a-yin", validFromYear: -20, relation: "伴侣", basis: "长期相伴、共同面对武魂殿追杀与献祭后果", dynamics: "唐昊的隐居、自责和保护唐三均受这段关系影响", boundary: "阿银的恢复受生命状态和资源限制，不能靠感情直接复原", importance: 1 },
  { id: "ning-rongrong-ning-fengzhi", era: 1, fromId: "ning-rongrong", toId: "ning-fengzhi", validFromYear: -6, relation: "父女", basis: "血缘、宗门继承与长期宠爱", dynamics: "宁风致疼爱女儿，同时必须考虑宗门继承、辅助系保护与政治利益", boundary: "父爱不等于允许女儿无视宗门安全和继承责任", importance: .92 },
  { id: "ning-rongrong-chenxin", era: 1, fromId: "ning-rongrong", toId: "chen-xin", validFromYear: -6, relation: "受长辈宠爱的宗门晚辈", basis: "七宝琉璃宗共同生活与尘心长期保护", dynamics: "尘心对宁荣荣护短，但在剑道、危险和宗门存亡上有自己的判断", boundary: "护短不等于对所有朋友无条件提供封号斗罗力量", importance: .86 },
  { id: "dai-zhu-competition", era: 1, fromId: "dai-mubai", toId: "zhu-zhuqing", validFromYear: -7, relation: "皇室婚约与共同生存竞争者", basis: "星罗皇室和朱家竞争制度", dynamics: "关系同时包含责任、失望、吸引、竞争压力和共同逃离淘汰命运的利益", boundary: "婚约不自动产生爱情或原谅，修复需要行动和共同承担", importance: .94 },
  { id: "oscar-rongrong", era: 1, fromId: "ao-si-ka", toId: "ning-rongrong", validFromYear: 6, relation: "刚进入史莱克后的同学关系", basis: "同校训练与已经发生的日常接触", dynamics: "身份、性格和战力差距会影响两人当前判断", boundary: "当前只使用同学接触、训练表现和已经表达的态度", importance: .85 },
  { id: "bibi-qianrenxue", era: 1, fromId: "bibi-dong", toId: "qian-renxue", validFromYear: -15, relation: "母女与权力冲突", basis: "血缘、创伤、天使传承和武魂殿权力结构", dynamics: "关系包含排斥、控制、期待、怨恨与难以直接表达的亲情", boundary: "不能压缩成单纯仇恨或无条件母爱，双方都有独立政治目标", importance: 1 },
  { id: "daming-erming-xiaowu", era: 1, fromId: "da-ming", toId: "xiao-wu", validFromYear: -100, relation: "魂兽族群亲友与保护者", basis: "星斗核心区长期共同生活", dynamics: "大明沉稳评估风险，二明更直接护卫；对人类和小舞选择的态度并不完全相同", boundary: "保护小舞不代表信任所有与她亲近的人类", importance: .92 },
  { id: "erming-xiaowu", era: 1, fromId: "er-ming", toId: "xiao-wu", validFromYear: -100, relation: "魂兽族群亲友与直接保护者", basis: "星斗核心区长期共同生活", dynamics: "二明表达更直接、更容易用行动驱逐威胁，也会尊重小舞已经明确作出的选择", boundary: "保护小舞不代表信任所有人类，也不能替小舞决定全部关系", importance: .92 },
  { id: "huo-wu-feng-xiaotian", era: 1, fromId: "huo-wu", toId: "feng-xiaotian", validFromYear: 7, relation: "五元素学院之间的竞争与风笑天单向关注", basis: "当时已经形成的学院往来和个人关注", dynamics: "火舞重视胜负和自尊，风笑天也有自己的队长责任", boundary: "当前只依据学院竞争、队长责任和已经表达的个人关注行动", importance: .72 },
  { id: "d2-yuhao-tianmeng", era: 2, fromId: "huo-yuhao", toId: "tian-meng", validFromYear: 10000, relation: "魂灵式共生伙伴与引路者", basis: "精神本源结合、共同求生和利益绑定", dynamics: "天梦机灵惜命并主动规划，霍雨浩获得帮助同时承担暴露与承载风险", boundary: "天梦提供知识和能力来源，不替霍雨浩完成修炼与人生选择", importance: 1 },
  { id: "d2-yuhao-wangdonger", era: 2, fromId: "huo-yuhao", toId: "tang-wutong", validFromYear: 10000, validFromDay: 30, relation: "霍雨浩与王冬刚建立的同学、室友关系", basis: "史莱克入学和宿舍相处已经发生的接触", dynamics: "关系从摩擦和竞争开始，信任必须由共同学习形成", boundary: "当前只使用王冬公开身份、室友相处和已经发生的共同经历", importance: 1 },
  { id: "d2-beibei-tangya", era: 2, fromId: "bei-bei", toId: "tang-ya", validFromYear: 9998, relation: "伴侣方向与唐门共同责任", basis: "共同维持衰落唐门及长期感情", dynamics: "贝贝的温和与承担、唐雅的复兴压力和失控风险同时影响关系", boundary: "感情不能替代宗门资源、伤势与邪化问题的解决", importance: .88 },
  { id: "d2-xuanshui-shrek", era: 2, fromId: "xuan-lao", toId: "huo-yuhao", validFromYear: 10002, relation: "学院长辈与重点学生", basis: "史莱克培养、天赋评估与共同危机", dynamics: "玄老会保护和指导，也受学院责任、旧日失败与大陆局势约束", boundary: "重视不等于跳过学院考核或无条件提供最高资源", importance: .82 },
  { id: "d3-wulin-gu-yue", era: 3, fromId: "tang-wulin", toId: "gu-yue-na", validFromYear: 20003, relation: "唐舞麟与古月在东海学院零班建立的同学、队友关系", basis: "零班组建、训练和当时已经发生的团队接触", dynamics: "两人都有独立训练目标，并只按彼此公开表现判断对方", boundary: "当前只使用古月公开身份、零班训练和已经形成的队友关系", importance: 1 },
  { id: "d3-shrek-team", era: 3, fromId: "tang-wulin", toId: "xie-xie", validFromYear: 20003, relation: "东海学院零班同学与队友", basis: "共同训练、冲突磨合和当前团队战斗", dynamics: "谢邂有自己的自尊和敏攻路线，不只是主角的随从", boundary: "当前只使用零班同学、队友和已经完成的共同训练", importance: .82 },
  { id: "d4-xuanyu-xiuxiu", era: 4, fromId: "lan-xuanyu", toId: "bai-xiuxiu", validFromYear: 30001, relation: "蓝轩宇与冻千秋刚建立的同龄人接触", basis: "高能少年班阶段已经发生的召唤、训练或交流", dynamics: "双方仍以当前公开身份判断彼此，亲近需要实际共同经历", boundary: "当前只使用公开姓名、训练接触和已经形成的同龄人印象", importance: .92 },
  { id: "d4-xuanyu-nana", era: 4, fromId: "lan-xuanyu", toId: "na-na-teacher", validFromYear: 30001, relation: "学生与武魂指导者", basis: "当时已经发生的武魂指导与训练接触", dynamics: "娜娜可以指导和保护，但只使用自己当前能够确认的记忆与关系", boundary: "指导者只承担已经建立的教学和保护责任，不替代家庭与学院", importance: 1 },
  { id: "d4-xuanyu-parents", era: 4, fromId: "lan-xuanyu", toId: "lan-xiao", validFromYear: 29994, relation: "养育家庭中的父子", basis: "长期抚养、研究背景与真实家庭生活", dynamics: "父母会在安全、教育、研究伦理和孩子选择之间权衡", boundary: "爱护不等于公开全部秘密，也不等于能调动军方或学院最高资源", importance: .88 },
];
