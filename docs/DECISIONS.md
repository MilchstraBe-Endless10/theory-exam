# 重大决策记录（ADR 简版）

> 只有已经得到用户确认的重大变更才能覆盖 PRD；其余写「建议 / 未批准」。记录时间、缘由、备选、影响，避免记忆漂移。

| ID | 决策 | 状态 | 依据 |
| --- | --- | --- | --- |
| ADR-001 | 业务服务端与数据库在用户本地 Linux 设备 | 已确认 | 用户明确要求 |
| ADR-002 | 手机通过局域网 + 已有 frp 穿透访问，复用现有 frp | 已确认 | 用户明确要求 |
| ADR-003 | 账号由本机统一创建，无自助注册 | 已确认 | 用户明确要求 |
| ADR-004 | 4级考试：120单选+20多选+40判断，180题、100分、90分钟 | 已确认 | 用户纠正后的最终规则 |
| ADR-005 | 错题跨轮次连续答对2次视为掌握，支持混合/分类与薄弱优先 | 已确认 | 用户明确要求 |
| ADR-006 | 初版 Android APK 由 GitHub Releases 下载 | 已确认 | 用户明确要求 |
| ADR-007 | React/Capacitor/Fastify/SQLite 实现；systemd 与正式开机策略留待部署环境验证 | 技术栈已确认；开机策略待确认 | P1 明确要求 Node.js、TypeScript、Fastify 与 SQLite；systemd 仍属于部署阶段方案 |
| ADR-008 | 及格线 60 分、按题型分区展示、不允许普通用户删除历史 | 默认建议，待业务确认 | PRD 默认项 |
| ADR-009 | 先按桌面首页图实现 1:1；手机 12 页按已确认的独立效果图实现和验收 | 已确认 | 用户确认桌面 P0 已通过，并指定手机阶段与 12 屏基准 |
| ADR-010 | 增设独立的 P0-M 手机 12 页面实现与视觉验收阶段，桌面首页通过不视为手机页面完成 | 已确认 | 用户明确要求；手机效果图保存在 `design/reference/mobile-12-screens-v1.png` |
| ADR-011 | 既有私有 GitHub 仓库作为正式代码托管；每阶段遵循同步检查、开发、测试、安全检查、提交、推送、远端验证、记忆更新和汇报；验证通过后默认普通提交/推送并核验远端 SHA，未完成阶段可用独立分支，验收后普通合入 `main`；发现远端变化、无关改动、验证失败或安全风险时暂停；禁止强推、公开仓库和提交敏感文件 | 已确认 | 用户明确确认 Git/GitHub 属于开发生命周期，阶段通过后默认自动同步 |
| ADR-012 | 本机管理界面与管理 API 由服务端按 socket 回环地址限制；账号使用 Argon2id 密码哈希及仅存摘要的随机会话令牌；Excel 使用预览/确认两阶段事务导入，按文件指纹幂等识别并保留重复题干 | 已确认 | P1 安全、导入与版本管理要求；浏览器 CORS 不承担管理权限边界 |
| ADR-013 | P2 练习会话固定题库版本和题目顺序；作答以会话/题目唯一关联并事务写入，完全相同的重试返回原始结果；提交前题目响应不得带正确答案 | 已确认 | P2 正式刷题、断点恢复、严格判分与幂等要求 |
| ADR-014 | 当前管理入口以 TCP socket 来源地址判断本机请求。若 frpc 将公网请求转发到同一监听端口并使来源显示为回环地址，公网请求可能被错误识别为本机管理流量；P2 不开放公网，P5 接入 frp 前必须隔离管理监听入口并验证来源边界 | 风险与待办 | P2 安全要求明确指出的回环转发风险；CORS 和转发头不能作为修复边界 |
| ADR-015 | 用户 V3 迁移增加 `must_change_password` 与 `is_test_account`，默认均为 false；新建/重置账号可要求首次改密。初始改密只开放本人身份、改密和退出 API，成功后事务撤销旧会话并轮换新会话 | 已确认 | 用户 P2-R 安全要求；迁移不得破坏现有账号 |
| ADR-016 | 首批四个普通账号的临时密码为 8 位加密安全随机英文字母 + `YYMMDD`；通过受限本机清单和一次性 `0600` 凭据文件交付。发放前检查所有用户名，任何同名冲突都整体中止且不覆盖既有账号；管理员不可读取密码或哈希 | 已确认 | 用户最新确认的账号与密码安全要求；测试账号标记不授予额外权限 |
| ADR-017 | 正式客户端连接必须使用可信 HTTPS；不承诺隐藏用户本人输入的密码免受其自己浏览器开发者工具查看。Web 会话存储/CSRF/XSS、Android 安全存储、frp 管理入口隔离与 APK 更新验证继续跟踪在 Issue #3 | 已确认的安全边界；后续工作未完成 | 用户 P2-R 对真实 HTTPS 与客户端可见性的澄清；Issue #3 |
| ADR-018 | P3 使用 V4 迁移增加逐题答案版本/标记/幂等写入键及不可变成绩复盘；考试到期按服务端时钟幂等结算，启动与周期扫描补结算；考试前试卷读取不返回答案 | 已实施并通过本地验收；正式库未初始化管理员或导入题库 | GitHub Issue #4 与 P3 验收要求；正式库 V4 增量迁移保留四个普通账号 |
| ADR-019 | `db:status` 必须使用只读连接并与显式 `db:migrate` 分离；状态查询不创建库、不执行迁移或写入，已有数据升级前先用 SQLite 备份 API 生成一致性备份 | 已实施并通过隔离 SQLite 只读回归；正式数据库未被本次操作触碰 | GitHub Issue #6；P3 `db:status` 曾隐式应用 V4，P4 前置修复要求 |
| ADR-020 | V5 起将错题掌握度绑定独立复习轮次：每道题在不同轮次各贡献一次正确，依序待复习→巩固中→已掌握；任何正式错答重新激活待复习。普通练习/考试正确不推进掌握度，答错复用唯一错题状态 | 已实施并通过 P4 服务端与浏览器验收；正式业务库仍为 V4 | GitHub Issue #5 与 P4 用户确认规则；事务与唯一约束保障幂等 |
| ADR-021 | 业务 API 与管理员 API 使用不同 Fastify listener；业务入口不注册管理路由/页面/初始化接口，管理 listener 默认 loopback。仅分离 listener 不足以保护被 frpc 映射的管理端口，公网映射前必须核对代理配置并做外网拒绝测试 | 已实现隔离代码与 loopback 转发负面测试；真实 frpc 未安装/未修改 | P5 Issue #7 和既有 ADR-014 风险；真实网络边界需 P5-B 确认 |
| ADR-022 | 浏览器会话改用 HttpOnly SameSite Strict Cookie、每会话 CSRF token 与 Origin 校验；生产 Cookie 强制 Secure。Android Capacitor 会话令牌由原生安全存储插件保存；Web 旧 token 在启动时清理。V6 保存 remember 策略；会话续期延长原有 12 小时或 30 天期限，失效/禁用/首登待改密会话不能续期 | V6 隔离迁移、浏览器 CSRF 与会话续期测试通过；正式库仍 V4，尚待 P5-B 确认迁移 | P5 Issue #3；浏览器与 Android 使用不同会话传输方式，正式 HTTPS 仍为部署前置 |
| ADR-023 | 更新服务只同步私有 GitHub Release 中固定命名的 APK 与 manifest，Token 仅在服务器环境内使用；API 只服务固定缓存文件并核验 SHA-256。APP 校验包 ID、版本、哈希，系统安装器校验签名连续性且需用户确认；考试进行中不打开安装器 | 服务端/客户端流程与隔离测试已实现；无测试 APK/真机升级验证，最终签名留待 P6 | GitHub Issue #1/#7；仓库为 Private，禁止将 Token 放入 APK |
| ADR-024 | 浏览器生产入口使用独立 Web Gateway（默认 loopback `127.0.0.1:8080`）服务 `apps/mobile/dist`，SPA 路由回退、缓存和安全头由 Gateway 提供；同源 `/api/*` 仅代理白名单学习 API。`/admin`、`/api/admin/*`、bootstrap、未知/编码路径在代理前 404。Android/Web 经各自入口访问同一 Fastify business listener/SQLite；Web Cookie/CSRF/Origin 保持端到端到业务服务 | 实现完成；隔离 SQLite + Fastify + Chromium Web 登录/管理路径拒绝已验证。正式 listener、真实证书、旧 3000/数据库和隧道均未动 | GitHub Issue #7 最新双入口补充要求；MeFrp TCP 双隧道都保持离线 |
| ADR-025 | 真实浏览器 TLS 必须由公开受信任 CA 验证主机名；Android Network Security Configuration 的私有信任锚仅作用于 APP，不能替代普通浏览器根证书信任。当前没有自有域名，候选方案为可控免费 DNS 子域名 + DNS-01 公信证书 + TCP 原样透传；须验证 A/CNAME 到 MeFrp 节点、DNS API 与自动续期后再选定。MeFrp 分配 IP 的公开证书验证受标准 80/443 与 IP 控制限制，Let’s Encrypt IP 证书有效期约 160 小时，不采用当前高位 TCP 配置作为既定方案 | 研究完成；域名提供方、证书签发/续期、API TLS listener 与双入口端到端证书验证未完成。生产模式 Web Gateway 无 cert/key 会拒绝启动；不得关闭客户端校验 | 官方资料：<https://letsencrypt.org/docs/challenge-types/>、<https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability>、<https://developer.android.com/privacy-and-security/security-config>；P5-B 另行授权 |
