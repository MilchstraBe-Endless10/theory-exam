# P6：全面验收与 GitHub 发布准备

通读 `docs/TEST_MATRIX.md`，实测业务规则、安全、视觉、Android 适配、备份、frp 网络中断恢复。为每个项目留下命令、截图/日志路径、真实结果和未通过原因。比对第一阶段 UI 参考图，修复视觉回归。准备 README、Linux 安装文档、升级/回滚指引、Android release APK 构建与签名方案（敏感签名密钥不入库）、GitHub Releases 文件清单与校验和。

未经用户明确批准，不创建公开仓库、不推送代码、不发布 Release、不发送私有题库或密钥；如果用户授权，则依据指定仓库远端执行。更新 MID/SHORT 和记要，给出正式验收报告并停止。
