import { randomUUID } from "node:crypto";
import type { NarrativeEntry } from "../../shared/game.js";
import type { ActionResolution, StoredGame } from "./model.js";

function entry(kind: NarrativeEntry["kind"], text: string): NarrativeEntry {
  return { id: randomUUID(), kind, text, createdAt: new Date().toISOString() };
}

export function resolveAction(game: StoredGame, input: string): ActionResolution {
  const action = input.trim();
  const trainingText = [
    `我在墙边盘腿坐下，照着记得的办法慢慢呼吸。${game.view.character?.martialSoul.name ?? "武魂"}召出来三次，第二次撑得最久，收回去时手腕还在发酸。两个小时没换来突破，只摸清了一处魂力容易散掉的地方。`,
    `门缝一直漏风，我索性把外衣垫在膝下。魂力刚走到胸口就乱了，重来几次才勉强接上。起身时双腿麻得站不稳，两个时辰已经过去。`,
  ][game.actionIndex % 2];

  if (/修炼|冥想|运转/.test(action)) {
    return {
      minutes: 120,
      ruleSummary: "角色进行一次基础修炼；当前尚未突破，消耗两小时并积累训练经历。",
      fallbackNarrative: trainingText,
      suggestions: ["记录刚才最难控制的地方", "向懂行的人请教修炼方法", "休息并观察身体变化"],
    };
  }

  if (/问|询问|打听|说|告诉/.test(action)) {
    return {
      minutes: 15,
      ruleSummary: "角色尝试交流；NPC 只会按自身知识、关系和动机作答。",
      fallbackNarrative: "我把问题问了。对方的眼睛往门口瞟了一下，手指还在桌沿上敲。过了片刻，他只答了前半句，后面的事推说记不清。我没拆穿他，至少记住了他避开的那个名字。",
      suggestions: ["追问他刻意略过的部分", "换一个更容易回答的问题", "结束谈话，自己核对线索"],
    };
  }

  if (/去|前往|离开|回家|出门/.test(action)) {
    return {
      minutes: 60,
      ruleSummary: "角色开始移动；首个骨架版本按一小时结算附近区域移动。",
      fallbackNarrative: "我把干粮塞进旧布包，顺着土路出了门。前半程还能听见村里的鸡叫，后来只剩鞋底碾过碎石的声音。走了约一个时辰，我到了附近区域，脚后跟磨得有点疼，路上没碰见麻烦。",
      suggestions: ["先观察周围的人与环境", "确认下一段路程和花费", "寻找可以询问消息的人"],
    };
  }

  if (/攻击|杀|打倒|抢|闯入/.test(action)) {
    return {
      minutes: 10,
      ruleSummary: "当前输入包含高风险行为，但缺乏足够目标或能力条件；尝试失败并产生暴露风险。",
      fallbackNarrative: "我刚迈出一步，对方就侧身挡住了路。距离、人数和我的力气都不合适，再动手只会当场吃亏。我停得还算快，可旁边已经有人看了过来。十分钟白费了，那几道戒备的目光暂时也甩不掉。",
      suggestions: ["立刻解释刚才的举动", "暂时退开并重新准备", "观察是谁开始警惕我"],
    };
  }

  return {
    minutes: 20,
    ruleSummary: "角色执行一般行动；消耗二十分钟，未触发确定性奖励。",
    fallbackNarrative: "我照着自己的想法试了二十分钟。能做的部分做完了，剩下的卡在眼前，手边缺东西，也没人会立刻替我补上。周围没有异象，只有刚才动过的物件还留在原处。",
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
