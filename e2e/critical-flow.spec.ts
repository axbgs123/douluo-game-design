import { expect, test } from "@playwright/test";

let fixtureDatabase: typeof import("../server/db.js") | undefined;

async function seedComboTrainingGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 1, gender: "男", difficulty: "标准", seed: "e2e-combo-training" });
  generator.selectCandidate(game, game.view.candidates[0].id, "连携验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  game.view.relations.push(
    { id: "e2e-guard", name: "石岳", relation: "防御系护卫", impression: "可靠并擅长盾牌守护", strength: 70, category: "同伴" },
    { id: "e2e-healer", name: "苏叶", relation: "治疗系医师", impression: "可靠并擅长治愈救护", strength: 70, category: "同伴" },
  );
  game.view.hunting = { stage: "准备", ringIndex: 1, recommendations: [], preparation: [], trailProgress: "连携训练验收场" };
  database.saveGame(game, "e2e.combo-fixture");
}

async function seedMediaAccountabilityGame() {
  process.env.DOULUO_DATA_DIR = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";
  const [generator, actions, world, database] = await Promise.all([import("../server/domain/generator.js"), import("../server/domain/actions.js"), import("../server/domain/world.js"), import("../server/db.js")]);
  fixtureDatabase = database;
  const game = generator.createGame({ era: 1, gender: "女", difficulty: "标准", seed: "e2e-media-accountability" });
  generator.selectCandidate(game, game.view.candidates[0].id, "媒介验收");
  const personality = game.view.shaping!.personalityOptions[0];
  generator.finalizeCharacterShaping(game, { personalityId: personality.id, keywords: personality.keywords, answers: Object.fromEntries(personality.questions.map((question) => [question.id, question.options[0].id])) });
  generator.awakenCharacter(game);
  generator.selectLifeGoal(game, game.view.shaping!.lifeGoalOptions[0]);
  for (const npc of Object.values(game.world.npcs)) npc.locationId = "offscreen-e2e";
  for (const [index, witness] of Object.values(game.world.npcs).slice(0, 6).entries()) {
    witness.alive = true;
    witness.currentGoal = "保存现场证词";
    witness.locationId = game.view.locationId!;
    witness.factionIds = [index % 2 ? "spirit-hall" : "shrek"];
  }
  const crime = actions.resolveAction(game, "在街口公开抢劫");
  actions.applyActionResult(game, "在街口公开抢劫", crime, crime.fallbackNarrative, crime.suggestions);
  world.advanceWorldTime(game, 20 * 1_440);
  if (!game.world.socialRumors.some((rumor) => rumor.mediaStatus === "已刊发" && rumor.valence < 0)) throw new Error("媒体 E2E 夹具未形成已刊发负面报道");
  database.saveGame(game, "e2e.media-fixture");
}

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

test.afterAll(() => fixtureDatabase?.closeDatabase());

