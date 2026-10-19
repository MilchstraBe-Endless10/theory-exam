# P5 本机运行、安全、更新与备份准备

本文只提供待用户审阅的模板和隔离验证结果。本阶段没有安装或启用 systemd 服务，没有修改正式 SQLite、证书、frp 或主机网络配置。

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

## 更新包准备

Android 开发包身份当前为 `com.theoryexam.mobile.dev`，不代表正式包名。正式包 ID、签名密钥保管和正式 HTTPS 地址仍待用户确认。APP 不包含 GitHub Token。正式私有 Release 同步所需的服务器凭据只能由 P5-B 运维人员配置到受限 systemd 环境；本阶段不读取该凭据、不发布 Release，也不声称存在已签名可升级 APK。

## P5-B 明确待批操作

- 在正式数据库 V4 上验证备份后再单独请求用户确认 V6 迁移；保留四个现有普通账号。
- 给出实际 systemd 文件安装/启停、数据目录所有权、端口及回滚命令后再请求确认。
- 检查并记录现有 frpc 映射，确保只映射业务入口；从外部网络验证管理页面、管理 API 和首次管理员初始化均不可达。
- 配置可信 HTTPS/证书和更新缓存来源，并通过浏览器、Android 系统安装器验证证书错误、签名不匹配与版本回滚被拒绝。
