# 短期记忆（每次 Codex 会话更新）

> 这是交接快照，不是聊天记录。每轮结束替换为最新状态。

- 日期：2026-10-19
- 阶段：P1 服务端、认证、题库导入与管理 UI 已完成本地实现和验证；当前待 Commit/Push/远端核验。未进入 P2。
- 基线：`main`，起始 `9a5696f655319c5328c7a328f4397e39ab7d0452`；开始时 `git fetch origin` 后本地与 `origin/main` 同步。推送前需再次 fetch，若出现远端变化先审查。
- 本轮改动：新增 `apps/server/`（Fastify、TypeScript、SQLite 迁移、认证、管理与导入接口、隔离测试、真实 Excel 验证脚本、浏览器流程脚本）；新增 `apps/mobile/src/auth/`、`src/services/`、本机 `AdminPage`；将正式桌面/手机首页、练习题量和考试设置改为读取 `/api/banks`，保留开发 `?preview=1` 隔离夹具；更新 UI smoke、`docs/API.md`、`docs/DECISIONS.md`、`docs/ROADMAP.md`、本文件和 `memory/MID_TERM.md`。`memory/LONG_TERM.md` 保持不变。
- 真实题库验收：隔离临时数据库读取 `local-input/四级理论试题.xlsx`；`客观题`工作表共 1,283 题（单选 845、多选 38、判断 400），缺失答案 0、格式错误 0、重复题干组 64（保留涉及的 129 道题）；相同 SHA-256 文件重导被识别；关闭并重开数据库仍读到 1,283 题。测试临时库已清理，原始题库未改动。
- 测试：移动端 `npm run typecheck`、`npm run build`、`npm run test` 均通过；UI smoke 13 项，含 390×844、360×800 页面检查/导航、题目交互、Preview 隔离、管理员页面控制台无错误、1536×1024 桌面回归。服务端 `npm run typecheck`、`npm run build`、`npm run test` 通过（9 项）；`npm run verify:local-import` 通过。两项目 `npm audit --audit-level=moderate` 均为 0 漏洞。
- 浏览器流程（Chromium）通过管理员首次初始化、创建普通用户、上传真实 Excel 并确认导入、手机健康检查、普通用户登录、题库 API 动态渲染和考试规则展示；无题库首页不展示硬编码的 845/38/400、180/90 和四级名称。生产构建检查 `/api/health`、`/admin` 为 200，未认证 `/api/banks` 为 401。
- 截图：最终完整浏览器组在 `/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/P1-服务端浏览器验收-r4-20261019/`，含 `1536x1024-desktop-home-empty.png`、`1536x1024-desktop-home-with-bank.png`、`390x844-ordinary-user-login.png`、`390x844-exam-settings-from-server.png` 和 `admin-import-success.png`。r1-r3 是前几轮断言修正时的部分截图，最终以 r4 为完整通过证据。
- 服务运行：生产构建服务正在 `127.0.0.1:3000` 运行，仅监听回环；管理页 `/admin`。使用默认数据目录 `~/.local/share/theory-exam/`；既有 DB 迁移状态 1/1，保留账号/题库内容。用户原有 Vite `127.0.0.1:5173` 保持运行。用 `cd apps/server && npm run start` 可启动；用 `npm run dev` 开发。
- Git 安全：`.gitignore` 排除 `local-input/`、`.xlsx`、数据库/WAL、`node_modules/`、`dist/`、`.env`、账号数据、日志、密钥、证书和 frp 配置。尚未暂存/提交；暂存前用 `git ls-files --others --exclude-standard` 审查清单，并再次用 `git diff --cached --check` 与敏感路径检查。
- 同步后续：验证通过后按已确认规则创建阶段提交（建议 `feat(p1): add local Fastify auth and Excel bank import`），普通推送 `main`，核对本地/远端 SHA 及仓库仍为 Private；远端变化、无关改动或安全风险时暂停。同步后将真实 Commit SHA 写回 MID/SHORT，再单独提交并推送该记忆更新；报告 GitHub Commit 链接和同步状态。
- 下一步仅为本轮最终 Git 安全审查、Commit/Push、远端验证和记忆 SHA 回填；完成后停止，等待用户批准 P2。
