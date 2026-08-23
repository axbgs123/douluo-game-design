import type {
  DeepSeekSettingsView,
  CheckpointSummary,
  Difficulty,
  GameView,
  Gender,
  MetaProgressionView,
  ModelUsageView,
  PersonalitySetup,
  SaveSummary,
  WorldCatalogStatsView,
} from "../shared/game";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "请求失败");
  return payload;
}

export function listGames(): Promise<SaveSummary[]> {
  return request("/api/games");
}

export function getMetaProgression(): Promise<MetaProgressionView> {
  return request("/api/meta");
}

export function loadGame(id: string): Promise<GameView> {
  return request(`/api/games/${id}`);
}

export function deleteGame(id: string): Promise<{ ok: boolean }> {
  return request(`/api/games/${id}`, { method: "DELETE" });
}

export function listCheckpoints(id: string): Promise<CheckpointSummary[]> {
  return request(`/api/games/${id}/checkpoints`);
}

export function createCheckpoint(id: string): Promise<CheckpointSummary[]> {
  return request(`/api/games/${id}/checkpoints`, { method: "POST" });
}

export function restoreCheckpoint(id: string, checkpointId: number): Promise<GameView> {
  return request(`/api/games/${id}/checkpoints/${checkpointId}/restore`, { method: "POST" });
}

export function createGame(input: {
  era?: 1 | 2 | 3 | 4;
  gender: Gender;
  difficulty: Difficulty;
  personality?: PersonalitySetup;
  lifeGoal?: string;
  seed?: string;
}): Promise<GameView> {
  return request("/api/games", { method: "POST", body: JSON.stringify(input) });
}

export function createEraSuccessor(id: string): Promise<GameView> {
  return request(`/api/games/${id}/successor`, { method: "POST" });
}

export function rerollCharacterShaping(id: string, part: "goals" | "personality", lockedSlots: number[] = []): Promise<GameView> {
  return request(`/api/games/${id}/shaping/reroll`, { method: "POST", body: JSON.stringify({ part, lockedSlots }) });
}

export function completeCharacterShaping(id: string, input: { personalityId: string; keywords: string[]; answers: Record<string, string> }): Promise<GameView> {
  return request(`/api/games/${id}/shaping/complete`, { method: "POST", body: JSON.stringify(input) });
}

export function selectLifeGoal(id: string, lifeGoal: string): Promise<GameView> {
  return request(`/api/games/${id}/life-goal`, { method: "POST", body: JSON.stringify({ lifeGoal }) });
}

export function rerollCandidates(id: string, lockedSlots: number[] = []): Promise<GameView> {
  return request(`/api/games/${id}/reroll`, { method: "POST", body: JSON.stringify({ lockedSlots }) });
}

export function selectCandidate(id: string, candidateId: string, customName?: string): Promise<GameView> {
  return request(`/api/games/${id}/select`, {
    method: "POST",
    body: JSON.stringify({ candidateId, customName: customName?.trim() || undefined }),
  });
}

export function addMapPin(id: string, input: { label: string; x: number; y: number }): Promise<GameView> {
  return request(`/api/games/${id}/map/pins`, { method: "POST", body: JSON.stringify(input) });
}

export function removeMapPin(id: string, pinId: string): Promise<GameView> {
  return request(`/api/games/${id}/map/pins/${pinId}`, { method: "DELETE" });
}

export function awakenCharacter(id: string): Promise<GameView> {
  return request(`/api/games/${id}/awaken`, { method: "POST" });
}

export function submitAction(id: string, input: string): Promise<GameView> {
  return request(`/api/games/${id}/action`, {
    method: "POST",
    body: JSON.stringify({ input }),
  });
}

export type ActionStreamEvent =
  | { type: "phase"; phase: string; label: string }
  | { type: "draft"; text: string }
  | { type: "retry"; attempt: number; label: string }
  | { type: "done"; game: GameView; explanation: string }
  | { type: "error"; message: string; retryable?: boolean };

export class ActionStreamError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "ActionStreamError";
  }
}

export async function streamAction(
  id: string,
  input: string,
  requestId: string,
  onEvent: (event: ActionStreamEvent) => void,
  signal?: AbortSignal,
): Promise<GameView> {
  const response = await fetch(`/api/games/${id}/action/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, requestId }),
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new ActionStreamError(payload.error ?? "推演请求失败", response.status === 408 || response.status === 429 || response.status >= 500);
  }
  if (!response.body) throw new Error("浏览器不支持流式正文");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: GameView | undefined;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as ActionStreamEvent;
      onEvent(event);
      if (event.type === "error") throw new ActionStreamError(event.message, event.retryable !== false);
      if (event.type === "done") completed = event.game;
    }
    if (done) break;
  }
  if (!completed) throw new Error("推演在提交前中断，存档没有变化");
  return completed;
}

export function rewriteLastAction(id: string): Promise<GameView> {
  return request(`/api/games/${id}/action/rewrite`, { method: "POST" });
}

export function changeSpeed(id: string, speed: GameView["speed"]): Promise<GameView> {
  return request(`/api/games/${id}/speed`, { method: "POST", body: JSON.stringify({ speed }) });
}

export function endRun(id: string, reason?: string): Promise<GameView> {
  return request(`/api/games/${id}/end`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function saveMetaPreferences(input: MetaProgressionView["weightPreferences"]): Promise<MetaProgressionView> {
  return request("/api/meta/preferences", { method: "POST", body: JSON.stringify(input) });
}

export function purchaseMetaUpgrade(name: "命运余量" | "稳固根基" | "旧世见闻"): Promise<MetaProgressionView> {
  return request("/api/meta/purchase", { method: "POST", body: JSON.stringify({ name }) });
}

export function equipMetaHeirloom(name?: string): Promise<MetaProgressionView> {
  return request("/api/meta/equip", { method: "POST", body: JSON.stringify({ name }) });
}

export function getWorldCatalogStats(): Promise<WorldCatalogStatsView> {
  return request("/api/world/catalog/stats");
}

export function drawMetaMartialSoul(): Promise<{ meta: MetaProgressionView; drawn: MetaProgressionView["martialSoulCodex"][number]; cost: number }> {
  return request("/api/meta/martial-souls/draw", { method: "POST" });
}

export function equipMetaMartialSoul(id?: string): Promise<MetaProgressionView> {
  return request("/api/meta/martial-souls/equip", { method: "POST", body: JSON.stringify({ id }) });
}

export function toggleMetaMartialSoul(id: string, enabled: boolean): Promise<MetaProgressionView> {
  return request("/api/meta/martial-souls/toggle", { method: "POST", body: JSON.stringify({ id, enabled }) });
}

export function getDeepSeekSettings(): Promise<DeepSeekSettingsView> {
  return request("/api/settings/deepseek");
}

export function getModelUsage(gameId?: string): Promise<ModelUsageView> {
  return request(`/api/settings/deepseek/usage${gameId ? `?gameId=${encodeURIComponent(gameId)}` : ""}`);
}

export function saveDeepSeekSettings(input: {
  apiKey?: string;
  clearApiKey?: boolean;
  baseUrl: string;
  model: string;
  novelEngineEnabled: boolean;
}): Promise<DeepSeekSettingsView> {
  return request("/api/settings/deepseek", { method: "POST", body: JSON.stringify(input) });
}
