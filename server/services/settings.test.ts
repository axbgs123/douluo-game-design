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
});
