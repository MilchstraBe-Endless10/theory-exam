# 短期记忆（每次 Codex 会话更新）

> 交接快照；不得记录真实密码、密码哈希或凭据文件内容。

- 日期：2026-10-19。
- 阶段：P5-A 代码与隔离验收进行中；Android APK/真机验收受本机工具链缺失阻塞。不得标记 P5-A 完成，不进入 P5-B。
- Git 起始基线：`b6cdb05b6b737218b0b82d9fa8f1fd7a94230c6c`，开始时 `main` 与 `origin/main` 同步、工作区干净。P5-A 实现提交 `be07b283359fea856ef2ff877a5c95da210839db`、Android 测试包名修正 `40abf0beb37d3b3a2b6abec27630972a9f455f1a`、APK FileProvider 缓存目录收窄 `b9e404279c9aa74787e58a8939e9b5c1cbcacda6`，均已普通推送到 `feat/p5-a-android-security` 并核对远端 SHA；`main` 未改变。中短期记忆另以 docs commit 同步。
- 已实现：学习/管理员 Fastify listener 隔离与环回转发负面测试；Web HttpOnly/SameSite Strict Cookie、CSRF/Origin、生产 Secure；Capacitor secure storage、网络/恢复/二维码/状态栏/返回钩子；V6 remember 策略与 `POST /api/auth/renew`；私有 Release 固定 APK/manifest 缓存、SHA-256 检查与认证下载；SQLite 在线一致性备份/验证/恢复；systemd service/timer 模板。未安装服务，未改证书、frp、正式数据库。
- V6 迁移仍只在代码和隔离数据库中：增加 CSRF 与 remember 策略并回填旧期限；正式数据库 `db:status` 只读显示 V4→V6 pending，未执行迁移。当前 Fastify 3000 健康检查仍是 V4；3001 无 listener。没有管理员初始化、正式题库或密码操作。
- 实际验证：`apps/server`、`apps/mobile` typecheck/build 通过；服务端 **56/56** 测试、移动端 UI smoke **14/14** 通过；两个 npm audit 均 0 vulnerabilities；`systemd-analyze verify deploy/systemd/*.service deploy/systemd/*.timer` 通过。Android Java 测试的 package/applicationId 静态一致性检查通过。最终 Chromium P1–P5 全流程通过，隔离 SQLite 导入本机 Excel 1,283 题（单选 845、多选 38、判断 400），覆盖管理员导入、首登改密、会话续期、练习/错题/考试、断网重试、恢复与 Preview 隔离。
- 截图：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/P5-A/final-5/`，含 390×844、360×800、1536×1024 实际 Chromium 页面。
- Android：Omarchy 4.0.4、Node 26.8.2、npm 11.19.1；无 Java/JDK、Android SDK、Gradle、Android Studio、adb/模拟器；无 `/dev/kvm` 与 qemu 模拟器。`npm run android:debug` 的 web build 和 Capacitor sync 成功，Gradle 因 `JAVA_HOME`/`java` 缺失未启动；无 APK、设备安装证据。生成的模板测试已改为 `com.theoryexam.mobile.dev`，APK FileProvider 仅共享应用缓存 `updates/` 子目录；仍待有 Android 工具链和设备的主机运行。
- 服务/网络只读检查：`theory-exam.service`、`frpc.service`、`frps.service` inactive；未发现 frpc/frps 进程。没有读取任何 frp 配置或密钥。
- 已更新 API、架构、决策、路线图、运维文档及中期/短期记忆；长期需求未变，未改 `LONG_TERM.md`。仓库仍 Private，Issue #3/#7 未关闭。
- 下一步：在有 JDK 与 Android SDK/设备的开发机完成 `npm --prefix apps/mobile run android:debug`、安装及原生恢复/扫码/更新器验证；之后再完成 P5-A。P5-B 的正式 systemd、V4→V6 迁移、可信 HTTPS 与 frp 入口必须先提交变更/回滚方案并等待用户确认。

## P5-A 双 MeFrp 入口补充（2026-10-19；未完成整个 P5-A）
- 本轮在 `feat/p5-a-android-security` 起始 SHA `a791adc6fcdcf519e160098f07a42686cfc606e0` 上开发。新增生产 Web Gateway（`apps/server/src/web-gateway.ts`、`web-server.ts`）和隔离 Chromium 验收脚本。浏览器生产构建使用同源 API；手机继续直连配置的 API listener。生产 `web:start` 缺可信 TLS cert/key 会拒绝启动。
- 8080 默认 loopback，读取 `apps/mobile/dist`，SPA 刷新、hashed asset immutable cache、index no-cache、未知文件/API 404、CSP/安全头；`/api/*` 只代理 health/auth/banks/practice/favorites/progress/exams/mistakes/reviews/updates 白名单。admin/bootstrap、未知 API、编码路径、隐藏文件和非法方法先于代理拦截；forwarded client-IP headers 不转发；API 禁缓存。
- `apps/server` typecheck/build + 59/59 测试通过；`apps/mobile` typecheck/build + UI smoke 14/14 通过。`npm run test:web:browser` 通过：production dist、隔离 SQLite 与 Chromium，覆盖同源登录、HttpOnly cookie（JS 不可见）、没有持久 Bearer token、错误/有效 CSRF、管理 API 404、`/practice` 刷新、390×844/1536×1024 无横向溢出。浏览器 session 与 Android bearer session 通过服务端隔离测试落到同一用户/DB。截图在 `/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/P5-A-Web入口浏览器验收-20261019/`。
- 直接 CLI 启动验证：`NODE_ENV=test WEB_HOST=127.0.0.1 WEB_PORT=8080 WEB_API_TARGET=http://127.0.0.1:3000 npm run web:dev`；`/` 和 `/practice` 200/no-cache，`/api/admin/status` 404；测试进程已停止。`NODE_ENV=production npm run web:dev` 缺 TLS cert/key 按预期拒绝启动。
- 双入口管理隔离实测：业务 Fastify listener 与 Web Gateway 对 `/admin`、`/api/admin/*`、bootstrap、大小写/编码/重复分隔变体均 404；测试危险上游未收到管理请求。浏览器 Cookie/CSRF/Origin 检查通过；P3 考试答案 `expectedVersion`/`requestId` 逻辑未改，回归由既有考试测试覆盖。
- TLS 研究及 ADR-025：普通浏览器不会继承 Android Network Security Configuration 中的私有信任锚；不可忽略证书错误。当前无自有域名，免费可控 DNS 子域名 + DNS-01 公信证书 + MeFrp TCP TLS 透传是候选但未选择/验证服务商；Let’s Encrypt IP cert 约 160 小时，且需 IP 控制与标准 80/443 ACME 验证。当前 API 3000 仍旧 P4/V4 HTTP，隧道保持离线。
- 未操作正式 SQLite（仍 V4、4 普通用户）、管理员、题库或密码；没有启隧道、改 systemd/公网/证书；8080 fixture 停止，3000 旧进程未动。已更新 API/架构/ADR-024/025/路线图/中期记忆；未改长期规则。提交与远端 SHA 待本轮结束记录。
- 后续阻塞不变：JDK/Android SDK/adb/设备缺失，APK/真机仍未验收。P5-B 需要具体 TLS/DNS、正式服务切换、V4→V6 迁移和隧道更改/回滚计划并另行确认。
- P5-A 双入口实现提交：`fb00f720a5d9a02927c834579f0b797570d5c159`（<https://github.com/MilchstraBe-Endless10/theory-exam/commit/fb00f720a5d9a02927c834579f0b797570d5c159>）。即将创建记忆同步提交并普通推送至当前功能分支；`main` 保持不变。
