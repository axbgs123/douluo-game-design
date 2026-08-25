import type { GameEra } from "../../shared/game.js";

export interface DynamicEventTemplate {
  title: string;
  kind: "地方" | "势力" | "人物" | "历史前兆";
  detail: string;
  stakes: number;
  eras?: GameEra[];
  minYear?: number;
  maxYear?: number;
}

export const DYNAMIC_EVENT_TEMPLATES: DynamicEventTemplate[] = [
  { title: "失踪的采药队", kind: "地方", detail: "一支采药队过了约定日期仍没回来，家属正在凑钱找人。", stakes: 2 },
  { title: "魂兽越界", kind: "地方", detail: "外围魂兽闯入耕地，痕迹和当地人熟悉的种类对不上。", stakes: 3 },
  { title: "学院名额争议", kind: "势力", detail: "工读生名额被临时改动，两个家庭各自拿着盖过章的证明。", stakes: 2 },
  { title: "商路扣押", kind: "势力", detail: "一批药材被关卡扣住，商队和守军都说自己手续齐全。", stakes: 3 },
  { title: "受伤的陌生魂师", kind: "人物", detail: "有人在城外发现一名重伤魂师，他不肯说自己从哪里来。", stakes: 3 },
  { title: "宗门招募", kind: "势力", detail: "附近宗门派人登记年轻魂师，给出的条件很好，契约却写得含糊。", stakes: 2 },
  { title: "旧矿洞异响", kind: "地方", detail: "停用多年的矿洞夜里传出敲击声，守夜人已经辞了两个。", stakes: 4 },
  { title: "来历不明的挑战者", kind: "人物", detail: "一名年轻魂师连胜数场，只问本地最强的同龄人在哪里。", stakes: 2 },

  { title: "魂导工坊核心阵法事故", kind: "势力", detail: "一间民用魂导工坊的核心阵法连续烧毁，工坊主、绘图师和材料商互相指责。", stakes: 3, eras: [2] },
  { title: "魂灵适配实验失控", kind: "势力", detail: "一次早期魂灵适配实验出现精神排斥，实验对象和研究记录都需要立即封存复核。", stakes: 5, eras: [2], minYear: 10005 },
  { title: "极北补给车队延误", kind: "地方", detail: "前往极北外围的补给车队没有按时抵达，最后一处驿站只收到半张冻裂的货单。", stakes: 4, eras: [2] },
  { title: "内院核心弟子名额争议", kind: "势力", detail: "两个院系都声称同一名学员应占用本年度核心培养名额，考核记录却缺少独立复核签字。", stakes: 3, eras: [2] },

  { title: "升灵台紧急退出异常", kind: "势力", detail: "数名体验者在紧急退出后仍出现持续头痛，传灵塔正在核对模拟记录与保护阈值。", stakes: 4, eras: [3] },
  { title: "斗铠材料批次污染", kind: "势力", detail: "一批千锻金属在检测中出现不稳定魂力杂质，已经交付的学员项目面临返工。", stakes: 4, eras: [3] },
  { title: "机甲驾驶证代考线索", kind: "地方", detail: "模拟考核记录里出现不可能的操作习惯重合，几张新发驾驶证可能来自代考。", stakes: 3, eras: [3] },
  { title: "传灵塔魂灵合同投诉", kind: "势力", detail: "一户家庭认为魂灵适配说明隐瞒了精神负荷，传灵塔则拿出已经签字的风险告知书。", stakes: 3, eras: [3] },

  { title: "星舰补给批次延误", kind: "势力", detail: "一批计划送往训练舰的生命维持耗材没有完成交接，港口、承运商和舰务人员记录不一致。", stakes: 4, eras: [4] },
  { title: "模拟舱精神过载", kind: "人物", detail: "一组学员在高强度星战模拟后出现精神过载，训练负责人尚未决定暂停课程还是降低阈值。", stakes: 4, eras: [4] },
  { title: "真实航时登记争议", kind: "势力", detail: "一段训练航时被记入两名学员档案，模拟时间、随舰时间和实际操纵记录互相冲突。", stakes: 3, eras: [4] },
  { title: "生态样本隔离破损", kind: "地方", detail: "从森罗星运回的低风险生态样本出现封条破损，尚未确认是运输事故还是样本活性判断错误。", stakes: 5, eras: [4] },
];

export function dynamicEventTemplatesForEra(era: GameEra, year: number): DynamicEventTemplate[] {
  return DYNAMIC_EVENT_TEMPLATES.filter((item) => (!item.eras || item.eras.includes(era)) && (item.minYear === undefined || year >= item.minYear) && (item.maxYear === undefined || year <= item.maxYear));
}
