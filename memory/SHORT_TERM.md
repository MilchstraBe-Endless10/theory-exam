# 短期记忆（每次 Codex 会话更新）

> 交接快照；不得记录真实密码、密码哈希或凭据文件内容。

## P5-B 最终运维收尾（2026-10-23 CST；阶段仍有具体阻塞）
- 基线：`feat/p5-a-android-security`，提交 `aa7cfef4f40b335d2e69c5dec54e350743159215`；fetch 后远端一致。dev.10 与 Web 全站验收不重跑。
- 部署代码核验：API/Web 三项 user service active/enabled，Restart=on-failure 3s、NRestarts=0、Linger=yes。隔离 `tsc` build 输出的 27 个 JavaScript 文件与当前 `apps/server/dist` 完全一致；当前 Web Gateway 源码含 Host 保留修复，公共 Web 同源 OPTIONS 204、跨端口 Origin 403，确认当前运行行为符合修复。只复用此前 Web 业务与 96 视口验收。
- 备份补齐：新增 `apps/server/scripts/p5b-maintenance.mjs` 与 `deploy/systemd/user/theory-exam-p5b-maintenance.{service,timer}`；用户级 timer 已 enable/active，每日运行 SQLite `VACUUM INTO` 一致性备份、跨到独立物理盘 ext4 LVM，并校验完整性/外键/V6 状态和 TLS 链/IP SAN/到期时间。独立配置 `~/.config/theory-exam/p5b-deploy-20261022/maintenance.env` 0600，仅含路径与端口参数。最新归档 `daily-2026-10-23T04-36-47-973Z-fcbd1479.sqlite`，1,232,896 bytes、0600；隔离恢复后 integrity ok、FK=0、V6 ready、题目1283、启用题库1。
- 证书：API/Web leaf 到 2027-11-23，API/Web CA 到 2036-10-19；私钥目录 0700、私钥文件 0600。APK 的公开 API CA 资源与外置 `api-ca.pem` SHA 相同且 `.pem` 被 Git 忽略；Gradle 支持 `THEORY_API_CA_FILE` 注入。未修改 Android/APK/签名，未重建 dev.10。
- 定向验证：严格 CA 下公网 API `30946`、Web `10393`、本机 loopback/LAN health 均 200、V6；公网 API 管理路径、Web `/admin`、Web `/api/admin/status` 均 404；API port HTTP 明文请求被拒。Cookie/Origin 测试 2/2：Web同源204，跨端口403。`node --check`、`systemd-analyze verify`、隔离 Server build、`git diff --check` 通过。
- 未完成阻塞：eno1=`192.168.0.107/24`，NetworkManager `ipv4.method=auto`，没有路由器静态租约证据；nftables active，静态 INPUT policy drop，仅 loopback/established/ICMP/SSH规则，无 LAN 3000/8080 allow；当前用户不能读取有效 ruleset，也没有 root 写权限。因此 LAN peer 访问未验收，不能靠本机 loopback/自连当作通过。两条 MeFrp 进程仍通过 `-t` argv 含 token；当前连接正常，但未验证无中断迁移到 `-c` 配置文件，故未重启/轮换。MeFrp 节点出站当前经 `tun0/table 2022`，端点健康但此路由预期未核实；本机未找到可读 localIP/localPort 配置。P5-B 维持未完成，P6 正式包签名/Release/完整更新链不计入阻塞。
- 防火墙配置、DHCP 保留、MeFrp token 值均未写入报告/Git；`apps/mobile/android/.visual-test.init.gradle`、`splash-mountain-road-v3.png`、`splash-mountain-road-v5.png` 三个既存用户未跟踪文件保持原样且不提交。详细报告存于 AI 输出 `报告与研究/理论考试练习系统/P5-B-最终收尾-运维核验-20261023-01/`。

## P5-B Web 全站修复与公网复验（2026-10-23 CST）
- Web 修复已构建并部署；`theory-exam-p5b-api.service`、`theory-exam-p5b-web-public.service`、`theory-exam-p5b-web-lan.service` 重启后均 active。API/Web 健康 HTTPS 均 HTTP 200、证书校验结果 0；未修改 DB、证书、MeFrp 或服务配置。
- 修复浏览器 `/connect` 的同源服务验证路径、桌面错题复习选项/按钮样式与 1100px 响应断点；收紧同 IP 不同端口 Cookie 使用与 Origin/Host 匹配，Gateway 保留浏览器 Host、继续清除客户端伪造的 Forwarded/X-Forwarded/X-Real-IP。
- 严格 Web CA Chromium 公网测试通过：16 路由 × 6 视口（1920×1080、1536×1024、1280×800、768×1024、390×844、360×800），无白屏、横向溢出、未捕获 JS 异常或意外 HTTP 错误；health=200，未认证=401，管理 API/页面=404。公网未写正式用户学习数据。
- 隔离 SQLite + 原始 Excel 1,283 题 + production Web Gateway/严格 Web CA 的真实业务浏览器流程通过首登改密、会话续期、练习判分/退出恢复、收藏增删与收藏专项练习、错题两轮掌握/历史、考试同步/恢复/交卷/评分/历史、A/B 切换与数据隔离；考试提交前答案隐藏。服务端 62/62，移动 UI smoke 20 项、会话回归 6/6，Mobile build，Server typecheck/build 均通过。
- 实际发现并修正 smoke 本身两处问题：初次在 about:blank 请求相对 URL；无效 history ID 触发预期 400。脚本现先访问公网首页，并使用 UUID 格式受保护资源检查，公网复测完整通过。
- 最终复跑：mobile build/typecheck 通过，UI smoke 20 项、会话回归 6/6；server typecheck/build、62/62 tests、P1–P5 真实业务 Chromium、production Gateway 浏览器矩阵、严格 CA 公网 16 路由 × 6 视口全部通过。API/Web 私有 CA 健康检查均 HTTP 200，三项 user services active/enabled，Linger=yes。
- Gateway 浏览器 smoke 第一次因默认端口 8080 正被本机生产服务占用而未启动；测试脚本已改用临时可用端口并重跑通过。该失败是测试 fixture 端口冲突，不是生产 Web 故障。
- README、PROJECT_GUIDE、CHANGELOG 与 P5-B 路线图已写明整体架构、形成阶段、每个可核实 dev.1–dev.10 变化/缺档、本轮实际 Web 缺陷和修复；两张 1536×1024 概念插画已加入 `docs/assets/`，明确标为 AI 插画而非应用截图。Web专项验收截图仍保存在 AI 输出 `图片与设计/理论考试练习系统/P5-B-Web端全面验收-20261023/`。
- dev.10 APK 重新核验 SHA-256 `5d0089f664c63d52ade066679b38320c12b418de54613c716dd19a443e78ebb2`，aapt 确认 package/versionCode/versionName；包标记为 debuggable 和 Debug 测试签名，未重建或改版。API 明文流量关闭、APK 包含当前 API CA 资源；没有 CA/叶证书私钥进入 Git。当前工作区只精确提交代码、测试、项目文档与两张文档插画；本机 `.visual-test.init.gradle`、未引用 splash v3/v5、APK、CA、数据库和日志排除。
- 本轮 Web 修复、测试和项目文档以提交 `8ea74f3712e9a7531b047144507a93dfc9bfa2cc` 普通推送到 `feat/p5-a-android-security`；GitHub 分支 SHA 与本地一致。README/PROJECT_GUIDE/CHANGELOG 及两张插画随该提交进入私有仓库，GitHub 项目简介也已更新。dev.10 以 `v1.0.0-dev.10-test` 发布为私有预发布，APK 与 `.sha256` 两个资产均已上传，并从 GitHub 下载复核摘要一致；这不是 P6 正式 Release。P5-B 其余收尾仍未整体标记完成，P6 未开始。
- 公网截图位于 AI 输出 `报告与研究/理论考试练习系统/P5-B-Web验收-20261023/screenshots/public-post-deploy-final/`；完整 A/B 与真实业务截图位于 `screenshots/isolated-business-gateway-final-rerun5/`，修复后错题页和其他尺寸截图位于同目录各子目录。回滚快照位于 `deployment-snapshot/pre-web-fix-20261023/`。README、CHANGELOG、PROJECT_GUIDE、ROADMAP 已据实更新；P5-B 总阶段保持进行中。
- P5-B 其余阶段事项仍未整体验收；Web 专项、本轮 GitHub 项目说明与 dev.10 测试预发布已完成。P6 正式发行、正式签名及完整更新链仍未开始。

## P5-B 真实账号与练习验收进展（2026-10-23 CST；Android 业务验收完成）
- P5-B 三项 user systemd 服务 `theory-exam-p5b-api.service`、`theory-exam-p5b-web-lan.service`、`theory-exam-p5b-web-public.service` 均 active/enabled，`Restart=on-failure`（3 秒），Linger=yes。API/Web 公网与 LAN HTTPS health 均通过对应私有 CA 和 IP SAN 验证；Web `/admin`、`/api/admin/status` 404；管理 listener 仅绑定 `127.0.0.1:3001`。
- 正式 DB V6，`integrity_check=ok`。管理员已由 `apps/server` 的 `admin:init` 初始化；数据库有 1 个管理员、4 个普通账号。管理员账号不用于 Android 学习登录；Android 使用的是普通专用测试账号。
- 原始 `local-input/四级理论试题.xlsx` SHA-256 `20d1b4d98485c048f65c3e6f2602eed4440950bf8f4fc857a47c4ce85c3a9a19`。本机管理 API 导入并启用 1,283 题（845 单选、38 多选、400 判断），缺答/格式错误 0，64 组重复题干保留；考试规则 120×0.5 + 20×1 + 40×0.5，90 分钟、100 分、及格线 60。导入前一致性备份 SHA `071a47462fbcbdb48890d98537c5de29f1f6384fbb7c3d813102809626cd6db5`，复核未变。
- APK dev.10/versionCode 10 SHA `5d0089f664c63d52ade066679b38320c12b418de54613c716dd19a443e78ebb2`，Debug 签名 SHA `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`。AVD `TheoryExam_P5B_Deploy_API35`（Android 15/API 35），设备 APK 哈希与交付 APK 一致。Manifest `usesCleartextTraffic=false`。
- 用户直接在 Android APP 内使用受限凭据文件中标记的专用普通测试账号登录并完成首次改密；秘密值、用户名和 Token 均未读取或记录。APP 实际提交 2 道判断题，服务端反馈 2/2 正确。只读数据库聚合：该测试账号 2 次作答/2 次正确、1 道收藏；顺序练习 2/20 与收藏练习 1/1 最终均正常暂退，`integrity_check=ok`。
- 收藏专项练习真实读取服务端 1/1 题。Android force-stop 后以 Remember Me 恢复已认证首页，继续入口可恢复收藏专项练习第 1/1 题。最终首页显示接触 2 题、正确率 100%、题库进度 2/1,283。
- 测试后 API/Web 公网 HTTPS health 均 HTTP 200、TLS_VERIFY=0、migrationVersion=6；三个服务仍 active，Linger=yes。脱敏 Logcat 未发现 APP Fatal、ANR、SIGSEGV 或 SIGTRAP。冷启动首几秒有白色加载画面，随后正常渲染，没有崩溃。
- 实际验收报告：AI 输出 `报告与研究/理论考试练习系统/P5-B-真实账号与练习验收-20261023-01/实际运行进展与待输入项.md`。新截图位于 `图片与设计/理论考试练习系统/P5-B-真实账号练习验收-20261023/`，包括作答反馈与 force-stop 后恢复的收藏练习。
- 本轮未改应用源码、APK、生产服务配置或数据库结构；仅产生已脱敏截图及更新报告/SHORT_TERM。此前工作区已有 P5-B 代码修改和本机未跟踪文件，本轮未暂存/提交/推送；需另行审阅变更归属后再决定阶段提交。P5-B 当前完成 Android 登录与练习专项；正式桌面浏览器 CA 信任/登录验收与 P6 正式签名/发布仍未在本轮执行。
- 日期：2026-10-22。
- 阶段：P5-A 已按本地 ROADMAP 完成验收。普通 dev.9 (`com.theoryexam.mobile.dev`, versionCode 9) SHA-256 为 `3db11faf2ffd96118f79f5582b7a82fa6ba739c259b9cde96081f7a6d8e73ad5`；正式 Android `startScan()` 的真实 ML Kit 帧、有效/无效地址、Bridge 回填、取消/返回及 Camera2 释放通过。ScanLab 是辅助诊断，未识别到码不阻塞正式路径。
- 核心练习、收藏、错题、考试、会话安全与 12 屏视觉/交互复用未受 dev.9 扫码修改影响的普通 dev.7 验收；390×844 错题页使用 dev.7 普通 APK及真实隔离 API，在专用 Google APIs AVD 留证。dev.9 已安装 APK的历史设备哈希与本轮重建 APK、归档 APK一致。
- Git：代码/运维/ROADMAP 阶段提交 `84fa7d6b796a74433728ef3f8ac98644c096a970` 已普通推送，`HEAD`、`origin/feat/p5-a-android-security` 与 `git ls-remote` 一致。记忆文件本轮同步提交随后补记；排除本机 `.visual-test.init.gradle` 与未引用 splash v3/v5，未删除这些本机文件。Issue #7 保持 OPEN，不关闭整个 P5。
- 本轮实际通过：mobile typecheck/build、UI smoke 20 项、session regression 6/6；server typecheck/build、59/59 tests；P1–P5 browser flow、Web Gateway browser smoke；Capacitor Android sync、Gradle `assembleDebug`、APK 身份/签名/内容检查、`systemd-analyze verify`、`git diff --check`。构建 APK 与 dev.9 归档 SHA 完全一致。
- 安全边界：正式 SQLite 仍为 V4；没有触碰正式账号、MeFrp、生产 TLS、systemd 服务或公网端口。P5-B 真实部署需单独授权；P6 正式 Release 与完整私有升级链另行验收。最终报告位于 AI 输出目录 `报告与研究/理论考试练习系统/P5-A-最终验收-20261022-01/`。
- 下一项单一任务：在取得独立授权后准备 P5-B 的部署变更清单和回滚方案；本记忆更新不启动 P5-B。

