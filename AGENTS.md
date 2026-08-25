# Agent 接手入口

## 项目

《未定之书》是 React + TypeScript + Express + SQLite 构成的本地斗罗四时代互动小说 RPG。程序负责规则结算，DeepSeek 只负责意图整理和第三人称限知叙事。

## 开始工作前

1. 完整阅读 `docs/HANDOFF.md`。
2. 检查 `git status --short --branch`，保留用户已有改动。
3. 以当前代码、测试和 `GET /api/world/catalog/stats` 为事实来源；早期设计文档不是现役完成范围。

## 常用命令

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run quality:long-session
npm run test:e2e
npm run security:release
```

没有全局 npm 时，使用 Codex 工作区依赖提供的 pnpm 执行同名脚本。

## 关键边界

- 不提交 `source-materials/`、`.data/`、数据库、构建产物、API Key 或用户提供的原著文本。
- 不让模型修改胜负、数值、物品、关系、时间线或程序结算结果。
- AI 正文生成前必须先通过 `narrative-logic.v1` 逻辑预检；缺欲望、信息边界、权限、资源、固定后果、现场反应或可追踪状态变化时不得调用模型。
- 长篇旧事通过本地 `vector_memories` 检索，向量库只能写入玩家已知事实；召回结果不能覆盖当前结构化状态、程序结算或 NPC 知识边界。
- NPC 只能使用角色已经公开或有可靠来源的信息；隐藏武魂、系统和未来事件不得泄露。
- 斗一至斗四人物、势力、地点、技术和制度必须按年代隔离；同人二设不得冒充原著事实。
- 用户明确不需要人物和魂兽美术，不把它们列为完成条件。
- 公开发行或商业化仍需单独处理 IP 授权、平台规则和隐私合规。
- 不使用 `git reset --hard`、`git checkout --` 或递归删除清理用户工作区。

## 当前状态

现役分支为 `codex/iterative-optimization`。四时代核心规则可玩，但真实模型四时代长篇体验、全面原著校对和发行验收尚未完成。最近的中国网文叙事逻辑改动见 `docs/research/douluo-choice-and-plot-logic.md` 与 `docs/research/github-novel-logic-skills.md`。
