# 中期记忆（阶段 / 里程碑）

更新时间：2026-11-09（main 主线整合完成；P5-B 仍有三项运维收尾阻塞）

## main 主线整合（2026-11-09）
- 目标达成：`main` 此前停在 P4（`b6cdb05`），现正式接收 P5-A / P5-B 全部成果，重新成为可信主线。
- PR [#8](https://github.com/MilchstraBe-Endless10/theory-exam/pull/8) `feat/p5-a-android-security` → `main`，普通 merge commit，无强推。
- Merge Commit SHA：`2dffb069b8262dc881cf29180833e5c5e564320a`；合并前该分支领先 main **19 个提交 / 133 个文件（+7317 / −288）**，0 behind，merge-base 即 main 旧 HEAD，无冲突。
- 保留成果：原功能分支未删除；`v1.0.0-dev.10-test` 测试预发布未改动；未创建正式 Release；P6 未开始。
- 未触动：正式 SQLite 仍为 V6 现状、未迁移未重置；MeFrp、生产证书、三个运行中 user unit 均未改。

### 合并后（main HEAD 隔离干净检出）验证
- 服务端 typecheck / build 通过；`test` **62/62**；`test:browser` **12/12**；`test:web:browser` **10/10**（16 路由 × 6 视口，无未捕获异常）。
- 客户端 typecheck / build 通过；`test:ui` **20/20**；会话回归 **6/6**。
- Android `:app:assembleDebug` 构建成功（合并前在 feat HEAD 同环境验证）。
- 结论：合并后 main 的 tree 与合并前验收基线 `5cf2706` 完全相同，行为一致。

### 本机环境备注（可复用的排障结论）
- Gradle `~/.gradle/caches/8.14.3/transforms` 曾出现 `metadata.bin` 不可读的缓存损坏，表现为 `checkDebugAarMetadata` 报 "Could not read workspace metadata"。修复：删该 transforms 目录 + `./gradlew --stop` 后重建。
- 同一版本重复构建后，`node_modules/@capacitor/*/android/build` 残留会导致 `bundleLibRuntimeToDirDebug` 报 "class already exists"。修复：清掉插件 android/build 目录再构建。
- `local-input/` 为 Git 忽略；隔离检出跑 `exam.test.ts` / `review.test.ts` 前需把本机 Excel 复制进去，否则用例按设计失败（不是代码回归）。

## 当前阶段
**P0、P0-M、P1、P2、P2-R、P3、P4、P5-A 均已完成验收。P5-A 最终普通 APK 基线为 `com.theoryexam.mobile.dev` dev.9/versionCode 9，SHA-256 `3db11faf2ffd96118f79f5582b7a82fa6ba739c259b9cde96081f7a6d8e73ad5`；真实 Android `startScan()`/ML Kit/Bridge/地址处理及相机生命周期通过。P5-B 核心部署已完成：三项 user systemd 服务、MeFrp 双 TCP、IP HTTPS、SQLite V6 与 1,283 题；dev.10 登录/真实练习/收藏/会话恢复和 Web 全站既有验收通过。本轮新增跨物理盘一致性备份及每日证书检查 timer，并完成隔离恢复。P5-B 仍未关闭：LAN 地址未固定且 nftables 有效规则无法读取、静态规则没有 LAN 3000/8080 明确放行；两个 MeFrp 客户端 token 仍在 argv，切换凭据加载方式缺少已验证配置与安全维护窗口。P6 正式签名和完整更新链未开始，且不属于 P5-B 阻塞。**

## Git 开发流程（长期约束）
- 正式仓库：`https://github.com/MilchstraBe-Endless10/theory-exam`，**2026-11-09 已转为 Public**（公开前完成生产坐标脱敏，见 SHORT_TERM）。`main` 为唯一可信主线，开发成果经 PR 普通合并；2026-11-09 已把 P5-A/P5-B 成果经 PR #8 合入 main。每次开发开始前检查工作区/分支/远端并 fetch；阶段验证通过后默认普通提交、推送并核验远端 SHA。
- 提交包含阶段编号和实际修改；远端变化、无关改动、验证失败或安全风险时暂停。禁止强推、覆盖历史、公开仓库、正式 Release 和敏感文件入库；不得删除、重置、覆盖未经确认的用户改动。
- 每轮汇报提供 GitHub commit 链接和同步状态。
- P1 起每阶段依序完成同步检查、开发、测试、安全检查、提交、推送、GitHub 验证、记忆更新和汇报；未完成阶段可推送到独立开发分支，验收通过后普通合入 `main`。

## 阶段状态
- [x] P0 视觉底座与项目骨架
- [x] P0-M 手机 12 页面实现与视觉验收（独立阶段，2026-10-19 完成）
- [x] P1 服务器、鉴权与 Excel 题库导入（本地验收及 GitHub 同步完成）
- [x] P2 日常练习及学习进度（本地验收及 GitHub 同步完成，2026-10-19）
- [x] P2-R 四账号、首次改密与密码安全（本机真实库 V3 迁移和四账号登录验收完成，2026-10-19）
- [x] P3 模拟考试、断线恢复、成绩历史（真实题库隔离导入、浏览器验收与 GitHub 同步完成，2026-10-19）
- [x] P4 错题复习和学习分析（V5 轮次、三态掌握、只读 db:status 修复、浏览器验收完成）
- [x] P5-A Android APP 与网络安全、备份和更新（2026-10-22；dev.9 正式实时扫码与本轮同哈希重建通过；dev.7 核心业务/会话/收藏/考试和 12 屏未受影响验收复用；server 59/59、mobile UI 20 项、session 6/6、浏览器/Gateway smoke、APK 隔离和 systemd 模板检查通过；阶段提交 `84fa7d6b796a74433728ef3f8ac98644c096a970` 已推送）
- [ ] P5-B 正式 systemd、可信 HTTPS、frp 与 V4→V6 数据库部署及总阶段收尾（核心部署和业务验收完成；收尾受 LAN DHCP/防火墙核验与 MeFrp argv 凭据风险阻塞）
- [ ] P6 系统回归、发行准备与 GitHub 发布

## P5-B 运维收尾核验（2026-10-23）
- 三个生产 user services 均 active/enabled、`Restart=on-failure`（3 秒）、重启计数 0，Linger=yes；新增 `theory-exam-p5b-maintenance.timer` 每日运行，先用 SQLite `VACUUM INTO` 生成 V6 一致性备份，再复制到独立 `<BACKUP_VOLUME>` 文件系统并验证。
- 最新跨盘备份 `daily-2026-10-23T04-36-47-973Z-fcbd1479.sqlite` 为 0600；隔离恢复后 `integrity_check=ok`、FK 违规 0、迁移状态 ready、题目 1,283、启用题库 1。备份盘位于独立于 root NVMe 的双盘 ext4 LVM；这不是异地备份。
- API/Web 叶证书有效至 2027-11-23，CA 有效至 2036-10-19；私钥目录 0700、密钥 0600。timer 每日核验链与公网/LAN/loopback IP SAN，并在叶证书 60 天、CA 180 天内到期时使 unit 失败并写 journal；未自动重签/轮换。
- 严格 CA 下公网端口 30946/10393 和本机 loopback/LAN listeners 的 health 都返回 200、migrationVersion=6；公网管理页面/API 404。Cookie/Origin 对同 IP 不同端口检查 2/2 通过（Web 同源 204、跨端口 403）。
- 仍需权限/外部操作：NetworkManager 为 DHCP auto，路由器静态租约未确认；`nftables` active，配置文件 INPUT policy drop 且未明确允许 LAN 3000/8080，当前用户不能读取有效 ruleset/修改系统防火墙；两条 MeFrp 进程通过 `-t` argv 传递认证 token，未贸然重启隧道或轮换凭据；到 MeFrp 节点流量经 `tun0/table 2022`，策略路由用途未确认，快捷启动配置也未暴露 localIP/localPort。P5-B 不得标记完成，直到 LAN 固定地址/防火墙和安全凭据加载方式有实际证据。

## 本阶段验收
1. 可执行的本地 dev 启动脚本。
2. 1536×1024 视觉截图，布局和细节接近 `design/reference/dashboard-desktop-v1.png`；保留比对证据。
3. 390×844 能操作且无明显溢出；非首页页面提供清晰的路由占位但不伪装已完成。
4. TS 类型检查/前端构建/基础测试可运行，实际结果有记录。

## 后续阶段依赖
- P1 使用 `local-input/四级理论试题.xlsx` 做真实导入验收；确保原始文件 gitignored。
- P0-M 已按 `design/reference/mobile-12-screens-v1.png` 完成 12 个手机页面；390×844 与 360×800 的逐页截图和检查见验收记录。示例数据不能作真实后端数据。
- P3 不能依赖客户端时间判分；P5 不能将公网维护接口暴露。
- P5 双入口目标：Android API `theory-exam → 127.0.0.1:3000`、浏览器生产 Web `theory-exam-web → 127.0.0.1:8080`。两隧道未启动，当前 3000 仍为旧 P4/V4 服务。新 8080 入口只服务 mobile production dist 和 allowlist business API，不能访问 `/admin`、`/api/admin/*` 或 bootstrap。
- 当前没有自有域名/受信证书；普通浏览器不继承 Android Network Security Configuration 的私有信任锚。TLS 候选为免费可控 DNS 子域名 + DNS-01 公信证书 + MeFrp TCP TLS 透传，需用户选择 DNS 服务并验证 API/续期。禁止忽略证书错误；手机 API TLS listener 尚未部署。

## P3 本地验收记录（2026-10-19）
- 从 P3 基线 05a2225af20f70c6ac9eacec6d04f9f90f1fed66 开始开发。V4 迁移仅新增逐题答案版本、标记、幂等写入键、成绩分项/完整复盘及考试历史索引；V1–V3 未改写。组卷绑定活动题库版本和规则，按单选/多选/判断分区随机抽题，保存唯一题目快照、分值、答案、开始和截止时间；每用户只允许一场进行中考试。
- 新增服务端 /api/exams 端点：开始/恢复、活动考试、历史、单题答案同步、交卷与结果读取。考试期间不返回答案键；答案用逐题版本与 requestId 防止旧写覆盖并支持重试。服务端启动、15 秒扫描及到期读取时结算超时，只计算截止前确认的答案。结果交易幂等，错答只计一次，未答不计错题；历史结果保留题库版本快照。
- 手机与桌面考试设置、答题、服务器倒计时、180 题答题卡、标记、同步状态、二次交卷、成绩复盘和考试记录接入真实 API；首页最近考试成绩读取服务端历史。开发 Preview 未写入业务数据。
- apps/server 的 typecheck、build、test 全通过；服务端全套 30 项通过，其中 P3 覆盖真实 Excel 导入、180 题唯一组卷/100 分、答案保密、规则缺失/题量不足、多选严格判分、请求幂等/版本冲突、超时边界、重启恢复、跨账号隔离、首次改密门禁和历史版本复盘。apps/mobile 类型检查、构建及 UI smoke 全通过（13 项）。
- Chromium 真实浏览器流程全通过：临时 SQLite 导入本地 Excel 1,283 题（单选 845、多选 38、判断 400）；创建考试、离线后重试、180 题答题卡跳题、页面刷新/退出登录/重新登录恢复、交卷确认、评分、结果历史、桌面入口及 Preview 数据隔离。截图目录：<AI_ARTIFACT_ROOT>/图片与设计/理论考试练习系统/P3-模拟考试验收-20261019-10/，包括 390×844、360×800 与 1536×1024 画面。浏览器 smoke 中暴露的异步同步等待竞态已改为等待实际数据库确认后复测通过。
- 视觉复核：手机设置、答题、答题卡、结果及桌面答题/复盘布局正常；360×800 答题卡可滚动访问 180 题。结果为长页面，可滚动查看完整复盘。未观察到横向溢出或桌面首页回归。
- 正式本机库最初在 P3 开发前为 V3、4 个普通账号、无管理员、无题库。检查时运行 npm run db:status，而该 CLI 的 openDatabase() 会自动应用迁移，因此 V4 已被应用到正式库；迁移为增量 schema，未删除/重置账号或导入题库。随后只读核实：migration 4、用户 4、管理员 0、题库 0、进行中考试 0。旧服务优雅停止，当前 127.0.0.1:3000 运行 P3 构建；健康检查为 200/V4，未认证考试 API 返回 401。正式库没有初始化管理员，也没有导入真实题库。
- 四级规则保持 120 单选×0.5、20 多选×1、40 判断×0.5，共 180 题、100 分、90 分钟。长期规则未变化，memory/LONG_TERM.md 未修改。
- P3 实现提交 `df6e68d21cb867787676a1474b04387c2b77cd99`（[GitHub commit](https://github.com/MilchstraBe-Endless10/theory-exam/commit/df6e68d21cb867787676a1474b04387c2b77cd99)）；随后修正 Dashboard hooks import 的提交为 `e6fdc9de37f153e255e46213fd4f30e49ea6ef12`（[GitHub commit](https://github.com/MilchstraBe-Endless10/theory-exam/commit/e6fdc9de37f153e255e46213fd4f30e49ea6ef12)）。普通 push 后本地 HEAD、origin/main 和 git ls-remote 均核对为 e6fdc9de37f153e255e46213fd4f30e49ea6ef12；仓库保持 Private，无强推、Release 或敏感文件。

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

## P2 本地验收记录（2026-10-19）
- SQLite V2 迁移新增持久化练习会话、固定的题目顺序和答题关联/唯一约束；V1 迁移未改写。服务端实现 `/api/practice/*`、`/api/favorites`、`/api/progress`，全部依据认证会话限定用户；普通题目响应不带 `answer_json`、`raw_answer` 或正确答案。正式作答在事务内完成服务端判分、`practice_attempts` 写入、错题基础状态更新和会话进度更新；相同答案重试返回既有结果，修改已提交答案被拒绝。
- 手机和桌面练习选择、题目加载、选择/多选、即时反馈、前后题、收藏、退出/恢复与首页统计已接入真实 API。未提交选择只保存在当前设备并有未保存提示；网络失败不显示已保存成功。首页展示真实题量、不同题目接触数、未作答数、提交次数、总体与题型正确率、收藏/待复习数及最近练习；考试分数留给 P3。
- 自动化：`apps/server` 类型检查、构建通过，`npm run test` **18 项通过**（覆盖 P2 判分、答案保密、幂等、跨账号隔离、收藏、未做筛选、退出后恢复到原题号、随机不重复、题库版本、回滚、会话失效及重启后反馈恢复；其余含 P1 回归）。`apps/mobile` 类型检查、构建通过，`npm run test` UI smoke **13 项通过**。
- Chromium 真实题库端到端：只使用隔离临时 SQLite，通过管理页导入本机 `local-input/四级理论试题.xlsx`，显示 **1,283 道（单选 845、多选 38、判断 400）**；普通账号实际登录后正确答对一题、答错一题，检查服务端持久化；退出并重登后恢复 **2 道已接触、50% 正确率、1 道待复习**。另模拟一次提交网络失败（数据库无新增作答），成功重试；开发 `?preview=1` 预览前后练习/作答/收藏/错题表行数保持相同。测试进程和临时数据库已清理，未操作既有真实业务数据库。
- 浏览器截图 18 张，覆盖 390×844、360×800 与 1536×1024 的练习选择、答题、正确/错误反馈及学习首页，另含管理员导入、登录、考试规则和空状态。最终验收目录：AI 产出目录 `图片与设计/理论考试练习系统/P2-真实刷题浏览器验收-r12-20261019/`。视觉检查发现并修正桌面结果缺少反馈/选项样式、侧栏账号未随登录更新；修改后的截图显示真实反馈、正确/错误选项状态和统计值。
- `docs/API.md` 增补端点、请求/响应、错误码和幂等说明；ADR-013 记录会话与作答设计，ADR-014 记录 frpc 环回代理管理入口风险及 P5 先决条件。四级考试规则未改变；完整跨轮次错题掌握状态机留给 P4；`memory/LONG_TERM.md` 未修改。
- P2 实现提交：`1dac8e9a25fecb0adfcf1f13c4387c594f1adce0`，<https://github.com/MilchstraBe-Endless10/theory-exam/commit/1dac8e9a25fecb0adfcf1f13c4387c594f1adce0>。普通 push 成功；推送后本地 `HEAD`、`origin/main` 和 `git ls-remote` SHA 一致。GitHub API 确认仓库 `PRIVATE`、默认分支 `main`，远端文件树含 P2 服务、路由、客户端 API、自动化测试、API 文档和记忆；敏感文件树扫描无本地题库、Excel、数据库、环境变量或 frp 配置。随后增加的记忆同步提交只记录此验证，不改变 P2 功能代码。
- 既有运行态边界：只读检查发现 `127.0.0.1:3000/api/health` 返回 200，但 `/api/practice/sessions/active` 返回 404，说明常驻进程仍载入 P1 代码。本轮没有重启该服务、运行 V2 迁移或连接真实业务库，以遵守“不影响已运行服务和 SQLite”的要求。P2 浏览器 E2E 使用临时 Fastify 进程和隔离 SQLite 并导入本机真实 Excel。实际用户启用 P2 前需安排服务重启并应用非破坏性 V2 迁移；不得将当前 P1 运行进程描述为已提供 P2 API。

## P2-R 本地验收记录（2026-10-19）
- 开发前 `main` 与 `origin/main` 同步于 `624154eec3155008af7a0f34ce50bdcdce99065b`。P2-R 实现提交 `518dbfdc6082396a79e1205421b7964d7b9ff2ff` 已普通推送并验证本地 HEAD、`origin/main`、GitHub `main` SHA 一致；[GitHub Commit](https://github.com/MilchstraBe-Endless10/theory-exam/commit/518dbfdc6082396a79e1205421b7964d7b9ff2ff)。仓库仍为 Private。
- 已读取 GitHub Issue #2/#3。Issue #2 的账号需求按最新用户确认执行：三个正式普通用户、一个长期保留的专用测试普通用户；测试标记不增加权限。Issue #3 保留尚未完成的 Web Cookie/CSRF/XSS、Android 安全存储、可信 HTTPS、frp 管理入口隔离、APK 更新验证等事项。
- 常驻旧 P1 服务先通过 SQLite 在线备份接口创建 `0700/0600` 安全备份；备份 `integrity_check=ok`。备份时实际库为 V1，`users/question_banks/questions/practice_attempts` 均为 0。优雅停止旧进程后应用不可破坏的 V2/V3 迁移，当前 SQLite 完整性正常、版本 3，原有空数据集未丢失。
- 通过本机 TTY CLI 创建四个 `user` 角色账户；全部初始密码互不相同，格式为 8 位随机英文字母 + `YYMMDD`，仅放入数据库外 `0700` 目录中的 `0600` 本机凭据文件。账号清单创建后已删除；凭据文件保留供本机管理员单独交付。数据库只存 Argon2id 编码哈希，四个账号都保持 `must_change_password=1`；唯一测试标记为 1。真实账号初始密码没有改写、输出到聊天/日志或加入仓库。
- 本机 API 使用真实凭据逐一登录：四个账号均为普通用户、首登强制改密；登录响应不含密码或哈希；题库/管理访问被强制改密门禁拒绝；退出后原会话失效。验证脚本同时用 Argon2id 校验每个真实哈希与本机凭据文件内的对应初始密码，但不输出密码或哈希。
- 隔离自动化 `apps/server`: 类型检查、构建通过；`npm run test` 25 项通过，涵盖 V3 保留既有用户、初始密码生成和冲突中止、独立 Argon2id 盐、首次改密旧密码/旧会话失效、不同账号隔离、普通用户管理权限、禁用/重置撤销会话、密码字段不入响应及日志脱敏。`apps/mobile`: 类型检查、构建通过；`npm run test` 13 项通过。
- 真实 Chromium `npm run test:browser` 通过：临时 SQLite 中管理员创建普通用户、真实 Excel 预览/确认 1,283 题（845/38/400）、手机连接、强制改密、题库/练习、退出重登及统计；网络失败不伪造成功，`?preview=1` 不写正式数据，手机和 1536×1024 桌面首页均检查。修复了改密后题库 hook 未重取的问题及 smoke 对题量文案/异步路由的错误等待。截图在 AI 产出目录 `图片与设计/理论考试练习系统/P2-R-账号与密码安全验收-20261019/`。
- 更新 PRD、架构、ADR、路线图、长期与本短期记忆；未把账户姓名或密码写入仓库文档。应用管理员尚未在真实运行库初始化，数据库仍无题库；本轮未导入原始 Excel，也未创建额外管理员。服务端已在 `127.0.0.1:3000` 运行 P2 构建，健康检查报告迁移版本 3。正式公网/局域网服务仍必须经可信 HTTPS。
- GitHub 远端树确认包含 V3 迁移、账号发放逻辑、账号安全测试、手机认证改密 UI、API/PRD/架构/路线图与记忆；没有原始 Excel、数据库、凭据、环境文件或 frp 密钥。仓库保持 Private。Issue #2 已附无密码验收摘要后关闭；Issue #3 保持 OPEN，尚未完成的安全工作继续跟踪其中。

## GitHub 首次上传记录（2026-10-19）
- 私有仓库：<https://github.com/MilchstraBe-Endless10/theory-exam>；默认分支 `main`。
- 首次内容提交：`ff2d7fb56f332d99ee83eaa2c6fae6f01180a453`（`P0: initialize project and mobile design baseline`）。首次普通推送成功，GitHub `refs/heads/main` 与该提交 SHA 一致。
- GitHub API 文件树与本地提交文件清单一致；共 41 个文件。题库 Excel、`local-input/`、`node_modules/`、`dist/` 均未上传；仓库状态为 private。
- P0-M 实现提交：`8d283a19d5523265780c36b756d6ba7004624e1d`（`feat(mobile): complete P0-M mobile UI and visual validation`），[GitHub Commit](https://github.com/MilchstraBe-Endless10/theory-exam/commit/8d283a19d5523265780c36b756d6ba7004624e1d)。普通推送成功；GitHub API、`git ls-remote`、本地 `HEAD` 和 `origin/main` 均确认 SHA 一致。
- GitHub 验证：仓库 `private=true`，默认分支 `main`；远端树包含 P0-M 页面、样式、UI smoke 和手机视觉基准，未包含 `local-input/`、Excel 原始题库、数据库、环境变量或密钥。暂存差异安全扫描与 `git diff --cached --check` 通过。
- 本轮复验：`cd apps/mobile && npm run typecheck` 通过；`npm run build` 通过；`npm run test` 通过，包含 13 组 Chromium UI smoke，覆盖两种手机视口、导航、表单、题型选择、答题卡、错题筛选、个人中心、桌面回归和控制台错误检查。

## 更新规范
只有里程碑通过验收时打勾；如果仅代码写完但没运行/没验证，标记「阻塞/待验收」。记录实际测试证据和影响后续阶段的重要技术决策；不要重复全文 PRD。

## P4 本地验收记录（2026-10-19）
- 开发从 `51bfeaa41e0c15b5146c99a51528f3f7ab399d89` 开始；开发前与 fetch 后 `main`/`origin/main` 同步，未发现用户改动。Issue #5（P4 错题复习）和 #6（db:status 只读）均已读取并按清单实施。
- Issue #6：`db:status` 改用只读连接，状态检查不创建数据库、不迁移；无迁移表、数据库不存在和版本超前有明确输出。`db:migrate` 独立执行；已有数据升级先做 SQLite 一致性备份。隔离库测试确认执行前后 schema、迁移版本及数据不变；正式 V4 数据库未被该阶段的测试或迁移修改。
- 新增 V5 增量迁移，V1–V4 未改写。独立复习轮次固定用户、题库版本、筛选、策略、数量、题目及顺序，并保存逐题作答、状态、时间与历史；唯一约束和事务保护同轮重复请求及状态更新。掌握状态为待复习 0、巩固中 1、已掌握 2；错误会将其归零并只记一次。普通练习/考试正确不推进掌握，相关答错重置错题状态。已掌握记录保留，可筛选复练。
- 提供复习轮次创建、当前/恢复、题目、答题、退出、历史与统计 API；组合题型、状态、薄弱优先和 10/20/全部数量筛选由服务端执行。薄弱顺序为待复习优先、再巩固中，同状态按错误次数降序。题目答题前不泄露答案，反馈只在服务端确认写入后返回。手机错题设置/答题/反馈/历史及桌面错题本改为真实服务端数据，Preview 隔离。
- 自动化验证：`apps/server` 类型检查、构建通过，测试 **48 项通过**，包含 Issue #6 只读库验证和 P4 三态、不同轮次、重试幂等、重复错答、筛选、随机不重复、退出恢复、版本/账号隔离及持久化；`apps/mobile` 类型检查、构建通过，UI smoke **14 项通过**。
- Chromium 使用隔离 SQLite 及本机真实 Excel 完成实际流程，导入 **1,283 题（单选 845、多选 38、判断 400）**；验证普通练习错答入错题、单选/薄弱优先/10题组合、实际题量不足提示、退出后恢复、不同轮次连续正确后成为已掌握、历史结果及桌面错题本。390×844、360×800、1536×1024 截图均检查，视觉与交互问题已修正。截图目录：`<AI_ARTIFACT_ROOT>/图片与设计/理论考试练习系统/P4-错题复习验收-20261019-03/`。
- 正式数据库状态未改变：V4、四名普通账号、无管理员、无正式题库。本阶段不初始化管理员、不重置账号、不导入正式题库。正式启用仍需本机管理员操作及题库导入。
- API 文档、架构、ADR、路线图及本记忆已更新；`memory/LONG_TERM.md` 未改（长期业务规则不变）。P4 实现提交 `35466874d28cb7f018df72bd46e4586c5f93e7f3`（[GitHub commit](https://github.com/MilchstraBe-Endless10/theory-exam/commit/35466874d28cb7f018df72bd46e4586c5f93e7f3)）已普通推送；推送后 `HEAD`、`origin/main`、`git ls-remote` 与 GitHub API commit 均一致。仓库仍为 Private。Issue #6（只读状态修复）与 Issue #5（P4）均在全部验证通过后以 completed 关闭。

## P5-A 隔离开发记录（2026-10-19；尚未完成阶段验收）
- 从 `b6cdb05b6b737218b0b82d9fa8f1fd7a94230c6c` 开始，初始 `main` 与 `origin/main` 同步且工作区干净；已读取 Issue #7、#1、#3。当前仅在隔离环境开发，未启动 P5-B、未改真实 frp/systemd/证书配置、未迁移正式数据库或发布 Release。
- Fastify 学习与管理流量拆为独立 listener：学习入口不挂载管理页面、管理 API 或首次管理员初始化；管理入口仍 loopback。隔离测试模拟 loopback 转发到学习入口，管理路由和页面均不可达。真实 frpc/frps 与两个系统服务当前未运行；本机遗留 Fastify 3000 健康检查仍报告 V4，3001 无服务。
- Web 会话使用 HttpOnly/SameSite Strict Cookie、CSRF token、Origin 检查和生产 Secure 强制；浏览器旧 Bearer local/sessionStorage key 启动时清理。Android 使用 Capacitor secure storage；V6 新增 CSRF 与 remember 策略并按旧期限回填，`POST /api/auth/renew` 按 12 小时/30 天策略滑动续期。禁用、过期、撤销与首登待改密会话拒绝续期。正式数据库仍为 V4，`db:status` 只读报告待迁移到 V6；未执行迁移。
- Capacitor Android 工程已生成，开发身份为 `com.theoryexam.mobile.dev` / `1.0.0-dev.1`；扫码、网络、状态栏、返回/恢复和 APK 安装器流程已接线，明文流量默认关闭。私有 Release 同步只接受固定 APK/manifest，服务端缓存按 SHA-256 校验，更新下载要求用户会话；进行中考试时不打开系统安装器。未读取 Token、没有发布 Release、没有测试 APK或正式签名。
- SQLite 备份使用 `VACUUM INTO`，校验完整性/外键，日备份保留七份；恢复要求先备份当前库、确认且声明服务已停止。systemd service/timer 模板已加入仓库，未安装或启动。
- 环境：Omarchy 4.0.4、Node v26.8.2、npm 11.19.1；无 Java/JDK、Android SDK、Gradle、Android Studio、adb、模拟器。`npm run android:debug` 中 web build 与 `cap sync android` 成功，Gradle 在启动前以 `JAVA_HOME is not set` 失败；无 APK 构建或安装证据，因此 P5-A 不打勾。
- GitHub：P5-A 实现提交 `be07b283359fea856ef2ff877a5c95da210839db`、Android 模板测试包名修正 `40abf0beb37d3b3a2b6abec27630972a9f455f1a`、APK FileProvider 收窄到专用缓存目录 `b9e404279c9aa74787e58a8939e9b5c1cbcacda6` 均普通推送到 `feat/p5-a-android-security` 并经远端 SHA 核验；`main` 保持在起始基线。仓库仍为 Private。中短期记忆同步另有 docs commit。
- 运行库只读观察：`127.0.0.1:3000/api/health` 返回 `migrationVersion: 4`；`db:status` 返回 `migration_pending`（V4→V6，exit 1 是待迁移状态信号），未更改 DB。`127.0.0.1:3001` 无 listener。`theory-exam.service`、`frpc.service`、`frps.service` inactive，frpc/frps 进程不存在。P5-A 等待具备 Android 工具链的构建/安装验证；P5-B 还需用户确认实际 systemd、V4→V6、可信 HTTPS 与 frp 变更方案。

## P5-A 双入口 Web 补充验收（2026-10-19；P5-A 仍未完成）
- Android 工具链补充：本机 Omarchy 4.0.4/x86_64 已在用户目录安装 Temurin JDK 21.0.12.1、Google SDK Command-line Tools 23、Android Platform 36、Build Tools 36.0.0/35.0.0、Platform Tools/adb 37.0.1；用 Gradle Wrapper 8.14.3 / AGP 8.13.0 成功完成 `npm --prefix apps/mobile run android:debug`。Google Android SDK License 已由用户在本对话明确确认。
- 已核验 Debug APK：`com.theoryexam.mobile.dev`、1.0.0-dev.1/versionCode 1、minSdk 24、targetSdk 36，Android Debug key 签名；SHA-256 `329e776eb46e298c17efce70c7424c9c050e9374b3379bdad41ea2664c785f9e`。APK、构建日志与校验文件存于 AI 输出目录 `其他/理论考试练习系统/P5-A-Android验收-20261019-01/`；Debug 包不可作为 Release 或稳定更新包。
- ADB 无已连接设备，USB 只见键盘/鼠标，没有 `/dev/kvm` 且未安装模拟器。APK 构建虽成功，Android 安装/启动及扫码权限、secure storage、网络/考试恢复、系统更新安装器均尚无设备证据；不宣称 Android 真机验收通过。前后端回归本轮通过：server 59/59、mobile UI smoke 14/14、Chromium Web smoke 通过。正式 3000/V4 SQLite 保持未动，MeFrp 离线。P5-A 仍未完成，也未进入 P5-B。
- 本轮在 `feat/p5-a-android-security`（开始时 `a791adc6fcdcf519e160098f07a42686cfc606e0`、工作区干净）新增 Node 标准库生产 Web Gateway：loopback `127.0.0.1:8080`、提供 `apps/mobile/dist`、React SPA 刷新、hashed asset immutable cache、index no-cache、文件/未知 API 404、CSP 与安全响应头。生产模式没有可信 TLS cert/key 时拒绝启动；API target 限定 loopback HTTP(S) origin。
- `/api/*` 仅代理 `/api/health`、认证、题库、练习、收藏、进度、考试、错题复习及更新业务路由。管理/bootstrap/未知 API/编码路径/点文件/不支持方法在 proxy 前拒绝，且不触发 SPA fallback。网关不转发 `Forwarded`、`X-Forwarded-*` 和 `X-Real-IP`，API 响应禁缓存。Fastify business surface 同样不注册管理页面或 API。
- 非开发浏览器构建固定使用当前 origin；沿用 `HttpOnly; SameSite=Strict; Secure` Cookie（生产 API 强制 Secure）、CSRF token 与精确 Origin allowlist。Android Capacitor 继续走服务器地址和原生 secure-storage Bearer。隔离 SQLite 集成验证两种会话最终关联同一用户/DB，错误 Origin/缺 CSRF 的写操作被拒；浏览器响应不含 Bearer token。既有 P3 `expectedVersion`/`requestId` 考试答案冲突逻辑未改，服务端回归覆盖。
- 安全隔离实测：业务 Fastify listener 与 Web Gateway 对 `/admin`、`/api/admin/*`、bootstrap 及大小写/编码/重复分隔变体均不可达（404）；故意会对管理路由回 200 的测试上游未收到任何管理路径。正式 3000 与真实数据库未接入测试。
- 验证：`apps/server` typecheck/build 通过、**59/59** 测试通过；`apps/mobile` typecheck/build 通过、UI smoke **14/14**；`npm run test:web:browser` 用 production dist、隔离 SQLite 和 Chromium 验证同源登录、HttpOnly、无 token storage、CSRF 正反向、管理路径拒绝、`/practice` 刷新以及 390×844/1536×1024 无横向溢出。截图：`<AI_ARTIFACT_ROOT>/图片与设计/理论考试练习系统/P5-A-Web入口浏览器验收-20261019/`。
- 另以 `NODE_ENV=test WEB_HOST=127.0.0.1 WEB_PORT=8080 WEB_API_TARGET=http://127.0.0.1:3000 npm run web:dev` 启动正式 CLI 路径，`/` 与 `/practice` 均返回 200/no-cache，`/api/admin/status` 返回 404；随后停止测试进程。生产模式缺 cert/key 的拒绝启动也实际验证（预期 exit 1）。
- TLS 研究：MeFrp TCP 高位端口本身不提供浏览器/APP 到本机 TLS。普通浏览器不会使用 Android APP 的私有信任锚，不能忽略证书警告。候选为免费可控 DNS 子域名 + DNS-01 公信证书 + TCP TLS 透传；Let’s Encrypt IP cert 有效约 160 小时并要求通过标准 80/443 验证 IP 控制，当前 MeFrp 分配 IP/高位端口不满足可控性。未选 DNS 服务、未申请证书；手机 API 3000 仍为旧 P4/V4 HTTP 进程，公网禁止开放。
- 边界确认：正式库 V4/四个普通账号，没有迁移、密码、管理员、题库操作；当前旧 3000 与原 Vite preview 进程未被替换；Web fixture 只用临时 SQLite/API，已停止；8080 已释放。两条 MeFrp 隧道未启动，未改 systemd/证书/公网配置。
- 下一步：P5-A 仍需在具备 Android JDK/SDK/adb 的主机完成 APK 构建/安装与原生网络/扫码/更新验证。P5-B 前必须提供具体 TLS/DNS 方案及包含回滚的旧 3000 服务升级、V4→V6 正式迁移和隧道变更清单并获得用户另行确认。
- 双入口实现提交：`fb00f720a5d9a02927c834579f0b797570d5c159`（<https://github.com/MilchstraBe-Endless10/theory-exam/commit/fb00f720a5d9a02927c834579f0b797570d5c159>）；记忆同步提交 `6b2e4da7356f85b83283be18bc329818d9f7a845` 已推送，普通 Push 后 `HEAD`、`origin/feat/p5-a-android-security` 和 `git ls-remote` 一致；`main` 仍为起始基线。


## P5-A 本机 Android 首次验收失败记录（2026-10-20；后续 KVM/API35 复测见文末）
- 用户批准下载并创建本机 AVD。本机 Google Emulator 37.2.12 / Android 16 API 36 x86_64 已出现可视化系统窗口；APK SHA-256 `329e776eb46e298c17efce70c7424c9c050e9374b3379bdad41ea2664c785f9e` 与指定版本匹配，包管理器确认安装，Activity 可启动。
- 模拟器因宿主无 `/dev/kvm`、CPU 未暴露 VT-x 而以 TCG 运行。启动页之后 WebView 创建 `SIGTRAP`，涉及 `libmonochrome_64.so` / `AwContents` / `WebViewChromium` / `CapacitorWebView`；四种图形模式未修复。React 页面未出现，不能判定 APK 页面/导航通过。QEMU 关闭期间 SIGSEGV，coredumpctl 本轮列出 5 条；未复制 core。未改系统内核、全局 Java、GPU/Hyprland 配置。
- 证据目录：截图 `<AI_ARTIFACT_ROOT>/图片与设计/理论考试练习系统/P5-A-本机Android验收-20261020/`；模拟器日志及交付报告 `<AI_ARTIFACT_ROOT>/报告与研究/理论考试练习系统/P5-A-本机Android验收-20261020/`。交付报告明确区分已安装、未渲染和原生功能未测。
- 回归：mobile typecheck/build/UI smoke 14/14；server typecheck/build/tests 59/59；Chromium Web browser suite 通过。正式 SQLite V4、四个用户、旧端口服务和隧道均未修改。当前无连接设备，模拟器已停止。
- 下一步仍在 P5-A：使用可用 VT-x/KVM 的主机或 Android 真机重试，优先定位系统 WebView/软件仿真崩溃；之后再验收扫码、安全存储、断网恢复、练习/考试恢复、更新器。不得以 Chromium/CI 代替本机 Android 验收，不进入 P5-B。

## P5-A WebView SIGTRAP 诊断跟进（2026-10-20；历史记录，后续 KVM/API35 复测见文末）
- 只读硬件检查：Intel i5-11400F；`lscpu` 无 Virtualization/Hypervisor 字段，`/proc/cpuinfo` 无 `vmx`，`/dev/kvm` 不存在；`lsmod` 无 KVM 模块，但当前内核 `kvm.ko`、`kvm-intel.ko` 存在。`modprobe -n` 仅 dry-run，未加载模块。无法仅凭只读 Linux 结果判定 BIOS 关闭 VT-x 或上层虚拟化未透传；不是权限问题。未改 BIOS/内核/启动配置/桌面，未重启。
- 默认启动 Android 16/API 36 x86_64 AVD 报需要硬件加速。官方 TCG 模式 `ANDROID_I_WANT_MY_TCG=yes`, `-accel off` 可创建 QEMU，但约 8 分钟仍未完成系统启动（`sys.boot_completed` 空、黑屏、WebView provider 当前为 null）。Chrome/系统浏览器 HTTPS Intent 未能启动。故不能用这个 AVD 区分项目 APK、Capacitor 与系统 WebView。
- 本轮 ADB logcat 从 ADB 设备可用后、浏览器/Activity 尝试前开始采集并本机保存；不覆盖设备 offline 期间的最早引导日志，未上传 GitHub。bugreport 来宾端完成但 ADB 在模拟器离线时无法复制到主机。QEMU 于 10:57:28 CST `SIGSEGV/SEGV_MAPERR` 退出；本轮未启动项目 APK，QEMU 崩溃与项目 WebView trap 并非同一事件。QEMU core 未导出。
- 文档更新后回归：`apps/mobile` typecheck/build 通过、UI smoke 14/14；`apps/server` typecheck/build、59/59 测试和 Chromium browser smoke 通过。仅修改文档和记忆，未改源码。
- 当时尚未执行 API 35/34、独立最小 Android WebView/Capacitor 对照；该阶段的 VT-x 阻塞后来解除，当前 Android 结果以文末 2026-10-20 KVM/API35 复测记录为准。

## P5-A KVM/API 35 Android 验收跟进（2026-10-20/21 CST；仍未完整验收）
- 当前宿主可见 `vmx`，`/dev/kvm`、`kvm_intel`、`kvm` 可用；Emulator 37.2.12.0 的 `-accel-check` 返回 KVM version 12 usable。未在本轮修改 BIOS/内核/启动参数或重启。
- AVD `TheoryExam_API35` 是 Android 15/API 35 Google APIs x86_64，2 CPU/2 GiB/720×1600/GPU auto；`TheoryExam_API35_Play` 是 Google Play API 35 同规格（1080×1920），为 Google Code Scanner Play 模块而保留。系统启动完成，WebView provider 为 124.0.6367.219。项目 APK React/Capacitor 页面正常显示；干净 logcat 4,996 行无 FATAL EXCEPTION、SIGTRAP、Fatal signal、项目进程崩溃或 WebView provider 错误。
- 修复 `MobilePages.tsx` 的相机拒绝反馈：请求被拒绝时展开手动连接表单并显示权限提示。Android 权限弹窗实际点击拒绝后页面与进程保持正常；相机权限状态为 denied。Google Play AVD 已打开 Google Barcode Scanner 原生界面，但没有相机图像源，二维码解码未验证。
- 重建 Debug APK：`com.theoryexam.mobile.dev` 1.0.0-dev.1/versionCode 1，minSdk 24、targetSdk 36、x86_64 ABI，Debug 证书 SHA-256 `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`。APK SHA-256 `8bbcc26478e2e1e99ccdc60412318766dc22eecbf9c8b8b9c2978f9dc7a2bc59`。隔离联调专用 debug CA 仍在该测试包内，不能发布；保存副本于 AI 输出 `其他/理论考试练习系统/P5-A-Android-验收-20261020-03/`。
- 本阶段先前实测含隔离 Fastify/SQLite+本机 Excel 1,283 题：登录、首次改密、安全存储恢复/退出、刷题/收藏/错题复习、考试恢复/答案同步/断网恢复/提交、更新下载 SHA 校验与 Android 系统安装器、同签名升级数据保留和考试中阻止更新。当前测试 SQLite 只读统计：1,283 题、2 个测试用户、2 个考试场次、2 个复习轮次；没有打印身份或凭据。服务已停止并清理临时 DB/TLS key/账号凭据。
- 回归：mobile build/typecheck 通过、UI smoke 14 项；server typecheck/build/59 项；production Web browser smoke 4 项。正式 `db:status` 仍 V4→V6 pending；3000/3001/8080 无 listener，生产/frp units inactive。MeFrp、正式 DB、证书与端口未改。未找到历史 QEMU core 文件；没有清理共享 journal。
- 建立用户级启动/停止 desktop entries 与 APK 打开处理脚本，源文件在 AI 输出 `编程脚本/其他脚本/理论考试练习系统/P5-A-Android-Emulator-20261020-03/`，menu links 在 `~/.local/share/applications/`。已实际启动/等待 boot_completed/停止 AVD；停止仅按 AVD 名称匹配，另有 APK package allowlist 和安装降级防护。
- P5-A 仍未完成：必须有真实相机图像输入才能验 QR 解码；模拟器测试不替代 Android 真机。本轮保留未提交修改并暂停 Git Commit/Push，功能分支与远端维持 `122ad04ab59983c60b19b8edb588fd6a0883ff98`，P5-B 未开始。

## P5-A Android 12 屏视觉/交互子任务完成（2026-10-21 CST；里程碑仍进行中）
- 设计基准 `design/reference/mobile-12-screens-v1.png` 在现有 Android 15/API 35 KVM Emulator 上逐屏复核。Android framebuffer 390×844 与 360×800 两尺寸均采集 12 屏，共 24 张；布局未发生水平溢出。启动页与登录页结构、入口路径、输入控件及按钮经修正后符合设计层级；其余页面的卡片、答题状态、底部导航与安全区域均复核。测试触摸覆盖连接/登录路径、软键盘与返回键、答案选择、多选切换、长内容滚动、底部导航和前后台恢复。
- 视觉差异保留并显式记录：缺少原始 splash 高分辨率图导致背景裁切与参考不同；Android 系统栏与 iOS 外框不是同一平台；少量字号/卡片间距仍有小差异。没有把 Android 平台差异包装成完全 1:1。
- 验收包是独立 `com.theoryexam.mobile.dev.visual` preview-fixture Debug APK，SHA-256 `b058200ca26ab7e7b4fafee130304c73f83f84111fdcfb36c56e7b65dd428a6f`。它用于 visual QA，不含测试 CA 资源，manifest 捕获的网络 API 请求为 0；原 `.dev` 及 dev.2 均未覆盖。此前 dev.2 与 ScanLab 的实时 CameraX/ML Kit 扫码结果另见 Virtual Scene 验收报告。
- 当前 `apps/mobile` typecheck/production build 通过，UI smoke 18/18、Capacitor production sync、JDK21 环境下 Gradle `assembleDebug` 成功。普通构建产物被工作区已有 `apps/mobile/android/app/src/debug/` CA 配置影响，已标为本地 debug-only，未安装/发布。最终过滤 Logcat 无 app 崩溃、SIGTRAP/SIGSEGV/ANR。
- 视觉子任务通过不等于整个 P5-A 完成：本轮夹具包没有连接隔离 Fastify/SQLite；本轮未重跑 production identity 的全套安全/更新集成，未验收物理手机。正式库、账号、MeFrp、TLS 和 systemd 未改，P5-B 未开始。验收报告在 AI 输出 `报告与研究/理论考试练习系统/P5-A-Android视觉终验-20261021-12/`；对照图及 24 张 Android 截图在对应 `图片与设计/` 目录。
- 由于开始时工作区存在多项未提交更改，遵循 AGENTS.md 第 11 条保留不提交/推送；本地/远端分支仍 `122ad04ab59983c60b19b8edb588fd6a0883ff98`。本轮 `git diff --check` 通过，Issue #7 未改动。

## P5-A 最终开发包集成门槛（2026-10-21 CST；未完成）
- 从当前源码构建普通 `com.theoryexam.mobile.dev` dev.3（versionCode 3）。APK SHA-256 `c4cdc000f4b928f6485d1dba5ed09f8e7f7dde634fc1c6c6a91c603bc2f0e44a`，Debug 证书 SHA-256 `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`。普通包只用系统证书，打包内容不含测试 CA / network security config，Manifest `usesCleartextTraffic=false`；CA 配置隔离在用户目录的 `p5aTest` build type，包名追加 `.p5atest`。
- dev.3 已装入独立 Android 15/API 35/KVM AVD，实际启动启动页、连接页和登录页；设备内 APK 与构建 APK SHA 一致。WebView `124.0.6367.219`、Capacitor `BridgeActivity` 初始化；启动 Logcat 无应用崩溃、SIGTRAP、SIGSEGV 或 ANR。首次安装没有旧登录状态。`previewMode` 受 `import.meta.env.DEV` 门控，生产 APK 资源扫描未发现已知预览夹具标记。
- 本轮 `.p5atest` 变体的隔离业务回归不能代替普通 `.dev` dev.3 的业务身份全回归；dev.3 未连接测试 CA 后端。Camera2 枚举后置 ID 10，但 Virtual Scene 画面未呈现测试二维码，因此 dev.3 实时扫码和回填未验证。`.visual` 变体已通过的 12 屏截图不等于 dev.3 12 屏复验；dev.3 更新流程未完成，私有 Release 更新属于 P6。
- 回归记录：mobile typecheck/build/UI smoke 18 项、server typecheck/build/tests 59 项、browser smoke、Capacitor sync、普通 APK `assembleDebug`、隔离变体 `assembleP5aTest`、`git diff --check` 均通过。完整脱敏报告位于 AI 输出目录 `报告与研究/理论考试练习系统/P5-A-最终开发包集成-20261021-01/`；截图位于同名 `图片与设计/` 目录，原始日志本机保留且未上传。
- 当前分支仍有 15 项修改与 5 个未跟踪项；fetch 后本地与远端 SHA 同为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`。依 AGENTS.md 第 11 条，因阶段尚未通过且工作区含既存改动，暂停 Commit/Push。已在 Issue #7 添加不含原始日志的集成进展评论（2026-10-21）；Issue 保持 OPEN。P5-A 未完成、P5-B 未开始。

## P5-A 最终统一基线更新（2026-10-22 CST；dev.7，阶段未完成）
- 统一普通 APK 基线采用 `com.theoryexam.mobile.dev` dev.7/versionCode 7，SHA-256 `7e084f5043571bfb9c4c57d56740a5fb4f3834167ca7c40373cee53bdbded08b`，Debug signer SHA-256 `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`。归档件与 Android Play AVD 拉取的已安装 `base.apk` 哈希相同。普通包不含测试 CA/网络安全配置，`usesCleartextTraffic=false`。
- dev.7 Android 业务证据整合了登录/SecureStorage、正常练习、收藏及 A/B 隔离、错题跨轮次掌握、服务端 180 题考试、强停恢复和会话失效/网络恢复。更新端点认证、元数据和 APK SHA 校验/篡改拒绝由服务端现有自动化覆盖；正式私有 Release 安装升级属于 P6。
- 12 屏证据不能宣称全矩阵通过：360×800 有 12 个真实 Android 页面的截图对应；启动页应取 `181a-dev7-play-start-360x800.png`，旧 `173-dev7-start-360x800.png` 是个人中心。390×844 缺少错题页截图。背景裁切与系统栏视觉差异继续记录。
- 最终 Virtual Scene 实验确认 Camera2 ID10 活动和系统相机预览可用；ADB Console 接受墙面二维码图，JWT 限定的两个 `protected` gRPC 方法可控制相机，但有限旋转/位移覆盖的客厅、厨房、走廊画面没有完整二维码。未启动正式扫码插件，扫码、原生事件、Bridge 与地址回填因此未验证；没有证据指向项目解码代码缺陷。扫码场景截图位于 AI 输出配套图片目录 `.../dev7-qr-retest/`。
- 回归重跑：mobile typecheck/build、UI smoke 20/20、session 6/6；server typecheck/build/tests 59/59；真实浏览器主流程和 Web 入口 smoke；`git diff --check` 均通过。仅修正 `apps/server/scripts/browser-flow-smoke.mjs` 两个过期期望值（8→7），不影响 APK。临时服务、CA 私钥、凭据/SQLite与`/tmp`原始日志清理；两台专用 AVD 关闭且数据保留；gRPC SDK allowlist 已按原 SHA 恢复。正式 SQLite V4、生产 TLS、MeFrp、systemd 未动。
- P5-A 尚未完成；当前远端和本地功能分支仍为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`。未提交/推送（仍有交织的 P5-A 工作区修改且扫码与视觉矩阵未闭合）；Issue #7 保持 OPEN，P5-B 未开始。

## P5-B Web 全站修复子阶段（2026-10-23 CST）
- 当前阶段状态已纠正：P5-B 已获授权并完成真实部署，正式 V6 题库和 Android dev.10 业务验收已有独立记录；不能沿用早期“尚未开始”的历史状态。P5-B 总阶段目前仍进行中，P6 未开始。
- 本轮修复浏览器连接页与同源 API 验证、桌面错题答题控件/平板断点、Gateway 原始 Host 传递及 API Origin/Cookie 主机端口绑定。API/Web/LAN 三服务重启后 active；公网 API 和 Web HTTPS health 均 200，TLS verify=0。
- 公网 strict-CA Chromium 在 16 个 SPA 路由与 6 个视口完成 96 次加载，页面非空、无横向溢出、无未捕获 JS 或意外 HTTP 错误；`/admin` 和 `/api/admin/status` 为 404。production HTTPS Gateway + 隔离真实题库 Chromium 流程通过首登改密、登录、练习、收藏增删/专项练习、错题两轮掌握、考试同步/恢复/提交，以及 A/B 切换后收藏/进度隔离；不在正式普通账号生成 Web 验收记录。
- 最终回归：Mobile build；Mobile UI smoke 20 项；session 6/6；Server typecheck/build/test 62/62；公网 deployed browser smoke；production Gateway full browser flow；`git diff --check`。公网和完整业务截图、旧/部署构建快照保存在 AI 输出 `报告与研究/理论考试练习系统/P5-B-Web验收-20261023/`。
- 后续只处理安全审查、精确 Git 提交/push 和本次授权的 dev.10 私有测试预发布上传；不关闭 Issue #7，不进入 P6。