## P5-A 双 MeFrp 入口补充（2026-10-19；历史记录）
- 本轮在 `feat/p5-a-android-security` 起始 SHA `a791adc6fcdcf519e160098f07a42686cfc606e0` 上开发。新增生产 Web Gateway（`apps/server/src/web-gateway.ts`、`web-server.ts`）和隔离 Chromium 验收脚本。浏览器生产构建使用同源 API；手机继续直连配置的 API listener。生产 `web:start` 缺可信 TLS cert/key 会拒绝启动。
- 8080 默认 loopback，读取 `apps/mobile/dist`，SPA 刷新、hashed asset immutable cache、index no-cache、未知文件/API 404、CSP/安全头；`/api/*` 只代理 health/auth/banks/practice/favorites/progress/exams/mistakes/reviews/updates 白名单。admin/bootstrap、未知 API、编码路径、隐藏文件和非法方法先于代理拦截；forwarded client-IP headers 不转发；API 禁缓存。
- `apps/server` typecheck/build + 59/59 测试通过；`apps/mobile` typecheck/build + UI smoke 14/14 通过。`npm run test:web:browser` 通过：production dist、隔离 SQLite 与 Chromium，覆盖同源登录、HttpOnly cookie（JS 不可见）、没有持久 Bearer token、错误/有效 CSRF、管理 API 404、`/practice` 刷新、390×844/1536×1024 无横向溢出。浏览器 session 与 Android bearer session 通过服务端隔离测试落到同一用户/DB。截图在 `/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/P5-A-Web入口浏览器验收-20261019/`。
- 直接 CLI 启动验证：`NODE_ENV=test WEB_HOST=127.0.0.1 WEB_PORT=8080 WEB_API_TARGET=http://127.0.0.1:3000 npm run web:dev`；`/` 和 `/practice` 200/no-cache，`/api/admin/status` 404；测试进程已停止。`NODE_ENV=production npm run web:dev` 缺 TLS cert/key 按预期拒绝启动。
- 双入口管理隔离实测：业务 Fastify listener 与 Web Gateway 对 `/admin`、`/api/admin/*`、bootstrap、大小写/编码/重复分隔变体均 404；测试危险上游未收到管理请求。浏览器 Cookie/CSRF/Origin 检查通过；P3 考试答案 `expectedVersion`/`requestId` 逻辑未改，回归由既有考试测试覆盖。
- TLS 研究及 ADR-025：普通浏览器不会继承 Android Network Security Configuration 中的私有信任锚；不可忽略证书错误。当前无自有域名，免费可控 DNS 子域名 + DNS-01 公信证书 + MeFrp TCP TLS 透传是候选但未选择/验证服务商；Let’s Encrypt IP cert 约 160 小时，且需 IP 控制与标准 80/443 ACME 验证。当前 API 3000 仍旧 P4/V4 HTTP，隧道保持离线。
- 未操作正式 SQLite（仍 V4、4 普通用户）、管理员、题库或密码；没有启隧道、改 systemd/公网/证书；8080 fixture 停止，3000 旧进程未动。已更新 API/架构/ADR-024/025/路线图/中期记忆；未改长期规则。提交与远端 SHA 待本轮结束记录。
- P5-A Android 工具链补充（2026-10-19）：用户级 Temurin JDK 21.0.12.1、Google SDK Command-line Tools 23、SDK Platform 36、Build Tools 36.0.0/35.0.0、Platform Tools/adb 37.0.1 可用；环境脚本 `$HOME/.config/theory-exam/android-env.sh` 仅在 source 时生效，未使用 sudo 或改全局 Java。用户已在本对话明确确认阅读并接受 Google Android SDK License。
- `npm --prefix apps/mobile run android:debug` 成功，Gradle Wrapper 8.14.3 / AGP 8.13.0 完成 `assembleDebug`。APK：`com.theoryexam.mobile.dev`、versionName `1.0.0-dev.1` / versionCode 1、minSdk 24 / targetSdk 36、Android Debug 证书签名。SHA-256 `329e776eb46e298c17efce70c7424c9c050e9374b3379bdad41ea2664c785f9e`。隔离扫描未发现环境文件、数据库、keystore、GitHub Token 或私钥特征。APK/构建日志/校验文件在 `/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/其他/理论考试练习系统/P5-A-Android验收-20261019-01/`。
- Android 安装仍未验收：`adb devices -l` 无设备，USB 只有鼠标与键盘；没有 `/dev/kvm`，也没有安装 Android emulator。无真机/模拟器安装或启动证据；扫码权限、安全存储、原生会话恢复、网络切换、考试恢复和更新器系统安装流程仍待设备验证。无 KVM 不影响已完成的 APK 构建。
- 实际回归：mobile typecheck/build/UI smoke 14/14；server typecheck/build/test 59/59；`npm --prefix apps/server run test:web:browser` Chromium smoke 全通过；Gradle `--version` 为 8.14.3/JDK 21。旧 3000 服务健康检查仍为 V4，未重启；3001、5173、8080 无监听，正式数据库未改，两条 MeFrp 隧道仍离线。
- P5-A 整体未完成、未进入 P5-B。后续需要用户连接并授权 Android 手机，或提供可用模拟器，再安装本 APK 并做原生交互验收；完成前不得声称 P5-A 通过。P5-B 仍需另行批准 TLS、systemd、正式数据库迁移与 MeFrp 变更。
- P5-A 双入口实现提交：`fb00f720a5d9a02927c834579f0b797570d5c159`（<https://github.com/MilchstraBe-Endless10/theory-exam/commit/fb00f720a5d9a02927c834579f0b797570d5c159>）；首轮记忆同步提交 `6b2e4da7356f85b83283be18bc329818d9f7a845` 已普通推送，核验时本地 `HEAD`、远端功能分支与 `git ls-remote` 一致；`main` 保持在 `b6cdb05b6b737218b0b82d9fa8f1fd7a94230c6c`。


## P5-A 本机 Android 可视化验收（2026-10-20；未通过）
- 用户批准在 `$HOME` 下载 Emulator/API 36 x86_64 镜像并已确认 Android SDK License。选用本机 Google Android Emulator（Waydroid 未启动）；Android 16/API 36、Google APIs x86_64，Emulator 37.2.12.0。Omarchy 4.0.4、内核 `7.2.5-3-omarchy`、Wayland、Intel i5-11400F、AMD Radeon RX 550；无 `/dev/kvm`、CPU 未暴露 VT-x，使用 TCG 软件仿真。未更换内核、未修改桌面/驱动。
- 项目 Debug APK SHA-256 与用户给定值一致：`329e776eb46e298c17efce70c7424c9c050e9374b3379bdad41ea2664c785f9e`。包名 `com.theoryexam.mobile.dev`，版本 `1.0.0-dev.1` / versionCode 1，minSdk 24、targetSdk 36，debug 签名。`pm path` 曾确认安装；启动 `MainActivity` 后界面停在原生 splash，React/Capacitor 页面未出现，故不算启动验收通过。
- Android WebView 多次初始化触发 `SIGTRAP`；栈涉及 `libmonochrome_64.so`、`AwContents.<init>`、`WebViewChromium.init`、`CapacitorWebView.<init>`。尝试过 host GPU（被拒绝）、`swiftshader_indirect`、`software`/Lavapipe-ANGLE、`swiftshader`，均未解决。模拟器关闭阶段宿主 QEMU 发生 SIGSEGV；`coredumpctl` 本会话列出 5 条记录，未复制或上传 core。原始 Android logcat 未保存在交付目录，故报告仅记录捕获到的符号路径和模拟器日志；不把未经定位的原因归咎于应用代码。
- 真实截图：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/P5-A-本机Android验收-20261020/android-app-swiftshader.png`（显示启动画面）；同目录保存 Android/模拟器窗口及启动截图。模拟器已停止，目前 `adb devices -l` 无设备。
- Android 功能矩阵：模拟器图形系统启动、APK SHA/包身份核对、包管理器安装确认 = 通过；React 页面渲染 = 失败；导航/返回键/扫码与相机权限/SecureStorage/网络与 TLS/后台恢复/真实隔离 API 联调/考试恢复/APP 更新下载与系统安装器 = 未验证。没有连接 Android 真机。
- 回归结果（本轮实际命令）：移动端 `typecheck`、生产构建、UI smoke 14/14 通过；服务端 `typecheck`、构建、自动化测试 59/59 通过；`npm --prefix apps/server run test:web:browser` 通过。Browser 与隔离服务证据不等同 Android 原生验收。
- 正式数据库、四个账号、管理员/题库状态未触及；3000/3001/8080 无 listener；`theory-exam.service`、`frpc.service`、`frps.service` inactive；MeFrp 隧道、systemd、证书和公网配置均未操作。
- 交付报告：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/报告与研究/理论考试练习系统/P5-A-本机Android验收-20261020/P5-A-本机Android验收报告-20261020.md`。P5-A 未通过；后续需要在具备 VT-x/KVM 的本机或真机解决/复验 WebView，不进入 P5-B。

