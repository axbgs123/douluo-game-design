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
};
