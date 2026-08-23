# 《未定之书》项目交接文档

最后更新：2026-08-24  
仓库：<https://github.com/axbgs123/douluo-game-design>  
默认分支：`main`  
交接前最后一个功能提交：`545388a feat: expand four-era world catalog`

## 1. 项目定位

《未定之书》是一款本地运行的单人网页文字 RPG。第一版以《斗罗大陆》第一部时代为正式入口，玩家从六岁武魂觉醒开始，以自由文本实时控制主角行动。

核心体验不是传统菜单 RPG，而是：

- 程序确定时间、魂力、战斗、伤势、资源、关系和历史结果；
- DeepSeek 把确定结果写成第三人称限知同人小说；
- NPC、势力和原作事件在玩家视野外继续活动；
- 只有玩家真实造成的因果，才允许改写原作关键节点；
- 玩家主要体验变强、建立关系、处理身份压力、选择势力与改变个人命运。

当前没有正式美术。网页版稳定后才考虑 Godot 封装与美术制作。

## 2. 当前可运行状态

- 本地开发服务：`http://127.0.0.1:8787/`
- 前端开发端口：`http://127.0.0.1:5173/`
- 当前本地服务已启动。
- Node.js 要求：24 或更高版本。
- 正式剧情必须配置 AI；没有 AI 时只能创建角色、查看资料和设置模型。
- DeepSeek API Key 只保存在本机，不进入 Git。

常用命令：

```powershell
npm install
npm run dev
npm test
npm run build
npm start
```

生产运行前应先执行：

```powershell
npm run build
npm start
```

## 3. 当前数据规模

以 `/api/world/catalog/stats` 返回值为准：

| 数据 | 当前数量 | 含义 |
|---|---:|---|
| 出生档案 | 36,000 | 1,000 种核心身份与家庭气氛、地区等参数组合出的确定性种子空间 |
| 可觉醒武魂 | 159 | 斗一至斗四、原创武魂与局外图鉴武魂 |
| 重要人物与智慧凶兽 | 159 | 有姓名、位置、目标、实力节点和状态的可交互实体 |
| 实力节点 | 175 | 人物在特定原作年份的等级或实力记录 |
| 势力 | 76 | 帝国、王国、宗门、学院、军团、行业组织和魂兽组织 |
| 地点 | 65 | 当前时代与后世时代的结构化地点 |
| 历史事件 | 108 | 四部时间线中的关键历史节点 |
| 魂兽 | 212 | 用于猎魂、生态和调查的魂兽种类模板 |
| 同人叙事规则 | 4,000 | 四个时代各 1,000 条，运行时按行动检索 |

说明：

- “出生档案”是组合空间，不是 36,000 段逐条手写的文案。
- 普通临时 NPC 不计入 159 个重要实体。
- 帝天、雪帝、冰帝等长寿魂兽在斗一真实存在。
- 霍雨浩、唐舞麟、蓝轩宇等后世人物拥有出生年份，斗一不会提前激活。
- 传灵塔、斗罗联邦、龙马联邦等势力拥有成立年份。
- 后世地点拥有可用年份，斗一地图不会显示明都、森罗星或天龙星。

## 4. 已冻结的角色创建流程

状态流转：

```text
candidate_selection
  → character_shaping
  → awakening
  → life_goal_selection
  → playing
  → ended
```

具体流程：

1. 玩家选择性别、难度和可选随机种子。
2. 程序一次生成三名角色，只公开出身、已知背景和先天征兆。
3. 玩家可自定义姓名、锁定栏位并刷新角色。
4. 选中具体身份后，再抽取性格底色和回答身份相关情境题。
5. 身份固定性格会显示实际效果，并进入人格分数计算。
6. 武魂觉醒后才公开：
   - 单武魂、双生武魂或三生武魂；
   - 每个武魂的种类、潜质、来源时代；
   - 武魂与身份、血脉或自然变异的关系；
   - 先天魂力。
7. 玩家看清武魂后再三选一或自定人生目标。
8. 人生目标确认后进入正式剧情。

双生/三生规则：

