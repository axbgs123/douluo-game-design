import type { GameView } from "../../shared/game.js";
import type { ActionResolution } from "../domain/model.js";
import { readDeepSeekSettings } from "./settings.js";

interface NarrationResult {
  narrative: string;
  suggestions: string[];
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

export async function narrateWithDeepSeek(
  game: GameView,
  playerInput: string,
  resolution: ActionResolution,
): Promise<NarrationResult | null> {
  const settings = readDeepSeekSettings();
  if (!settings.apiKey) return null;

  const response = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: settings.model,
      response_format: { type: "json_object" },
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: [
            "你是《斗罗大陆》第一部背景的第一人称互动小说叙事器。",
            "程序已经决定了行动结果；你只能描写这个结果，不能改变胜负、时间、伤势、物品、魂力、关系、猎魂阶段或世界事件。",
            "保持中文小说感、人物动机连续和世界内视角，不泄露角色不知道的隐藏设定。",
            "正文从眼前正在发生的动作或感官细节写起，句子长短要有变化。NPC 的说话方式要符合年龄、身份和当下顾虑。",
            "少做解释，多写手上的动作、衣物、气味、声音、停顿和不体面的细节。允许人物判断错、犹豫或话说半截。",
            "删掉空泛升华、万能比喻、整齐排比和总结性收尾。不要使用「首先、其次、最后」「值得注意的是」「这意味着」「本质上」「不是……而是……」等模板句。",
            "不要为了文艺感把普通行动写成命运、时代、道路或宏大回响。每次只抓一两个有效细节，不要堆满五感。",
            "战斗时写清站位、试探、失误和代价；交谈时保留对方的私心与信息边界；赶路和修炼可以简写，但要留下具体变化。",
            "建议必须是角色眼下做得到的动作。若程序给出了建议，优先沿用其含义。",
            "输出 JSON：{\"narrative\":\"1至4段第一人称正文\",\"suggestions\":[\"建议1\",\"建议2\",\"建议3\"]}。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            character: game.character,
            personality: game.personalitySummary,
            location: game.location,
            worldTime: game.worldTime,
            lifeGoal: game.lifeGoal,
            currentTaskRecords: game.tasks.filter((task) => task.status !== "完成").slice(0, 6),
            hunting: game.hunting,
            combat: game.combat,
            knownFigures: game.knownFigures.slice(0, 8),
            recentNews: game.news.slice(-5),
            visibleMap: game.map.filter((location) => location.discovered).map(({ name, danger, current }) => ({ name, danger, current })),
            recentNarrative: game.narrative.slice(-4),
            playerInput,
            fixedRuleResult: resolution.ruleSummary,
            fixedSuggestions: resolution.suggestions,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek 请求失败：${response.status}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 返回了空内容");
  const parsed = extractJson(content) as Partial<NarrationResult>;
  if (typeof parsed.narrative !== "string" || !Array.isArray(parsed.suggestions)) {
    throw new Error("DeepSeek 返回结构不合法");
  }

  return {
    narrative: parsed.narrative,
    suggestions: parsed.suggestions.filter((item): item is string => typeof item === "string").slice(0, 3),
  };
}
