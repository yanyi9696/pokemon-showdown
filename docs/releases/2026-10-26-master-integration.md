# 服务端 master 历史整合与发布边界

## 整合内容

整合前，开发分支为 `280bb550ca72e932e4357908e36868d867244345`，master 为 `5aa08dfbd23282becba29e26a4807973dc19c5a6`，双方独有提交数为 16 / 1。master 的唯一独有提交只在 `pokemon-showdown` 增加 7 行 Windows 启动转接，没有游戏规则变更。

本次使用普通 `git merge --no-ff --no-commit master`，无冲突；随后将完整合并结果提交在 `codex/fantasy-rogue`。没有重写历史、强制推送、移动 master/fantasy、改动客户端或连接腾讯云。整合前的两个 HEAD 已保存为 `backup/release-20261026-pre-master-merge-dev` 和 `backup/release-20261026-pre-master-merge-master`，并留存经过 `git bundle verify` 验证的完整历史 Bundle。

原桥接会在没有 `../launch-local-development.cjs` 的其他 Windows 安装中报模块不存在。本次保留转接，并增加文件存在性检查：仅 Windows 的游戏服务器启动命令、且已安装仓库外的本机桥接文件时启用。Linux/macOS、未安装桥接的 Windows 使用原有 CLI；帮助、回放等子命令不转接。已安装桥接如果验证失败会继续报错，不偷偷启动旧配置。CLI 自身不设置开发环境变量或读取本机配置。

除 CLI、新增 `test/server/local-development-cli.js` 与三份说明文档外，原开发版本全部文件保持不变。Fantasy Rogue、普通对战、HTTP、鉴权、数据库、依赖及构建逻辑均未修改。机器专用桥接、配置、数据库、存档和认证材料不进入提交。

## 验证

源码隔离副本从空 dist 开始，复用本机依赖，不复制私有配置或玩家数据库。详细日志位于本机仓库外 `F:\fantasy\release-merge-20261026`。

| 项目 | 结果 |
| --- | --- |
| 完整 TypeScript：`tsc --noEmit --incremental false` | 通过 |
| 干净构建及声明：`node build --decl` | 通过 |
| 幻想杯、Rogue、AI、登录等相关回归 | 5137 项通过 |
| 静态 HTTP 安全专项 | 43 项通过，包含目录联接越界、响应结束及断开连接 |
| 本地启动器、运行时与新桥接回归 | 35 项通过，其中新桥接 17 项 |
| 新增测试文件 ESLint、CLI `node --check`、Git 差异检查 | 通过 |
| 本地配对构建 | 服务端、客户端 full、replay 均成功；可选 PHP 新闻使用原有公告回退 |
| 实际原目录 `node .\pokemon-showdown` | 能识别已更新的同版本本地服务并退出，未重复启动 |
| HTTP 8080 与 WebSocket 8000 | 页面 HTTP 200，原测试昵称无凭据登录并获得 Rogue 权限；随机新昵称也通过启动器验收 |
| 原存档及配置 | 数据库 4 张表的行数/内容摘要与 6 份本机文件摘要一致；客户端只排除构建器生成的配置区块 |

第一次相关回归为 5179 通过、1 项受沙箱限制失败：该 HTTP 测试不能创建临时目录联接。在沙箱外原样重跑 HTTP 专项，43 项全部通过。启动器测试同样需要沙箱外创建临时 Git 仓库。这些重跑没有修改断言、忽略测试或调整业务数据。合计验证 5215 个不同测试，未重跑上一轮全部 8008 项；上一轮 85 项 pending 的已记录限制不因此消失。本轮未重新进行 Edge 人工通关验收。

本机原操作保持不变：在 `F:\fantasy\pokemon-showdown` 执行 `node .\pokemon-showdown`，就绪后访问 `http://localhost:8080/testclient.html#fantasyrogue`。8000/8080 同属已验证的本地启动配置。当前源码仍来自 `release-audit-20261022/server` 和 `client`，存档仍是原 `fantasy-rogue-preview.db`。

## ESLint 与正式 CI

本次全量 ESLint 为 **13995 errors / 933 warnings**，对比上一轮留存结果没有新增诊断；少 1 项来自上次整理提交已去掉的测试文件末尾空行。新增桥接测试零诊断。扩展名为空的 CLI 不在默认全量扫描范围内；额外以 Node CommonJS 语法和同一规则检查新旧 CLI，均为原有 **11 errors / 1 warning**，扣除插入行号偏移后诊断完全相同。没有关闭仓库规则或批量格式化。

“历史”指本次分支整合之前已经存在，不能理解为全部来自上游。此前最终功能整理相对更早基线增加了大量测试和脚本的格式诊断，另有 31 项非格式诊断已单独审查，未发现新增正确性/安全性缺陷。上次风险评估及旧待执行测试的覆盖不足仍需保留。

`.github/workflows/test.yml` 在 push 到 master 时运行 `npm run full-test`；其第一步是 `eslint --max-warnings 0 && ...`。因此**正式 master 的 CI 会被现有 ESLint 失败阻断**，后续 TSC/Mocha 不会在该串行命令中运行，不能宣称 CI 全绿。PR 路径也调用带相同 ESLint 门槛的命令。开发分支普通 push 不触发该工作流的 master push 条件。远端分支保护是否要求绿灯未在本轮核查；若部署流程以 CI 全绿为硬门槛，此门槛仍未满足，不能绕过。

## 后续交接

最终完整合并 SHA、双亲、祖先关系、正式分支不变证明及推送状态记录在仓库外的本轮交接报告，避免文档循环引用自身提交。开发分支应包含上述 master HEAD，使保持在该位置的 master 可以正常 `--ff-only`。若正式分支后来又新增提交，部署方必须重新核对祖先关系。

本机已配置的 GitHub SSH 在本轮返回 `Permission denied (publickey)`，没有更改 SSH 配置或密钥。需用户手动正常推送开发分支并核对远端 SHA。历史整合通过与正式 CI 通过是两个独立结论；部署方应携带上述 ESLint 风险继续核查，不把本报告当作已部署证明。