- 双生是小概率；三生是极低概率。
- 具有双生研究、异脉或实验身份时权重提高。
- 大样本中约 1% 出现双生，三生约万分之几。
- 副武魂初始标记为“未修炼”，不会直接叠加战力或魂环。
- 局外明确指定的武魂可以覆盖主武魂，不强制服从本局出身权重。

## 5. 确定性状态引擎与 AI 边界

### 程序负责

- 随机种子与角色生成；
- 魂力、瓶颈、修炼进度和魂环承载；
- 战斗胜负、伤势、死亡与复生条件；
- 时间、年龄、旅行和地图；
- 金钱、负重、仓储、债务、悬赏和经营；
- 人物关系、声望、犯罪热度和势力状态；
- NPC 自主行动与 NPC-NPC 关系；
- 原作事件惯性与玩家因果足迹；
- 存档、回溯、表现分惩罚和局外结算。

### AI 负责

- 将复杂玩家输入整理为规则动作；
- 在程序结果范围内生成第三人称限知正文；
- 生成三个可执行建议；
- 更新受限的长期摘要、未决事项、章节标题和 NPC 记忆文本。

### AI 禁止

- 修改胜负、时间、魂力、物品、伤势、关系数值或历史结果；
- 泄露角色不知道的秘密；
- 提前写后世人物、组织、技术和事件；
- 替玩家作出重大关系、势力、生死或道德选择；
- 用正文反向覆盖数据库。

## 6. AI 推演流水线

正式行动的顺序：

```text
规则前置检查
  → DeepSeek 语义整理
  → 程序计算结果
  → 小说技能路由
  → DeepSeek 生成正文
  → 时间线/知情/文风审校
  → 写入存档
```

失败处理：

- 单个服务器请求最多生成 4 稿。
- 后一稿会收到上一稿的审校问题并定向修复。
- 服务器仍失败时，客户端自动完整重发一次。
- 最多 8 次模型生成尝试，不会无限消耗额度。
- 缺少 Key、规则拒绝和主动取消不会自动重试。
- 成功提交前不会推进时间或修改存档。

正文节奏：

| 场景 | 标准模式 | 高速模式 |
|---|---:|---:|
| 普通调查、问路、整理、购买 | 280–550 字 | 160–320 字 |
| 正常剧情推进 | 600–1,000 字 | 300–550 字 |
| 魂环、生死、拜师、关键原作人物 | 1,600–2,800 字 | 700–1,200 字 |

程序会要求 AI 合并跑腿、开门、翻找、客套和重复询问，并让建议行动指向下一项有效进展。

## 7. 增强小说引擎

运行时不会直接读取用户机器上的 Codex 技能目录。项目已经把适合的规则改造成可部署的内部路由器：

- 常驻：`continuity`、`world`、`expand`、`human`、`fanfic`
- 条件触发：`dialogue`、`character`、`emotion`、`goldfinger`

核心文件：

- `server/domain/novel-engine.ts`
- `server/services/deepseek.ts`
- `THIRD_PARTY_NOTICES.md`

模型设置中可以关闭“增强小说引擎”。技能名和调用过程不得出现在玩家正文中。

## 8. 原作逻辑与势力反应

斗一时代的异常天赋会触发程序事件，而不是只依赖 AI 自觉：

- 先天 7 级以上进入武魂殿重点档案。
- 先天满魂力、神话武魂或多生武魂触发高优先级接触。
- 自动生成武魂殿接触事件、限时任务、觉醒执事态度和地方声望。
- 已属于七宝、蓝电、昊天、皇室等势力时，武魂殿仍会登记、试探或谈条件。
- 程序不会替玩家自动加入任何势力。

原作事件只有在玩家因果足迹明确关联到参与人物、势力或地点时，才可能被历史抗性判定为偏移。

## 9. 世界与时间激活规则

### 人物

- `birthYear` 控制出生。
- `deathYear` 控制死亡。
- 无出生年份的长寿魂兽默认在早期时代已经存在。
- 人物实力按相邻 `powerSnapshots` 推算。
- 未来实力节点不能反向套给幼年人物。

### 势力

- `activeFromYear` / `activeUntilYear` 控制组织是否存在。
- `hidden` 控制组织是否进入普通公共资料。
- 尝试加入未成立势力会在模型调用前被程序拦截。

