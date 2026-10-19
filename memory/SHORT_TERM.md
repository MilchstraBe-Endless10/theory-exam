# 短期记忆（每次 Codex 会话更新）

> 交接快照；不得记录真实密码、密码哈希或凭据文件内容。

- 日期：2026-10-19。
- 阶段：P4 错题复习与掌握状态已完成本地实现和验收；等待本轮安全审查、Commit/Push、远端核验及关闭 Issue #5/#6。不得进入 P5。
- Git 基线：开发前 `main` 与 `origin/main` 同步于 `51bfeaa41e0c15b5146c99a51528f3f7ab399d89`。工作区中现有改动均为 P4 开发与文档，无额外用户改动；远端 fetch 后没有新提交。提交 SHA 待本轮推送后补记。
- Issue #6 已修复：`db:status` 使用只读路径，不建库、不迁移、不写数据；数据库不存在、迁移表缺失和版本超前均明确报告。`db:migrate` 独立执行，已有数据升级前先创建 SQLite 一致性备份。隔离 V3/V4、缺迁移表、版本超前、缺失数据库和 WAL 未检查点场景均有测试，确认状态查询不更改文件/schema/version/data。
- 新增 V5 增量迁移，未修改 V1–V4。复习轮次固定账号、题库版本、条件、题目及顺序，持久化提交、结果、时间和状态；退出后可恢复，完成后可查历史。当前错题状态按用户/题目唯一；不同轮次答对依次从待复习到巩固中再到已掌握，任何正式答错回待复习。同轮重试仅计一次；普通练习/考试答对不推进掌握。
- 复习 API 支持创建、恢复、答题、退出、历史和统计；题型、状态、随机/薄弱优先和 10/20/全部组合由服务端筛选。复习提交前不泄露答案，确认写入后返回反馈。手机错题设置/答题/反馈/历史、桌面错题本及统计已接入服务端；Preview 仍隔离。
- 验证重跑：`apps/server` `npm run typecheck` 与 `npm run build` 通过，`npm test` **48/48 通过**。`apps/mobile` typecheck/build 通过，UI smoke **14/14 通过**，含 390×844、360×800 路由/交互和 1536×1024 桌面回归。
- Chromium 端到端验收使用隔离 SQLite 和本机真实 Excel；题库 1,283 道（单选 845、多选 38、判断 400）。浏览器实际验证练习错答入错题、筛选/薄弱优先/数量不足提示、退出恢复、跨两个轮次答对后掌握、历史，以及手机与桌面页面。截图目录：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/P4-错题复习验收-20261019-03/`。
- 正式 SQLite 未修改：V4，四个普通账号，无管理员、无正式题库；未读写真实密码，未重置账号，未执行正式迁移或导入 Excel。正式启用仍需本机管理员操作与题库导入。
- 已更新 `docs/API.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/ROADMAP.md`、`memory/MID_TERM.md`；长期约束未变，未改 `memory/LONG_TERM.md`。Issue #5/#6 尚未关闭，待推送后更新并核实。
- GitHub：私有仓库 `https://github.com/MilchstraBe-Endless10/theory-exam`。下一步执行全量 `git diff --check`、忽略/敏感文件复查、提交 P4、普通推送、核对 `HEAD`/`origin/main`/GitHub SHA，再关闭并核实 Issue #5/#6。
