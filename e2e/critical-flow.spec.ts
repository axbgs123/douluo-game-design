import { expect, test } from "@playwright/test";

async function createPlayingCharacter(page: import("@playwright/test").Page, era: 1 | 2 | 3 | 4) {
  await page.goto("/");
  if (era > 1) await page.getByRole("button", { name: `斗${era === 2 ? "二" : era === 3 ? "三" : "四"}` }).click();
  await page.getByRole("button", { name: "抽取三名角色" }).click();
  await expect(page.getByRole("heading", { name: "选择角色" })).toBeVisible();
  await page.locator(".select-button").first().click();
  await expect(page.getByRole("heading", { name: "性格底色" })).toBeVisible();
  for (const question of await page.locator(".question-card").all()) await question.locator("label").first().click();
  await page.getByRole("button", { name: "确认性格，进入觉醒" }).click();
  await expect(page.getByRole("button", { name: "觉醒武魂" })).toBeVisible();
  await page.getByRole("button", { name: "觉醒武魂" }).click();
  await expect(page.getByRole("heading", { name: "看清武魂后，再定此生所求" })).toBeVisible();
  await page.getByRole("button", { name: "确定目标，开始故事" }).click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
}

async function submitAction(page: import("@playwright/test").Page, action: string) {
  await page.getByPlaceholder("输入行动或对话……").fill(action);
  await page.getByRole("button", { name: "行动", exact: true }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText(action);
  await expect(page.locator(".action-form textarea")).toBeEnabled();
}

async function clickEraAction(page: import("@playwright/test").Page, buttonName: string, submittedAction: string) {
  await page.getByRole("button", { name: "时代", exact: true }).click();
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText(submittedAction);
  await expect(page.locator(".action-form textarea")).toBeEnabled();
}

test.beforeEach(async ({ request }) => {
  const games = await request.get("/api/games");
  expect(games.ok()).toBeTruthy();
  for (const game of await games.json() as Array<{ id: string }>) {
    const deleted = await request.delete(`/api/games/${game.id}`);
    expect(deleted.ok()).toBeTruthy();
  }
});

test("玩家可以完成角色创建、推进故事并管理存档", async ({ page }) => {
  await createPlayingCharacter(page, 1);
  await submitAction(page, "在住处等待一天，留意附近动静");
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
  await expect(page.getByText("斗罗联邦", { exact: true })).toBeVisible();
  await expect(page.getByText("天罗星", { exact: true })).toBeVisible();
  await expect(page.getByText("天斗星", { exact: true })).toBeVisible();
  await expect(page.getByText("天斗帝国", { exact: true })).toHaveCount(0);
});

test("斗二斗三斗四专属系统可以从浏览器行动并显示持久状态", async ({ page }) => {
  await createPlayingCharacter(page, 2);
  await clickEraAction(page, "学习核心阵法", "学习一级魂导器核心阵法");
  await expect(page.getByText(/熟练度 [1-9][0-9]?%/)).toBeVisible();
  await expect(page.getByText("魂灵与魂导纪元", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "返回书架" }).click();
  await createPlayingCharacter(page, 3);
  await page.getByRole("button", { name: "地图", exact: true }).click();
  await expect(page.getByText("傲来城", { exact: true }).first()).toBeVisible();
  await clickEraAction(page, "机甲模拟", "进行机甲模拟训练");
  await expect(page.getByText("机甲执照 · 无", { exact: true })).toBeVisible();
  await expect(page.getByText(/模拟训练 \d+% · 1 次/)).toBeVisible();

  await page.getByRole("button", { name: "返回书架" }).click();
  await createPlayingCharacter(page, 4);
  await expect(page.locator(".world-clock strong")).toContainText("蓝轩宇");
  await expect(page.locator(".world-clock strong")).not.toContainText("唐三");
  await clickEraAction(page, "舰桥模拟", "进行星舰指挥模拟训练");
  await expect(page.getByText("星舰资格 · 无", { exact: true })).toBeVisible();
  await expect(page.getByText(/指挥训练 \d+% · 船员 0 · 完成任务 0/)).toBeVisible();
});
