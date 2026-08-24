import type { SpecialSystemView } from "../../shared/game.js";

export interface GoldFingerDefinition {
  id: string;
  name: string;
  preference: string;
  hint: string;
  resourceHint: string;
  initialAbilities: string[];
}

export const GOLD_FINGERS: GoldFingerDefinition[] = [
  { id: "location-sign-in", name: "万象签到系统", preference: "签到系统", hint: "按真实日期与亲自抵达的地点签到；名场面地点奖励更好，但同日不能重复领取。", resourceHint: "每天一次；新地点首次签到有额外记录，不会直接赠送神级武魂", initialAbilities: ["每日签到", "地点首签"] },
  { id: "effort-points", name: "勤修加点面板", preference: "加点面板", hint: "真实训练会积累潜能点，再由玩家分配；不能无中生有，也不能越过魂环瓶颈。", resourceHint: "潜能点只来自完成的修炼、课程与实战，不接受空口刷点", initialAbilities: ["属性查看", "潜能分配"] },
  { id: "fate-simulator", name: "命运片段模拟器", preference: "人生模拟器", hint: "消耗精神预演近期选择的风险，只提供有误差的片段，不复制模拟中的修为与宝物。", resourceHint: "每七天最多完整模拟一次；世界线偏移越大，结果越不可靠", initialAbilities: ["短期推演", "风险标记"] },
  { id: "evidence-quests", name: "等价任务系统", preference: "任务系统", hint: "根据当前处境发布可验证任务，奖励与风险、耗时相称，不能靠一句‘完成’结算。", resourceHint: "任务必须留下行动记录；奖励以资源、情报和少量成长为主", initialAbilities: ["情境任务", "证据验收"] },
  { id: "soul-ecology-codex", name: "武魂生态图鉴", preference: "图鉴系统", hint: "亲自接触、调查或战斗后记录武魂与魂兽，逐步解锁弱点提示和适配建议。", resourceHint: "只记录见过且有证据的目标，未知对象仍会显示问号", initialAbilities: ["现场扫描", "样本归档"] },
];

export function goldFingerByPreference(preference: string): GoldFingerDefinition | undefined {
  return GOLD_FINGERS.find((item) => item.preference === preference);
}

export function goldFingerByName(name: string): GoldFingerDefinition | undefined {
  return GOLD_FINGERS.find((item) => item.name === name);
}

export function isGoldFinger(name?: string): boolean {
  return Boolean(name && goldFingerByName(name));
}

export function createSpecialSystemView(name: string): SpecialSystemView {
  const definition = goldFingerByName(name);
  if (definition) return { name, stage: "觉醒绑定 · 一级", progress: "0%", abilities: [...definition.initialAbilities], resourceHint: definition.resourceHint };
  const resourceHint = /丹|炼/.test(name) ? "需要药材、矿料与反复试错" : /剑/.test(name) ? "需要实战、兵器与安静参悟" : /因果/.test(name) ? "需要经历关键选择并承担反噬" : "需要在魂力成长中逐步唤醒";
  return { name, stage: "初次感应", progress: "刚刚起步", abilities: [], resourceHint };
}