## P5-A WebView SIGTRAP 根因诊断（2026-10-20；阻塞）
- 检查：i5-11400F 支持 VT-x，但本次 `lscpu` 无 Virtualization/Hypervisor 字段、`vmx` 缺失、`/dev/kvm` 不存在，KVM 模块未加载；内核模块文件可用，dry-run `modprobe -n` 未改变系统。Emulator 检查报 VT disabled in BIOS or module not loaded；目前不能从 Linux 单独判定 BIOS 禁用还是上层虚拟化屏蔽，也不是设备权限问题。
- API36 默认 x86_64 Emulator 因无加速拒绝启动；Android 官方 TCG 模式启动 QEMU 后约 8 分钟仍未完成系统启动，黑屏且 `sys.boot_completed` 为空。`dumpsys webviewupdate` 显示 provider null，虽列出 Google WebView 134.0.6998.135 已安装。系统浏览器 intent 未启动；无法进行独立 WebView、Capacitor、项目 APK 或 API35/34 对照。
- ADB logcat 在设备 ADB 可用后、browser Intent 前启动并保存在诊断轮次目录；没有覆盖最早的离线引导时段。browser Intent 和 bugreport 结果均记录。Bugreport 在来宾生成但 ADB 离线时复制失败。QEMU 于 10:57:28 CST SIGSEGV/SEGV_MAPERR 退出；本轮未启动项目 APK，因此不是 app WebView SIGTRAP。未读取/复制 core；未上传日志/个人数据。
- 文档与记忆更新后实跑回归：`apps/mobile` typecheck/build/UI smoke 14/14 通过；`apps/server` typecheck/build/59 tests 通过；`test:web:browser` 通过。源码未改变。
- 诊断报告：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/报告与研究/理论考试练习系统/P5-A-本机Android验收-20261020/P5-A-WebView-SIGTRAP诊断记录-20261020.md`。原始诊断日志仅保存在其旁边的 `诊断轮次-20261020-01/`，不得推送 GitHub。
- 下一步需用户手动启用 BIOS/UEFI Intel VT-x（若宿主是 VM 则启用 nested virtualization）并重启；恢复后先确认 `vmx`。如 `kvm_intel` 仍未加载，需要用户授权后再加载，之后重跑浏览器→最小 WebView→最小 Capacitor→项目 APK→API35/34 的对照。当前不应改源码或宣布根因已定。

- GitHub Issue #7 已追加诊断进展评论（未上传原始日志）：https://github.com/MilchstraBe-Endless10/theory-exam/issues/7#issuecomment-6282321249。

- Git 状态：当前本地/远端功能分支均为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`；本轮仅 `docs/OPERATIONS-P5.md`、`memory/MID_TERM.md`、`memory/SHORT_TERM.md` 有未提交修改。由于 Android 运行环境验收阻塞，按最新 AGENTS.md 第 11 条暂停 Commit/Push；未改 `main`。Issue #7 诊断评论：https://github.com/MilchstraBe-Endless10/theory-exam/issues/7#issuecomment-6282321249，日志范围更正：https://github.com/MilchstraBe-Endless10/theory-exam/issues/7#issuecomment-6282333753。
## 2026-10-20：Android Emulator 清理与 Waydroid 只读评估

- 标准删除成功：`TheoryExam_API36`、SDK `emulator` 组件、`system-images;android-36.1;google_apis;x86_64`；AVD 列表为空。已删除本次专属截图目录、诊断日志目录、六个 `emulator*.log` 和 `/tmp/android-arlune_innersea/`，保留验收 Markdown。
- 六个经 `coredumpctl` 核实、命令行含 `-avd TheoryExam_API36` 的 QEMU core 文件为 root 所有，合计约 1.30 GiB；尚未删除。Codex 应用终端没有同步命令执行 PTY，`open_in_codex` 仍 queued，sudo 凭据交互无法安全完成；未修改共享 journald 元数据。
- JDK 21、Command-line Tools、API 36、Build Tools、Platform Tools/adb、Gradle Wrapper、Debug APK、debug.keystore 和 ADB key 均保留且可用。Wayland 与 AMD RX 550/Mesa 已有，但当前内核未发现 Binder 模块/binderfs/设备，LXC 未安装，因此不能声称 Waydroid 可无重启运行；未安装包、镜像或服务。
- 未完成清理项：上述六个 core 文件。按删除前盘点估算，本轮用户可写数据已释放约 6.47 GiB（AVD、Emulator、API 36 镜像及用户级日志/截图/临时文件；未计入尚存的约 1.30 GiB core）。P5-A 未完成；P5-B 未开始；本轮未提交或推送。
## P5-A 真机验收等待设备准备（2026-10-20）
- 检查当前分支 `feat/p5-a-android-security`，HEAD 与 `origin/feat/p5-a-android-security` 均为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`；保留已有 `docs/OPERATIONS-P5.md`、`memory/MID_TERM.md`、`memory/SHORT_TERM.md` 本地修改。
- scrcpy 未安装，`adb devices -l` 当前无设备。Debug APK SHA-256 为 `329e776eb46e298c17efce70c7424c9c050e9374b3379bdad41ea2664c785f9e`，包名 `com.theoryexam.mobile.dev`，版本 `1.0.0-dev.1`，Android Debug 签名已验证；未对手机安装或覆盖应用。
- 已按用户要求请用户在真正的 Omarchy 终端运行 `sudo pacman -S --needed scrcpy`，并连接手机、开启 USB 调试、批准主机。等待用户完成后继续真机验收；尚无截图/设备日志，本轮不提交、不推送。

## P5-A Lunaria APK 兼容性实验（2026-10-20；失败，停止扩展测试）
- 用户将本轮范围改为仅用官方 `yui0/lunaria` Release 2026.10.18 做离线 APK 兼容实验；不再使用手机、Android Emulator、AVD、QEMU、Waydroid、云设备或正式后端。
- 开始时 `feat/p5-a-android-security` HEAD 与远端均为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`；原有 `docs/OPERATIONS-P5.md`、`memory/MID_TERM.md`、`memory/SHORT_TERM.md` 修改保留。没有改项目源码/正式数据库。
- 官方 Linux x86_64 Release 解压在 `/home/arlune_innersea/Applications/Lunaria-Test/`。GitHub Release API digest 与下载归档 SHA-256 一致：`5ee801bd45634affb904fb78c5117c8b01400d5abf230243888b01121c87521c`。无独立 `.sha256` 文件；该值是对官方 API 元数据的一致性核对。归档 33 项，路径检查安全；包含可选 `scripts/lunaria-server.sh`，未运行，systemd 目录为空。
- 运行器是 x86_64 ELF，依赖宿主 `libglfw.so.3`。将官方 Omarchy 包源的 Arch `glfw 1:3.5.1-1` 仅下载并从测试目录本地提取所需共享库；GPG 签名验证为 Good signature，未全局安装。系统已有 EGL/GLES、Google Chrome 155.0.8059.39 和 Chromium 152.0.7977.82；选择 Chrome。
- APK SHA-256 符合预期 `329e776eb46e298c17efce70c7424c9c050e9374b3379bdad41ea2664c785f9e`；`unzip -t`、`apksigner verify` 通过，包名 `com.theoryexam.mobile.dev`、版本 `1.0.0-dev.1`、minSdk 24、targetSdk 36；Lunaria 解析并选择 `arm64-v8a`。
- Lunaria 图形窗口真实出现，标题“理论考试练习（开发版）”，但画面全白。日志显示 `ServiceWorkerController.getInstance()` 未实现/解析失败，之后 `ServiceWorkerController.setServiceWorkerClient` 空接收者 NPE，导致 `com.getcapacitor.Bridge.loadWebView()` 与 `MainActivity.onCreate` 失败；另有 `WebView.getCurrentWebViewPackage()` 等 API 未解析。80 秒首轮仍 `present=0`、`guest=0M insn`、`xlat=0.0M`。未继续测试 UI 或插件；判断证据指向 Lunaria 兼容层，不足以认定项目 Android 真机 bug。
- 原始短时复现日志（202 行/20,234 bytes）：`/home/arlune_innersea/Applications/Lunaria-Test/lunaria-run-20261020.log`。窗口截图：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/P5-A-Lunaria兼容性实验-20261020-01/lunaria-app-window.png`；报告：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/报告与研究/理论考试练习系统/P5-A-Lunaria兼容性实验-20261020-01/P5-A-Lunaria兼容性实验报告-20261020.md`。
- 两轮 Lunaria 均已停止；检查无残余进程或窗口。测试目录约 108 MiB，保留供用户查看。P5-A 仍未完成、P5-B 未开始；因本轮关键页面验证失败，依 AGENTS.md 暂停 Commit/Push。上面的旧“等待 USB 手机”记录被本节后续选择覆盖。


## P5-A Google Emulator 重新评估（2026-10-20；KVM 阻塞）

- 用户本轮重新授权使用 Google Android Emulator，但明确禁止 TCG、重启、BIOS/内核/启动参数修改及未经批准加载 KVM 模块。开始时功能分支 HEAD 和 origin SHA 均为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`；保留已有 `docs/OPERATIONS-P5.md`、`memory/MID_TERM.md`、`memory/SHORT_TERM.md` 修改，未开始代码改动。
- 只读检查：Omarchy 内核 `7.2.5-3-omarchy`、Intel i5-11400F；`/proc/cpuinfo` 未暴露 `vmx`，`/dev/kvm` 不存在，`kvm`/`kvm_intel` 未加载，但本内核对应模块文件存在；用户在 `wheel` 组。`systemd-detect-virt` 为 `none`，DMI 显示 ASUS 主板，未发现虚拟机迹象。更可能是固件未暴露 VT-x，但 Linux 证据不足以区分 UEFI 设置和更低层平台限制；这不是 `/dev/kvm` 权限问题。未运行 modprobe、sudo 系统更改或 Emulator。
- Android SDK 仍保留 JDK/命令行工具/平台工具/API 36/Build Tools；Google `emulator` 组件和二进制缺失，AVD 列表为空。没有活动 Emulator/QEMU 进程。本轮因此在安装前停止；未下载组件、创建 AVD、启动 TCG、安装或启动 APK。
- 核对到 6 个旧 QEMU core，其命令行均含 `-avd TheoryExam_API36`，共约 1.30 GiB；只尝试通过 `sudo -n` 删除这六个精确文件，系统要求本机密码后失败，未删除 core，也未清理共享 journald 元数据。不要在聊天中索要密码。APK、正式数据库、服务、MeFrp、证书和系统配置均未变。
- 本轮没有项目代码变更或提交/推送。当前工作区仍保留原三项未提交修改；P5-A 未完成，P5-B 未开始。继续 Emulator 前需用户在本机 UEFI 启用 Intel VT-x 并重启 Linux（或若实际处于虚拟机则在上层启用 nested virtualization）；启动后先确认 `vmx`、`/dev/kvm` 与 Emulator `-accel-check`，再继续。

## P5-A KVM/API 35 本机 Android 验收跟进（2026-10-21 CST；仍有阻塞）
- 只读检查确认 VMX 可见、`/dev/kvm` 存在、`kvm_intel` 与 `kvm` 已加载；Emulator 37.2.12.0 报 KVM version 12 可用。用户已在 BIOS 打开 VMX；本轮未改 BIOS/内核/启动参数或重启。API 35 Google APIs 与 Google Play 两个 x86_64 AVD 均保留；前者 2 vCPU/2 GiB/720×1600/GPU auto，后者 2 vCPU/2 GiB/1080×1920/GPU auto。
- API35 Android 15 系统启动完成，当前 WebView `com.google.android.webview 124.0.6367.219`；APK 的 React/Capacitor 页面稳定显示，未复现旧 API36 TCG WebView SIGTRAP。新一轮干净 logcat 4,996 行中无 FATAL EXCEPTION、SIGTRAP、Fatal signal、项目崩溃或 WebView 初始化错误。
- 发现相机权限拒绝后的提示只在手动输入展开时出现；修复 `apps/mobile/src/pages/MobilePages.tsx`，拒绝时自动展开表单并显示权限提示。实际 Android 权限弹窗点击拒绝后，屏幕展示错误和手动地址栏，`CAMERA` 权限为 denied，Activity 仍正常。Play AVD 曾打开原生 Google Barcode Scanner，但没有宿主相机/真实图像输入，二维码解码未验证，因此 P5-A 不能标记完成。
- 重建/安装 Debug APK：`com.theoryexam.mobile.dev`，`1.0.0-dev.1` / versionCode 1，minSdk24/targetSdk36，含 x86_64；Debug cert SHA-256 `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`；APK SHA-256 `8bbcc26478e2e1e99ccdc60412318766dc22eecbf9c8b8b9c2978f9dc7a2bc59`。APK 带隔离 TLS 联调专用 debug CA，只能用于测试。输出副本：`其他/理论考试练习系统/P5-A-Android-验收-20261020-03/`。
- 以前完成的隔离服务业务联调涵盖登录/首登改密/安全存储与会话恢复、题库导入 1,283 题、练习/收藏/错题复习、考试恢复/答案同步/断网重连/提交、SHA 验包/系统安装器/同签名升级后数据保持/考试中延后安装。临时 SQLite 只读统计为 1,283 题、2 测试用户、2 考试场次、2 复习轮次；未读身份字段/密码。测试 Fastify 18765/18766 现已停止，临时 DB、凭据、TLS key、候选 APK 和原始日志已清理。
- 回归命令结果：mobile typecheck/build 通过、UI smoke 14 项；server typecheck/build 与 59 项测试通过；production Web browser smoke 4 项通过。正式 `db:status` 仍 V4、V6 pending；3000/3001/8080 无监听，相关 systemd 与 frp unit inactive；正式库、用户、MeFrp、证书均未修改。未找到历史 QEMU core 文件；未清理共享 journal。
- 创建用户级启动/停止/安装快捷脚本及桌面入口。源文件：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/编程脚本/其他脚本/理论考试练习系统/P5-A-Android-Emulator-20261020-03/`，desktop links 位于 `~/.local/share/applications/`。启动脚本用 KVM、2 vCPU/2 GiB/GPU auto；停止只针对这两台 TheoryExam AVD。实际进行了启动、boot_completed、停止验证；APK helper 的包名 allowlist 生效，安装低版本时 Android 正确拒绝 downgrade。
- 报告和 APK 截图已复制到 AI 输出目录。保留本地未提交修改（包括前次的 `capacitor.config.ts`、`main.tsx`、`MistakePages.tsx`、Debug CA 文件及本文档/记忆）；工作区仍未 clean。P5-A 未完整验收，按 AGENTS.md 暂停自动 Commit/Push。功能分支本地/远端仍 `122ad04ab59983c60b19b8edb588fd6a0883ff98`；P5-B 未开始。

