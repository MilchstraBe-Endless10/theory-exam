# 技术与部署架构决策基线

## 总体
- 单机业务后端（Node.js + Fastify），本地 SQLite；APP React/TypeScript + Capacitor(Android)，可选电脑学习 Web，与本机维护 Web 区分路由和后端权限。
- 单体优先。可采用清晰模块：auth, banks/import, practice, exam, review, progress, backup, health。
- 不要因为未来多题库而增加微服务、Kafka、Redis、外部云认证、云数据库。

## 局域网 / frp 双通道
目标拓扑（尚未部署）：`Android App → (局域网 HTTPS | MeFrp TCP → 本机 HTTPS 业务后端) → 本地 SQLite`；浏览器走独立入口：`Browser HTTPS → MeFrp TCP → Web Gateway :8080 → loopback Business API → 同一 SQLite`。
- 用户现有 frp 是外网方案；不要安装第二种穿透。
- 当前 MeFrp 两条 TCP 隧道已创建但均离线：`theory-exam` → `127.0.0.1:3000`、`theory-exam-web` → `127.0.0.1:8080`。TCP 只转发字节，不提供浏览器/APP 端到端 TLS。未授权启动，且本机 3000 仍是旧 P4/V4 服务，禁止直接映射。
- `apps/server/src/web-server.ts` 独立提供生产 Web listener，默认只绑定 loopback `127.0.0.1:8080`，读取 `apps/mobile/dist`，同源代理白名单业务 `/api/*` 到 loopback Fastify；不代理 `/admin`、`/api/admin/*`、bootstrap 或未知 API。生产模式必须提供可信 TLS cert/key，否则启动失败。Vite 5173 仅供开发。
- 手机 API 与网页代理继续连接同一 Fastify business listener 和同一配置 SQLite；管理 listener `127.0.0.1:3001` 不映射。网关不相信或转发客户端 `X-Forwarded-*`，Fastify `trustProxy=false`，用户身份仍取自服务端会话。
- Web 正式构建在非开发浏览器环境固定使用当前 `location.origin` 的同源 API 与 HttpOnly Cookie；Android Capacitor 仍连接用户配置的 API 地址并用原生安全存储/Bearer。考试答案沿用服务器逐题版本与 requestId 冲突处理，网关透明传递这些请求头与 Cookie。
- V1.0 必须保持可信 HTTPS 地址、正确证书链、主机名验证和证书错误拒绝。普通浏览器不读取 Android APP 的私有 trust anchor；未知私有 CA 会产生浏览器证书错误，不能要求绕过。由于没有自有域名，候选为用户注册的免费可控 DNS 子域名 + DNS-01 公信证书 + MeFrp TCP TLS 透传；具体服务商、DNS API、解析及证书续期仍待选定与实测。
- Let’s Encrypt 已提供 IP 证书，但必须用 HTTP-01（80）或 TLS-ALPN-01（443）证明 IP 控制，且有效期约 160 小时；MeFrp 分配的节点 IP 与高位 TCP 隧道端口不满足可控性/验证条件，不能据此作为当前方案。DNS-01 可通过 TXT 证明域名控制，不依赖入站验证端口；公开网页需访问 `https://<受信域名>:<MeFrp分配端口>`，证书 SAN 匹配域名。DNS API 凭据须最小权限并存于源码库外。
- 推荐同域名内外网分流；若本地 DNS 不支持，则维护局域网/公网两个可验证端点并在 APP 中自动回退。切换网络不改变用户会话、考试 ID、考试截止时间。
- 管理 API 由服务端严格限制为本机回环/可信本机管理入口，不因普通用户路由在公网暴露而可调用。
- 默认不启用不受信任的自签名证书忽略验证，也不允许直接公开 HTTP 密码登录接口。

### Web Gateway 启动
先在对应工程执行 `npm --prefix apps/mobile run build` 与 `npm --prefix apps/server run build`。通过用户授权的正式 HTTPS/DNS 配置后，Web listener 使用：

```bash
NODE_ENV=production \
WEB_HOST=127.0.0.1 WEB_PORT=8080 \
WEB_API_TARGET=http://127.0.0.1:3000 \
WEB_TLS_CERT_FILE=/absolute/path/outside-repository/fullchain.pem \
WEB_TLS_KEY_FILE=/absolute/path/outside-repository/privkey.pem \
npm --prefix apps/server run web:start
```

证书与私钥必须是真实、未过期、主机名匹配且受普通浏览器信任的证书；不能将占位路径直接执行。业务 Fastify 的 `CORS_ORIGINS` 还需配置为浏览器实际 Origin（包含 HTTPS scheme 与 MeFrp 端口）。该命令只描述未来独立 Web listener，不启动隧道、不改当前旧 3000，也不执行正式库迁移。生产部署前仍需解决手机 API listener 的 TLS，并经 P5-B 授权。

## 服务器权威考试状态机
`CREATED → IN_PROGRESS → SUBMITTED / EXPIRED / VOIDED`（VOIDED 为管理员审计型异常处理，不直接删除）。
- 开始时间、截止时间、当前状态、成绩在服务器；同用户同时只允许一场进行中的考试。
- 180题真实试卷必须在创建时固定并保存题目和选项快照、答案、分值、题目排序、题库版本。
- 所有答案修改携带考试 ID、题 ID、请求幂等键/递增版本；服务器事务处理，防止旧请求覆盖新答题。
- APP 可本地暂存未同步动作，但截止后服务器不接受补交；遇到失联明确告知可能不计分，不误标「已同步」。
- 交卷与超时结算幂等。重启后能够从数据库恢复考试状态和已提交答案。
- V4 迁移为考试答案增加逐题版本、标记和幂等请求号，并为成绩保存题型得分和完整复盘 JSON；V1–V3 不重写。服务端在启动、周期扫描和到期读取时结算超时场次。
- V6 迁移在既有会话上增加 CSRF token 与 `remember` 生命周期标记，并按原始到期时长回填既有会话策略；V1–V5 不重写。P5-A 的正式本机数据库仍保持 V4，未执行 V5/V6。
- 考试答案只能在当前服务器时间早于截止时间时保存。临界时间以 `now >= deadline_at` 判定；到期只按数据库中截止前确认的答案评分。

