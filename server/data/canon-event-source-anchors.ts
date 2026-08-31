export interface CanonEventSourceAnchor {
  book: 1 | 2 | 3 | 4;
  chapterStart: number;
  chapterEnd?: number;
  relativeOrder: number;
  basis: "章节标题" | "章节正文事件" | "跨章过程" | "回溯叙述";
  note: string;
}

export const CANON_EVENT_SOURCE_ANCHORS: Record<string, CanonEventSourceAnchor> = {
  "tang-awakening": { book: 1, chapterStart: 5, chapterEnd: 8, relativeOrder: 5, basis: "跨章过程", note: "圣魂村觉醒与先天满魂力测试" },
  "notting-arrival": { book: 1, chapterStart: 18, chapterEnd: 19, relativeOrder: 18, basis: "章节正文事件", note: "老杰克护送唐三到诺丁学院" },
  "notting-master-disciple": { book: 1, chapterStart: 19, chapterEnd: 20, relativeOrder: 19, basis: "跨章过程", note: "大师接人、判断武魂并正式收徒" },
  "xiao-wu-notting-meeting": { book: 1, chapterStart: 23, chapterEnd: 27, relativeOrder: 23, basis: "跨章过程", note: "小舞进入七舍并与唐三相识" },
  "first-ring-tang-san": { book: 1, chapterStart: 38, chapterEnd: 47, relativeOrder: 38, basis: "跨章过程", note: "猎魂森林猎取与第一魂环技能形成" },

  "shrek-enrollment": { book: 1, chapterStart: 77, chapterEnd: 81, relativeOrder: 77, basis: "跨章过程", note: "只收怪物的入学考核" },
  "zhao-wuji-test": { book: 1, chapterStart: 82, chapterEnd: 91, relativeOrder: 82, basis: "跨章过程", note: "赵无极与新生实战测试" },
  "suotuo-spirit-arena": { book: 1, chapterStart: 111, chapterEnd: 118, relativeOrder: 111, basis: "跨章过程", note: "学员进入索托大斗魂场并开始组队磨合" },
  "star-dou-first-hunt": { book: 1, chapterStart: 119, chapterEnd: 133, relativeOrder: 119, basis: "跨章过程", note: "首次星斗猎魂至奥斯卡获得第三魂环" },
  "titan-ape-appearance": { book: 1, chapterStart: 134, chapterEnd: 136, relativeOrder: 134, basis: "章节标题", note: "泰坦巨猿现身" },
  "human-spider-absorption": { book: 1, chapterStart: 137, chapterEnd: 148, relativeOrder: 137, basis: "跨章过程", note: "人面魔蛛猎杀、越级吸收与外附魂骨形成" },
  "imperial-team-battle": { book: 1, chapterStart: 185, chapterEnd: 202, relativeOrder: 185, basis: "跨章过程", note: "皇斗战队登场至两队斗魂结束" },

  "shrek-to-heaven-royal": { book: 1, chapterStart: 215, chapterEnd: 223, relativeOrder: 215, basis: "跨章过程", note: "前往天斗皇家学院并因毒斗罗与贵族阻力离开" },
  "shrek-relocation": { book: 1, chapterStart: 224, chapterEnd: 226, relativeOrder: 226, basis: "跨章过程", note: "史莱克转入蓝霸学院并重新落脚" },
  "blue-tyrant-merge": { book: 1, chapterStart: 224, chapterEnd: 226, relativeOrder: 225, basis: "跨章过程", note: "蓝霸学院与史莱克合并" },
  "golden-triangle-reunion": { book: 1, chapterStart: 224, chapterEnd: 229, relativeOrder: 224, basis: "跨章过程", note: "黄金铁三角重聚" },
  "ice-fire-herbs": { book: 1, chapterStart: 230, chapterEnd: 250, relativeOrder: 230, basis: "跨章过程", note: "冰火两仪眼与唐三仙草阶段" },
  "seven-devils-herbs": { book: 1, chapterStart: 251, chapterEnd: 253, relativeOrder: 251, basis: "跨章过程", note: "史莱克七怪分配并服用仙草" },
  "d1-seven-treasure-evolution": { book: 1, chapterStart: 251, chapterEnd: 253, relativeOrder: 251, basis: "章节正文事件", note: "宁荣荣服用绮罗郁金香后宝塔进化" },

  "academy-tournament": { book: 1, chapterStart: 311, chapterEnd: 319, relativeOrder: 311, basis: "跨章过程", note: "大赛开幕与预选赛首战" },
  "five-elements-clash": { book: 1, chapterStart: 341, chapterEnd: 388, relativeOrder: 341, basis: "跨章过程", note: "五元素学院与史莱克的连续交锋" },
  "tournament-finals": { book: 1, chapterStart: 395, chapterEnd: 427, relativeOrder: 395, basis: "跨章过程", note: "武魂城总决赛至冠军决出" },
  "pope-palace-conflict": { book: 1, chapterStart: 428, chapterEnd: 433, relativeOrder: 428, basis: "跨章过程", note: "小舞身份暴露与唐昊救走两人" },

  "tang-san-awakens-emperor": { book: 1, chapterStart: 443, chapterEnd: 445, relativeOrder: 10, basis: "章节正文事件", note: "蓝银皇觉醒阶段" },
  "slaughter-city-entry": { book: 1, chapterStart: 446, chapterEnd: 447, relativeOrder: 20, basis: "章节正文事件", note: "进入杀戮之都" },
  "slaughter-domain": { book: 1, chapterStart: 455, chapterEnd: 457, relativeOrder: 30, basis: "跨章过程", note: "地狱路与领域取得阶段" },
  "moon-pavilion-training": { book: 1, chapterStart: 467, chapterEnd: 493, relativeOrder: 40, basis: "跨章过程", note: "月轩训练至重聚前" },
  "five-year-reunion": { book: 1, chapterStart: 494, chapterEnd: 496, relativeOrder: 50, basis: "章节标题", note: "史莱克重聚" },
  "clear-sky-return": { book: 1, chapterStart: 479, chapterEnd: 484, relativeOrder: 45, basis: "跨章过程", note: "唐三首次正式返回昊天宗" },
  "soul-hunt-operation": { book: 1, chapterStart: 506, chapterEnd: 509, relativeOrder: 60, basis: "跨章过程", note: "猎魂行动实际展开与上三宗袭击消息落地" },
  "seven-treasure-attack": { book: 1, chapterStart: 506, chapterEnd: 509, relativeOrder: 61, basis: "跨章过程", note: "七宝琉璃宗遇袭结果被确认" },
  "blue-lightning-destruction": { book: 1, chapterStart: 506, chapterEnd: 509, relativeOrder: 61, basis: "跨章过程", note: "蓝电霸王龙宗毁灭结果被确认" },
  "xiao-wu-sacrifice": { book: 1, chapterStart: 510, chapterEnd: 513, relativeOrder: 70, basis: "跨章过程", note: "星斗森林死战与小舞献祭" },
  "tang-sect-preparation": { book: 1, chapterStart: 519, chapterEnd: 520, relativeOrder: 80, basis: "跨章过程", note: "以力之一族为基础开始筹备唐门" },
  "single-clans-gather": { book: 1, chapterStart: 520, chapterEnd: 530, relativeOrder: 81, basis: "跨章过程", note: "单属性四宗族聚会与去向选择" },
  "tang-sect-founded": { book: 1, chapterStart: 530, chapterEnd: 540, relativeOrder: 85, basis: "跨章过程", note: "四宗族条件陆续落定后唐门开始实际运作" },
  "gengxin-forging": { book: 1, chapterStart: 534, chapterEnd: 539, relativeOrder: 90, basis: "跨章过程", note: "庚辛城铁匠协会与楼高阶段" },
  "tang-sect-four-halls": { book: 1, chapterStart: 540, relativeOrder: 95, basis: "章节标题", note: "唐门五堂组织形成，结构化节点保留旧名‘四堂成形’" },
  "heaven-dou-coup": { book: 1, chapterStart: 541, chapterEnd: 544, relativeOrder: 541, basis: "跨章过程", note: "宫闱惊变、雪清河身份冲突与天斗宫廷局势突变" },
  "sea-voyage": { book: 1, chapterStart: 559, chapterEnd: 563, relativeOrder: 559, basis: "跨章过程", note: "从瀚海城出海并进入危险海域" },
  "sea-voyage-pirates": { book: 1, chapterStart: 564, chapterEnd: 565, relativeOrder: 564, basis: "跨章过程", note: "流落紫珍珠海盗团所在地并与其接触" },
  "sea-god-trials": { book: 1, chapterStart: 566, chapterEnd: 570, relativeOrder: 566, basis: "跨章过程", note: "登陆海神岛、海马圣柱评定与海神九考开启" },
  "evil-orca-war": { book: 1, chapterStart: 587, chapterEnd: 590, relativeOrder: 587, basis: "跨章过程", note: "第四考鲨鲸之战与邪魔虎鲸王被杀" },
  "sea-pillar-tests": { book: 1, chapterStart: 591, chapterEnd: 599, relativeOrder: 591, basis: "跨章过程", note: "第五考连续挑战海神岛圣柱守护者" },
  "continental-war": { book: 1, chapterStart: 607, chapterEnd: 625, relativeOrder: 607, basis: "跨章过程", note: "武魂帝国格局公开后，两大帝国进入大规模战备与交战" },
  "twin-empires-war": { book: 1, chapterStart: 625, chapterEnd: 637, relativeOrder: 625, basis: "跨章过程", note: "天斗大军、唐家军与武魂帝国正面战场" },
  "deep-sea-whale-battle": { book: 1, chapterStart: 654, chapterEnd: 660, relativeOrder: 654, basis: "跨章过程", note: "深海魔鲸王决战与百万年魂环魂骨" },
  "bo-saixi-sacrifice": { book: 1, chapterStart: 661, chapterEnd: 663, relativeOrder: 661, basis: "跨章过程", note: "海神传承选择与波赛西献祭开启传承" },
  "jialing-pass": { book: 1, chapterStart: 673, chapterEnd: 687, relativeOrder: 673, basis: "跨章过程", note: "嘉陵关双神降临至最终决战" },

  "d2-huo-leaves-duke-estate": { book: 2, chapterStart: 1, relativeOrder: 1, basis: "章节正文事件", note: "霍雨浩离开白虎公爵府" },
  "d2-tang-sect-meeting": { book: 2, chapterStart: 4, chapterEnd: 5, relativeOrder: 4, basis: "跨章过程", note: "结识贝贝、唐雅并加入唐门" },
  "d2-shrek-enrollment": { book: 2, chapterStart: 6, chapterEnd: 7, relativeOrder: 6, basis: "跨章过程", note: "抵达史莱克并完成新生入学" },
  "d2-freshman-assessment": { book: 2, chapterStart: 16, chapterEnd: 22, relativeOrder: 16, basis: "跨章过程", note: "新生考核与团队形成" },
  "d2-soul-tournament": { book: 2, chapterStart: 75, chapterEnd: 127, relativeOrder: 75, basis: "跨章过程", note: "大赛开始至本届赛事结束" },
  "d2-body-sect-raid": { book: 2, chapterStart: 172, chapterEnd: 176, relativeOrder: 172, basis: "跨章过程", note: "本体宗突袭明德堂与事后核对" },
  "d2-snow-empress-embryo": { book: 2, chapterStart: 101, chapterEnd: 174, relativeOrder: 10, basis: "跨章过程", note: "魂兽胚胎拍卖至雪帝相关阶段" },
  "d2-soul-spirit-born": { book: 2, chapterStart: 197, chapterEnd: 198, relativeOrder: 20, basis: "章节标题", note: "雪帝魂灵形成" },
  "d2-spirit-pagoda-founded": { book: 2, chapterStart: 409, chapterEnd: 410, relativeOrder: 30, basis: "章节标题", note: "魂灵试验与传灵塔建立讨论" },
  "d2-seagod-fate": { book: 2, chapterStart: 210, chapterEnd: 211, relativeOrder: 210, basis: "跨章过程", note: "海神缘相亲大会" },
  "d2-mingdu-tournament": { book: 2, chapterStart: 270, chapterEnd: 350, relativeOrder: 270, basis: "跨章过程", note: "明都参赛至大赛后续动荡" },
  "d2-qiankun-love-valley": { book: 2, chapterStart: 353, chapterEnd: 364, relativeOrder: 353, basis: "跨章过程", note: "乾坤问情谷考验阶段" },
  "d2-beast-tide": { book: 2, chapterStart: 394, chapterEnd: 408, relativeOrder: 394, basis: "跨章过程", note: "星斗兽潮与史莱克防守" },
  "d2-undead-demesne": { book: 2, chapterStart: 403, chapterEnd: 404, relativeOrder: 403, basis: "跨章过程", note: "霍雨浩连通伊莱克斯亡灵半位面，召唤亡灵大军支援兽潮战场" },
  "d2-sun-moon-war": { book: 2, chapterStart: 421, chapterEnd: 484, relativeOrder: 421, basis: "跨章过程", note: "明斗山脉战事、天魂帝国战线与日月帝国全面入侵阶段" },
  "d2-beibei-tangya-rescue": { book: 2, chapterStart: 485, chapterEnd: 501, relativeOrder: 485, basis: "跨章过程", note: "营救立项、前线侦察、潜入军营与带回唐雅" },
  "d2-shrek-defense": { book: 2, chapterStart: 556, chapterEnd: 583, relativeOrder: 556, basis: "跨章过程", note: "日月帝国主力逼近史莱克城、城防戒备与军前对抗" },
  "d2-final-holy-spirit": { book: 2, chapterStart: 596, chapterEnd: 607, relativeOrder: 596, basis: "跨章过程", note: "日月帝国剥离圣灵教、围杀极限斗罗与圣灵教核心覆灭" },
  "d2-god-realm-ascent": { book: 2, chapterStart: 618, chapterEnd: 622, relativeOrder: 618, basis: "跨章过程", note: "挑战帝天、继承情绪神位与进入神界" },

  "d3-wulin-awakening": { book: 3, chapterStart: 1, chapterEnd: 2, relativeOrder: 1, basis: "章节标题", note: "唐舞麟觉醒蓝银草" },
  "d3-east-sea-enrollment": { book: 3, chapterStart: 33, chapterEnd: 50, relativeOrder: 33, basis: "跨章过程", note: "初临东海、报到与进入学院生活" },
  "d3-zero-class": { book: 3, chapterStart: 62, chapterEnd: 109, relativeOrder: 62, basis: "跨章过程", note: "古月入学、升班赛至零班成立" },
  "d3-student-competition": { book: 3, chapterStart: 312, chapterEnd: 379, relativeOrder: 312, basis: "跨章过程", note: "少年天才榜与学员竞争阶段" },
  "d3-star-luo-exchange": { book: 3, chapterStart: 549, chapterEnd: 665, relativeOrder: 549, basis: "跨章过程", note: "前往星罗大陆并展开交流" },
  "d3-dragon-valley": { book: 3, chapterStart: 666, chapterEnd: 768, relativeOrder: 666, basis: "跨章过程", note: "龙谷行动、进入与归来阶段" },
  "d3-shrek-entry": { book: 3, chapterStart: 247, chapterEnd: 287, relativeOrder: 247, basis: "跨章过程", note: "抵达史莱克城、十项入学考核与正式进入学院" },
  "d3-seagod-festival": { book: 3, chapterStart: 733, chapterEnd: 765, relativeOrder: 733, basis: "跨章过程", note: "本届海神缘相亲大会准备、登场与各环节结算" },

  "d3-godkiller-coordinated-strike": { book: 3, chapterStart: 876, chapterEnd: 879, relativeOrder: 10, basis: "跨章过程", note: "联合袭击发生" },
  "d3-shrek-destruction": { book: 3, chapterStart: 876, chapterEnd: 879, relativeOrder: 11, basis: "跨章过程", note: "史莱克城毁灭结果" },
  "d3-tang-sect-strike": { book: 3, chapterStart: 878, chapterEnd: 880, relativeOrder: 11, basis: "跨章过程", note: "唐门总部同时遇袭" },
  "d3-blood-god": { book: 3, chapterStart: 926, chapterEnd: 949, relativeOrder: 20, basis: "跨章过程", note: "进入血神军团并完成初期安排" },
  "d3-abyss-war": { book: 3, chapterStart: 950, relativeOrder: 30, basis: "章节标题", note: "抵达深渊通道后的战事阶段" },
  "d3-five-gods": { book: 3, chapterStart: 1301, chapterEnd: 1370, relativeOrder: 40, basis: "跨章过程", note: "星罗朝堂定下五神之决至最终战" },
  "d3-shrek-rebuild": { book: 3, chapterStart: 1422, chapterEnd: 1426, relativeOrder: 50, basis: "跨章过程", note: "重建提议到正式开始重建" },
  "d3-federation-coup": { book: 3, chapterStart: 1739, chapterEnd: 1778, relativeOrder: 55, basis: "跨章过程", note: "传灵塔内部危机、史莱克与唐门复仇、联邦军事会议期间的权力冲突" },
  "d3-spirit-pagoda-conflict": { book: 3, chapterStart: 1739, chapterEnd: 1806, relativeOrder: 55, basis: "跨章过程", note: "传灵塔内部危机、千古东风被弹劾与古月娜接任塔主" },
  "d3-final-abyss": { book: 3, chapterStart: 1841, chapterEnd: 1983, relativeOrder: 60, basis: "跨章过程", note: "深渊总攻至最终决战" },
  "d3-wulin-guye-sleep": { book: 3, chapterStart: 1983, relativeOrder: 70, basis: "章节正文事件", note: "唐舞麟与古月娜深入地下并永冻冰封" },

  "d4-xuanyu-found": { book: 4, chapterStart: 1, chapterEnd: 7, relativeOrder: 1, basis: "跨章过程", note: "极北科考发现蛋生婴儿并由蓝潇、南澄收养" },
  "d4-family-moves-tianluo": { book: 4, chapterStart: 9, relativeOrder: 7, basis: "回溯叙述", note: "第九章明确回溯古魂兽研究所三年前整体迁往天罗星" },
  "d4-xuanyu-awakening": { book: 4, chapterStart: 8, chapterEnd: 14, relativeOrder: 8, basis: "跨章过程", note: "六年后觉醒、魂力测试与双纹蓝银草异常" },
  "d4-high-energy-class": { book: 4, chapterStart: 59, chapterEnd: 80, relativeOrder: 59, basis: "跨章过程", note: "高能少年班选拔与正式入学" },
  "d4-shrek-exam": { book: 4, chapterStart: 205, chapterEnd: 303, relativeOrder: 205, basis: "跨章过程", note: "约定史莱克相见、抵达史莱克城并完成招生考核" },
  "d4-elf-star": { book: 4, chapterStart: 508, chapterEnd: 556, relativeOrder: 508, basis: "跨章过程", note: "抵达精灵星与生命亲和考验" },
  "d4-thirty-three-wing": { book: 4, chapterStart: 686, chapterEnd: 695, relativeOrder: 686, basis: "跨章过程", note: "三十三天翼定名并形成团队战舰计划" },
  "d4-forest-star-trial": { book: 4, chapterStart: 738, chapterEnd: 816, relativeOrder: 738, basis: "跨章过程", note: "前往森罗星、分院切磋、魂兽考察与阶段收获" },


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
  "d4-dragon-god-return": { book: 4, chapterStart: 1732, chapterEnd: 1767, relativeOrder: 100, basis: "跨章过程", note: "融合龙神核心、传承考验与九彩龙神形态稳定" },
};

