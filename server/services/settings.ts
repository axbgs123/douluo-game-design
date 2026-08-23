import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DeepSeekSettingsView } from "../../shared/game.js";

interface DeepSeekSettingsFile {
  apiKey: string;
  baseUrl: string;
  model: string;
  novelEngineEnabled: boolean;
}

const settingsDirectory = process.env.DOULUO_DATA_DIR ? resolve(process.env.DOULUO_DATA_DIR) : resolve(process.cwd(), ".data");
const settingsPath = resolve(settingsDirectory, "deepseek.json");
const defaults = {
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  novelEngineEnabled: true,
};

export function readDeepSeekSettings(): DeepSeekSettingsFile {
  const environmentKey = process.env.DEEPSEEK_API_KEY?.trim();
  try {
    const file = JSON.parse(readFileSync(settingsPath, "utf8")) as Partial<DeepSeekSettingsFile>;
    return {
      apiKey: environmentKey || file.apiKey || "",
      baseUrl: file.baseUrl || defaults.baseUrl,
      model: file.model || defaults.model,
      novelEngineEnabled: file.novelEngineEnabled !== false,
    };
  } catch {
    return { apiKey: environmentKey || "", ...defaults };
  }
}

export function settingsView(): DeepSeekSettingsView {
  const settings = readDeepSeekSettings();
  return {
    hasKey: Boolean(settings.apiKey),
    baseUrl: settings.baseUrl,
    model: settings.model,
    novelEngineEnabled: settings.novelEngineEnabled,
  };
}

export function writeDeepSeekSettings(input: Omit<DeepSeekSettingsFile, "apiKey"> & { apiKey?: string; clearApiKey?: boolean }): DeepSeekSettingsView {
  const current = readDeepSeekSettings();
  mkdirSync(dirname(settingsPath), { recursive: true });
  const { clearApiKey, ...settings } = input;
  writeFileSync(settingsPath, JSON.stringify({ ...settings, apiKey: clearApiKey ? "" : input.apiKey?.trim() || current.apiKey }, null, 2), { encoding: "utf8", mode: 0o600 });
  return settingsView();
}