### 地点

- `availableFromYear` 控制地点是否出现在地图。
- `hidden` 控制禁区和秘密地点是否需要发现。

### 魂兽

- 猎魂推荐必须匹配当前地点或附近猎魂区的 `habitats`。
- 诺丁城不会推荐极北、深海、邪魔森林或外星魂兽。
- 高智慧凶兽同时存在于人物库和魂兽物种库中。

## 10. 存档与本地数据

默认数据目录：`.data/`

- SQLite：`.data/douluo.db`
- 模型设置：`.data/deepseek.json`

环境变量：

- `DEEPSEEK_API_KEY`：优先于设置文件中的 Key。
- `DOULUO_DATA_DIR`：测试或特殊运行时覆盖数据目录。
- `PORT`：覆盖规则服务端口，默认 `8787`。

存档规则：

- 正式设计为 3 个主存档位。
- 每局最多保留 3 个回溯节点。
- 行动提交前自动保存关键节点，也支持手动保存。
- 回溯会扣除本局表现分和局外点数收益。
- 旧数据库可能遗留超过 3 个存档；书架有“旧版遗留存档”管理区。

当前本机数据库曾存在 16 个旧存档。不要在测试中删除用户存档。

## 11. 主要目录

```text
src/                         React 前端
  App.tsx                    页面状态与 API 编排
  api.ts                     浏览器 API 客户端与流式读取
  components/                创建、觉醒、人生目标、正文、地图和局外界面

server/
  index.ts                   Express 路由与提交事务
  db.ts                      SQLite、存档、局外成长和资料库统计
  data/
    world.ts                 基础世界数据与统一导出
    expanded-world-catalog.ts 四时代扩展人物、势力、地点、事件和魂兽
    era-martial-souls.ts     四部武魂目录
    expanded-origins.ts      手写核心出身
    system-core-origins.ts   组合式核心身份
    meta-martial-souls.ts    局外抽取武魂
    fanfiction-rules.ts      4,000 条同人规则入口
  domain/
    generator.ts             候选角色、性格、觉醒和人生目标
    actions.ts               行动、成长、经济、猎魂与战斗
    world.ts                 时间、NPC、地图、事件和情报
    story-rules.ts           年代拦截、规则检索和叙事检查
    novel-engine.ts          小说模块路由与附加审校
    endings.ts               周目结算
    traits.ts                身份固定性格效果
  services/
    deepseek.ts              模型调用、自动重写与长期记忆
    settings.ts              本地模型设置

shared/                      前后端共享类型、货币、地图与武魂规则
docs/                        设计、研究、验收和交接资料
```

## 12. HTTP API

健康与资料：

- `GET /api/health`
- `GET /api/world/catalog/stats`
- `GET /api/settings/deepseek`
- `POST /api/settings/deepseek`

存档：

- `GET /api/games`
- `POST /api/games`
- `GET /api/games/:id`
- `DELETE /api/games/:id`
- `GET /api/games/:id/checkpoints`
- `POST /api/games/:id/checkpoints`
- `POST /api/games/:id/checkpoints/:checkpointId/restore`

角色创建：

- `POST /api/games/:id/reroll`
- `POST /api/games/:id/select`
- `POST /api/games/:id/shaping/reroll`
- `POST /api/games/:id/shaping/complete`
- `POST /api/games/:id/awaken`
- `POST /api/games/:id/life-goal`

剧情：

- `POST /api/games/:id/action`
- `POST /api/games/:id/action/stream`
- `POST /api/games/:id/action/rewrite`
- `POST /api/games/:id/speed`
- `POST /api/games/:id/end`

局外成长与地图：

- `GET /api/meta`
- `POST /api/meta/preferences`
- `POST /api/meta/purchase`
- `POST /api/meta/equip`
- `POST /api/meta/martial-souls/draw`
- `POST /api/meta/martial-souls/equip`
- `POST /api/meta/martial-souls/toggle`
- `POST /api/games/:id/map/pins`
- `DELETE /api/games/:id/map/pins/:pinId`

## 13. 测试与验收

当前自动测试：70 项，6 个测试文件。