## P5-A 启动与登录页视觉修正（2026-10-21）
- 用户指出 APK 的启动页和登录页与 `design/reference/mobile-12-screens-v1.png` 不一致。本轮只调整入口视觉：启动页改用更接近定稿图的弯道路景 `splash-mountain-road-v3.png`，校准状态行、图标、标题、遮罩及按钮；登录页修正输入框/记住我/按钮的高度与间距，保留此前防止表单溢出屏幕的单列网格约束。
- Android 15/API 35 `TheoryExam_API35` 上通过更新安装重新打开 `com.theoryexam.mobile.dev`，实际进入启动页、连接页和登录页；登录控件完整显示，页面正常渲染。未输入账号或密码。模拟器停留在登录页，供继续检查。
- 真实截图与同尺寸参考对照：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/移动端入口视觉修正-20261021-03/`。开发 APK 副本：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/其他/理论考试练习系统/P5-A-入口视觉修正-20261021-01/theory-exam-debug-1.0.0-dev.1.apk`。APK SHA-256：`95cef493c176b42de9772da79d8f1754cf1aef5140e48ef3d96f5c6b7dd0bc2b`；applicationId `com.theoryexam.mobile.dev`，version `1.0.0-dev.1`，Android Debug 签名仍为开发证书。
- 验证：`npm --prefix apps/mobile run typecheck` 通过；`npm --prefix apps/mobile run test` 通过 **15/15** 检查（含 390×844、360×800、1536×1024、无横向溢出及入口几何）；`npm --prefix apps/mobile run android:debug` 成功；APK 安装与 Activity 启动成功。Logcat 采样未发现 `FATAL EXCEPTION`、项目进程 `SIGTRAP` 或崩溃。
- 启动背景已更贴近定稿图，但因仓库没有单独的原始高分辨率背景素材，景物细节与参考仍会有差异。未触碰正式数据库、账号、API 服务、TLS、systemd 或 MeFrp。P5-A 整体仍未完成，不进入 P5-B。
- 当前工作区包含本轮之前未提交的 P5-A 源码、运维文档和记忆修改；依据 AGENTS.md 第 11 条，本轮不提交、不推送、不覆盖这些改动。分支 `feat/p5-a-android-security` 的本地 HEAD 和 origin 分支仍同为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`。

## P5-A Android Emulator 二维码扫描补测（2026-10-21 CST；未验证）
- 在 `TheoryExam_API35_Play`（Android 15/API 35/x86_64，Emulator 37.2.12.0，KVM）使用官方 `imagefile` 摄像头参数测试有效/无效二维码，并尝试 Virtual Scene wall/table 图像导入。`imagefile` 的二维码在 Android 系统 Camera 预览可见；ML Kit Barcode UI CameraX 仍报 `No available camera can be found. Cams:1 Id:10 Lens:1`。Virtual Scene 命令返回 `OK`，但截图仍为默认场景，没有二维码。故真实解码、无效码拒绝、取消、成功 Bridge 结果及地址回填未验证；没有把输入链路失败归因于项目代码。
- 扫码后 React 连接页显示 `Failed to scan code` 且仍可操作。此前权限拒绝后手动输入已通过，本轮未重复。Logcat 另见 `com.google.android.gms.ui` 的 `TFLiteClient-0` SIGSEGV（ART JNI/Conscrypt 栈），与 CameraX 错误时间相邻，直接因果未确认；项目 APK 进程没有该崩溃。脱敏摘录和验收报告存于 AI 输出目录 `报告与研究/理论考试练习系统/P5-A-扫码验收-20261021/`，截图存于相应图片目录；原始日志只留本机。
- 本轮运行中的 `TheoryExam_API35_Play` 已通过设备序列号 `emulator-5554` 正常关闭，AVD 与用户数据仍存在。AVD 已安装 app 为 dev.2/versionCode 2；本地构建目录的 APK 是 dev.1/hash `95cef493c176b42de9772da79d8f1754cf1aef5140e48ef3d96f5c6b7dd0bc2b`，未冒充为测试 APK 哈希；dev.2 实测包哈希未导出。项目源码/正式服务与数据库未改。P5-A 未完成、P5-B 未开始，Issue #7 保持打开。当前分支 HEAD 与 origin 仍为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`；保留原始未提交修改，因扫码验收阻塞按 AGENTS.md 暂停 Commit/Push。

## P5-A ML Kit 隔离诊断（2026-10-21 CST；实时扫码仍未验证）
- 在现有 `TheoryExam_API35_Play` / Android 15 API 35 / Emulator 37.2.12.0 / KVM 上完成隔离实验，未重装 SDK/Emulator、未清除 AVD。`@capacitor-mlkit/barcode-scanning` 实际安装版本为 8.2.1。另安装独立包 `com.theoryexam.mobile.dev.scanlab` `1.0.0-scanlab.2`，APK SHA-256 `c0ff5caf40f99801ac1adea526cf404e1c61bbc87df00e684ba2f6cc2c9b4d34`，不覆盖原应用。
- 原 AVD app `com.theoryexam.mobile.dev` 为 `1.0.0-dev.2` / versionCode 2；测试前后导出的 APK SHA-256 均为 `89189e5779c56d9fa7973a5781237bb5ae1b20e6c791916e12e75023c2409d28`。没有混用本地 dev.1 哈希。
- 经原生 `BarcodeScanner.readBarcodesFromImage()` 验证：有效码 `https://example.com` 原样回传，Capacitor Bridge 收到结果，生产地址解析通过并回填；`not-a-valid-server-address` 原样回传但地址解析为 `null`；无条码图返回 0 条；缺图返回 `The image could not be loaded.`；拒绝 CAMERA 权限后图片解码仍可用。这证明原生图片解码/桥接/地址处理正常，不代表实时摄像头通过。
- 隔离 `startScan()` 及 CameraX 对照：`-camera-back imagefile:<二维码> -camera-front emulated` 下请求后置摄像头失败，返回 `No available camera can be found`，Camera2 仅枚举 Camera ID 1；同一前置 emulated 流可使 Preview 与 ImageAnalysis 进入 ACTIVE，但画面没有二维码，未产生解码结果。配置 `-camera-front none` 时 Camera2 设备数为 0。显式取消和 Android 返回均清理；`stopScan()` 后 active camera clients 为空。
- 测试前后 dev.2 APK 内容一致；无正式服务/API/SQLite 访问。实验期间 AVD 已定向关闭，当前 `adb devices -l` 无设备；Logcat 采集会话已停止，AVD 用户数据保留。原始 logcat 只留在本机。
- 报告：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/报告与研究/理论考试练习系统/P5-A-MLKit-隔离诊断-20261021-01/P5-A-MLKit隔离诊断报告-20261021.md`；脱敏诊断摘录在同目录，真实截图在相应 `图片与设计/理论考试练习系统/P5-A-MLKit-隔离诊断-20261021-01/`。
- 本轮没有改项目源码，工作区原有未提交内容全部保留。`npm --prefix apps/mobile run build`（含 typecheck）成功，`npm --prefix apps/mobile test` 的 UI smoke **15/15** 通过；没有运行 Gradle Android 重构建。由于实时扫码未通过且工作区不干净，不提交、不推送；Issue #7 保持打开，P5-A 未完成、P5-B 未开始。

## P5-A 前置 imagefile 实时扫码单次实验（2026-10-21 CST；失败于 Camera2 枚举）
- 复用 API35 Google Play AVD `TheoryExam_API35_Play`、Emulator 37.2.12.0 与 KVM。SDK `-help-all` 确认支持 `-camera-front imagefile:<filename>`，`-accel-check` 返回 KVM version 12 usable。从独立 ScanLab APK 资产 `assets/public/scan-lab/qr-valid.png` 提取现有二维码到 AI 输出图片目录，SHA-256 `3f9cb33292542037215a3b569c702915c4266d87b88485d037948ff4297869c9`。
- 单次启动参数为 `-avd TheoryExam_API35_Play -accel on -gpu auto -no-snapshot -read-only -camera-back none -camera-front imagefile:<二维码绝对路径>`；未清除或重装 AVD。ScanLab `1.0.0-scanlab.2` 的 Camera 权限已 granted，触发真实 `startScan({lensFacing: Front})`。
- Camera2 在调用前后均枚举 0 台设备；CameraX 返回 `CameraUnavailableException` / `Available cameras: 0`，ScanLab UI 显示 `startScan` 原生错误。监听器移除并调用 `stopScan`。因此输入图片没有作为 Camera2 摄像头进入 HAL，CameraX 未绑定，ML Kit 未收到帧；没有条码事件、Bridge 结果或地址回填。分类为摄像头输入枚举/绑定失败，不是 ML Kit 解码失败。按用户要求未再尝试其他参数。
- 截图 `图片与设计/理论考试练习系统/P5-A-MLKit-隔离诊断-20261021-01/23-front-imagefile-scanlab-error.png`；脱敏日志 `报告与研究/理论考试练习系统/P5-A-MLKit-隔离诊断-20261021-01/front-imagefile-camera-error-redacted.txt`。原始 logcat 与 Emulator 日志仅本机保存。
- 实验后定向关闭 AVD、停止 Logcat；`adb devices -l` 无设备，AVD 未 wipe。未覆盖 dev.2、改项目源码、正式扫码流程或数据库。实时扫码仍未通过，工作区原有改动保留，不提交/推送；Issue #7 开放，P5-A 未完成、P5-B 未开始。

## P5-A Virtual Scene 末次定位（2026-10-21；受桌面控制能力阻塞）
- `feat/p5-a-android-security` 本地 HEAD 与 fetch 后远端 SHA 均为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`；保留所有既存未提交源码、运维文档和记忆修改。
- 复用 `TheoryExam_API35_Play`、Android 15/API 35、Emulator 37.2.12.0、KVM。以 `-accel on -gpu auto -no-snapshot -camera-back environment` 启动，进程级设置 `ANDROID_AVD_HOME=~/.config/.android/avd`。`sys.boot_completed=1`；Camera2 枚举 1 台后置相机 ID 10，Facing: Back，枚举门槛通过。
- 桌面控制接口仅暴露浏览器、未提供原生 Emulator 窗口交互；因此未打开 Extended controls、未导入/定位 Virtual Scene 二维码，未确认系统相机预览，也未启动 ScanLab。CameraX、ML Kit 实时帧、插件事件、Bridge 与地址回填均未验证；无结论归因生产代码。
- 通过设备序列号 `emulator-5554` 定向关闭目标 AVD；ADB 设备已消失，AVD 未 wipe。报告：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/报告与研究/理论考试练习系统/P5-A-Virtual-Scene-20261021-01/P5-A-Virtual-Scene末次定位记录-20261021.md`；Android 主屏启动截图：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/P5-A-Virtual-Scene-20261021-01/android-home-camera2-gate.png`。原始启动日志和 Camera2 dump 仅留本机报告目录。
- 没有改项目源码、正式数据库、dev.2、证书、MeFrp 或 systemd。P5-A 未完成、P5-B 未开始；因实验未完成且工作区原有未提交修改存在，不提交、不推送。

