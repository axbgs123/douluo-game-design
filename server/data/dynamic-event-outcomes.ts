import type { LocalWorldConsequence } from "../domain/model.js";

export interface DynamicEventOutcomeProfile {
  outcome: string;
  consequences: Array<{
    kind: LocalWorldConsequence["kind"];
    summary: string;
    magnitude: number;
    durationDays: number;
    riskDelta?: number;
    marketEffects?: LocalWorldConsequence["marketEffects"];
  }>;
  followUp?: { title: string; detail: string; stakesDelta: number; expiresDays: number };
}

export const DYNAMIC_EVENT_OUTCOMES: Record<string, DynamicEventOutcomeProfile> = {
  "失踪的采药队": {
    outcome: "约定期限过去后，搜寻只找到散落药篓和被拖拽的痕迹；采药队仍有人失踪，当地药材收购立刻收紧。",
    consequences: [
      { kind: "伤亡", summary: "采药队失踪造成家庭生计中断，家属开始借钱组织搜寻。", magnitude: 3, durationDays: 120 },
      { kind: "供需", summary: "稳定采药人手减少，本地常用药材短缺。", magnitude: 3, durationDays: 90, marketEffects: [{ category: "药材", supplyDelta: -22, demandDelta: 12 }] },
    ],
    followUp: { title: "家属组织的二次搜寻", detail: "失踪者家属借来钱和旧地图，准备雇佣熟悉山路的人沿药篓痕迹继续寻找；再拖延下去，雨季会冲掉剩余线索。", stakesDelta: 1, expiresDays: 45 },
  },
  "魂兽越界": {
    outcome: "越界魂兽连续毁坏外围耕地后退回林地，村民不敢追入；春粮减产，原本的兽径也被证明已经改变。",
    consequences: [
      { kind: "生态", summary: "魂兽活动边界外移，农田与外围道路的遭遇风险提高。", magnitude: 4, durationDays: 150, riskDelta: 18 },
      { kind: "供需", summary: "耕地损失让本地粮食供应下降。", magnitude: 3, durationDays: 120, marketEffects: [{ category: "粮食", supplyDelta: -20, demandDelta: 10 }] },
    ],
    followUp: { title: "村庄临时猎魂队集结", detail: "村长和附近魂师准备沿新兽径设置警戒，但队伍缺少确认魂兽年限和撤退路线的人。", stakesDelta: 1, expiresDays: 60 },
  },
  "学院名额争议": {
    outcome: "招生期限结束时，名额被暂时冻结；两户孩子都错过了正常报到，盖章证明的责任落到经手人身上。",
    consequences: [
      { kind: "制度", summary: "学院招生信誉受损，后续推荐需要增加一次独立复核。", magnitude: 3, durationDays: 180 },
      { kind: "关系", summary: "两个家庭从争名额变成追究经手人与学院责任。", magnitude: 2, durationDays: 90 },
    ],
    followUp: { title: "家长联名申请复核", detail: "两户家长暂时放下争执，要求学院公开名额变更记录和签章责任人。", stakesDelta: 1, expiresDays: 30 },
  },
  "商路扣押": {
    outcome: "药材在关卡仓库里错过交货期，部分货物受潮；商队暂停这条路线，守军则开始追查手续来源。",
    consequences: [
      { kind: "供需", summary: "商路停运造成药材和日用品短缺，运输报价上涨。", magnitude: 4, durationDays: 100, marketEffects: [{ category: "药材", supplyDelta: -18, demandDelta: 12 }, { category: "日用品", supplyDelta: -12, demandDelta: 8 }] },
      { kind: "制度", summary: "关卡提高文书核验等级，普通运输耗时增加。", magnitude: 3, durationDays: 120 },
    ],
    followUp: { title: "受潮药材的责任追偿", detail: "商队、货主和关卡各自保存着不同版本的手续，赔偿责任必须靠原始签收记录确认。", stakesDelta: 1, expiresDays: 45 },
  },
  "受伤的陌生魂师": {
    outcome: "陌生魂师的伤势恶化后被地方机构带走，来历仍未说明；他留下的血迹和破损装备引来治安盘查。",
    consequences: [
      { kind: "治安", summary: "城外开始盘查伤者、可疑武器和夜间来客。", magnitude: 3, durationDays: 60, riskDelta: 10 },
      { kind: "制度", summary: "地方机构保存了伤者装备与救治记录，等待有人认领或调查。", magnitude: 2, durationDays: 120 },
    ],
    followUp: { title: "无人认领的破损魂导储物器", detail: "伤者随身物中有一件无法正常开启的储物器，地方机构只允许能证明来源的人参与检查。", stakesDelta: 1, expiresDays: 60 },
  },
  "宗门招募": {
    outcome: "招募期结束后，数名年轻魂师在没有看清附加条款的情况下签了契约；宗门得到新人，家庭却开始争论服务年限和退出代价。",
    consequences: [
      { kind: "势力", summary: "招募宗门补充了年轻成员，同时背上契约争议。", magnitude: 3, durationDays: 180 },
      { kind: "关系", summary: "签约家庭与宗门之间出现归属、报酬和探视矛盾。", magnitude: 3, durationDays: 120 },
    ],
    followUp: { title: "含糊培养契约引发的退宗争议", detail: "一户人家要求取回孩子，宗门拿出已经签字的培养支出账目；双方都需要能够证明当时告知范围的人。", stakesDelta: 2, expiresDays: 45 },
  },
  "旧矿洞异响": {
    outcome: "矿洞内侧发生小规模塌落，地面出现新的裂缝；矿主封闭入口，附近矿工失去工钱，金属供应开始收紧。",
    consequences: [
      { kind: "治安", summary: "旧矿洞封闭并设置警戒，私自进入会被追责。", magnitude: 4, durationDays: 180, riskDelta: 20 },
      { kind: "供需", summary: "矿工停工和道路封闭导致本地金属供应下降。", magnitude: 4, durationDays: 150, marketEffects: [{ category: "金属", supplyDelta: -25, demandDelta: 8 }] },
    ],
    followUp: { title: "塌方后露出的旧支洞", detail: "塌落石壁后出现一条不在矿图上的支洞，矿主、矿工和地方魂师对是否重新勘探意见不一。", stakesDelta: 1, expiresDays: 90 },
  },
  "来历不明的挑战者": {
    outcome: "挑战者在无人正式应战后又赢了几场，带着本地同龄人避战的说法离开；斗魂场名声受损，年轻魂师开始互相指责。",
    consequences: [
      { kind: "关系", summary: "本地年轻魂师因谁该应战产生竞争和不满。", magnitude: 2, durationDays: 60 },
      { kind: "势力", summary: "斗魂场和学院需要重新证明同龄人的实战水平。", magnitude: 2, durationDays: 90 },
    ],
    followUp: { title: "本地同龄人的公开选拔战", detail: "斗魂场准备组织一次同龄魂师选拔，胜者将获得追踪挑战者并挽回名声的资格。", stakesDelta: 1, expiresDays: 45 },
  },
  "魂导工坊核心阵法事故": {
    outcome: "工坊在第二次阵法烧毁后停产，损坏核心和原始图纸被分别封存；已经收过定金的订单全部延期。",
    consequences: [
      { kind: "制度", summary: "当地魂导工坊开始执行核心阵法双人复核，生产速度暂时下降。", magnitude: 3, durationDays: 120 },
      { kind: "供需", summary: "事故批次的魂导材料被扣留检测，合格核心供不应求。", magnitude: 4, durationDays: 90, marketEffects: [{ category: "魂导材料", supplyDelta: -18, demandDelta: 12 }] },
    ],
    followUp: { title: "工坊事故责任与图纸复核", detail: "封存的两份核心阵图有一处细微差异，绘图师和材料商都要求由没有利益关系的魂导师复核。", stakesDelta: 1, expiresDays: 45 },
  },
  "魂灵适配实验失控": {
    outcome: "实验对象出现持续精神排斥，研究被立即叫停；实验记录与参与者名单进入封存审查，相关人员不得私自接触对象。",
    consequences: [
      { kind: "伤亡", summary: "实验对象需要长期精神观察，短期内无法继续修炼或参与实验。", magnitude: 5, durationDays: 180 },
      { kind: "制度", summary: "早期魂灵适配研究增加独立见证与退出阈值审查。", magnitude: 4, durationDays: 240, riskDelta: 12 },
    ],
    followUp: { title: "封存实验记录的独立复核", detail: "精神排斥发生前，记录里曾出现一次被人为划掉的警戒读数；只有具备相应权限的人才能参与复核。", stakesDelta: 2, expiresDays: 60 },
  },
  "极北补给车队延误": {
    outcome: "车队仍未抵达，搜寻者只在旧冰道旁找到一辆翻覆货车；部分御寒物资损毁，护送者去向不明。",
    consequences: [
      { kind: "供需", summary: "极北外围的御寒物资、药材和粮食补给同时收紧。", magnitude: 4, durationDays: 100, marketEffects: [{ category: "日用品", supplyDelta: -20, demandDelta: 14 }, { category: "药材", supplyDelta: -12, demandDelta: 10 }, { category: "粮食", supplyDelta: -10, demandDelta: 8 }] },
      { kind: "生态", summary: "旧冰道路况与魂兽活动范围发生变化，后续车队风险提高。", magnitude: 4, durationDays: 120, riskDelta: 16 },
    ],
    followUp: { title: "冻裂货单指向的失踪护送队", detail: "半张货单记着一处临时改道坐标，那里不在驿站登记的安全路线内。", stakesDelta: 2, expiresDays: 40 },
  },
  "内院核心弟子名额争议": {
    outcome: "学院冻结了争议名额，两名学员都无法领取核心培养资源；院系之间开始追查缺失的复核签字。",
    consequences: [
      { kind: "制度", summary: "内院核心培养名额改为跨院系复核，短期内审批趋严。", magnitude: 3, durationDays: 180 },
      { kind: "关系", summary: "两名学员及其导师因资源被同时冻结而产生公开竞争。", magnitude: 3, durationDays: 120 },
    ],
    followUp: { title: "缺失签字背后的考核复盘", detail: "原始考核记录显示两名学员分别满足不同培养方向，争议必须通过公开复盘而非私下让步解决。", stakesDelta: 1, expiresDays: 45 },
  },
  "升灵台紧急退出异常": {
    outcome: "异常场次全部暂停，受影响者被送去精神检查；传灵塔暂时关闭同批模拟区域，并封存退出前后的魂力波形。",
    consequences: [
      { kind: "伤亡", summary: "受影响体验者需要精神恢复，部分修炼计划被迫中断。", magnitude: 4, durationDays: 90 },
      { kind: "制度", summary: "升灵台紧急退出阈值和保护记录进入强制复核。", magnitude: 4, durationDays: 150, riskDelta: 10 },
    ],
    followUp: { title: "异常脑波与保护阈值复核", detail: "几名体验者的异常都发生在同一片模拟区域，但系统日志显示的触发原因并不相同。", stakesDelta: 2, expiresDays: 45 },
  },
  "斗铠材料批次污染": {
    outcome: "污染批次被统一召回，已经开始锻造的斗铠部件只能停工检测；供应商否认杂质来自自己的生产线。",
    consequences: [
      { kind: "供需", summary: "合格斗铠材料短缺，返工需求同时上升。", magnitude: 4, durationDays: 120, marketEffects: [{ category: "魂导材料", supplyDelta: -20, demandDelta: 15 }, { category: "金属", supplyDelta: -12, demandDelta: 10 }] },
      { kind: "制度", summary: "学院与锻造协会提高材料溯源和入库抽检比例。", magnitude: 3, durationDays: 180 },
    ],
    followUp: { title: "污染批次的供应链追溯", detail: "同一炉号在学院、商会和供应商账本里对应三个交付日期，必须从原始封样追查污染环节。", stakesDelta: 1, expiresDays: 60 },
  },
  "机甲驾驶证代考线索": {
    outcome: "涉事驾驶证被暂时冻结，持证者必须重新参加实机考核；负责审核模拟记录的人也被调离岗位。",
    consequences: [
      { kind: "制度", summary: "机甲驾驶考核增加身份复核和实机操作抽查。", magnitude: 4, durationDays: 180 },
      { kind: "治安", summary: "代考中介开始转移记录，相关交易转入更隐蔽的渠道。", magnitude: 3, durationDays: 90, riskDelta: 8 },
    ],
    followUp: { title: "冻结驾驶证的实机复考", detail: "复考能区分真正具备驾驶能力的人，也可能逼出负责安排代考的中间人。", stakesDelta: 1, expiresDays: 30 },
  },
  "传灵塔魂灵合同投诉": {
    outcome: "争议魂灵服务暂停，家庭获得独立精神评估；传灵塔保留合同效力，但不得在复核结束前催收后续费用。",
    consequences: [
      { kind: "制度", summary: "同类魂灵合同必须单独说明精神负荷与适配失败处置。", magnitude: 3, durationDays: 180 },
      { kind: "关系", summary: "当地家庭对传灵塔告知流程产生不信任，签约意愿下降。", magnitude: 3, durationDays: 120 },
    ],
    followUp: { title: "魂灵风险告知的公开听证", detail: "签字只能证明文件曾被交付，不能证明风险被充分解释；双方将围绕当时的沟通记录举证。", stakesDelta: 1, expiresDays: 45 },
  },
  "星舰补给批次延误": {
    outcome: "训练舰推迟离港，生命维持耗材被分批重新检测；港口、承运商和舰务部门各自冻结了经手记录。",
    consequences: [
      { kind: "供需", summary: "港区生命维持耗材与通用魂导部件被优先征调。", magnitude: 4, durationDays: 100, marketEffects: [{ category: "魂导材料", supplyDelta: -18, demandDelta: 15 }, { category: "日用品", supplyDelta: -14, demandDelta: 10 }] },
      { kind: "制度", summary: "星舰补给交接改为港口、承运与舰务三方核验。", magnitude: 4, durationDays: 180 },
    ],
    followUp: { title: "补给交接记录的三方审计", detail: "同一批耗材在三个系统里的封签编号不同，调查必须确定是录入失误、掉包还是未经批准的临时调拨。", stakesDelta: 2, expiresDays: 45 },
  },
  "模拟舱精神过载": {
    outcome: "高强度课程被暂停，过载学员接受精神恢复治疗；训练负责人被要求交出自行调整过的模拟阈值。",
    consequences: [
      { kind: "伤亡", summary: "过载学员需要休养，严重者暂时不能进行精神力训练。", magnitude: 4, durationDays: 100 },
      { kind: "制度", summary: "模拟舱训练强度改为按精神力评估分级授权。", magnitude: 4, durationDays: 180, riskDelta: 8 },
    ],
    followUp: { title: "模拟舱训练阈值责任复核", detail: "设备记录显示阈值曾被手动提高，但调整理由与当班教官的口供不一致。", stakesDelta: 1, expiresDays: 45 },
  },
  "真实航时登记争议": {
    outcome: "争议航时从两人档案中同时冻结，相关晋升和选拔随之延期；训练舰黑匣子被调回复核。",
    consequences: [
      { kind: "制度", summary: "真实航时必须与随舰名册、操纵日志和黑匣子记录三方一致。", magnitude: 3, durationDays: 180 },
      { kind: "关系", summary: "两名学员及其带队教官因晋升受阻产生责任争执。", magnitude: 3, durationDays: 120 },
    ],
    followUp: { title: "训练舰黑匣子航时复核", detail: "黑匣子能确认谁实际操纵，却也记录了一段未经计划批准的航线偏移。", stakesDelta: 1, expiresDays: 40 },
  },
  "生态样本隔离破损": {
    outcome: "样本区进入封锁隔离，接触人员全部留观；尚未发现扩散迹象，但原定研究和港区通行都被暂停。",
    consequences: [
      { kind: "生态", summary: "外星生态样本存在未知活性，隔离区周边风险持续上升。", magnitude: 5, durationDays: 150, riskDelta: 20 },
      { kind: "制度", summary: "跨星球生态样本改为双层封签并增加到港活性复测。", magnitude: 4, durationDays: 240 },
      { kind: "供需", summary: "隔离封锁影响港区通行，部分日用品与研究耗材短缺。", magnitude: 3, durationDays: 80, marketEffects: [{ category: "日用品", supplyDelta: -12, demandDelta: 8 }, { category: "魂导材料", supplyDelta: -10, demandDelta: 8 }] },
    ],
    followUp: { title: "隔离区内的样本活性追踪", detail: "监测记录显示破损前后出现一次短暂活性峰值，封锁解除前必须找到峰值来源并确认样本数量。", stakesDelta: 2, expiresDays: 50 },
  },
};
