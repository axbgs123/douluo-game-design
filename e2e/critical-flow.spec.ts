import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const games = await request.get("/api/games");
  expect(games.ok()).toBeTruthy();
  for (const game of await games.json() as Array<{ id: string }>) {
    const deleted = await request.delete(`/api/games/${game.id}`);
    expect(deleted.ok()).toBeTruthy();
  }
});

test("玩家可以完成角色创建、推进故事并管理存档", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "抽取三名角色" }).click();
  await expect(page.getByRole("heading", { name: "选择角色" })).toBeVisible();

  await page.locator(".select-button").first().click();
  await expect(page.getByRole("heading", { name: "性格底色" })).toBeVisible();
  for (const question of await page.locator(".question-card").all()) await question.locator("label").first().click();
  await page.getByRole("button", { name: "确认性格，进入觉醒" }).click();

  await page.getByRole("button", { name: "觉醒武魂" }).click();
  await expect(page.getByRole("heading", { name: "看清武魂后，再定此生所求" })).toBeVisible();
  await page.getByRole("button", { name: "确定目标，开始故事" }).click();

  const action = page.getByPlaceholder("输入行动或对话……");
  await expect(action).toBeVisible();
  await action.fill("在住处等待一天，留意附近动静");
  await page.getByRole("button", { name: "行动", exact: true }).click();
  await expect(page.getByText("晨光沿着窗纸落进屋里", { exact: false })).toBeVisible();
  await page.getByText("查看判定", { exact: true }).click();
  await expect(page.locator(".action-receipt small")).toContainText("世界时间推进");

  await page.getByRole("button", { name: "返回书架" }).click();
  await expect(page.getByRole("heading", { name: "存档" })).toBeVisible();
  await page.locator(".delete-save").first().click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.locator(".save-shelf")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "抽取三名角色" })).toBeVisible();
});

test("玩家可以从界面进入斗四且出生地图不会显示斗一地标", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "斗四" }).click();
  await expect(page.getByRole("heading", { name: "终极斗罗" })).toBeVisible();
  await page.getByRole("button", { name: "抽取三名角色" }).click();
  await expect(page.getByRole("heading", { name: "选择角色" })).toBeVisible();
  await expect(page.locator(".candidate-meta").first()).toContainText("蓝轩宇");
  await expect(page.getByText("武魂城", { exact: true })).toHaveCount(0);
  await expect(page.getByText("诺丁城", { exact: true })).toHaveCount(0);
});
