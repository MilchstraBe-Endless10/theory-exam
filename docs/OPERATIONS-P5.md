# P5 本机运行、安全、更新与备份准备

本文前半部分保留 P5-A 阶段的设计与模板记录；实际 P5-B 部署已于 2026-10-22 获授权执行。最新生产状态、定时备份与仍需处理的权限阻塞见文末“P5-B 部署与收尾核验（2026-10-23）”。

## 监听入口

服务分为两个 Fastify listener：学习 API 默认监听 `127.0.0.1:3000`，管理 UI/API 默认监听 `127.0.0.1:3001`。公网/frp 只允许映射学习 listener；绝不能把 3001 加入 frpc。即使误将 3001 映射到公网，服务端 loopback 检查本身无法识别被本机 frpc 转发的请求，因此必须在 P5-B 部署审核时核对真实 frpc 拓扑，并用外部网络验证。

`HOST` 和 `PORT` 可按本机网络规划调整；`ADMIN_HOST` 必须为 loopback，`ADMIN_PORT` 必须与学习端口不同。普通学习 API 永远不注册 `/api/admin/*` 或 `/admin`。

生产 `NODE_ENV=production` 强制 `COOKIE_SECURE=true`。V6 迁移除 CSRF token 外还记录会话 remember 策略，以便 APP 在恢复前台或网络时将原有 12 小时或 30 天会话延期。用户上线前需在客户端到服务端之间配置可信 HTTPS，并检查证书链；不要在 APP 中关闭证书校验。前置代理 HTTPS 终止、frp TLS、可信来源及管理端隔离需要 P5-B 评审和外部验证。

## systemd 模板

模板位于 `deploy/systemd/`。它使用专用 `theory-exam` 用户、`UMask=0077`、受限文件系统、独立状态目录和 journald 日志。服务文件中的 `/opt/theory-exam`、`/etc/theory-exam/theory-exam.env`、用户名/组和端口都是部署占位值；本阶段没有写入 `/etc/systemd/system`。

经用户确认并完成变更评审后再执行类似流程：

1. 安装专用账号与应用文件，检查环境文件权限为 `0600`，配置 `THEORY_DATA_DIR=/var/lib/theory-exam`、监听地址和 CORS 来源；不要把密钥放入 Git。
2. 先用 `npm --prefix apps/server run db:status` 确认库状态，并创建、验证手动备份。
3. 安装 unit 文件后运行 `systemd-analyze verify`，再 `systemctl daemon-reload`。
4. 启动前执行获批的迁移；启动后查看 `systemctl status theory-exam` 与 `journalctl -u theory-exam`。
5. 停止：`sudo systemctl stop theory-exam`。恢复前必须先停止服务、验证备份并输入确认短语。
6. 升级前执行 `db:backup`，保留上一版应用目录；如健康检查失败，停止服务、恢复应用文件，并通过受控恢复流程恢复数据库备份。
7. 每日备份由 `theory-exam-backup.timer` 执行，保留最近七份通过 SQLite 完整性与外键检查的日备份。检查：`systemctl list-timers theory-exam-backup.timer` 和 `journalctl -u theory-exam-backup.service`。

## 数据库备份与恢复

`npm --prefix apps/server run db:backup` 创建受限权限的即时备份；`db:backup:daily` 创建日备份并轮换成功日备份至七份；`db:backup:verify -- --file PATH` 只读检查完整性、外键和迁移元数据。

恢复命令要求本机交互终端、`--service-stopped` 和 `--confirm`，还需要输入 `RESTORE`。它先对当前数据库创建一份可验证备份，再校验目标备份副本并原子替换数据库。**不能在 Fastify 仍运行时恢复**。恢复后先运行只读 `db:status`；迁移仍需单独授权与执行。

所有数据库与备份保存在应用源码目录之外，目录 `0700`、文件 `0600`。本阶段测试只使用 `/tmp` 隔离数据库。

## Android 本机 Debug 构建

本机开发构建使用 JDK 21、Android SDK Platform 36、Build Tools 36.0.0 和项目自带 Gradle Wrapper 8.14.3。当前 Omarchy 用户级环境通过 `source "$HOME/.config/theory-exam/android-env.sh"` 临时设置 `JAVA_HOME`、`ANDROID_HOME`、`ANDROID_SDK_ROOT` 与 `PATH`；该脚本在用户目录中，不提交到 Git，也不修改全局 Java。

构建命令：

```bash
source "$HOME/.config/theory-exam/android-env.sh"
java -version
adb devices -l
npm --prefix apps/mobile run android:debug
```

Debug APK 生成于 `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`，目录受 `apps/mobile/android/.gitignore` 忽略。当前 Debug 身份为 `com.theoryexam.mobile.dev` / `1.0.0-dev.1`，使用 Android Debug 签名；不能当作正式发布包或稳定升级签名。没有已连接的 Android 设备或可用模拟器时，构建成功不等于安装、启动或原生功能验收完成。

## P5-A 本机模拟器 WebView 诊断（2026-10-20；阻塞）

当前主机为 Omarchy 4.0.4 / 内核 `7.2.5-3-omarchy`，Intel i5-11400F。CPU 支持 VT-x，但 `/proc/cpuinfo` 中没有 `vmx`，`/dev/kvm` 不存在，`kvm`/`kvm_intel` 未加载；当前内核的两个模块文件存在，`modprobe -n -v kvm_intel` 只作 dry-run。Emulator `-accel-check` 报告 `/dev/kvm is not found: VT disabled in BIOS or KVM kernel module not loaded`。因此不是设备节点权限问题；但 Linux 只读检查无法单独判定 BIOS/UEFI 关闭 VT-x 或上层虚拟化未透传。没有更改 BIOS、加载内核模块、修改启动配置或重启。