test("玩家可以完成角色创建、推进故事并管理存档", async ({ page }) => {
  await createPlayingCharacter(page, 1);
  await page.getByRole("button", { name: "背包", exact: true }).click();
  await expect(page.getByRole("button", { name: "承接货运", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^手记/ }).click();
  await page.getByPlaceholder("搜索已知档案……").fill("第一魂环");
  await expect(page.locator(".known-record-search")).toContainText("获得第一魂环");
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
  await expect(page.getByText("机甲资质 · 无", { exact: true })).toBeVisible();
  await expect(page.getByText(/模拟训练 \d+% · 1 次/)).toBeVisible();

  await page.getByRole("button", { name: "返回书架" }).click();
  await createPlayingCharacter(page, 4);
  await expect(page.locator(".world-clock strong")).toContainText("蓝轩宇");
  await expect(page.locator(".world-clock strong")).not.toContainText("唐三");
  await clickEraAction(page, "舰桥模拟", "进行星舰指挥模拟训练");
  await expect(page.getByText("星舰资格 · 无", { exact: true })).toBeVisible();
  await expect(page.getByText(/指挥训练 0% · 真实飞行 0 小时 · 船员 0 · 舰桥协同 0% · 完成任务 0/)).toBeVisible();
});

test("机构分支、失败代价与具名复核人会谈会持久显示到任务界面", async ({ page }) => {
  await createPlayingCharacter(page, 1);
  await submitAction(page, "申请学院入学");
  await page.getByRole("button", { name: "人物", exact: true }).click();
  await expect(page.locator(".affiliation-list article").first()).toBeVisible();
  await page.locator(".affiliation-list article").first().getByRole("button", { name: "领任务" }).click();
  await expect(page.locator(".action-form textarea")).toBeEnabled();
  await page.getByRole("button", { name: /^任务/ }).click();
  const assignment = page.locator(".task-timeline article").filter({ hasText: "分支" }).first();
  await expect(assignment).toBeVisible();
  await expect(assignment).toContainText(/外勤分支|情报分支|支援分支/);
  await expect(assignment).toContainText("失败代价");
  const reviewer = page.locator(".player-relation-ledger article").first();
  await expect(reviewer).toBeVisible();
  await expect(reviewer).toContainText("复核执事");
  await reviewer.getByRole("button", { name: "询问异议" }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText("当前验收异议");
  await expect(reviewer).toContainText("会谈 1");
});

test("固定连携训练会在浏览器显示熟练度、战术分支与失败复盘", async ({ page }) => {
  await seedComboTrainingGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "连携验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  for (let session = 1; session <= 6; session += 1) await submitAction(page, "与石岳和苏叶共同训练生命防线连携");
  await page.getByRole("button", { name: /^猎魂/ }).click();
  const training = page.locator(".player-relation-ledger article").filter({ hasText: "生命防线" });
  await expect(training).toBeVisible();
  await expect(training).toContainText("轮换救护");
  await expect(training).toContainText("训练 6 次 · 失败复盘 1 次 · 证据 6 条");
});

test("责任编辑采访、独立补证与更正会形成完整浏览器责任链", async ({ page }) => {
  await seedMediaAccountabilityGame();
  await page.goto("/");
  const save = page.locator(".save-shelf article").filter({ hasText: "媒介验收" });
  await expect(save).toBeVisible();
  await save.locator("button").first().click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: /^世界/ }).click();
  const editor = page.locator(".media-accountability-panel article").filter({ hasText: "沈砚" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "采访编辑" }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText("询问选稿依据");
  await expect(editor).toContainText("互动 1 次");
  await submitAction(page, "调查报道来源和现场记录");
  await editor.getByRole("button", { name: "补交材料" }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText("提交补充证据");
  await expect(editor).toContainText("互动 2 次");
  await submitAction(page, "申请核验负面传闻");
  await submitAction(page, "调查消息来源和现场记录");
  await submitAction(page, "提交调查证据公开澄清负面传闻");
  await expect(editor).toContainText("已签发更正");
  await expect(page.locator(".news-list")).toContainText("更正说明");
  await expect(page.locator(".news-list")).toContainText("旧消息");
});

test("有效结算可以在同一存档开启下一时代并核验累积谱系", async ({ page }) => {
  test.setTimeout(90_000);
  await createPlayingCharacter(page, 1);
  for (let day = 1; day <= 8; day += 1) await submitAction(page, `在住处训练并记录第${day}天的变化`);
  await page.getByRole("button", { name: "申请结算" }).click();
  await page.getByRole("button", { name: "交给程序判定" }).click();
  await expect(page.getByRole("button", { name: "在同一存档开启斗2继承人" })).toBeVisible();
  await page.getByRole("button", { name: "在同一存档开启斗2继承人" }).click();
  await expect(page.getByRole("heading", { name: "选择角色" })).toBeVisible();
  await expect(page.getByText("旧世回声", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".candidate-meta").first()).toContainText("霍雨浩");
  await page.locator(".select-button").first().click();
  await expect(page.getByRole("heading", { name: "性格底色" })).toBeVisible();
  for (const question of await page.locator(".question-card").all()) await question.locator("label").first().click();
  await page.getByRole("button", { name: "确认性格，进入觉醒" }).click();
  await expect(page.getByRole("button", { name: "觉醒武魂" })).toBeVisible();
  await page.getByRole("button", { name: "觉醒武魂" }).click();
  await expect(page.getByRole("heading", { name: "看清武魂后，再定此生所求" })).toBeVisible();
  await page.getByRole("button", { name: "确定目标，开始故事" }).click();
  await expect(page.getByPlaceholder("输入行动或对话……")).toBeVisible();
  await page.getByRole("button", { name: /^世界/ }).click();
  await expect(page.getByText("连续世代谱系", { exact: true })).toBeVisible();
  await expect(page.locator(".lineage-list").first()).toContainText("第 1 代");
  await page.locator(".lineage-list").first().getByRole("button", { name: "核验" }).click();
  await expect(page.locator("blockquote.player-entry").last()).toContainText("旧世档案");
  await expect(page.locator(".lineage-list").first()).toContainText("部分核验");
});
