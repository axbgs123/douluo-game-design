export interface PersonalityOption {
  id: string;
  label: string;
}

export interface PersonalityQuestion {
  id: string;
  prompt: string;
  options: PersonalityOption[];
}

export const PERSONALITY_QUESTIONS: PersonalityQuestion[] = [
  {
    id: "danger",
    prompt: "山道上传来求救声，但附近可能藏着魂兽。你首先会？",
    options: [
      { id: "rush", label: "立刻赶去救人" },
      { id: "observe", label: "先观察并准备退路" },
      { id: "leave", label: "避开未知危险" }
    ]
  },
  {
    id: "promise",
    prompt: "履行旧承诺会让你错过一次珍贵机缘。你更倾向？",
    options: [
      { id: "keep", label: "先履行承诺" },
      { id: "negotiate", label: "设法兼顾双方" },
      { id: "opportunity", label: "抓住不可重来的机缘" }
    ]
  },
  {
    id: "authority",
    prompt: "一位强者要求你服从，但没有解释原因。你会？",
    options: [
      { id: "obey", label: "暂时服从" },
      { id: "question", label: "要求说明理由" },
      { id: "resist", label: "拒绝受人支配" }
    ]
  },
  {
    id: "scarcity",
    prompt: "你和同伴都需要仅剩的一份疗伤药。你会？",
    options: [
      { id: "give", label: "交给同伴" },
      { id: "share", label: "寻找分配或替代方案" },
      { id: "take", label: "优先确保自己活下去" }
    ]
  },
  {
    id: "injustice",
    prompt: "陌生人正在被有背景的人欺压。你更可能？",
    options: [
      { id: "intervene", label: "直接介入" },
      { id: "scheme", label: "暗中寻找安全办法" },
      { id: "ignore", label: "不卷入陌生人的麻烦" }
    ]
  },
  {
    id: "power",
    prompt: "一种力量成长极快，但可能留下未知隐患。你会？",
    options: [
      { id: "reject", label: "拒绝不可控的力量" },
      { id: "study", label: "研究清楚后再决定" },
      { id: "accept", label: "先掌握力量再处理代价" }
    ]
  },
  {
    id: "conflict",
    prompt: "对手当众羞辱你，却暂时没有动手。你会？",
    options: [
      { id: "calm", label: "克制并记住此事" },
      { id: "retort", label: "当场反击言辞" },
      { id: "fight", label: "用行动让他闭嘴" }
    ]
  },
  {
    id: "history",
    prompt: "你知道一件悲剧未来会发生，但干预可能牵连很多人。你会？",
    options: [
      { id: "prevent", label: "尽力阻止悲剧" },
      { id: "investigate", label: "先确认情报与代价" },
      { id: "protect_self", label: "避免贸然改变历史" }
    ]
  }
];
