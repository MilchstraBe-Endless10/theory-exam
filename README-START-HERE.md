# Codex 桌面版开发交接包 — 从这里开始

## 这是开发输入，不是已完成的应用

包含真实 PRD、UI 参考图、原始本地 Excel 样本、开发阶段安排、可直接粘贴给 Codex 的提示词和可持久保存的三层记忆规则。**尚未创建运行中的考试系统，也尚未发布 GitHub 仓库或 APK。**

## 操作顺序

1. 在你的电脑创建一个新的项目目录（例如 `~/Projects/theory-exam`），或打开已有但适合本项目的 Git 工作区。
2. 把本压缩包内容**解压到项目根目录**，保证根目录可以看到 `AGENTS.md`、`docs/`、`design/`、`memory/`、`prompts/`。
3. 启动 Codex 桌面版并选择这个**项目目录**作为工作区，不要只打开压缩包或单个 MD 文件。
4. 打开 `prompts/00-FIRST-RUN.md`，把全文粘贴给 Codex。让它首先做阶段 P0：项目骨架 + **可运行的高保真首页**，先不一次性开发全部功能。
5. 检查本地桌面首页，与 `design/reference/dashboard-desktop-v1.png` 对照；手机 12 页面按 `design/reference/mobile-12-screens-v1.png` 在独立的 P0-M 阶段实现和逐页验收。
6. 每轮结束确认 `memory/SHORT_TERM.md` 的测试结果和下次接续点，下一轮用 `prompts/90-RESUME.md`。

## 重要文件
- `docs/PRD-V1.md`：完整、明确的功能契约
- `design/reference/dashboard-desktop-v1.png`：第一张桌面视觉基准图（1536×1024）
- `docs/UI_SPEC.md`：UI 还原标准、页面地图、视觉验收规则
- `docs/ROADMAP.md`：长期目标与 7 个中期阶段
- `AGENTS.md`：Codex 可识别的稳定项目规则
- `memory/LONG_TERM.md`：不随每次会话改变的产品事实
- `memory/MID_TERM.md`：阶段级任务状态
- `memory/SHORT_TERM.md`：当轮实现与验证结果
- `prompts/`：逐阶段可复制的开发指令
- `local-input/四级理论试题.xlsx`：实际样本，只用于本地测试，禁止推送仓库

## 数据隐私与 Git
默认 `.gitignore` 忽略原始 Excel 目录、数据库、备份、环境变量与密钥。打开公开 GitHub 仓库前，先用 `git status` 和 `git ls-files` 检查是否误加入个人或受限内容。

## Codex 不等于一直记住所有历史
Codex 能读取仓库 `AGENTS.md`；其他记忆文档需要按需读取并及时写回。一次聊天里的口头承诺不等于永久项目事实。

## 原始视觉图的局限
桌面首页图和手机 12 屏图都是视觉效果图，其中日期、成绩、用户名和题库进度为示意值。只把它们用作布局、颜色、形态和密度参考，不把示意数据写死。手机图是逐页设计目标，但不代表手机页面已经实现或验收。
