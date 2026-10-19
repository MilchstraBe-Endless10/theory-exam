# 短期记忆（每次 Codex 会话更新）

> 这是交接快照，不是聊天记录。每轮结束替换为最新状态。

- 日期：2026-10-19
- 阶段：P2 日常练习本地开发和验收完成；自动 Commit/Push 与 GitHub 远端 SHA 核验待本轮收尾。同步后暂停，等待 P3 授权。
- 基线：开始前 `main` 与 `origin/main` 同步于 `291d8b992c43bdc765226ce5e43e8a4e0fb3fa65`。当前开发分支 `main`。开发过程中没有改动、停止或迁移既有真实 SQLite 数据库/运行服务；浏览器流程使用临时隔离数据库。
- P2 变更：新增 V2 迁移、`apps/server/src/services/practice-service.ts`、`apps/server/src/routes/practice-routes.ts` 和 `apps/mobile/src/services/practice.ts`；在 `MobilePages.tsx` / `DashboardPage.tsx` 接入真实练习、答题反馈、恢复、收藏和统计；更新共享响应式样式、认证侧栏用户名、浏览器 smoke、服务端隔离测试、`docs/API.md`、`docs/DECISIONS.md`、`docs/ROADMAP.md` 与本文件及中期记忆。未修改 `memory/LONG_TERM.md`。
- API：`/api/practice/sessions` 创建/查询/续接/切题/提交/读取反馈；`/api/favorites` 管理个人收藏；`/api/progress` 统计当前题库真实数据。提交前没有答案字段；服务端事务判分并保存作答及错误状态；重试幂等。题库版本固定到会话，账号间会话、答案和收藏隔离。
- 自动测试：服务端 `npm run typecheck`、`npm run build`、`npm run test` 通过（18 项）；移动端 `npm run typecheck`、`npm run build`、`npm run test` 通过（Chromium UI smoke 13 项）。
- 浏览器端到端：`cd apps/server && npm run test:browser` 通过。管理 UI 真实读取本机 Excel 并导入到临时 DB，验得 1,283 道（845/38/400）；普通用户登录，答对/答错，模拟网络失败后未产生答案记录并成功重试，退出重登后统计恢复为 2 题已接触、50% 正确率、1 道待复习。开发 `?preview=1` 前后正式数据库行数不变。临时服务和临时 DB 已由脚本清理。
- 视觉截图（18 张）：AI 产出目录 `图片与设计/理论考试练习系统/P2-真实刷题浏览器验收-r12-20261019/`。关键页面覆盖 390×844、360×800、1536×1024。修复浏览器验收的 CDP DOM 断言错误、React 异步等待竞争，以及桌面反馈样式和侧栏登录身份展示；最终真实截图通过。
- 安全/范围：`.gitignore` 忽略 `local-input/`、Excel、数据库及 WAL、`.env`、账号数据、日志、证书、密钥和 frp 配置；测试没有读取或导出生产账号/题库。四级考试规则未变。完整跨轮次错题掌握状态机留给 P4；P2 没有开发模拟考试组卷、计时/评分、frp 公网或 APK。
- 已记录待办：ADR-014；P5 接入 frpc 前隔离管理监听入口并验证公网转发不可访问管理界面/API。当前不开放公网。
- Git 下一步：复查 `git fetch origin`、分支关系、`git diff --check` 与暂存文件敏感性；验证全部通过后使用普通提交与 push，查询 GitHub `main` SHA 并将提交 URL/同步结果补录到 `memory/MID_TERM.md` 和本文件。不得强推、公开仓库或发布 Release。
