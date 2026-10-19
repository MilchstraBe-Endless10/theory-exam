# 中期记忆（阶段 / 里程碑）

更新时间：2026-10-19（P1 实现、验收与 GitHub 同步完成）

## 当前阶段
**P0、P0-M、P1 均已完成并同步到私有 GitHub；P1 服务端、鉴权、Excel 导入和管理界面通过本地验收；P2 尚未开始，等待用户明确指令。**

## Git 开发流程（长期约束）
- 正式仓库：`https://github.com/MilchstraBe-Endless10/theory-exam`，保持 Private。每次开发开始前检查工作区/分支/远端并 fetch；阶段验证通过后默认普通提交、推送并核验远端 SHA。
- 提交包含阶段编号和实际修改；远端变化、无关改动、验证失败或安全风险时暂停。禁止强推、覆盖历史、公开仓库、正式 Release 和敏感文件入库；不得删除、重置、覆盖未经确认的用户改动。
- 每轮汇报提供 GitHub commit 链接和同步状态。
- P1 起每阶段依序完成同步检查、开发、测试、安全检查、提交、推送、GitHub 验证、记忆更新和汇报；未完成阶段可推送到独立开发分支，验收通过后普通合入 `main`。

## 阶段状态
- [x] P0 视觉底座与项目骨架
- [x] P0-M 手机 12 页面实现与视觉验收（独立阶段，2026-10-19 完成）
- [x] P1 服务器、鉴权与 Excel 题库导入（本地验收及 GitHub 同步完成）
- [ ] P2 日常练习及学习进度
- [ ] P3 模拟考试、断线恢复、成绩历史
- [ ] P4 错题复习和学习分析
- [ ] P5 Android APP、frp、备份恢复
- [ ] P6 系统回归、发行准备与 GitHub 发布

## 本阶段验收
1. 可执行的本地 dev 启动脚本。
2. 1536×1024 视觉截图，布局和细节接近 `design/reference/dashboard-desktop-v1.png`；保留比对证据。
3. 390×844 能操作且无明显溢出；非首页页面提供清晰的路由占位但不伪装已完成。
4. TS 类型检查/前端构建/基础测试可运行，实际结果有记录。

## 后续阶段依赖
- P1 使用 `local-input/四级理论试题.xlsx` 做真实导入验收；确保原始文件 gitignored。
- P0-M 已按 `design/reference/mobile-12-screens-v1.png` 完成 12 个手机页面；390×844 与 360×800 的逐页截图和检查见验收记录。示例数据不能作真实后端数据。
- P3 不能依赖客户端时间判分；P5 不能将公网维护接口暴露。

## 本阶段遇到的新技术决定/风险
- 前端放在 `apps/mobile/`，采用 React + TypeScript + Vite + React Router，为后续 Capacitor Android 客户端保留同一入口。
- 本轮开始时工作目录没有 `.git`；已初始化 `main`，目标仓库原先不存在且由 GitHub CLI 创建为私有仓库。
- P0 尚无服务端。正式页面显示真实空状态，正式考试入口不创建假考试；仅开发环境可开启明确标注的 UI 预览夹具。

## P0 验收记录（2026-10-19）
- 启动：`cd apps/mobile && npm run dev`；本机地址 `http://127.0.0.1:5173/`。
- 检查：`npm run typecheck` 通过；`npm run build` 通过；开发页返回 HTTP 200。
- 交互：在 Codex In-app Browser 点击日常练习、模拟考试侧栏和首页考试入口，路由与未接后端的占位说明正常；用户菜单可打开。
- 截图：1536×1024 桌面对照、390×844 和 360×800 移动截图均已生成；详细差异和验证记录见 AI 产出目录中的 `design-qa.md`。
- 设计修正：第一轮发现标题/内容垂直节奏偏移约 9px；调整标题、间距、图标和表格列宽后，第二轮主要区块起点与基准对齐。
- 保留差异：基准图中的题量、成绩和练习历史为样例；当前没有服务端数据，因此显示空状态，未伪造用户数据。

## 手机 P0-M 验收记录（2026-10-19）
- 依照 `design/reference/mobile-12-screens-v1.png` 完成启动、连接、登录、首页、练习选择/答题/结果、模拟考试设置/答题/结果、错题复习、个人中心 12 个页面。
- 真实 Chromium 截图：390×844 与 360×800 各 12 页；两种尺寸另有长题干截图；另有 390×844 的手动连接展开、考试答题卡打开截图；桌面回归截图为精确 1536×1024。截图和逐页差异报告保存在用户指定的 AI 产出目录内（不纳入代码仓库）。
- 旧启动页截图与当前实现不一致；最终浏览器复测显示背景全屏覆盖，另补齐底部手势条。考试预览答题卡原先仅列 60 个题号，按固定规则扩为完整 180 个可滚动题号并通过跳题检查。
- `npm run typecheck`、`npm run build`、`npm run test:ui` 均通过；UI smoke 共 13 组检查，包括两种手机视口路由、长题干换行、底栏跳转、登录/连接提示、单选/多选/判断、收藏、计时预览、180 题答题卡、错题筛选与数量、个人中心弹层、无控制台错误及桌面回归。
- 生产预览 `http://127.0.0.1:4175/?preview=1` 在真实浏览器中打开，首页显示未连接空状态与 `—`，无开发预览徽章或虚构学习成绩；预览夹具由 `import.meta.env.DEV` 限定。生产预览验证后已停止。真实账号、题目、成绩及记录仍等待本机后端。
- 与参考差异：启动页使用独立摄影素材，与参考图的景色/道路细节不完全相同；考试答题不提供参考图里的「暂停」按钮，符合正式考试不得暂停的业务约束。手机拼图分辨率有限，因此按结构、控件、间距与业务规则核验，不能声称像素级一致。
- 四级规则未改变：120 单选×0.5、20 多选×1、40 判断×0.5，共 180 题、100 分、90 分钟；错题仍须在不同轮次连续答对两次才掌握。未开始 P1。