API 36 AVD 默认以 x86_64 加速启动时拒绝运行，提示需要 hardware acceleration。按官方提示用 `ANDROID_I_WANT_MY_TCG=yes` 和 `-accel off` 后，QEMU 启动但约 8 分钟仍未完成 Android 启动：`sys.boot_completed` 为空，图形画面黑屏，WebView provider 为 null；系统浏览器 HTTPS Intent 无法启动。虽然 provider 列表中存在 `com.google.android.webview 134.0.6998.135`，服务尚未建立有效当前 provider。该环境不能作为项目 APK WebView 根因对照。

本轮 ADB logcat 在 ADB 设备可用后、浏览器/Activity 操作前开始并本机留存；不覆盖设备 offline 期间的最早引导日志。`-logcat-output` 文件为空。bugreport 在来宾端生成，但 Emulator 离线时无法复制到主机。退出时宿主 QEMU 于 `2026-10-20 10:57:28 CST` 以 `SIGSEGV/SEGV_MAPERR` 崩溃；当时项目 APK 未启动，因此与项目进程的 WebView `SIGTRAP` 不是同一次事件。日志、截图和 coredump 元数据留在用户 AI 产出目录；未上传原始日志或 core。

当前没有修改项目源码，也没有确认 SIGTRAP 根因。API 35/34、独立最小 WebView/Capacitor APK及本项目 APK 本轮都未能完成有效对照。继续诊断前需要用户在 BIOS/UEFI 启用 Intel VT-x；若本机运行于上层虚拟机，则需启用 nested virtualization。Linux 重启后应先确认 `vmx` 出现，再经授权加载 `kvm_intel`（仅当未自动加载），检查 `/dev/kvm` 的用户访问权限，然后再做浏览器、独立 WebView、独立 Capacitor、项目 APK 和 API 35 的逐项对照。不能以这次 TCG 黑屏结果宣称 Android app 根因已确定。

## P5-A KVM/API 35 本机验收跟进（2026-10-20/21 CST；部分通过）

本轮启动前，主机已能识别 `vmx`；`/dev/kvm` 存在，`kvm_intel` 与 `kvm` 已加载，Google Emulator `-accel-check` 返回 KVM version 12 usable。本轮没有修改 BIOS、内核或启动参数，也没有重启。此前 API 36 TCG 的 WebView 失败是历史实验；不能将其视为当前 API 35 项目的失败结果。

保留两台独立 AVD：`TheoryExam_API35`（Google APIs、Android 15/API 35、x86_64、2 vCPU、2 GiB、720×1600、GPU auto）和 `TheoryExam_API35_Play`（Google Play API 35、2 vCPU、2 GiB、1080×1920、GPU auto）。Google Play AVD 是为了取得 Google Code Scanner 模块；普通 Google APIs 镜像缺少对应 Play 模块服务。Emulator 版本为 37.2.12.0。主 AVD 报告 `sys.boot_completed=1`、WebView provider `com.google.android.webview 124.0.6367.219`；项目 React/Capacitor 页面正常显示，未观察到 WebView `SIGTRAP` 或应用启动崩溃。一次运行期资源样本约 3.14 GiB RSS、CPU 平均值 46%（进程已运行 12 分钟并处于交互测试阶段，不代表空闲功耗）；两台 AVD 各占约 2.4 GiB。

Debug APK 经修复相机权限拒绝提示后重建：`com.theoryexam.mobile.dev`、`1.0.0-dev.1`/versionCode 1、minSdk 24、targetSdk 36、含 x86_64 ABI，Android Debug 签名。SHA-256 为 `8bbcc26478e2e1e99ccdc60412318766dc22eecbf9c8b8b9c2978f9dc7a2bc59`，签名证书摘要与原有 Debug key 相同。为隔离 HTTPS 联调，构建仍包含仅用于测试的 debug CA trust config；不能当作生产 APK。APK 经 `apksigner verify`、`aapt dump badging` 与无令牌/私钥特征检查。安装到 API 35 后，首页在应用数据保留情况下恢复；退出登录清除了 SecureStorage 会话。

本轮修复扫码时拒绝相机权限后看不到错误的 UI 问题：将权限错误显示时同步展开手动连接区。Android 权限对话框真实出现并选择“拒绝”后，页面展示“相机权限未授予”以及服务器地址输入框；权限仍为 denied，App 未崩溃。Google Play AVD 先前已实际打开原生 Google Barcode Scanner 扫码界面并测试允许权限，但主机没有可供该模拟器读取的摄像头输入，因此**二维码真实识别尚未验证**。本轮干净 logcat 采样 4,996 行；未匹配 `FATAL EXCEPTION`、`SIGTRAP`、`Fatal signal`、项目进程崩溃或 WebView provider 初始化错误。

