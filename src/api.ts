import type {
  DeepSeekSettingsView,
  Difficulty,
  GameView,
  Gender,
  MetaProgressionView,
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

export function createGame(input: {
  gender: Gender;
  difficulty: Difficulty;
  personality?: PersonalitySetup;
  lifeGoal?: string;
  seed?: string;
}): Promise<GameView> {
  return request("/api/games", { method: "POST", body: JSON.stringify(input) });
}

export function rerollCharacterShaping(id: string, part: "goals" | "personality"): Promise<GameView> {
  return request(`/api/games/${id}/shaping/reroll`, { method: "POST", body: JSON.stringify({ part }) });
}

export function completeCharacterShaping(id: string, input: { keywords: string[]; answers: Record<string, string>; lifeGoal: string }): Promise<GameView> {
  return request(`/api/games/${id}/shaping/complete`, { method: "POST", body: JSON.stringify(input) });
}

export function rerollCandidates(id: string): Promise<GameView> {
  return request(`/api/games/${id}/reroll`, { method: "POST" });
}

export function selectCandidate(id: string, candidateId: string, customName?: string): Promise<GameView> {
  return request(`/api/games/${id}/select`, {
    method: "POST",
    body: JSON.stringify({ candidateId, customName: customName?.trim() || undefined }),
  });
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

export function getDeepSeekSettings(): Promise<DeepSeekSettingsView> {
  return request("/api/settings/deepseek");
}

export function saveDeepSeekSettings(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
}): Promise<DeepSeekSettingsView> {
  return request("/api/settings/deepseek", { method: "POST", body: JSON.stringify(input) });
}
