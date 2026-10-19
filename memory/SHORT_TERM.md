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
