import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDirectoryPrefix = join(tmpdir(), "douluo-settings-test-");
const testDirectory = mkdtempSync(testDirectoryPrefix);
process.env.DOULUO_DATA_DIR = testDirectory;
const settings = await import("./settings.js");

afterAll(() => {
  delete process.env.DOULUO_DATA_DIR;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_BASE_URL;
  delete process.env.DEEPSEEK_MODEL;
  if (testDirectory.startsWith(testDirectoryPrefix)) rmSync(testDirectory, { recursive: true, force: true });
});

describe("模型设置", () => {
  it("enables the novel engine by default and preserves the key when only toggling it", () => {
    expect(settings.readDeepSeekSettings().novelEngineEnabled).toBe(true);
    settings.writeDeepSeekSettings({ apiKey: "test-key", baseUrl: "https://api.deepseek.com", model: "deepseek-test", novelEngineEnabled: false });
    expect(settings.settingsView()).toMatchObject({ hasKey: true, novelEngineEnabled: false });
    settings.writeDeepSeekSettings({ baseUrl: "https://api.deepseek.com", model: "deepseek-test", novelEngineEnabled: true });
    expect(settings.readDeepSeekSettings()).toMatchObject({ apiKey: "test-key", novelEngineEnabled: true });
  });

  it("can explicitly remove a saved API key", () => {
    settings.writeDeepSeekSettings({ clearApiKey: true, baseUrl: "https://api.deepseek.com", model: "deepseek-test", novelEngineEnabled: true });
    expect(settings.settingsView().hasKey).toBe(false);
  });

  it("allows an isolated deployment to override all connection fields with environment variables", () => {
    process.env.DEEPSEEK_API_KEY = "environment-key";
    process.env.DEEPSEEK_BASE_URL = "http://127.0.0.1:18999";
    process.env.DEEPSEEK_MODEL = "environment-model";
    expect(settings.readDeepSeekSettings()).toMatchObject({
      apiKey: "environment-key",
      baseUrl: "http://127.0.0.1:18999",
      model: "environment-model",
    });
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.DEEPSEEK_MODEL;
  });
});
