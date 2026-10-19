# 短期记忆（每次 Codex 会话更新）

> 这是交接快照，不是聊天记录。不得记录真实密码、密码哈希或凭据文件内容。

- 日期：2026-10-19
- 阶段：P2-R 本机真实账号发放、安全验证与代码验收完成；待 GitHub 同步收尾。完成后暂停，等待 P3 授权。
- Git 起点：`main` 与 `origin/main` 同步于 `624154eec3155008af7a0f34ce50bdcdce99065b`；当前改动只属于 P2-R。远端尚未推送本轮提交。
- P2-R 实现：SQLite V3 增加强制首次改密和测试账号标记；本机 TTY provisioning CLI 用 CSPRNG 生成四个不同的临时密码，检查用户名冲突后整体中止，不覆盖账号；生成 Argon2id 哈希；凭据通过 `0700` 目录、`0600` 文件交付。新账号和重置密码账号都要求先改密；强制状态期间仅允许本人身份、改密和退出；首次改密事务撤销旧会话并签发新会话。API、账号列表和结构化日志不泄露密码或哈希。
- 本机实际数据库：迁移前 V1 `integrity_check=ok`，用户、题库、题目、作答数量均为 0。使用 SQLite backup API 生成并校验 `0700/0600` 备份；优雅停止 P1 进程后升级到 V3，保留原空数据集。现在有四个 `user` 角色账户，均首登待改密；恰有一个测试账号标记。没有应用管理员记录、没有题库；本轮未导入 Excel，也未创建额外管理员。该限制已写入路线图/中期记忆。
- 凭据清单已在创建后删除；四个初始密码位于本机权限受限文件中，保留供管理员使用。不要在后续命令、聊天、测试日志、文档或 Git 输出密码/哈希。
- 真实 API 验证：使用本机凭据文件，四个账号均独立成功登录；响应为普通角色且包含首登改密标志，不含密码/哈希；受保护题库和管理员访问按门禁拒绝；每个会话退出后 `/api/auth/me` 返回 401。Argon2id 哈希逐一匹配初始凭据，数据库不保存明文。
- 测试：`apps/server` 的 `npm run typecheck`、`npm run build`、`npm run test` 通过（25 项）；`apps/mobile` 的 `npm run typecheck`、`npm run build`、`npm run test` 通过（UI smoke 13 项）；`apps/server` 的 `npm run test:browser` 通过。Chromium 实测强制改密、真实题库临时导入/练习、登录退出、真实统计与 Preview 隔离。
- 本轮浏览器发现并修复：首次强制改密完成后，题库 hook 未按 `mustChangePassword` 状态刷新，导致界面保留首登 403；现已在改密状态变更后重取题库，改密门禁显示期间不发送正式题库请求。浏览器 smoke 的题量断言和题目切换等待条件也改为与实际 UI/异步状态一致。
- P2-R 浏览器截图：AI 产出目录 `图片与设计/理论考试练习系统/P2-R-账号与密码安全验收-20261019/`，包括 390×844、360×800、1536×1024 关键画面、登录和导入过程。
- 服务端已重启并运行 P2 构建，监听 `127.0.0.1:3000`；`/api/health` 显示 migrationVersion 3。用户管理 `/admin` 当前仍处于管理员初始化状态。正式公网/局域网部署必须使用可信 HTTPS；不能承诺用户无法从自己浏览器 DevTools 查看自己刚输入的密码。
- 更新文件：`docs/PRD-V1.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/ROADMAP.md`、`memory/LONG_TERM.md`、`memory/MID_TERM.md`；API 文档也有 P2-R 认证响应/强制改密约定。
- GitHub Issue #2/#3 已读取；Issue #2 准备在 P2-R 完成后按用户要求关闭，Issue #3 保持 OPEN 并继续包含 Web Cookie/CSRF/XSS、Android 安全存储、可信 HTTPS、frp 管理入口隔离、APK 更新验证等任务。
- 安全边界：`local-input/`、SQLite、备份、凭据、`.env`、日志、密钥和个人资料不得进入 Git。四级规则未变；本阶段不进入 P3、不推送公网、不发布 Release。
