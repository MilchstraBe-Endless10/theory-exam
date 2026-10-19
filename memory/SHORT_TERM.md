# 短期记忆（每次 Codex 会话更新）

> 这是交接快照，不是聊天记录。不得记录真实密码、密码哈希或凭据文件内容。

- 日期：2026-10-19
- 阶段：P3 模拟考试业务已本地验收、已同步至私有 GitHub；暂停等待 P4 授权。
- Git 基线：开始时 main 与 origin/main 同步于 05a2225af20f70c6ac9eacec6d04f9f90f1fed66。P3 实现提交 df6e68d21cb867787676a1474b04387c2b77cd99（https://github.com/MilchstraBe-Endless10/theory-exam/commit/df6e68d21cb867787676a1474b04387c2b77cd99）；Dashboard import 修复提交 e6fdc9de37f153e255e46213fd4f30e49ea6ef12（https://github.com/MilchstraBe-Endless10/theory-exam/commit/e6fdc9de37f153e255e46213fd4f30e49ea6ef12）。普通 push 后 HEAD、origin/main、git ls-remote 一致于 e6fdc9de37f153e255e46213fd4f30e49ea6ef12。
- 服务端：新增 apps/server/src/routes/exam-routes.ts、apps/server/src/services/exam-service.ts 和 V4 迁移。按当前题库版本/规则事务组 180 题快照、每题分值与服务器起止时间；支持每账号单场考试、答题版本与幂等 requestId、断线恢复、超时自动结算、交卷判分、历史复盘、账户隔离和错题一次性更新。考试未结算前不返回正确答案。
- 客户端：新增 apps/mobile/src/services/exams.ts 与 ExamPages.tsx；手机/桌面设置、答题、服务器倒计时、180 题答题卡、待检查标记、同步/冲突状态、交卷二次确认、成绩复盘和历史记录均接入 API。首页最近成绩读取真实考试历史。开发预览与业务 API 隔离。
- 本地 Excel 在隔离测试库真实导入 1,283 道（单选 845、多选 38、判断 400）。服务端测试全套 30 项通过；客户端 typecheck/build 通过，UI smoke 13 项通过；Chromium 真实浏览器全流程通过，覆盖登录、组卷、离线重试、180 题跳题、刷新/登出重登恢复、交卷/评分、历史、桌面回归与 Preview 不写库。浏览器 smoke 曾暴露异步同步断言竞态，现已改为等待 SQLite 确认并重跑通过。
- 浏览器截图：/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/P3-模拟考试验收-20261019-10/；包含 390×844、360×800、1536×1024 关键页。之前失败的调试目录 08/09 不作为最终验收证据。
- 正式库边界：P3 开始时确认 V3、四个普通账号、无管理员/题库。查询 npm run db:status 会通过 openDatabase() 自动应用迁移；因此正式库现为 V4（增量 schema），未删除/重置账号。只读计数为 migration 4、用户 4、管理员 0、题库 0、进行中考试 0；没有在正式库初始化管理员或导入 Excel。未查看密码或账号明细。
- 本机服务已优雅重启到 P3 构建，运行 http://127.0.0.1:3000；健康检查 200/V4，未认证 /api/exams/active 返回 401。服务当前由本轮执行会话保持运行。
- 截图视觉复核确认手机设置/答题/答题卡/结果和桌面答题/复盘布局正常；浏览器 smoke 对 390×844、360×800、1536×1024 页面通过。正式库仍无题库，因此真实账号无法开展正式考试；正式考试需管理员在本机交互式初始化并确认导入后才可使用。
- 文档更新：docs/API.md、docs/ARCHITECTURE.md、docs/DECISIONS.md、docs/ROADMAP.md、本文件与 memory/MID_TERM.md。长期业务规则未变化，未修改 memory/LONG_TERM.md。
- 安全与发布：未查看/记录真实密码；Excel、数据库、账号凭据、环境变量和密钥未进入 Git。未公开仓库、未推送公网、未发布 APK/Release。Issue #4 保持原状态，除非用户要求，不擅自关闭。
