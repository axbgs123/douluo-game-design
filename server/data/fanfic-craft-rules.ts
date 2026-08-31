export interface FanficCraftRule {
  id: string;
  triggers: RegExp;
  instruction: string;
}

// These rules are structural observations from legally accessible public chapters.
// They deliberately contain no sampled prose and never override canon/state contracts.
export const FANFIC_CRAFT_RULES: FanficCraftRule[] = [
  {
    id: "action-first",
    triggers: /./,
    instruction: "先写玩家本轮行动如何发生，再补最少量背景；前半段必须出现动作、阻力和可见结果，不能用设定说明占满场景。",
  },
  {
    id: "payoff-visible",
    triggers: /获得|突破|觉醒|魂环|魂骨|修炼|训练|战斗|猎魂|奖励|遗物|金手指/,
    instruction: "成长回报要在本场变成可感知、可试用或可比较的变化；同时保留魂力、体魄、熟练、冷却、暴露或资源条件，不能只报夸张倍数。",
  },
  {
    id: "reaction-channel",
    triggers: /觉醒|天赋|满魂力|双生|多生|魂环|魂骨|公开|暴露|学院|宗门|势力|招揽|收徒/,
    instruction: "异常天赋只沿目击、复测、登记、上报、权限与路程传播；现场小人物先做职责内反应，高位人物不能因为作者知道就立刻上门。",
  },
  {
    id: "resource-route",
    triggers: /学院|入学|猎魂|魂环|购买|资源|金币|资助|工读|宗门|家族|老师|导师/,
    instruction: "资源必须有持有人和提供理由。公开高天赋会提高资助、保护和培养竞争，但每一份帮助都要落到具体机构、权限、利益或关系上。",
  },
  {
    id: "power-evidence",
    triggers: /超限|千年|万年|十万年|魂环|魂骨|血脉|体魄|承载|吸收|融合|神赐/,
    instruction: "超限力量先交代程序已确认的来源与承载依据，再写身体压力、控制难点和完成证据；不得临场补丹药、功法、神祇关注或免死规则替结果圆场。",
  },
  {
    id: "canon-character-respect",
    triggers: /唐三|小舞|大师|玉小刚|史莱克|武魂殿|比比东|霍雨浩|马小桃|唐舞麟|古月|轩宇/,
    instruction: "原著人物按当时年龄、信息、利益和既有性格行动；不得把论坛黑称、作者吐槽、后世结局或读者梗塞进角色思想，也不得为衬托主角集体降智。",
  },
  {
    id: "choice-pressure",
    triggers: /选择|建议|下一步|谈判|竞争|秘密|公开|加入|拒绝|帮助|风险/,
    instruction: "章尾压力来自已发生结果：下一步分别争取成长资源、关系位置或秘密风险，写明确对象和近期目的，不做解谜式空泛观察。",
  },
];

export function retrieveFanficCraftRules(scene: string, limit = 4): FanficCraftRule[] {
  const core = FANFIC_CRAFT_RULES[0];
  const matched = FANFIC_CRAFT_RULES.slice(1).filter((rule) => rule.triggers.test(scene));
  return [core, ...matched].slice(0, Math.max(1, limit));
}