## P5-A Virtual Scene 自动化扫码补充（2026-10-21 CST）
- 纠正此前“浏览器控制接口看不到 Emulator 原生窗口，因此无法操作”的结论：本机执行环境与 Omarchy 用户会话一致；ADB Emulator Console 可导入 Virtual Scene 图片，Emulator 本机 JWT/gRPC 服务监听 `127.0.0.1:8554`，可通过 ES256 临时令牌与两方法 allowlist 控制场景相机。复用独立脚本，不关闭认证、不开放外部网络；临时 JWK 已删除。
- Console 将有效测试码 `https://example.com` 导入 wall；以 Android 系统 Camera 截图确认 QR 实际出现在实时画面。第一次用了不存在的 PNG 路径，Console 仍返回 `OK` 但画面是黑板；使用真实 PNG 路径后画面验证成功。Camera2 ID 10 后置相机。
- ScanLab `startScan()` CameraX/ML Kit 使用真实 Camera2 帧解码有效地址，Bridge 返回 `raw=parsed=https://example.com`、count=1；无效地址解码后被生产地址校验拒绝。点击 `stopScan()` 与 Android 返回键都显示取消状态，Camera2 活动客户端恢复为空。
- 正式 `com.theoryexam.mobile.dev` dev.2（versionCode 2/minSdk 24/targetSdk 36）通过 `BarcodeScanner.scan()` 的 Google Play Services UI 实际返回 `https://example.com`。验证前把 UI 暂时输入改成 `https://example.comx`，扫描后成功 Toast 和地址回填将其改回二维码值；未点连接、无后端请求。设备安装 APK 哈希 `89189e5779c56d9fa7973a5781237bb5ae1b20e6c791916e12e75023c2409d28`，与保存的 dev.2 副本一致，未安装/覆盖 APK。GMS 日志同时有 CameraX camera-list 警告，保留在报告中。
- 验收报告：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/报告与研究/理论考试练习系统/P5-A-Virtual-Scene-20261021-01/P5-A-Virtual-Scene自动化扫码验收补充-20261021.md`。真实截图、Camera2 dump、脱敏摘录与本机原始日志均在同目录；原始日志未上传。
- 回归命令 `npm --prefix apps/mobile run build`（含 `tsc --noEmit`）通过；`npm --prefix apps/mobile test` 通过 UI smoke 15 项。未改源码或重建 APK。
- 接手时 `emulator-5554` 实际在线，与旧报告所写“已关闭”不一致；本轮核实 AVD 名称后定向关闭 `TheoryExam_API35_Play`，ADB 已无设备、`userdata-qemu.img` 仍在。未改正式数据库、API、扫码源码、TLS、MeFrp 或 systemd。P5-A 整体仍未完成（用户此前指出的 12 屏/启动页/登录页视觉差异仍未处理）；P5-B 未开始。本地/远端功能分支 HEAD 仍是 `122ad04ab59983c60b19b8edb588fd6a0883ff98`；已有工作区改动未提交/推送。

## P5-A Android 视觉与交互最终验收（2026-10-21 CST）
- 复用 `TheoryExam_API35` / Android 15 API 35 / Emulator 37.2.12.0 / KVM。独立 `.visual` Debug APK `com.theoryexam.mobile.dev.visual`、`1.0.0-dev.1-visual-preview-fixtures`、versionCode 1，SHA-256 `b058200ca26ab7e7b4fafee130304c73f83f84111fdcfb36c56e7b65dd428a6f` 已安装运行；没有覆盖原 `.dev` 或 dev.2。
- `mobile-12-screens-v1.png` 逐屏对照在 Android framebuffer 取 390×844 与 360×800 截图，共 24 张。12 屏均记录通过；两尺寸无横向溢出。测试触摸覆盖开始/连接/登录、键盘与返回键、手动连接展开、答题选择、考试选项切换、长页滚动、底部导航和前后台恢复。截图为隔离 preview fixtures，manifest 的 API request 列表为空，不代表真实账号/后端数据。
- 主要入口布局、登录表单、Android 安全区域等已校准；残留低影响差异是 splash 原始高分辨率素材缺失导致背景裁切/细节不完全一致、Android 状态/导航栏与 iOS 参考框架不同、少量字号/留白差异。完整报告和对照图见 AI 输出目录 `报告与研究/理论考试练习系统/P5-A-Android视觉终验-20261021-12/`、`图片与设计/理论考试练习系统/P5-A-Android视觉终验-20261021-12/`。
- 实测：`npm --prefix apps/mobile run build` 通过；`npm --prefix apps/mobile run test:ui` 18/18；`npx cap sync android` 成功；使用 `$HOME/.config/theory-exam/android-env.sh` 加载 JDK 21 后 `./gradlew assembleDebug` 成功。Logcat 未见项目崩溃/SIGTRAP/SIGSEGV/ANR。普通 `assembleDebug` 生成物受现有 `src/debug` 配置影响，包含 debug-only 测试 CA；未安装/交付。实际安装的隔离 `.visual` APK 不含该证书资源或 network config。
- 此处仅表示 Android Emulator 12 屏视觉/交互子任务通过；P5-A 整体仍保留未完成状态：本轮 preview 包未接真实后端、物理 Android 手机未测试，生产包身份的全量原生回归未重新执行。之前 Virtual Scene/CameraX/ML Kit QR 实测通过，见 AI 输出报告；不进入 P5-B。正式 SQLite、服务、TLS、MeFrp 与 systemd 未动。
- 本轮最终 production build 已通过 `cap sync` 写回 Android 资源；工作区保留原有多项未提交代码/文件。`git diff --check` 通过，但按 AGENTS.md 第 11 条不 Commit/Push。分支本地/远端 SHA 均为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`，Issue #7 未更新。