此前本阶段的隔离联调已覆盖 HTTPS 测试 CA/证书验证、隔离 Fastify+SQLite、本机 Excel 1,283 题、登录/首次改密/安全存储、练习收藏、错题复习、考试恢复/答案同步/提交、断网恢复、更新包 SHA 校验与系统安装器、同签名升级后的数据保留、进行中考试时拒绝打开安装器。本轮另用临时 SQLite 只读计数确认 1,283 题、2 个测试用户、2 场考试快照和 2 轮错题复习；不读取凭据字段。测试结束已停止本轮 18765/18766 隔离服务。旧的 1.30 GiB QEMU core 曾由历史记录跟踪；当前查询没有找到对应 core 文件；没有清理共享 journal。

桌面应用菜单的启动、关闭入口源文件保存在 AI 输出目录 `编程脚本/其他脚本/理论考试练习系统/P5-A-Android-Emulator-20261020-03/`，链接安装在 `~/.local/share/applications/`；终端命令为 `~/.local/bin/theory-exam-android-start` 与 `~/.local/bin/theory-exam-android-stop`。启动默认使用 Google Play AVD、`-accel on`、2 核/2 GiB、GPU auto；停止脚本只关闭名为 `TheoryExam_API35` / `TheoryExam_API35_Play` 的 AVD。桌面 APK 文件关联只接受本项目开发包名，并以普通 `adb install -r` 安装；低 versionCode 会被 Android 安全地拒绝降级。

回归：移动端 `typecheck`、`build` 通过，UI smoke 14 项通过；服务端 `typecheck`、`build` 通过，59 项通过；`test:web:browser` 通过 4 项。正式 `db:status` 仍显示 V4，V6 待迁移；3000/3001/8080 无监听，相关 systemd 与 frp unit inactive。本轮未改正式数据库、用户、服务、证书、端口或隧道。

P5-A 仍未完成：需要有真实图像输入才能验二维码解码；Google Emulator 不等同 Android 真机，也不能覆盖真实摄像头行为。P5-B 未开始。由于仍有原有未提交改动且原生扫码识别未验收，遵照 AGENTS.md 暂停 Commit/Push；当前功能分支远端 SHA 保持 `122ad04ab59983c60b19b8edb588fd6a0883ff98`。

## 更新包准备

Android 开发包身份当前为 `com.theoryexam.mobile.dev`，不代表正式包名。正式包 ID、签名密钥保管和正式 HTTPS 地址仍待用户确认。APP 不包含 GitHub Token。正式私有 Release 同步所需的服务器凭据只能由 P5-B 运维人员配置到受限 systemd 环境；本阶段不读取该凭据、不发布 Release，也不声称存在已签名可升级 APK。

## P5-B 明确待批操作

- 在正式数据库 V4 上验证备份后再单独请求用户确认 V6 迁移；保留四个现有普通账号。
- 给出实际 systemd 文件安装/启停、数据目录所有权、端口及回滚命令后再请求确认。
- 检查并记录现有 frpc 映射，确保只映射业务入口；从外部网络验证管理页面、管理 API 和首次管理员初始化均不可达。
- 配置可信 HTTPS/证书和更新缓存来源，并通过浏览器、Android 系统安装器验证证书错误、签名不匹配与版本回滚被拒绝。

## P5-A Android Emulator 二维码扫描补测（2026-10-21 CST；未验证）

在 Android 15/API 35 Google Play AVD (`TheoryExam_API35_Play`, Emulator 37.2.12.0, KVM) 上分别尝试官方 `-camera-back imagefile:<path>` 与 `-camera-back environment`。`imagefile` 二维码可见于 Android 系统 Camera 预览，但 ML Kit Barcode UI 的 CameraX 在 10:25 和 10:37 记录 `No available camera can be found. Cams:1 Id:10 Lens:1`；Virtual Scene 导入命令返回 `OK`，预览仍显示默认场景，未显示二维码。因此有效/无效二维码解码、取消、成功 Bridge payload 和地址回填均未验证。扫描失败后应用连接页显示 `Failed to scan code`，页面仍可用。此前相机权限拒绝后手动连接通过，不重复验收。Google Play Services 的 `com.google.android.gms.ui` 在 10:25:02 另有 `TFLiteClient-0` SIGSEGV，栈首为 ART JNI `GetArrayLength` 与 Conscrypt `NativeCrypto_EVP_DigestUpdate`；与扫码时序相邻，但不能据此断言它由 CameraX 错误触发。项目源码未改，未认定项目扫码实现有缺陷。

本轮报告与脱敏日志：AI 输出目录 `报告与研究/理论考试练习系统/P5-A-扫码验收-20261021/`；真实截图位于同主题图片目录。测试结束通过 `adb -s emulator-5554 emu kill` 停止指定 AVD；AVD 文件与数据保留。本地已安装 dev.2（versionCode 2），未覆盖；当前构建目录 app-debug.apk 是 dev.1，故不把该 APK 的哈希冒充本轮测试 APK 哈希。P5-A 仍未完成、Issue #7 不关闭、P5-B 未开始。因验证未通过且原工作区已有改动，按 AGENTS.md 暂停自动 Commit/Push。

## P5-A Android 视觉与交互最终验收（2026-10-21 CST；视觉子任务通过）

使用现有 Omarchy 本机 `TheoryExam_API35` AVD（Android 15/API 35、KVM、Emulator 37.2.12.0），未重装 SDK、wipe AVD 或覆盖原 `com.theoryexam.mobile.dev` 包。隔离视觉验收包 `com.theoryexam.mobile.dev.visual`、versionCode 1、versionName `1.0.0-dev.1-visual-preview-fixtures`，Debug 签名；SHA-256 `b058200ca26ab7e7b4fafee130304c73f83f84111fdcfb36c56e7b65dd428a6f`。APK 成功安装并启动，保留独立包名，不覆盖之前的 dev.2 扫码验收包。

