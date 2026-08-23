# 斗罗大陆游戏设计项目

这是一个已完成首轮需求探索的私有设计仓库，用于整理世界观、记录产品决策，并实现《斗罗大陆》第一部的文字人生模拟游戏。

## 当前阶段

- 已建立五部原著的本地章节、人物和设定检索索引。
- 已确定为网页端、纯单机、API 驱动的第一人称互动同人小说游戏。
- 100 个自适应需求问题已经完成，首版规则基线已冻结。
- 下一阶段进入 MVP 数据结构、规则引擎和可玩闭环开发。

## 目录

- `docs/world-foundation.md`：从原著素材提炼出的游戏设计基础。
- `docs/mvp-gdd.md`：完成 100 个问题后汇总的首版游戏设计与验收范围。
- `docs/game-concept.md`：当前已确认的产品形态与技术方向。
- `docs/technical-architecture.md`：规则引擎、AI 权限与 DeepSeek 接入方案。
- `docs/random-origins.md`：随机人物、异世界出身与金手指生成规则。
- `docs/crossover-policy.md`：外部作品设定与力量进入斗罗世界的兼容规则。
- `docs/cultivation-inspirations.md`：首批修仙作品设定参考包与斗罗化方式。
- `docs/soul-hunting-system.md`：基于原著与同人调研整理的猎魂、推荐和吸收规则。
- `docs/difficulty-and-legacy.md`：五档难度、多周目点数与继承机制。
- `docs/timeline-inheritance.md`：平行重开、连续世界和跨时代历史推演。
- `docs/discovery-log.md`：需求访谈问题与后续决策记录。
- `scripts/analyze_sources.ps1`：本地素材索引脚本。

## 素材与版权

原著全文仅作为用户提供的本地参考资料，不纳入 Git 仓库。若项目计划公开发行或商业化，需要在制作投入扩大前确认 IP 授权范围。

## 本地运行

需要 Node.js 24 或更高版本。

```powershell
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:5173`。开发模式同时启动 Vite 网页与 `127.0.0.1:8787` 本地规则服务。

生产构建与启动：

```powershell
npm run build
npm start
```

生产模式由本地服务直接托管构建后的网页，打开 `http://127.0.0.1:8787`。存档、事件日志和 DeepSeek 私有配置写入被 Git 忽略的 `.data` 目录。

## 当前可玩范围

- 创建本地游戏并完成八道初始人格情境题。
- 按固定种子生成三名只显示出身与先天征兆的角色，可无限重抽。
- 选定角色后亲历武魂觉醒，并揭晓武魂、先天魂力和描述性能力。
- 使用三个建议或自然语言输入继续行动；未配置 DeepSeek 时使用本地叙事模板。
- SQLite 自动保存世界状态和事件记录，可从本地书架恢复。

第一次猎魂七阶段和长期 NPC 世界模拟仍在后续开发范围内。
