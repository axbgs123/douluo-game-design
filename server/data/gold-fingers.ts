import type { SpecialSystemView } from "../../shared/game.js";
export { GOLD_FINGERS, goldFingerByName, goldFingerByPreference } from "../../shared/gold-fingers.js";
import { goldFingerByName } from "../../shared/gold-fingers.js";

export function isGoldFinger(name?: string): boolean {
  return Boolean(name && goldFingerByName(name));
}

export function createSpecialSystemView(name: string): SpecialSystemView {
  const definition = goldFingerByName(name);
  if (definition) return { name, stage: "觉醒绑定 · 一级", progress: "0%", abilities: [...definition.initialAbilities], resourceHint: definition.resourceHint, actions: [{ label: definition.actionLabel, command: definition.actionCommand }] };
  const resourceHint = /丹|炼/.test(name) ? "需要药材、矿料与反复试错" : /剑/.test(name) ? "需要实战、兵器与安静参悟" : /因果/.test(name) ? "需要经历关键选择并承担反噬" : "需要在魂力成长中逐步唤醒";
  return { name, stage: "初次感应", progress: "刚刚起步", abilities: [], resourceHint };
}