按 `design/reference/mobile-12-screens-v1.png` 对照启动页、连接、登录、首页、练习选择、练习答题、答题结果、考试设置、考试中、考试结果、错题复习、个人中心。每页均从 Android framebuffer 在 390×844 与 360×800 取图，共 24 张；采集 manifest 记载 0 个 API 请求，无横向溢出。真实 Android 触摸覆盖启动/连接/登录、键盘弹出与 Back、手动地址输入展开、答题选择、考试多选切换、窄屏滚动、底部导航、前后台恢复。18/18 UI smoke 通过。页面用开发预览夹具，数字和用户不代表正式数据。

视觉修正涉及启动背景/遮罩、品牌区和按钮尺寸、入口连接卡片、登录标题/输入框/记住我/按钮，以及 Android 系统安全区域。启动与登录主体布局已贴近基准。剩余低影响差异：项目没有与设计图完全相同的原始高分辨率启动背景，因此现用最接近素材仍有裁切/细节差异；Android 系统状态栏/导航栏与参考图中的 iOS 框架不同；部分文字密度、卡片留白略有差别。未为消除平台差异而替换整页设计。

截图与逐页对照在 AI 输出目录 `图片与设计/理论考试练习系统/P5-A-Android视觉终验-20261021-12/`；报告、截图清单、构建日志和脱敏 Logcat 在 `报告与研究/理论考试练习系统/P5-A-Android视觉终验-20261021-12/`。最终 logcat 没有应用崩溃、SIGTRAP/SIGSEGV 或 ANR。旧 `dev` 包更新时间未改变；ADB 当前前台 Activity 是独立 `.visual` 包。

验证：`npm --prefix apps/mobile run build`、`npm --prefix apps/mobile run test:ui`（18/18）、`npx cap sync android`、加载用户级 JDK 21 环境后的 `./gradlew assembleDebug` 均通过。第一次 Gradle 调用未加载 Android 环境脚本而找不到 Java，随后用既有用户级脚本重跑成功。普通 Gradle `app-debug.apk` 因工作区原有 `src/debug` 证书配置含 debug-only 测试信任锚，未安装、未交付、未发布；已安装的隔离 `.visual` APK 内容不含该证书/网络安全配置。没有暴露私钥。

**范围结论：本轮 Android Emulator 视觉/交互子任务通过；P5-A 整体仍未标记完成。** 本轮视觉包带 preview fixtures，未连接后端；物理手机没有验收；生产包身份上的完整回归没有在这轮重做。此前独立真实 CameraX/ML Kit 二维码结果见 AI 输出报告 `P5-A-Virtual-Scene-20261021-01/P5-A-Virtual-Scene自动化扫码验收补充-20261021.md`。正式数据库、账号、API 服务、TLS、MeFrp 与 systemd 未改；P5-B 未开始。

## P5-A 最终开发包集成与安全回归（2026-10-21 CST；部分通过）

### 构建身份与证书隔离

- 基于当前未提交源码，在 `feat/p5-a-android-security` 构建普通开发包 `com.theoryexam.mobile.dev`，`1.0.0-dev.3` / versionCode 3，minSdk 24、targetSdk 36、Android Debug 签名。APK SHA-256：`c4cdc000f4b928f6485d1dba5ed09f8e7f7dde634fc1c6c6a91c603bc2f0e44a`；Debug 证书 SHA-256：`11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`。
- Gradle `debug` 使用系统证书信任库。隔离 CA 由单独 `p5aTest` build type 从用户配置目录 `~/.config/theory-exam/p5a-test-ca/` 引入，变体包名为 `com.theoryexam.mobile.dev.p5atest`。普通 dev.3 的打包内容未发现 `p5a_test_ca.cer`、证书文件或 `network_security_config`；APK Manifest 中 `usesCleartextTraffic=false`，没有 `networkSecurityConfig` 属性。隔离 `.p5atest` APK 中有独立网络安全配置与 CA 资源。
- `previewMode` 源码必须处于 `import.meta.env.DEV` 且 URL 带 `preview=1` 才能打开；正式构建产物扫描未找到 `preview-level4`、`preview=1`、`PREVIEW_ISOLATED` 标记。dev.3 新装进入启动/连接页，没有恢复旧登录状态。测试账号仅用于隔离 `.p5atest` 服务流程，不写入普通 dev.3 的运行时会话。
- 普通 APK 另经 `apksigner verify --print-certs`、`aapt dump badging` 和 ZIP 内容核对；构建清单及 APK 副本保存在 AI 输出目录 `其他/理论考试练习系统/P5-A-最终开发包集成-20261021-01/`。APK 不含 SQLite、正式题库、签名私钥、测试 CA 或 GitHub Token。

### Emulator 集成实测