```powershell
npm run typecheck
npm test
npm run build
```

主要测试覆盖：

- 固定种子生成与出身多样性；
- 武魂档位、四时代目录、双生/三生概率；
- 觉醒后人生目标流程；
- 身份固定性格效果；
- 时间推进、出生、死亡和未来时代隔离；
- 原作事件惯性与玩家因果；
- 猎魂八阶段、栖息地推荐和魂环承载；
- 经济、职业、负重、犯罪与未成年保护；
- 小说技能路由、后台泄露审校和自动重写；
- 数据库删除、检查点和设置迁移；
- 扩展资料 ID、事件参与者、总部、地点和栖息地完整性。

每次改动世界数据后，至少运行：

```powershell
npm test
npm run build
```

## 14. 已知限制与风险

### 高优先级

1. **只有第一部是正式可玩入口**  
   斗二、斗三、斗四已进入结构化资料库，但没有独立新游戏入口、时代 UI 和完整玩法迁移。

2. **后世地图点位仍不完整**  
   后世地点有时代隔离和结构数据，但没有为全部地点制作专门坐标、美术和连接路线。

3. **副武魂玩法尚未完整拆账**  
   双生/三生可以觉醒和进入图鉴，但魂环、修炼进度与切换战斗目前仍以主武魂为主。

4. **扩展资料需要继续做原著逐条校对**  
   当前扩展库用于建立规模和时代边界，人物年份、部分武魂与事件的细粒度节点仍应继续对照用户本地四部原著全文校正。

5. **缺少真正的浏览器端 E2E 测试套件**  
   当前以 Vitest、TypeScript、生产构建和人工页面检查为主。

### 中优先级

6. NPC 自主行动仍是低成本规则模拟，不是完整社会经济仿真。
7. 普通势力管理、商业和职业系统已经可玩，但内容深度低于猎魂与角色生成。
8. 重要战斗虽有回合状态，但技能组合、控制抗性和多人战斗仍可深化。
9. 地图为自绘示意图，不是官方精确地图。
10. AI 调用质量和成本取决于玩家配置的 DeepSeek 兼容模型。

### 外部待办

- 用户此前要求后续部署 `https://github.com/Minglink/dsh-infinite-gen-2` 并完整移植功能；当前仓库内尚未完成该外部项目部署。
- 公开发行或商业化前必须处理《斗罗大陆》IP授权与同人合规问题。

## 15. 下一阶段建议顺序

1. 为副武魂增加独立魂环、独立修炼进度、主修切换与冲突判定。
2. 对 159 个重要实体、108 个事件和 212 种魂兽做原著引用式校对与来源标记。
3. 增加浏览器 E2E：角色创建 → 性格 → 觉醒 → 目标 → 首次行动 → 存档删除。
4. 深化高天赋的宗门、学院、武魂殿和皇室争夺链。
5. 为斗二建立独立入口，并验证上一时代继承与平行世界两种模式。
6. 完善未来时代地图坐标、路线和机构开放条件。
7. 再处理 Godot 封装、美术和外部生成项目部署。

## 16. Git 与工作区注意事项

不要误提交或删除以下当前未跟踪文件，它们属于用户已有工作：

- `docs/douluo-fanfiction-1000-checklist.md`
- `docs/fanfiction-reading-audit.md`
- `scripts/generate-era-checklists.mjs`

推荐提交方式：

```powershell
git status --short
git add -u
git add <本次明确新增文件>
git commit -m "..."
git push origin main
```

禁止为了清理工作区使用 `git reset --hard`、`git checkout --` 或递归删除项目目录。

## 17. 文档可信度说明

当前代码和本交接文档优先级最高。以下旧文档存在部分漂移，需要后续更新：

- `README.md` 仍包含前后 20 年、旧资料数量、无 AI 本地叙事兜底等过时描述。
- `docs/release-acceptance.md` 仍写“觉醒前选择人生目标”等旧流程。
- `docs/technical-architecture.md` 的部分 DeepSeek 型号与上下文说明未在本轮重新联网核验。

交接后若修改需求基线，应同时更新本文件、README 和验收文档，避免代码与说明再次分叉。