## P5-A 最终开发包集成收尾（2026-10-21 CST）
- Fetch 后 `feat/p5-a-android-security` 本地 HEAD 与 origin 均为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`。保留原工作区 15 项已修改文件和 5 个未跟踪文件；未 reset/clean/checkout 覆盖任何内容。
- 最终普通 APK：`com.theoryexam.mobile.dev` / `1.0.0-dev.3` / versionCode 3 / minSdk 24 / targetSdk 36；APK SHA-256 `c4cdc000f4b928f6485d1dba5ed09f8e7f7dde634fc1c6c6a91c603bc2f0e44a`；Debug 签名证书 SHA-256 `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`。`aapt dump badging` 与 `apksigner verify --print-certs` 已核对；普通 APK 无测试 CA/网络安全配置资源，Manifest cleartext=false。隔离 `p5aTest` APK 带 `.p5atest` 包名和独立用户目录 CA 配置。
- `TheoryExam_P5A_Final_Play_API35` 中首次安装 dev.3 成功；首屏/连接/登录页真实截图留存。BridgeActivity/WebView 成功启动，启动日志无 SIGTRAP/SIGSEGV/FATAL EXCEPTION/ANR。Camera2 后置 ID 10 可枚举，但本轮 Virtual Scene 预览仍没有二维码；未启动扫码解码，dev.3 实时扫码未验证。
- 12 屏 Android 视觉只在独立 `.visual` preview-fixture 包此前通过；本轮 dev.3 复核了启动/连接/登录，没有宣称全 12 屏已在最终包复验。登录/SecureStorage/练习/考试/网络恢复的隔离服务证据来自 `.p5atest`，不得冒充普通 `.dev` 全链路结果。普通 dev.3 更新器端到端未验证；正式私有 Release 双版本升级为 P6。
- 验证记录：mobile typecheck/build/UI smoke 18 项；server typecheck/build/59 tests/browser smoke；`npx cap sync android`；`./gradlew clean assembleDebug`、`./gradlew assembleP5aTest`；`git diff --check` 通过。原始 Logcat 仅本机保留。独立最终 AVD 已关闭且未 wipe；ADB 当前无在线设备。
- 报告：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/报告与研究/理论考试练习系统/P5-A-最终开发包集成-20261021-01/P5-A-最终开发包集成验收报告-20261021.md`；脱敏日志摘要同目录。截图：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/P5-A-最终开发包集成-20261021-01/`。Issue #7 已添加不含原始日志的进展评论（https://github.com/MilchstraBe-Endless10/theory-exam/issues/7#issuecomment-6316538953）。因扫码和最终身份回归未全部完成，暂停 Commit/Push。P5-A 未完成，P5-B 未开始。


## P5-A 普通 dev.3 可信 HTTPS / 隔离业务回归（2026-10-21 CST；部分通过）
- 普通 dev.3（`com.theoryexam.mobile.dev`, 1.0.0-dev.3, vc3；SHA-256 `c4cdc000f4b928f6485d1dba5ed09f8e7f7dde634fc1c6c6a91c603bc2f0e44a`）在独立 Android 15/API35 AVD `TheoryExam_P5A_TLS_Trust_API35` 实测。APK 与网络安全策略没有变更。
- 临时测试 CA 只安装于该 AVD Conscrypt 系统信任存储；普通 APK 通过 HTTPS `/api/health`。错误主机名、未信任 CA、过期证书分别拒绝（net_error -200/-202/-201）。结束前移除 AVD CA，停止 Fastify/TLS 服务，删除临时密钥、账号、SQLite 与辅助脚本；AVD 关闭但未 wipe，数据保留。
- A：登录改密、Remember Me/SecureStorage、强停恢复、练习答题、收藏、错题两轮掌握、考试计时/恢复/交卷通过。B：未勾选 Remember Me 后重启未恢复登录；初始业务数据为零。B 收藏写入和收藏练习模式通过。C 会话撤销后，下一次 API 请求显示“登录已失效，请重新登录”。网络断开后的重新连接恢复了题库和错题服务数据。临时 SQLite 只输出聚合计数，确认用户隔离。
- **未通过：** dev.3 独立“我的收藏”列表路由仍显示占位内容；收藏 API 和练习模式已通过，但列表页不能算通过。因而此业务验收为部分通过，P5-A 整体仍未完成。P5-B 未开始。
- 报告：AI 输出 `报告与研究/理论考试练习系统/P5-A-dev3-可信HTTPS-20261021-01/P5-A-dev3-可信HTTPS-隔离业务验收报告-20261021.md`；脱敏 TLS 摘要同目录，截图在对应图片与设计目录。未改源码或 APK；接手时工作区已有 15 项修改与 5 个未跟踪文件，按 AGENTS.md 不自动 Commit/Push。

## P5-A「我的收藏」dev.5 子任务交接（2026-10-22 CST）
- /favorites 已实现真实列表；复用 favorites API 与已有专项练习模式。Android 15/API35/KVM 上运行普通开发身份 dev.5（com.theoryexam.mobile.dev, vc5），APK SHA-256 72ee7315ae64de447784ee13ff37f697ff52593b9097a7940fc85f347c349512。
- A/B 隔离、真实空列表/多题、确认后取消、APP 重启恢复、B 无法读取 A、B 独立收藏后 A 切回、收藏专项练习 mode=favorites、断网错误及网络恢复均通过。题卡不显示标准答案。真实截图在 AI 输出 图片与设计/理论考试练习系统/P5-A-我的收藏-20261022-01/；详细报告在同名 报告与研究 目录。
- 移动端 typecheck/build/UI smoke 20 项通过；服务端 typecheck/build/59 测试通过；diff check 通过。普通 APK 未携带测试 CA，cleartext 关闭。隔离服务、临时 CA、凭据/密钥/SQLite 清理；AVD 已关且数据保留，当前没有 ADB 设备或测试端口监听。
- dev.5 会话失效专门复测、全 12 屏普通包复验及最终身份全系统回归仍待完成；P5-A 整体未完成，P5-B 未开始。Issue #7 已补充进度，保持打开。
- Git 本地与 origin 功能分支仍在 122ad04ab59983c60b19b8edb588fd6a0883ff98。保留既有启动/登录视觉和 Android SystemBars/视觉测试修改；本轮不提交/推送，因为它们与本轮 App/router/style 改动交错，未安全拆分。



## P5-A 普通开发包会话失效与账号隔离验收（2026-10-22 CST；dev.7 修复回归通过，P5-A 整体未完成）
- 按用户给定 SHA 核对 dev.5 基线普通 APK：`com.theoryexam.mobile.dev` / `1.0.0-dev.5` / versionCode 5 / SHA-256 `72ee7315ae64de447784ee13ff37f697ff52593b9097a7940fc85f347c349512`。会话修复后最终实测包是 dev.7，不把 dev.7 结果记成 dev.5。
- 在专用 `TheoryExam_P5A_Session_API35`（Android 15/API 35/x86_64、Emulator 37.2.12.0、KVM v12）发现记住登录用户离线冷启动后，网络恢复不能重验 SecureStorage 会话。修改 AuthContext/API 会话版本处理，避免延迟 401/续期结果清除或覆盖已切换账号；普通包不携带测试 CA，cleartext 仍关闭。
- dev.7 `com.theoryexam.mobile.dev` / versionCode 7 / SHA-256 `7e084f5043571bfb9c4c57d56740a5fb4f3834167ca7c40373cee53bdbded08b` 在目标 AVD 的已安装 APK 与归档 APK 哈希一致。真实 Android 上服务端撤销会话→HTTP 401→清理凭据/收藏页旧数据、A 重新登录恢复、A/B 隔离、A 的延迟 401 不影响 B、Remember Me/无记住登录、有效离线冷启动恢复、撤销会话不可恢复均通过。dev.6 对照验证了 HTTP 503、断网恢复和 TLS 主机名错误不误报为会话失效。
- 移动端 typecheck 通过；`npm --prefix apps/mobile test` UI smoke 20 项、会话回归 6/6 通过；dev.7 `build`、服务端 typecheck/build/59 tests、`cap sync`、Gradle `assembleDebug` 与 `git diff --check` 通过。设备 Logcat 最近 22,812 行中 Fatal Exception、Fatal signal、SIGTRAP、SIGSEGV、ANR、Unhandled Promise 计数均为 0。
- 专用 AVD 系统/Conscrypt 临时 CA 移除并核实不存在；Fastify/TLS 代理关闭、端口 31234/3443/3444 无监听；临时目录 `/tmp/theory-exam-p5a-session-20261022-01/` 已删除。只关闭 `emulator-5556` 对应 AVD，userdata 保留。正式 SQLite、账号、MeFrp、生产 TLS/systemd 未动。
- 报告：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/报告与研究/理论考试练习系统/P5-A-dev5-会话验收-20261022-02/P5-A普通开发包会话失效与账号隔离验收报告-20261022.md`；脱敏 API 摘要与实际 Android 截图在同目录及 `screenshots/`。APK：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/其他/理论考试练习系统/P5-A-dev6-dev7-会话验收-20261022/theory-exam-dev7.apk`。
- Issue #7 评论：`https://github.com/MilchstraBe-Endless10/theory-exam/issues/7#issuecomment-6332190413`，保持打开。工作区原有视觉、收藏、Android 插件与运维等多轮改动混合；未提交或推送，分支本地/远端 SHA 仍 `122ad04ab59983c60b19b8edb588fd6a0883ff98`。
- P5-A 尚未整体完成。下一项建议：使用普通 dev.7 对最终整合包执行一次全业务链路回归，并复用已通过的扫码和会话专项证据；P5-B 未开始。

## P5-A dev.7 最终整合验收继续（2026-10-22 CST；未完成）
- 本地 `feat/p5-a-android-security` 与远端仍为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`。dev.7 归档 APK 与 Google Play API35 AVD 设备内 APK 均为 `7e084f5043571bfb9c4c57d56740a5fb4f3834167ca7c40373cee53bdbded08b`；包名 `com.theoryexam.mobile.dev`、1.0.0-dev.7/vc7、Debug signer `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`。未重建或覆盖旧基线。
- 整合 Android 业务流程沿用同一 dev.7 真实验收证据；12 屏截图中 360×800 可对应 12 页，`181a-dev7-play-start-360x800.png` 是有效启动页，`173-dev7-start-360x800.png` 实际为个人中心。390×844 缺少错题页截图，双尺寸验收未闭合。
- Virtual Scene 最终有界复测：`TheoryExam_P5A_Dev7_Play_API35` 上系统 Camera2 后置 ID10 活动、Console 接受 `virtualscene-image wall`。从本机 Emulator 37.2.12.0 SDK proto 生成临时 protobuf；先因 JWT issuer 未列入策略而被拒，再在 Emulator SDK allowlist 临时添加仅两个 `protected` 摄像头方法，JWT audience 精确限制后旋转/移动成功。最多 12 步转向、每步不超过 0.4m/s × 1秒；截图显示客厅/厨房/走廊，二维码未进入画面，因此没有启动真实扫码器。目标 AVD Camera2 客户端停止后为空；临时 allowlist 已按原 SHA 完全恢复。
- dev.7 普通 APK 内容再次确认不含测试 CA/网络安全配置，Manifest cleartext 关闭；本轮在两个专用 API35 AVD 的 Conscrypt/APEX、system 和 user trust 路径未发现目标临时 CA 文件。两个 AVD 均已定向关闭、数据保留；测试服务/端口、`/tmp/theory-exam-p5a-dev7-final-20261022/` 中凭据、测试数据库、私钥、原始临时日志均已清理。正式 SQLite、TLS、MeFrp、systemd 未动。
- 实际命令：mobile typecheck/build、`npm --prefix apps/mobile test` 20 UI smoke + 6 session tests；server typecheck/build、59 tests；`test:browser`、`test:web:browser`、`git diff --check` 均通过。首轮 browser flow 失败因脚本仍期待 8 个列表按钮；实现将“未做题目”移至菜单后主列表应为 7。本轮仅将既有浏览器测试的两个期望值从 8 调整为 7，完整 flow 随后通过；未改 APK 源码。更新缓存元数据与 SHA 篡改拒绝由 server tests 覆盖；正式安装升级属于 P6。
- 本轮报告位于 AI 输出 `报告与研究/理论考试练习系统/P5-A-最终整合验收-20261022-01/P5-A-最终整合验收报告-20261022.md`，真实 Android QR 场景截图位于配套 `图片与设计/理论考试练习系统/P5-A-最终整合验收-20261022-01/dev7-qr-retest/`。Issue #7 已补充脱敏进展（`https://github.com/MilchstraBe-Endless10/theory-exam/issues/7#issuecomment-6335110715`），保持 OPEN。
- P5-A 仍未完成：dev.7 实时二维码未验证（阻塞发生在测试图没有进入相机预览，不是已证实的项目缺陷），390×844 错题页图缺失。工作区仍含多轮交织变更；阶段未通过，未 Commit/Push；P5-B 未开始。

### 交接后补充检查（2026-10-22）
- 重启同一专用 Play API35 AVD（Emulator 37.2.12.0、KVM），核实 `sys.boot_completed=1`、设备内普通 dev.7 仍为 versionCode 7；应用由启动页进入连接页。临时设为 390×844 / density 160 后采集了真实 ADB framebuffer，但隔离 HTTPS 服务、测试库和 AVD CA 已按前轮清理，不能登录读取错题数据，故未将该图冒充缺失的错题页证据。
- 恢复 AVD 原 360×800 / density 160 后通过目标 serial 的 `adb emu kill` 关闭，userdata 保留；当前 ADB 无在线设备。补充截图在 AI 输出 `图片与设计/理论考试练习系统/P5-A-最终整合验收-20261022-01/reopen-dev7-start.png` 和 `reopen-dev7-connect-390x844.png`。
- 已向 Issue #7 发布脱敏进展：`https://github.com/MilchstraBe-Endless10/theory-exam/issues/7#issuecomment-6335110715`；Issue 仍 OPEN。P5-A 未通过，未提交/推送，P5-B 未开始。