- 使用 Emulator 37.2.12.0、Android 15/API 35、KVM，在独立 `TheoryExam_P5A_Final_Play_API35` AVD 中安装 dev.3。设备内 APK 与新构建件哈希一致。启动页、连接页、登录页及测试 CA 不受信任提示均有实际 Android framebuffer 截图；WebView provider 为 `com.google.android.webview 124.0.6367.219`，Capacitor `BridgeActivity` 启动。该轮进程 Logcat 未匹配 `FATAL EXCEPTION`、`SIGTRAP`、`SIGSEGV` 或 ANR。
- 首次安装与入口页面显示通过；普通 dev.3 未连接隔离业务服务。先前 `.p5atest` 变体在隔离 Fastify/SQLite 中完成登录、SecureStorage、Remember Me、练习、收藏、错题、考试恢复及网络恢复等回归；不能把测试变体结果记作普通 dev.3 全链路通过。
- dev.3 的真实摄像头扫码未通过本轮复验。Camera2 能枚举后置 Camera ID 10；Android 系统相机截图显示 Virtual Scene 默认房间，二维码没有进入可用预览。因此没有启动插件解码，也没有扫码 Bridge/地址回填证据。此前 dev.2 的 Virtual Scene/ML Kit 通过记录仍有效，但不能替代 dev.3。
- 12 屏 Android 视觉/交互此前由独立 `.visual` preview-fixture APK 在 390×844 与 360×800 通过；本轮 dev.3 只复核启动、连接和登录入口页，尚未在 dev.3 身份下逐页重跑 12 屏。更新器既有 `.p5atest` 检查不等于 dev.3→新版本完整升级回归；私有 Release 下载/发布仍属于 P6。
- 隔离 AVD 已定向关闭并保留数据，当前 `adb devices -l` 无在线设备；原 `TheoryExam_API35_Play` 的 dev.2 证据环境未覆盖。原始 Logcat 仅留本机，不进入 GitHub；验收报告包含脱敏日志结论。

### 回归与当前结论

