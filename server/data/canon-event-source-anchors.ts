export interface CanonEventSourceAnchor {
  book: 1 | 2 | 3 | 4;
  chapterStart: number;
  chapterEnd?: number;
  relativeOrder: number;
  basis: "章节标题" | "章节正文事件" | "跨章过程";
  note: string;
}

export const CANON_EVENT_SOURCE_ANCHORS: Record<string, CanonEventSourceAnchor> = {
  "tang-san-awakens-emperor": { book: 1, chapterStart: 443, chapterEnd: 445, relativeOrder: 10, basis: "章节正文事件", note: "蓝银皇觉醒阶段" },
  "slaughter-city-entry": { book: 1, chapterStart: 446, chapterEnd: 447, relativeOrder: 20, basis: "章节正文事件", note: "进入杀戮之都" },
  "slaughter-domain": { book: 1, chapterStart: 455, chapterEnd: 457, relativeOrder: 30, basis: "跨章过程", note: "地狱路与领域取得阶段" },
  "moon-pavilion-training": { book: 1, chapterStart: 467, chapterEnd: 493, relativeOrder: 40, basis: "跨章过程", note: "月轩训练至重聚前" },
  "five-year-reunion": { book: 1, chapterStart: 494, chapterEnd: 496, relativeOrder: 50, basis: "章节标题", note: "史莱克重聚" },

  "d2-snow-empress-embryo": { book: 2, chapterStart: 101, chapterEnd: 174, relativeOrder: 10, basis: "跨章过程", note: "魂兽胚胎拍卖至雪帝相关阶段" },
  "d2-soul-spirit-born": { book: 2, chapterStart: 197, chapterEnd: 198, relativeOrder: 20, basis: "章节标题", note: "雪帝魂灵形成" },
  "d2-spirit-pagoda-founded": { book: 2, chapterStart: 409, chapterEnd: 410, relativeOrder: 30, basis: "章节标题", note: "魂灵试验与传灵塔建立讨论" },

  "d3-godkiller-coordinated-strike": { book: 3, chapterStart: 876, chapterEnd: 879, relativeOrder: 10, basis: "跨章过程", note: "联合袭击发生" },
  "d3-shrek-destruction": { book: 3, chapterStart: 876, chapterEnd: 879, relativeOrder: 11, basis: "跨章过程", note: "史莱克城毁灭结果" },
  "d3-tang-sect-strike": { book: 3, chapterStart: 878, chapterEnd: 880, relativeOrder: 11, basis: "跨章过程", note: "唐门总部同时遇袭" },
  "d3-blood-god": { book: 3, chapterStart: 926, chapterEnd: 949, relativeOrder: 20, basis: "跨章过程", note: "进入血神军团并完成初期安排" },
  "d3-abyss-war": { book: 3, chapterStart: 950, relativeOrder: 30, basis: "章节标题", note: "抵达深渊通道后的战事阶段" },

  "d4-seventh-fleet-rescue": { book: 4, chapterStart: 932, chapterEnd: 939, relativeOrder: 10, basis: "跨章过程", note: "第七舰队参与恒星救援" },
  "d4-fleet-entry": { book: 4, chapterStart: 974, relativeOrder: 20, basis: "章节标题", note: "抵达第七舰队并开始服役安排" },
  "d4-first-second-fleet-support": { book: 4, chapterStart: 982, relativeOrder: 30, basis: "章节正文事件", note: "第一、第二舰队作为接应力量靠拢" },
  "d4-dragon-horse-infiltration": { book: 4, chapterStart: 997, chapterEnd: 1032, relativeOrder: 40, basis: "跨章过程", note: "潜入路线形成并返回汇报" },
  "d4-rising-dragon": { book: 4, chapterStart: 1100, relativeOrder: 50, basis: "章节标题", note: "升龙大赛阶段" },
  "d4-future-rookies": { book: 4, chapterStart: 1338, chapterEnd: 1342, relativeOrder: 60, basis: "跨章过程", note: "未来新秀挑战赛" },
  "d4-dragon-horse-federation-founded": { book: 4, chapterStart: 1375, chapterEnd: 1399, relativeOrder: 70, basis: "跨章过程", note: "从成立提案到表决正式成立" },
  "d4-crimson-ultimatum": { book: 4, chapterStart: 1398, chapterEnd: 1422, relativeOrder: 71, basis: "跨章过程", note: "深红之母要求及其后果被说明" },
  "d4-crimson-domain": { book: 4, chapterStart: 1543, relativeOrder: 80, basis: "章节标题", note: "深红之域真正进入战争现场" },
  "d4-final-space-war": { book: 4, chapterStart: 1543, chapterEnd: 1737, relativeOrder: 90, basis: "跨章过程", note: "深红战争持续升级" },
};

export function canonEventSourceAnchor(eventId: string): CanonEventSourceAnchor | undefined {
  return CANON_EVENT_SOURCE_ANCHORS[eventId];
}