## P5-A 最后两项证据补齐（2026-10-22 CST；扫码仍阻塞）
- 复核普通 `com.theoryexam.mobile.dev` dev.7（versionCode 7）SHA-256 `7e084f5043571bfb9c4c57d56740a5fb4f3834167ca7c40373cee53bdbded08b`。指定 `TheoryExam_P5A_Dev7_Play_API35` 上的已安装 APK 与归档基线一致；没有重建、覆盖 APK 或清空 AVD。
- 对比历史成功 AVD `TheoryExam_API35_Play` 与 dev.7 Play AVD：两者均 Android 15/API 35、Emulator 37.2.12.0、Google Play、后置 emulated camera、同一二维码 PNG（1140×1140，SHA-256 `3f9cb33292542037215a3b569c702915c4266d87b88485d037948ff4297869c9`）；主要差异为 Pixel 2/1080×1920/density 420/GPU Auto 与 Pixel 4/1080×2280/density 440/GPU disabled 配置。dev.7 启动时 `-gpu auto` 因驱动兼容性回退 lavapipe/SWANGLE，KVM 仍启用。真实系统 Camera framebuffer 清晰显示墙上二维码，故图像注入已通过。
- 普通 dev.7 正式 `BarcodeScanner.scan()` 已在同一 Play AVD 实际执行；Google Play Services 的 `com.google.android.gms.ui` 在 `BarhopperV3.create` / `VisionBarcode` 发生 SIGSEGV，未返回插件条码结果、Capacitor Bridge 值或地址回填。APP 未崩溃，扫码后 Camera2 活动客户端为空。此为实测扫码失败，不能归因于已证实的项目解析/Bridge 缺陷；不改生产扫码代码，P5-A 仍未完成。
- 同一 dev.7 APK 在 390×844 的 `TheoryExam_P5A_Dev7_Final_API35` Google APIs AVD 上完成错题复习页真实业务截图。临时 Fastify + SQLite V6、1,283 题隔离题库和临时账号经可信隔离 HTTPS 使用；实际答错判断题后服务端确认生成 1 条待复习记录，截图统计来自真实 API，未显示标准答案。截图 AVD 为 Google APIs userdebug，而非指定 Play AVD；后者拒绝 adb root，故固定 Play AVD 上该页视觉未复验。测试服务、数据库、凭据、私钥和临时 CA 已清理；退出登录返回 200、冷启动为访客；AVD 定向关闭且保留数据。
- 最终报告：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/报告与研究/理论考试练习系统/P5-A-最后证据补齐-20261022-02/P5-A-最后两项验收与Git收尾报告-20261022.md`。真实错题截图：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/图片与设计/理论考试练习系统/P5-A-最后证据补齐-20261022-02/mistakes/dev7-mistake-review-390x844-google-apis-avd.png`；Camera 预览截图及 GMS 脱敏日志在同批次 `dev7-camera/` 子目录。截图经视觉复核：待复习 1、判断题 1、无横向溢出；报告另有滚动截图。
- Git：`git fetch` 后本地和 `origin/feat/p5-a-android-security` 均为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`，ahead/behind 0/0；`git diff --check` 通过，28 个候选文件的敏感材料扫描无命中。本轮不提交/推送，因为正式 dev.7 扫码这一 P5-A 验收项失败。
- 后续安全 Git 收尾的明确候选：保留并成组审查全部 21 个已修改文件：`apps/mobile/android/app/build.gradle`、`apps/mobile/android/app/src/main/java/com/theoryexam/mobile/dev/MainActivity.java`、`apps/mobile/capacitor.config.ts`、`apps/mobile/package.json`、`apps/mobile/scripts/ui-smoke.mjs`、`apps/mobile/src/App.tsx`、`apps/mobile/src/auth/AuthContext.tsx`、`apps/mobile/src/main.tsx`、`apps/mobile/src/pages/ExamPages.tsx`、`apps/mobile/src/pages/MistakePages.tsx`、`apps/mobile/src/pages/MobilePages.tsx`、`apps/mobile/src/services/api.ts`、`apps/mobile/src/services/banks.ts`、`apps/mobile/src/styles/app.css`、`apps/mobile/src/styles/tokens.css`、`apps/server/scripts/browser-flow-smoke.mjs`、`apps/server/test/practice.test.ts`、`docs/OPERATIONS-P5.md`、`docs/ROADMAP.md`、`memory/MID_TERM.md`、`memory/SHORT_TERM.md`。仅当未来完整阶段验收通过、再审来源/测试/安全后，考虑同时纳入 4 个必要新增：`apps/mobile/android/app/src/main/java/com/theoryexam/mobile/dev/SystemBarsPlugin.java`、`apps/mobile/scripts/session-regression.test.mjs`、`apps/mobile/src/pages/FavoritesPage.tsx`、`apps/mobile/public/splash-mountain-road-v4.png`。排除本机脚本 `apps/mobile/android/.visual-test.init.gradle`（含个人 AI 输出路径及 `.visual` 包名）、未引用的 `splash-mountain-road-v3.png` 与 `splash-mountain-road-v5.png`；不得用 `git add -A`。当前 Issue #7 保持 OPEN，P5-B 未开始。
- 按“复现旧成功 AVD”要求补做现场对照：以只读模式启动 `TheoryExam_API35_Play`，同一 Android 15/Google Play 镜像、Emulator 37.2.12.0、KVM，导入同一 PNG 并确认 Camera2 ID 10 活动。首次 JWT gRPC 被 issuer allowlist 拒绝后，仅临时添加两个 `protected` 场景相机方法，复用本机 ES256 JWT 脚本；6 次地标转向、3 次最多 0.4 m 的前移、1 次最多 0.4 m 的侧移和门洞微调仍未在相机画面找到二维码。历史成功截图仍有效，本轮旧 AVD 未复现；不能以 Console `OK` 代替画面通过。`emulator_access.json` 已按原 SHA `c70a962250289c5840c3fd414a63382048de93a0e97cade9bef3d60257004fc3` 精确恢复，临时 JWK/备份已清理，AVD 已定向关闭且只读启动，ADB 无设备。补充记录：AI 输出 `报告与研究/理论考试练习系统/P5-A-最后证据补齐-20261022-02/旧成功AVD现场复现补充-20261022.md`；本轮新旧 AVD 截图在对应 `图片与设计/.../old-avd-camera/`，主报告保持原判定。

## P5-A 普通 dev.9 startScan 正式扫码路径验收（2026-10-22 CST；扫码专项通过）
- 普通 APK：`com.theoryexam.mobile.dev` / `1.0.0-dev.9` / versionCode 9；APK SHA-256 `3db11faf2ffd96118f79f5582b7a82fa6ba739c259b9cde96081f7a6d8e73ad5`；Debug signer SHA-256 `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`。Gradle 输出、交付归档、设备内拉取 APK 三个哈希一致。设备是 `TheoryExam_P5A_Dev8_Play_API35`（Android 15/API35，Emulator 37.2.12.0、KVM）；当前安装 dev.9，未 wipe AVD。
- Android 正式连接页使用 `BarcodeScanner.startScan()`、`LensFacing.Back`、QR 过滤及插件 8.2.1 的 `barcodesScanned` / `scanError` 事件；`scan()` 留在 iOS 分支。dev.7 的 Google Code Scanner 路径曾导致 `com.google.android.gms.ui` 在 `BarhopperV3.create`/`VisionBarcode` SIGSEGV。dev.9 本轮未启动旧方法，GMS UI 日志 0 行；应用内 ML Kit `libbarhopper_v3.so` 和 OnedDecoderClient 初始化成功。
- Virtual Scene 同一有效 PNG 的真实后置帧进入 dev.9 CameraX：插件事件 rawValue `https://example.com`，页面从 `https://placeholder.invalid` 回填有效地址并提示用户手动验证；未连接 example.com。无效码 rawValue `not-a-valid-server-address` 被拒绝，原 placeholder 地址保持不变。另用 WebView DevTools 额外监听真实原生插件事件作 rawValue 证据，随后移除观察器。
- WebView 扫码态透明背景修正已在 APK 中实测：真实门景和扫码框同时可见。CAMERA 权限拒绝提示通过；取消、Android 返回、连续再启动、切后台/恢复、ConnectPage 路由卸载均实测；每条结束路径 `dumpsys media.camera` 的活动客户端为空。当前权限已恢复 granted。Logcat Fatal、SIGSEGV、SIGTRAP、ANR、Unhandled Promise 均 0。
- APK 安全检查：`usesCleartextTraffic=false`；未发现测试 CA、网络安全配置、`.cer`、SQLite/DB；Debug 签名验证通过。没有联系正式服务端，未动生产 SQLite、TLS、MeFrp、systemd。
- 回归：mobile typecheck/build 通过；mobile test UI smoke 20 项、会话回归 6/6；Android Gradle `assembleDebug` 通过（首次命令缺 `ANDROID_HOME`，补充本机 SDK 路径后成功）；APK identity/签名/哈希检查通过；`git diff --check` 在文档更新后复跑通过。
- 报告：AI 输出 `报告与研究/理论考试练习系统/P5-A-startScan-dev9-20261022-01/P5-A-dev9正式扫码路径验收报告-20261022.md`；脱敏 Logcat 与证据哈希在同目录；关键 Android 截图在对应 `图片与设计/理论考试练习系统/P5-A-startScan-dev9-20261022-01/`。
- ROADMAP 已更新为 dev.9 扫码通过、P5-A 仍进行中。此前全业务/12 屏验收基于 dev.7，本轮未在 dev.9 重跑，因此不宣告 P5-A 完成、不更新/关闭 Issue #7、不 Commit/Push。工作区原有 21 tracked 修改和 7 untracked 文件保持；排除本机 `.visual-test.init.gradle`、未引用 splash v3/v5 不进入提交。P5-B 未开始，P6 发布升级不计入本轮。

## P5-A ScanLab 同一 AVD 补充核验（2026-10-22 CST；未取得条码事件）
- 将独立 `com.theoryexam.mobile.dev.scanlab` 1.0.0-scanlab.2（APK SHA-256 `c0ff5caf40f99801ac1adea526cf404e1c61bbc87df00e684ba2f6cc2c9b4d34`）装入 dev.9 所在的 `TheoryExam_P5A_Dev8_Play_API35`，没有替换 `com.theoryexam.mobile.dev` dev.9；有效 QR PNG SHA-256 `3f9cb33292542037215a3b569c702915c4266d87b88485d037948ff4297869c9`，1140×1140。Console 返回 OK，但注入后的实际系统 Camera 截图与最多 5 步、每步 0.35 rad 的有界场景控制仍未显示二维码，因此没有 ScanLab 条码事件/rawValue；这是图像未进入当前可见场景的阻塞，不判为 CameraX 或 ML Kit 解码失败。
- ScanLab `startScan(Back)` 在 Android 15/API35 Google Play AVD 上实际启动；Camera2 后置 ID 10 活跃客户端为 ScanLab，CameraX Preview/ImageAnalysis 附着并 OPEN，ImageAnalysis 640×480，OnedDecoderClient 初始化成功。ScanLab WebView 本轮截图没有显示场景；取消后页面显示已取消、`Active Camera Clients: []`。测试窗口内 GMS UI/BarhopperV3/VisionBarcode/Fatal/SIGSEGV/SIGTRAP/ANR 均 0。此前 dev.9 普通 APP 的正式 `startScan()` 有效/无效二维码与地址回填通过记录不变，见独立报告。
- gRPC 显式使用 `-grpc 8554 -grpc-use-jwt`，监听为 `[::ffff:127.0.0.1]:8554`；仅临时添加两个受保护 camera RPC，不关闭 JWT；`emulator_access.json` SHA-256 前后保持 `c70a962250289c5840c3fd414a63382048de93a0e97cade9bef3d60257004fc3`。结束时只关闭目标 AVD，未清用户数据；dev.9 与 ScanLab 均留在独立包身份下。报告在 AI 输出 `报告与研究/理论考试练习系统/P5-A-ScanLab-same-AVD-20261022-01/`，截图在对应 `图片与设计/.../P5-A-ScanLab-same-AVD-20261022-01/`；P5-A 因 dev.9 全业务与 12 屏集成未复验仍未完成，P5-B 未开始，未 Commit/Push。
- 下一单项：只针对冷启动后 Virtual Scene 图片未出现在 Camera 画面的状态，恢复一张可见 QR 输入后再补同 AVD ScanLab 原生事件；不作无界场景搜索。