## 错题复习轮次与掌握状态
- V5 在不改写 V1–V4 的前提下新增独立复习轮次、固定题目顺序和轮次作答记录；每条轮次固定用户、题库版本、题型过滤、策略、数量与题目快照。退出/重新登录后恢复未完成轮次，完成和历史结果保留。
- `mistake_states` 是每用户/题目的唯一当前掌握状态；复习答对只允许在不同轮次各计一次，状态依次为 `review (0) → reinforcing (1) → mastered (2)`。复习答错以及普通练习/模拟考试答错都重置为 `review (0)` 并增加一次错误计数；普通练习或考试答对不推进掌握状态。
- 判分、复习作答和掌握状态变更在事务内完成。轮次题目和答题具有唯一约束，重复请求返回既有反馈，不会重复增加错误次数或掌握轮次。活动题库版本筛选与历史版本快照分离，题库升级不删除历史复习。
- 策略筛选在服务端组合题型、状态和数量。薄弱优先顺序为待复习、巩固中，随后按历史错误次数降序；同一层级内部随机。数量不足时以匹配到的真实题数创建轮次并返回该数量。

## SQLite 状态查询与迁移边界
- `db:status` 以只读连接检查既有数据库，不创建目录/数据库，不应用迁移，不写入 `user_version`、WAL 或业务表；不存在、无迁移表、版本超前均作为明确状态返回。
- `db:migrate` 是独立的显式升级路径。升级已有数据库前必须通过 SQLite 一致性备份接口创建备份，不能直接复制运行中数据库主文件；备份成功后才执行版本化迁移。
- 任何状态检查、健康检查或普通读请求都不能隐式升级正式库。迁移测试优先使用隔离 SQLite，确认只读状态调用前后 schema、版本与数据不变。

## 数据与安全
- 所有数据按 `user_id` 与 `bank_id/version_id` 关联，禁止水平越权。
- 密码使用安全哈希，登录/敏感接口做限速和会话撤销。
- V3 SQLite 迁移为用户增加 `must_change_password` 和 `is_test_account` 两个布尔标记；默认值为 0，保证既有用户无需改密且保留原状态。首次临时密码成功改密后在单个事务内更新 Argon2id 哈希、清除强制标志、撤销旧会话并签发新会话。
- 首批账号通过管理员控制的本机操作发放；`apps/server` 的 `accounts:provision` CLI 只读取本机 `0600` 清单，创建普通用户并生成互异临时密码；凭据输出文件放在数据目录内独立 `0700` 子目录，文件权限 `0600`，不经 HTTP 响应、日志或 Git。命令只创建缺失账号，检测到任何同名账号即整体中止，不重置或删除账号。
- `must_change_password=1` 时，服务端只允许查询自己的身份、修改密码或退出；完成改密前练习、题库和管理 API 均不可访问。普通用户不能访问管理接口；测试账号标记不改变普通用户角色。
- Web 使用 HttpOnly、SameSite Strict 会话 Cookie、每会话 CSRF token 与可信 Origin 检查；生产 Cookie 必须 Secure。Capacitor Android 使用原生安全存储保存持久会话令牌，非记住会话只留在进程内存。浏览器不在 localStorage/sessionStorage 保存 Bearer token。原认证期限为 12 小时/30 天，受认证的续期接口按既有记住策略滑动延期；APP 恢复前台或网络后续期。用户仍可通过本人浏览器开发工具看到自己输入的密码；服务端不记录密码或哈希。
- 移动端生产连接只接受 HTTPS，Android 清除明文流量默认关闭；本地开发浏览器只允许 loopback HTTP。CSP 限制脚本来源，API 尚需在正式 HTTPS 部署中进行端到端 XSS/CSRF 与证书错误验证。
- Fastify 拆分学习与管理 listener；学习入口不注册管理页面、管理 API 或管理员初始化。管理 listener 默认只绑定 loopback。frpc 若误映射管理端口仍可能使本机回环检查误判，因此正式公网入口启用前必须核对真实拓扑并做外网负面测试。
- APK 更新只从服务端固定缓存读取，私有 GitHub 同步使用服务器环境中的只读 Token，不进入 APP。客户端核对包标识、递增版本与 SHA-256；Android Package Installer 执行签名连续性验证并要求用户确认。正式签名身份及双版本升级留待 P6。
- SQLite 一致性备份使用 `VACUUM INTO`，日备份保留最近七份成功文件并验证 integrity/foreign keys。恢复前必须停止服务、对当前库备份并交互确认；P5-A 尚未修改正式 systemd、frp、证书或数据库。
- 本地输入 `local-input/`、数据库、日志敏感字段、备份、密钥等不得推送 GitHub。
- 默认采用 Linux systemd 开机自启。部署脚本尽量幂等，可卸载但不默认删数据。

## 待部署时填写（不能写死假值）
- 本机操作系统发行版与 Node 版本
- frps 域名或公网 IP/端口、frpc 配置所在路径、TLS 位置
- 公网 HTTPS 域名及证书策略
- 本地网关/LAN 地址、固定 IP/DNS 方案
- GitHub 仓库位置、公开与否、Release 签名与版本策略