## P1 本地验收记录（2026-10-19）
- 新增 Node.js/TypeScript/Fastify 服务端 `apps/server/`，SQLite 版本化迁移、外键、WAL、持久化与 0700/0600 数据权限；默认监听 `127.0.0.1:3000`，默认数据位于 `~/.local/share/theory-exam/theory-exam.sqlite`。当前服务以生产构建运行，管理界面 `/admin`；默认数据库迁移状态为 1/1。未查看或导出其中账号/题库业务数据。
- 完成管理员一次性初始化、账号创建/启停/重置、登录/查询身份/改密/退出、Argon2id 密码哈希、会话令牌摘要、失败限流、禁用账号会话撤销和服务端回环地址管理权限边界。
- Excel 两阶段预览/确认导入；本机真实 `local-input/四级理论试题.xlsx` 在隔离临时库验收 **1,283 题：单选 845、多选 38、判断 400**，缺失答案 0、格式错误 0；报告 64 组重复题干并保留 129 条重复题记录；同文件指纹重导被识别；重启后重读 1,283 题。临时库已清理，原题库仍被 Git 忽略。
- 新增本机管理页面与 API 文档 `docs/API.md`。正式桌面/手机首页、练习选择、模拟考试设置从登录后的 `/api/banks` 读取启用题库、版本和考试规则；无登录、空题库、请求错误和未配置规则均显示真实状态。`?preview=1` 仍只用开发夹具；P1 未实现练习记录、正式组卷、考试提交和成绩。
- 浏览器实测：Chromium 流程通过管理员初始化、普通用户创建、真实 Excel 预览/确认、手机服务器健康检查与普通用户登录、手机考试设置动态规则、桌面首页题库/规则呈现；空题库首页不显示固定题量。最终截图位于用户指定 AI 产出目录 `图片与设计/理论考试练习系统/P1-服务端浏览器验收-r4-20261019/`。UI smoke 13 项通过并回归 1536×1024 桌面首页。
- 验证：`apps/mobile` 的 `npm run typecheck`、`npm run build`、`npm run test` 通过；`apps/server` 的 `npm run typecheck`、`npm run build`、`npm run test` 通过（9 项）、`npm run verify:local-import` 通过；两端 `npm audit --audit-level=moderate` 均报告 0 漏洞。生产构建服务的 `/api/health` 与 `/admin` 返回 200，未认证 `/api/banks` 返回 401。
- API/安全决策已写入 `docs/API.md`、ADR-012；`docs/ROADMAP.md` 已对齐自动推送规则。业务考试规则未变；`memory/LONG_TERM.md` 未修改。
- P1 阶段提交：`dcfd377bf9ce29324a58925dba760c0a9c1fd676`，<https://github.com/MilchstraBe-Endless10/theory-exam/commit/dcfd377bf9ce29324a58925dba760c0a9c1fd676>。普通推送成功；GitHub `refs/heads/main` 与本地 SHA 一致；远端仓库 `private=true`、默认分支 `main`；远端已核实存在服务端代码、测试、客户端题库服务与 API 文档。阶段完成后暂停，不进入 P2。

## GitHub 首次上传记录（2026-10-19）
- 私有仓库：<https://github.com/MilchstraBe-Endless10/theory-exam>；默认分支 `main`。
- 首次内容提交：`ff2d7fb56f332d99ee83eaa2c6fae6f01180a453`（`P0: initialize project and mobile design baseline`）。首次普通推送成功，GitHub `refs/heads/main` 与该提交 SHA 一致。
- GitHub API 文件树与本地提交文件清单一致；共 41 个文件。题库 Excel、`local-input/`、`node_modules/`、`dist/` 均未上传；仓库状态为 private。
- P0-M 实现提交：`8d283a19d5523265780c36b756d6ba7004624e1d`（`feat(mobile): complete P0-M mobile UI and visual validation`），[GitHub Commit](https://github.com/MilchstraBe-Endless10/theory-exam/commit/8d283a19d5523265780c36b756d6ba7004624e1d)。普通推送成功；GitHub API、`git ls-remote`、本地 `HEAD` 和 `origin/main` 均确认 SHA 一致。
- GitHub 验证：仓库 `private=true`，默认分支 `main`；远端树包含 P0-M 页面、样式、UI smoke 和手机视觉基准，未包含 `local-input/`、Excel 原始题库、数据库、环境变量或密钥。暂存差异安全扫描与 `git diff --cached --check` 通过。
- 本轮复验：`cd apps/mobile && npm run typecheck` 通过；`npm run build` 通过；`npm run test` 通过，包含 13 组 Chromium UI smoke，覆盖两种手机视口、导航、表单、题型选择、答题卡、错题筛选、个人中心、桌面回归和控制台错误检查。

## 更新规范
只有里程碑通过验收时打勾；如果仅代码写完但没运行/没验证，标记「阻塞/待验收」。记录实际测试证据和影响后续阶段的重要技术决策；不要重复全文 PRD。