## P5-B 生产只读审计与方案（2026-10-22 CST；未部署）
- 用户确认 P5-A 已完成并同步；本地 ROADMAP 也标记 P5-A 已验收。本轮授权仅限只读生产审计与方案文档。没有修改生产配置、service、数据库、DNS、证书或 MeFrp 映射；未进入 P6。
- 执行 git fetch origin 后，feat/p5-a-android-security 的 HEAD 与 origin 同为 8ee3f53b21555ab8842246071d45030116d8857f。工作区既有 3 个未跟踪视觉/Gradle 文件保留；不提交。
- 只读核实到两个仍运行的 MeFrp 0.67.1 客户端，用户提供的启动日志为 theory-exam TCP 118.24.61.190:30946、theory-exam-web TCP 118.24.61.190:10393；控制台、localIP/localPort、节点固定性、ACL 与备用隧道未核实。凭据未写入记忆/报告；启动参数暴露风险列为部署前轮换待办。未停止现有客户端。
- 正式 SQLite 只读基线为 home 下 V4、当前代码 V6；240 KiB、4 users/0 admin/0 bank/0 question/0 learning record；完整性 ok、外键违规 0。已有 V1 空库归档不是 V4 恢复点。当前 systemd 模板数据目录 /var/lib/theory-exam 与实际 DB 路径不一致，备份模板仍写同卷；目标 ext4 设备 SMART 与恢复演练未验证。未运行迁移/备份。
- 项目仅有 API 与 daily backup systemd 模板，模板 verify 通过；没有 Web/Caddy/Nginx/MeFrp unit。Fastify API 3000、管理 3001、Web Gateway 8080 审计时无项目 listener。初稿曾提出可控域名 DNS-01 + Caddy；该建议已被用户 2026-10-22 的明确无域名决定取代。当前按 MeFrp 双 TCP + IP SAN 私有 CA + 本机 TLS edge 设计；Web Gateway 统一终止 TLS 仍需另行批准 web-server.ts 的显式 loopback proxy mode。
- 六份 P5-B 只读审计/拓扑/TLS/SQLite/systemd/授权清单报告保存在 AI 输出目录：报告与研究/理论考试练习系统/P5-B-生产只读审计-20261022-01/。实际执行了 git fetch、git status/rev-parse、git diff --check、源码/监听状态只读检查和 systemd-analyze verify；无应用构建或测试（本轮仅文档与审计）。
- 下一项：用户先确认 MeFrp 控制台的两条 TCP 映射、固定 LAN 地址与独立备份介质 SMART/恢复能力；在新的逐项授权前不进行生产变更。


## P5-B 无域名 IP SAN / 私有 CA 方案修订（2026-10-22 CST；仅审计与文档）
- 用户明确禁止域名、免费子域名和 DDNS。公网候选仅为 118.24.61.190:30946（API）与 118.24.61.190:10393（Web）；MeFrp 控制台映射、localIP/localPort、节点固定性仍未核验。
- 六份 P5-B 报告已修订：公网 IP:端口 + 两条 TCP 透明转发 + 本机 TLS 终止；SAN 使用公网 IP 与待确认固定 LAN IP。建议 Android API 与桌面 Web 分离私有 CA 信任锚、CA 签发密钥离线，APK 仅含 API CA 公钥、浏览器安装 Web CA 公钥。
- Android targetSdk 36、usesCleartextTraffic=false，当前无 networkSecurityConfig；IP 字面量范围是否能由 Android NSC/WebView 精确约束必须在真实 Android/WebView 测试验证。NSC 按主机而非端口匹配；桌面 Cookie 也不按端口隔离，须保持 Web 同源 Gateway、精确 Origin/CSRF，并确认 API 不接受浏览器 Cookie。
- 公信任 IP 证书未证明适用于当前共享 MeFrp IP/高位端口；CA 挑战端口与 IP 控制权需平台确认。IP 或 LAN 地址变化会触发叶证书重签；若 Android 信任范围绑定精确 IP，还需 APK 信任配置轮换。
- 本轮只改 AI 输出目录中的六份报告及 SHORT_TERM；未生成/安装证书、改 APK/安全策略、MeFrp、systemd、DNS、生产 SQLite 或服务。旧域名/DNS-01 方案已被无域名约束取代。阶段未部署。
- 六份报告目录：/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/报告与研究/理论考试练习系统/P5-B-生产只读审计-20261022-01/。


## P5-B 双 TCP 与 LAN 只读核验（2026-10-22 CST；未部署）
- 浏览器当前是 about:blank，没有已登录 MeFrp 控制台页；两个安装目录没有可解析的常见文本映射配置。历史映射仍为候选记录：118.24.61.190:30946 / :10393。remotePort 与 localIP/localPort、服务端注册状态、ACL、节点固定性未核实。
- 本机两个 mefrpc 进程各有 ESTAB TCP peer 连接到 118.24.61.190:2333；2333 是客户端 peer 端口，不是隧道 remotePort。进程 argv 检测到敏感认证参数标记，未显示参数或值；需另行批准凭据轮换方案。
- eno1 当前 192.168.0.107/24，NetworkManager ipv4.method=auto，网关 192.168.0.1；不是已确认固定 LAN 地址。主路由表默认接口 eno1，但去往 118.24.61.190 实际经 tun0/table 2022、源 10.20.0.1；tun0 用途与 MeFrp 出站预期需确认。
- ss -lnt 未见项目 3000/3001/5173/8080 或候选 edge 9443/9444。建议 API/Web TLS edge 候选端口分别为 9443/9444，MeFrp local target 候选为 loopback；候选端口仅在核验时未监听，仍须部署前重查。nftables ruleset 当前用户不可读。
- 新报告 07-P5-B-双TCP映射与固定LAN地址核验报告已写入既有 P5-B AI 输出目录；原 6 份报告补充了有本轮证据支持的网络字段。未改生产网络、防火墙、服务、证书、APK 或数据库。

## P5-B 实际部署与 dev.10 APK 交付（2026-10-23 CST；服务已启动，业务登录受数据/凭据阻塞）
- 按用户明确授权实际部署。正式 SQLite V4→V6 已迁移；此前先建立跨卷一致性备份并通过隔离恢复及 V6 完整性验证。当前只读计数：4 个用户、0 个题库、0 道题；没有收到可用账号凭据，未创建/重置账号、未导入题库，因此登录和答题未验收。
- API、Web 公网 Gateway、Web LAN Gateway 三个 user systemd unit 当前 `enabled/active`。公网 TCP 入口实测：API `https://118.24.61.190:30946`，Web `https://118.24.61.190:10393`；公网 API/Web `/api/health` 均返回 V6 `ok`，Web `/` HTTP 200（用 Web CA 验证）。LAN API `https://192.168.0.107:3000` 与 Web `https://192.168.0.107:8080` 健康检查通过。管理 listener 3001 仅 `127.0.0.1`。当前 `loginctl Linger=no`：user units 在此用户会话存续期间运行，不保证注销后继续运行。
- Android dev.10 实测首次连接失败根因为生产 `CORS_ORIGINS` 缺少 Capacitor WebView 来源 `https://localhost`：TLS 请求已到 API 并返回 200，但 WebView 因跨源响应未获准而拒绝读取。只在本机 API EnvironmentFile 精确增加 `https://localhost` 并重启 API；随后 AVD WebView 内 fetch 得到真实 200 JSON，正式连接按钮显示“服务器连接成功”。未改放宽 TLS/Cleartext；dev.10 Network Security Config 对 `118.24.61.190` / `192.168.0.107` 限定 API 根 CA，证书 IP SAN 匹配。
- AVD `TheoryExam_P5B_Deploy_API35`（Android 15/API 35 Google APIs）设备内包与归档 APK SHA 一致：`5d0089f664c63d52ade066679b38320c12b418de54613c716dd19a443e78ebb2`。身份 `com.theoryexam.mobile.dev` / `1.0.0-dev.10` / versionCode 10；Android Debug 签名 SHA-256 `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`，不是正式发布签名。强停后重启回到 APP 首页，服务器 URL 仍保存在 localStorage；未登录，故该结果不是会话恢复验收。
- APK 与 SHA 清单交付于 AI 输出 `其他/理论考试练习系统/P5-B-Android交付-20261023/`；目录另有 Web CA 公钥 PEM（不含私钥）及交付说明。连接成功、强停重启截图在 AI 输出 `图片与设计/理论考试练习系统/P5-B-Android验证-20261023/`。
- 应用更新 API 要求认证；当前 update cache 目录为空，未配置高于 dev.10 的 APK。未用同版本冒充更新。无凭据可验证认证后的更新元数据/下载，因此更新链未验收。
- APK Manifest `usesCleartextTraffic=false`，签名与设备安装包哈希核验一致。之前本轮回归：server tests 60/60；mobile UI smoke 20 项、session regression 6/6；mobile/server typecheck/build、Gradle assembleDebug 通过。本次续测只改本机 API CORS EnvironmentFile；APK 采用此前 P5-B 的应用 TLS 配置源码构建。
- Git fetch 后 `feat/p5-a-android-security` 与 origin 均为 `8ee3f53b21555ab8842246071d45030116d8857f`；无提交/推送。暂不上传 GitHub 预发布 APK：构建依赖的 `apps/mobile/android/app/src/main/res/raw/theory_exam_api_ca.pem` 被 `*.pem` 忽略且 AGENTS.md 禁止提交证书，干净 checkout 不能复现该 APK；工作区还保留本机 `.visual-test.init.gradle` 与 splash v3/v5 等原有未跟踪文件。没有将其们加入交付或删除。
- 尚需用户在不经本轮读取/重置的条件下提供可用账号凭据，并明确何时允许导入题库；另外需主机管理员决定是否为 user systemd 开启 linger，才能保证登出后持续服务。登录、真实题库练习、Remember Me 登录恢复、认证更新下载和正式持续运行仍未验收；本轮未进入 P6。

## P5-B 真实账号与题库导入/练习验收续测（2026-10-23 CST；凭据输入待用户完成）
- 本轮续核：Linger=yes；API、LAN Web、MeFrp Web 三个 user units 均 enabled/active，Restart=on-failure/3s。API 公网使用 API CA 验证 /api/health 为 V6 200；Web 公网使用 Web CA 验证首页和同源 health 200，/admin 与 /api/admin/status 404；管理 listener 仍只监听 127.0.0.1:3001。
- 正式库只读为 V6、integrity ok；4 普通用户、0 管理员、0 题库、0 题。唯一启用测试账号标记数为 1，四个普通账号均有首次改密标记；用户名和凭据未读取/记录。管理员初始化 CLI 已启动于交互 PTY 并等待本机输入，目前尚未创建管理员。
- 用项目 ExcelJS 解析原始 local-input/四级理论试题.xlsx（147,197 bytes；SHA-256 20d1b4d98485c048f65c3e6f2602eed4440950bf8f4fc857a47c4ce85c3a9a19）：1,283题，单选845/多选38/判断400，缺答0、错误0，64组/129行重复题干按原规则保留。
- 导入前一致性 V6 备份复制到独立 ext4 /mnt/Server_Data_Backup/P5B-Production-Backups/theory-exam-v6/production-v6-pre-import-2026-10-22T16-34-58-869Z-63b6c668.sqlite，SHA-256 071a47462fbcbdb48890d98537c5de29f1f6384fbb7c3d813102809626cd6db5，mode 0600；项目验证 integrity ok/FK0，并用项目恢复函数在临时隔离库验证 V6/4 users/0 banks/0 questions，临时副本已清理。
- 复用原 TheoryExam_P5B_Deploy_API35 AVD（Android15/API35 Google APIs）。设备内 dev.10 base.apk SHA 与归档一致；真实 APP 手动验证 API HTTPS 地址显示连接成功，未出现 TLS 错误或严重崩溃日志。APK: com.theoryexam.mobile.dev / 1.0.0-dev.10 / code10 / SHA-256 5d0089f664c63d52ade066679b38320c12b418de54613c716dd19a443e78ebb2，Android Debug signer SHA-256 11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462；Manifest cleartext=false。
- 因正式库无管理员且用户未输入管理员凭据，尚未进行正式 API 预览/确认导入；普通账号凭据亦须由用户本人在 Android 登录页输入，故真实登录、答题、收藏/进度同步与强停恢复未验收。没有改密码哈希、添加管理员或写入题库。
- 交付说明：AI 输出 其他/理论考试练习系统/P5-B-Android交付-20261023/Android使用说明-登录与练习.md。进展报告：报告与研究/理论考试练习系统/P5-B-真实账号与练习验收-20261023-01/实际运行进展与待输入项.md；Android 截图：图片与设计/理论考试练习系统/P5-B-真实练习验收-20261023-01/。
- 当前工作区既有 P5-B 变更未暂存/提交/推送，保护 8 项已修改与 5 项未跟踪文件；本轮未改源码、APK、MeFrp 配置、TLS 文件或数据库业务内容。下一步只需用户在本机交互输入管理员凭据并在 dev.10 登录页面输入获授权测试账号凭据后继续。