- 本轮已记录通过：移动端 `typecheck`、`build`、UI smoke 18 项；服务端 `typecheck`、`build`、59 项测试与浏览器 smoke；`npx cap sync android`、`./gradlew clean assembleDebug`、`./gradlew assembleP5aTest`、`git diff --check`。APK SHA、证书指纹、APK 清单、Manifest 与截图详见 AI 输出报告 `报告与研究/理论考试练习系统/P5-A-最终开发包集成-20261021-01/P5-A-最终开发包集成验收报告-20261021.md`。
- 正式 SQLite、四个账号、MeFrp 隧道、生产 TLS、systemd 与 P5-B 部署均未改动。当前仍需 dev.3 真正扫码、普通 dev.3 隔离后端业务/native 全回归、dev.3 更新路径及 12 屏视觉补测。故 P5-A 未完成，P5-B 不得开始。
- 工作区有既存未提交代码、文档和测试资源；本轮在验证矩阵仍有未完成项时没有 Commit/Push。`git fetch origin feat/p5-a-android-security` 后本地与远端 SHA 均为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`。Issue #7 保持 OPEN。


## P5-A 普通 dev.3 可信 HTTPS 隔离业务验收（2026-10-21 CST；HTTPS 通过，业务部分通过）
- 普通 APK `com.theoryexam.mobile.dev` / `1.0.0-dev.3` / versionCode 3，SHA-256 `c4cdc000f4b928f6485d1dba5ed09f8e7f7dde634fc1c6c6a91c603bc2f0e44a`，Debug 签名摘要 `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`。实测 AVD 为专用 `TheoryExam_P5A_TLS_Trust_API35`（Android 15/API 35、Emulator 37.2.12.0、KVM），没有用 .p5atest/.visual/.scanlab 替代。
- 没有修改 APK 安全策略或应用源码。仅在该专用 AVD 的 Conscrypt 系统信任目录临时放入与证书 SAN `10.0.2.2` 匹配的测试 CA；普通 dev.3 经连接页通过 HTTPS 健康检查（HTTP 200，隔离 DB migrationVersion 6）。错误主机名、未信任 CA 和过期证书均被应用拒绝（Chromium net_error -200/-202/-201）。测试 CA 指纹 `89:00:01:39:00:31:B0:C0:21:5A:01:0F:EB:5B:66:56:95:D8:F5:CF:03:32:7E:73:DF:BD:CC:08:AB:58:E9:8A`，结束前已从该 AVD 移除。
- 隔离 Fastify、TLS 网关、SQLite 与临时账号只用于本机测试。账号 A 的登录/首次改密、Remember Me/SecureStorage、强停恢复、练习答题、收藏、错题两轮掌握、模拟考试计时/答案恢复/交卷通过。断网后重新连接，dev.3 恢复读取 1,283 题及错题数据。账号 B 不勾选 Remember Me 后重启未恢复登录；初始数据为零。账号 C 的会话记录撤销后，dev.3 显示“登录已失效，请重新登录”。临时 SQLite 聚合只输出计数，显示 A/B 数据隔离。
- 收藏写入和“收藏题目”练习模式通过真实 API；但独立“我的收藏”路由在 dev.3 中仍是“等待本地服务端接入”的占位页，列为未通过。故本业务回归为部分通过，不能声称所有核心业务页面已完成。
- 测试服务停止，端口 31234、31235、3443–3446 已无监听；临时 CA 私钥、服务器私钥、账号凭据、测试数据库和辅助脚本已清理。AVD 已关闭但未 wipe，userdata 保留；P5-A 整体未完成、P5-B 未开始。
- 报告与脱敏摘要：`/mnt/Server_Data_Center/Personal_Files(个人文件)/Cosmos_File/AI产出数据文件/报告与研究/理论考试练习系统/P5-A-dev3-可信HTTPS-20261021-01/`；截图在相应图片与设计目录。截图覆盖正负 TLS、网络恢复、账号 B 隔离/无记住登录、会话失效和模拟考试。
- 本轮未改应用源码或 APK，没有重建。保留接手时 15 个已修改文件与 5 个未跟踪文件；按 AGENTS.md 第 11 条不自动 Commit/Push。Issue #7 只补充进度，不关闭。

## P5-A「我的收藏」dev.5 Android 原生验收（2026-10-22 CST；子任务通过）
- 新增 apps/mobile/src/pages/FavoritesPage.tsx 并将 /favorites 从占位页替换为真实页面；首页及个人中心入口指向独立收藏路由。页面复用现有 GET /api/favorites、收藏更新/删除接口与 favorites 练习模式，没有新增重复后端业务。按服务器、账号、题库形成页面作用域；切换作用域后不显示旧数据，取消收藏经服务端确认后才删除本地卡片。
- 展示题库名称、真实收藏数、题型、题干与选项摘要；不暴露 answer/correctAnswer 或标准答案标记。加载、空列表、无服务、未连接、未登录、失效会话、无题库、预览和错误状态分别显示。空状态提供日常练习入口；进行中练习不被覆盖，可恢复收藏会话。
- Android 15/API 35、Emulator 37.2.12.0、KVM 上以普通 com.theoryexam.mobile.dev dev.5 实测；没有使用 .visual/.p5atest/.scanlab 代替。APK 1.0.0-dev.5 / versionCode 5，SHA-256 72ee7315ae64de447784ee13ff37f697ff52593b9097a7940fc85f347c349512；构建输出与 AI 产物副本一致。普通 APK 内无测试 CA/Network Security Config，cleartext 仍关闭。
- 隔离 Fastify/SQLite 与账号 A/B 实测：真实空列表、多题展示、取消后计数减少、强停/重启持久化、B 看不到 A 的收藏、B 单独收藏后 A 重新登录仍只见 A 的记录。启动收藏练习后服务端会话为 mode=favorites、1 题。断网显示错误而非空列表，恢复后重载正常。收藏页面题目不显示标准答案。会话失效未在 dev.5 收藏页专项复测；dev.3 的历史通用提示不作为本轮证据。
- 真实 framebuffer 截图含 390×844（B 一条收藏、收藏练习、账号切回）及 360×800；同时留存空状态、两条收藏、取消、重启、断网/恢复。报告及 APK：AI 输出目录 报告与研究/理论考试练习系统/P5-A-我的收藏-20261022-01/、其他/理论考试练习系统/P5-A-我的收藏-20261022-01/；截图目录为配套 图片与设计/...。
- 回归：移动端 typecheck/build/UI smoke 20 项通过；服务端 typecheck/build/59 tests 通过；git diff --check 通过。APK 已实际安装运行，Logcat 未见 app fatal/SIGTRAP/SIGSEGV/ANR。结束后关闭指定 AVD、停止隔离服务并清理临时凭据、私钥与 SQLite；不触及正式数据库、MeFrp、生产 TLS/systemd。
- 该子任务通过不代表 P5-A 整体完成。dev.5 会话失效与完整最终身份下系统回归仍未验；全 12 屏历史证据来自 .visual 预览包，dev.5 全屏复验待补。P5-B 未开始。
- Git：fetch 后本地与 origin 仍为 122ad04ab59983c60b19b8edb588fd6a0883ff98。工作区旧启动/登录视觉改动、SystemBars 插件、视觉脚本/素材与本轮修改交错；依 AGENTS.md 第 11 条未提交/推送。Issue #7 已留进度评论，未关闭。

## P5-A dev.7 最终整合验收（2026-10-22 CST；未完成）

- 唯一 APK 基线为 `com.theoryexam.mobile.dev` / `1.0.0-dev.7` / versionCode 7，SHA-256 `7e084f5043571bfb9c4c57d56740a5fb4f3834167ca7c40373cee53bdbded08b`，Debug signer SHA-256 `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`。从专用 Google Play API 35 AVD 拉取的 `base.apk` 与归档 APK 哈希一致；无重建、无覆盖 dev.2/dev.3 环境。包内没有测试 CA/网络安全配置，Manifest `usesCleartextTraffic=false`。
- 同一 dev.7 的前序 Android 实测证据覆盖 WebView/Capacitor、HTTPS 隔离服务登录、Remember Me/SecureStorage、正常练习与收藏、A/B 收藏隔离、错题两轮掌握、180 题/90 分钟考试、答案保存及强停恢复、身份失效和网络恢复。证据截图位于 AI 输出目录 `图片与设计/理论考试练习系统/P5-A-最终整合验收-20261022-01/`；本轮再次确认安装包身份与哈希。
- 专用 `TheoryExam_P5A_Dev7_Play_API35` 使用 Android 15/API 35、Emulator 37.2.12.0、KVM version 12、x86_64、2 vCPU/2 GiB 配置；启动日志显示 Emulator 将 RAM 提升到 2.5 GiB，GPU Auto 因驱动兼容性警告回退到 lavapipe/SWANGLE 软件图形。系统相机 Camera2 后置 ID 10 活动。ADB Console 的 `virtualscene-image wall` 接受测试图；JWT 限定 issuer 与两个 `protected` gRPC 摄像头方法后，旋转/位移调用有效。相机截图探索客厅、走廊与厨房后，仍未出现完整二维码。停止 Camera2 客户端后 `Active Camera Clients` 为空；没有启动 BarcodeScanner 插件。
- QR 状态为“未验证：二维码没有进入实时预览”，不是项目解码或 Bridge 失败。Console 的 `OK` 只证明命令已接受；没有插件事件、Bridge 数据或地址回填证据。截图 `图片与设计/.../dev7-qr-retest/door-entry-pulse-02/after-pulse.png` 记录了真实系统 Camera 画面。
- 既有 dev.7 Android 视觉证据：360×800 的截图集可对应 12 屏，启动页使用 `181a-dev7-play-start-360x800.png`；`173-dev7-start-360x800.png` 实际是个人中心。390×844 缺少错题页截图，因此不能判定双尺寸 12 屏矩阵完全通过。设计已记录的背景裁切、系统栏差异仍保留。
- 当前回归重跑：mobile typecheck/build 通过、UI smoke 20 项通过、session regression 6/6；server typecheck/build、59 项 tests 通过；browser flow smoke、web-entry smoke 通过。browser flow 第一次因旧脚本仍期望 8 个主列表按钮失败；实际“未做题目”在更多菜单，主列表为 7 个。仅更新 `apps/server/scripts/browser-flow-smoke.mjs` 的两个断言后完整浏览器流程通过；未改 APP 源码，dev.7 APK 不变。服务端已有更新元数据/认证下载/缓存 SHA 篡改拒绝测试包含于 59 项；Android 私有 Release 安装升级链属于 P6。
- 临时 Fastify、HTTPS/503 代理、测试数据库、临时凭据、证书私钥及 `/tmp` 原始日志已停止并清理；此前保存的脱敏报告、截图与 Android 启动日志留在 AI 输出目录。专用 AVD 的目标 CA 哈希文件在 Conscrypt/APEX、system、user trust 路径均未发现。Emulator gRPC allowlist 的临时两方法 protected 条目已恢复，文件 SHA-256 与原始备份相同：`c70a962250289c5840c3fd414a63382048de93a0e97cade9bef3d60257004fc3`。AVD 保留数据并关闭；ADB 无在线设备，隔离测试端口无监听。正式 SQLite、账号、TLS、MeFrp、systemd 未触碰。
- 工作区保留多轮 P5-A 修改；远端仍为 `122ad04ab59983c60b19b8edb588fd6a0883ff98`。由于实时扫码与 390×844 错题页证据未闭合，本轮不 Commit/Push，不关闭 Issue #7，不开始 P5-B。

## P5-A 最终验收与安全收尾（2026-10-22；通过）

- 普通开发包固定为 `com.theoryexam.mobile.dev` / `1.0.0-dev.9` / versionCode 9。使用当前工作区运行 Capacitor Android sync 与 Gradle `assembleDebug` 后，构建 APK、归档 APK及此前从设备提取的已安装 APK SHA-256 相同：`3db11faf2ffd96118f79f5582b7a82fa6ba739c259b9cde96081f7a6d8e73ad5`。签名证书指纹为 Android Debug `11ee2f274aa14f3f25590532a2e60be0747bbf7024aae5589c571b3a91cd4462`。合并 Manifest 保持 `usesCleartextTraffic=false`；普通 APK ZIP 未发现测试 CA、network security config、SQLite、数据库或 keystore。测试 CA 配置仅由独立 `p5aTest` source set 指向用户安全目录，未进入普通 debug 包。
- dev.9 普通 APK 的 Android 正式扫码已通过 Android 15/API 35 Google Play AVD 实测：Camera2 后置 ID 10、CameraX/ML Kit 实时帧、`startScan()` 的真实事件/rawValue、Capacitor 地址回填、有效 HTTPS 接受、无效地址拒绝、不自动连接、权限拒绝、取消、系统返回、连续重扫、前后台及路由卸载清理均有独立报告、真实 framebuffer 和脱敏日志。Android 走 `startScan()`，不调用此前触发 GMS `BarhopperV3` 崩溃的 `scan()`。独立 ScanLab 同轮没有二维码帧，因此未生成扫码事件；它是辅助诊断，不影响正式 dev.9 的成功证据。
- 登录/会话/收藏/日常练习/错题/模拟考试和双尺寸移动页面证据复用同一源基线的普通 dev.7 验收；dev.7 到 dev.9 的范围变化为扫码实现与关联生命周期，未改上述业务页、API 或考试状态机。390×844 错题页真实数据截图来自专用 Google APIs AVD；与 Google Play 扫码 AVD 的设备差异已单独标注，未混作同一设备结果。
- P5-A 其余要求由本轮实际回归及既有隔离验收闭合：服务端 59/59（含备份/恢复、listener 隔离、HttpOnly Cookie/CSRF、更新元数据和 SHA 校验）；移动端 UI smoke 20 项、会话竞态 6/6；P1–P5 浏览器流程与 Web Gateway smoke；`systemd-analyze verify deploy/systemd/*.service deploy/systemd/*.timer`。本轮 `mobile/server typecheck/build`、Capacitor sync、普通 Android `assembleDebug`、APK 身份/内容审计和 `git diff --check` 均通过。
- 正式 SQLite 仍为 V4，未操作正式账号、MeFrp、生产 TLS、systemd 服务或公网端口。P5-A 已完成；P5-B 的真实部署和 V4→V6 正式迁移仍需独立授权。P6 的正式 Release、私有 Release 双版本完整安装升级链不计入 P5-A。Issue #7 涵盖整个 P5，继续保持 OPEN。
- 统一报告：AI 输出目录 `报告与研究/理论考试练习系统/P5-A-最终验收-20261022-01/P5-A最终验收判定与Git收尾报告-20261022.md`。dev.9 扫码报告与截图仍保留于 `P5-A-startScan-dev9-20261022-01` 配套目录。

## P5-B 部署与收尾核验（2026-10-23）

以下是当前实际运行状态，用于覆盖本文早期“尚未部署/待审批”的历史描述；它不表示 P5-B 已整体通过。

- API、Web 公网、Web LAN 三项 user systemd 服务均 active/enabled，`Restart=on-failure`、3 秒重启间隔、重启计数 0；`loginctl` 显示 `Linger=yes`。管理 listener 仍仅绑定 `127.0.0.1:3001`。
- `theory-exam-p5b-maintenance.timer` 已启用，每日 02:00（最多随机延迟 30 分钟）执行 `apps/server/scripts/p5b-maintenance.mjs`。该任务使用 SQLite `VACUUM INTO`，验证本地备份后复制到独立备份挂载，并在副本上检查完整性、外键和迁移状态；每日同时验证 API/Web IP SAN 证书链及到期时间。
- 维护 unit 使用 `~/.config/theory-exam/p5b-deploy-20261022/maintenance.env`（0600；仅路径/IP/端口参数）和既有 `api.env`（0600）。备份目标为 `/mnt/Server_Data_Backup/P5B-Production-Backups/theory-exam-v6`（目录 0700、备份文件 0600）。截至本次核验，最新副本为 1,232,896 bytes；隔离恢复后 `integrity_check=ok`、外键违规 0、迁移状态 V6 ready、题目 1,283、启用题库 1。备份设备与根 NVMe 不同，但仍在同一主机，不能抵御整机/场地故障。
- 当前 API/Web 叶证书 SAN 含 `118.24.61.190`、`192.168.0.107`、`127.0.0.1`，到期日 2027-11-23；两组私有 CA 到期日 2036-10-19。私钥目录 0700，私钥文件 0600。日常任务在叶证书剩余 60 天、CA 剩余 180 天时报告失败并写入 journal；不会自动重新签发或轮换。
- 普通 dev.10 仍使用已有包和 API CA，未修改 Android 源码/证书身份/包版本。Gradle 支持以 `THEORY_API_CA_FILE` 从仓库外注入公开 API CA；归档公开证书与 APK 资源一致，私钥未进入 Git。
- 2026-10-23 严格 CA 检查：公网 API `https://118.24.61.190:30946/api/health`、Web `https://118.24.61.190:10393/api/health` 和本机 loopback/LAN listener 全部返回 200、migrationVersion 6；公网 API 管理状态、Web `/admin` 和 `/api/admin/status` 均 404。Web 同源 preflight 204，跨端口 Origin 403；直连 API 的跨端口 Origin 为 403。API 3000 的 HTTP 明文请求被服务端拒绝。
- 运行时代码与源码基线：当前分支 `aa7cfef4f40b335d2e69c5dec54e350743159215`；隔离 TypeScript build 的 27 个 JavaScript 文件与当前 `apps/server/dist` 字节一致。Gateway 进程的启动时间为 11:47；11:43 的部署快照与当前 dist 字节一致，且实际公网 preflight 行为符合 Host/Origin 修复。旧的 11:29 快照不代表当前进程版本。未因本轮重启 API 或 Web 服务。
- 网络收尾尚未通过：`eno1` 当前 `192.168.0.107/24`，NetworkManager `ipv4.method=auto`，路由器保留租约未证实。证书和 Android Network Security Config 都绑定该 LAN IP；更换 IP 后需要重签服务叶证书并更新 Android 精确 trust scope/版本。
- `nftables` unit active。可读的静态配置 INPUT 默认 DROP，仅放行 established、loopback、ICMP 与 SSH，未明确放行 LAN TCP 3000/8080；有效 ruleset 因当前用户无 root 权限未能读取。因此本机自连健康不能代替 LAN 其他设备访问验收；必须由管理员确认规则，再仅允许 `eno1` 上受信 LAN 子网访问 3000/8080，并确认 3001 仍不可达。没有改系统防火墙。
- MeFrp 0.67.1 的两条客户端进程都在运行，公网端点功能验证通过；两个进程仍以 `-t` argv 参数提供 token。未通过 `-c` 模式重建配置，也未重启或轮换凭据，以免在无已验证映射/恢复方案时中断现有 TCP 服务。token 值没有进入文档、日志或 Git。
- 到 MeFrp 节点 `118.24.61.190` 的当前路由经 `tun0` / `table 2022`，源地址 `10.20.0.1`；两条公网 health 仍成功。该策略路由的所有者和预期用途未核实，需由维护者确认它是预期的 MeFrp 出站路径。公网端点功能有实测，但客户端快捷启动未提供可读映射文件，localIP/localPort 仍不能从本机配置直接确认。
- 日志当前由 user systemd/journald 收集；聚合用户 journal 占用 208.7 MB，系统未配置本项目专用的 retention 上限。没有修改全局 journald 策略，以免影响其他服务。
- P5-B 阶段仍未完成，准确待办为：路由器管理员确认固定 LAN DHCP 租约；管理员审阅并应用最小 LAN firewall allowlist、从另一台 LAN 设备验证；维护者确认 MeFrp 支持的受限 token 文件配置并安排可回滚的逐隧道迁移。正式签名 APK、正式 GitHub Release、APK 更新安装完整链和最终发布 QA 属于 P6，不作为 P5-B 阻塞。
