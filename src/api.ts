import type {
  DeepSeekSettingsView,
  Difficulty,
  GameView,
  Gender,
  MetaProgressionView,
  PersonalitySetup,
  SaveSummary,
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
  personality: PersonalitySetup;
  seed?: string;
}): Promise<GameView> {
  return request("/api/games", { method: "POST", body: JSON.stringify(input) });
}

export function rerollCandidates(id: string): Promise<GameView> {
  return request(`/api/games/${id}/reroll`, { method: "POST" });
}

export function selectCandidate(id: string, candidateId: string): Promise<GameView> {
  return request(`/api/games/${id}/select`, {
    method: "POST",
    body: JSON.stringify({ candidateId }),
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