export interface CanonEventSourceUncertainty {
  reason: string;
  status: "未找到单一发生章节" | "项目归纳时段" | "需继续原文核对";
}

export const CANON_EVENT_SOURCE_UNCERTAINTIES: Record<string, CanonEventSourceUncertainty> = {
  "ayin-sacrifice": { status: "未找到单一发生章节", reason: "事件发生于正篇前，正文通过多次回忆与转述补全，不用某次回忆冒充发生章节。" },
  "clear-sky-retreat": { status: "未找到单一发生章节", reason: "属于正篇前的宗门历史结果，原文为分散回溯。" },
  "bibi-dong-pope": { status: "未找到单一发生章节", reason: "比比东掌控教皇殿是正篇前完成的权力过程，尚无单一章可作发生锚点。" },
  "notting-years": { status: "项目归纳时段", reason: "‘诺丁学院六年修行中期’是游戏对跨年成长的归纳，不是原著单一事件。" },
  "dai-mubai-arrives-soto": { status: "未找到单一发生章节", reason: "戴沐白离开星罗、辗转索托属人物背景，当前未找到正面叙述的单一章。" },
  "five-year-training": { status: "项目归纳时段", reason: "七怪分头修行是跨年过程，各人路线在不同章节回溯，不设伪造的单一开始章。" },
  "d4-heavenly-dragon-test": { status: "需继续原文核对", reason: "项目名‘天龙星龙力测试’尚未对应到足够明确的单一原文仪式，暂不补章节号。" },
};

export function canonEventSourceAnchor(eventId: string): CanonEventSourceAnchor | undefined {
  return CANON_EVENT_SOURCE_ANCHORS[eventId];
}
