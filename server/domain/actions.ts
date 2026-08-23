import { randomUUID } from "node:crypto";
import type { NarrativeEntry } from "../../shared/game.js";
import type { ActionResolution, StoredGame } from "./model.js";

function entry(kind: NarrativeEntry["kind"], text: string): NarrativeEntry {
  return { id: randomUUID(), kind, text, createdAt: new Date().toISOString() };
}

export function resolveAction(game: StoredGame, input: string): ActionResolution {
  const action = input.trim();
  const name = game.view.character?.name ?? "我";

  if (/修炼|冥想|运转/.test(action)) {
    return {
      minutes: 120,
      ruleSummary: "角色进行一次基础修炼；当前尚未突破，消耗两小时并积累训练经历。",
      fallbackNarrative: `我找了一处不受打扰的地方坐下，尝试让呼吸与刚觉醒的力量保持同一个节奏。${game.view.character?.martialSoul.name ?? "武魂"}的存在感时强时弱，像一条还没有被走熟的路。两个小时后，我没有突然变强，却比此前更清楚魂力会在哪些地方失去控制。`,
      suggestions: ["记录刚才最难控制的地方", "向懂行的人请教修炼方法", "休息并观察身体变化"],
    };
  }

  if (/问|询问|打听|说|告诉/.test(action)) {
    return {
      minutes: 15,
      ruleSummary: "角色尝试交流；NPC 只会按自身知识、关系和动机作答。",
      fallbackNarrative: `${name}把问题说了出来。对方没有立刻回答，而是先重新打量了我一遍。那短暂的停顿提醒我：知道答案和愿意把答案告诉我，从来不是一回事。随后，他挑了自己认为可以说的部分开口，语气里仍保留着几分试探。`,
      suggestions: ["追问他刻意略过的部分", "换一个更容易回答的问题", "结束谈话，自己核对线索"],
    };
  }

  if (/去|前往|离开|回家|出门/.test(action)) {
    return {
      minutes: 60,
      ruleSummary: "角色开始移动；首个骨架版本按一小时结算附近区域移动。",
      fallbackNarrative: `我收拾好随身东西，沿着熟悉又像突然陌生起来的道路离开。觉醒后的世界并没有换一副模样，尘土仍会沾上鞋面，路也仍要一步步走完。一个小时后，我抵达了计划中的附近区域，途中没有发生足以迫使我停下的意外。`,
      suggestions: ["先观察周围的人与环境", "确认下一段路程和花费", "寻找可以询问消息的人"],
    };
  }

  if (/攻击|杀|打倒|抢|闯入/.test(action)) {
    return {
      minutes: 10,
      ruleSummary: "当前输入包含高风险行为，但缺乏足够目标或能力条件；尝试失败并产生暴露风险。",
      fallbackNarrative: `我确实尝试了，但念头和做到之间隔着真实的距离。动作刚起，就被眼前的条件逼停。周围已经有人注意到我的异常，原本可以安静处理的事情多了一层戒备。我没有凭一句话获得不属于自己的力量，只为这次鲁莽付出了十分钟和一些难以收回的目光。`,
      suggestions: ["立刻解释刚才的举动", "暂时退开并重新准备", "观察是谁开始警惕我"],
    };
  }

  return {
    minutes: 20,
    ruleSummary: "角色执行一般行动；消耗二十分钟，未触发确定性奖励。",
    fallbackNarrative: `我照自己的想法行动起来。事情没有像故事里那样立刻给出宏大的回应，但每一个细节都留下了痕迹。二十分钟过去，我完成了眼下能够做到的部分，也更清楚下一步还缺少什么。`,
    suggestions: ["检查这次行动留下的结果", "寻找能够提供帮助的人", "改变方法再尝试一次"],
  };
}

export function applyActionResult(
  game: StoredGame,
  input: string,
  result: ActionResolution,
  narrative: string,
  suggestions: string[],
): void {
  game.view.narrative.push(entry("player", input), entry("narration", narrative));
  game.view.suggestions = suggestions.slice(0, 3);
  game.actionIndex += 1;

  if (game.view.worldTime) {
    const [hours, minutes] = game.view.worldTime.time.split(":").map(Number);
    const total = hours * 60 + minutes + result.minutes;
    game.view.worldTime.day += Math.floor(total / 1440);
    const minuteOfDay = total % 1440;
    game.view.worldTime.time = `${Math.floor(minuteOfDay / 60).toString().padStart(2, "0")}:${(minuteOfDay % 60).toString().padStart(2, "0")}`;
  }
  game.view.updatedAt = new Date().toISOString();
}
