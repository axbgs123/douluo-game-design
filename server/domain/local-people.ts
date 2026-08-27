import type { RelationView } from "../../shared/game.js";
import type { StoredGame } from "./model.js";

function roleText(relation: RelationView): string {
  return `${relation.name}${relation.relation}${relation.impression}${relation.category ?? ""}`;
}

function defaultLocalState(game: StoredGame, relation: RelationView): NonNullable<RelationView["localState"]> {
  const text = roleText(relation);
  const locationId = game.view.locationId ?? game.view.character?.locationId ?? "notting-city";
  if (/父亲|父与|父子|父女|养父/.test(text)) return {
    currentGoal: "维持家庭眼前的生活，并为孩子的成长决定能够实际承担多少",
    responsibility: "家庭生计、监护、安全与需要本人签字的长期选择",
    informationBoundary: ["共同生活中亲眼知道的事", "家庭与本人职责内的消息", "不知道孩子没有公开的秘密"],
    authority: "可以决定家庭支出、陪同、担保与本人拥有的资源，不能替学院、宗门或孩子本人作主",
    resources: ["家庭住处", "现有收入与人情", "监护和来处证明"],
    nextAction: "核对家中能承担的训练、食宿与出行条件",
    locationId, status: "计划中", updatedOrdinal: (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1),
  };
  if (/母亲|母与|母子|母女|养母/.test(text)) return {
    currentGoal: "照料家庭生活，同时判断孩子当前成长路线的风险与实际需要",
    responsibility: "日常照料、健康、家庭支出与监护意见",
    informationBoundary: ["共同生活中亲眼知道的事", "本人工作和家庭范围内的消息", "不知道未公开武魂或远方势力秘密"],
    authority: "可以调动本人掌握的家庭物资和照料关系，不能凭亲属身份替外部机构批准资源",
    resources: ["家庭住处", "日常照料与本人职业资源", "亲属和邻里关系"],
    nextAction: "检查孩子近期状态，并处理家中当天必须完成的事情",
    locationId, status: "计划中", updatedOrdinal: (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1),
  };
  if (/老师|导师|教官|教习|长老|师父|班主任/.test(text)) return {
    currentGoal: "完成本人负责的教学或考察，不让天赋评价替代真实训练结果",
    responsibility: "职责范围内的课程、训练、记录与安全边界",
    informationBoundary: ["本人亲眼见到的训练与测试", "所属机构授权提供的资料", "不知道学生未公开的秘密"],
    authority: "可以安排本人负责的课程和测试；资源、录取、收徒与猎魂仍服从实际职位和机构权限",
    resources: ["本人教学时间", "职责内训练场或记录", "能够正式申请的有限协助"],
    nextAction: "完成一次职责内检查，并记录学生当前最需要补的地方",
    locationId, status: "计划中", updatedOrdinal: (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1),
  };
  if (/同学|同辈|堂亲|竞争|朋友|同伴/.test(text)) return {
    currentGoal: "推进自己的训练、名次或家庭目标，同时判断是否与主角合作",
    responsibility: "自己的课程、训练、小组承诺和家庭要求",
    informationBoundary: ["共同经历与公开消息", "自己家庭或小组范围内的事", "不知道主角的私人秘密"],
    authority: "只能代表自己作出同组、切磋、交换或拒绝，不能调动家族和学院全部资源",
    resources: ["个人训练时间", "公开课程与同辈消息", "本人能够支配的少量物品"],
    nextAction: "完成自己的当天训练，并决定是否提出一次具体合作或竞争",
    locationId, status: "计划中", updatedOrdinal: (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1),
  };
  return {
    currentGoal: "维持当前生活与职责，并处理眼前能够确认的事情",
    responsibility: relation.relation || "个人生活",
    informationBoundary: ["亲历、被告知或职责内能够查到的事", "不知道未经证实的秘密"],
    authority: "只能使用本人实际身份、关系与资源",
    resources: ["个人时间", "现有关系", "职责内可用条件"],
    nextAction: "处理一项本人职责内的具体事务",
    locationId, status: "计划中", updatedOrdinal: (game.view.worldTime?.year ?? 0) * 360 + (game.view.worldTime?.day ?? 1),
  };
}

export function ensureLocalPeople(game: StoredGame): void {
  for (const relation of game.view.relations) {
    if (relation.category === "势力" || (relation.id && game.world.npcs[relation.id])) continue;
    relation.localState ??= defaultLocalState(game, relation);
  }
}

export function relationTargetsForAction(game: StoredGame, action: string): RelationView[] {
  const exact = game.view.relations.filter((relation) => action.includes(relation.name));
  if (exact.length) return exact;
  const rolePatterns: Array<[RegExp, RegExp]> = [
    [/父亲|父亲大人|爹|爸爸/, /父亲|父与|父子|父女|养父/],
    [/母亲|母亲大人|娘|妈妈/, /母亲|母与|母子|母女|养母/],
    [/父母|双亲|家人|监护人/, /父亲|母亲|养父|养母|监护|亲属/],
    [/师父/, /师父|师徒/],
    [/老师|教习|教官|班主任/, /老师|导师|教习|教官|班主任/],
    [/长老/, /长老/],
    [/同学|同辈|同龄人/, /同学|同辈|堂亲|竞争者/],
  ];
  const role = rolePatterns.find(([mention]) => mention.test(action));
  return role ? game.view.relations.filter((relation) => role[1].test(roleText(relation))) : [];
}

export function advanceLocalPeople(game: StoredGame, currentOrdinal: number): void {
  ensureLocalPeople(game);
  for (const relation of game.view.relations) {
    const state = relation.localState;
    if (!state || currentOrdinal - state.updatedOrdinal < 30) continue;
    const text = roleText(relation);
    const samePlace = state.locationId === game.view.locationId;
    state.status = samePlace ? "执行中" : "受阻";
    state.lastOutcome = samePlace
      ? /父亲|母亲|养父|养母/.test(text)
        ? "完成了本周期的家庭事务核对；能提供的帮助仍受收入、职责和本人意愿限制"
        : /老师|导师|教官|教习|长老|师父|班主任/.test(text)
          ? "完成了职责内课程或训练记录；没有把一次表现直接写成长期资格"
          : /同学|同辈|竞争|朋友|同伴/.test(text)
            ? "推进了自己的训练或家庭目标，对主角的态度仍取决于共同经历"
            : "完成了一项本人职责内事务"
      : "当前不在同一地点，只保留原有关系，没有凭空参与主角现场";
    state.nextAction = samePlace
      ? /父亲|母亲|养父|养母/.test(text) ? "根据家庭收支、孩子表现和安全风险决定下一次能够承担什么"
        : /老师|导师|教官|教习|长老|师父|班主任/.test(text) ? "根据最近记录调整下一轮课程、负荷或考察要求"
          : /同学|同辈|竞争|朋友|同伴/.test(text) ? "决定下一次是合作训练、公开切磋还是优先处理自己的事情"
            : "继续处理当前职责"
      : "先完成自己的行程，只有真实抵达后才能参与现场";
    state.updatedOrdinal = currentOrdinal;
    if (samePlace && /父亲|母亲|养父|养母/.test(text)) {
      game.view.family.householdNotes = [...game.view.family.householdNotes, `${relation.name}：${state.lastOutcome}`].slice(-12);
    }
  }
}
