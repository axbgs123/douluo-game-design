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
            "程序已经决定了行动结果；你只能描写这个结果，不能改变胜负、时间、伤势、物品、魂力或关系。",
            "保持中文小说感、人物动机连续和世界内视角，不泄露角色不知道的隐藏设定。",
            "输出 JSON：{\"narrative\":\"2至5段第一人称正文\",\"suggestions\":[\"建议1\",\"建议2\",\"建议3\"]}。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            character: game.character,
            personality: game.personalitySummary,
            location: game.location,
            worldTime: game.worldTime,
            recentNarrative: game.narrative.slice(-4),
            playerInput,
            fixedRuleResult: resolution.ruleSummary,
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
